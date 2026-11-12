import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemberState } from "../../../shared/hooks/session";
import { catalog } from "../../cinema/services/catalog";
import { titleHref } from "../../cinema/models/media";
import {
  fold,
  matchScore,
  parseSearch,
} from "../../../shared/models/smart-search";
import { tvAPI } from "../../tv/services/data";
import { encodeView } from "../../tv/models/helpers";
import { Modal } from "../../tv/components/ui";
import { ZeusLoader } from "../../../shared/components/ZeusLoader";
import "./universal-search.css";
export function openUniversalSearch() {
  window.dispatchEvent(new Event("zeus:search"));
}
export function SearchHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("zeus:search", show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("zeus:search", show);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return open ? <UniversalSearch onClose={() => setOpen(false)} /> : null;
}
const examples = ["Mr Robot", "canais Portugal", "filmes ação 2024"];
export default function UniversalSearch({
  onClose,
  inline = false,
}: {
  onClose?: () => void;
  inline?: boolean;
}) {
  const {
    state,
    loading: memberLoading,
    error: memberError,
  } = useMemberState();
  const [value, setValue] = useState(
    inline ? new URLSearchParams(location.search).get("q") || "" : "",
  );
  const [term, setTerm] = useState(value),
    [scope, setScope] = useState<string>(),
    [kind, setKind] = useState<string>(),
    [year, setYear] = useState<string>(),
    [genre, setGenre] = useState<string>(),
    [limit, setLimit] = useState(60),
    [active, setActive] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(value);
      setLimit(60);
      setActive(0);
    }, 250);
    return () => clearTimeout(t);
  }, [value]);
  const intent = useMemo(
    () => ({
      ...parseSearch(term),
      ...(scope !== undefined ? { module: scope as "" | "tv" | "cinema" } : {}),
      ...(kind !== undefined
        ? { kind: kind as "" | "movie" | "series" | "live" }
        : {}),
      ...(year !== undefined ? { year } : {}),
      ...(genre !== undefined ? { genre } : {}),
    }),
    [term, scope, kind, year, genre],
  );
  useEffect(() => {
    setLimit(60);
    setActive(0);
  }, [scope, kind, year, genre]);
  useEffect(() => {
    if (!inline) return;
    const url = new URL(location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }, [term, inline]);
  const tv = useQuery({
    queryKey: [
      "universal-tv",
      state.iptv,
      state.iptv.map((l) => [
        state.tv?.[l.id]?.hidden,
        state.tv?.[l.id]?.shownAdult,
      ]),
    ],
    enabled: !memberLoading && !memberError && intent.module !== "cinema",
    staleTime: 300000,
    retry: false,
    queryFn: async ({ signal }) => {
      const lists = state.iptv;
      const output: {
        listId: string;
        listName: string;
        items: {
          id: string;
          n: string;
          c: string;
          k: "l" | "s" | "m";
          categoryId?: string;
        }[];
        error?: boolean;
      }[] = [];
      // Two lists at a time; never open any media connection while searching.
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, lists.length) }, async () => {
          while (cursor < lists.length) {
            const list = lists[cursor++];
            try {
              const [summary, index] = await Promise.all([
                tvAPI.summary(list.id, signal),
                tvAPI.search(list.id, signal),
              ]);
              const categories = new Map(
                Object.entries(summary.sections).flatMap(([s, v]) =>
                  v.categories
                    .filter((c) => !c.hidden)
                    .map((c) => [
                      `${s === "live" ? "l" : s === "series" ? "s" : "m"}:${c.name}`,
                      c.id,
                    ]),
                ),
              );
              output.push({
                listId: list.id,
                listName: list.name,
                items: index
                  .filter((i) => categories.has(i.k + ":" + i.c))
                  .map((i) => ({
                    ...i,
                    categoryId: categories.get(i.k + ":" + i.c),
                  })),
              });
            } catch (e) {
              if (signal.aborted) throw e;
              output.push({
                listId: list.id,
                listName: list.name,
                items: [],
                error: true,
              });
            }
          }
        }),
      );
      return output;
    },
  });
  const cinema = useInfiniteQuery({
    queryKey: ["universal-cinema", intent.text, intent.genre, intent.kind],
    enabled: intent.module !== "tv" && intent.kind !== "live",
    initialPageParam: 0,
    staleTime: 60000,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const kinds = (intent.kind ? [intent.kind] : ["movie", "series"]) as (
        "movie" | "series"
      )[];
      const pages = await Promise.allSettled(
        kinds.map((type) =>
          catalog(
            type,
            {
              search: intent.text || undefined,
              genre: intent.genre || undefined,
              skip: pageParam,
            },
            AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          ),
        ),
      );
      const items = pages.flatMap((p) =>
        p.status === "fulfilled" ? p.value : [],
      );
      const failed = pages.some((p) => p.status === "rejected");
      if (pages.every((p) => p.status === "rejected"))
        throw Error("O catálogo Cinema não respondeu.");
      return {
        items,
        failed,
        more: pages.some(
          (p) => p.status === "fulfilled" && p.value.length >= 50,
        ),
        offset: pageParam,
      };
    },
    getNextPageParam: (p) => (p.more ? p.offset + 50 : undefined),
  });
  type Result = {
    key: string;
    name: string;
    detail: string;
    module: "Cinema" | "TV";
    href: string;
    listId?: string;
    score: number;
    image?: string;
  };
  const results = useMemo(() => {
    const entries: Result[] = [];
    if (intent.module !== "cinema")
      for (const list of tv.data || [])
        for (const item of list.items) {
          const kind =
            item.k === "l" ? "live" : item.k === "m" ? "movie" : "series";
          if (intent.kind && intent.kind !== kind) continue;
          const score = matchScore(item.n, item.c, intent);
          if (!score) continue;
          const hash = encodeView({
            section: kind,
            categoryId: item.categoryId,
            ...(kind !== "live" ? { detailId: item.id } : {}),
          });
          entries.push({
            key: `tv:${list.listId}:${item.k}:${item.id}`,
            name: item.n,
            detail: `${kind === "live" ? "Canal" : kind === "movie" ? "Filme" : "Série"} · ${item.c} · ${list.listName}`,
            module: "TV",
            href: `/tv${hash}${kind === "live" ? `&play=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.n)}` : ""}`,
            listId: list.listId,
            score,
          });
        }
    const seen = new Set<string>();
    if (intent.module !== "tv" && intent.kind !== "live")
      for (const item of cinema.data?.pages.flatMap((p) => p.items) || []) {
        const key = `cinema:${item.type}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (intent.year && !item.releaseInfo?.includes(intent.year)) continue;
        if (
          intent.genre &&
          item.genres?.length &&
          !item.genres.includes(intent.genre)
        )
          continue;
        entries.push({
          key,
          name: item.name,
          detail: `${item.type === "series" ? "Série" : "Filme"} · ${item.releaseInfo || "Cinema"}${item.genres?.length ? " · " + item.genres.slice(0, 2).join(", ") : ""}`,
          module: "Cinema",
          href: titleHref(item),
          image: item.poster,
          score: fold(item.name) === intent.text ? 100 : 80,
        });
      }
    return entries.sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt"),
    );
  }, [tv.data, cinema.data, intent]);
  useEffect(() => {
    resultsRef.current
      ?.querySelector(`[data-result-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const shown = results.slice(0, limit),
    busy =
      (tv.isFetching && intent.module !== "cinema") ||
      (cinema.isFetching && intent.module !== "tv" && intent.kind !== "live");
  const body = (
    <div className="universal-search">
      <div className="universal-search-heading">
        <span>O TEU UNIVERSO, NUMA PESQUISA</span>
        <p>Cinema, canais e as tuas listas IPTV.</p>
      </div>
      <label className="universal-field">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          autoFocus
          value={value}
          aria-label="Pesquisar em Cinema e TV"
          placeholder="Um título, um canal, uma descoberta…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((v) =>
                Math.max(
                  0,
                  Math.min(
                    shown.length - 1,
                    v + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter")
              resultsRef.current
                ?.querySelector<HTMLAnchorElement>(
                  `[data-result-index="${active}"]`,
                )
                ?.click();
          }}
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="universal-filters">
        <div role="group" aria-label="Módulo de pesquisa">
          {[
            ["", "Tudo"],
            ["cinema", "Cinema"],
            ["tv", "TV"],
          ].map(([v, n]) => (
            <button
              key={v}
              aria-pressed={intent.module === v}
              onClick={() => setScope(v)}
            >
              {n}
            </button>
          ))}
        </div>
        <label>
          Tipo
          <select
            aria-label="Tipo de conteúdo"
            value={intent.kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="movie">Filmes</option>
            <option value="series">Séries</option>
            <option value="live">Canais</option>
          </select>
        </label>
        <label>
          Género
          <select
            aria-label="Género"
            value={intent.genre}
            onChange={(e) => setGenre(e.target.value)}
          >
            <option value="">Todos</option>
            {[
              ["Action", "Ação"],
              ["Adventure", "Aventura"],
              ["Comedy", "Comédia"],
              ["Drama", "Drama"],
              ["Documentary", "Documentário"],
              ["Sci-Fi", "Ficção científica"],
              ["Thriller", "Thriller"],
              ["Horror", "Terror"],
              ["Animation", "Animação"],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ano
          <select
            aria-label="Ano"
            value={intent.year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">Todos</option>
            {Array.from(
              { length: new Date().getFullYear() - 1950 + 1 },
              (_, i) => String(new Date().getFullYear() - i),
            ).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <button
          className="search-clear"
          onClick={() => {
            setValue("");
            setScope(undefined);
            setKind(undefined);
            setYear(undefined);
            setGenre(undefined);
          }}
        >
          Limpar
        </button>
      </div>
      {!term && (
        <div className="search-examples">
          {examples.map((q, i) => (
            <button
              key={q}
              onClick={() => {
                setValue(q);
                setScope(undefined);
                setKind(undefined);
                setYear(undefined);
                setGenre(undefined);
              }}
            >
              <span>0{i + 1}</span>
              {q}
              <span>↗</span>
            </button>
          ))}
        </div>
      )}
      {(busy || memberLoading) && (
        <ZeusLoader compact label="A procurar no teu universo…" />
      )}
      {(memberError ||
        tv.error ||
        tv.data?.some((l) => l.error) ||
        cinema.error ||
        cinema.data?.pages.some((p) => p.failed)) && (
        <div className="search-partial" role="status">
          Algumas fontes não responderam. Os resultados disponíveis continuam
          acessíveis.{" "}
          <button
            onClick={() => {
              void tv.refetch();
              void cinema.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div className="search-result-meta">
        <span>{results.length} resultados disponíveis</span>
        <small>↑ ↓ escolher · ↵ abrir · esc fechar</small>
      </div>
      <div className="universal-results" ref={resultsRef}>
        {shown.map((item, i) => (
          <a
            key={item.key}
            href={item.href}
            data-result-index={i}
            aria-current={active === i ? "true" : undefined}
            onFocus={() => setActive(i)}
            onClick={() => {
              if (item.listId)
                sessionStorage.setItem("zeus-tv-list", item.listId);
              onClose?.();
            }}
          >
            <span className="search-result-art">
              {item.image ? (
                <img src={item.image} alt="" loading="lazy" />
              ) : item.module === "TV" ? (
                "◉"
              ) : (
                "▷"
              )}
            </span>
            <span>
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className={`search-module ${item.module.toLowerCase()}`}>
              {item.module}
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
      {!busy && !memberLoading && !shown.length && (
        <p className="search-empty">
          Sem resultados. Experimenta um título, país ou outro filtro.
        </p>
      )}
      <div className="search-more">
        {limit < results.length && (
          <button onClick={() => setLimit((n) => n + 60)}>
            Mostrar mais · {results.length - limit}
          </button>
        )}
        {cinema.hasNextPage &&
          intent.module !== "tv" &&
          intent.kind !== "live" && (
            <button
              disabled={cinema.isFetchingNextPage}
              onClick={() => void cinema.fetchNextPage()}
            >
              {cinema.isFetchingNextPage
                ? "A carregar…"
                : "Mais resultados do Cinema"}
            </button>
          )}
      </div>
    </div>
  );
  return inline ? (
    body
  ) : (
    <Modal
      title="Pesquisar em Cinema e TV"
      onClose={onClose!}
      className="universal-search-modal"
    >
      {body}
    </Modal>
  );
}
