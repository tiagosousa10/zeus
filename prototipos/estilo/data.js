// Dados partilhados pelas 3 propostas: catálogo real do Cinemeta e Canais fictícios.
const CINEMETA = 'https://v3-cinemeta.strem.io';
const IMG = 'https://images.metahub.space';

const FALLBACK = [
  { id: 'tt0111161', type: 'movie', name: 'The Shawshank Redemption', releaseInfo: '1994', imdbRating: '9.3', genres: ['Drama'], description: 'Dois presos criam uma amizade ao longo de vários anos.' },
  { id: 'tt0468569', type: 'movie', name: 'The Dark Knight', releaseInfo: '2008', imdbRating: '9.0', genres: ['Action', 'Crime'], description: 'Batman enfrenta o Joker em Gotham.' },
];

async function fetchCatalog(type, extra = '') {
  try {
    const r = await fetch(`${CINEMETA}/catalog/${type}/top${extra}.json`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return j.metas?.length ? j.metas : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function poster(id) { return `${IMG}/poster/medium/${id}/img`; }
export function backdrop(id) { return `${IMG}/background/medium/${id}/img`; }
export function logo(id) { return `${IMG}/logo/medium/${id}/img`; }

export async function loadData() {
  const [movies, series, action, comedy] = await Promise.all([
    fetchCatalog('movie'),
    fetchCatalog('series'),
    fetchCatalog('movie', '/genre=Action'),
    fetchCatalog('movie', '/genre=Comedy'),
  ]);
  const hero = movies[0];
  const continueWatching = [movies[3], series[1], movies[7], series[4], movies[11]]
    .filter(Boolean)
    .map((m, i) => ({ ...m, progress: [0.72, 0.35, 0.5, 0.12, 0.88][i], episode: m.type === 'series' ? 'T2:E4' : null }));
  return {
    hero,
    rows: [
      { title: 'Continuar a ver', items: continueWatching, kind: 'progress' },
      { title: 'Filmes populares', items: movies.slice(1, 21) },
      { title: 'Séries populares', items: series.slice(0, 20) },
      { title: 'Acção', items: action.slice(0, 20) },
      { title: 'Comédia', items: comedy.slice(0, 20) },
    ],
    channels: CHANNELS,
    sources: SOURCES,
  };
}

export const CHANNELS = [
  { name: 'Desporto 1', group: 'Desporto', now: 'Liga — Jornada 12', next: 'Resumo da jornada', progress: 0.62 },
  { name: 'Notícias 24', group: 'Notícias', now: 'Jornal da Noite', next: 'Grande Entrevista', progress: 0.31 },
  { name: 'Cinema Mais', group: 'Filmes', now: 'Heat (1995)', next: 'Collateral (2004)', progress: 0.84 },
  { name: 'Documentário', group: 'Cultura', now: 'Planeta Azul', next: 'Cosmos', progress: 0.15 },
  { name: 'Música HD', group: 'Música', now: 'Top 40', next: 'Live Sessions', progress: 0.47 },
  { name: 'Infantil', group: 'Família', now: 'Desenhos da manhã', next: 'Aventuras', progress: 0.9 },
];

export const SOURCES = [
  { addon: 'Torrentio', quality: '2160p', hdr: 'DV', codec: 'HEVC', size: '18.4 GB', seeders: 412, lang: 'EN', cached: true },
  { addon: 'Torrentio', quality: '1080p', hdr: null, codec: 'x264', size: '2.1 GB', seeders: 1290, lang: 'EN', cached: true },
  { addon: 'Torrentio', quality: '1080p', hdr: 'HDR10', codec: 'HEVC', size: '6.8 GB', seeders: 88, lang: 'PT', cached: false },
  { addon: 'Torrentio', quality: '720p', hdr: null, codec: 'x264', size: '1.0 GB', seeders: 640, lang: 'EN', cached: false },
];
