import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Page } from "../components/Layout";
import { catalog, poster, titleHref, type MediaType } from "../lib/catalog";
import "./cinema.css";
import "./cinema-reference.css";
const types = [
  ["tudo", "Tudo"],
  ["movie", "Filmes"],
  ["series", "Séries"],
];
const genres = [
  ["", "Todos"],
  ["Action", "Acção"],
  ["Adventure", "Aventura"],
  ["Animation", "Animação"],
  ["Comedy", "Comédia"],
  ["Crime", "Crime"],
  ["Documentary", "Documentário"],
  ["Drama", "Drama"],
  ["Family", "Família"],
  ["Fantasy", "Fantasia"],
  ["Sci-Fi", "Ficção científica"],
  ["Horror", "Terror"],
  ["Mystery", "Mistério"],
  ["Romance", "Romance"],
  ["Thriller", "Thriller"],
  ["War", "Guerra"],
  ["History", "História"],
  ["Western", "Western"],
];
const years: [string, string, number, number][] = [
  ["", "Todos", 0, 9999],
  ["2026", "2026", 2026, 2026],
  ["2025", "2025", 2025, 2025],
  ["2020", "2020 a 2024", 2020, 2024],
  ["2010", "2010 a 2019", 2010, 2019],
  ["2000", "2000 a 2009", 2000, 2009],
  ["antes", "Antes de 2000", 0, 1999],
];
export default function Explore() {
  const initial = new URLSearchParams(location.search);
  const [search, setSearch] = useState(initial.get("q") ?? "");
  const [term, setTerm] = useState(search);
  const [type, setType] = useState(
    types.some(([key]) => key === initial.get("tipo"))
      ? initial.get("tipo")!
      : "tudo",
  );
  const [genre, setGenre] = useState(initial.get("genero") ?? "");
  const [year, setYear] = useState(initial.get("ano") ?? "");
  const input = useRef<HTMLInputElement>(null);
  const wakeCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = wakeCanvas.current!,
      field = input.current!,
      cx = canvas.getContext("2d")!;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const ripples: { x: number; y: number; t: number }[] = [];
    const fit = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();
    const draw = (now: number) => {
      cx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i],
          k = (now - p.t) / 1800;
        if (k >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        for (const [lag, a] of [
          [0, 0.5],
          [0.16, 0.28],
        ]) {
          const kk = Math.max(0, k - lag),
            rx = 12 + kk * 220;
          cx.beginPath();
          cx.ellipse(p.x, p.y + kk * 14, rx, rx * 0.16, 0, 0, Math.PI * 2);
          cx.strokeStyle = `rgba(255,214,150,${a * (1 - kk) ** 2})`;
          cx.lineWidth = 1.4 - kk;
          cx.stroke();
        }
      }
      raf = ripples.length ? requestAnimationFrame(draw) : 0;
    };
    const wake = () => {
      const r = field.getBoundingClientRect(),
        c = canvas.getBoundingClientRect();
      cx.font = `${getComputedStyle(field).fontSize} ${getComputedStyle(field).fontFamily}`;
      ripples.push({
        x:
          Math.min(r.right - 8, r.left + cx.measureText(field.value).width) -
          c.left,
        y: field.parentElement!.getBoundingClientRect().bottom - c.top + 10,
        t: performance.now(),
      });
      if (ripples.length > 14) ripples.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    };
    field.addEventListener("input", wake);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      field.removeEventListener("input", wake);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const url = new URL(location.pathname, location.origin);
    for (const [key, value] of [
      ["q", term],
      ["tipo", type === "tudo" ? "" : type],
      ["genero", genre],
      ["ano", year],
    ])
      if (value) url.searchParams.set(key, value);
    history.replaceState(null, "", url);
  }, [term, type, genre, year]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const result = useQuery({
    queryKey: ["explore", type, genre, term, year],
    queryFn: async ({ signal }) => {
      const kinds: MediaType[] =
        type === "tudo" ? ["movie", "series"] : [type as MediaType];
      const range = years.find(([key]) => key === year) ?? years[0];
      const lists = await Promise.all(
        kinds.map(async (kind) => {
          const pages = await Promise.all(
            (year && !term ? [0, 50, 100] : [0]).map((skip) =>
              catalog(
                kind,
                { search: term || undefined, genre: genre || undefined, skip },
                signal,
              ),
            ),
          );
          return pages.flat().filter((item) => {
            const date = parseInt(item.releaseInfo ?? "0");
            return (
              (!year || (date >= range[2] && date <= range[3])) &&
              (!genre || !term || item.genres?.includes(genre))
            );
          });
        }),
      );
      const seen = new Set<string>();
      return Array.from(
        { length: Math.max(0, ...lists.map((l) => l.length)) },
        (_, i) => lists.flatMap((l) => (l[i] ? [l[i]] : [])),
      )
        .flat()
        .filter((item) => !seen.has(item.id) && !!seen.add(item.id));
    },
    staleTime: 60000,
  });
  const clear = () => {
    setSearch("");
    setGenre("");
    setYear("");
    setType("tudo");
  };
  return (
    <Page className="explore-page">
      <section
        className={`sea ${term || genre || year || type !== "tudo" ? "is-sailing" : ""}`}
        aria-labelledby="ex-title"
      >
        <div className="sea__art" aria-hidden="true">
          <img
            src="/art/img/ulisses.webp"
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <canvas className="sea__wake" ref={wakeCanvas} aria-hidden="true" />
        <div className="sea__deck">
          <div className="sea__head">
            <h1 className="z-t1" id="ex-title">
              Explorar
            </h1>
            <p className="z-lede">
              Procura um título ou deixa os filtros escolherem a rota.
            </p>
          </div>
          <form
            className="voyage"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setTerm(search.trim());
            }}
          >
            <label className="z-search">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                ref={input}
                autoFocus={matchMedia("(min-width: 761px)").matches}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filmes e séries"
                aria-label="Pesquisar filmes e séries"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              <kbd aria-hidden="true">/</kbd>
            </label>
          </form>
          <div className="ex-filters">
            {[
              ["Tipo", types, type, setType],
              ["Género", genres, genre, setGenre],
              ["Ano", years, year, setYear],
            ].map(([label, options, value, setter]) => (
              <div className="ex-filter-row" key={String(label)}>
                <span className="z-label" id={`f-${label}`}>
                  {String(label)}
                </span>
                <div
                  className="ex-chips"
                  role="group"
                  aria-labelledby={`f-${label}`}
                >
                  {(options as string[][]).map(([key, name]) => (
                    <button
                      className="z-chip"
                      key={key}
                      aria-pressed={value === key}
                      onClick={(e) => {
                        (setter as (s: string) => void)(key);
                        e.currentTarget.scrollIntoView({
                          inline: "nearest",
                          block: "nearest",
                        });
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="ex-results" aria-labelledby="ex-status">
        <p className="ex-status" id="ex-status" aria-live="polite">
          {result.isFetching ? (
            "A navegar pelo catálogo…"
          ) : result.isError ? (
            "O catálogo não respondeu."
          ) : (
            <>
              {!term && !genre && !year && type === "tudo" ? (
                "Títulos populares"
              ) : (
                <>
                  <b>{result.data?.length ?? 0}</b> títulos
                  {term ? ` para «${term}»` : " encontrados"}
                </>
              )}
            </>
          )}
        </p>
        <ul className="ex-grid" aria-busy={result.isFetching}>
          {result.data?.map((item) => (
            <li key={item.id}>
              <a className="z-card" href={titleHref(item)}>
                <span className="z-card__art">
                  <img
                    src={poster(item)}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.opacity = "0")}
                  />
                  <span className="z-card__fallback">{item.name}</span>
                </span>
                <span className="z-card__cap">
                  {item.name}
                  <small>
                    {[
                      item.releaseInfo,
                      item.type === "series" ? "Série" : "Filme",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {(result.isError || result.data?.length === 0) && (
          <div className="icarus">
            <div className="icarus__art" aria-hidden="true">
              <img src="/art/img/icaro-thumb.webp" alt="" />
            </div>
            <h2 className="z-t2">
              {result.isError
                ? "O vento não está a favor"
                : "Voaste perto demais do sol"}
            </h2>
            <p>
              {result.isError
                ? result.error.message
                : `Não encontrámos títulos${term ? ` para «${term}»` : " com estes filtros"}. Experimenta outra rota.`}
            </p>
            <div className="acts">
              <button
                className="z-btn z-btn--primary"
                onClick={result.isError ? () => result.refetch() : clear}
              >
                {result.isError ? "Tentar novamente" : "Limpar filtros"}
              </button>
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}
