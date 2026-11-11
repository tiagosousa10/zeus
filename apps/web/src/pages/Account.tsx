import { useEffect, useState, type FormEvent } from "react";
import { Art, Page } from "../components/Layout";
import { api } from "../lib/api";
import { useSession, useMemberState } from "../lib/session";
import "./management.css";
type Session = {
  id: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
};
export default function Account() {
  const { user, refresh } = useSession(),
    { state, save, loading, error: stateError } = useMemberState();
  const [name, setName] = useState(""),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [tmdb, setTmdb] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [backupPassword, setBackupPassword] = useState("");
  useEffect(() => setName(user?.name || ""), [user?.name]);
  useEffect(() => setTmdb(state.preferences?.tmdbKey || ""), [loading]);
  const loadSessions = () =>
    api<Session[]>("/auth/list-sessions")
      .then(setSessions)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void loadSessions();
  }, []);
  const run = async (
    id: string,
    work: () => Promise<unknown>,
    success: string,
  ) => {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy("");
    }
  };
  const preferences = (patch: Record<string, unknown>) =>
    run(
      "preferences",
      () => save({ preferences: { ...state.preferences, ...patch } }),
      "Preferências guardadas.",
    );
  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError("As palavras-passe novas não coincidem.");
      return;
    }
    void run(
      "password",
      async () => {
        await api("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: current,
            newPassword: password,
            revokeOtherSessions: true,
          }),
        });
        setCurrent("");
        setPassword("");
        setRepeat("");
        await loadSessions();
      },
      "Palavra-passe alterada. As outras sessões foram terminadas.",
    );
  };
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
        <Art
          image="atena"
          title="Sob a protecção de Atena."
          eyebrow="A tua conta"
        />
        <div className="management-content">
          <nav className="mg-tabs" aria-label="Definições">
            <a className="z-btn z-btn--ghost" href="#personal">
              Dados pessoais
            </a>
            <a className="z-btn z-btn--ghost" href="#security">
              Segurança
            </a>
            <a className="z-btn z-btn--ghost" href="#preferences">
              Leitor
            </a>
            <a className="z-btn z-btn--ghost" href="#tmdb">
              TMDB
            </a>
          </nav>
          <h1 className="z-t2">A tua Conta</h1>
          <p className="mg-lede">
            As tuas escolhas, a tua segurança. Só tu vês estas definições.
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
          <div className="mg-grid">
            <section id="personal" className="mg-card mg-section">
              <h2 className="z-t3">Dados pessoais</h2>
              <form
                className="mg-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    "personal",
                    async () => {
                      await api("/auth/update-user", {
                        method: "POST",
                        body: JSON.stringify({ name: name.trim() }),
                      });
                      await refresh();
                    },
                    "Nome actualizado.",
                  );
                }}
              >
                <label>
                  Nome
                  <input
                    className="mg-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email
                  <input
                    className="mg-input"
                    value={user?.email || ""}
                    readOnly
                  />
                </label>
                <p className="mg-muted">
                  O email identifica a tua conta e o Convite. Contacta o
                  Administrador se precisares de o alterar.
                </p>
                <button
                  className="z-btn z-btn--secondary"
                  disabled={!!busy || !name.trim()}
                >
                  Guardar nome
                </button>
              </form>
            </section>
            <section id="tmdb" className="mg-card mg-section">
              <h2 className="z-t3">A tua chave TMDB</h2>
              <p className="mg-lede">
                Metadados dos filmes e séries com a tua chave pessoal.
              </p>
              <form
                className="mg-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tmdb && !/^[0-9a-f]{32}$/i.test(tmdb)) {
                    setError(
                      "A chave TMDB deve ter 32 caracteres hexadecimais.",
                    );
                    return;
                  }
                  void run(
                    "tmdb",
                    () =>
                      save({
                        preferences: { ...state.preferences, tmdbKey: tmdb },
                      }),
                    "Chave guardada de forma cifrada. Será utilizada na próxima consulta de metadados.",
                  );
                }}
              >
                <label>
                  Chave API
                  <input
                    className="mg-input"
                    type="password"
                    autoComplete="off"
                    value={tmdb}
                    onChange={(e) => setTmdb(e.target.value.trim())}
                  />
                </label>
                <p className="mg-muted">
                  Deixa em branco para remover. Guardar não verifica a validade
                  junto do TMDB.
                </p>
                <button
                  className="z-btn z-btn--secondary"
                  disabled={!!busy || loading}
                >
                  Guardar chave
                </button>
              </form>
            </section>
          </div>
          <section id="security" className="mg-section">
            <h2 className="z-t2">O teu escudo</h2>
            <p className="mg-lede">
              Autenticação em dois passos obrigatória. A tua conta mantém-se
              protegida.
            </p>
            <div className="mg-grid">
              <div className="mg-card">
                <h3>Alterar palavra-passe</h3>
                <form className="mg-form" onSubmit={changePassword}>
                  <label>
                    Palavra-passe actual
                    <input
                      className="mg-input"
                      type="password"
                      autoComplete="current-password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Nova palavra-passe
                    <input
                      className="mg-input"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Repetir nova palavra-passe
                    <input
                      className="mg-input"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                      required
                    />
                  </label>
                  <button className="z-btn z-btn--secondary" disabled={!!busy}>
                    Alterar palavra-passe
                  </button>
                </form>
              </div>
              <div className="mg-card">
                <span className="mg-tag">
                  {user?.twoFactorEnabled
                    ? "TOTP ACTIVO"
                    : "CONFIGURAÇÃO NECESSÁRIA"}
                </span>
                <h3 style={{ marginTop: 20 }}>Códigos de recuperação</h3>
                <p>
                  Se perderes o autenticador, estes códigos permitem recuperar o
                  acesso. Gerar novos códigos invalida os anteriores.
                </p>
                {user?.twoFactorEnabled ? (
                  <form
                    className="mg-form"
                    style={{ marginTop: 20 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        !window.confirm(
                          "Gerar novos códigos invalida todos os anteriores. Continuar?",
                        )
                      )
                        return;
                      void run(
                        "backup",
                        async () => {
                          const r = await api<{ backupCodes: string[] }>(
                            "/auth/two-factor/generate-backup-codes",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                password: backupPassword,
                              }),
                            },
                          );
                          setCodes(r.backupCodes);
                          setBackupPassword("");
                        },
                        "Novos códigos gerados. Guarda-os antes de sair desta página.",
                      );
                    }}
                  >
                    <label>
                      Confirma a palavra-passe
                      <input
                        className="mg-input"
                        type="password"
                        autoComplete="current-password"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        required
                      />
                    </label>
                    <button
                      className="z-btn z-btn--secondary"
                      disabled={!!busy}
                    >
                      Gerar novos códigos
                    </button>
                  </form>
                ) : (
                  <a className="z-btn z-btn--primary" href="/entrada">
                    Configurar autenticador
                  </a>
                )}
                {codes.length > 0 && (
                  <ul className="mg-codes">
                    {codes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="mg-card" style={{ marginTop: 24 }}>
              <div className="mg-section-head">
                <h3>Sessões abertas</h3>
                <button
                  className="z-btn z-btn--ghost"
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      "sessions",
                      async () => {
                        await api("/auth/revoke-other-sessions", {
                          method: "POST",
                          body: "{}",
                        });
                        await loadSessions();
                      },
                      "As outras sessões foram terminadas.",
                    )
                  }
                >
                  Terminar outras sessões
                </button>
              </div>
              {sessions.map((s) => (
                <article className="mg-row" key={s.id}>
                  <div>
                    <b>{s.userAgent || "Dispositivo sem identificação"}</b>
                    <small>
                      {s.ipAddress || "IP não disponível"} · Iniciada em{" "}
                      {new Date(s.createdAt).toLocaleDateString("pt-PT")}
                    </small>
                  </div>
                  <button
                    className="z-btn z-btn--ghost z-btn--sm"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        s.id,
                        async () => {
                          await api("/auth/revoke-session", {
                            method: "POST",
                            body: JSON.stringify({ token: s.token }),
                          });
                          await refresh();
                          await loadSessions();
                        },
                        "Sessão terminada.",
                      )
                    }
                  >
                    Terminar sessão
                  </button>
                </article>
              ))}
              {!sessions.length && (
                <p className="mg-muted">Nenhuma sessão disponível.</p>
              )}
            </div>
          </section>
          <section id="preferences" className="mg-card mg-section">
            <h2 className="z-t3">O leitor à tua medida</h2>
            <div className="mg-grid">
              <div className="mg-form">
                <label>
                  Idioma preferido
                  <select
                    className="mg-input"
                    disabled={loading || !!busy}
                    value={state.preferences?.language || "pt-PT"}
                    onChange={(e) => preferences({ language: e.target.value })}
                  >
                    <option value="pt-PT">Português (Portugal)</option>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en">Inglês</option>
                    <option value="es">Espanhol</option>
                  </select>
                </label>
                <label>
                  Tamanho das legendas
                  <select
                    className="mg-input"
                    disabled={loading || !!busy}
                    value={state.preferences?.subtitleSize || "medium"}
                    onChange={(e) =>
                      preferences({ subtitleSize: e.target.value })
                    }
                  >
                    <option value="small">Pequeno</option>
                    <option value="medium">Médio</option>
                    <option value="large">Grande</option>
                  </select>
                </label>
              </div>
              <div className="mg-form">
                <label className="mg-check">
                  <input
                    type="checkbox"
                    disabled={loading || !!busy}
                    checked={state.preferences?.autoplay !== false}
                    onChange={(e) =>
                      preferences({ autoplay: e.target.checked })
                    }
                  />
                  Reprodução automática
                </label>
                <label className="mg-check">
                  <input
                    type="checkbox"
                    disabled={loading || !!busy}
                    checked={state.preferences?.subtitles !== false}
                    onChange={(e) =>
                      preferences({ subtitles: e.target.checked })
                    }
                  />
                  Legendas activadas
                </label>
                <p className="mg-muted">
                  As animações respeitam a preferência de movimento reduzido do
                  teu dispositivo.
                </p>
              </div>
            </div>
          </section>
          <p className="mg-footer">
            Os dados do MacStream continuam intactos. A importação de dados
            antigos ainda não foi definida.
          </p>
          <div className="mg-actions">
            <button
              className="z-btn z-btn--ghost"
              disabled={!!busy}
              onClick={() =>
                run(
                  "logout",
                  async () => {
                    await api("/auth/sign-out", { method: "POST", body: "{}" });
                    location.href = "/entrada";
                  },
                  "",
                )
              }
            >
              Sair do Zeus
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}
