import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
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
  const figure = useRef<HTMLDivElement>(null);
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
    if (
      !figure.current ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const ctx = gsap.context(
      () =>
        gsap.fromTo(
          figure.current,
          { opacity: 0, x: 35 },
          { opacity: 1, x: 0, duration: 1.6, ease: "power3.out" },
        ),
      figure,
    );
    return () => ctx.revert();
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
    <Page>
      <section className="title-hero">
        {meta.data && (
          <img className="title-backdrop" src={backdrop(meta.data)} alt="" />
        )}
        <div
          className="title-warrior"
          ref={figure}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            event.currentTarget.style.setProperty(
              "--light-x",
              `${((event.clientX - box.left) / box.width) * 100}%`,
            );
            event.currentTarget.style.setProperty(
              "--light-y",
              `${((event.clientY - box.top) / box.height) * 100}%`,
            );
          }}
        >
          <img src="/art/img/guerreiro.webp" alt="" />
          <div />
        </div>
        <div className="title-copy">
          <a href="/cinema" className="cinema-back">
            ← Cinema
          </a>
          <p className="cinema-eyebrow">CADA HISTÓRIA, UMA EPOPEIA</p>
          <h1>
            {meta.data?.name ??
              (meta.isPending ? "A abrir o título…" : "Título indisponível")}
          </h1>
          <p className="cinema-meta">
            {meta.data?.releaseInfo}{" "}
            {meta.data?.imdbRating && `· IMDb ${meta.data.imdbRating}`}{" "}
            {meta.data?.runtime && `· ${meta.data.runtime}`}
          </p>
          <p className="cinema-synopsis">{meta.data?.description}</p>
          {meta.data?.cast?.length && (
            <p className="cinema-cast">
              <strong>Elenco</strong> {meta.data.cast.slice(0, 4).join(", ")}
            </p>
          )}
          <div className="cinema-actions">
            <a className="z-btn z-btn--primary" href="#fontes">
              ▶ Escolher Fonte{" "}
              {episode && `T${episode.season}:E${episode.episode}`}
            </a>
            <button
              className="z-btn z-btn--secondary"
              onClick={toggleList}
              disabled={saving || stateLoading || !meta.data}
              aria-pressed={library.some((item) => item.id === id)}
            >
              {library.some((item) => item.id === id)
                ? "✓ Na minha lista"
                : "+ A minha lista"}
            </button>
            {meta.data?.trailers?.[0]?.source && (
              <a
                className="z-btn z-btn--ghost"
                target="_blank"
                rel="noreferrer"
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(meta.data.trailers[0].source)}`}
              >
                Trailer ↗
              </a>
            )}
          </div>
        </div>
      </section>
      <div className="cinema-content">
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
            <div className="cinema-results-head">
              <h2>Episódios</h2>
              <label className="cinema-select">
                Temporada
                <select
                  value={season ?? ""}
                  onChange={(event) => setSeason(Number(event.target.value))}
                >
                  {[...new Set(videos.map((item) => item.season))].map(
                    (value) => (
                      <option key={value} value={value}>
                        Temporada {value}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <div className="cinema-track">
              {videos
                .filter((item) => item.season === season)
                .map((item) => (
                  <article
                    className={`title-episode ${episode?.id === item.id ? "is-current" : ""}`}
                    key={item.id}
                  >
                    <button
                      onClick={() => setEpisode(item)}
                      aria-pressed={episode?.id === item.id}
                    >
                      <div className="title-episode__image">
                        {item.thumbnail && (
                          <img src={item.thumbnail} alt="" loading="lazy" />
                        )}
                        <span>E{item.episode}</span>
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
                      <strong>
                        {item.name ?? item.title ?? `Episódio ${item.episode}`}
                      </strong>
                      <p>{item.overview}</p>
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
          <div className="cinema-results-head">
            <div>
              <p className="cinema-eyebrow">O CAMINHO ATÉ À HISTÓRIA</p>
              <h2>
                Fontes{" "}
                {episode && (
                  <small>
                    · T{episode.season}:E{episode.episode}
                  </small>
                )}
              </h2>
            </div>
            <div className="cinema-filters">
              <label className="cinema-select">
                Ordenar
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="quality">Qualidade</option>
                  <option value="seeders">Seeders</option>
                  <option value="size">Tamanho</option>
                </select>
              </label>
              <label className="cinema-checkbox">
                <input
                  type="checkbox"
                  checked={cacheOnly}
                  onChange={(event) => setCacheOnly(event.target.checked)}
                />
                Só em cache
              </label>
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
          <ol className="title-source-list">
            {shown.map(({ stream, facts }, index) => (
              <li
                key={`${stream.name}:${stream.infoHash ?? stream.url}:${index}`}
              >
                <button
                  className="title-source"
                  onClick={() =>
                    play(stream, (sources.data?.streams ?? []).indexOf(stream))
                  }
                >
                  <span className="title-source__quality">
                    {facts.quality || "Vídeo"}
                    <small>
                      {stream.addonName ||
                        stream.addon ||
                        stream.name ||
                        "Add-on"}
                    </small>
                  </span>
                  <span className="title-source__details">
                    <span className="title-source__chips">
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
                    <span className="title-source__description">
                      {stream.title ||
                        stream.description ||
                        stream.behaviorHints?.filename ||
                        stream.name}
                    </span>
                  </span>
                  <span className="title-source__play">▶</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <p role="status">{notice}</p>
      </div>
      <footer className="cinema-credit">
        Gladiador Borghese. Fotografia de{" "}
        <a
          href="https://commons.wikimedia.org/wiki/File:Borghese_Gladiator,_Louvre_Museum,_Paris_2_October_2014.jpg"
          target="_blank"
          rel="noreferrer"
        >
          Ryan Bauman, CC BY 2.0
        </a>
        .
      </footer>
    </Page>
  );
}
