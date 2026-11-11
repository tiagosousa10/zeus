import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { api } from "../lib/api";
import { useMemberState } from "../lib/session";
import {
  formatTime,
  metadata,
  safeMediaURL,
  type ProgressEntry,
  type Stream,
  type StreamResponse,
} from "../lib/catalog";
import "./cinema.css";
type MotorStats = {
  ok: boolean;
  numPeers?: number;
  downloadSpeed?: number;
  downloaded?: number;
  progress?: number;
};
export default function Player() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") ?? "",
    type = params.get("type") === "series" ? "series" : "movie";
  const season = Number(params.get("s")) || undefined,
    episode = Number(params.get("e")) || undefined;
  const videoId =
    type === "series" && season && episode ? `${id}:${season}:${episode}` : id;
  const back = `/titulo?${new URLSearchParams({ id, type, ...(season ? { s: String(season), e: String(episode) } : {}) })}`;
  const { state, save, loading: stateLoading } = useMemberState();
  const progress = state.progress as Record<string, ProgressEntry>;
  const meta = useQuery({
    queryKey: ["meta", type, id],
    queryFn: ({ signal }) => metadata(type, id, signal),
    staleTime: 300000,
  });
  const video = useRef<HTMLVideoElement>(null),
    host = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ progress, save, meta: meta.data });
  stateRef.current = { progress, save, meta: meta.data };
  const [source, setSource] = useState<Stream>();
  const [mediaURL, setMediaURL] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("A preparar a tua Fonte…");
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(true),
    [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null);
  const [cancelNext, setCancelNext] = useState(false);
  const [current, setCurrent] = useState(0),
    [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1),
    [muted, setMuted] = useState(false),
    [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<
    "speed" | "subtitles" | "episodes" | "help" | null
  >(null);
  const [idle, setIdle] = useState(false),
    [osd, setOsd] = useState("");
  const [statsOpen, setStatsOpen] = useState(false),
    [stats, setStats] = useState<MotorStats>();
  const [activeSubtitle, setActiveSubtitle] = useState(-1);
  const subtitleSize =
    state.preferences.subtitleSize === "large"
      ? "140%"
      : state.preferences.subtitleSize === "small"
        ? "80%"
        : "100%";
  const lastSave = useRef(0),
    idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resumeDone = useRef(false),
    autoplayDone = useRef(false);
  const tracks = (source?.subtitles ?? []).filter((track) =>
    safeMediaURL(track.url),
  );
  const episodes = (meta.data?.videos ?? [])
    .filter((item) => item.season > 0)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  const nowIndex = episodes.findIndex(
    (item) => item.season === season && item.episode === episode,
  );
  const nextEpisode = nowIndex >= 0 ? episodes[nowIndex + 1] : undefined;
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (video.current && !video.current.paused) setIdle(true);
    }, 3500);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  useEffect(() => {
    if (!osd) return;
    const timer = setTimeout(() => setOsd(""), 3000);
    return () => clearTimeout(timer);
  }, [osd]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError("");
    setStatus("A obter a Fonte escolhida…");
    setMediaURL("");
    setCurrent(0);
    setDuration(0);
    resumeDone.current = false;
    autoplayDone.current = false;
    async function resolveSource() {
      let selected: Stream | undefined;
      const key = params.get("selection");
      if (key) {
        try {
          const value = JSON.parse(
            sessionStorage.getItem(`zeus:play:${key}`) ?? "null",
          );
          if (
            value?.id === id &&
            value?.type === type &&
            value?.videoId === videoId &&
            Date.now() - value.createdAt < 1800000
          )
            selected = value.stream;
          sessionStorage.removeItem(`zeus:play:${key}`);
        } catch {
          /* Request approved sources again. */
        }
      }
      if (!selected) {
        const response = await api<StreamResponse>(
          `/streams?${new URLSearchParams({ id: videoId, type })}`,
          { signal: controller.signal },
        );
        selected = response.streams[Number(params.get("source")) || 0];
      }
      if (!selected)
        throw new Error(
          "Não há nenhuma Fonte disponível. Volta ao título para escolher outra.",
        );
      if (cancelled) return;
      setSource(selected);
      const direct = safeMediaURL(selected.url);
      if (direct) {
        setMediaURL(direct);
        setStatus("");
        return;
      }
      if (!selected.infoHash || !/^[a-f0-9]{40}$/i.test(selected.infoHash))
        throw new Error(
          "Esta Fonte não tem um endereço de vídeo compatível. Escolhe outra Fonte.",
        );
      setStatus(
        "O Motor está a procurar os metadados e os primeiros blocos. Pode demorar até 90 segundos.",
      );
      const result = await api<{
        ok: boolean;
        infoHash: string;
        fileIdx: number;
        url?: string;
      }>("/motor/start", {
        method: "POST",
        body: JSON.stringify({
          infoHash: selected.infoHash,
          fileIdx: selected.fileIdx,
        }),
        signal: controller.signal,
      });
      if (cancelled) return;
      setMediaURL(
        result.url || `/api/motor/stream/${result.infoHash}/${result.fileIdx}`,
      );
      setStatus("");
    }
    void resolveSource().catch((reason) => {
      if (!cancelled) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível abrir a Fonte.",
        );
        setStatus("");
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [videoId, retry]);
  useEffect(() => {
    if (!source?.infoHash) return;
    const stop = () => {
      void fetch("/api/motor/stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infoHash: source.infoHash }),
        keepalive: true,
      }).catch(() => {});
    };
    addEventListener("pagehide", stop);
    return () => {
      removeEventListener("pagehide", stop);
      stop();
    };
  }, [source?.infoHash]);
  const persist = useCallback(
    (keepalive = false) => {
      const element = video.current,
        latest = stateRef.current;
      if (
        !element ||
        !latest.meta ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0 ||
        element.currentTime < 1
      )
        return;
      const entry: ProgressEntry = {
        id,
        type,
        name: latest.meta.name,
        poster: latest.meta.poster,
        position: element.currentTime,
        duration: element.duration,
        updatedAt: new Date().toISOString(),
        season,
        episode,
        completed:
          element.ended || element.currentTime / element.duration >= 0.95,
      };
      const patch = { progress: { ...latest.progress, [videoId]: entry } };
      if (keepalive) {
        void fetch("/api/state", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
          keepalive: true,
        }).catch(() => {});
      } else
        void latest
          .save(patch)
          .catch(() =>
            setOsd(
              "Não foi possível guardar o progresso. A reprodução continua.",
            ),
          );
      lastSave.current = Date.now();
    },
    [id, type, season, episode, videoId],
  );
  useEffect(() => {
    const flush = () => persist(true);
    const onHide = () => {
      if (document.hidden) flush();
    };
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      persist(true);
    };
  }, [persist]);
  useEffect(() => {
    const element = video.current;
    if (!element || !mediaURL || stateLoading) return;
    let hls: Hls | undefined;
    if (
      /\.m3u8(?:$|\?)/i.test(mediaURL) &&
      !element.canPlayType("application/vnd.apple.mpegurl") &&
      Hls.isSupported()
    ) {
      hls = new Hls();
      hls.loadSource(mediaURL);
      hls.attachMedia(element);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setWaiting(false);
          setError(
            "A Fonte HLS deixou de responder ou usa um formato incompatível. Tenta novamente ou escolhe outra Fonte.",
          );
        }
      });
    } else {
      element.src = mediaURL;
      element.load();
    }
    return () => {
      hls?.destroy();
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [mediaURL, stateLoading]);
  useEffect(() => {
    if (!statsOpen || !source?.infoHash) return;
    let alive = true;
    const update = () =>
      api<MotorStats>(`/motor/status?hash=${source.infoHash}`)
        .then((result) => {
          if (alive) setStats(result);
        })
        .catch(() => {
          if (alive) setStats(undefined);
        });
    void update();
    const timer = setInterval(update, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [statsOpen, source?.infoHash]);
  useEffect(() => {
    const element = video.current;
    if (!element || !tracks.length) return;
    const language = String(state.preferences.language || "pt-PT").split(
      "-",
    )[0];
    const index =
      state.preferences.subtitles === false
        ? -1
        : tracks.findIndex((track) =>
            track.lang.toLowerCase().startsWith(language),
          );
    Array.from(element.textTracks).forEach((track, i) => {
      track.mode = i === index ? "showing" : "disabled";
    });
    setActiveSubtitle(index);
  }, [source, state.preferences.language, state.preferences.subtitles]);
  useEffect(() => {
    if (
      !ended ||
      !nextEpisode ||
      state.preferences.autoplay !== true ||
      cancelNext
    ) {
      setCountdown(null);
      return;
    }
    let remaining = 15;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        location.href = `/leitor?id=${id}&type=series&s=${nextEpisode.season}&e=${nextEpisode.episode}`;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ended, nextEpisode?.id, state.preferences.autoplay, cancelNext]);
  const play = useCallback(() => {
    if (video.current)
      void video.current.play().catch(() => {
        setPaused(true);
        setOsd("Prime Reproduzir para iniciar o vídeo.");
      });
  }, []);
  const toggle = useCallback(() => {
    const element = video.current;
    if (!element) return;
    element.paused ? play() : element.pause();
    wake();
  }, [play, wake]);
  const seek = useCallback((delta: number) => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(
      element.duration,
      Math.max(0, element.currentTime + delta),
    );
    setOsd(`${delta > 0 ? "+" : "−"}${Math.abs(delta)} s`);
  }, []);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    else
      void host.current
        ?.requestFullscreen?.()
        .catch(() =>
          setOsd("O ecrã inteiro não está disponível neste browser."),
        );
  }, []);
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable=true]",
        )
      )
        return;
      wake();
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setMenu(null);
        setStatsOpen(false);
        return;
      }
      if (key === "?") {
        setMenu((old) => (old === "help" ? null : "help"));
        return;
      }
      if (menu) return;
      if (
        (key === " " && !(event.target as HTMLElement).closest("button,a")) ||
        key === "k"
      ) {
        event.preventDefault();
        toggle();
      }
      if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        seek(key === "arrowleft" ? -10 : 10);
      }
      if (key === "f") fullscreen();
      if (key === "i") setStatsOpen((old) => !old);
      if (key === "m" && video.current)
        video.current.muted = !video.current.muted;
      if ((key === "arrowup" || key === "arrowdown") && video.current) {
        event.preventDefault();
        video.current.volume = Math.min(
          1,
          Math.max(0, video.current.volume + (key === "arrowup" ? 0.1 : -0.1)),
        );
      }
    }
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [menu, toggle, seek, fullscreen, wake]);
  const openMenu = (value: typeof menu) => {
    setMenu((old) => (old === value ? null : value));
    wake();
  };
  const showControls = !idle || paused || !!menu || !!error;
  return (
    <main
      className={`zeus-player ${paused && current > 0 ? "is-paused" : ""} ${!showControls ? "is-idle" : ""}`}
      ref={host}
      style={{ "--subtitle-size": subtitleSize } as React.CSSProperties}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocus={wake}
      aria-label="Leitor de vídeo"
    >
      <video
        ref={video}
        playsInline
        preload="auto"
        onClick={toggle}
        onDoubleClick={fullscreen}
        onPlay={() => {
          setPaused(false);
          setWaiting(false);
          wake();
        }}
        onPause={() => {
          setPaused(true);
          persist();
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => {
          setWaiting(false);
          setError("");
        }}
        onError={() => {
          if (mediaURL) {
            setWaiting(false);
            setError(
              "O browser não conseguiu reproduzir esta Fonte. O formato pode não ser suportado ou a ligação foi interrompida.",
            );
          }
        }}
        onLoadedMetadata={() => {
          const element = video.current!;
          setDuration(Number.isFinite(element.duration) ? element.duration : 0);
          if (!resumeDone.current) {
            const saved = stateRef.current.progress[videoId];
            if (
              saved &&
              !saved.completed &&
              saved.position > 0 &&
              saved.position < element.duration - 10
            )
              element.currentTime = saved.position;
            resumeDone.current = true;
          }
        }}
        onCanPlay={() => {
          setWaiting(false);
          if (!autoplayDone.current) {
            autoplayDone.current = true;
            play();
          }
        }}
        onTimeUpdate={() => {
          const element = video.current!;
          setCurrent(element.currentTime);
          if (!element.ended) setEnded(false);
          if (Date.now() - lastSave.current > 10000) persist();
        }}
        onEnded={() => {
          persist();
          setPaused(true);
          setEnded(true);
        }}
        onVolumeChange={() => {
          setVolume(video.current!.volume);
          setMuted(video.current!.muted);
        }}
      >
        {tracks.map((track) => (
          <track
            key={track.id}
            src={track.url}
            kind="subtitles"
            srcLang={track.lang}
            label={track.lang}
          />
        ))}
      </video>
      <div className="player-shade" />
      {paused && current > 0 && !error && (
        <section className="player-pause">
          <img src="/art/img/medusa.webp" alt="" />
          <div>
            <p className="cinema-eyebrow">O tempo parou.</p>
            <h1>{meta.data?.name}</h1>
            <p>
              {formatTime(current)} de {formatTime(duration)}
            </p>
            <div className="cinema-actions">
              <button className="z-btn z-btn--primary" onClick={play}>
                ▶ Retomar
              </button>
              <a href={back} className="z-btn z-btn--ghost">
                Detalhes do título
              </a>
            </div>
          </div>
        </section>
      )}
      <header className={`player-top ${!showControls ? "is-hidden" : ""}`}>
        <a className="z-icon-btn" href={back} aria-label="Voltar ao título">
          ←
        </a>
        <div>
          <strong>{meta.data?.name ?? "Leitor"}</strong>
          <small>
            {season && `T${season} · E${episode} · `}
            {source?.addonName || source?.addon || source?.name}
          </small>
        </div>
        <button
          className="z-icon-btn"
          aria-label="Ajuda de teclado"
          onClick={() => openMenu("help")}
        >
          ?
        </button>
      </header>
      {(status || waiting) && !error && (
        <div className="player-loading" role="status">
          <span />
          <p>{status || "A carregar vídeo…"}</p>
        </div>
      )}
      {error && (
        <div className="player-error" role="alert">
          <p className="cinema-eyebrow">A HISTÓRIA PODE ESPERAR</p>
          <h1>Não foi possível reproduzir.</h1>
          <p>{error}</p>
          <div className="cinema-actions">
            <button
              className="z-btn z-btn--primary"
              onClick={() => {
                setSource(undefined);
                setRetry((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
            <a className="z-btn z-btn--secondary" href={back}>
              Escolher outra Fonte
            </a>
          </div>
        </div>
      )}
      {menu && (
        <section
          className="player-popover"
          aria-label={
            menu === "speed"
              ? "Velocidade"
              : menu === "subtitles"
                ? "Legendas"
                : menu === "episodes"
                  ? "Episódios"
                  : "Ajuda"
          }
        >
          <button
            className="player-popover__close z-icon-btn"
            aria-label="Fechar menu"
            onClick={() => setMenu(null)}
          >
            ×
          </button>
          {menu === "speed" && (
            <>
              <h2>Velocidade</h2>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                <button
                  className="player-option"
                  aria-pressed={speed === value}
                  key={value}
                  onClick={() => {
                    if (video.current) video.current.playbackRate = value;
                    setSpeed(value);
                    setMenu(null);
                  }}
                >
                  {value === 1 ? "Normal" : `${value}×`}
                  {speed === value && " ✓"}
                </button>
              ))}
            </>
          )}
          {menu === "subtitles" && (
            <>
              <h2>Legendas</h2>
              {!tracks.length && (
                <p>
                  Esta Fonte não disponibilizou legendas. As faixas integradas
                  dependem do formato e do browser.
                </p>
              )}
              <button
                className="player-option"
                aria-pressed={activeSubtitle === -1}
                onClick={() => {
                  if (video.current)
                    Array.from(video.current.textTracks).forEach((track) => {
                      track.mode = "disabled";
                    });
                  setActiveSubtitle(-1);
                }}
              >
                Desligadas
              </button>
              {tracks.map((track, index) => (
                <button
                  className="player-option"
                  key={track.id}
                  aria-pressed={activeSubtitle === index}
                  onClick={() => {
                    if (video.current)
                      Array.from(video.current.textTracks).forEach(
                        (textTrack, i) => {
                          textTrack.mode = i === index ? "showing" : "disabled";
                        },
                      );
                    setActiveSubtitle(index);
                  }}
                >
                  {track.lang}
                  {activeSubtitle === index && " ✓"}
                </button>
              ))}
            </>
          )}
          {menu === "episodes" && (
            <>
              <h2>Episódios</h2>
              {episodes.map((item) => (
                <a
                  className="player-option"
                  key={item.id}
                  href={`/titulo?id=${id}&type=series&s=${item.season}&e=${item.episode}`}
                  aria-current={item.id === videoId ? "true" : undefined}
                >
                  T{item.season}:E{item.episode} ·{" "}
                  {item.name ?? item.title ?? "Episódio"}
                </a>
              ))}
            </>
          )}
          {menu === "help" && (
            <>
              <h2>Atalhos</h2>
              <dl className="player-help">
                <dt>Espaço / K</dt>
                <dd>Reproduzir ou pausar</dd>
                <dt>← / →</dt>
                <dd>Recuar / avançar 10 s</dd>
                <dt>↑ / ↓</dt>
                <dd>Ajustar volume</dd>
                <dt>M</dt>
                <dd>Silenciar</dd>
                <dt>F</dt>
                <dd>Ecrã inteiro</dd>
                <dt>I</dt>
                <dd>Estado da reprodução</dd>
                <dt>Esc</dt>
                <dd>Fechar menu</dd>
              </dl>
            </>
          )}
        </section>
      )}
      {statsOpen && (
        <section className="player-stats">
          <h2>REPRODUÇÃO</h2>
          <dl>
            <dt>Resolução</dt>
            <dd>
              {video.current?.videoWidth ?? 0} ×{" "}
              {video.current?.videoHeight ?? 0}
            </dd>
            <dt>Fonte</dt>
            <dd>{source?.infoHash ? "Motor local" : "Ligação directa"}</dd>
            {source?.infoHash && (
              <>
                <dt>Peers</dt>
                <dd>{stats?.numPeers ?? "—"}</dd>
                <dt>Descarga</dt>
                <dd>
                  {stats?.downloadSpeed !== undefined
                    ? `${(stats.downloadSpeed / 1048576).toFixed(1)} MB/s`
                    : "—"}
                </dd>
              </>
            )}
          </dl>
          <button
            className="z-btn z-btn--ghost"
            onClick={() => setStatsOpen(false)}
          >
            Fechar
          </button>
        </section>
      )}
      {duration > 0 && duration - current < 30 && nextEpisode && (
        <aside className="player-next">
          <p>
            A seguir · T{nextEpisode.season}:E{nextEpisode.episode}
          </p>
          <strong>{nextEpisode.name}</strong>
          {countdown !== null && (
            <p role="status">
              Reprodução automática em {countdown} s{" "}
              <button
                className="z-btn z-btn--ghost"
                onClick={() => setCancelNext(true)}
              >
                Cancelar
              </button>
            </p>
          )}
          <a
            className="z-btn z-btn--secondary"
            href={`/titulo?id=${id}&type=series&s=${nextEpisode.season}&e=${nextEpisode.episode}`}
          >
            Escolher Fonte do próximo episódio →
          </a>
        </aside>
      )}
      <footer
        className={`player-controls ${!showControls ? "is-hidden" : ""}`}
        onPointerEnter={() => {
          clearTimeout(idleTimer.current);
          setIdle(false);
        }}
        onPointerLeave={wake}
      >
        <input
          className="player-timeline"
          type="range"
          min="0"
          max={duration || 1}
          step=".1"
          value={Math.min(current, duration || 1)}
          disabled={!duration}
          aria-label="Posição no vídeo"
          aria-valuetext={`${formatTime(current)} de ${formatTime(duration)}`}
          onChange={(event) => {
            if (video.current) {
              video.current.currentTime = Number(event.target.value);
              setCurrent(Number(event.target.value));
            }
          }}
        />
        <div className="player-times">
          <span>{formatTime(current)}</span>
          <span>−{formatTime(duration - current)}</span>
        </div>
        <div className="player-buttons">
          <button
            className="z-icon-btn"
            onClick={toggle}
            aria-label={paused ? "Reproduzir" : "Pausar"}
          >
            {paused ? "▶" : "Ⅱ"}
          </button>
          <button
            className="z-icon-btn player-skip"
            onClick={() => seek(-10)}
            aria-label="Recuar 10 segundos"
          >
            ↶10
          </button>
          <button
            className="z-icon-btn player-skip"
            onClick={() => seek(10)}
            aria-label="Avançar 10 segundos"
          >
            10↷
          </button>
          <button
            className="z-icon-btn"
            onClick={() => {
              if (video.current) video.current.muted = !video.current.muted;
            }}
            aria-label={muted ? "Activar som" : "Silenciar"}
          >
            {muted ? "◌" : "♪"}
          </button>
          <input
            className="player-volume"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(event) => {
              if (video.current) {
                video.current.volume = Number(event.target.value);
                video.current.muted = false;
              }
            }}
          />
          <span className="player-spacer" />
          <button
            className="z-icon-btn"
            aria-label="Legendas"
            aria-expanded={menu === "subtitles"}
            onClick={() => openMenu("subtitles")}
          >
            CC
          </button>
          <button
            className="z-icon-btn"
            aria-label="Velocidade"
            aria-expanded={menu === "speed"}
            onClick={() => openMenu("speed")}
          >
            {speed}×
          </button>
          {episodes.length > 0 && (
            <button
              className="z-icon-btn"
              aria-label="Episódios"
              aria-expanded={menu === "episodes"}
              onClick={() => openMenu("episodes")}
            >
              ▤
            </button>
          )}
          <button
            className="z-icon-btn"
            aria-label="Estado da reprodução"
            aria-pressed={statsOpen}
            onClick={() => setStatsOpen(!statsOpen)}
          >
            ⓘ
          </button>
          <button
            className="z-icon-btn"
            aria-label="Ecrã inteiro"
            onClick={fullscreen}
          >
            ⛶
          </button>
        </div>
      </footer>
      <p className={`player-osd ${osd ? "is-visible" : ""}`} role="status">
        {osd}
      </p>
    </main>
  );
}
