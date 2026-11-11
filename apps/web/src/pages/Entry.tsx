import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import "./management.css";
export default function Entry() {
  const { user, refresh } = useSession();
  const authInProgress = useRef(false);
  const turnstileBox = useRef<HTMLDivElement>(null);
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
    let widget: string | undefined;
    const win = window as any;
    const render = () => {
      if (turnstileBox.current)
        widget = win.turnstile.render(turnstileBox.current, {
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
      if (widget !== undefined) win.turnstile?.remove(widget);
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
    } finally {
      setBusy(false);
      if (["login", "forgot"].includes(stage)) {
        setTurnstileToken("");
        (window as any).turnstile?.reset();
      }
    }
  };
  const secret = uri ? new URL(uri).searchParams.get("secret") : null;
  return (
    <main className="management mg-auth">
      <div
        className="mg-auth-art"
        aria-hidden="true"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty(
            "--light-x",
            `${((e.clientX - r.left) / r.width) * 100}%`,
          );
          e.currentTarget.style.setProperty(
            "--light-y",
            `${((e.clientY - r.top) / r.height) * 100}%`,
          );
        }}
      >
        <img
          src={`/art/img/${stage === "login" ? "zeus-6" : "zeus-3"}.webp`}
          alt=""
        />
        <div className="mg-auth-glow" />
        <div className="mg-auth-caption">
          <p className="mg-eyebrow">O teu lugar no Olimpo</p>
          <p className="mg-title">
            Histórias dignas
            <br />
            dos deuses.
          </p>
        </div>
      </div>
      <section className="mg-auth-panel">
        <a className="mg-auth-brand" href="/entrada">
          ZEUS
        </a>
        <p className="mg-eyebrow">
          {stage === "login" ? "Bem-vindo ao Olimpo" : "Só tu tens a chave"}
        </p>
        <h1 className="mg-title">
          {stage === "forgot"
            ? "Recupera o acesso."
            : stage === "reset"
              ? "Uma nova chave."
              : stage === "verify"
                ? "Um último sinal."
                : stage === "enroll"
                  ? "Protege a tua entrada."
                  : required
                    ? "O primeiro guardião."
                    : token
                      ? "O teu lugar espera."
                      : "Entra no teu mundo."}
        </h1>
        <p className="mg-lede">
          {stage === "forgot"
            ? "Enviaremos uma ligação para repor a palavra-passe. O teu autenticador continua a proteger a conta."
            : stage === "reset"
              ? "Escolhe uma palavra-passe com pelo menos 12 caracteres."
              : stage === "verify"
                ? "Introduz o código de seis dígitos da tua aplicação de autenticação."
                : stage === "enroll"
                  ? "A autenticação em dois passos protege todos os Membros do Zeus."
                  : required
                    ? "Cria a primeira conta de Administrador para começar."
                    : token
                      ? "Aceita o Convite e cria a tua conta pessoal."
                      : "Cinema, séries e televisão. Tudo no teu lugar."}
        </p>
        {error && (
          <p role="alert" className="mg-message mg-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mg-message">
            {message}
          </p>
        )}
        {stage === "login" && user && token && (
          <p className="mg-message">
            Já tens uma sessão aberta. Para aceitar este Convite,{" "}
            <button
              className="mg-link"
              onClick={async () => {
                try {
                  await api("/auth/sign-out", { method: "POST", body: "{}" });
                  location.reload();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Não foi possível sair.",
                  );
                }
              }}
            >
              sai da conta actual
            </button>
            .
          </p>
        )}
        <form className="mg-form" onSubmit={act}>
          {stage === "forgot" && (
            <label>
              Email
              <input
                className="mg-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {stage === "reset" && (
            <>
              <label>
                Nova palavra-passe
                <input
                  className="mg-input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                />
              </label>
              <label>
                Repete a nova palavra-passe
                <input
                  className="mg-input"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  minLength={12}
                  required
                />
              </label>
            </>
          )}
          {stage === "login" && (
            <>
              {(required || token) && (
                <label>
                  Nome
                  <input
                    className="mg-input"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
              )}
              {!token && (
                <label>
                  Email
                  <input
                    className="mg-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
              )}
              <label>
                Palavra-passe
                <input
                  className="mg-input"
                  type="password"
                  autoComplete={
                    required || token ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={required || token ? 12 : undefined}
                  required
                />
              </label>
            </>
          )}
          {stage === "enroll" && !uri && (
            <label>
              Confirma a tua palavra-passe
              <input
                className="mg-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          {stage === "enroll" && uri && (
            <>
              <p className="mg-muted">
                Lê este QR no teu autenticador (por exemplo, 1Password ou Google
                Authenticator).
              </p>
              {qr && (
                <img
                  className="mg-qr"
                  src={qr}
                  alt="QR para configurar a autenticação em dois passos"
                />
              )}
              <details>
                <summary>Usar chave manual</summary>
                <code style={{ overflowWrap: "anywhere" }}>{secret}</code>
              </details>
              <h2 className="z-t3">Guarda os códigos de recuperação</h2>
              <p className="mg-muted">
                Cada código pode ser usado uma vez. Guarda-os num local privado
                fora deste dispositivo.
              </p>
              <ul className="mg-codes">
                {codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <label className="mg-check">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                />
                Guardei os códigos de recuperação.
              </label>
            </>
          )}
          {stage === "verify" && (
            <button
              type="button"
              className="mg-link"
              onClick={() => {
                setRecovery(!recovery);
                setCode("");
              }}
            >
              {recovery ? "Usar autenticador" : "Usar código de recuperação"}
            </button>
          )}
          {(stage === "verify" || uri) && (
            <label>
              {recovery ? "Código de recuperação" : "Código de autenticação"}
              <input
                className="mg-input"
                inputMode={recovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={recovery ? undefined : "[0-9]{6}"}
                maxLength={recovery ? 40 : 6}
                value={code}
                onChange={(e) =>
                  setCode(
                    recovery
                      ? e.target.value
                      : e.target.value.replace(/\D/g, ""),
                  )
                }
                required
                autoFocus
              />
            </label>
          )}
          <div
            ref={turnstileBox}
            hidden={!siteKey || !["login", "forgot"].includes(stage)}
          />
          <button
            className="z-btn z-btn--primary"
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
                ? "Enviar ligação de recuperação"
                : stage === "reset"
                  ? "Guardar nova palavra-passe"
                  : stage === "verify" || uri
                    ? "Confirmar e entrar"
                    : stage === "enroll"
                      ? "Configurar autenticador"
                      : required
                        ? "Criar Administrador"
                        : token
                          ? "Aceitar Convite"
                          : "Entrar"}
          </button>
        </form>
        {stage === "login" && !required && !token && (
          <div className="mg-actions">
            {emailConfigured ? (
              <button
                className="mg-link"
                onClick={() => {
                  setStage("forgot");
                  setError("");
                  setMessage("");
                }}
              >
                Esqueci-me da palavra-passe
              </button>
            ) : (
              <p className="mg-muted">
                O envio de emails de recuperação ainda não está configurado.
              </p>
            )}
          </div>
        )}
        {(stage === "forgot" || stage === "reset") && (
          <div className="mg-actions">
            <a className="mg-link" href="/entrada">
              Voltar à entrada
            </a>
          </div>
        )}
        <p className="mg-footer">
          Acesso privado, apenas por Convite.{" "}
          {stage === "login" &&
            !required &&
            !token &&
            !emailConfigured &&
            "Para recuperar o acesso, contacta o teu Administrador."}
        </p>
      </section>
    </main>
  );
}
