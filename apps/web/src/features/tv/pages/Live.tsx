import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTV } from "../hooks/state";
import { tvAPI, tvKeys } from "../services/data";
import type { TVChannel } from "../models/types";
import { ChannelCard, EmptyState, Outline, Skeleton } from "../components/ui";
export const countryStyle = (country?: string) =>
  ({
    "--aurora-a":
      (
        {
          PT: "14,91,51",
          BR: "15,90,55",
          ES: "104,43,23",
          FR: "23,52,102",
        } as Record<string, string>
      )[country || ""] || "19,69,83",
    "--aurora-b":
      (
        {
          PT: "117,35,29",
          BR: "102,87,24",
          ES: "107,69,25",
          FR: "96,37,45",
        } as Record<string, string>
      )[country || ""] || "37,43,83",
  }) as CSSProperties;
export default function Live() {
  const tv = useTV();
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState("Todos");
  const categories =
      tv.summary?.sections.live?.categories.filter((c) => !c.hidden) || [],
    category = categories.find((c) => c.id === tv.categoryId);
  useEffect(() => {
    setPage(0);
    setFilter("Todos");
  }, [tv.categoryId, tv.listId]);
  const query = useQuery({
    queryKey: tvKeys.page(
      tv.listId,
      "live",
      category?.id || "",
      page,
      tv.visibility + "|" + filter,
    ),
    queryFn: ({ signal }) =>
      tvAPI.page<TVChannel>(tv.listId, "live", category!.id, page, signal, {
        favorites: filter === "Favoritos",
        tag: filter !== "Todos" && filter !== "Favoritos" ? filter : undefined,
      }),
    enabled: !!category,
    retry: false,
  });
  const epg = useQuery({
    queryKey: ["tv", tv.listId, "now", category?.id, tv.visibility],
    queryFn: ({ signal }) => tvAPI.now(tv.listId, category!.id, signal),
    enabled: !!category,
    retry: false,
    refetchInterval: 60000,
  });
  const items = query.data?.items || [],
    tags = query.data?.tags || [...new Set(items.flatMap((c) => c.tags))];
  const shown = items;
  return (
    <section style={countryStyle(category?.country)} className="tv-live">
      <div className="tv-aurora" />
      {category ? (
        <>
          <button className="tv-back" onClick={() => tv.setCategory()}>
            ← Portais
          </button>
          <div className="tv-title-row">
            <h1>{category.name}</h1>
            <Outline>{query.data?.total ?? category.count}</Outline>
          </div>
          <div className="tv-toolbar">
            <button onClick={() => tv.openSearch(true)}>
              ⌕ Procurar em {category.name}
            </button>
            {["Todos", "Favoritos", ...tags].map((tag) => (
              <button
                key={tag}
                aria-pressed={filter === tag}
                onClick={() => {
                  setFilter(tag);
                  setPage(0);
                }}
              >
                {tag === "Favoritos" ? "★ " : ""}
                {tag}
              </button>
            ))}
            <button onClick={tv.openFolders}>⚙ Pastas</button>
          </div>
          {query.isPending ? (
            <Skeleton />
          ) : query.error ? (
            <EmptyState
              title="Não foi possível carregar os canais"
              action={
                <button onClick={() => void query.refetch()}>
                  Tentar de novo
                </button>
              }
            />
          ) : shown.length ? (
            <div
              className="tv-grid"
              data-tv-arrow-grid
              onKeyDown={(e) => {
                if (
                  !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(
                    e.key,
                  )
                )
                  return;
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    ".tv-channel-main",
                  ),
                );
                const current = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                if (current < 0) return;
                e.preventDefault();
                const columns =
                  innerWidth < 600 ? 1 : innerWidth < 1000 ? 2 : 4;
                buttons[
                  Math.max(
                    0,
                    Math.min(
                      buttons.length - 1,
                      current +
                        ({
                          ArrowRight: 1,
                          ArrowLeft: -1,
                          ArrowDown: columns,
                          ArrowUp: -columns,
                        }[e.key] || 0),
                    ),
                  )
                ]?.focus();
              }}
            >
              {shown.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  {...epg.data?.[channel.id]}
                  favorite={tv.prefs.favorites.live.includes(channel.id)}
                  onPlay={() =>
                    tv.play({
                      section: "live",
                      id: channel.id,
                      title: channel.name,
                      categoryId: category.id,
                    })
                  }
                  onFavorite={() =>
                    void tv
                      .updatePrefs((p) => ({
                        ...p,
                        favorites: {
                          ...p.favorites,
                          live: p.favorites.live.includes(channel.id)
                            ? p.favorites.live.filter((id) => id !== channel.id)
                            : [...p.favorites.live, channel.id],
                        },
                      }))
                      .catch(() => {})
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Sem canais neste filtro" />
          )}
          {epg.error && (
            <p role="alert">
              Não foi possível carregar o guia.{" "}
              <button onClick={() => void epg.refetch()}>Tentar de novo</button>
            </p>
          )}
          <div className="tv-pagination">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Anterior
            </button>
            <span>
              Página {page + 1} de{" "}
              {Math.max(1, Math.ceil((query.data?.total || 0) / 48))}
            </span>
            <button
              disabled={!query.data || (page + 1) * 48 >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="tv-hero">
            <img src="/art/img/zeus-6.webp" alt="" />
            <div>
              <span className="tv-eyebrow">OS TEUS PORTAIS · EM DIRECTO</span>
              <h1>
                O mundo.
                <br />À tua porta.
              </h1>
              <p>
                {tv.summary?.sections.live?.total.toLocaleString("pt-PT") || 0}{" "}
                canais · {categories.length} pastas
              </p>
              <button onClick={tv.openFolders}>Gerir pastas</button>
            </div>
          </div>
          <div className="tv-section-heading">
            <h2>Escolhe o teu portal</h2>
            <span>As pastas da tua lista</span>
          </div>
          <div className="tv-portals">
            {categories.map((c, i) => (
              <button
                className={"tv-portal " + (c.pinned ? "is-pinned" : "")}
                style={countryStyle(c.country)}
                key={c.id}
                onClick={() => tv.setCategory(c.id)}
              >
                <span className="tv-eyebrow">
                  {c.pinned
                    ? "★ FIXADA"
                    : `PORTAL ${String(i + 1).padStart(2, "0")}`}
                </span>
                <span className="tv-category-emblem" aria-hidden="true">
                  {c.logo ? (
                    <img
                      src={c.logo}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : c.country && /^[A-Z]{2}$/.test(c.country) ? (
                    [...c.country]
                      .map((x) =>
                        String.fromCodePoint(127397 + x.charCodeAt(0)),
                      )
                      .join("")
                  ) : /sport|desporto/i.test(c.name) ? (
                    "◉"
                  ) : /infantil|kids/i.test(c.name) ? (
                    "✦"
                  ) : /music/i.test(c.name) ? (
                    "♫"
                  ) : (
                    "✧"
                  )}
                </span>
                <h2>{c.name}</h2>
                <Outline>{c.count}</Outline>
                <small>canais · Entrar ↗</small>
              </button>
            ))}
          </div>
          {!categories.length && (
            <EmptyState
              title="Sem pastas visíveis"
              action={<button onClick={tv.openFolders}>Gerir pastas</button>}
            />
          )}
        </>
      )}
    </section>
  );
}
