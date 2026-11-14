import { availableNextEpisode, orderedEpisodes } from "../models/episodes";
import { useCinemaSource } from "../hooks/use-cinema-source";
import { useCinemaProgress } from "../hooks/use-cinema-progress";
import { useCinemaMedia, preferredTrack } from "../hooks/use-cinema-media";
import { ZeusLoader } from "../../../shared/components/ZeusLoader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSubtitles, motorStatistics } from "../services/player";
import { useMemberState } from "../../../shared/hooks/session";
import { metadata } from "../services/catalog";
import { formatTime, progressRatio, type ProgressEntry } from "../models/media";
import "../styles/cinema.css";
import "../styles/cinema-reference.css";
import { ICON } from "../../../shared/graphics/fx.js";
import type { MotorStats } from "../models/playback";
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
  const addonSubtitles = useQuery({
    queryKey: ["subtitles", type, videoId],
    queryFn: ({ signal }) => loadSubtitles(videoId, type, signal),
    staleTime: 600000,
  });
  const video = useRef<HTMLVideoElement>(null),
    host = useRef<HTMLDivElement>(null);
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
    "options" | "speed" | "subtitles" | "episodes" | "help" | null
  >(null);
  const [idle, setIdle] = useState(false),
    [osd, setOsd] = useState("");
  const [statsOpen, setStatsOpen] = useState(false),
    [stats, setStats] = useState<MotorStats>();
  const [activeSubtitle, setActiveSubtitle] = useState(-1);
  const [episodeSeason, setEpisodeSeason] = useState(season || 1);
  const subtitleSize =
    state.preferences.subtitleSize === "large"
      ? "140%"
      : state.preferences.subtitleSize === "small"
        ? "80%"
        : "100%";
  const menuTrigger = useRef<HTMLElement | null>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [buffered, setBuffered] = useState<{ start: number; end: number }[]>(
    [],
  );
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoplayDone = useRef(false);
  const { persist, persistIfDue, restorePosition, resetResume } =
    useCinemaProgress({
      video,
      id,
      type,
      videoId,
      season,
      episode,
      progress,
      save,
      meta: meta.data,
      onError: setOsd,
    });
  const { source, mediaURL, error, setError, status, retrySource } =
    useCinemaSource({
      id,
      type,
      videoId,
      selection: params.get("selection"),
      sourceIndex: params.get("source"),
      onReset: () => {
        setEnded(false);
        setCancelNext(false);
        setCountdown(null);
        setPreview(null);
        setBuffered([]);
        setCurrent(0);
        setDuration(0);
        resetResume();
        autoplayDone.current = false;
      },
    });
  useCinemaMedia({
    video,
    mediaURL,
    stateLoading,
    preferences: state.preferences,
    setError,
    setWaiting,
  });
  // A API devolve ligações assinadas para o seu proxy, que converte SRT em WebVTT.
  const tracks = useMemo(
    () =>
      [
        ...(source?.subtitles ?? []),
        ...(addonSubtitles.data?.subtitles ?? []),
      ].filter((track) => track.url.startsWith("/api/subtitles/file?")),
    [source?.subtitles, addonSubtitles.data?.subtitles],
  );
  const episodes = useMemo(
    () => orderedEpisodes(meta.data?.videos ?? []),
    [meta.data?.videos],
  );
  const nextEpisode = availableNextEpisode(episodes, season, episode);
  const nextParams = nextEpisode
    ? new URLSearchParams({
        id,
        type: "series",
        s: String(nextEpisode.season),
        e: String(nextEpisode.episode),
      }).toString()
    : null;
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (
        video.current &&
        !video.current.paused &&
        !host.current?.querySelector(".p-ui:focus-within, .p-ui:hover")
      )
        setIdle(true);
    }, 3500);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  useEffect(() => {
    if (!osd) return;
    const timer = setTimeout(() => setOsd(""), 3000);
    return () => clearTimeout(timer);
  }, [osd]);
  useEffect(() => {
    if (!statsOpen || !source?.infoHash) return;
    const infoHash = source.infoHash;
    let alive = true;
    const update = () =>
      motorStatistics(infoHash)
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
    const languages = Array.isArray(state.preferences.subtitleLanguages)
      ? state.preferences.subtitleLanguages.map(String)
      : [String(state.preferences.language || "pt-PT")];
    const index =
      state.preferences.subtitles === false
        ? -1
        : preferredTrack(
            tracks.map((track) => ({ language: track.lang })),
            languages,
            -1,
          );
    Array.from(element.textTracks).forEach((track, i) => {
      track.mode = i === index ? "showing" : "disabled";
    });
    setActiveSubtitle(index);
  }, [
    tracks,
    state.preferences.language,
    state.preferences.subtitles,
    state.preferences.subtitleLanguages,
  ]);
  useEffect(() => {
    if (
      !ended ||
      !nextParams ||
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
        location.href = `/leitor?${nextParams}`;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ended, nextParams, state.preferences.autoplay, cancelNext]);
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
    if (element.paused) play();
    else element.pause();
    wake();
  }, [play, wake]);
  const seek = useCallback((delta: number) => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0)
      return;
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
  const closePanels = useCallback(() => {
    setMenu(null);
    setStatsOpen(false);
    menuTrigger.current?.focus();
    wake();
  }, [wake]);
  const openMenu = useCallback(
    (value: typeof menu, trigger?: HTMLElement) => {
      if (trigger) menuTrigger.current = trigger;
      else if (!menu && !statsOpen) menuTrigger.current = optionsButton.current;
      if (menu === value) closePanels();
      else {
        setStatsOpen(false);
        setMenu(value);
        wake();
      }
    },
    [menu, statsOpen, closePanels, wake],
  );
  useEffect(() => {
    if (menu || statsOpen)
      menuPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu, statsOpen]);
  const syncTimeline = () => {
    const element = video.current;
    if (!element) return;
    const length =
      Number.isFinite(element.duration) && element.duration > 0
        ? element.duration
        : 0;
    setDuration(length);
    setBuffered(
      length
        ? Array.from({ length: element.buffered.length }, (_, i) => ({
            start: Math.max(0, element.buffered.start(i)),
            end: Math.min(length, element.buffered.end(i)),
          })).filter((range) => range.end > range.start)
        : [],
    );
  };
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "tab" && host.current?.classList.contains("is-idle")) {
        event.preventDefault();
        host.current
          .querySelector<HTMLButtonElement>(".player-menu-toggle")
          ?.focus();
        wake();
        return;
      }
      if (key === "escape" && (menu || statsOpen)) {
        event.preventDefault();
        closePanels();
        return;
      }
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
      if (key === "?") {
        openMenu("help");
        return;
      }
      if (key === "i" && statsOpen) {
        closePanels();
        return;
      }
      if (menu || statsOpen) return;
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
      if (key === "i") {
        menuTrigger.current = optionsButton.current;
        setStatsOpen(true);
      }
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
  }, [menu, statsOpen, toggle, seek, fullscreen, wake, openMenu, closePanels]);
  const showControls =
    !idle || paused || !!menu || statsOpen || dragging || !!error;
  const position = Math.max(0, Math.min(current, duration));
  const ratio = duration ? position / duration : 0;
  return (
    <main
      className={`zeus-player p ${!showControls ? "is-idle" : ""}`}
      ref={host}
      style={
        {
          "--subtitle-size": subtitleSize,
          "--subtitle-color":
            state.preferences.subtitleColor === "#ffe45c"
              ? "#ffe45c"
              : "#ffffff",
          "--subtitle-bg":
            state.preferences.subtitleBackground === "caixa"
              ? "rgba(0,0,0,.8)"
              : "transparent",
          "--subtitle-shadow":
            (state.preferences.subtitleBackground || "sombra") === "sombra"
              ? "0 2px 3px #000, 0 0 4px #000"
              : "none",
        } as React.CSSProperties
      }
      onFocus={wake}
      onBlur={wake}
      onPointerMove={wake}
      aria-label="Leitor de vídeo"
    >
      <button
        className="player-menu-toggle"
        aria-label="Controlos do leitor"
        aria-expanded={showControls}
        onClick={() => {
          setIdle(false);
          wake();
        }}
      >
        ☷ <span>Controlos</span>
      </button>
      <video
        ref={video}
        playsInline
        preload="auto"
        onClick={toggle}
        onDoubleClick={fullscreen}
        onPlay={() => {
          setEnded(false);
          setCancelNext(false);
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
          syncTimeline();
          restorePosition();
        }}
        onDurationChange={syncTimeline}
        onProgress={syncTimeline}
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
          persistIfDue();
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
      <div className="p-shade" />
      <header className="p-top p-ui" inert={!showControls}>
        <a className="p-b" href={back} aria-label="Voltar ao título">
          <PlayerIcon name="left" />
        </a>
        <div className="p-top__t">
          <b>{meta.data?.name ?? "Leitor"}</b>
          <span>
            {season ? `T${season} · E${episode}` : "Cinema"}
            {paused && " · Em pausa"}
          </span>
        </div>
      </header>
      {(status || waiting) && !error && (
        <div className="player-loading" role="status">
          <ZeusLoader label={status || "A carregar vídeo…"} />
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
                retrySource();
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
          ref={menuPanel}
          className={
            menu === "episodes"
              ? "p-eps player-popover"
              : menu === "help"
                ? "p-pop p-help"
                : "p-pop"
          }
          aria-label={
            menu === "options"
              ? "Opções do leitor"
              : menu === "speed"
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
            onClick={closePanels}
          >
            ×
          </button>
          {menu === "options" && (
            <>
              <h2>Opções do leitor</h2>
              <button className="p-opt" onClick={() => openMenu("speed")}>
                Velocidade <small>{speed}×</small>
              </button>
              {episodes.length > 0 && (
                <button className="p-opt" onClick={() => openMenu("episodes")}>
                  Episódios
                </button>
              )}
              <button
                className="p-opt"
                onClick={() => {
                  setMenu(null);
                  setStatsOpen(true);
                }}
              >
                Estado da reprodução
              </button>
              <button className="p-opt" onClick={() => openMenu("help")}>
                Atalhos de teclado
              </button>
            </>
          )}
          {menu === "speed" && (
            <>
              <h2>Velocidade</h2>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                <button
                  className="p-opt"
                  aria-pressed={speed === value}
                  key={value}
                  onClick={() => {
                    if (video.current) video.current.playbackRate = value;
                    setSpeed(value);
                    closePanels();
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
                  Nem esta Fonte nem os teus Add-ons de legendas têm legendas
                  para este título. As faixas integradas dependem do formato e
                  do browser.
                </p>
              )}
              <button
                className="p-opt"
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
                  className="p-opt"
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
                  {track.addonName && ` · ${track.addonName}`}
                  {activeSubtitle === index && " ✓"}
                </button>
              ))}
            </>
          )}
          {menu === "episodes" && (
            <>
              <div className="p-eps__head">
                <h2 className="z-t2">Episódios</h2>
              </div>
              <div className="z-tabs" role="tablist" aria-label="Temporadas">
                {[...new Set(episodes.map((item) => item.season))].map(
                  (value) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={episodeSeason === value}
                      onClick={() => setEpisodeSeason(value)}
                    >
                      Temporada {value}
                    </button>
                  ),
                )}
              </div>
              <ol>
                {episodes
                  .filter((item) => item.season === episodeSeason)
                  .map((item) => (
                    <li key={item.id}>
                      <a
                        className="p-ep"
                        href={`/titulo?id=${id}&type=series&s=${item.season}&e=${item.episode}`}
                        aria-current={item.id === videoId ? "true" : undefined}
                      >
                        <div className="p-ep__art">
                          {item.thumbnail && (
                            <img src={item.thumbnail} alt="" loading="lazy" />
                          )}
                          <span className="z-progress">
                            <i
                              style={{
                                transform: `scaleX(${progressRatio(progress[item.id])})`,
                              }}
                            />
                          </span>
                        </div>
                        <div>
                          <b>{item.name ?? item.title ?? "Episódio"}</b>
                          <span>
                            T{item.season}:E{item.episode}
                          </span>
                        </div>
                      </a>
                    </li>
                  ))}
              </ol>
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
        <section
          className="p-stats"
          ref={menuPanel}
          aria-label="Estado da reprodução"
        >
          <h2>MOTOR ZEUS</h2>
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
          <button className="z-btn z-btn--ghost" onClick={closePanels}>
            Fechar
          </button>
        </section>
      )}
      {(ended || (duration > 0 && duration - current < 30)) && nextEpisode && (
        <aside className="player-next">
          <p>
            A seguir · T{nextEpisode.season}:E{nextEpisode.episode}
          </p>
          <strong>
            {nextEpisode.name || nextEpisode.title || "Próximo episódio"}
          </strong>
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
          {cancelNext && ended && state.preferences.autoplay === true && (
            <button
              className="z-btn z-btn--ghost"
              onClick={() => setCancelNext(false)}
            >
              Retomar reprodução automática
            </button>
          )}
          <a className="z-btn z-btn--primary" href={`/leitor?${nextParams}`}>
            Reproduzir próximo episódio
          </a>
          <a className="z-btn z-btn--secondary" href={`/titulo?${nextParams}`}>
            Escolher Fonte do próximo episódio →
          </a>
        </aside>
      )}
      <footer
        className="p-bar p-ui"
        inert={!showControls}
        onPointerEnter={() => {
          clearTimeout(idleTimer.current);
          setIdle(false);
        }}
        onPointerLeave={wake}
      >
        <div
          className="p-scrub"
          onPointerMove={(event) => {
            if (!duration) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setPreview(
              Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left) / bounds.width),
              ) * duration,
            );
          }}
          onPointerLeave={() => {
            if (!dragging) setPreview(null);
          }}
        >
          <div className="p-track">
            {buffered.map((range) => (
              <i
                key={range.start}
                className="p-buf"
                style={{
                  left: `${(range.start / duration) * 100}%`,
                  width: `${((range.end - range.start) / duration) * 100}%`,
                }}
              />
            ))}
            <i
              className="p-played"
              style={{
                transform: `scaleX(${ratio})`,
              }}
            />
          </div>
          <span
            className="p-knob"
            style={{ left: `${duration ? ratio * 100 : 0}%` }}
          />
          {preview !== null && duration > 0 && (
            <span
              className="p-tip"
              style={{
                left: `clamp(32px, ${(preview / duration) * 100}%, calc(100% - 32px))`,
              }}
            >
              {formatTime(preview)}
            </span>
          )}
          <input
            className="player-timeline"
            type="range"
            min="0"
            max={duration || 1}
            step=".1"
            value={position}
            disabled={!duration}
            aria-label="Posição no vídeo"
            aria-valuetext={`${formatTime(current)} de ${formatTime(duration)}`}
            onFocus={() => setPreview(position)}
            onBlur={() => setPreview(null)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerUp={() => {
              setDragging(false);
              setPreview(null);
              wake();
            }}
            onPointerCancel={() => {
              setDragging(false);
              setPreview(null);
              wake();
            }}
            onLostPointerCapture={() => setDragging(false)}
            onChange={(event) => {
              const element = video.current;
              if (
                !element ||
                !duration ||
                !Number.isFinite(element.duration) ||
                element.duration <= 0
              )
                return;
              const next = Math.max(
                0,
                Math.min(element.duration, Number(event.target.value)),
              );
              element.currentTime = next;
              setCurrent(next);
              setPreview(next);
            }}
          />
        </div>
        <div className="p-times">
          <span>{formatTime(current)}</span>
          <span>−{formatTime(Math.max(0, duration - current))}</span>
        </div>
        <div className="p-ctrls">
          <button
            className="p-b"
            onClick={toggle}
            aria-label={paused ? "Reproduzir" : "Pausar"}
          >
            <PlayerIcon name={paused ? "play" : "pause"} />
          </button>
          <button
            className="p-b p-b--skip"
            onClick={() => seek(-10)}
            aria-label="Recuar 10 segundos"
          >
            <PlayerIcon name="back10" />
          </button>
          <button
            className="p-b p-b--skip"
            onClick={() => seek(10)}
            aria-label="Avançar 10 segundos"
          >
            <PlayerIcon name="forward10" />
          </button>
          <div className="p-vol">
            <button
              className="p-b"
              onClick={() => {
                if (video.current) video.current.muted = !video.current.muted;
              }}
              aria-label={muted ? "Activar som" : "Silenciar"}
            >
              <PlayerIcon name={muted ? "mute" : "volume"} />
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
          </div>
          <span className="p-sp" />
          <button
            className="p-b"
            aria-label="Legendas"
            aria-expanded={menu === "subtitles"}
            onClick={(event) => openMenu("subtitles", event.currentTarget)}
          >
            <PlayerIcon name="subs" />
          </button>
          <button
            className="p-b"
            ref={optionsButton}
            aria-label="Opções do leitor"
            aria-expanded={(!!menu && menu !== "subtitles") || statsOpen}
            onClick={(event) => openMenu("options", event.currentTarget)}
          >
            <PlayerIcon name="more" />
          </button>
          <button
            className="p-b"
            aria-label="Ecrã inteiro"
            onClick={fullscreen}
          >
            <PlayerIcon name="full" />
          </button>
        </div>
      </footer>
      <p className={`p-osd ${osd ? "is-on" : ""}`} role="status">
        {osd}
      </p>
    </main>
  );
}

function PlayerIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    back10:
      '<path d="M4 8V3m0 5h5M4 8a9 9 0 1 1-1 8"/><text x="12" y="15" font-size="8" fill="currentColor" stroke="none" text-anchor="middle">10</text>',
    forward10:
      '<path d="M20 8V3m0 5h-5m5 0a9 9 0 1 0 1 8"/><text x="12" y="15" font-size="8" fill="currentColor" stroke="none" text-anchor="middle">10</text>',
    volume:
      '<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
    subs: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M6 11h3m3 0h6M6 15h7m3 0h2"/>',
    full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  };
  const icon = (ICON as Record<string, string>)[name];
  return icon ? (
    <span className="player-svg" dangerouslySetInnerHTML={{ __html: icon }} />
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] || paths.full }}
    />
  );
}
