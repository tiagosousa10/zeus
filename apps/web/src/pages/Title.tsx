import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useMemberState } from "../lib/session";
import {
  backdrop,
  metadata,
  playbackKey,
  progressRatio,
  streamFacts,
  type Episode,
  type Media,
  type ProgressEntry,
  type Stream,
  type StreamResponse,
} from "../lib/catalog";
import "./cinema.css";
import "./cinema-reference.css";
import { cursorLight, lightning } from "../lib/fx.js";
export default function Title() {
  const params = new URLSearchParams(location.search),
    id = params.get("id") ?? "",
    type = params.get("type") === "series" ? "series" : "movie";
  const { state, save, loading: stateLoading } = useMemberState();
  const library = state.library as Media[],
    progress = state.progress as Record<string, ProgressEntry>;
  const [season, setSeason] = useState<number | undefined>();
  const [episode, setEpisode] = useState<Episode | undefined>();
  const [sort, setSort] = useState("quality");
  const [cacheOnly, setCacheOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [dock, setDock] = useState(false);
  const playButton = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!playButton.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDock(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(playButton.current);
    return () => observer.disconnect();
  }, []);
  const figure = useRef<HTMLDivElement>(null);
  const bolts = useRef<HTMLCanvasElement>(null);
  const meta = useQuery({
    queryKey: ["meta", type, id],
    queryFn: ({ signal }) => metadata(type, id, signal),
    staleTime: 300000,
  });
  const videos = useMemo(
    () =>
      (meta.data?.videos ?? [])
        .filter((item) => item.season > 0 && item.episode > 0)
        .sort((a, b) => a.season - b.season || a.episode - b.episode),
    [meta.data],
  );
  useEffect(() => {
    if (!videos.length || stateLoading) return;
    const wanted = videos.find(
      (item) =>
        item.season === Number(params.get("s")) &&
        item.episode === Number(params.get("e")),
    );
    const current =
      wanted ??
      videos.find(
        (item) =>
          !progress[item.id]?.completed &&
          progressRatio(progress[item.id]) < 0.95,
      ) ??
      videos[0];
    setEpisode(current);
    setSeason(current.season);
  }, [videos, stateLoading]);
  useEffect(() => {
    const el = figure.current;
    if (!el) return;
    el.innerHTML =
      '<img src="/art/img/guerreiro.webp" alt="" width="1741" height="2400">';
    const light = cursorLight(el, {
      size: 0.56,
      rest: [0.3, 0.3],
      orbit: [0.38, 0.36, 0.1, 0.09],
    });
    const sky = lightning(bolts.current!, {
      palette: "warm",
      every: [7000, 14000],
      first: [5200, 8000],
      area: { x: [0.72, 0.94], y: [0.12, 0.34] },
      onFrame: (I: number) => el.style.setProperty("--I", String(I)),
    });
    const observer = new IntersectionObserver(
      ([entry]) => sky.setAmbient(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el.parentElement!);
    return () => {
      observer.disconnect();
      sky.destroy();
      light.destroy();
      el.replaceChildren();
    };
  }, []);
  const videoId = meta.data ? playbackKey(meta.data, episode) : id;
  const sources = useQuery({
    queryKey: ["sources", type, videoId, state.addons],
    enabled: !!meta.data && (type === "movie" || !!episode),
    queryFn: () =>
      api<StreamResponse>(
        `/streams?${new URLSearchParams({ type, id: videoId })}`,
      ),
    staleTime: 30000,
    retry: false,
  });
  const shown = (sources.data?.streams ?? [])
    .map((stream) => ({ stream, facts: streamFacts(stream) }))
    .filter(({ facts }) => !cacheOnly || facts.cached)
    .sort((a, b) =>
      sort === "size"
        ? b.facts.bytes - a.facts.bytes
        : sort === "seeders"
          ? (b.facts.seeders ?? -1) - (a.facts.seeders ?? -1)
          : b.facts.rank - a.facts.rank ||
            Number(b.facts.cached) - Number(a.facts.cached),
    );
  async function toggleList() {
    if (!meta.data || saving || stateLoading) return;
    setSaving(true);
    try {
      const added = library.some((item) => item.id === id);
      const item: Media = {
        id,
        type,
        name: meta.data.name,
        poster: meta.data.poster,
        background: meta.data.background,
        releaseInfo: meta.data.releaseInfo,
      };
      await save({
        library: added
          ? library.filter((item) => item.id !== id)
          : [item, ...library],
      });
      setNotice(added ? "Removido da tua lista." : "Adicionado à tua lista.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível guardar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function markEpisode(item: Episode) {
    if (!meta.data) return;
    const existing = progress[item.id];
    const entry: ProgressEntry = {
      id,
      type,
      name: meta.data.name,
      poster: meta.data.poster,
      position: existing?.position ?? 0,
      duration: existing?.duration ?? 0,
      season: item.season,
      episode: item.episode,
      updatedAt: new Date().toISOString(),
      completed: !existing?.completed,
    };
    try {
      await save({ progress: { ...progress, [item.id]: entry } });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível guardar.",
      );
    }
  }
  function play(stream: Stream, sourceIndex: number) {
    const query = new URLSearchParams({
      id,
      type,
      source: String(sourceIndex),
    });
    if (episode) {
      query.set("s", String(episode.season));
      query.set("e", String(episode.episode));
    }
    // Only a selection key travels in the URL; configured Source URLs never enter browser history.
    const key = crypto.randomUUID();
    try {
      sessionStorage.setItem(
        `zeus:play:${key}`,
        JSON.stringify({ stream, videoId, id, type, createdAt: Date.now() }),
      );
      query.set("selection", key);
    } catch {
      /* The player can request the approved sources again. */
    }
    location.href = `/leitor?${query}`;
  }
  return (
    <Page className="title-page">
      <canvas className="t-bolts" ref={bolts} aria-hidden="true" />
      <section className="t-hero">
        {meta.data && (
          <div className="z-art t-back">
            <img className="is-on" src={backdrop(meta.data)} alt="" />
          </div>
        )}
        <div className="t-warrior" ref={figure} aria-hidden="true" />
        <div className="z-vignette" />
        <div className="t-copy">
          <h1 className="t-title">
            {meta.data ? (
              <>
                <span className="t-logo">
                  <img
                    src={
                      meta.data.logo ||
                      `https://images.metahub.space/logo/medium/${id}/img`
                    }
                    alt={meta.data.name}
                    onError={(e) => {
                      e.currentTarget.parentElement!.hidden = true;
                      (
                        e.currentTarget.parentElement!
                          .nextElementSibling as HTMLElement
                      ).hidden = false;
                    }}
                  />
                </span>
                <span hidden>{meta.data.name}</span>
              </>
            ) : meta.isPending ? (
              "A abrir o título…"
            ) : (
              "Título indisponível"
            )}
          </h1>
          <div className="z-meta t-meta">
            {meta.data?.imdbRating && (
              <span className="z-pill">IMDb {meta.data.imdbRating}</span>
            )}
            <span className="z-num">{meta.data?.releaseInfo}</span>
            <span>
              {type === "series" ? "Série" : mediaDuration(meta.data?.runtime)}
            </span>
            <span className="t-genres">
              {meta.data?.genres?.slice(0, 3).map(genreName).join(", ")}
            </span>
          </div>
          <p className="t-syn">{meta.data?.description}</p>
          {meta.data?.cast?.length && (
            <p className="t-cast">
              <strong>Elenco</strong> {meta.data.cast.slice(0, 4).join(", ")}
            </p>
          )}
          <div className="t-actions">
            <a
              className="z-btn z-btn--primary t-play"
              ref={playButton}
              href="#fontes"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 4.9v14.2c0 .8.9 1.3 1.6.9l11-7.1a1 1 0 0 0 0-1.8l-11-7.1C7.9 3.6 7 4.1 7 4.9z" />
              </svg>{" "}
              Reproduzir {episode && `T${episode.season}:E${episode.episode}`}
            </a>
            <button
              className="z-btn z-btn--secondary"
              onClick={toggleList}
              disabled={saving || stateLoading || !meta.data}
              aria-pressed={library.some((item) => item.id === id)}
            >
              {library.some((item) => item.id === id)
                ? "✓ Na minha lista"
                : "A minha lista"}
            </button>
            {meta.data?.trailers?.[0]?.source && (
              <a
                className="z-btn z-btn--ghost"
                target="_blank"
                rel="noreferrer"
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(meta.data.trailers[0].source)}`}
              >
                Trailer
              </a>
            )}
          </div>
        </div>
        <a
          className="t-credit"
          href="https://commons.wikimedia.org/wiki/File:Borghese_Gladiator,_Louvre_Museum,_Paris_2_October_2014.jpg"
          target="_blank"
          rel="noreferrer"
        >
          Foto: Ryan Bauman, CC BY 2.0
        </a>
      </section>
      <div className="t-body">
        {meta.isError && (
          <div role="alert" className="cinema-message">
            {meta.error.message}
            <button className="z-btn" onClick={() => meta.refetch()}>
              Tentar novamente
            </button>
          </div>
        )}
        {videos.length > 0 && (
          <section className="title-episodes">
            <div className="t-sec-head">
              <h2 className="z-t2">Episódios</h2>
              <div className="z-tabs" role="tablist" aria-label="Temporadas">
                {[...new Set(videos.map((item) => item.season))].map(
                  (value) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={season === value}
                      onClick={() => setSeason(value)}
                    >
                      Temporada {value}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="t-eps">
              {videos
                .filter((item) => item.season === season)
                .map((item) => (
                  <article
                    className={`t-ep ${episode?.id === item.id ? "is-current" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="t-ep__btn"
                      onClick={() => setEpisode(item)}
                      aria-pressed={episode?.id === item.id}
                    >
                      <div className="t-ep__art">
                        {item.thumbnail && (
                          <img src={item.thumbnail} alt="" loading="lazy" />
                        )}
                        <span className="t-ep__no">E{item.episode}</span>
                        <progress
                          value={
                            progress[item.id]?.completed
                              ? 1
                              : progressRatio(progress[item.id])
                          }
                          max="1"
                          aria-label="Progresso"
                        />
                      </div>
                      <strong className="t-ep__name">
                        {item.name ?? item.title ?? `Episódio ${item.episode}`}
                      </strong>
                      <p className="t-ep__desc">{item.overview}</p>
                    </button>
                    <button
                      className="title-seen"
                      onClick={() => markEpisode(item)}
                      aria-pressed={!!progress[item.id]?.completed}
                    >
                      {progress[item.id]?.completed
                        ? "✓ Visto"
                        : "Marcar como visto"}
                    </button>
                  </article>
                ))}
            </div>
          </section>
        )}
        <section className="title-sources" id="fontes">
          <div className="t-sec-head">
            <h2 className="z-t2">Fontes</h2>
            {episode && (
              <span className="t-for">
                T{episode.season}:E{episode.episode}
              </span>
            )}
            <div className="t-tools">
              <div
                className="z-seg"
                role="radiogroup"
                aria-label="Ordenar fontes por"
              >
                {[
                  ["quality", "Qualidade"],
                  ["size", "Tamanho"],
                  ["seeders", "Seeders"],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="sort"
                      value={value}
                      checked={sort === value}
                      onChange={() => setSort(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button
                className="z-switch"
                type="button"
                role="switch"
                aria-checked={cacheOnly}
                onClick={() => setCacheOnly(!cacheOnly)}
              >
                Só em cache
              </button>
            </div>
          </div>
          <div className="t-addons">
            <div className="t-addons__row">
              <p className="t-addons__status z-num" role="status">
                {sources.isFetching
                  ? "A perguntar aos Add-ons…"
                  : `${shown.length} fontes disponíveis`}
              </p>
              <ul className="t-pips">
                {[
                  ...new Set(
                    (sources.data?.streams ?? []).map(
                      (s) => s.addonName || s.addon || s.name || "Add-on",
                    ),
                  ),
                ].map((name) => (
                  <li className="t-pip" data-state="ok" key={name}>
                    {name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="t-bar">
              <i
                style={{
                  transform: `scaleX(${sources.isFetching ? 0.15 : 1})`,
                }}
              />
            </div>
          </div>
          {sources.isFetching && (
            <p className="cinema-empty" role="status">
              A perguntar aos teus Add-ons…
            </p>
          )}
          {sources.isError && (
            <div className="cinema-message" role="alert">
              <p>{sources.error.message}</p>
              <button className="z-btn" onClick={() => sources.refetch()}>
                Tentar novamente
              </button>
            </div>
          )}
          {sources.data?.errors?.map((error, index) => (
            <p className="cinema-source-error" key={index}>
              {typeof error === "string"
                ? error
                : `${error.addon}: ${error.error}`}{" "}
            </p>
          ))}
          {!sources.isFetching && !sources.isError && shown.length === 0 && (
            <div className="cinema-message">
              <h3>Nenhuma Fonte disponível</h3>
              <p>
                {cacheOnly
                  ? "Retira o filtro «Só em cache» para ver as restantes Fontes."
                  : "Instala um Add-on aprovado que forneça Fontes, ou tenta outro título."}
              </p>
              <a className="z-btn z-btn--secondary" href="/addons">
                Gerir Add-ons
              </a>
            </div>
          )}
          <ol className="t-srcs">
            {shown.map(({ stream, facts }, index) => (
              <li
                key={`${stream.name}:${stream.infoHash ?? stream.url}:${index}`}
              >
                <button
                  className="t-src"
                  onClick={() =>
                    play(stream, (sources.data?.streams ?? []).indexOf(stream))
                  }
                >
                  <span className="t-q">
                    {facts.quality || "Vídeo"}
                    <small>
                      {stream.addonName ||
                        stream.addon ||
                        stream.name ||
                        "Add-on"}
                    </small>
                  </span>
                  <span className="t-details">
                    <span className="t-chips">
                      {[
                        facts.hdr,
                        facts.codec,
                        facts.size,
                        facts.seeders !== undefined
                          ? `${facts.seeders} seeders`
                          : "",
                        facts.cached ? "Em cache" : "",
                      ]
                        .filter(Boolean)
                        .map((chip) => (
                          <span className="z-tag" key={chip}>
                            {chip}
                          </span>
                        ))}
                    </span>
                    <span className="t-raw">
                      {stream.title ||
                        stream.description ||
                        stream.behaviorHints?.filename ||
                        stream.name}
                    </span>
                  </span>
                  <span className="t-src__end">
                    <span className="t-go">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M7 4.9v14.2c0 .8.9 1.3 1.6.9l11-7.1a1 1 0 0 0 0-1.8l-11-7.1C7.9 3.6 7 4.1 7 4.9z" />
                      </svg>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <p role="status">{notice}</p>
      </div>

      <div className="t-dock" data-off={!dock ? "" : undefined}>
        <span className="t-dock__t">
          {meta.data?.name}
          {episode && (
            <small>
              T{episode.season}:E{episode.episode}
            </small>
          )}
        </span>
        <a className="z-btn z-btn--primary z-btn--sm" href="#fontes">
          Reproduzir
        </a>
      </div>
    </Page>
  );
}

const genreName = (genre: string) =>
  ({
    Action: "Acção",
    Adventure: "Aventura",
    Animation: "Animação",
    Comedy: "Comédia",
    Crime: "Crime",
    Documentary: "Documentário",
    Fantasy: "Fantasia",
    Horror: "Terror",
    Mystery: "Mistério",
    Romance: "Romance",
    "Sci-Fi": "Ficção científica",
    War: "Guerra",
    History: "História",
    Family: "Família",
  })[genre] || genre;
function mediaDuration(value?: string) {
  const n = parseInt(value || "");
  return n ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}` : value;
}
