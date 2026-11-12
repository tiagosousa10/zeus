import { useMemo, useState, useEffect, useRef, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTV } from "./state";
import { tvAPI, tvKeys } from "./data";
import { normalizeSearch, searchVisible, sectionNames } from "./helpers";
import { Modal, EmptyState } from "./ui";
import type { Section, SearchEntry } from "./types";
const kinds = { l: "live", m: "movie", s: "series" } as const;
function Highlight({ name, term }: { name: string; term: string }) {
  const at = normalizeSearch(name).indexOf(normalizeSearch(term));
  return at < 0 || !term ? (
    <>{name}</>
  ) : (
    <>
      {name.slice(0, at)}
      <mark>{name.slice(at, at + term.length)}</mark>
      {name.slice(at + term.length)}
    </>
  );
}
export default function Search() {
  const tv = useTV(),
    [term, setTerm] = useState(""),
    [scope, setScope] = useState(tv.searchInFolder),
    [active, setActive] = useState(0),
    [page, setPage] = useState(0);
  const resultRoot = useRef<HTMLDivElement>(null),
    resultId = useId();
  const query = useQuery({
    queryKey: tvKeys.search(tv.listId, tv.visibility),
    queryFn: ({ signal }) => tvAPI.search(tv.listId, signal),
    enabled: !!tv.listId,
    staleTime: Infinity,
    retry: false,
  });
  const allowed = useMemo(
    () =>
      new Set(
        Object.entries(tv.summary?.sections || {}).flatMap(([s, data]) =>
          data.categories
            .filter((c) => !c.hidden)
            .map(
              (c) =>
                `${s === "live" ? "l" : s === "movie" ? "m" : "s"}:${c.name}`,
            ),
        ),
      ),
    [tv.summary],
  );
  const category = tv.summary?.sections[tv.section]?.categories.find(
    (c) => c.id === tv.categoryId,
  );
  const results = useMemo(
    () =>
      searchVisible(
        query.data || [],
        term,
        allowed,
        scope && category
          ? {
              k:
                tv.section === "live"
                  ? "l"
                  : tv.section === "movie"
                    ? "m"
                    : "s",
              name: category.name,
            }
          : undefined,
      ),
    [query.data, term, allowed, scope, category?.name, tv.section],
  );
  const ordered = useMemo(
    () =>
      (["l", "s", "m"] as const).flatMap((k) =>
        results.filter((r) => r.k === k),
      ),
    [results],
  );
  const counts = useMemo(() => {
    const counts = { l: 0, m: 0, s: 0 };
    for (const result of results) counts[result.k]++;
    return counts;
  }, [results]);
  const visible = ordered.slice(page * 90, (page + 1) * 90);
  const grouped = (["l", "s", "m"] as const).flatMap((k) =>
    visible.filter((r) => r.k === k),
  );
  useEffect(() => {
    resultRoot.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, page]);
  function choose(item: SearchEntry) {
    tv.closeModal();
    if (item.k === "l")
      tv.play({
        section: "live",
        id: item.id,
        title: item.n,
        categoryId: tv.summary?.sections.live?.categories.find(
          (c) => c.name === item.c,
        )?.id,
      });
    else tv.openDetail(kinds[item.k], item.id);
  }
  return (
    <Modal title="Procurar na TV" onClose={tv.closeModal} className="tv-search">
      <input
        autoFocus
        role="combobox"
        aria-controls={resultId}
        aria-expanded={true}
        aria-activedescendant={
          grouped[active] ? `${resultId}-${active}` : undefined
        }
        aria-label="Procurar canais, séries e filmes"
        placeholder="Canais, séries, filmes…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setActive(0);
          setPage(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  grouped.length - 1,
                  n + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter" && grouped[active]) choose(grouped[active]);
        }}
      />
      <div className="tv-toolbar">
        <button
          aria-pressed={!scope}
          onClick={() => {
            setScope(false);
            setActive(0);
            setPage(0);
          }}
        >
          Tudo
        </button>
        {category && (
          <button
            aria-pressed={scope}
            onClick={() => {
              setScope(true);
              setActive(0);
              setPage(0);
            }}
          >
            Só {category.name}
          </button>
        )}
        <small>↑ ↓ escolher · ↵ abrir · esc fechar</small>
      </div>
      <div ref={resultRoot} id={resultId} role="listbox">
        {query.isPending ? (
          <p role="status">A preparar a pesquisa…</p>
        ) : query.error ? (
          <EmptyState
            title="Não foi possível carregar a pesquisa"
            action={
              <button onClick={() => void query.refetch()}>
                Tentar de novo
              </button>
            }
          />
        ) : !results.length ? (
          <EmptyState title="Sem resultados" />
        ) : (
          (["l", "s", "m"] as const).map((k) => {
            const entries = visible.filter((r) => r.k === k);
            return entries.length ? (
              <section key={k}>
                <h3 className="tv-eyebrow">
                  {sectionNames[kinds[k] as Section]} · {counts[k]}
                </h3>
                {entries.map((item) => (
                  <button
                    className="tv-result"
                    role="option"
                    id={`${resultId}-${grouped.indexOf(item)}`}
                    aria-selected={grouped[active] === item}
                    aria-current={grouped[active] === item}
                    key={item.k + item.id}
                    onClick={() => choose(item)}
                  >
                    <span className="tv-result-icon">
                      {k === "l" ? "◉" : k === "m" ? "▷" : "▤"}
                    </span>
                    <span>
                      <strong>
                        <Highlight name={item.n} term={term} />
                      </strong>
                      <small>{item.c}</small>
                    </span>
                    <span>↗</span>
                  </button>
                ))}
              </section>
            ) : null;
          })
        )}
      </div>
      {results.length > 90 && (
        <div className="tv-pagination">
          <button
            disabled={!page}
            onClick={() => {
              setPage((p) => p - 1);
              setActive(0);
            }}
          >
            ← Anterior
          </button>
          <span>
            {page * 90 + 1}–{Math.min(results.length, (page + 1) * 90)} de{" "}
            {results.length} resultados
          </span>
          <button
            disabled={(page + 1) * 90 >= results.length}
            onClick={() => {
              setPage((p) => p + 1);
              setActive(0);
            }}
          >
            Seguinte →
          </button>
        </div>
      )}
    </Modal>
  );
}
