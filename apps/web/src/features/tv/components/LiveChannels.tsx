import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTV } from "../hooks/state";
import { tvAPI, tvKeys } from "../services/data";
import type { CategoryView, TVChannel } from "../models/types";
import type { LiveLayout } from "../models/live-layout";
import { ChannelCard, EmptyState, Skeleton } from "./ui";
export function LiveChannels({
  category,
  layout,
}: {
  category: CategoryView;
  layout: LiveLayout;
}) {
  const tv = useTV();
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState("Todos");
  const query = useQuery({
    queryKey: tvKeys.page(
      tv.listId,
      "live",
      category.id,
      page,
      tv.visibility + "|" + filter,
    ),
    queryFn: ({ signal }) =>
      tvAPI.page<TVChannel>(tv.listId, "live", category.id, page, signal, {
        favorites: filter === "Favoritos",
        tag: filter !== "Todos" && filter !== "Favoritos" ? filter : undefined,
      }),
    retry: false,
  });
  const epg = useQuery({
    queryKey: ["tv", tv.listId, "now", category.id, tv.visibility],
    queryFn: ({ signal }) => tvAPI.now(tv.listId, category.id, signal),
    retry: false,
    refetchInterval: 60000,
  });
  const items = query.data?.items || [],
    tags = query.data?.tags || [...new Set(items.flatMap((c) => c.tags))];
  return (
    <>
      {layout === "workspace" && (
        <div className="tv-workspace-category">
          <div>
            <span className="tv-eyebrow">AGORA EM DIRETO</span>
            <h2>{category.name}</h2>
          </div>
          <span>{query.data?.total ?? category.count} canais</span>
        </div>
      )}
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
            <button onClick={() => void query.refetch()}>Tentar de novo</button>
          }
        />
      ) : items.length ? (
        <div
          className={"tv-grid" + (layout === "cards" ? "" : " tv-grid--list")}
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
            const columns = getComputedStyle(
              e.currentTarget,
            ).gridTemplateColumns.split(" ").length;
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
          {items.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              layout={layout === "cards" ? "card" : "row"}
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
  );
}
