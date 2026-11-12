'use strict';
// Motor de torrents interno (substitui o motor Python / o servidor do Stremio).
// Liga a peers TCP/UDP/DHT, descarrega à medida que se vê e serve o vídeo por HTTP local com Range.
const http = require('http');
const { timingSafeEqual } = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebTorrent = require('webtorrent');

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce', 'udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce', 'udp://open.demonii.com:1337/announce', 'udp://tracker.tiny-vps.com:6969/announce',
  'udp://explodie.org:6969/announce', 'udp://tracker.dler.org:6969/announce', 'udp://opentracker.i2p.rocks:6969/announce',
  'udp://udp.tracker.projectk.org:23333/announce', 'udp://tracker.openbittorrent.com:6969/announce', 'udp://tracker.moeking.me:6969/announce'
];
// Upload nunca perto de zero: o BitTorrent retribui quem partilha, e sem partilhar o download fica lento
const UP_AC = 2 * 1024 * 1024, UP_BATTERY = 512 * 1024;
const VIDEO_RE = /\.(mp4|m4v|webm|mov|mkv|avi|ogv|ts|m2ts)$/i;
const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', ogv: 'video/ogg', ts: 'video/mp2t', m2ts: 'video/mp2t' };

function startEngine({ port = 11471, ffmpegPath = null, cacheDir, token = null } = {}) {
  const DL_DIR = cacheDir || path.join(os.tmpdir(), 'zeus-cache');
  try { fs.rmSync(DL_DIR, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(DL_DIR, { recursive: true });

  let client = null;
  let batteryMode = false;
  function getClient() {
    if (!client) {
      client = new WebTorrent({ maxConns: 50, uploadLimit: batteryMode ? UP_BATTERY : UP_AC });
      client.on('error', (e) => console.error('[engine] erro WebTorrent:', e && e.message));
    }
    return client;
  }

  function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  }
  function json(res, code, obj) {
    cors(res);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  }

  function pickFile(torrent, idx) {
    if (Number.isInteger(idx) && torrent.files[idx] && VIDEO_RE.test(torrent.files[idx].name)) return torrent.files[idx];
    const vids = torrent.files.filter(f => VIDEO_RE.test(f.name));
    const pool = vids.length ? vids : torrent.files;
    return pool.reduce((a, b) => (a.length > b.length ? a : b), pool[0]);
  }

  async function startTorrent(magnet, fileIdx) {
    const c = getClient();
    let torrent = c.get(magnet);
    if (torrent && typeof torrent.then === 'function') torrent = await torrent;

    // Só um torrent ativo de cada vez: poupa disco, RAM e largura de banda
    for (const t of [...c.torrents]) {
      if (t !== torrent) { try { t.destroy({ destroyStore: true }); } catch (e) {} }
    }
    if (!torrent) torrent = c.add(magnet, { path: DL_DIR, announce: TRACKERS });

    if (!torrent.ready) {
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Sem metadados ao fim de 90 s — o torrent não tem peers ativos.')), 90000);
        torrent.once('ready', () => { clearTimeout(to); resolve(); });
        torrent.once('error', (e) => { clearTimeout(to); reject(e); });
      });
    }

    const file = pickFile(torrent, fileIdx);
    if (!file) throw new Error('O torrent não tem ficheiros.');
    const idx = torrent.files.indexOf(file);
    // O WebTorrent seleciona o torrent inteiro por omissão (pack de temporada = descarrega tudo): remove essa seleção global
    try { torrent.deselect(0, torrent.pieces.length - 1, 0); } catch (e) {}
    torrent.files.forEach(f => { if (f !== file) { try { f.deselect(); } catch (e) {} } });
    file.select();
    return { ok: true, infoHash: torrent.infoHash, fileIdx: idx, name: file.name, length: file.length };
  }

  // Pré-carrega só o início do ficheiro (episódio seguinte), sem mexer no que está a tocar
  async function preloadTorrent(magnet, fileIdx) {
    const c = getClient();
    let torrent = c.get(magnet);
    if (torrent && typeof torrent.then === 'function') torrent = await torrent;
    if (!torrent) torrent = c.add(magnet, { path: DL_DIR, announce: TRACKERS });
    if (!torrent.ready) {
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('timeout')), 60000);
        torrent.once('ready', () => { clearTimeout(to); resolve(); });
        torrent.once('error', (e) => { clearTimeout(to); reject(e); });
      });
    }
    const file = pickFile(torrent, fileIdx);
    if (!file) return;
    try {
      torrent.deselect(0, torrent.pieces.length - 1, false);
      const per = torrent.pieceLength || 262144;
      const s0 = file._startPiece;
      const e0 = Math.min(file._endPiece, s0 + Math.ceil((24 * 1024 * 1024) / per));
      torrent.select(s0, e0, 0, false);
    } catch (e) {}
  }

  // Lê o cabeçalho com o ffmpeg: duração e faixas de áudio
  const tracksCache = {};
  function probeTracks(hash, idx) {
    const key = hash + ':' + idx;
    if (tracksCache[key]) return Promise.resolve(tracksCache[key]);
    return new Promise((resolve) => {
      if (!ffmpegPath) return resolve({ ok: false, error: 'ffmpeg não disponível.' });
      let err = '';
      const ff = spawn(ffmpegPath, ['-hide_banner', ...(token ? ['-headers', `X-Zeus-Motor-Token: ${token}\r\n`] : []), '-i', `http://127.0.0.1:${port}/stream/${hash}/${idx}`], { stdio: ['ignore', 'ignore', 'pipe'] });
      const to = setTimeout(() => { try { ff.kill('SIGKILL'); } catch (e) {} }, 30000);
      ff.stderr.on('data', d => { err += d; if (err.length > 80000) { try { ff.kill('SIGKILL'); } catch (e) {} } });
      ff.on('error', () => { clearTimeout(to); resolve({ ok: false }); });
      ff.on('close', () => {
        clearTimeout(to);
        const dm = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
        const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0;
        const audio = [];
        let video = '';
        err.split(/\n(?=\s+Stream #)/).forEach(block => {
          const head = block.split('\n')[0];
          const vm = /Stream #\d+:\d+[^:]*: Video: (\w+)/.exec(head);
          if (vm && !video) video = vm[1];
          const am = /Stream #\d+:\d+(?:\((\w+)\))?[^:]*: Audio: (\w+)[^,]*, (\d+) Hz, ([^,]+)/.exec(head);
          if (am) {
            const tm = /title\s*:\s*(.+)/.exec(block);
            audio.push({ n: audio.length, lang: am[1] || 'und', codec: am[2], ch: am[4].replace(/\(.*\)/, '').trim(), title: tm ? tm[1].trim() : '', def: /\(default\)/.test(head) });
          }
        });
        const out = { ok: duration > 0 || audio.length > 0, duration, audio, video };
        if (out.ok) tracksCache[key] = out;
        resolve(out);
      });
    });
  }

  function dirSize(dir) {
    let total = 0;
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        total += f.isDirectory() ? dirSize(fp) : (fs.statSync(fp).size || 0);
      }
    } catch (e) {}
    return total;
  }

  function findFile(hash, idx) {
    if (!client) return null;
    const t = client.torrents.find(x => x.infoHash === hash);
    if (!t || !t.files[idx]) return null;
    return { torrent: t, file: t.files[idx] };
  }

  function serveFile(req, res, file) {
    const total = file.length;
    let start = 0, end = total - 1, partial = false;
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1] === '' && m[2] !== '') { start = Math.max(0, total - parseInt(m[2], 10)); }
        else {
          if (m[1] !== '') start = parseInt(m[1], 10);
          if (m[2] !== '') end = Math.min(parseInt(m[2], 10), total - 1);
        }
        partial = true;
      }
      if (start > end || start >= total) {
        cors(res);
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    cors(res);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-store'
    };
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    res.writeHead(partial ? 206 : 200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = file.createReadStream({ start, end });
    stream.on('error', () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
    res.on('close', () => stream.destroy());
  }

  // Modo compatibilidade: copia o vídeo e converte o áudio (AC3/DTS/EAC3...) para AAC em MP4 fragmentado
  // Descobre o keyframe real onde o ffmpeg (copy) vai começar para pedido -ss S
  function probeKeyframe(hash, idx, startSec) {
    return new Promise((resolve) => {
      if (!ffmpegPath || !(startSec > 0)) return resolve(startSec > 0 ? startSec : 0);
      const ff = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'debug', '-debug_ts', '-ss', String(startSec), '-noaccurate_seek',
        ...(token ? ['-headers', `X-Zeus-Motor-Token: ${token}\r\n`] : []), '-i', `http://127.0.0.1:${port}/stream/${hash}/${idx}`, '-map', '0:v:0', '-c', 'copy', '-frames:v', '1', '-f', 'null', '-'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      let buf = '', done = false;
      const fin = (v) => { if (done) return; done = true; clearTimeout(to); try { ff.kill('SIGKILL'); } catch (e) {} resolve(v); };
      const to = setTimeout(() => fin(startSec), 20000);
      ff.stderr.on('data', d => {
        buf += String(d);
        const m = /demuxer\s*->\s*ist_index:\d+[^\n]*?type:video[^\n]*?pkt_pts_time:(-?[\d.]+)/.exec(buf) || /demuxer\s*->\s*ist_index:\d+[^\n]*?type:video[^\n]*?pkt_dts_time:(-?[\d.]+)/.exec(buf);
        if (m) { const k = parseFloat(m[1]); fin(isFinite(k) && k >= 0 && k <= startSec + 1 ? k : startSec); }
        if (buf.length > 400000) buf = buf.slice(-100000);
      });
      ff.on('close', () => fin(startSec));
      ff.on('error', () => fin(startSec));
    });
  }

  function serveTranscode(req, res, hash, idx, startSec, audioN) {
    if (!ffmpegPath) { return json(res, 501, { ok: false, error: 'ffmpeg não disponível nesta instalação.' }); }
    cors(res);
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (startSec > 0) args.push('-ss', String(startSec), '-noaccurate_seek'); // áudio e vídeo arrancam juntos no mesmo ponto
    args.push(...(token ? ['-headers', `X-Zeus-Motor-Token: ${token}\r\n`] : []), '-i', `http://127.0.0.1:${port}/stream/${hash}/${idx}`,
      '-map', '0:v:0', '-map', `0:a:${audioN || 0}?`, '-c:v', 'copy', '-avoid_negative_ts', 'make_zero', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
    const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    ff.stderr.on('data', d => console.error('[ffmpeg]', String(d).trim()));
    ff.on('error', (e) => { console.error('[ffmpeg] falhou:', e.message); try { res.destroy(); } catch (x) {} });
    ff.stdout.pipe(res);
    res.on('close', () => { try { ff.kill('SIGKILL'); } catch (e) {} });
  }

  const server = http.createServer(async (req, res) => {
    if (token) {
      const supplied = Buffer.from(String(req.headers['x-zeus-motor-token'] || ''));
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 401, { ok: false, error: 'Acesso ao Motor não autorizado.' });
    }
    let u;
    try { u = new URL(req.url, 'http://127.0.0.1'); } catch (e) { return json(res, 400, { ok: false }); }
    const parts = u.pathname.split('/').filter(Boolean);

    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

    if (parts[0] === 'keyframe' && parts.length >= 3) {
      const found = findFile(parts[1], parseInt(parts[2], 10));
      if (!found) return json(res, 404, { ok: false });
      const S = parseFloat(u.searchParams.get('t') || '0') || 0;
      const k = await probeKeyframe(parts[1], parseInt(parts[2], 10), S);
      return json(res, 200, { ok: true, t: k });
    }

    if (parts[0] === 'status') {
      const hash = u.searchParams.get('hash');
      const t = client && client.torrents.find(x => !hash || x.infoHash === hash);
      const fi = parseInt(u.searchParams.get('fileIdx') || '-1', 10);
      const ff = t && t.files[fi] ? t.files[fi] : null;
      return json(res, 200, {
        ok: true,
        active: !!t,
        infoHash: t ? t.infoHash : null,
        downloadSpeed: t ? t.downloadSpeed : 0,
        uploadSpeed: t ? t.uploadSpeed : 0,
        numPeers: t ? t.numPeers : 0,
        progress: ff ? ff.progress : (t ? t.progress : 0),
        torrentProgress: t ? t.progress : 0,
        downloaded: t ? t.downloaded : 0,
        ffmpeg: !!ffmpegPath,
        utp: !!(client && client.utp)
      });
    }

    if (parts[0] === 'stop') {
      if (client) for (const t of [...client.torrents]) { try { t.destroy({ destroyStore: true }); } catch (e) {} }
      return json(res, 200, { ok: true });
    }

    if (parts[0] === 'preload') {
      const magnet = u.searchParams.get('magnet');
      if (!magnet || !/^magnet:\?/i.test(magnet)) return json(res, 400, { ok: false });
      const fi = u.searchParams.get('fileIdx');
      preloadTorrent(magnet, fi === null || fi === '' ? undefined : parseInt(fi, 10)).catch(() => {});
      return json(res, 200, { ok: true });
    }

    if (parts[0] === 'tracks' && parts.length >= 3) {
      const r = await probeTracks(parts[1], parseInt(parts[2], 10));
      return json(res, 200, r);
    }

    if (parts[0] === 'cache') {
      return json(res, 200, { ok: true, bytes: dirSize(DL_DIR) });
    }

    if (parts[0] === 'clear') {
      if (client) for (const t of [...client.torrents]) { try { t.destroy({ destroyStore: true }); } catch (e) {} }
      try { fs.rmSync(DL_DIR, { recursive: true, force: true }); fs.mkdirSync(DL_DIR, { recursive: true }); } catch (e) {}
      return json(res, 200, { ok: true });
    }

    if (parts[0] === 'start') {
      const magnet = u.searchParams.get('magnet');
      if (!magnet || !/^magnet:\?/i.test(magnet)) return json(res, 400, { ok: false, error: 'Magnet inválido.' });
      const fi = u.searchParams.get('fileIdx');
      try {
        const info = await startTorrent(magnet, fi === null || fi === '' ? undefined : parseInt(fi, 10));
        return json(res, 200, info);
      } catch (e) {
        return json(res, 504, { ok: false, error: e && e.message ? e.message : String(e) });
      }
    }

    if ((parts[0] === 'stream' || parts[0] === 'transcode') && parts.length >= 3) {
      const found = findFile(parts[1], parseInt(parts[2], 10));
      if (!found) return json(res, 404, { ok: false, error: 'Torrent não está ativo.' });
      if (parts[0] === 'stream') return serveFile(req, res, found.file);
      return serveTranscode(req, res, parts[1], parseInt(parts[2], 10), parseFloat(u.searchParams.get('start') || '0') || 0, parseInt(u.searchParams.get('audio') || '0', 10) || 0);
    }

    json(res, 200, { ok: true, engine: 'Zeus Motor' });
  });

  server.on('error', (e) => console.error('[engine] servidor:', e.message));
  server.listen(port, '127.0.0.1');

  return {
    port,
    server,
    setBattery(on) { batteryMode = !!on; if (client) { try { client.throttleUpload(batteryMode ? UP_BATTERY : UP_AC); } catch (e) {} } },
    stop() {
      try { server.close(); } catch (e) {}
      if (client) { try { client.destroy(); } catch (e) {} client = null; }
      try { fs.rmSync(DL_DIR, { recursive: true, force: true }); } catch (e) {}
    }
  };
}

module.exports = { startEngine };
