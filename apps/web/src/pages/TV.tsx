import { useEffect, useRef, useState, type CSSProperties } from "react";
import Hls from "hls.js";
import { Nav } from "../components/Layout";
import { TVArt } from "../components/TVArt";
import { useMemberState } from "../lib/session";
import { api } from "../lib/api";
import {
  parseM3U,
  parseXMLTV,
  type Channel,
  type IPTVList,
  type Programme,
} from "../lib/iptv";
import "./tv.css";
export default function TV() {
  const { state, save, loading, error: stateError } = useMemberState();
  const lists = state.iptv as IPTVList[];
  const [listId, setListId] = useState(""),
    [channels, setChannels] = useState<Channel[]>([]),
    [programmes, setProgrammes] = useState<Programme[]>([]),
    [query, setQuery] = useState(
      new URLSearchParams(location.search).get("q") || "",
    ),
    [selected, setSelected] = useState<Channel | null>(null),
    [view, setView] = useState(location.hash.slice(1) || "directo"),
    [preview, setPreview] = useState<Channel | null>(null),
    [day, setDay] = useState(0),
    [programme, setProgramme] = useState<Programme | null>(null),
    [kind, setKind] = useState("xtream"),
    [reveal, setReveal] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(false),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(0),
    [playError, setPlayError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const epgRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    id: string;
    y: number;
    delta: number;
    index: number;
    row: HTMLLIElement;
  } | null>(null);
  const digits = useRef({ value: "", timer: 0 });
  const video = useRef<HTMLVideoElement>(null);
  const selectedList = lists.find((l) => l.id === listId) || lists[0];
  const [now, setNow] = useState(Date.now());
  const [narrow, setNarrow] = useState(innerWidth < 760);
  useEffect(() => {
    const m = matchMedia("(max-width:759px)");
    const change = () => setNarrow(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setChannels([]);
    setProgrammes([]);
    setError("");
    if (!selectedList) return;
    setBusy(true);
    fetch(`/api/iptv/resource?listId=${encodeURIComponent(selectedList.id)}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        let result: Channel[];
        if (selectedList.type === "m3u")
          result = parseM3U(text, selectedList.url);
        else {
          const data = JSON.parse(text);
          if (!Array.isArray(data))
            throw new Error(
              "O fornecedor não devolveu uma lista de Canais. Confirma as credenciais.",
            );
          result = data.map((c) => ({
            id: String(c.stream_id),
            name: c.name,
            group: String(c.category_id || "Todos"),
            logo: c.stream_icon,
            epgId: c.epg_channel_id,
            url: new URL(
              `/live/${encodeURIComponent(selectedList.username || "")}/${encodeURIComponent(selectedList.password || "")}/${c.stream_id}.m3u8`,
              selectedList.url,
            ).href,
          }));
        }
        setChannels(result);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setBusy(false));
    if (selectedList.epgUrl)
      fetch(
        `/api/iptv/resource?listId=${encodeURIComponent(selectedList.id)}&kind=epg`,
        { credentials: "include" },
      )
        .then(async (r) => {
          if (!r.ok) throw new Error("Não foi possível carregar o guia.");
          return r.text();
        })
        .then((t) => {
          if (!cancelled) setProgrammes(parseXMLTV(t));
        })
        .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selectedList?.id, revision]);
  useEffect(() => {
    const el = video.current;
    if (!el || !selected) return;
    setPlayError("");
    let hls: Hls | undefined;
    let cancelled = false;
    const play = () =>
      el.play().catch(() => {
        if (!cancelled)
          setPlayError("Carrega em Reproduzir para iniciar a emissão.");
      });
    if (/\.m3u8(?:\?|$)/i.test(selected.url) && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(selected.url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal)
          setPlayError(
            "A emissão não está disponível ou o fornecedor bloqueou o acesso. Tenta outro Canal.",
          );
      });
    } else {
      el.src = selected.url;
      void play();
    }
    return () => {
      cancelled = true;
      hls?.destroy();
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [selected]);
  const favorites: string[] = state.preferences.favoriteChannels || [];
  const current = (c: Channel) =>
    programmes.find(
      (p) => p.channel === c.epgId && p.start <= now && p.stop > now,
    );
  const hiddenGroups: string[] = state.preferences.hiddenChannelGroups || [];
  const visible = channels
    .filter(
      (c) =>
        !hiddenGroups.includes(c.group) &&
        c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 250);
  async function toggle(c: Channel) {
    try {
      await save({
        preferences: {
          ...state.preferences,
          favoriteChannels: favorites.includes(c.id)
            ? favorites.filter((id) => id !== c.id)
            : [...favorites, c.id],
        },
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const data = new FormData(f);
    setSaving(true);
    setError("");
    try {
      const url = new URL(String(data.get("url")));
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Usa um endereço HTTP ou HTTPS.");
      if (!String(data.get("name") || "").trim())
        throw new Error("Dá um nome à lista.");
      const list: IPTVList = {
        id: crypto.randomUUID(),
        name: String(data.get("name")).trim(),
        type: String(data.get("type")) as IPTVList["type"],
        url: url.href,
        username: String(data.get("username") || ""),
        password: String(data.get("password") || ""),
        epgUrl: String(data.get("epg") || "").trim(),
      };
      if (list.type === "xtream" && (!list.username || !list.password))
        throw new Error("Preenche o utilizador e a password do fornecedor.");
      await save({ iptv: [...lists, list] });
      setListId(list.id);
      setForm(false);
      f.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const shownChannels = channels.filter((c) => !hiddenGroups.includes(c.group));
  const shown =
    preview && shownChannels.some((c) => c.id === preview.id)
      ? preview
      : shownChannels.find((c) => c.id === state.preferences.lastTVChannel) ||
        shownChannels[0];
  const next =
    shown && programmes.find((p) => p.channel === shown.epgId && p.start > now);
  const live = shown && current(shown);
  const groups = [...new Set(channels.map((c) => c.group))];
  const hm = (t: number) =>
    new Date(t).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const hue = (group: string) =>
    ({
      Desporto: 152,
      Notícias: 210,
      Filmes: 22,
      Séries: 268,
      Documentários: 96,
      Música: 318,
      Infantil: 44,
      Internacional: 186,
    })[group] || 200;
  const initials = (c: Channel) =>
    c.name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3);
  const mono = (c: Channel) => (
    <span
      className="mono"
      style={{ "--h": hue(c.group) } as CSSProperties}
      aria-hidden="true"
    >
      {c.logo ? <img src={c.logo} alt="" /> : initials(c)}
    </span>
  );
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  startDay.setDate(startDay.getDate() + day);
  const dayStart = startDay.getTime(),
    minuteWidth = narrow ? 3.2 : 5,
    channelWidth = narrow ? 104 : 210,
    dayWidth = 1440 * minuteWidth;
  const guideItems = programmes.filter(
    (p) =>
      visible.some((c) => c.epgId === p.channel) &&
      p.stop > dayStart &&
      p.start < dayStart + 86400000,
  );
  const focusedProgramme =
    programme && guideItems.includes(programme)
      ? programme
      : guideItems.find((p) => p.start <= now && p.stop > now) || guideItems[0];
  function guideKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(
      ".epg__b",
    );
    if (!target) return;
    const cells = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(".epg__b"),
    );
    const lane = cells.filter(
        (cell) => cell.dataset.channel === target.dataset.channel,
      ),
      index = lane.indexOf(target);
    let next: HTMLButtonElement | undefined;
    if (e.key === "ArrowRight") next = lane[index + 1];
    else if (e.key === "ArrowLeft") next = lane[index - 1];
    else if (e.key === "Home") next = e.ctrlKey ? cells[0] : lane[0];
    else if (e.key === "End") next = e.ctrlKey ? cells.at(-1) : lane.at(-1);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const channelIndex = visible.findIndex(
          (c) => c.epgId === target.dataset.channel,
        ),
        channel = visible[channelIndex + (e.key === "ArrowUp" ? -1 : 1)];
      const other = cells.filter(
          (cell) => cell.dataset.channel === channel?.epgId,
        ),
        time = Number(target.dataset.start);
      next =
        other.find(
          (cell) =>
            Number(cell.dataset.start) <= time &&
            Number(cell.dataset.stop) > time,
        ) ||
        other.sort(
          (a, b) =>
            Math.abs(Number(a.dataset.start) - time) -
            Math.abs(Number(b.dataset.start) - time),
        )[0];
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      setDay((d) =>
        Math.max(-1, Math.min(4, d + (e.key === "PageUp" ? -1 : 1))),
      );
      setProgramme(null);
      return;
    } else return;
    e.preventDefault();
    next?.focus();
    next?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  useEffect(() => {
    if (selected && hiddenGroups.includes(selected.group)) setSelected(null);
  }, [hiddenGroups.join("|"), selected]);
  const favChannels = favorites
    .map((id) => channels.find((c) => c.id === id))
    .filter((c): c is Channel => !!c);
  async function preferences(patch: Record<string, unknown>) {
    try {
      await save({ preferences: { ...state.preferences, ...patch } });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function show(tab: string) {
    setView(tab);
    history.replaceState(
      null,
      "",
      tab === "directo" ? location.pathname : `#${tab}`,
    );
    dispatchEvent(new HashChangeEvent("hashchange"));
  }
  function zap(c: Channel) {
    setPreview(c);
    if (selected) setSelected(c);
    void preferences({
      lastTVChannel: c.id,
      recentChannels: [
        c.id,
        ...(state.preferences.recentChannels || []).filter(
          (id: string) => id !== c.id,
        ),
      ].slice(0, 10),
    });
  }
  function step(direction: number) {
    if (!visible.length) return;
    const i = visible.findIndex((c) => c.id === shown?.id);
    zap(visible[(i + direction + visible.length) % visible.length]);
  }
  function reorder(id: string, to: number) {
    const reordered = [...favorites],
      from = reordered.indexOf(id);
    if (from < 0 || to < 0 || to >= reordered.length) return;
    reordered.splice(from, 1);
    reordered.splice(to, 0, id);
    void preferences({ favoriteChannels: reordered });
  }
  function jumpNow() {
    if (epgRef.current)
      epgRef.current.scrollLeft = Math.max(
        0,
        ((now - dayStart) / 60000) * minuteWidth -
          (epgRef.current.clientWidth - channelWidth) * 0.25,
      );
  }
  useEffect(() => {
    const hash = () =>
      setView(
        ["directo", "guia", "favoritos", "listas"].includes(
          location.hash.slice(1),
        )
          ? location.hash.slice(1)
          : "directo",
      );
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    if (view === "guia") jumpNow();
  }, [view, day, programmes.length, narrow]);
  useEffect(() => () => clearTimeout(digits.current.timer), []);
  useEffect(() => {
    if (!form) return;
    const previous = document.activeElement as HTMLElement,
      root = modalRef.current!;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    root.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setForm(false);
      }
      if (e.key === "Tab") {
        const items = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button,input,select,[tabindex="0"]',
          ),
        ).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      document.documentElement.style.overflow = overflow;
      previous?.isConnected && previous.focus();
    };
  }, [form]);
  const icon = (path: string) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
  const star =
    "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z";
  const playIcon = (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.9v14.2c0 .8.9 1.3 1.6.9l11-7.1a1 1 0 0 0 0-1.8l-11-7.1C7.9 3.6 7 4.1 7 4.9z" />
    </svg>
  );
  const channelCard = (c: Channel) => {
    const p = current(c),
      ratio = p
        ? Math.min(1, Math.max(0, (now - p.start) / (p.stop - p.start)))
        : 0;
    return (
      <button
        className="z-card z-card--wide tvc"
        key={c.id}
        onClick={() => {
          zap(c);
          show("directo");
          window.scrollTo({
            top: 0,
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
        }}
        aria-label={`Ver ${c.name}`}
      >
        <span
          className="z-card__art"
          style={{ "--h": hue(c.group) } as CSSProperties}
        >
          <span className="tvc__mono">
            {c.logo ? <img src={c.logo} alt="" /> : initials(c)}
          </span>
          <span className="z-badge z-badge--live">EM DIRECTO</span>
          <span className="tvc__n">{channels.indexOf(c) + 1}</span>
          {p && (
            <span className="z-progress live-p">
              <i style={{ "--p": ratio } as CSSProperties} />
            </span>
          )}
        </span>
        <span className="z-card__cap">
          {c.name}
          <small>{p?.title || "Programação indisponível"}</small>
        </span>
      </button>
    );
  };
  const rows = [
    ["Favoritos", favChannels],
    [
      "Vistos recentemente",
      (state.preferences.recentChannels || [])
        .map((id: string) => channels.find((c) => c.id === id))
        .filter(Boolean),
    ],
    ...groups
      .filter((g) => !hiddenGroups.includes(g))
      .map((g) => [g, visible.filter((c) => c.group === g)]),
  ] as [string, Channel[]][];
  return (
    <div className="tv-page" data-tab={view}>
      <Nav />
      <TVArt guide={view === "guia"} />
      <main className="z-page">
        <h1 className="z-sr">TV</h1>
        <div
          className="z-tabs tv-tabs"
          role="tablist"
          aria-label="Secções da TV"
          onKeyDown={(e) => {
            const tabs = ["directo", "guia", "favoritos", "listas"],
              i = tabs.indexOf(view),
              n = (
                {
                  ArrowRight: i + 1,
                  ArrowLeft: i - 1,
                  Home: 0,
                  End: 3,
                } as Record<string, number>
              )[e.key];
            if (n !== undefined) {
              e.preventDefault();
              const tab = tabs[(n + 4) % 4];
              show(tab);
              document.getElementById(`t-${tab}`)?.focus();
            }
          }}
        >
          {[
            ["directo", "Em directo"],
            ["guia", "Guia"],
            ["favoritos", "Favoritos"],
            ["listas", "Listas IPTV"],
          ].map(([id, label]) => (
            <button
              type="button"
              role="tab"
              id={`t-${id}`}
              key={id}
              aria-controls={`p-${id}`}
              aria-selected={view === id}
              tabIndex={view === id ? 0 : -1}
              onClick={() => show(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {(error || stateError) && (
          <p role="alert" className="tv-message error-message">
            {error || stateError?.message}
          </p>
        )}
        {(loading || busy) && (
          <p className="tv-message z-muted" role="status">
            A carregar as tuas listas…
          </p>
        )}
        <section
          id="p-directo"
          role="tabpanel"
          aria-labelledby="t-directo"
          hidden={view !== "directo"}
        >
          {shown ? (
            <>
              <div className="hero">
                <div
                  className="tv"
                  tabIndex={0}
                  role="group"
                  aria-label="Pré-visualização do canal. Setas para cima e para baixo mudam de canal."
                  aria-describedby="zap-hint"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      step(e.key === "ArrowUp" ? 1 : -1);
                    } else if (/^\d$/.test(e.key)) {
                      digits.current.value += e.key;
                      clearTimeout(digits.current.timer);
                      digits.current.timer = window.setTimeout(() => {
                        const c = channels[Number(digits.current.value) - 1];
                        if (c) zap(c);
                        digits.current.value = "";
                      }, 650);
                    }
                  }}
                >
                  {selected ? (
                    <video
                      ref={video}
                      controls
                      playsInline
                      onError={() =>
                        setPlayError(
                          "Não foi possível reproduzir esta emissão.",
                        )
                      }
                    />
                  ) : (
                    <div
                      className="feed"
                      style={{ "--h": hue(shown.group) } as CSSProperties}
                    >
                      <span className="feed__mono">
                        {shown.logo ? (
                          <img src={shown.logo} alt="" />
                        ) : (
                          initials(shown)
                        )}
                      </span>
                      <span className="feed__name">{shown.name}</span>
                    </div>
                  )}
                  {selected && !playError && (
                    <span className="z-badge z-badge--live">EM DIRECTO</span>
                  )}
                  {!selected && (
                    <button
                      className="tv-play z-icon-btn"
                      aria-label={`Reproduzir ${shown.name}`}
                      onClick={() => setSelected(shown)}
                    >
                      {playIcon}
                    </button>
                  )}
                </div>
                <div className="info">
                  <div className="info__ch">
                    {mono(shown)}
                    <b>{shown.name}</b>
                    <span className="z-faint z-num">
                      Canal {channels.indexOf(shown) + 1}
                    </span>
                    <span className="z-tag">{shown.group}</span>
                  </div>
                  <h2 className="z-t1">{live?.title || shown.name}</h2>
                  {live && (
                    <div className="info__time">
                      <span className="z-num">{hm(live.start)}</span>
                      <span
                        className="z-progress live-p"
                        role="progressbar"
                        aria-label="Progresso do programa"
                        aria-valuenow={Math.round(
                          ((now - live.start) / (live.stop - live.start)) * 100,
                        )}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <i
                          style={
                            {
                              "--p":
                                (now - live.start) / (live.stop - live.start),
                            } as CSSProperties
                          }
                        />
                      </span>
                      <span className="z-num">
                        {hm(live.stop)}, faltam{" "}
                        {Math.ceil((live.stop - now) / 60000)} min
                      </span>
                    </div>
                  )}
                  <p className="z-muted">
                    {next
                      ? `A seguir, às ${hm(next.start)}: ${next.title}`
                      : "O fornecedor não disponibilizou a programação seguinte."}
                  </p>
                  <div className="info__act">
                    <button
                      className="z-btn z-btn--primary"
                      onClick={() => {
                        setSelected(shown);
                        if (selected?.id === shown.id)
                          void video.current
                            ?.play()
                            .catch(() =>
                              setPlayError(
                                "Não foi possível iniciar a emissão.",
                              ),
                            );
                      }}
                    >
                      {playIcon}Ver agora
                    </button>
                    <button
                      className="z-btn z-btn--secondary"
                      aria-pressed={favorites.includes(shown.id)}
                      onClick={() => void toggle(shown)}
                    >
                      {icon(star)}
                      {favorites.includes(shown.id)
                        ? "Nos favoritos"
                        : "Favorito"}
                    </button>
                    <button
                      className="z-icon-btn"
                      aria-label="Canal seguinte"
                      onClick={() => step(1)}
                    >
                      {icon("M6 14.5l6-6 6 6")}
                    </button>
                    <button
                      className="z-icon-btn"
                      aria-label="Canal anterior"
                      onClick={() => step(-1)}
                    >
                      {icon("M6 9.5l6 6 6-6")}
                    </button>
                  </div>
                  <p className="z-foot" id="zap-hint">
                    Escreve o número do canal para saltar directamente.
                  </p>
                  {playError && (
                    <p className="z-msg" role="alert">
                      {playError}
                    </p>
                  )}
                </div>
              </div>
              <div className="tv-filter">
                <label className="z-search">
                  {icon("M16 16l4.5 4.5")}
                  <input
                    type="search"
                    aria-label="Pesquisar canais"
                    placeholder="Pesquisar canais"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  className="z-input"
                  aria-label="Lista IPTV"
                  value={selectedList?.id}
                  onChange={(e) => {
                    setListId(e.target.value);
                    setPreview(null);
                    setSelected(null);
                  }}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="z-rows">
                {query && !visible.length && (
                  <p className="rows-empty" role="status">
                    Nenhum canal encontrado. Tenta outro nome.
                  </p>
                )}
                {rows
                  .map(
                    ([title, items]) =>
                      [
                        title,
                        items.filter(
                          (c) =>
                            !hiddenGroups.includes(c.group) &&
                            (!query ||
                              c.name
                                .toLocaleLowerCase()
                                .includes(query.toLocaleLowerCase())),
                        ),
                      ] as [string, Channel[]],
                  )
                  .filter(([, items]) => items.length)
                  .map(([title, items]) => (
                    <section className="z-row" key={title}>
                      <h3 className="z-row__title">{title}</h3>
                      <div className="z-track">
                        {items
                          .filter(
                            (c) =>
                              !hiddenGroups.includes(c.group) &&
                              (!query ||
                                c.name
                                  .toLocaleLowerCase()
                                  .includes(query.toLocaleLowerCase())),
                          )
                          .map(channelCard)}
                      </div>
                    </section>
                  ))}
              </div>
            </>
          ) : (
            !loading &&
            !busy && (
              <div className="tv-empty z-glass">
                <h2 className="z-t1">
                  {channels.length
                    ? "Todos os grupos estão escondidos."
                    : "As tuas emissões começam aqui."}
                </h2>
                <p className="z-lede">
                  {channels.length
                    ? "Mostra os grupos em Favoritos para voltar ao directo."
                    : "Adiciona a tua lista IPTV. O Zeus lê dela os canais e o guia."}
                </p>
                <button
                  className="z-btn z-btn--primary"
                  onClick={() =>
                    channels.length ? show("favoritos") : setForm(true)
                  }
                >
                  {icon("M12 5v14M5 12h14")}
                  {channels.length ? "Abrir Favoritos" : "Adicionar lista"}
                </button>
              </div>
            )
          )}
        </section>
        <section
          id="p-guia"
          role="tabpanel"
          aria-labelledby="t-guia"
          hidden={view !== "guia"}
        >
          <div className="head">
            <h2 className="z-t1">Guia de programação</h2>
            <p className="z-lede" id="g-hint">
              Escolhe um programa para ver os detalhes e abrir o canal em
              directo.
            </p>
          </div>
          <div className="guide">
            <div className="g-bar">
              <div className="z-chips" role="group" aria-label="Dia">
                {[-1, 0, 1, 2, 3, 4].map((d) => (
                  <button
                    className="z-chip"
                    key={d}
                    aria-pressed={day === d}
                    onClick={() => {
                      setDay(d);
                      setProgramme(null);
                    }}
                  >
                    {d === 0
                      ? "Hoje"
                      : d === -1
                        ? "Ontem"
                        : d === 1
                          ? "Amanhã"
                          : new Date(now + d * 86400000).toLocaleDateString(
                              "pt-PT",
                              { weekday: "short", day: "numeric" },
                            )}
                  </button>
                ))}
              </div>
              <button
                className="z-btn z-btn--secondary z-btn--sm"
                onClick={() => {
                  setDay(0);
                  jumpNow();
                }}
              >
                Agora
              </button>
            </div>
            {programmes.length ? (
              <div className="g-layout">
                <div
                  className="epg"
                  ref={epgRef}
                  role="region"
                  aria-label="Grelha de programação"
                  aria-describedby="g-hint"
                  tabIndex={0}
                  onKeyDown={guideKey}
                  style={
                    {
                      "--chw": `${channelWidth}px`,
                      "--dayw": `${dayWidth}px`,
                      "--rowh": narrow ? "60px" : "66px",
                    } as CSSProperties
                  }
                >
                  <div className="epg__in">
                    <div className="epg__head">
                      <div className="epg__corner">
                        {startDay.toLocaleDateString("pt-PT", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="epg__ruler">
                        {Array.from({ length: 48 }, (_, i) => (
                          <span
                            key={i}
                            className={i % 2 ? "is-half" : ""}
                            style={{ left: i * 30 * minuteWidth }}
                          >
                            {String(Math.floor(i / 2)).padStart(2, "0")}:
                            {i % 2 ? "30" : "00"}
                          </span>
                        ))}
                      </div>
                    </div>
                    {visible.map((c) => (
                      <div className="epg__row" key={c.id}>
                        <button
                          className="epg__ch"
                          onClick={() => {
                            zap(c);
                            show("directo");
                          }}
                        >
                          {mono(c)}
                          <span>
                            <b>{c.name}</b>
                            <small>{channels.indexOf(c) + 1}</small>
                          </span>
                        </button>
                        <div className="epg__lane">
                          {programmes
                            .filter(
                              (p) =>
                                p.channel === c.epgId &&
                                p.stop > dayStart &&
                                p.start < dayStart + 86400000,
                            )
                            .map((p) => {
                              const on = p.start <= now && p.stop > now;
                              return (
                                <button
                                  className={`epg__b ${on ? "is-live" : p.stop <= now ? "is-past" : ""} ${programme === p ? "is-sel" : ""}`}
                                  key={`${p.channel}-${p.start}`}
                                  data-channel={p.channel}
                                  data-start={p.start}
                                  data-stop={p.stop}
                                  tabIndex={focusedProgramme === p ? 0 : -1}
                                  onFocus={() => setProgramme(p)}
                                  style={
                                    {
                                      left:
                                        Math.max(
                                          0,
                                          (p.start - dayStart) / 60000,
                                        ) * minuteWidth,
                                      width: Math.max(
                                        8,
                                        ((Math.min(
                                          p.stop,
                                          dayStart + 86400000,
                                        ) -
                                          Math.max(p.start, dayStart)) /
                                          60000) *
                                          minuteWidth -
                                          3,
                                      ),
                                      "--p": `${((now - p.start) / (p.stop - p.start)) * 100}%`,
                                    } as CSSProperties
                                  }
                                  onClick={() => setProgramme(p)}
                                >
                                  <b>{p.title}</b>
                                  <small>
                                    {hm(p.start)}–{hm(p.stop)}
                                  </small>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                    {day === 0 && (
                      <div
                        className="nowline"
                        style={{
                          left:
                            channelWidth +
                            ((now - dayStart) / 60000) * minuteWidth,
                        }}
                      >
                        <span className="now-tag">{hm(now)}</span>
                        <i />
                      </div>
                    )}
                  </div>
                </div>
                <aside
                  className="g-detail z-glass"
                  aria-label="Programa seleccionado"
                >
                  {programme ? (
                    <>
                      <div className="g-detail__ch">
                        {
                          channels.find((c) => c.epgId === programme.channel)
                            ?.name
                        }
                      </div>
                      <h3 className="z-t2">{programme.title}</h3>
                      <p>
                        {hm(programme.start)}–{hm(programme.stop)}
                      </p>
                      <p>
                        {programme.description || "Sem descrição disponível."}
                      </p>
                      <button
                        className="z-btn z-btn--primary"
                        onClick={() => {
                          const c = channels.find(
                            (c) => c.epgId === programme.channel,
                          );
                          if (c) {
                            zap(c);
                            setSelected(c);
                            show("directo");
                          }
                        }}
                      >
                        {playIcon}Ver canal em directo
                      </button>
                    </>
                  ) : (
                    <p>Escolhe um programa na grelha.</p>
                  )}
                </aside>
              </div>
            ) : (
              <p className="z-muted">
                Ainda não há programação disponível. Adiciona o URL do guia
                XMLTV na tua lista IPTV.
              </p>
            )}
          </div>
        </section>
        <section
          id="p-favoritos"
          role="tabpanel"
          aria-labelledby="t-favoritos"
          hidden={view !== "favoritos"}
        >
          <div className="head">
            <h2 className="z-t1">Favoritos</h2>
            <p className="z-lede">
              Arrasta pela pega para mudar a ordem. Os grupos escondidos saem do
              Directo e do Guia.
            </p>
          </div>
          <div className="fav">
            <div>
              <h3>A tua ordem</h3>
              <ul className="sort">
                {favChannels.map((c, index) => (
                  <li key={c.id}>
                    <button
                      className="handle"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.currentTarget.focus();
                        const row = e.currentTarget.closest("li")!;
                        dragging.current = {
                          id: c.id,
                          y: e.clientY,
                          delta: 0,
                          index,
                          row,
                        };
                        row.classList.add("is-drag");
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const drag = dragging.current;
                        if (!drag) return;
                        drag.delta = e.clientY - drag.y;
                        drag.row.style.transform = `translateY(${drag.delta}px)`;
                      }}
                      onPointerUp={(e) => {
                        const drag = dragging.current;
                        if (!drag) return;
                        const to = Math.max(
                          0,
                          Math.min(
                            favorites.length - 1,
                            drag.index +
                              Math.round(
                                drag.delta / (drag.row.offsetHeight + 8),
                              ),
                          ),
                        );
                        drag.row.style.transform = "";
                        drag.row.classList.remove("is-drag");
                        dragging.current = null;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        if (to !== drag.index) reorder(drag.id, to);
                      }}
                      onPointerCancel={() => {
                        const drag = dragging.current;
                        if (drag) {
                          drag.row.style.transform = "";
                          drag.row.classList.remove("is-drag");
                        }
                        dragging.current = null;
                      }}
                      aria-label={`Mover ${c.name}; usa as setas para cima e para baixo`}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          reorder(c.id, index + (e.key === "ArrowUp" ? -1 : 1));
                        }
                      }}
                    >
                      {icon(
                        "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
                      )}
                    </button>
                    {mono(c)}
                    <span className="fav__t">
                      {c.name}
                      <small>{current(c)?.title || c.group}</small>
                    </span>
                    <span className="z-num z-faint">
                      {channels.indexOf(c) + 1}
                    </span>
                    <button
                      className="z-icon-btn"
                      aria-label={`Remover ${c.name} dos favoritos`}
                      onClick={() => void toggle(c)}
                    >
                      {icon(star)}
                    </button>
                  </li>
                ))}
              </ul>
              {!favChannels.length && (
                <p className="z-muted">
                  Ainda não tens favoritos. Escolhe canais abaixo ou toca na
                  estrela no Directo.
                </p>
              )}
              <div className="fav-add">
                <h3>Adicionar aos favoritos</h3>
                <div className="z-chips">
                  {channels
                    .filter((c) => !favorites.includes(c.id))
                    .map((c) => (
                      <button
                        className="z-chip"
                        key={c.id}
                        onClick={() => void toggle(c)}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="z-glass z-panel">
              <h3>Grupos</h3>
              {groups.map((g) => (
                <div className="grp" key={g}>
                  <span>
                    {g}
                    <small>
                      {channels.filter((c) => c.group === g).length} canais
                    </small>
                  </span>
                  <button
                    className="z-switch"
                    role="switch"
                    aria-checked={!hiddenGroups.includes(g)}
                    aria-label={`Mostrar ${g}`}
                    onClick={() =>
                      void preferences({
                        hiddenChannelGroups: hiddenGroups.includes(g)
                          ? hiddenGroups.filter((x) => x !== g)
                          : [...hiddenGroups, g],
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="p-listas"
          role="tabpanel"
          aria-labelledby="t-listas"
          hidden={view !== "listas"}
        >
          <div className="head">
            <h2 className="z-t1">Listas IPTV</h2>
            <p className="z-lede">
              As tuas listas privadas, Xtream ou M3U. O Zeus lê delas os canais
              e o guia.
            </p>
          </div>
          <div className="lists">
            {lists.map((l) => (
              <article className="lc z-glass" key={l.id}>
                <header>
                  <h3 className="z-t3">{l.name}</h3>
                  <span className="z-tag">
                    {l.type === "m3u" ? "M3U" : "Xtream"}
                  </span>
                </header>
                <p className="z-foot">{new URL(l.url).hostname}</p>
                <dl>
                  <div>
                    <dt>Canais</dt>
                    <dd>{l.id === selectedList?.id ? channels.length : "—"}</dd>
                  </div>
                  <div>
                    <dt>Guia</dt>
                    <dd>{l.epgUrl ? "XMLTV" : "—"}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {l.id === selectedList?.id
                        ? busy
                          ? "A ler"
                          : error
                            ? "Verificar"
                            : "Activa"
                        : "Guardada"}
                    </dd>
                  </div>
                </dl>
                <div className="lc__act">
                  <button
                    className="z-btn z-btn--secondary z-btn--sm"
                    onClick={() => {
                      setListId(l.id);
                      setRevision((r) => r + 1);
                      setPreview(null);
                      setSelected(null);
                    }}
                  >
                    Actualizar
                  </button>
                  <button
                    className="z-btn z-btn--ghost z-btn--sm"
                    onClick={async () => {
                      if (!confirm(`Remover a lista «${l.name}»?`)) return;
                      try {
                        await save({
                          iptv: lists.filter((x) => x.id !== l.id),
                        });
                        if (selectedList?.id === l.id) {
                          setSelected(null);
                          setPreview(null);
                          setListId("");
                        }
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
            <button className="lc-add" onClick={() => setForm(true)}>
              {icon("M12 5v14M5 12h14")}Adicionar lista
            </button>
          </div>
        </section>
      </main>
      {form && (
        <div className="z-modal" ref={modalRef}>
          <div className="z-scrim" onClick={() => setForm(false)} />
          <div
            className="z-sheet z-sheet--sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-t"
          >
            <button
              className="z-icon-btn z-sheet__close"
              aria-label="Fechar"
              onClick={() => setForm(false)}
            >
              {icon("M6 6l12 12M18 6L6 18")}
            </button>
            <form className="z-sheet__body" onSubmit={add}>
              <h2 className="z-t2" id="add-t">
                Adicionar lista
              </h2>
              <div
                className="z-seg"
                role="radiogroup"
                aria-label="Tipo de lista"
              >
                {["xtream", "m3u"].map((k) => (
                  <label key={k}>
                    <input
                      type="radio"
                      name="type"
                      value={k}
                      checked={kind === k}
                      onChange={() => setKind(k)}
                    />
                    {k === "m3u" ? "M3U" : "Xtream"}
                  </label>
                ))}
              </div>
              <div className="z-field">
                <label className="z-label" htmlFor="list-name">
                  Nome
                </label>
                <input
                  className="z-input"
                  id="list-name"
                  name="name"
                  placeholder="Casa"
                  autoComplete="off"
                  maxLength={100}
                  required
                />
              </div>
              <div className="z-field">
                <label className="z-label" htmlFor="list-url">
                  {kind === "m3u" ? "URL da lista M3U" : "Servidor"}
                </label>
                <input
                  className="z-input z-input--mono"
                  id="list-url"
                  name="url"
                  type="url"
                  placeholder={
                    kind === "m3u"
                      ? "https://…/lista.m3u"
                      : "http://servidor:8080"
                  }
                  autoComplete="off"
                  required
                />
              </div>
              {kind === "xtream" && (
                <>
                  <div className="z-field">
                    <label className="z-label" htmlFor="list-user">
                      Utilizador
                    </label>
                    <input
                      className="z-input"
                      id="list-user"
                      name="username"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="z-field">
                    <label className="z-label" htmlFor="list-password">
                      Palavra-passe
                    </label>
                    <div className="z-input-wrap">
                      <input
                        className="z-input"
                        id="list-password"
                        name="password"
                        type={reveal ? "text" : "password"}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        aria-pressed={reveal}
                        onClick={() => setReveal(!reveal)}
                      >
                        {reveal ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="z-field">
                <label className="z-label" htmlFor="list-epg">
                  URL do guia EPG (opcional)
                </label>
                <input
                  className="z-input z-input--mono"
                  id="list-epg"
                  name="epg"
                  type="url"
                  placeholder="https://…/guia.xml"
                  autoComplete="off"
                />
              </div>
              <p className="note">
                {icon("M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3")}A lista fica
                guardada na tua conta. Só tu tens acesso às credenciais.
              </p>
              {error && (
                <p className="z-msg" role="alert">
                  {error}
                </p>
              )}
              <button
                className="z-btn z-btn--primary z-btn--block"
                type="submit"
                disabled={saving}
              >
                {saving ? "A guardar…" : "Adicionar lista"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
