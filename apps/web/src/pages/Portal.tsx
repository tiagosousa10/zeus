import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useSession, useMemberState } from "../lib/session";
import gsap from "gsap";
import "./portal.css";
type PortalEffects = {
  setMood: (value: number) => void;
  setPalette: (palette: string) => void;
  strike: (target: Element, options?: object) => boolean;
};
export default function Portal() {
  const { user } = useSession();
  const { state, save, loading } = useMemberState();
  const [hover, setHover] = useState("");
  const [leaving, setLeaving] = useState("");
  const painting = useRef<HTMLDivElement>(null),
    bolts = useRef<HTMLCanvasElement>(null);
  const effects = useRef<PortalEffects | null>(null);
  const active = useRef("");
  active.current = hover;
  const leavingRef = useRef(false);
  useEffect(() => {
    document.title = "Zeus — O teu universo";
    let cancelled = false,
      destroy = () => {};
    Promise.all([import("three"), import("../lib/fx.js")])
      .then(([THREE, fx]) => {
        if (cancelled || !painting.current || !bolts.current) return;
        Object.assign(window, { THREE, gsap });
        const art = fx.livingPainting(painting.current, "/art/img/zeus-5.webp");
        art.state.exposure = 0.9;
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
              ".portal-heading, .portal-tile, .portal-settings",
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
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(module);
    setHover(module);
    effects.current?.strike(event.currentTarget, {
      palette: module === "cinema" ? "warm" : "cool",
      pulses: 1,
      width: 1.5,
    });
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 640;
    const preference = loading
      ? Promise.resolve()
      : save({
          preferences: { ...state.preferences, lastModule: module },
        }).catch(() => {});
    await Promise.all([
      new Promise((resolve) => setTimeout(resolve, delay)),
      Promise.race([
        preference,
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]),
    ]);
    location.assign(`/${module}`);
  }
  return (
    <div className={`portal-screen ${hover} ${leaving ? "is-leaving" : ""}`}>
      <section className="portal-stage">
        <div className="portal-painting" ref={painting} aria-hidden="true" />
        <div className="portal-vignette" aria-hidden="true" />
        <canvas className="portal-bolts" ref={bolts} aria-hidden="true" />
        <div className="portal-copy">
          <a href="/conta" className="portal-member">
            {user?.name}
            <span>↗</span>
          </a>
          <div className="portal-heading">
            <p className="eyebrow">O teu universo começa aqui</p>
            <h1>ZEUS</h1>
            <p>
              Histórias que ficam.
              <br />
              Um mundo à tua escolha.
            </p>
          </div>
          <div className="portal-choices">
            {[
              {
                id: "cinema",
                name: "Cinema",
                symbol: "Ⅰ",
                description: "Filmes. Séries. Outros mundos.",
              },
              {
                id: "tv",
                name: "TV",
                symbol: "Ⅱ",
                description: "O mundo, neste preciso instante.",
              },
            ].map((module) => (
              <a
                key={module.id}
                href={`/${module.id}`}
                className={`portal-tile ${module.id} ${leaving === module.id ? "is-selected" : ""}`}
                aria-busy={leaving === module.id}
                onPointerEnter={() => setHover(module.id)}
                onPointerLeave={() => {
                  if (!leavingRef.current) setHover("");
                }}
                onFocus={() => setHover(module.id)}
                onBlur={() => {
                  if (!leavingRef.current) setHover("");
                }}
                onClick={(event) => {
                  void enter(event, module.id);
                }}
              >
                <span className="portal-num">{module.symbol}</span>
                <span>
                  <strong>{module.name}</strong>
                  <small>{module.description}</small>
                </span>
                <span className="portal-arrow">↗</span>
                {state.preferences.lastModule === module.id && (
                  <em>Último usado</em>
                )}
              </a>
            ))}
          </div>
          <a className="portal-settings" href="/conta">
            Conta e definições <span>→</span>
          </a>
        </div>
      </section>
    </div>
  );
}
