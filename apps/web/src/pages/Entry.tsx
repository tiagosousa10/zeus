import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import gsap from "gsap";
import "./entry.css";
export default function Entry() {
  const { user, refresh } = useSession();
  const authInProgress = useRef(false);
  const bustRef = useRef<HTMLDivElement>(null),
    lampRef = useRef<HTMLDivElement>(null),
    lampImageRef = useRef<HTMLImageElement>(null),
    formRef = useRef<HTMLFormElement>(null);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [showPassword, setShowPassword] = useState(false),
    [showInvite, setShowInvite] = useState(false),
    [inviteValue, setInviteValue] = useState("");

  const turnstileBox = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);
  const [siteKey, setSiteKey] = useState<string | null>(null),
    [turnstileToken, setTurnstileToken] = useState(""),
    [recovery, setRecovery] = useState(false);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset") === "1" ? params.get("token") : null;
  const token =
    params.get("invite") ||
    params.get("convite") ||
    (!params.has("reset") ? params.get("token") : null);
  const [required, setRequired] = useState<boolean | null>(null),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [stage, setStage] = useState<
      "login" | "enroll" | "verify" | "forgot" | "reset"
    >(resetToken ? "reset" : "login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uri, setUri] = useState(""),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [saved, setSaved] = useState(false),
    [emailConfigured, setEmailConfigured] = useState(false),
    [message, setMessage] = useState(""),
    [repeat, setRepeat] = useState("");
  useEffect(() => {
    const bust = bustRef.current,
      lamp = lampRef.current,
      img = lampImageRef.current;
    if (!bust || !lamp || !img) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9, size: 1 };
    const place = () => {
      const h = light.size * 0.31;
      lamp.style.transform = `translate3d(${light.x - h}px,${light.y - h}px,0)`;
      img.style.transform = `translate3d(${h - light.x}px,${h - light.y}px,0)`;
    };
    const measure = () => {
      light.size = bust.offsetWidth;
      light.x = light.tx = light.size * (!!token ? 0.6 : 0.34);
      light.y = light.ty = light.size * (!!token ? 0.54 : 0.3);
      place();
    };
    const move = (e: PointerEvent) => {
      const r = bust.getBoundingClientRect();
      light.tx = ((e.clientX - r.left) * light.size) / r.width;
      light.ty = ((e.clientY - r.top) * light.size) / r.height;
      light.last = performance.now();
    };
    const tick = (time: number, dt: number) => {
      if (performance.now() - light.last > 3500) {
        const t = time * 0.42;
        light.tx =
          light.size *
          ((!!token ? 0.58 : 0.47) +
            (!!token ? 0.1 : 0.13) * Math.cos(t * 0.5));
        light.ty =
          light.size *
          ((!!token ? 0.5 : 0.38) +
            (!!token ? 0.08 : 0.09) * Math.sin(t * 0.8));
      }
      const k =
        1 - Math.exp(-dt / (performance.now() - light.last < 3500 ? 140 : 600));
      light.x += (light.tx - light.x) * k;
      light.y += (light.ty - light.y) * k;
      place();
    };
    measure();
    addEventListener("resize", measure);
    const context = gsap.context(() => {
      if (!reduced) {
        gsap.to(".breath", {
          scale: 1.014,
          duration: 5.5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        gsap.from(".panel", {
          opacity: 0,
          y: 18,
          duration: 1.1,
          ease: "expo.out",
        });
      }
    }, bust.closest(".entry-screen")!);
    if (!reduced) {
      addEventListener("pointermove", move, { passive: true });
      gsap.ticker.add(tick);
    }
    return () => {
      removeEventListener("resize", measure);
      removeEventListener("pointermove", move);
      gsap.ticker.remove(tick);
      context.revert();
    };
  }, [token]);
  useEffect(() => {
    api<{ turnstileSiteKey: string | null; emailConfigured: boolean }>(
      "/config",
    )
      .then((x) => {
        setSiteKey(x.turnstileSiteKey);
        setEmailConfigured(x.emailConfigured);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!siteKey || !["login", "forgot"].includes(stage)) return;
    const win = window as any;
    const render = () => {
      if (turnstileBox.current)
        turnstileWidget.current = win.turnstile.render(turnstileBox.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: setTurnstileToken,
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => {
            setTurnstileToken("");
            setError("A verificação de segurança falhou. Tenta novamente.");
          },
        });
    };
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-zeus-turnstile]",
    );
    if (win.turnstile) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.dataset.zeusTurnstile = "true";
        script.async = true;
        document.head.append(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      script?.removeEventListener("load", render);
      if (turnstileWidget.current !== undefined)
        win.turnstile?.remove(turnstileWidget.current);
      turnstileWidget.current = undefined;
    };
  }, [siteKey, stage]);
  useEffect(() => {
    api<{ required: boolean }>("/bootstrap")
      .then((x) => setRequired(x.required))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (
      authInProgress.current ||
      !user ||
      token ||
      stage === "forgot" ||
      stage === "reset"
    )
      return;
    if (!user.twoFactorEnabled) setStage("enroll");
    else if (!user.twoFactorVerified) setStage("verify");
    else location.replace("/portal");
  }, [user, token]);
  useEffect(() => {
    if (uri)
      QRCode.toDataURL(uri, { width: 240, margin: 2 })
        .then(setQr)
        .catch(() =>
          setError("Não foi possível gerar o QR. Usa a chave manual abaixo."),
        );
  }, [uri]);
  const act = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    authInProgress.current = true;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (stage === "forgot") {
        await api("/auth/request-password-reset", {
          method: "POST",
          headers: turnstileToken
            ? { "x-turnstile-token": turnstileToken }
            : {},
          body: JSON.stringify({
            email,
            redirectTo: location.origin + "/entrada?reset=1",
          }),
        });
        setMessage(
          "Se existir uma conta com este email, receberás uma ligação para repor a palavra-passe.",
        );
      } else if (stage === "reset") {
        if (password !== repeat)
          throw Error("As palavras-passe não coincidem.");
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, newPassword: password }),
        });
        history.replaceState(null, "", "/entrada");
        setPassword("");
        setRepeat("");
        setStage("login");
        setMessage(
          "Palavra-passe alterada. Já podes entrar com a nova palavra-passe.",
        );
      } else if (stage === "login") {
        if (required) {
          await api("/bootstrap", {
            method: "POST",
            body: JSON.stringify({ name, email, password, turnstileToken }),
          });
          setStage("enroll");
          await refresh();
        } else if (token) {
          await api("/invites/accept", {
            method: "POST",
            body: JSON.stringify({ token, name, password, turnstileToken }),
          });
          setStage("enroll");
          await refresh();
        } else {
          const r = await api<{ twoFactorRedirect?: boolean }>(
            "/auth/sign-in/email",
            {
              method: "POST",
              headers: turnstileToken
                ? { "x-turnstile-token": turnstileToken }
                : {},
              body: JSON.stringify({ email, password }),
            },
          );
          if (r.twoFactorRedirect) setStage("verify");
          else {
            await refresh();
            const s = await api<{
              user: {
                twoFactorEnabled?: boolean;
                twoFactorVerified?: boolean;
              } | null;
            }>("/session");
            if (s.user?.twoFactorVerified) location.href = "/portal";
            else setStage(s.user?.twoFactorEnabled ? "verify" : "enroll");
          }
        }
      } else if (stage === "enroll" && !uri) {
        const r = await api<{ totpURI: string; backupCodes: string[] }>(
          "/auth/two-factor/enable",
          { method: "POST", body: JSON.stringify({ password }) },
        );
        setUri(r.totpURI);
        setCodes(r.backupCodes);
      } else {
        await api(
          recovery && stage === "verify"
            ? "/auth/two-factor/verify-backup-code"
            : "/auth/two-factor/verify-totp",
          {
            method: "POST",
            body: JSON.stringify({ code, trustDevice: false }),
          },
        );
        await refresh();
        location.href = stage === "enroll" ? "/onboarding" : "/portal";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
      if (stage === "verify" && !recovery) {
        setCode("");
        digitRefs.current[0]?.focus();
      }
    } finally {
      setBusy(false);
      // O widget já foi removido se a entrada avançou para outro passo.
      if (turnstileWidget.current !== undefined) {
        setTurnstileToken("");
        (window as any).turnstile?.reset(turnstileWidget.current);
      }
    }
  };
  const secret = uri ? new URL(uri).searchParams.get("secret") : null;
  const totpStage = stage === "verify" || stage === "enroll";
  const inputCode = (value: string, index: number) => {
    const clean = value.replace(/\D/g, "");
    const next =
      clean.length > 1
        ? clean.slice(0, 6)
        : code.slice(0, index).padEnd(index, " ") +
          clean +
          code.slice(index + 1);
    setCode(next.trimEnd());
    if (clean) digitRefs.current[Math.min(5, index + clean.length)]?.focus();
    if (/^\d{6}$/.test(next) && stage === "verify")
      requestAnimationFrame(() => formRef.current?.requestSubmit());
  };
  return (
    <div className="entry-screen">
      <p className="wordmark" aria-label="Zeus">
        ZEUS
      </p>
      <div
        className={`stage ${totpStage ? "stage-hidden" : ""}`}
        id="marble"
        aria-hidden="true"
      >
        <div className="bust" ref={bustRef}>
          <div className="breath">
            <img
              className="base"
              src="/art/img/zeus-6.webp"
              alt=""
              width="794"
              height="794"
            />
            <div className="lamp" ref={lampRef}>
              <img
                ref={lampImageRef}
                src="/art/img/zeus-6.webp"
                alt=""
                width="794"
                height="794"
              />
              <div className="tint" style={{ opacity: token ? 0.5 : 0 }} />
              <div className="bloom" />
            </div>
          </div>
        </div>
      </div>
      <div
        className={`stage ${totpStage ? "stage-visible" : ""}`}
        id="temple"
        aria-hidden="true"
      >
        <div className="bust">
          <div className="breath">
            <img
              className="t-base"
              src="/art/img/zeus-3.webp"
              alt=""
              width="626"
              height="626"
            />
            <img
              className="t-lit"
              src="/art/img/zeus-3.webp"
              alt=""
              width="626"
              height="626"
              style={{ opacity: (code.replace(/\D/g, "").length / 6) * 0.7 }}
            />
            <svg className="arcs" viewBox="0 0 626 626">
              {[-160, -120, -75, -20, 35, 100].map((angle, i) => {
                const rad = (angle * Math.PI) / 180,
                  x = 313 + Math.cos(rad) * 145,
                  y = 190 + Math.sin(rad) * 145;
                const endX = 313 + Math.cos(rad) * 340,
                  endY = 190 + Math.sin(rad) * 340;
                const d = `M${x} ${y} L${x + (endX - x) * 0.4 + 18} ${y + (endY - y) * 0.4} l-24 15 L${endX} ${endY}`;
                return (
                  <g key={angle} style={{ opacity: code.length > i ? 1 : 0 }}>
                    <path
                      className="glow"
                      d={d}
                      pathLength="1"
                      style={{ strokeDashoffset: code.length > i ? 0 : 1 }}
                    />
                    <path
                      className="core"
                      d={d}
                      pathLength="1"
                      style={{ strokeDashoffset: code.length > i ? 0 : 1 }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      <div className="grain" aria-hidden="true" />
      <main>
        <div className="panel">
          <section className="view">
            <h1>
              {stage === "forgot"
                ? "Recuperar palavra-passe"
                : stage === "reset"
                  ? "Nova palavra-passe"
                  : stage === "verify"
                    ? "Verificação em dois passos"
                    : stage === "enroll"
                      ? "Configurar autenticador"
                      : required
                        ? "Criar Administrador"
                        : token
                          ? "Aceitar convite"
                          : "Entrar"}
            </h1>
            {stage === "login" && !required && !token ? (
              <div className="gap" />
            ) : (
              <p className="lede">
                {stage === "forgot"
                  ? "Enviamos-te uma ligação para escolher uma nova palavra-passe."
                  : stage === "reset"
                    ? "Escolhe uma palavra-passe com pelo menos 12 caracteres."
                    : stage === "verify"
                      ? "Abre a app de autenticação e introduz o código de 6 dígitos."
                      : stage === "enroll"
                        ? "A autenticação em dois passos protege a tua conta Zeus."
                        : required
                          ? "Cria a primeira conta de Administrador para começar."
                          : "Aceita o teu convite para o Zeus e cria a tua conta."}
              </p>
            )}
            {stage === "login" && user && token && (
              <p className="note">
                Já tens uma sessão aberta. Para aceitar este convite,{" "}
                <button
                  className="linkbtn"
                  onClick={async () => {
                    try {
                      await api("/auth/sign-out", {
                        method: "POST",
                        body: "{}",
                      });
                      location.reload();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível sair.",
                      );
                    }
                  }}
                >
                  sai da conta actual
                </button>
                .
              </p>
            )}
            <form onSubmit={act} ref={formRef}>
              {stage === "login" && (required || token) && (
                <div className="field">
                  <label htmlFor="entry-name">Nome</label>
                  <input
                    id="entry-name"
                    className="input"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              {(stage === "forgot" || (stage === "login" && !token)) && (
                <div className="field">
                  <label htmlFor="entry-email">Email</label>
                  <input
                    id="entry-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              )}
              {(stage === "login" ||
                stage === "reset" ||
                (stage === "enroll" && !uri)) && (
                <div className="field">
                  <label htmlFor="entry-password">
                    {stage === "reset"
                      ? "Nova palavra-passe"
                      : stage === "enroll"
                        ? "Confirma a tua palavra-passe"
                        : "Palavra-passe"}
                  </label>
                  <div className="input-wrap">
                    <input
                      id="entry-password"
                      className="input"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        required || token || stage === "reset"
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={
                        required || token || stage === "reset" ? 12 : undefined
                      }
                      required
                    />
                    <button
                      className="reveal"
                      type="button"
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>
              )}
              {stage === "reset" && (
                <div className="field">
                  <label htmlFor="entry-repeat">
                    Repete a nova palavra-passe
                  </label>
                  <input
                    id="entry-repeat"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    minLength={12}
                    required
                  />
                </div>
              )}
              {stage === "login" && !required && !token && (
                <div className="row">
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => {
                      setStage("forgot");
                      setError("");
                      setMessage("");
                    }}
                  >
                    Esqueci-me da palavra-passe
                  </button>
                </div>
              )}
              {stage === "forgot" && !emailConfigured && (
                <p className="note">
                  O envio de emails de recuperação ainda não está configurado.
                  Contacta o teu Administrador.
                </p>
              )}
              {stage === "enroll" && uri && (
                <>
                  <p className="note">Lê o QR na tua app de autenticação.</p>
                  {qr && (
                    <img
                      className="qr"
                      src={qr}
                      alt="QR para configurar a autenticação em dois passos"
                    />
                  )}
                  <details>
                    <summary>Usar chave manual</summary>
                    <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
                  </details>
                  <h2 className="recovery-title">
                    Guarda os códigos de recuperação
                  </h2>
                  <p className="note">
                    Cada código pode ser usado uma vez. Guarda-os num local
                    privado fora deste dispositivo.
                  </p>
                  <ul className="recovery-codes">
                    {codes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={saved}
                      onChange={(e) => setSaved(e.target.checked)}
                    />
                    Guardei os códigos de recuperação.
                  </label>
                </>
              )}
              {(stage === "verify" || uri) &&
                (recovery ? (
                  <div className="field">
                    <label htmlFor="entry-recovery">
                      Código de recuperação
                    </label>
                    <input
                      id="entry-recovery"
                      className="input"
                      autoComplete="off"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <fieldset>
                    <legend className="label">Código de 6 dígitos</legend>
                    <div className="code">
                      {Array.from({ length: 6 }, (_, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            digitRefs.current[i] = el;
                          }}
                          className={`input digit ${code[i]?.trim() ? "filled" : ""}`}
                          inputMode="numeric"
                          autoComplete={i === 0 ? "one-time-code" : "off"}
                          aria-label={`Dígito ${i + 1} de 6`}
                          value={code[i]?.trim() || ""}
                          onChange={(e) => inputCode(e.target.value, i)}
                          onPaste={(e) => {
                            e.preventDefault();
                            inputCode(e.clipboardData.getData("text"), 0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !code[i] && i)
                              digitRefs.current[i - 1]?.focus();
                          }}
                          required
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
              {["login", "forgot"].includes(stage) && (
                <>
                  <span className="label">Verificação Cloudflare</span>
                  {siteKey ? (
                    <div className="ts real-turnstile" ref={turnstileBox} />
                  ) : (
                    <div className="ts">
                      <span className="ts-text">Não configurada</span>
                      <span className="ts-brand">
                        <b>Cloudflare</b>Verificação indisponível
                      </span>
                    </div>
                  )}
                </>
              )}
              {(stage !== "verify" || recovery) && (
                <button
                  className="btn"
                  aria-busy={busy}
                  disabled={
                    busy ||
                    !!(stage === "login" && user && token) ||
                    required === null ||
                    (stage === "forgot" && !emailConfigured) ||
                    (["login", "forgot"].includes(stage) &&
                      !!siteKey &&
                      !turnstileToken) ||
                    (stage === "enroll" && !!uri && !saved)
                  }
                >
                  {busy
                    ? "A verificar…"
                    : stage === "forgot"
                      ? "Enviar ligação"
                      : stage === "reset"
                        ? "Guardar palavra-passe"
                        : stage === "verify" || uri
                          ? "Verificar"
                          : stage === "enroll"
                            ? "Configurar autenticador"
                            : required
                              ? "Criar Administrador"
                              : token
                                ? "Aceitar convite"
                                : "Continuar"}
                </button>
              )}
              <p className={`msg ${message ? "ok" : ""}`} aria-live="assertive">
                {error ||
                  message ||
                  (busy && stage === "verify" ? "A verificar…" : "")}
              </p>
            </form>
            {stage === "verify" && (
              <div className="code-alt">
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    setRecovery(!recovery);
                    setCode("");
                  }}
                >
                  {recovery
                    ? "Usar autenticador"
                    : "Usar código de recuperação"}
                </button>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    setStage("login");
                    setCode("");
                  }}
                >
                  Voltar
                </button>
              </div>
            )}
            {stage === "login" && !required && !token && (
              <p className="fine">
                <span>Acesso só por convite.</span>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => setShowInvite(!showInvite)}
                >
                  Tenho um convite
                </button>
              </p>
            )}
            {showInvite && stage === "login" && !token && (
              <form
                className="invite-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteValue.trim()) {
                    let invite = inviteValue.trim();
                    try {
                      const url = new URL(invite);
                      invite =
                        url.searchParams.get("invite") ||
                        url.searchParams.get("convite") ||
                        url.searchParams.get("token") ||
                        invite;
                    } catch {}
                    location.href = `/entrada?invite=${encodeURIComponent(invite)}`;
                  }
                }}
              >
                <label className="field">
                  <span className="label">Ligação ou código do convite</span>
                  <input
                    className="input"
                    value={inviteValue}
                    onChange={(e) => setInviteValue(e.target.value)}
                    required
                  />
                </label>
                <button className="btn">Abrir convite</button>
              </form>
            )}
            {(stage === "forgot" || stage === "reset") && (
              <p className="fine">
                <a href="/entrada" className="linkbtn">
                  Voltar à entrada
                </a>
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
