import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useMemberState } from "../lib/session";
import "./management.css";
import "./addons-fidelity.css";
import "./management-hero.css";
type ConfigField = {
  key: string;
  title?: string;
  type?: string;
  options?: string[];
  default?: string | boolean;
  required?: boolean;
};
type Addon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  version?: string;
  resources?: Array<string | { name: string }>;
  configFields?: ConfigField[];
  configurationRequired?: boolean;
  configurable?: boolean;
};
// Provider and quality keys follow Torrentio's public domain/filter.rs.
const providers = [
  ["yts", "YTS"],
  ["eztv", "EZTV"],
  ["rarbg", "RARBG"],
  ["1337x", "1337x"],
  ["thepiratebay", "The Pirate Bay"],
  ["kickasstorrents", "KickassTorrents"],
  ["torrentgalaxy", "TorrentGalaxy"],
  ["magnetdl", "MagnetDL"],
  ["nyaasi", "Nyaa"],
  ["rutor", "Rutor"],
  ["comando", "Comando"],
  ["torrent9", "Torrent9"],
];
const qualities = [
  ["4k", "4K"],
  ["brremux", "Remux"],
  ["hdrall", "HDR"],
  ["dolbyvision", "Dolby Vision"],
  ["1080p", "1080p"],
  ["720p", "720p"],
  ["480p", "480p"],
  ["threed", "3D"],
  ["scr", "Screener"],
  ["cam", "CAM"],
  ["unknown", "Desconhecida"],
];
const resourceNames: Record<string, string> = {
  catalog: "Catálogos",
  meta: "Fichas",
  stream: "Fontes",
  subtitles: "Legendas",
};
const badges: Record<string, string> = {
  stream: "Vídeo",
  subtitles: "Legendas",
};
const resources = (a: Addon) =>
  (a.resources || []).map((r) => (typeof r === "string" ? r : r.name));
const filters: Array<[string, string, (a: Addon) => boolean]> = [
  ["", "Tudo", () => true],
  ["stream", "Vídeo", (a) => resources(a).includes("stream")],
  ["subtitles", "Legendas", (a) => resources(a).includes("subtitles")],
  ["free", "Sem chave", (a) => !a.configurationRequired],
  ["key", "Precisa de chave", (a) => !!a.configurationRequired],
];
const PAGE = 60;
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Sem campos declarados, configura-se na página do próprio Add-on (convenção Stremio).
const byUrl = (a: Addon) =>
  !!(a.configurationRequired || a.configurable) &&
  !a.configFields?.length &&
  !/torrentio/i.test(a.name || a.id);
