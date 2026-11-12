import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useMemberState } from "../lib/session";
import gsap from "gsap";
import { api } from "../lib/api";
import "./portal.css";
type PortalEffects = {
  setMood: (value: number) => void;
  setPalette: (palette: string) => void;
  strike: (target: Element, options?: object) => boolean;
};
export default function Portal() {
  const [motor, setMotor] = useState<boolean | null>(null);
  const { state, save, loading, error: stateError } = useMemberState();
  const [hover, setHover] = useState("");
  const [leaving, setLeaving] = useState("");
  const [pending, setPending] = useState("");
  const [saveError, setSaveError] = useState("");
  const painting = useRef<HTMLDivElement>(null),
    bolts = useRef<HTMLCanvasElement>(null);
  const effects = useRef<PortalEffects | null>(null);
  const active = useRef("");
  active.current = hover;
  const leavingRef = useRef(false);
  useEffect(() => {
    let live = true;
    const check = () =>
      api<{ ok: boolean }>("/motor/status")
        .then((r) => {
          if (live) setMotor(r.ok);
        })
        .catch(() => {
          if (live) setMotor(false);
        });
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    document.title = "Zeus — O teu universo";
    let cancelled = false,
      destroy = () => {};
    Promise.all([import("three"), import("../lib/fx.js")])
      .then(([THREE, fx]) => {
        if (cancelled || !painting.current || !bolts.current) return;
        Object.assign(window, { THREE, gsap });
        const art = fx.livingPainting(painting.current, "/art/img/zeus-5.webp");
        art.state.exposure = 1;
        const sky = fx.lightning(bolts.current, {
          palette: "neutral",
          every: [5500, 11000],
          first: [1600, 3200],
          onStrike: (point: {
            x: number;
            y: number;
            color: number[];
            pulses: number;
          }) => art.flash(point, point.color, point.pulses),
        });
        effects.current = {
          setMood: (value) => art.setMood(value),
          setPalette: (value) => sky.setPalette(value),
          strike: (target, options) => sky.strike(target, options),
        };
        if (active.current) {
          art.setMood(active.current === "cinema" ? 1 : -1);
          sky.setPalette(active.current === "cinema" ? "warm" : "cool");
        }
        const entrance = gsap.context(() => {
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
            gsap.fromTo(
              ".wordmark, .hello, .slot, .foot",
              { opacity: 0, y: 18 },
              {
                opacity: 1,
                y: 0,
                duration: 1.2,
                stagger: 0.1,
                ease: "power3.out",
              },
            );
        }, painting.current.parentElement!);
        destroy = () => {
          entrance.revert();
          sky.destroy();
          art.destroy();
          effects.current = null;
        };
      })
      .catch(() => {
        /* The original image remains available without WebGL. */
      });
    return () => {
      cancelled = true;
      destroy();
    };
  }, []);
  useEffect(() => {
    effects.current?.setMood(hover === "cinema" ? 1 : hover === "tv" ? -1 : 0);
    effects.current?.setPalette(
      hover === "cinema" ? "warm" : hover === "tv" ? "cool" : "neutral",
    );
  }, [hover]);
  async function enter(event: MouseEvent<HTMLAnchorElement>, module: string) {
    if (loading || stateError || leavingRef.current) {
      event.preventDefault();
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    const target = event.currentTarget;
    leavingRef.current = true;
    setPending(module);
    setSaveError("");
    setHover(module);
    try {
      await save({ preferences: { ...state.preferences, lastModule: module } });
      setLeaving(module);
      effects.current?.strike(target, {
        palette: module === "cinema" ? "warm" : "cool",
        pulses: 1,
        width: 1.5,
      });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        await new Promise((resolve) => setTimeout(resolve, 640));
      location.assign(`/${module}`);
    } catch (error) {
      setSaveError(
        `Não foi possível guardar a tua escolha. ${error instanceof Error ? error.message : "Tenta novamente."}`,
      );
      setPending("");
      setLeaving("");
      leavingRef.current = false;
    }
  }
  const hour = new Date().getHours();
  const greeting =
    hour >= 6 && hour < 13
      ? "Bom dia"
      : hour >= 13 && hour < 20
        ? "Boa tarde"
        : "Boa noite";
  return (
    <div
      className={`portal-screen ${matchMedia("(prefers-reduced-motion: reduce)").matches ? "rm" : ""} ${hover} ${leaving ? "is-leaving" : ""}`}
    >
      <div className="portal-painting" ref={painting} aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
      <canvas id="bolts" ref={bolts} aria-hidden="true" />
      <main className="ui">
        <h1 className="wordmark" aria-label="Zeus">
          <span className="wm-text" aria-hidden="true">
            ZEUS
          </span>
          <span className="wm-glow" aria-hidden="true">
            ZEUS
          </span>
        </h1>
        <div />
        <section className="choose" aria-labelledby="hello">
          <div className="hello">
            <h2 id="hello">{greeting}</h2>
            <p>Escolha por onde quer começar.</p>
          </div>
          <nav className="modules" aria-label="Módulos">
            {[
              { id: "tv", name: "TV", description: "Canais em directo" },
              { id: "cinema", name: "Cinema", description: "Filmes e séries" },
            ].map((module) => (
              <div className="slot" key={module.id}>
                <a
                  href={
                    loading || !!stateError || !!pending
                      ? undefined
                      : `/${module.id}`
                  }
                  role="link"
                  tabIndex={0}
                  aria-disabled={loading || !!stateError || !!pending}
                  className={`card ${module.id === "tv" ? "cool" : "warm"} ${leaving === module.id ? "chosen" : ""}`}
                  aria-busy={pending === module.id}
                  onPointerEnter={() => setHover(module.id)}
                  onPointerLeave={(e) => {
                    if (!leavingRef.current) setHover("");
                    e.currentTarget.classList.remove("tracking");
                    e.currentTarget.style.setProperty("--rx", "0deg");
                    e.currentTarget.style.setProperty("--ry", "0deg");
                  }}
                  onPointerMove={(e) => {
                    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
                      return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - r.left) / r.width,
                      y = (e.clientY - r.top) / r.height;
                    e.currentTarget.classList.add("tracking");
                    e.currentTarget.style.setProperty(
                      "--rx",
                      `${(0.5 - y) * 8}deg`,
                    );
                    e.currentTarget.style.setProperty(
                      "--ry",
                      `${(x - 0.5) * 10}deg`,
                    );
                    e.currentTarget.style.setProperty("--gx", `${x * 100}%`);
                    e.currentTarget.style.setProperty("--gy", `${y * 100}%`);
                  }}
                  onFocus={() => setHover(module.id)}
                  onBlur={() => {
                    if (!leavingRef.current) setHover("");
                  }}
                  onClick={(event) => {
                    void enter(event, module.id);
                  }}
                >
                  <span className="glare" />
                  <div className="card-top">
                    <svg
                      className="icon"
                      viewBox="0 0 32 32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {module.id === "tv" ? (
                        <>
                          <rect x="3" y="9" width="26" height="18" rx="4" />
                          <path d="M11 3l5 6 5-6M12 31h8" />
                        </>
                      ) : (
                        <>
                          <rect x="4" y="5" width="24" height="22" rx="4" />
                          <path d="M10 5v22M22 5v22M4 12h6M4 20h6M22 12h6M22 20h6" />
                        </>
                      )}
                    </svg>
                    {state.preferences.lastModule === module.id && (
                      <span className="badge">Último usado</span>
                    )}
                  </div>
                  <h3>{module.name}</h3>
                  <p>
                    {module.id === "tv" && (
                      <span className="live" aria-hidden="true" />
                    )}
                    {module.description}
                  </p>
                </a>
              </div>
            ))}
          </nav>
          {(loading || pending) && (
            <p className="portal-save-status" role="status">
              {loading
                ? "A carregar as tuas escolhas…"
                : "A guardar a tua escolha…"}
            </p>
          )}
          {(saveError || stateError) && (
            <div className="portal-save-error" role="alert">
              <p>
                {saveError || "Não foi possível carregar as tuas escolhas."}
              </p>
              {stateError ? (
                <button type="button" onClick={() => location.reload()}>
                  Tentar novamente
                </button>
              ) : (
                <p>Selecciona o módulo para tentar novamente.</p>
              )}
            </div>
          )}
        </section>
        <footer className="foot">
          <span
            className={`chip ${motor === false ? "offline" : ""}`}
            role="status"
          >
            <i aria-hidden="true" />
            {motor === null
              ? "A ligar ao Motor…"
              : motor
                ? "Motor ligado"
                : "Motor desligado"}
          </span>
        </footer>
      </main>
      <div id="veil" className={leaving ? "on" : ""} aria-hidden="true" />
    </div>
  );
}
