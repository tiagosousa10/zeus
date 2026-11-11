import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Art, Page, EmptyState } from "../components/Layout";
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
    [query, setQuery] = useState(""),
    [group, setGroup] = useState(""),
    [selected, setSelected] = useState<Channel | null>(null),
    [view, setView] = useState<"channels" | "guide">(
      location.hash === "#guia" ? "guide" : "channels",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(false),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(0),
    [onlyFav, setOnlyFav] = useState(false),
    [playError, setPlayError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const selectedList = lists.find((l) => l.id === listId) || lists[0];
  const [now, setNow] = useState(Date.now());
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
  const visible = channels
    .filter(
      (c) =>
        (!group || c.group === group) &&
        (!onlyFav || favorites.includes(c.id)) &&
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
  if (loading || stateError)
    return (
      <Page>
        <Art image="hermes" title="A tua televisão" />
        <div className="app-content">
          <p role="status">
            {stateError ? stateError.message : "A carregar as tuas listas…"}
          </p>
          {stateError && (
            <button className="z-btn" onClick={() => location.reload()}>
              Tentar novamente
            </button>
          )}
        </div>
      </Page>
    );
  return (
    <Page className="tv-page">
      <Art
        image="hermes"
        eyebrow="Hermes · A voz do mundo"
        title="O mundo não pára."
      >
        <p>Acontece agora. Chega até ti.</p>
        <div className="button-row">
          <button
            className="z-btn z-btn--primary"
            onClick={() => setForm(!form)}
          >
            Adicionar Lista IPTV
          </button>
          {lists.length > 0 && (
            <button
              className="z-btn z-btn--secondary"
              onClick={() => setView(view === "guide" ? "channels" : "guide")}
            >
              {view === "guide" ? "Ver Canais" : "Abrir guia"}
            </button>
          )}
        </div>
      </Art>
      <div className="app-content">
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {form && (
          <form className="surface tv-add" onSubmit={add}>
            <h2>A tua ligação ao mundo</h2>
            <div className="form-grid">
              <label>
                Nome da lista
                <input
                  className="z-input"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="A minha televisão"
                />
              </label>
              <label>
                Tipo
                <select className="z-input" name="type">
                  <option value="m3u">M3U</option>
                  <option value="xtream">Xtream Codes</option>
                </select>
              </label>
              <label>
                URL do servidor ou ficheiro M3U
                <input
                  className="z-input"
                  name="url"
                  type="url"
                  required
                  placeholder="https://"
                />
              </label>
              <div className="tv-two">
                <label>
                  Utilizador Xtream
                  <input
                    className="z-input"
                    name="username"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Password Xtream
                  <input
                    className="z-input"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <label>
                Guia XMLTV (opcional)
                <input
                  className="z-input"
                  name="epg"
                  type="url"
                  placeholder="https://"
                />
              </label>
              <div className="button-row">
                <button disabled={saving} className="z-btn z-btn--primary">
                  {saving ? "A guardar…" : "Guardar lista"}
                </button>
                <button
                  type="button"
                  className="z-btn z-btn--ghost"
                  onClick={() => setForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        )}
        {!lists.length && !loading && !form && (
          <EmptyState title="As tuas emissões começam aqui.">
            <p>
              Adiciona a tua Lista IPTV por M3U ou Xtream. Só tu tens acesso às
              tuas listas.
            </p>
          </EmptyState>
        )}
        {lists.length > 0 && (
          <>
            <div className="tv-toolbar">
              <select
                className="z-input"
                aria-label="Lista IPTV"
                value={selectedList?.id || ""}
                onChange={(e) => {
                  setListId(e.target.value);
                  setGroup("");
                  setSelected(null);
                }}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <input
                className="z-input"
                type="search"
                aria-label="Pesquisar Canal"
                placeholder="Pesquisar Canal…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="z-btn z-btn--ghost"
                onClick={() => setRevision((r) => r + 1)}
              >
                Actualizar
              </button>
              <button
                className="z-btn z-btn--ghost"
                onClick={async () => {
                  if (confirm("Remover esta Lista IPTV da tua conta?"))
                    try {
                      await save({
                        iptv: lists.filter((l) => l.id !== selectedList?.id),
                      });
                      setListId("");
                      setSelected(null);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                }}
              >
                Remover lista
              </button>
            </div>
            <div className="tv-groups">
              <button
                className="z-chip"
                aria-pressed={onlyFav}
                onClick={() => setOnlyFav(!onlyFav)}
              >
                ★ Favoritos
              </button>
              <button
                className="z-chip"
                aria-pressed={!group}
                onClick={() => setGroup("")}
              >
                Todos
              </button>
              {[...new Set(channels.map((c) => c.group))].map((g) => (
                <button
                  key={g}
                  className="z-chip"
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </>
        )}
        {selected && (
          <section className="tv-player surface">
            <div className="tv-player-title">
              <span className="live-badge">EM DIRECTO</span>
              <h2>{selected.name}</h2>
              <button
                className="z-btn z-btn--ghost"
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
            </div>
            <video
              ref={video}
              controls
              playsInline
              onError={() =>
                setPlayError(
                  "Não foi possível reproduzir esta emissão. O formato ou o acesso pode não ser suportado.",
                )
              }
            />
            {playError && (
              <p role="alert" className="error-message">
                {playError}
              </p>
            )}
            <p>{current(selected)?.title}</p>
            <div className="button-row">
              <button
                className="z-btn z-btn--secondary"
                onClick={() => {
                  const i = channels.findIndex((c) => c.id === selected.id);
                  setSelected(
                    channels[(i - 1 + channels.length) % channels.length],
                  );
                }}
              >
                ← Canal anterior
              </button>
              <button
                className="z-btn z-btn--secondary"
                onClick={() => {
                  const i = channels.findIndex((c) => c.id === selected.id);
                  setSelected(channels[(i + 1) % channels.length]);
                }}
              >
                Canal seguinte →
              </button>
            </div>
          </section>
        )}
        {busy && (
          <div className="empty-state" role="status">
            A sintonizar a tua lista…
          </div>
        )}
        {!busy && lists.length > 0 && (
          <>
            <div className="tv-section-head">
              <h2>
                {onlyFav
                  ? "Os teus favoritos"
                  : view === "guide"
                    ? "O fio do tempo"
                    : "Em directo agora"}
              </h2>
              <span>{channels.length} Canais</span>
            </div>
            {view === "channels" ? (
              <div className="channel-grid">
                {visible.map((c) => (
                  <article key={c.id} className="channel-card">
                    <button
                      className="channel-open"
                      onClick={() => setSelected(c)}
                    >
                      {c.logo ? (
                        <img
                          src={c.logo}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="channel-letter">
                          {c.name.slice(0, 2)}
                        </span>
                      )}
                      <span className="live-badge">EM DIRECTO</span>
                      <h3>{c.name}</h3>
                      <p>{current(c)?.title || c.group}</p>
                      {current(c) && (
                        <progress
                          max={100}
                          value={
                            ((now - current(c)!.start) /
                              (current(c)!.stop - current(c)!.start)) *
                            100
                          }
                        />
                      )}
                    </button>
                    <button
                      className="channel-favorite"
                      aria-label={`${favorites.includes(c.id) ? "Remover" : "Adicionar"} ${c.name} ${favorites.includes(c.id) ? "dos" : "aos"} favoritos`}
                      aria-pressed={favorites.includes(c.id)}
                      onClick={() => toggle(c)}
                    >
                      {favorites.includes(c.id) ? "★" : "☆"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="epg-scroll">
                <div className="epg-grid">
                  {visible.map((c) => (
                    <div className="epg-row" key={c.id}>
                      <button onClick={() => setSelected(c)}>{c.name}</button>
                      <div className="epg-programmes">
                        {programmes
                          .filter(
                            (p) =>
                              p.channel === c.epgId &&
                              p.stop > now &&
                              p.start < now + 6 * 3600000,
                          )
                          .map((p, i) => (
                            <button
                              key={p.start}
                              className={i === 0 ? "is-now" : ""}
                              onClick={() => setSelected(c)}
                            >
                              <small>
                                {new Date(p.start).toLocaleTimeString("pt-PT", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </small>
                              <strong>{p.title}</strong>
                            </button>
                          ))}
                        {!programmes.some(
                          (p) => p.channel === c.epgId && p.stop > now,
                        ) && <span>Sem programação disponível</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!visible.length && (
              <EmptyState title="Nenhum Canal encontrado">
                <p>Altera a pesquisa ou o grupo seleccionado.</p>
              </EmptyState>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