const manifestProblem = (value: string, approved: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Cola o URL completo do manifesto, a começar por https://.";
  }
  const host = new URL(approved).hostname;
  if (url.protocol !== "https:") return "O URL tem de começar por https://.";
  if (url.hostname !== host) return `O URL tem de ser do domínio ${host}.`;
  if (!url.pathname.endsWith("/manifest.json"))
    return "O URL tem de terminar em /manifest.json.";
  return "";
};
export default function Addons() {
  const { state, save, loading, error: stateError } = useMemberState();
  const [catalogue, setCatalogue] = useState<Addon[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [editing, setEditing] = useState<Addon | null>(null),
    [config, setConfig] = useState<Record<string, any>>({}),
    [installing, setInstalling] = useState(false),
    [announcement, setAnnouncement] = useState(""),
    [hot, setHot] = useState(""),
    [dragging, setDragging] = useState(""),
    [showApi, setShowApi] = useState(false),
    [limit, setLimit] = useState(PAGE),
    [manifest, setManifest] = useState(""),
    [manifestError, setManifestError] = useState(""),
    [showUrl, setShowUrl] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    list = useRef<HTMLOListElement>(null),
    forge = useRef<HTMLImageElement>(null),
    embers = useRef<HTMLCanvasElement>(null),
    dragTarget = useRef(0);
  const installed = state.addons || [],
    ordered = installed.map((a: any) => ({
      ...catalogue.find((c) => c.id === a.id),
      ...a,
    }));
  const load = () =>
    api<{ addons: Addon[] }>("/addons")
      .then((r) => setCatalogue(r.addons))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  useEffect(() => {
    const img = forge.current,
      canvas = embers.current;
    if (
      !img ||
      !canvas ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const intro = gsap.fromTo(
      img,
      { scale: 1.12, opacity: 0 },
      { scale: 1, opacity: 1, duration: 3.2, ease: "power3.out" },
    );
    const drift = gsap.to(img, {
      scale: 1.045,
      duration: 38,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: 3.2,
    });
    let visible = true,
      raf = 0,
      last = 0,
      acc = 0;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      age: number;
      life: number;
      r: number;
    }> = [];
    const size = () => {
      const r = canvas.getBoundingClientRect(),
        d = Math.min(devicePixelRatio || 1, 2);
      canvas.width = r.width * d;
      canvas.height = r.height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const resize = new ResizeObserver(size);
    resize.observe(canvas);
    size();
    const frame = (now: number) => {
      const dt = Math.min(now - (last || now), 50) / 1000;
      last = now;
      const c = canvas.getBoundingClientRect(),
        r = img.getBoundingClientRect();
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "lighter";
      for (acc += dt * 9; acc > 1; acc--)
        particles.push({
          x: r.left - c.left + r.width * 0.41 + Math.random() * 28 - 14,
          y: r.top - c.top + r.height * 0.57,
          vx: Math.random() * 24 - 12,
          vy: -30 - Math.random() * 40,
          age: 0,
          life: 1.8 + Math.random() * 1.8,
          r: 0.8 + Math.random() * 1.3,
        });
      particles = particles.filter((p) => p.age < p.life);
      for (const p of particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(255,${100 + Math.round(140 * k)},${30 + Math.round(160 * k)},${k * 0.8})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const running = visible && !document.hidden;
      drift.paused(!running);
      cancelAnimationFrame(raf);
      if (running) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => {
      intro.kill();
      drift.kill();
      cancelAnimationFrame(raf);
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const mutate = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy("");
    }
  };
  const update = (id: string, patch: Record<string, unknown>) =>
    save({
      addons: installed.map((a: any) => (a.id === id ? { ...a, ...patch } : a)),
    });
  const defaults = (a: Addon) =>
    Object.fromEntries(
      (a.configFields || [])
        .filter(
          (f) =>
            f.default !== undefined &&
            (f.type !== "checkbox" ||
              ["checked", "on", true].includes(f.default)),
        )
        .map((f) => [f.key, f.type === "checkbox" ? "on" : f.default]),
    );
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= installed.length) return;
    void mutate(installed[from].id, async () => {
      const next = [...installed];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      await save({ addons: next });
      setAnnouncement(
        `${ordered[from].name || item.id} passou para a posição ${to + 1} de ${next.length}.`,
      );
    });
  };
  const configure = (a: Addon, install = false) => {
    const entry = installed.find((x: any) => x.id === a.id);
    setConfig(install ? defaults(a) : entry?.config || {});
    setManifest(install ? "" : entry?.manifestUrl || "");
    setManifestError("");
    setShowUrl(false);
    setError("");
    setInstalling(install);
    // A linha instalada traz o URL do membro; o link e o domínio vêm do aprovado.
    setEditing(catalogue.find((c) => c.id === a.id) || a);
  };
  const install = (a: Addon) => {
    if (a.configurationRequired) {
      configure(a, true);
      return;
    }
    void mutate(a.id, async () => {
      await save({
        addons: [
          ...installed,
          { id: a.id, enabled: true, config: defaults(a) },
        ],
      });
      setHot(a.id);
      setAnnouncement(`${a.name} instalado.`);
      if (
        forge.current &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        gsap.fromTo(
          forge.current,
          { filter: "brightness(1.25) contrast(1.1) saturate(1.2)" },
          {
            filter: "brightness(.82) contrast(1.06) saturate(1.05)",
            duration: 1.4,
            ease: "power2.out",
          },
        );
    });
  };
  const filtered = useMemo(() => {
    const q = fold(query.trim()),
      match = (filters.find(([id]) => id === kind) || filters[0])[2];
    return catalogue.filter(
      (a) => match(a) && fold(a.name + " " + a.description).includes(q),
    );
  }, [catalogue, query, kind]);
  const field = (f: ConfigField) => (
    <label key={f.key} className={f.type === "checkbox" ? "chk" : "z-field"}>
      {f.type === "checkbox" ? (
        <>
          <input
            aria-label={f.title || f.key}
            type="checkbox"
            checked={config[f.key] === "on" || config[f.key] === true}
            required={f.required}
            onChange={(e) => {
              const next = { ...config };
              if (e.target.checked) next[f.key] = "on";
              else delete next[f.key];
              setConfig(next);
            }}
          />
          {f.title || f.key}
        </>
      ) : (
        <>
          <span className="z-label">{f.title || f.key}</span>
          {f.type === "select" ? (
            <select
              aria-label={f.title || f.key}
              className="z-input"
              value={config[f.key] ?? ""}
              required={f.required}
              onChange={(e) =>
                setConfig({ ...config, [f.key]: e.target.value })
              }
            >
              <option value="">Escolher…</option>
              {(f.options || []).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label={f.title || f.key}
              className="z-input"
              type={
                ["number", "password"].includes(f.type || "") ? f.type : "text"
              }
              value={config[f.key] ?? ""}
              autoComplete="off"
              required={f.required}
              onChange={(e) =>
                setConfig({ ...config, [f.key]: e.target.value })
              }
            />
          )}
        </>
      )}
    </label>
  );
  return (
    <Page>
      <div className="addons-fidelity">
        <section
          className="fg-hero management-hero"
          aria-labelledby="addons-title"
        >
          <div className="fg-art" aria-hidden="true">
            <div className="fg-pan">
              <img
                ref={forge}
                src="/art/img/hefesto.webp"
                alt=""
                width="1536"
                height="1024"
                decoding="async"
              />
            </div>
          </div>
          <canvas className="fg-embers" ref={embers} aria-hidden="true" />
          <div className="fg-copy management-hero-copy">
            <h1 className="z-display" id="addons-title">
              Add-ons
            </h1>
            <p className="z-lede">
              Escolhe de onde vêm os teus filmes, séries e legendas. Aqui só
              aparecem Add-ons aprovados pelo Administrador.
            </p>
            <p className="fg-meta">
              <span>
                <b className="z-num">{installed.length}</b> instalados
              </span>
              <span>
                <b className="z-num">{catalogue.length}</b> no catálogo
              </span>
            </p>
          </div>
        </section>
        <nav className="z-tabs toc" aria-label="Secções">
          <a href="#instalados">Instalados</a>
          <a href="#catalogo">Catálogo</a>
        </nav>
        <div className="wrap">
          <section className="sec" id="instalados">
            <header>
              <div>
                <h2 className="z-t2">Instalados</h2>
                <p className="z-muted z-callout" id="inst-help">
                  Arrasta pela pega para mudar a ordem; as Fontes do primeiro
                  aparecem primeiro. Com o teclado, foca a pega e usa as setas.
                </p>
              </div>
            </header>
            {(error || stateError) && (
              <p className="z-msg" role="alert">
                {error || stateError?.message}{" "}
                <button className="z-btn z-btn--ghost z-btn--sm" onClick={load}>
                  Tentar novamente
                </button>
              </p>
            )}
            {loading ? (
              <p className="empty">A carregar…</p>
            ) : !ordered.length ? (
              <p className="empty">
                Ainda não instalaste Add-ons. Escolhe um no catálogo abaixo.
              </p>
            ) : (
              <ol className="inst" ref={list} aria-describedby="inst-help">
                {ordered.map((a: any, i: number) => (
                  <li
                    key={a.id}
                    data-addon={a.id}
                    className={`${a.enabled === false ? "is-off" : ""} ${dragging === a.id ? "is-drag" : ""} ${hot === a.id ? "hot" : ""}`}
                  >
                    <button
                      className="grip"
                      disabled={!!busy}
                      aria-label={`Mover ${a.name || a.id}, posição ${i + 1} de ${ordered.length}`}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          reorder(i, i + (e.key === "ArrowUp" ? -1 : 1));
                        }
                      }}
                      onPointerDown={(e) => {
                        if (e.button) return;
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDragging(a.id);
                        dragTarget.current = i;
                      }}
                      onPointerMove={(e) => {
                        if (dragging !== a.id) return;
                        const rows = Array.from(list.current?.children || []);
                        const index = rows.findIndex((row) => {
                          const r = row.getBoundingClientRect();
                          return e.clientY < r.top + r.height / 2;
                        });
                        dragTarget.current =
                          index === -1 ? rows.length - 1 : index;
                      }}
                      onPointerUp={(e) => {
                        if (dragging !== a.id) return;
                        setDragging("");
                        reorder(i, dragTarget.current);
                        e.currentTarget.focus();
                      }}
                      onPointerCancel={() => setDragging("")}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        {[7, 12, 17].flatMap((y) =>
                          [9, 15].map((x) => (
                            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
                          )),
                        )}
                      </svg>
                    </button>
                    <span className="tok" aria-hidden="true">
                      {(a.name || a.id)[0]}
                    </span>
                    <span className="nm">
                      <b>{a.name || a.id}</b>
                      {installed[i].manifestUrl && (
                        <span className="z-tag z-tag--gold">Configurado</span>
                      )}
                      <small>
                        {resources(a)
                          .map((r) => resourceNames[r] || r)
                          .join(" e ") ||
                          a.description ||
                          "Este Add-on já não está disponível no catálogo aprovado."}
                      </small>
                    </span>
                    <span className="pos" aria-hidden="true">
                      {i + 1}
                    </span>
                    <button
                      className="z-switch"
                      role="switch"
                      aria-checked={a.enabled !== false}
                      aria-label={`${a.name || a.id} activo`}
                      disabled={!!busy}
                      onClick={() =>
                        void mutate(a.id, () =>
                          update(a.id, { enabled: a.enabled === false }),
                        )
                      }
                    />
                    <span className="acts">
                      {(/torrentio/i.test(a.name || a.id) ||
                        !!a.configFields?.length) && (
                        <button
                          className="z-btn z-btn--secondary z-btn--sm"
                          onClick={() => configure(a)}
                        >
                          Configurar
                        </button>
                      )}
                      {byUrl(a) && (
                        <button
                          className="z-btn z-btn--secondary z-btn--sm"
                          onClick={() => configure(a)}
                        >
                          {installed[i].manifestUrl
                            ? "Alterar configuração"
                            : "Configurar"}
                        </button>
                      )}
                      <button
                        className="z-btn z-btn--ghost z-btn--sm"
                        disabled={!!busy}
                        onClick={() =>
                          void mutate(a.id, async () => {
                            await save({
                              addons: installed.filter(
                                (x: any) => x.id !== a.id,
                              ),
                            });
                            setAnnouncement(`${a.name || a.id} removido.`);
                          })
                        }
                      >
                        Remover
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="z-sr" aria-live="polite">
              {announcement}
            </p>
          </section>
          <section className="sec" id="catalogo">
            <header>
              <div>
                <h2 className="z-t2">Catálogo</h2>
                <p className="z-muted z-callout">
                  Importado do registo público da comunidade Stremio e revisto
                  pelo Administrador.
                </p>
              </div>
            </header>
            <div className="tools">
              <form
                className="z-search"
                role="search"
                onSubmit={(e) => e.preventDefault()}
              >
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
                  type="search"
                  placeholder="Procurar Add-ons"
                  aria-label="Procurar Add-ons"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                />
              </form>
              <div className="z-chips" role="group" aria-label="Filtros">
                {filters.map(([id, label]) => (
                  <button
                    key={id}
                    className="z-chip"
                    aria-pressed={kind === id}
                    onClick={() => {
                      setKind(id);
                      setLimit(PAGE);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="z-foot z-num" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? "Add-on" : "Add-ons"}
              </span>
            </div>
            <div className="cat">
              {filtered.slice(0, limit).map((a) => (
                <article className="card" key={a.id}>
                  <div className="card__top">
                    <span className="tok" aria-hidden="true">
                      {a.name[0]}
                    </span>
                    <div>
                      <b>{a.name}</b>
                      {a.version && (
                        <span className="z-tag z-tag--mono">v{a.version}</span>
                      )}
                    </div>
                  </div>
                  <p>{a.description}</p>
                  <div className="z-tags">
                    {resources(a)
                      .filter((r) => badges[r])
                      .map((r) => (
                        <span className="z-tag" key={r}>
                          {badges[r]}
                        </span>
                      ))}
                    {a.configurationRequired ? (
                      <span className="z-tag z-tag--strong">
                        Precisa de chave
                      </span>
                    ) : (
                      (a.configurable ||
                        /torrentio/i.test(a.name) ||
                        !!a.configFields?.length) && (
                        <span className="z-tag z-tag--gold">Configurável</span>
                      )
                    )}
                  </div>
                  <footer>
                    {installed.some((x: any) => x.id === a.id) ? (
                      <span className="done">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                        Instalado
                      </span>
                    ) : (
                      <button
                        className="z-btn z-btn--secondary z-btn--sm"
                        disabled={!!busy || loading || !!stateError}
                        aria-label={`Instalar ${a.name}`}
                        onClick={() => install(a)}
                      >
                        {busy === a.id ? "A instalar…" : "Instalar"}
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
            {filtered.length > limit && (
              <div className="more">
                <button
                  className="z-btn z-btn--secondary"
                  onClick={() => setLimit(limit + PAGE)}
                >
                  Mostrar mais
                </button>
                <span className="z-foot z-num">
                  A mostrar {limit} de {filtered.length}
                </span>
              </div>
            )}
            {!filtered.length && (
              <div className="empty">
                {catalogue.length ? (
                  <>
                    Nenhum Add-on corresponde à pesquisa.{" "}
                    <button
                      className="z-btn z-btn--ghost"
                      onClick={() => {
                        setQuery("");
                        setKind("");
                        setLimit(PAGE);
                      }}
                    >
                      Limpar filtros
                    </button>
                  </>
                ) : (
                  "O catálogo ainda não tem Add-ons aprovados. O Administrador pode sincronizá-lo e aprovar novas entradas."
                )}
              </div>
            )}
            <p className="note">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.01" />
              </svg>
              Falta algum? Pede ao Administrador para o aprovar. Por segurança,
              não é possível instalar um Add-on pelo endereço.
            </p>
          </section>
        </div>
        <dialog
          ref={dialog}
          className="z-sheet sheet addon-dialog"
          onCancel={() => setEditing(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
          aria-labelledby="addon-config-title"
        >
          <button
            className="z-icon-btn z-sheet__close"
            onClick={() => setEditing(null)}
            aria-label="Fechar"
          >
            ×
          </button>
          <form
            className="z-sheet__body"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing) return;
              let entry: Record<string, unknown> = { config };
              if (byUrl(editing)) {
                const url = manifest
                  .trim()
                  .replace(/^stremio:\/\//i, "https://");
                const problem = manifestProblem(url, editing.manifestUrl);
                setManifestError(problem);
                if (problem) return;
                entry = { manifestUrl: url };
              }
              void mutate(editing.id, async () => {
                if (installing)
                  await save({
                    addons: [
                      ...installed,
                      { id: editing.id, enabled: true, ...entry },
                    ],
                  });
                else await update(editing.id, entry);
                setEditing(null);
                setAnnouncement("Configuração guardada.");
              });
            }}
          >
            <div className="sh-head">
              <span className="tok" aria-hidden="true">
                {editing?.name[0]}
              </span>
              <div>
                <h2 className="z-t2" id="addon-config-title">
                  Configurar {editing?.name}
                </h2>
                <p className="z-foot">
                  Só tu vês esta configuração. A chave fica guardada na tua
                  conta.
                </p>
              </div>
            </div>
            {editing && /torrentio/i.test(editing.name || editing.id) ? (
              <>
                <label className="z-field">
                  <span className="z-label">Serviço Debrid</span>
                  <select
                    className="z-input"
                    aria-label="Serviço Debrid"
                    value={config.debridProvider || ""}
                    onChange={(e) =>
                      setConfig({ ...config, debridProvider: e.target.value })
                    }
                  >
                    <option value="">Nenhum</option>
                    <option value="realdebrid">Real-Debrid</option>
                    <option value="alldebrid">AllDebrid</option>
                    <option value="premiumize">Premiumize</option>
                  </select>
                  <p className="z-help">
                    Com um serviço Debrid, as Fontes em cache começam logo a
                    reproduzir.
                  </p>
                </label>
                <label
                  className="z-field"
                  style={{ opacity: config.debridProvider ? 1 : 0.45 }}
                >
                  <span className="z-label">Chave API</span>
                  <div className="z-input-wrap">
                    {" "}
                    <input
                      className="z-input z-input--mono"
                      type={showApi ? "text" : "password"}
                      autoComplete="off"
                      aria-label="Chave API"
                      value={config.apiKey || ""}
                      disabled={!config.debridProvider}
                      required={!!config.debridProvider}
                      onChange={(e) =>
                        setConfig({ ...config, apiKey: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-pressed={showApi}
                      onClick={() => setShowApi(!showApi)}
                    >
                      {showApi ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                  <p className="z-help">
                    {config.debridProvider
                      ? "Copia a chave da tua conta Debrid, na página da API."
                      : "Escolhe um serviço Debrid para usar uma chave."}
                  </p>
                </label>
                {[
                  {
                    key: "providers",
                    title: "Fornecedores",
                    options: providers,
                    fallback: providers.map(([id]) => id).join(","),
                  },
                  {
                    key: "qualityfilter",
                    title: "Qualidades a excluir",
                    options: qualities,
                    fallback: "",
                  },
                ].map((group) => {
                  const selected = String(config[group.key] ?? group.fallback)
                    .split(",")
                    .filter(Boolean);
                  return (
                    <fieldset
                      key={group.key}
                      className={
                        group.key === "qualityfilter" ? "q" : undefined
                      }
                    >
                      <legend className="z-label">{group.title}</legend>
                      <div className="z-chips">
                        {group.options.map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className="z-chip"
                            aria-pressed={selected.includes(id)}
                            onClick={() => {
                              if (
                                group.key === "providers" &&
                                selected.length === 1 &&
                                selected.includes(id)
                              ) {
                                setError("Escolhe pelo menos um fornecedor.");
                                return;
                              }
                              setConfig({
                                ...config,
                                [group.key]: (selected.includes(id)
                                  ? selected.filter((v) => v !== id)
                                  : [...selected, id]
                                ).join(","),
                              });
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
                <label className="z-field">
                  <span className="z-label">Ordenar Fontes por</span>
                  <select
                    className="z-input"
                    aria-label="Ordenar Fontes por"
                    value={config.sort || "qualityseeders"}
                    onChange={(e) =>
                      setConfig({ ...config, sort: e.target.value })
                    }
                  >
                    <option value="qualityseeders">
                      Qualidade, depois seeders
                    </option>
                    <option value="qualitysize">
                      Qualidade, depois tamanho
                    </option>
                    <option value="seeders">Seeders</option>
                    <option value="size">Tamanho</option>
                  </select>
                </label>
              </>
            ) : editing && byUrl(editing) ? (
              <>
                <p className="z-callout z-muted">
                  Na página de configuração do Add-on escolhe as opções e copia
                  o URL do manifesto que ela gera. Depois cola-o aqui.
                </p>
                <a
                  className="z-btn z-btn--secondary z-btn--sm cfg-link"
                  href={editing.manifestUrl.replace(
                    /\/manifest\.json$/,
                    "/configure",
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir página de configuração
                </a>
                <label className="z-field">
                  <span className="z-label">URL do manifesto configurado</span>
                  <div className="z-input-wrap">
                    <input
                      className="z-input z-input--mono"
                      type={showUrl ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="URL do manifesto configurado"
                      aria-invalid={!!manifestError}
                      aria-describedby="manifest-help"
                      placeholder="https://…/manifest.json"
                      value={manifest}
                      onChange={(e) => {
                        setManifest(e.target.value);
                        setManifestError("");
                      }}
                    />
                    <button
                      type="button"
                      aria-pressed={showUrl}
                      onClick={() => setShowUrl(!showUrl)}
                    >
                      {showUrl ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                  <p
                    id="manifest-help"
                    className={`z-help${manifestError ? " is-error" : ""}`}
                  >
                    {manifestError ||
                      "Pode conter chaves tuas, por isso fica só na tua conta."}
                  </p>
                </label>
              </>
            ) : (
              editing?.configFields?.map(field)
            )}
            {error && (
              <p className="z-msg" role="alert">
                {error}
              </p>
            )}
            <div className="sh-actions">
              <button className="z-btn z-btn--primary" disabled={!!busy}>
                {installing ? "Guardar e instalar" : "Guardar"}
              </button>
              <button
                type="button"
                className="z-btn z-btn--ghost"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </Page>
  );
}
