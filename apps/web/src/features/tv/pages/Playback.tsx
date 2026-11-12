import { ZeusLoader } from "../../../shared/components/ZeusLoader";
import { PlaybackRecovery } from "../models/recovery";
import { formatTime } from "../../cinema/models/media";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type Hls from "hls.js";
import { useTV } from "../hooks/state";
import { Modal, ownsModalInteraction } from "../components/ui";
import { tvAPI } from "../services/data";
import type { TVChannel } from "../models/types";
import {
  playbackDuration,
  playbackPosition,
  progressKey,
  serializeStart,
  type PlaybackSession,
} from "../models/playback-helpers";
export default function Playback() {
  const tv = useTV(),
    target = tv.target!;
  return <PlaybackView key={`${tv.listId}:${progressKey(target)}`} />;
}
function PlaybackView() {
  const tv = useTV(),
    listId = tv.listId,
    video = useRef<HTMLVideoElement>(null),
    root = useRef<HTMLDivElement>(null),
    hls = useRef<Hls | null>(null),
    requestLifetime = useRef<AbortController | null>(null);
  // Playback is keyed by list and content; a preference save must not reopen its lease.
  const [target] = useState(() => tv.target!);
  const resumePosition = useEffectEvent(
    () => target.start ?? tv.prefs.progress[progressKey(target)]?.position ?? 0,
  );
  const [audio, setAudio] = useState<{ id: number; label: string }[]>([]),
    [captions, setCaptions] = useState<{ id: number; label: string }[]>([]);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [visible, setVisible] = useState(true),
    [loading, setLoading] = useState(true),
    [retrying, setRetrying] = useState(0),
    [paused, setPaused] = useState(false),
    [channelsOpen, setChannelsOpen] = useState(false),
    [guideOpen, setGuideOpen] = useState(false),
    [tracks, setTracks] = useState(false),
    [page, setPage] = useState<number | null>(null),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(
      tv.prefs.progress[progressKey(target)]?.duration ?? 0,
    );
  const session = useRef<PlaybackSession | null>(null),
    base = useRef(0),
    total = useRef(duration),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    saveRef = useRef<(element?: HTMLVideoElement | null) => void>(() => {});
  const failure = useRef<() => void>(() => {});
  const [recovery] = useState(
    () => new PlaybackRecovery(() => setAttempt((x) => x + 1)),
  );
  useEffect(() => () => recovery.dispose(), [recovery]);
  const isLive = target.section === "live";
  const dock = useQuery({
    queryKey: [
      "tv",
      listId,
      "dock",
      target.categoryId,
      target.id,
      page,
      tv.visibility,
    ],
    enabled: isLive && !!target.categoryId,
    queryFn: ({ signal }) =>
      tvAPI.page<TVChannel>(
        listId,
        "live",
        target.categoryId!,
        page ?? 0,
        signal,
        page === null ? { anchor: target.id } : {},
      ),
  });
  const now = useQuery({
    queryKey: ["tv", listId, "channel-guide", target.id, tv.visibility],
    enabled: isLive,
    queryFn: ({ signal }) => {
      const from = Date.now() - 3600000;
      return tvAPI.channelGuide(
        listId,
        target.id,
        from,
        from + 86400000,
        signal,
      );
    },
    refetchInterval: 60000,
  });
  const metadata = useQuery({
    queryKey: ["tv", listId, "play-metadata", target.section, target.id],
    enabled: !isLive,
    queryFn: ({ signal }) =>
      tvAPI.details(listId, target.section, target.id, signal),
  });
  useEffect(() => {
    const d = metadata.data;
    if (!d) return;
    const min =
      "seasons" in d
        ? d.seasons
            .flatMap((s) => s.episodes)
            .find((e) => e.id === target.episodeId)?.durationMin
        : d.durationMin;
    if (min && min > 0) {
      total.current = min * 60;
      setDuration(min * 60);
    }
  }, [metadata.data, target.episodeId]);
  saveRef.current = (element = video.current) => {
    const v = element;
    if (!v || (!isLive && v.readyState === 0)) return;
    const p = playbackPosition(v.currentTime, base.current);
    if (isLive) {
      void tv
        .updatePrefs((old) => ({ ...old, lastChannel: target.id }))
        .catch(() => {});
      return;
    }
    const d = playbackDuration(
      v.duration,
      total.current,
      base.current,
      session.current?.remux,
    );
    void tv
      .updatePrefs((old) => ({
        ...old,
        progress: {
          ...old.progress,
          [progressKey(target)]: {
            position: p,
            duration: d,
            updatedAt: Date.now(),
          },
        },
      }))
      .catch(() => {});
  };
  const stopToken = (s: PlaybackSession) => tvAPI.stop(s.token).catch(() => {});
  useEffect(() => {
    let disposed = false,
      destroy = () => {};
    setError("");
    setLoading(true);
    setAudio([]);
    setCaptions([]);
    const v = video.current!;
    const startController = new AbortController();
    requestLifetime.current = startController;
    let watchdog: ReturnType<typeof setTimeout>;
    let failed = false;
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      startController.abort();
      clearTimeout(watchdog);
      setLoading(false);
      destroy();
      destroy = () => {};
      v.pause();
      v.removeAttribute("src");
      v.load();
      if (session.current) {
        const old = session.current;
        session.current = null;
        void serializeStart(() => stopToken(old));
      }
      if (isLive && recovery.fail()) {
        setRetrying(recovery.count);
        setError("");
      } else {
        setRetrying(0);
        setError(
          isLive
            ? "O canal não respondeu após cinco novas tentativas. Escolhe outro canal ou tenta novamente."
            : "Não foi possível reproduzir. Tenta de novo.",
        );
      }
    };
    failure.current = fail;
    const waiting = () => {
      if (disposed || failed) return;
      setLoading(true);
      clearTimeout(watchdog);
      watchdog = setTimeout(fail, 20000);
    };
    const playing = () => {
      if (disposed || failed) return;
      clearTimeout(watchdog);
      recovery.playing();
      setLoading(false);
      setRetrying(0);
      setError("");
    };
    let lastTime = -1;
    const progress = () => {
      if (v.currentTime > lastTime && !v.paused) {
        lastTime = v.currentTime;
        playing();
      }
    };
    const pause = () => clearTimeout(watchdog);
    v.addEventListener("waiting", waiting);
    v.addEventListener("playing", playing);
    v.addEventListener("pause", pause);
    v.addEventListener("stalled", waiting);
    v.addEventListener("timeupdate", progress);
    watchdog = setTimeout(fail, 20000);
    void serializeStart(async () => {
      if (disposed) return;
      const s = await tvAPI.start(listId, target, startController.signal);
      if (disposed || failed) {
        await stopToken(s);
        return;
      }
      session.current = s;
      if (!s.url.startsWith("/api/iptv/play/"))
        throw new Error("Endereço de reprodução inválido.");
      const start = resumePosition();
      base.current = s.remux ? start : 0;
      const url = s.url + (s.remux && start ? `?t=${start}` : "");
      if (s.type === "hls" && !v.canPlayType("application/vnd.apple.mpegurl")) {
        const { default: Hls } = await import("hls.js");
        if (disposed || failed) return;
        const h = new Hls();
        hls.current = h;
        const updateTracks = () => {
          setAudio(
            h.audioTracks.map((track, id) => ({
              id,
              label: track.name || track.lang || `Faixa ${id + 1}`,
            })),
          );
          setCaptions(
            h.subtitleTracks.map((track, id) => ({
              id,
              label: track.name || track.lang || `Legenda ${id + 1}`,
            })),
          );
        };
        h.on(Hls.Events.MANIFEST_PARSED, updateTracks);
        h.on(Hls.Events.AUDIO_TRACKS_UPDATED, updateTracks);
        h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, updateTracks);
        destroy = () => {
          hls.current = null;
          h.destroy();
        };
        h.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal && !disposed) fail();
        });
        h.loadSource(url);
        h.attachMedia(v);
      } else if (s.type === "mpegts") {
        const { default: m } = await import("mpegts.js");
        if (disposed || failed) return;
        if (!m.isSupported())
          throw new Error("Este navegador não suporta este canal.");
        const p = m.createPlayer({ type: "mpegts", isLive: true, url });
        destroy = () => {
          p.unload();
          p.detachMediaElement();
          p.destroy();
        };
        p.on(m.Events.ERROR, () => {
          if (!disposed) fail();
        });
        p.attachMediaElement(v);
        p.load();
      } else v.src = url;
      if (!s.remux && !isLive && start)
        v.addEventListener(
          "loadedmetadata",
          () => {
            if (!disposed) v.currentTime = start;
          },
          { once: true },
        );
      void v.play().catch(() => {});
    }).catch(() => {
      if (!disposed) fail();
    });
    const interval = setInterval(() => saveRef.current(), 10000);
    const leavePage = () => {
      saveRef.current();
      if (session.current) void stopToken(session.current);
    };
    window.addEventListener("pagehide", leavePage);
    return () => {
      saveRef.current(v);
      disposed = true;
      startController.abort();
      clearInterval(interval);
      clearTimeout(watchdog);
      v.removeEventListener("waiting", waiting);
      v.removeEventListener("playing", playing);
      v.removeEventListener("pause", pause);
      v.removeEventListener("stalled", waiting);
      v.removeEventListener("timeupdate", progress);
      window.removeEventListener("pagehide", leavePage);
      destroy();
      v.pause();
      v.removeAttribute("src");
      v.load();
      if (session.current) {
        const old = session.current;
        void serializeStart(() => stopToken(old));
        session.current = null;
      }
    };
  }, [listId, attempt, isLive, recovery, target]);
  const wake = () => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement)) setVisible(false);
    }, 3000);
  };
  useEffect(() => {
    wake();
    const focus = requestAnimationFrame(() =>
      root.current
        ?.closest(".tv-sheet")
        ?.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')
        ?.focus(),
    );
    return () => {
      cancelAnimationFrame(focus);
      clearTimeout(timer.current);
    };
  }, []);
  const change = async (delta: number) => {
    const current = dock.data;
    if (!current) return;
    let channels = current.items;
    let index = channels.findIndex((c) => c.id === target.id) + delta;
    if (index < 0 || index >= channels.length) {
      const pages = Math.ceil(current.total / 48);
      const nextPage = (current.page + delta + pages) % pages;
      try {
        const adjacent = await tvAPI.page<TVChannel>(
          listId,
          "live",
          target.categoryId!,
          nextPage,
          requestLifetime.current?.signal,
        );
        // This view may have been replaced while fetching the adjacent page.
        if (!video.current) return;
        channels = adjacent.items;
        index = delta > 0 ? 0 : channels.length - 1;
      } catch {
        if (requestLifetime.current?.signal.aborted || !video.current) return;
        setError("Não foi possível mudar de canal. Tenta de novo.");
        return;
      }
    }
    const channel = channels[index];
    if (channel)
      tv.play({
        section: "live",
        id: channel.id,
        title: channel.name,
        categoryId: channel.categoryId,
      });
  };
  const changeChannel = useEffectEvent(change);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!ownsModalInteraction(root.current)) return;
      wake();
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (isLive && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        void changeChannel(e.key === "ArrowRight" ? 1 : -1);
      }
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        const v = video.current!;
        if (v.paused) void v.play().catch(() => {});
        else v.pause();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [isLive]);
  const programme = now.data?.find(
      (p) => p.start <= Date.now() && p.stop > Date.now(),
    ),
    nextProgramme = now.data?.find((p) => p.start > Date.now()),
    fraction = programme
      ? Math.max(
          0,
          Math.min(
            1,
            (Date.now() - programme.start) / (programme.stop - programme.start),
          ),
        )
      : 0;
  const seek = (time: number) => {
    const v = video.current,
      s = session.current;
    if (!v || !s) return;
    if (s.remux) {
      v.pause();
      base.current = time;
      v.src = s.url + `?t=${time}`;
      v.load();
      void v.play().catch(() => {});
    } else v.currentTime = time;
    setPosition(time);
  };
  return (
    <Modal
      title={target.title || "Reprodução"}
      onClose={tv.stop}
      className="tv-player-modal"
      fullViewport
    >
      <div
        ref={root}
        className={`tv-player ${visible ? "" : "tv-controls-hidden"}`}
      >
        <video
          ref={video}
          autoPlay
          playsInline
          controls={tracks}
          onPlay={() => setPaused(false)}
          onPause={() => {
            setPaused(true);
            saveRef.current();
          }}
          onError={() => failure.current()}
          onTimeUpdate={() => {
            const v = video.current!;
            setPosition(playbackPosition(v.currentTime, base.current));
            const d = playbackDuration(
              v.duration,
              total.current,
              base.current,
              session.current?.remux,
            );
            total.current = d;
            setDuration(d);
          }}
        />
        <button
          className="player-menu-toggle"
          aria-label="Controlos do leitor"
          aria-expanded={visible}
          onClick={() => {
            clearTimeout(timer.current);
            setVisible((x) => !x);
          }}
        >
          ☷ <span>Controlos</span>
        </button>
        {(loading || retrying > 0) && !error && (
          <div className="tv-player-loading">
            <ZeusLoader
              label={
                retrying
                  ? `A tentar novamente · ${retrying}/5`
                  : "A ligar ao vídeo…"
              }
            />
          </div>
        )}
        <div className="tv-player-top tv-player-controls" inert={!visible}>
          <div className="tv-programme-capsule">
            {isLive && <span className="tv-live-dot" />}
            <strong>{target.title || "Reprodução"}</strong>
            {isLive && !programme && (
              <span>
                {now.isPending
                  ? "A carregar guia…"
                  : now.error
                    ? "Guia indisponível"
                    : "Sem guia"}
              </span>
            )}
            {nextProgramme && <span>A seguir · {nextProgramme.title}</span>}
            {programme && (
              <>
                <span className="tv-now-programme">{programme.title}</span>
                <span
                  className="tv-programme-ring"
                  style={{
                    background: `conic-gradient(#7de3f0 ${fraction * 360}deg, #ffffff22 0)`,
                  }}
                />
              </>
            )}
          </div>
          <div className="tv-toolbar">
            {isLive && (
              <button onClick={() => setGuideOpen(true)}>Guia do canal</button>
            )}
            {isLive && (
              <button
                aria-pressed={channelsOpen}
                onClick={() => setChannelsOpen((x) => !x)}
              >
                Canais
              </button>
            )}
            <button onClick={() => setTracks((x) => !x)}>
              Legendas / Áudio
            </button>
            <button
              aria-label="Ecrã inteiro"
              onClick={() => {
                void (
                  document.fullscreenElement
                    ? document.exitFullscreen()
                    : root.current
                        ?.closest<HTMLElement>(".tv-sheet")
                        ?.requestFullscreen()
                )?.catch(() => setError("O ecrã inteiro não está disponível."));
              }}
            >
              ⛶
            </button>
          </div>
        </div>
        {error && (
          <div className="tv-player-error" role="alert">
            <p>{error}</p>
            <button
              onClick={() => {
                recovery.reset();
                setRetrying(0);
                setAttempt((x) => x + 1);
              }}
            >
              Tentar de novo
            </button>
          </div>
        )}
        <div className="tv-player-bottom tv-player-controls" inert={!visible}>
          <div className="tv-toolbar">
            <button
              aria-label="Reproduzir / Pausa"
              onClick={() => {
                const v = video.current!;
                if (v.paused) void v.play().catch(() => {});
                else v.pause();
              }}
            >
              <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
            </button>
            {!isLive && (
              <>
                <button
                  aria-label="Recuar 10 segundos"
                  onClick={() => seek(Math.max(0, position - 10))}
                >
                  −10
                </button>
                <button
                  aria-label="Avançar 10 segundos"
                  onClick={() => seek(Math.min(duration, position + 10))}
                >
                  +10
                </button>
                <select
                  aria-label="Velocidade"
                  defaultValue="1"
                  onChange={(e) => {
                    if (video.current)
                      video.current.playbackRate = Number(e.target.value);
                  }}
                >
                  {[0.5, 1, 1.25, 1.5, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </>
            )}
            {document.pictureInPictureEnabled && (
              <button
                aria-label="Janela flutuante"
                onClick={() => {
                  void (
                    document.pictureInPictureElement
                      ? document.exitPictureInPicture()
                      : video.current?.requestPictureInPicture()
                  )?.catch(() =>
                    setError(
                      "A janela flutuante não está disponível para este vídeo.",
                    ),
                  );
                }}
              >
                ▣
              </button>
            )}
            <label>
              <span aria-hidden="true">♪</span>{" "}
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                defaultValue="1"
                onChange={(e) => {
                  video.current!.volume = +e.target.value;
                }}
              />
            </label>
          </div>
          {!isLive && duration > 0 && (
            <label className="tv-seek">
              {formatTime(position)} / {formatTime(duration)}
              <input
                aria-label="Posição"
                type="range"
                min="0"
                max={duration}
                value={Math.min(position, duration)}
                onChange={(e) => seek(+e.target.value)}
              />
            </label>
          )}
          {tracks && (audio.length > 0 || captions.length > 0) && (
            <div className="tv-toolbar">
              {audio.length > 0 && (
                <label>
                  Áudio{" "}
                  <select
                    aria-label="Faixa de áudio"
                    defaultValue={hls.current?.audioTrack}
                    onChange={(e) => {
                      if (hls.current) hls.current.audioTrack = +e.target.value;
                    }}
                  >
                    {audio.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {captions.length > 0 && (
                <label>
                  Legendas{" "}
                  <select
                    aria-label="Faixa de legendas"
                    defaultValue={hls.current?.subtitleTrack ?? -1}
                    onChange={(e) => {
                      if (hls.current)
                        hls.current.subtitleTrack = +e.target.value;
                    }}
                  >
                    <option value={-1}>Desligadas</option>
                    {captions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {tracks && (
            <p>
              Usa os controlos nativos do vídeo para as faixas disponíveis. A
              disponibilidade depende do canal e do navegador.
            </p>
          )}
          {isLive && channelsOpen && (
            <div className="tv-channel-dock">
              <button aria-label="Canal anterior" onClick={() => change(-1)}>
                ←
              </button>
              {dock.data?.items.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={c.id === target.id}
                  onClick={() =>
                    tv.play({
                      section: "live",
                      id: c.id,
                      title: c.name,
                      categoryId: c.categoryId,
                    })
                  }
                >
                  {c.logo && <img src={c.logo} alt="" />}
                  <strong>{c.name}</strong>
                </button>
              ))}
              <button aria-label="Canal seguinte" onClick={() => change(1)}>
                →
              </button>
            </div>
          )}
          {isLive && channelsOpen && dock.data && dock.data.total > 48 && (
            <div className="tv-toolbar">
              <button
                disabled={!dock.data?.page}
                onClick={() => setPage((dock.data?.page ?? 0) - 1)}
              >
                Anteriores
              </button>
              <button
                disabled={(dock.data.page + 1) * 48 >= dock.data.total}
                onClick={() => setPage((dock.data?.page ?? 0) + 1)}
              >
                Mais canais
              </button>
            </div>
          )}
        </div>
      </div>
      {guideOpen && (
        <Modal
          title={`Guia · ${target.title || "Canal"}`}
          onClose={() => setGuideOpen(false)}
        >
          {now.isPending ? (
            <p role="status">A carregar guia…</p>
          ) : now.error ? (
            <>
              <p role="alert">Não foi possível carregar o guia.</p>
              <button onClick={() => void now.refetch()}>Tentar de novo</button>
            </>
          ) : !now.data?.length ? (
            <p>Sem programação disponível.</p>
          ) : (
            <ul>
              {now.data.map((p) => (
                <li key={`${p.start}:${p.title}`}>
                  <strong>{p.title}</strong>
                  <p>
                    {new Date(p.start).toLocaleTimeString("pt-PT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(p.stop).toLocaleTimeString("pt-PT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p>{p.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </Modal>
  );
}
