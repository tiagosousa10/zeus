import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { listPath } from "./data";
import { useTV } from "./state";
import { EmptyState, Modal, Skeleton } from "./ui";
import type { Programme } from "./types";
import {
  civilDate,
  localDayKey as dayKey,
  shiftLocalDay,
  localDayBounds,
  guideWindows,
  mergeGuideWindows,
  type GuideGrid as Grid,
} from "./guide-helpers";
const time = (n: number) =>
  new Date(n).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
export default function Guide() {
  const tv = useTV(),
    [day, setDay] = useState(dayKey(Date.now())),
    [category, setCategory] = useState(tv.categoryId ?? ""),
    [favorites, setFavorites] = useState(false),
    [page, setPage] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [info, setInfo] = useState<Programme | null>(null),
    scroll = useRef<HTMLDivElement>(null);
  const { from, to } = localDayBounds(day);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hours = (to - from) / 3600000;
  const [nowRequest, setNowRequest] = useState(0);
  const q = useQuery({
    queryKey: [
      "tv",
      tv.listId,
      "guide",
      tv.visibility,
      day,
      timezone,
      category,
      favorites,
      page,
      tv.prefs.favorites.live.join(","),
    ],
    queryFn: async ({ signal }) =>
      mergeGuideWindows(
        await Promise.all(
          guideWindows(from, to).map((window) =>
            api<Grid>(
              listPath(tv.listId) +
                "/epg/grid?" +
                new URLSearchParams({
                  from: String(window.from),
                  to: String(window.to),
                  timezone,
                  page: String(page),
                  size: "40",
                  ...(category ? { category } : {}),
                  favorites: favorites ? "1" : "0",
                }),
              { signal },
            ),
          ),
        ),
      ),
  });
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const goNow = () => {
    setDay(dayKey(Date.now()));
    setClock(Date.now());
    setNowRequest((n) => n + 1);
  };
  // Runs after an uncached grid replaces its skeleton, and after Agora changes the date.
  useEffect(() => {
    if (!q.data || day !== dayKey(Date.now())) return;
    scroll.current?.scrollTo({
      left: Math.max(
        0,
        ((Date.now() - from) / (to - from)) * hours * 240 - 200,
      ),
      behavior: "instant",
    });
  }, [day, from, to, hours, q.data, nowRequest]);
  const navigationAnchor = useRef<{
    element: HTMLButtonElement;
    time: number;
  } | null>(null);
  const moveProgramme = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const current = event.currentTarget;
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const time =
      navigationAnchor.current?.element === current
        ? navigationAnchor.current.time
        : Number(current.dataset.start);
    const rows = Array.from(
      scroll.current?.querySelectorAll<HTMLElement>(".tv-guide-row") ?? [],
    );
    const row = current.closest<HTMLElement>(".tv-guide-row")!;
    const visible = (r: HTMLElement) =>
      Array.from(
        r.querySelectorAll<HTMLButtonElement>("button[data-start]"),
      ).filter((b) => b.offsetParent !== null);
    const buttons = visible(row);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      next =
        buttons[
          buttons.indexOf(current) + (event.key === "ArrowRight" ? 1 : -1)
        ];
    else {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      for (
        let index = rows.indexOf(row) + direction;
        index >= 0 && index < rows.length;
        index += direction
      ) {
        const candidates = visible(rows[index]);
        const distance = (b: HTMLButtonElement) =>
          time < Number(b.dataset.start)
            ? Number(b.dataset.start) - time
            : time >= Number(b.dataset.stop)
              ? time - Number(b.dataset.stop) + 1
              : 0;
        next = candidates.sort((a, b) => distance(a) - distance(b))[0];
        if (next) break;
      }
    }
    if (next)
      navigationAnchor.current = {
        element: next,
        time: horizontal ? Number(next.dataset.start) : time,
      };
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  };
  const today = dayKey(clock);
  const yesterday = shiftLocalDay(today, -1);
  const dates = [
    yesterday,
    today,
    ...(q.data?.availableDays ?? []).filter((d) => d > today),
  ].slice(0, 9);
  const play = (c: Grid["channels"][number], p: Programme) => {
    if (p.start <= clock && p.stop > clock)
      tv.play({
        section: "live",
        id: c.id,
        title: c.name,
        categoryId: c.categoryId,
      });
    else setInfo(p);
  };
  return (
    <section className="tv-guide">
      <h1>Guia</h1>
      <div className="tv-guide-filters">
        <div className="tv-toolbar">
          {dates.map((d) => (
            <button
              key={d}
              aria-pressed={day === d}
              onClick={() => {
                setDay(d);
                setPage(0);
              }}
            >
              {d === today
                ? "Hoje"
                : d === yesterday
                  ? "Ontem"
                  : civilDate(d).toLocaleDateString("pt-PT", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
            </button>
          ))}
        </div>
        <div className="tv-toolbar">
          <select
            aria-label="Pasta do guia"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as pastas</option>
            {tv.summary?.sections.live?.categories
              .filter((c) => !c.hidden)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button
            aria-pressed={favorites}
            onClick={() => {
              setFavorites((v) => !v);
              setPage(0);
            }}
          >
            ★ Só favoritos
          </button>
          <button onClick={goNow}>Agora</button>
        </div>
      </div>
      {q.isPending ? (
        <Skeleton />
      ) : q.error ? (
        <EmptyState
          title="Não foi possível carregar o guia"
          action={
            <button onClick={() => void q.refetch()}>Tentar de novo</button>
          }
        />
      ) : !q.data?.channels.length ? (
        <EmptyState title="Sem programação disponível">
          O fornecedor não disponibilizou programação para esta selecção.
        </EmptyState>
      ) : (
        <>
          <p className="tv-guide-date">
            Programação de {new Date(from).toLocaleDateString("pt-PT")} · Hora
            local
          </p>
          <div className="tv-guide-scroll" ref={scroll}>
            <div
              className="tv-guide-grid"
              style={
                {
                  "--guide-width": `${200 + hours * 240}px`,
                } as CSSProperties
              }
            >
              <div
                className="tv-guide-hours"
                style={{ gridTemplateColumns: `200px repeat(${hours}, 240px)` }}
              >
                <span />
                {Array.from({ length: hours }, (_, i) => (
                  <span key={i}>{time(from + i * 3600000)}</span>
                ))}
              </div>
              {q.data.channels.map((c) => (
                <div className="tv-guide-row" key={c.id}>
                  <button
                    className="tv-guide-channel"
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
                  <div
                    className="tv-guide-timeline"
                    style={{ width: hours * 240 }}
                  >
                    {c.programmes.map((p, i) => (
                      <button
                        key={`${p.start}:${i}`}
                        data-start={p.start}
                        data-stop={p.stop}
                        onKeyDown={moveProgramme}
                        className={
                          p.start <= clock && p.stop > clock ? "is-now" : ""
                        }
                        style={{
                          left: `${(Math.max(0, p.start - from) / (to - from)) * 100}%`,
                          width: `${((Math.min(to, p.stop) - Math.max(from, p.start)) / (to - from)) * 100}%`,
                        }}
                        onClick={() => play(c, p)}
                      >
                        <small>
                          {time(p.start)} – {time(p.stop)}
                        </small>
                        <strong>{p.title}</strong>
                        {p.start <= clock && p.stop > clock && (
                          <progress
                            value={clock - p.start}
                            max={p.stop - p.start}
                          />
                        )}
                      </button>
                    ))}
                    {clock >= from && clock < to && (
                      <span
                        className="tv-now-line"
                        style={{
                          left: `${((clock - from) / (to - from)) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                  <div className="tv-guide-mobile">
                    {(day === dayKey(clock)
                      ? c.programmes.filter((p) => p.stop > clock)
                      : c.programmes
                    )
                      .slice(0, 2)
                      .map((p) => (
                        <button
                          key={p.start}
                          data-start={p.start}
                          data-stop={p.stop}
                          onKeyDown={moveProgramme}
                          onClick={() => play(c, p)}
                        >
                          <small>
                            {time(p.start)} – {time(p.stop)}
                          </small>
                          <strong>{p.title}</strong>
                        </button>
                      ))}
                    {!c.programmes.length && <span>Sem programação</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="tv-toolbar">
            <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(q.data.total / 40))}
            </span>
            <button
              disabled={(page + 1) * 40 >= q.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte
            </button>
          </div>
        </>
      )}
      {info && (
        <Modal title={info.title} onClose={() => setInfo(null)}>
          <p>
            {new Date(info.start).toLocaleDateString("pt-PT")} ·{" "}
            {time(info.start)} – {time(info.stop)}
          </p>
          <p>
            {info.description ||
              "O fornecedor não disponibilizou uma descrição."}
          </p>
        </Modal>
      )}
    </section>
  );
}
