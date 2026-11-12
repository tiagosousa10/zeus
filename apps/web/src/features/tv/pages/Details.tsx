import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTV } from "../hooks/state";
import { tvAPI } from "../services/data";
import { EmptyState, Skeleton } from "../components/ui";
import { orderedEpisodes, resumePosition } from "../models/catalog-helpers";
import type { TVMovieDetail, TVEpisode } from "../models/types";
export default function Details() {
  const tv = useTV();
  return tv.section === "live" ? null : (
    <Detail
      key={`${tv.listId}:${tv.section}:${tv.view.detailId}:${tv.visibility}`}
      section={tv.section}
    />
  );
}
function Detail({ section }: { section: "movie" | "series" }) {
  const tv = useTV(),
    id = tv.view.detailId!,
    [season, setSeason] = useState<number>(),
    [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["tv", tv.listId, "detail", section, id, tv.visibility],
    queryFn: ({ signal }) => tvAPI.details(tv.listId, section, id, signal),
    retry: false,
  });
  const d = q.data;
  const back = () => tv.navigate({ section, categoryId: tv.categoryId });
  if (q.isPending) return <Skeleton />;
  if (q.error || !d)
    return (
      <EmptyState
        title="Não foi possível abrir este conteúdo"
        action={
          <>
            <button onClick={() => void q.refetch()}>Tentar de novo</button>
            <button onClick={back}>Voltar</button>
          </>
        }
      >
        O conteúdo pode já não estar disponível nesta lista.
      </EmptyState>
    );
  const series = "seasons" in d ? d : undefined,
    movie =
      "durationMin" in d
        ? (d as TVMovieDetail)
        : !series
          ? (d as TVMovieDetail)
          : undefined;
  const seasons = series
    ? [...series.seasons].sort((a, b) => a.number - b.number)
    : [];
  const active = seasons.find((s) => s.number === season) || seasons[0];
  const episodes = orderedEpisodes(active?.episodes || []);
  const all = orderedEpisodes(seasons.flatMap((s) => s.episodes));
  const saved = all
    .map((e) => ({
      episode: e,
      progress: tv.prefs.progress[`series:${id}:${e.id}`],
    }))
    .filter(
      (x) =>
        x.progress &&
        x.progress.duration > 0 &&
        x.progress.position / x.progress.duration < 0.95 &&
        x.progress.position > 0,
    )
    .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)[0];
  const next =
    saved?.episode ||
    all.find((e) => {
      const p = tv.prefs.progress[`series:${id}:${e.id}`];
      return !p || p.duration <= 0 || p.position / p.duration < 0.95;
    }) ||
    all[0];
  const progress = tv.prefs.progress[`movie:${id}`];
  const resume =
    progress &&
    progress.duration > 0 &&
    progress.position / progress.duration < 0.95
      ? progress.position
      : 0;
  const play = (episode?: TVEpisode, start?: number) =>
    tv.play({
      section,
      id,
      episodeId: episode?.id,
      title: episode ? `${d.name} · ${episode.title}` : d.name,
      categoryId: d.categoryId,
      start:
        start ??
        (episode
          ? resumePosition(tv.prefs.progress[`series:${id}:${episode.id}`])
          : resume),
    });
  const favorite = tv.prefs.favorites[section].includes(id);
  const toggle = () =>
    void tv
      .updatePrefs((p) => ({
        ...p,
        favorites: {
          ...p.favorites,
          [section]: p.favorites[section].includes(id)
            ? p.favorites[section].filter((x) => x !== id)
            : [...p.favorites[section], id],
        },
      }))
      .catch(() => {});
  const art = d.backdrop || d.poster;
  const metadata = [
    d.year,
    series
      ? `${seasons.length} temporada${seasons.length === 1 ? "" : "s"}`
      : undefined,
    d.rating !== undefined ? `★ ${d.rating}` : undefined,
    movie?.durationMin ? `${movie.durationMin} min` : undefined,
    movie?.age,
  ].filter((x) => x !== undefined);
  return (
    <section
      className={`tv-detail tv-detail-${section}`}
      style={
        art
          ? ({ "--detail-art": `url(${JSON.stringify(art)})` } as CSSProperties)
          : undefined
      }
    >
      <button className="tv-detail-back" onClick={back}>
        ← Voltar
      </button>
      <div className="tv-detail-panel">
        {series && (
          <aside className="tv-detail-aside">
            {d.poster ? (
              <img className="tv-detail-poster" src={d.poster} alt={d.name} />
            ) : (
              <div className="tv-detail-poster tv-art-missing">{d.name}</div>
            )}
            {next && (
              <button className="tv-primary" onClick={() => play(next)}>
                ▶ T{next.season} · E{next.number}
                {saved ? " · Continuar" : ""}
              </button>
            )}
            <button aria-pressed={favorite} onClick={toggle}>
              {favorite ? "★ Favorito" : "☆ Adicionar aos favoritos"}
            </button>
          </aside>
        )}
        <div className="tv-detail-copy">
          <span className="tv-eyebrow">
            {d.genre || (series ? "SÉRIE" : "FILME")}
          </span>
          <h1>{d.name}</h1>
          {metadata.length > 0 && (
            <div className="tv-detail-tags">
              {metadata.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </div>
          )}
          {d.plot && <p className="tv-synopsis">{d.plot}</p>}
          {movie && (
            <>
              <button className="tv-resume" onClick={() => play()}>
                <span
                  className="tv-ring"
                  style={
                    {
                      "--progress": `${progress && progress.duration > 0 ? Math.min(1, progress.position / progress.duration) * 360 : 0}deg`,
                    } as CSSProperties
                  }
                >
                  ▶
                </span>
                <span>
                  <strong>{resume > 0 ? "Continuar" : "Reproduzir"}</strong>
                  {resume > 0 && (
                    <small>
                      {Math.floor(resume / 60)} de{" "}
                      {Math.ceil(progress.duration / 60)} min
                    </small>
                  )}
                </span>
              </button>
              <div className="tv-toolbar">
                <button onClick={() => play(undefined, 0)}>Do início</button>
                <button aria-pressed={favorite} onClick={toggle}>
                  {favorite ? "★ Favorito" : "☆ Adicionar aos favoritos"}
                </button>
              </div>
              {movie.director && (
                <p>
                  <span className="tv-eyebrow">REALIZAÇÃO</span>
                  <br />
                  {movie.director}
                </p>
              )}
            </>
          )}
          {series &&
            (seasons.length > 0 ? (
              <>
                <div className="tv-season-tabs" aria-label="Temporadas">
                  {seasons.map((s) => (
                    <button
                      key={s.number}
                      aria-pressed={active?.number === s.number}
                      onClick={() => {
                        setSeason(s.number);
                        setPage(0);
                      }}
                    >
                      {s.name || `Temporada ${s.number}`}
                    </button>
                  ))}
                </div>
                <div
                  className="tv-episodes"
                  onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    const direction =
                      event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowLeft"
                          ? -1
                          : 0;
                    if (!direction) return;
                    const nodes = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button",
                      ),
                    );
                    const at = nodes.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    if (at < 0) return;
                    event.preventDefault();
                    nodes[
                      Math.max(0, Math.min(nodes.length - 1, at + direction))
                    ]?.focus();
                  }}
                >
                  {episodes.slice(page * 24, page * 24 + 24).map((e) => {
                    const p = tv.prefs.progress[`series:${id}:${e.id}`],
                      ratio =
                        p && p.duration > 0
                          ? Math.min(1, p.position / p.duration)
                          : 0;
                    return (
                      <button
                        className={`tv-episode ${ratio >= 0.95 ? "is-watched" : ""}`}
                        key={e.id}
                        onClick={() => play(e, ratio >= 0.95 ? 0 : undefined)}
                      >
                        <div>
                          {e.thumb ? (
                            <img src={e.thumb} alt="" loading="lazy" />
                          ) : (
                            <span className="tv-episode-number">
                              {String(e.number).padStart(2, "0")}
                            </span>
                          )}
                          {ratio > 0 && (
                            <progress
                              aria-label={`Progresso de ${e.title}`}
                              value={ratio}
                              max={1}
                            />
                          )}
                        </div>
                        <strong>
                          {e.number} · {e.title}
                          {ratio >= 0.95 ? " ✓" : ""}
                        </strong>
                        {e.durationMin && <small>{e.durationMin} min</small>}
                        {e.plot && <p>{e.plot}</p>}
                      </button>
                    );
                  })}
                </div>
                {episodes.length > 24 && (
                  <div className="tv-pagination">
                    <button
                      disabled={!page}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Anteriores
                    </button>
                    <span>
                      {page + 1} / {Math.ceil(episodes.length / 24)}
                    </span>
                    <button
                      disabled={(page + 1) * 24 >= episodes.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Seguintes →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p>Sem episódios disponíveis nesta lista.</p>
            ))}
          {d.cast?.length > 0 && (
            <div className="tv-cast">
              <span className="tv-eyebrow">ELENCO</span>
              <p>{d.cast.join(" · ")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
