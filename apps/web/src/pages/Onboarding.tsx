import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useMemberState } from "../lib/session";
import { api } from "../lib/api";
import "./onboarding.css";
type Addon = {
  id: string;
  name: string;
  description: string;
  configurationRequired?: boolean;
};
export default function Onboarding() {
  const cloudCanvas = useRef<HTMLCanvasElement>(null),
    boltCanvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<HTMLDivElement>(null),
    world = useRef<any>(null),
    bolts = useRef<any>(null);
  const altitude = useRef({ p: 0 });
  const { state, save, loading, error: stateError } = useMemberState();
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [audioLanguages, setAudioLanguages] = useState<string[]>([
      "pt-PT",
      "original",
    ]),
    [subtitleLanguages, setSubtitleLanguages] = useState<string[]>(["pt-PT"]),
    [key, setKey] = useState(""),
    [addons, setAddons] = useState<Addon[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [list, setList] = useState<{
      name: string;
      type: "m3u" | "xtream";
      url: string;
      username: string;
      password: string;
    }>({
      name: "",
      type: "xtream",
      url: "",
      username: "",
      password: "",
    });
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    Promise.all([import("three"), import("../lib/fx.js")])
      .then(([THREE, fx]) => {
        if (cancelled || !cloudCanvas.current || !boltCanvas.current) return;
        Object.assign(window, { THREE, gsap });
        world.current = (fx as any).clouds(cloudCanvas.current, { count: 84 });
        bolts.current = (fx as any).lightning(boltCanvas.current, {
          ambient: false,
          palette: "warm",
        });
        world.current.set(altitude.current.p);
        dispose = () => {
          world.current?.destroy();
          bolts.current?.destroy();
          world.current = null;
          bolts.current = null;
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      dispose();
      gsap.killTweensOf(altitude.current);
    };
  }, []);
  useEffect(() => {
    const apply = () => {
      const p = altitude.current.p,
        w = innerWidth,
        h = innerHeight;
      const size =
        w <= 760
          ? Math.min(w * 1.3, h * 0.75)
          : Math.min(940, h * 1.08, w * 0.9);
      const root = scene.current;
      root?.style.setProperty("--S", `${size}px`);
      root?.style.setProperty("--art-y", `${(-0.62 + 0.59 * p) * size}px`);
      root?.style.setProperty("--sharp", String(Math.pow(p, 1.4)));
      root?.style.setProperty("--soft", String(0.55 - 0.35 * p));
      root?.style.setProperty("--sun", String(0.08 + 0.92 * p * p));
      root?.style.setProperty("--sun-scale", String(0.7 + 0.45 * p));
      root?.style.setProperty("--dawn", String(p));
      const text = root?.parentElement?.querySelector(".alt b");
      if (text)
        text.textContent = `${Math.round(p * 2918).toLocaleString("pt-PT")} m`;
      world.current?.set(p);
    };
    apply();
    addEventListener("resize", apply);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tween = gsap.to(altitude.current, {
      p: step / 5,
      duration: reduced ? 0 : 2.2,
      ease: "power2.inOut",
      onUpdate: apply,
    });
    return () => {
      tween.kill();
      removeEventListener("resize", apply);
    };
  }, [step]);
  useEffect(() => {
    if (!scene.current) return;
    const context = gsap.context(() => {
      const paths = Array.from(scene.current!.querySelectorAll("#strike path"));
      gsap.set(paths, { strokeDashoffset: 1, opacity: 1 });
      gsap.set("#charge", { opacity: 0, scale: 0.4, svgOrigin: "108 186" });
      gsap.set(".flash", { opacity: 0 });
      if (step !== 5) return;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timeline = gsap.timeline({ delay: reduced ? 0.6 : 1.9 });
      if (reduced)
        timeline
          .to("#charge", { opacity: 0.6, scale: 1, duration: 0.8 })
          .to(paths, { strokeDashoffset: 0, duration: 0 })
          .fromTo(paths, { opacity: 0 }, { opacity: 0.5, duration: 0.8 });
      else
        timeline
          .to("#charge", {
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: "power2.in",
          })
          .to("#charge", {
            opacity: 0.55,
            scale: 0.85,
            duration: 0.4,
            yoyo: true,
            repeat: 1,
            ease: "sine.inOut",
          })
          .to(paths.slice(0, 2), {
            strokeDashoffset: 0,
            duration: 0.18,
            ease: "power4.in",
          })
          .to(
            paths.slice(2),
            { strokeDashoffset: 0, duration: 0.14, ease: "power3.in" },
            "-=.04",
          )
          .to(".flash", { opacity: 0.45, duration: 0.05 }, "-=.06")
          .to(".flash", { opacity: 0, duration: 0.7, ease: "power2.out" })
          .to(
            paths,
            { opacity: 0.35, duration: 1.6, ease: "power2.out" },
            "+=.2",
          )
          .to("#charge", { opacity: 0.45, scale: 0.7, duration: 1.2 }, "<");
    }, scene.current);
    return () => context.revert();
  }, [step]);
  useEffect(() => {
    if (state) {
      setAudioLanguages(
        state.preferences?.audioLanguages || [
          state.preferences?.language || "pt-PT",
          "original",
        ],
      );
      setSubtitleLanguages(
        state.preferences?.subtitleLanguages || [
          state.preferences?.language || "pt-PT",
        ],
      );
      setKey(state.preferences?.tmdbKey || "");
      setSelected((state.addons || []).map((a: { id: string }) => a.id));
    }
  }, [loading]);
  useEffect(() => {
    api<{ addons: Addon[] }>("/addons")
      .then((x) => setAddons(x.addons))
      .catch((e) => setError(e.message));
  }, []);
  const next = async (skip = false) => {
    setError("");
    setBusy(true);
    try {
      if (step === 1)
        await save({
          preferences: {
            ...state.preferences,
            audioLanguages,
            subtitleLanguages,
            language:
              audioLanguages.find((language) => language !== "original") ||
              "pt-PT",
            subtitles: subtitleLanguages.length > 0,
          },
        });
      if (step === 2 && !skip) {
        if (key && !/^[a-f0-9]{32}$/i.test(key))
          throw Error(
            "A chave TMDB deve ter 32 caracteres hexadecimais. Podes continuar sem chave.",
          );
        await save({ preferences: { ...state.preferences, tmdbKey: key } });
      }
      if (step === 3 && !skip)
        await save({
          addons: selected.map(
            (id) =>
              (state.addons || []).find((a: { id: string }) => a.id === id) || {
                id,
                enabled: true,
              },
          ),
        });
      if (step === 4 && !skip) {
        if (!list.url.trim())
          throw Error(
            list.type === "xtream"
              ? "Preenche o servidor, o utilizador e a palavra-passe."
              : "Preenche o endereço da lista.",
          );
        const u = new URL(list.url);
        if (!["http:", "https:"].includes(u.protocol))
          throw Error("Usa um endereço HTTP ou HTTPS.");
        if (list.type === "xtream" && (!list.username || !list.password))
          throw Error("Preenche o utilizador e a palavra-passe Xtream.");
        await save({
          iptv: [
            ...(state.iptv || []),
            {
              ...list,
              name: list.name.trim() || new URL(list.url).hostname,
              id: crypto.randomUUID(),
            },
          ],
        });
        setList({ name: "", type: "m3u", url: "", username: "", password: "" });
      }
      if (step === 5) {
        await save({ onboardingDone: true });
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          bolts.current?.strike(
            {
              x: (boltCanvas.current?.clientWidth || 800) * 0.5,
              y: (boltCanvas.current?.clientHeight || 540) * 0.98,
            },
            { palette: "warm", pulses: 1 },
          );
          await new Promise((resolve) => setTimeout(resolve, 550));
        }
        location.href = "/portal";
      } else setStep(step + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  };
  const titles = [
    "Início",
    "Idiomas",
    "TMDB",
    "Add-ons",
    "Listas IPTV",
    "Olimpo",
  ];
  const languages = [
    { id: "pt-PT", label: "Português" },
    { id: "en", label: "English" },
    { id: "es", label: "Español" },
    { id: "original", label: "Original" },
  ];
  const languageLabel = (ids: string[]) =>
    ids
      .map((id) => languages.find((l) => l.id === id)?.label || id)
      .join(", ") || "Sem preferência";
  const chips = (
    label: string,
    value: string[],
    update: (value: string[]) => void,
  ) => (
    <fieldset className="group">
      <legend>{label}</legend>
      <div className="chips">
        {languages.map((language) => (
          <button
            key={language.id}
            className="chip"
            type="button"
            aria-pressed={value.includes(language.id)}
            onClick={() =>
              update(
                value.includes(language.id)
                  ? value.filter((id) => id !== language.id)
                  : [...value, language.id],
              )
            }
          >
            <i>{value.indexOf(language.id) + 1}</i>
            {language.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="onboarding-screen">
      <div className="scene" ref={scene} aria-hidden="true">
        <div className="sky" />
        <div className="dawn" />
        <div className="art">
          <img className="soft" src="/art/img/zeus-2.webp" alt="" />
          <img className="sharp" src="/art/img/zeus-2.webp" alt="" />
          <div className="sun">
            <i className="rays" />
          </div>
        </div>
        <canvas id="clouds" ref={cloudCanvas} />
        <div className="fade" />
        <div className="art bolt-layer" id="boltLayer">
          <svg className="bolt" viewBox="0 0 626 626">
            <defs>
              <radialGradient id="gCharge">
                <stop offset="0" stopColor="#fff" />
                <stop offset=".25" stopColor="#bff6fc" />
                <stop offset=".6" stopColor="#7de3f0" stopOpacity=".35" />
                <stop offset="1" stopColor="#7de3f0" stopOpacity="0" />
              </radialGradient>
              <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <g className="charge" id="charge">
              <circle cx="108" cy="186" r="70" fill="url(#gCharge)" />
            </g>
            <g id="strike">
              <path
                pathLength="1"
                stroke="#7de3f0"
                strokeWidth="16"
                filter="url(#fGlow)"
                d="M108 196 L86 258 L104 272 L66 350 L86 362 L40 452 L60 464 L14 566 L32 578 L-24 720 L-8 734 L-60 900"
              />
              <path
                pathLength="1"
                stroke="#f2feff"
                strokeWidth="3.5"
                d="M108 196 L86 258 L104 272 L66 350 L86 362 L40 452 L60 464 L14 566 L32 578 L-24 720 L-8 734 L-60 900"
              />
              <path
                pathLength="1"
                stroke="#bff6fc"
                strokeWidth="1.6"
                d="M86 362 L120 410 L108 420 L150 488"
              />
              <path
                pathLength="1"
                stroke="#bff6fc"
                strokeWidth="1.6"
                d="M14 566 L60 610 L48 622 L92 690"
              />
            </g>
          </svg>
        </div>
        <div className="flash" id="flash"></div>
        <canvas className="ascent-bolts" ref={boltCanvas} />
      </div>
      <header className="top">
        <span className="mark" aria-label="Zeus">
          ZEUS
        </span>
        <a className="skip" href="/portal">
          Saltar
        </a>
      </header>
      <div className="alt" aria-hidden="true">
        <b>0 m</b>altitude
      </div>
      <ol className="rail" aria-hidden="true">
        {titles.map((title, i) => (
          <li
            key={title}
            className={i === step ? "on" : i < step ? "done" : ""}
          >
            {title}
          </li>
        ))}
      </ol>
      <main className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          {stateError ? (
            <section className="step">
              <h1>Não foi possível carregar as tuas escolhas.</h1>
              <p role="alert">{stateError.message}</p>
              <button
                className="btn primary"
                type="button"
                onClick={() => location.reload()}
              >
                Tentar novamente
              </button>
            </section>
          ) : loading ? (
            <section className="step">
              <h1>A carregar as tuas escolhas…</h1>
            </section>
          ) : (
            <>
              <section className="step">
                {step === 0 && (
                  <>
                    <h1>Bem-vindo ao Zeus</h1>
                    <p>
                      Filmes, séries e TV num só sítio. O Motor trata das
                      transferências por ti. Faltam quatro escolhas rápidas.
                    </p>
                  </>
                )}
                {step === 1 && (
                  <>
                    <h2>Idiomas</h2>
                    <p>
                      Escolhe por ordem de preferência. É esta ordem que decide
                      a faixa de áudio e as legendas.
                    </p>
                    {chips("Áudio", audioLanguages, setAudioLanguages)}
                    {chips("Legendas", subtitleLanguages, setSubtitleLanguages)}
                  </>
                )}
                {step === 2 && (
                  <>
                    <h2>Chave TMDB</h2>
                    <p>
                      O Zeus vai buscar capas, sinopses e elencos ao TMDB. A
                      chave fica guardada de forma cifrada no servidor.
                    </p>
                    <label className="field">
                      <span className="lbl" style={{ display: "block" }}>
                        Chave da API (v3)
                      </span>
                      <input
                        className="input"
                        id="tmdb"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="32 caracteres, por exemplo 3f9a…"
                        value={key}
                        onChange={(e) => setKey(e.target.value.trim())}
                      />
                    </label>
                    <a
                      className="help"
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Como obter uma chave
                    </a>
                    <p
                      className={`note ${key ? (/^[a-f0-9]{32}$/i.test(key) ? "ok" : "err") : ""}`}
                      aria-live="polite"
                    >
                      {!key
                        ? "Podes deixar em branco e adicionar depois nas Definições."
                        : /^[a-f0-9]{32}$/i.test(key)
                          ? "A chave tem o formato certo."
                          : "A chave tem 32 letras e números (0 a 9, a a f)."}
                    </p>
                  </>
                )}
                {step === 3 && (
                  <>
                    <h2>Add-ons</h2>
                    <p>
                      Estes add-ons fazem parte do catálogo aprovado. Podes
                      mudar isto quando quiseres.
                    </p>
                    {addons.length === 0 ? (
                      <p className="note">
                        Ainda não há Add-ons aprovados. Podes continuar e
                        instalá-los mais tarde.
                      </p>
                    ) : (
                      <ul className="addons">
                        {addons.map((addon, i) => (
                          <li key={addon.id}>
                            <span
                              className="ico"
                              style={{
                                background: ["#f5c26b", "#a78bfa", "#7de3f0"][
                                  i % 3
                                ],
                              }}
                            >
                              {addon.name[0]}
                            </span>
                            <div>
                              <b id={`addon-${i}`}>{addon.name}</b>
                              <small>
                                {addon.description}
                                {addon.configurationRequired &&
                                  " · Configuração necessária na página Add-ons."}
                              </small>
                            </div>
                            <button
                              className="switch"
                              type="button"
                              role="switch"
                              aria-checked={selected.includes(addon.id)}
                              aria-labelledby={`addon-${i}`}
                              disabled={
                                addon.configurationRequired &&
                                !selected.includes(addon.id)
                              }
                              onClick={() =>
                                setSelected(
                                  selected.includes(addon.id)
                                    ? selected.filter((id) => id !== addon.id)
                                    : [...selected, addon.id],
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {step === 4 && (
                  <>
                    <h2>Listas IPTV</h2>
                    <p>
                      As tuas listas são só tuas: os outros membros não as veem.
                    </p>
                    <div
                      className="seg"
                      role="radiogroup"
                      aria-label="Tipo de lista"
                    >
                      {(["xtream", "m3u"] as const).map((type) => (
                        <label key={type}>
                          <input
                            type="radio"
                            name="kind"
                            value={type}
                            checked={list.type === type}
                            onChange={() => setList({ ...list, type })}
                          />
                          <span>{type === "xtream" ? "Xtream" : "M3U"}</span>
                        </label>
                      ))}
                    </div>
                    <label className="field">
                      <span className="sr">
                        {list.type === "xtream"
                          ? "Servidor"
                          : "Endereço da lista M3U"}
                      </span>
                      <input
                        className="input"
                        type="url"
                        autoComplete="off"
                        value={list.url}
                        onChange={(e) =>
                          setList({ ...list, url: e.target.value })
                        }
                        placeholder={
                          list.type === "xtream"
                            ? "Servidor, por exemplo http://tv.exemplo.pt:8080"
                            : "Endereço da lista, por exemplo https://…/lista.m3u"
                        }
                      />
                    </label>
                    {list.type === "xtream" && (
                      <>
                        <label className="field">
                          <span className="sr">Utilizador</span>
                          <input
                            className="input"
                            autoComplete="off"
                            placeholder="Utilizador"
                            value={list.username}
                            onChange={(e) =>
                              setList({ ...list, username: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="sr">Palavra-passe</span>
                          <input
                            className="input"
                            type="password"
                            autoComplete="off"
                            placeholder="Palavra-passe"
                            value={list.password}
                            onChange={(e) =>
                              setList({ ...list, password: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    <p className="note" aria-live="polite" />
                  </>
                )}
                {step === 5 && (
                  <>
                    <h2>Tudo pronto</h2>
                    <p>
                      Chegaste ao Olimpo. Podes mudar qualquer escolha nas
                      Definições.
                    </p>
                    <dl className="sum">
                      <dt>Áudio</dt>
                      <dd>{languageLabel(audioLanguages)}</dd>
                      <dt>Legendas</dt>
                      <dd>{languageLabel(subtitleLanguages)}</dd>
                      <dt>TMDB</dt>
                      <dd>
                        {state.preferences.tmdbKey
                          ? "Chave guardada"
                          : "Mais tarde"}
                      </dd>
                      <dt>Add-ons</dt>
                      <dd>{selected.length} activados</dd>
                      <dt>Listas IPTV</dt>
                      <dd>
                        {state.iptv.length
                          ? `${state.iptv.length} guardadas`
                          : "Mais tarde"}
                      </dd>
                    </dl>
                  </>
                )}
              </section>
              {error && (
                <p className="note err" role="alert">
                  {error}
                </p>
              )}
              <div className="foot">
                <button
                  type="button"
                  className="btn ghost"
                  hidden={step === 0}
                  disabled={busy}
                  onClick={() => setStep(step - 1)}
                >
                  Voltar
                </button>
                <span className="count" aria-live="polite">
                  Passo {step + 1} de 6
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  hidden={step !== 4}
                  disabled={busy}
                  onClick={() => {
                    void next(true);
                  }}
                >
                  Mais tarde
                </button>
                <button className="btn primary" disabled={busy}>
                  {busy
                    ? "A guardar…"
                    : step === 0
                      ? "Começar"
                      : step === 5
                        ? "Entrar no Zeus"
                        : step === 4
                          ? "Adicionar agora"
                          : "Continuar"}
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
