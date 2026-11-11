import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Page } from "../components/Layout";
import { useMemberState } from "../lib/session";
import { api } from "../lib/api";
import "./management.css";
type Addon = {
  id: string;
  name: string;
  description: string;
  configurationRequired?: boolean;
};
export default function Onboarding() {
  const cloudCanvas = useRef<HTMLCanvasElement>(null),
    boltCanvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<HTMLElement>(null),
    world = useRef<any>(null),
    bolts = useRef<any>(null);
  const altitude = useRef({ p: 0 });
  const { state, save, loading, error: stateError } = useMemberState();
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [language, setLanguage] = useState("pt-PT"),
    [key, setKey] = useState(""),
    [addons, setAddons] = useState<Addon[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [list, setList] = useState({
      name: "",
      type: "m3u",
      url: "",
      username: "",
      password: "",
    });
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    Promise.all([import("three"), import("../lib/fx.js")])
      .then(([THREE, fx]) => {
        if (cancelled || !cloudCanvas.current || !boltCanvas.current) return;
        Object.assign(window, { THREE, gsap });
        world.current = (fx as any).clouds(cloudCanvas.current, { count: 60 });
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
    const target = step / 4;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      altitude.current.p = target;
      scene.current?.style.setProperty("--ascent", String(target));
      return;
    }
    const tween = gsap.to(altitude.current, {
      p: target,
      duration: 1.6,
      ease: "power2.inOut",
      onUpdate: () => {
        world.current?.set(altitude.current.p);
        scene.current?.style.setProperty(
          "--ascent",
          String(altitude.current.p),
        );
      },
    });
    if (step === 4)
      bolts.current?.strike(
        {
          x: (boltCanvas.current?.clientWidth || 800) * 0.64,
          y: (boltCanvas.current?.clientHeight || 540) * 0.9,
        },
        { palette: "warm", pulses: 1 },
      );
    return () => {
      tween.kill();
    };
  }, [step]);
  useEffect(() => {
    if (state) {
      setLanguage(state.preferences?.language || "pt-PT");
      setKey(state.preferences?.tmdbKey || "");
      setSelected((state.addons || []).map((a: { id: string }) => a.id));
    }
  }, [loading]);
  useEffect(() => {
    api<{ addons: Addon[] }>("/addons")
      .then((x) => setAddons(x.addons))
      .catch((e) => setError(e.message));
  }, []);
  const next = async () => {
    setError("");
    setBusy(true);
    try {
      if (step === 0)
        await save({ preferences: { ...state.preferences, language } });
      if (step === 1) {
        if (key && !/^[a-f0-9]{32}$/i.test(key))
          throw Error(
            "A chave TMDB deve ter 32 caracteres hexadecimais. Podes continuar sem chave.",
          );
        await save({ preferences: { ...state.preferences, tmdbKey: key } });
      }
      if (step === 2)
        await save({
          addons: selected.map(
            (id) =>
              (state.addons || []).find((a: { id: string }) => a.id === id) || {
                id,
                enabled: true,
              },
          ),
        });
      if (step === 3 && list.url) {
        const u = new URL(list.url);
        if (!["http:", "https:"].includes(u.protocol))
          throw Error("Usa um endereço HTTP ou HTTPS.");
        if (!list.name.trim()) throw Error("Dá um nome à Lista IPTV.");
        if (list.type === "xtream" && (!list.username || !list.password))
          throw Error("Preenche o utilizador e a palavra-passe Xtream.");
        await save({
          iptv: [...(state.iptv || []), { ...list, id: crypto.randomUUID() }],
        });
        setList({ name: "", type: "m3u", url: "", username: "", password: "" });
      }
      if (step === 4) {
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
    "Uma subida feita à tua medida.",
    "As histórias ganham rosto.",
    "Escolhe os teus aliados.",
    "O mundo em directo.",
    "O Olimpo é teu.",
  ];
  if (stateError)
    return (
      <Page>
        <div className="management-content">
          <h1 className="z-t2">Não foi possível carregar as tuas escolhas.</h1>
          <p className="mg-message mg-error" role="alert">
            {stateError.message}
          </p>
          <button
            className="z-btn z-btn--primary"
            onClick={() => location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      </Page>
    );
  return (
    <Page>
      <div className="management">
        <section
          ref={scene}
          className="mg-ascent"
          aria-labelledby="ascent-title"
        >
          <img className="mg-ascent-image" src="/art/img/zeus-2.webp" alt="" />
          <div className="mg-ascent-sun" />
          <canvas
            ref={cloudCanvas}
            className="mg-ascent-clouds"
            aria-hidden="true"
          />
          <canvas
            ref={boltCanvas}
            className="mg-ascent-bolts"
            aria-hidden="true"
          />
          <div className="mg-ascent-copy">
            <p className="mg-eyebrow">
              A subida ao Olimpo ·{" "}
              <span className="mg-altitude">
                {Math.round((step / 4) * 2918).toLocaleString("pt-PT")} m
              </span>
            </p>
            <h1 id="ascent-title" className="mg-title">
              {titles[step]}
            </h1>
            <p className="mg-lede">
              {step === 4
                ? "Chegaste ao cume. O teu mundo está pronto."
                : "Cada escolha leva-te mais alto."}
            </p>
          </div>
        </section>
        <div className="management-content mg-onboarding">
          <div className="mg-steps" aria-label={`Passo ${step + 1} de 5`}>
            {titles.map((_, i) => (
              <span key={i} className="mg-step" data-active={i <= step} />
            ))}
          </div>
          {loading ? (
            <p>A carregar as tuas escolhas…</p>
          ) : (
            <>
              <h1 className="z-t2">
                {
                  [
                    "Os teus idiomas",
                    "Chave TMDB",
                    "Os teus Add-ons",
                    "A tua primeira Lista IPTV",
                    "Tudo pronto",
                  ][step]
                }
              </h1>
              <p className="mg-lede">
                {
                  [
                    "Escolhe o idioma preferido. Podes ajustar áudio e legendas na Conta.",
                    "Opcional. Usa a tua chave pessoal para obter metadados do TMDB.",
                    "Só estão disponíveis os Add-ons aprovados pelo Administrador.",
                    "Opcional. As tuas Listas IPTV são privadas e podes adicioná-las mais tarde na TV.",
                    "As tuas escolhas ficaram guardadas. Escolhe Cinema ou TV no Portal.",
                  ][step]
                }
              </p>
              {error && (
                <p role="alert" className="mg-message mg-error">
                  {error}
                </p>
              )}
              {step === 0 && (
                <div className="mg-form">
                  <label>
                    Idioma preferido
                    <select
                      className="mg-input"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="pt-PT">Português (Portugal)</option>
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="en">Inglês</option>
                      <option value="es">Espanhol</option>
                    </select>
                  </label>
                </div>
              )}
              {step === 1 && (
                <div className="mg-form">
                  <label>
                    Chave API do TMDB
                    <input
                      className="mg-input"
                      type="password"
                      autoComplete="off"
                      value={key}
                      onChange={(e) => setKey(e.target.value.trim())}
                    />
                  </label>
                  <p className="mg-muted">
                    A chave fica guardada de forma cifrada no servidor. Não é
                    necessária para começar.
                  </p>
                </div>
              )}
              {step === 2 && (
                <div>
                  {addons.length === 0 ? (
                    <p className="mg-empty">
                      Ainda não há Add-ons aprovados. Podes continuar e
                      instalá-los mais tarde.
                    </p>
                  ) : (
                    addons.map((a) => (
                      <label key={a.id} className="mg-row mg-check">
                        <input
                          type="checkbox"
                          disabled={
                            a.configurationRequired && !selected.includes(a.id)
                          }
                          checked={selected.includes(a.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, a.id]
                                : selected.filter((id) => id !== a.id),
                            )
                          }
                        />
                        <div>
                          <b>{a.name}</b>
                          <small>
                            {a.description}
                            {a.configurationRequired &&
                              " · Precisa de configuração: instala-o na página Add-ons depois de entrar."}
                          </small>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
              {step === 3 && (
                <div className="mg-form">
                  <label>
                    Tipo
                    <select
                      className="mg-input"
                      value={list.type}
                      onChange={(e) =>
                        setList({ ...list, type: e.target.value })
                      }
                    >
                      <option value="m3u">M3U</option>
                      <option value="xtream">Xtream</option>
                    </select>
                  </label>
                  <label>
                    Nome
                    <input
                      className="mg-input"
                      value={list.name}
                      onChange={(e) =>
                        setList({ ...list, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {list.type === "m3u"
                      ? "URL da lista M3U"
                      : "URL do servidor"}
                    <input
                      className="mg-input"
                      type="url"
                      value={list.url}
                      onChange={(e) =>
                        setList({ ...list, url: e.target.value })
                      }
                      placeholder="https://…"
                    />
                  </label>
                  {list.type === "xtream" && (
                    <>
                      <label>
                        Utilizador
                        <input
                          className="mg-input"
                          value={list.username}
                          onChange={(e) =>
                            setList({ ...list, username: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Palavra-passe
                        <input
                          className="mg-input"
                          type="password"
                          value={list.password}
                          onChange={(e) =>
                            setList({ ...list, password: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {step === 4 && (
                <div className="mg-grid">
                  <div className="mg-card">
                    <span className="mg-stat">{selected.length}</span>
                    <span className="mg-stat-label">Add-ons escolhidos</span>
                  </div>
                  <div className="mg-card">
                    <span className="mg-stat">{(state.iptv || []).length}</span>
                    <span className="mg-stat-label">Listas IPTV</span>
                  </div>
                </div>
              )}
              <div className="mg-actions">
                {step > 0 && (
                  <button
                    className="z-btn z-btn--ghost"
                    disabled={busy}
                    onClick={() => setStep(step - 1)}
                  >
                    Voltar
                  </button>
                )}
                <button
                  className="z-btn z-btn--primary"
                  disabled={busy}
                  onClick={next}
                >
                  {busy
                    ? "A guardar…"
                    : step === 4
                      ? "Entrar no Zeus"
                      : "Continuar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
