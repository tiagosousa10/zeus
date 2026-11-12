import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTV } from "../hooks/state";
import { tvAPI, tvKeys } from "../services/data";
import { EmptyState, Outline, Poster, Skeleton } from "../components/ui";
import {
  continueItems,
  recentItems,
  openWithTransition,
} from "../models/catalog-helpers";
import type { TVMovie, TVSeries, CategoryView } from "../models/types";
type Item = TVMovie | TVSeries;
export default function Catalog() {
  const tv = useTV();
  return tv.section === "live" ? null : (
    <CatalogView
      key={`${tv.listId}:${tv.section}:${tv.categoryId}:${tv.visibility}`}
      section={tv.section}
    />
  );
}
function CatalogView({ section }: { section: "movie" | "series" }) {
  const client = useQueryClient();
  const mounted = useRef(true);
  const intent = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const invalidateIntent = () => {
    intent.current++;
    pending.current?.abort();
    pending.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateIntent();
    };
  }, []);
  const tv = useTV(),
    [page, setPage] = useState(0);
  useEffect(() => {
    if (tv.target) invalidateIntent();
  }, [tv.target]);
  const categories =
    tv.summary?.sections[section]?.categories.filter((c) => !c.hidden) || [];
  const category =
    categories.find((c) => c.id === tv.categoryId) || categories[0];
  const query = useQuery({
    queryKey: tvKeys.page(
      tv.listId,
      section,
      category?.id || "",
      page,
      tv.visibility,
    ),
    queryFn: ({ signal }) =>
      tvAPI.page<Item>(tv.listId, section, category!.id, page, signal),
    enabled: !!category,
    retry: false,
  });
  const index = useQuery({
    queryKey: tvKeys.search(tv.listId, tv.visibility),
    queryFn: ({ signal }) => tvAPI.search(tv.listId, signal),
    enabled: Object.entries(tv.prefs.progress).some(
      ([key, p]) =>
        key.startsWith(`${section}:`) &&
        p.duration > 0 &&
        p.position > 0 &&
        p.position / p.duration < 0.95,
    ),
    staleTime: Infinity,
    retry: false,
  });
  const items = query.data?.items || [],
    recent = recentItems(items),
    hero = recent[0];
  const continuing = continueItems(
    index.data || [],
    tv.prefs.progress,
    section,
  ).slice(0, 12);
  const open = async (item: Item) => {
    const generation = ++intent.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const image = document.activeElement?.querySelector(
      "img",
    ) as HTMLImageElement | null;
    await client.prefetchQuery({
      queryKey: ["tv", tv.listId, "detail", section, item.id, tv.visibility],
      queryFn: ({ signal }) =>
        tvAPI.details(
          tv.listId,
          section,
          item.id,
          AbortSignal.any([signal, controller.signal]),
        ),
    });
    if (
      !mounted.current ||
      generation !== intent.current ||
      controller.signal.aborted
    )
      return;
    if (image) image.style.viewTransitionName = "tv-selected-art";
    openWithTransition(() => {
      if (generation === intent.current && !controller.signal.aborted)
        tv.navigate({ section, detailId: item.id, categoryId: tv.categoryId });
    });
  };
  const posters = (list: Item[]) =>
    list.map((item) => (
      <Poster
        key={item.id}
        src={item.poster}
        title={item.name}
        onClick={() => open(item)}
      />
    ));
  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    buttons[
      Math.max(
        0,
        Math.min(buttons.length - 1, at + (e.key === "ArrowRight" ? 1 : -1)),
      )
    ]?.focus();
  };
  if (!category)
    return (
      <EmptyState
        title={`Sem ${section === "movie" ? "filmes" : "séries"} disponíveis`}
        action={<button onClick={tv.openFolders}>Gerir pastas</button>}
      />
    );
  return (
    <section
      className={`tv-catalog tv-catalog-${section}`}
      onClickCapture={invalidateIntent}
    >
      {query.isPending ? (
        <Skeleton />
      ) : query.error ? (
        <EmptyState
          title="Não foi possível carregar esta pasta"
          action={
            <button onClick={() => void query.refetch()}>Tentar de novo</button>
          }
        />
      ) : !hero ? (
        <EmptyState title="Esta pasta está vazia" />
      ) : (
        <div className="tv-bento">
          <div
            className="tv-bento-hero"
            style={
              hero.poster
                ? {
                    backgroundImage: `linear-gradient(0deg,#04070af5,transparent 75%),url(${JSON.stringify(hero.poster)})`,
                  }
                : undefined
            }
          >
            <div>
              <span className="tv-eyebrow">DESCOBRIR · {category.name}</span>
              <h1>{hero.name}</h1>
              <Metadata item={hero} />
              <div className="tv-toolbar">
                <button
                  className="tv-primary"
                  onClick={() =>
                    section === "series"
                      ? open(hero)
                      : tv.play({
                          section,
                          id: hero.id,
                          title: hero.name,
                          categoryId: hero.categoryId,
                        })
                  }
                >
                  {section === "series" ? "Episódios ↗" : "▶ Reproduzir"}
                </button>
                <button onClick={() => open(hero)}>Detalhes</button>
              </div>
            </div>
          </div>
          {recent.slice(1, 4).map((item, i) => (
            <button
              key={item.id}
              className={`tv-bento-art tv-bento-art-${i}`}
              onClick={() => open(item)}
            >
              {item.poster && <img src={item.poster} alt="" />}
              <strong>{item.name}</strong>
            </button>
          ))}
          {categories.slice(0, 2).map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              onClick={() => tv.setCategory(c.id)}
            />
          ))}
        </div>
      )}
      <div className="tv-catalog-categories tv-toolbar">
        <button
          aria-pressed={!tv.categoryId}
          onClick={() => tv.setCategory(undefined)}
        >
          Descobrir · {tv.summary?.sections[section]?.total}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            aria-pressed={tv.categoryId === c.id}
            onClick={() => tv.setCategory(c.id)}
          >
            {c.name} <span>{c.count}</span>
          </button>
        ))}
        <button onClick={tv.openFolders}>Gerir pastas</button>
      </div>
      {continuing.length > 0 && (
        <section className="tv-catalog-row">
          <h2>Continuar a ver</h2>
          <div className="tv-continue-row" onKeyDown={keyboard}>
            {continuing.map((c) => (
              <button
                key={c.key}
                onClick={() =>
                  tv.play({
                    section,
                    id: c.entry.id,
                    episodeId: c.episodeId,
                    title: c.entry.n,
                    start: c.progress.position,
                  })
                }
              >
                <span className="tv-eyebrow">{c.entry.c}</span>
                <strong>{c.entry.n}</strong>
                {c.episodeId && <small>Episódio em curso</small>}
                <progress
                  aria-label={`Progresso de ${c.entry.n}`}
                  max={c.progress.duration}
                  value={c.progress.position}
                />
                <small>
                  {Math.floor(c.progress.position / 60)} de{" "}
                  {Math.ceil(c.progress.duration / 60)} min
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      {section === "series" && recent.length > 0 && (
        <section className="tv-top10">
          <h2>
            {Math.min(10, recent.length)} sugestões · {category.name}
          </h2>
          <p>Na tua lista · {category.name}</p>
          <div onKeyDown={keyboard}>
            {recent.slice(0, 10).map((item, i) => (
              <div className="tv-ranked" key={item.id}>
                <Outline>{i + 1}</Outline>
                <Poster
                  src={item.poster}
                  title={item.name}
                  onClick={() => open(item)}
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {items.length > 0 && (
        <section className="tv-catalog-row">
          <h2>
            {tv.categoryId ? category.name : "Da tua lista"}{" "}
            <small>· {category.name}</small>
          </h2>
          <div className="tv-poster-grid" onKeyDown={keyboard}>
            {posters(tv.categoryId ? items : recent)}
          </div>
          <div className="tv-pagination">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Anterior
            </button>
            <span>
              Página {page + 1} de{" "}
              {Math.max(1, Math.ceil((query.data?.total || 0) / 48))}
            </span>
            <button
              disabled={(page + 1) * 48 >= (query.data?.total || 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte →
            </button>
          </div>
        </section>
      )}
      {!tv.categoryId &&
        categories
          .filter((c) => c.pinned && c.id !== category.id)
          .slice(0, 4)
          .map((c) => <PinnedRow key={c.id} section={section} category={c} />)}
    </section>
  );
}
function Metadata({ item }: { item: Item }) {
  return (
    <p className="tv-content-meta">
      {[item.year, item.rating !== undefined ? `★ ${item.rating}` : undefined]
        .filter((x) => x !== undefined)
        .join(" · ")}
    </p>
  );
}
function CategoryCard({
  category,
  onClick,
}: {
  category: CategoryView;
  onClick: () => void;
}) {
  return (
    <button className="tv-bento-category" onClick={onClick}>
      <span className="tv-eyebrow">PASTA</span>
      <Outline>{category.count}</Outline>
      <strong>{category.name}</strong>
    </button>
  );
}
function PinnedRow({
  section,
  category,
}: {
  section: "movie" | "series";
  category: CategoryView;
}) {
  const tv = useTV();
  const q = useQuery({
    queryKey: tvKeys.page(tv.listId, section, category.id, 0, tv.visibility),
    queryFn: ({ signal }) =>
      tvAPI.page<Item>(tv.listId, section, category.id, 0, signal),
    retry: false,
  });
  return (
    <section className="tv-catalog-row">
      <div className="tv-section-heading">
        <h2>{category.name}</h2>
        <button onClick={() => tv.setCategory(category.id)}>Ver pasta →</button>
      </div>
      {q.isPending ? (
        <Skeleton />
      ) : q.error ? (
        <button onClick={() => void q.refetch()}>
          Tentar carregar {category.name}
        </button>
      ) : (
        <div className="tv-poster-grid">
          {q.data?.items.slice(0, 6).map((item) => (
            <Poster
              key={item.id}
              src={item.poster}
              title={item.name}
              onClick={() =>
                openWithTransition(() => tv.openDetail(section, item.id))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
