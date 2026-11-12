import { useEffect, useRef, useState, type FormEvent } from "react";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useSession, useMemberState } from "../lib/session";
import "./management.css";
import "./conta-fidelity.css";
import gsap from "gsap";
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
  const paintingRef = useRef<HTMLDivElement>(null);
  const [showBackup, setShowBackup] = useState(false),
    [showCurrent, setShowCurrent] = useState(false),
    [showKey, setShowKey] = useState(false),
    [activeSection, setActiveSection] = useState(
      location.hash.slice(1) || "perfil",
    );
  useEffect(() => {
    let disposed = false,
      painting: any;
    Promise.all([import("three"), import("../lib/fx.js")]).then(
      ([three, fx]) => {
        if (disposed || !paintingRef.current) return;
        Object.assign(window, { THREE: three, gsap });
        painting = (fx.livingPainting as any)(
          paintingRef.current,
          "/art/img/atena.webp",
          {
            focus: { x: 0.33, y: 0.3 },
            anchor: { x: 0.3, y: 0.4 },
            anchorNarrow: { x: 0.5, y: 0.27 },
            figure: [
              [0.33, 0.3, 0.12, 0.2],
              [0.3, 0.78, 0.3, 0.25],
              [0.15, 0.22, 0.08, 0.2],
            ],
            size: (w: number, h: number) =>
              w < 700
                ? Math.max(h * 0.95, w * 1.5)
                : Math.max(h * 1.45, w * 0.64),
            kenBurns: 0.035,
            parallax: [12, 8],
          },
        );
      },
    );
    return () => {
      disposed = true;
      painting?.destroy();
    };
  }, []);
  const subtitleSize = state.preferences.subtitleSize || "medium";
  const field = (label: string, input: React.ReactNode) => (
    <label className="z-field">
      <span className="z-label">{label}</span>
      {input}
    </label>
  );
  return (
    <Page>
      <div className="account-fidelity">
        <section className="at-hero" aria-labelledby="account-title">
          <div ref={paintingRef} aria-hidden="true" />
          <div className="at-copy">
            <h1 className="z-display" id="account-title">
              Conta
            </h1>
            <p className="z-lede">
              O teu perfil, a segurança da conta e a forma como o leitor se
              comporta. Só tu vês estas definições.
            </p>
            <p className="at-sum">
              <i aria-hidden="true" />
              {user?.name}
              {user
                ? `, ${user.role === "admin" ? "Administrador" : "Membro"}`
                : ""}
            </p>
          </div>
        </section>
        <div className="layout">
          <nav className="side" aria-label="Definições da conta">
            {[
              ["perfil", "Perfil"],
              ["seguranca", "Segurança"],
              ["tmdb", "Chave TMDB"],
              ["leitor", "Leitor"],
              ["importar", "Importar do MacStream"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={activeSection === id ? "true" : undefined}
                onClick={() => setActiveSection(id)}
              >
                {label}
              </a>
            ))}
          </nav>
          <div>
            {(error || stateError) && (
              <p className="z-msg" role="alert">
                {error || stateError?.message}
              </p>
            )}
            {message && (
              <p className="z-msg is-ok" role="status">
                {message}
              </p>
            )}
            <section className="sec" id="perfil">
              <h2 className="z-t2">Perfil</h2>
              <p className="z-callout">
                O nome aparece aos outros Membros. O email identifica a tua
                conta e o Convite; contacta o Administrador se precisares de o
                alterar.
              </p>
              <form
                className="form"
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
                <div className="grid2">
                  {field(
                    "Nome",
                    <input
                      className="z-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />,
                  )}
                  {field(
                    "Email",
                    <input
                      className="z-input"
                      type="email"
                      value={user?.email || ""}
                      readOnly
                      autoComplete="email"
                    />,
                  )}
                </div>
                <div className="actions">
                  <button
                    className="z-btn z-btn--primary z-btn--sm"
                    disabled={!!busy || !name.trim()}
                  >
                    Guardar perfil
                  </button>
                </div>
              </form>
            </section>
            <section className="sec" id="seguranca">
              <div className="sec-head">
                <div
                  className={`aegis ${user?.twoFactorEnabled ? "is-locked" : ""}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 120 120">
                    <defs>
                      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#f6df9a" />
                        <stop offset=".5" stopColor="#c99a3a" />
                        <stop offset="1" stopColor="#8a6420" />
                      </linearGradient>
                    </defs>
                    {[0, 1].flatMap((r) =>
                      Array.from({ length: 24 }, (_, i) => (
                        <g
                          key={`${r}-${i}`}
                          transform={`rotate(${i * 15 + r * 7.5} 60 60)`}
                        >
                          <path
                            className="sc"
                            style={{ "--i": i + r * 3 } as React.CSSProperties}
                            d={
                              r
                                ? "M54.5 17 a5.5 5.5 0 0 0 11 0 z"
                                : "M53 7 a7 7 0 0 0 14 0 z"
                            }
                          />
                        </g>
                      )),
                    )}
                    <circle className="core" cx="60" cy="60" r="38" />
                    <g className="lock">
                      <rect x="48" y="58" width="24" height="18" rx="4" />
                      <path
                        className="shackle"
                        d="M53 58v-6a7 7 0 0 1 14 0v6"
                      />
                    </g>
                  </svg>
                  <span className="aegis__gleam" />
                </div>
                <div>
                  <h2 className="z-t2">Segurança</h2>
                  <p>
                    <b>
                      {user?.twoFactorEnabled
                        ? "A tua conta está protegida"
                        : "Configura a protecção da tua conta"}
                    </b>
                    <span>
                      Palavra-passe, verificação em dois passos e sessões em
                      ordem.
                    </span>
                  </p>
                </div>
              </div>
              <h3 className="sub">Alterar palavra-passe</h3>
              <form className="form" onSubmit={changePassword}>
                {field(
                  "Palavra-passe actual",
                  <div className="z-input-wrap">
                    <input
                      className="z-input"
                      type={showCurrent ? "text" : "password"}
                      autoComplete="current-password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      aria-pressed={showCurrent}
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      {showCurrent ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>,
                )}
                <div className="grid2">
                  {field(
                    "Nova palavra-passe",
                    <input
                      className="z-input"
                      type="password"
                      minLength={12}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />,
                  )}
                  {field(
                    "Repetir nova palavra-passe",
                    <input
                      className="z-input"
                      type="password"
                      minLength={12}
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                      required
                    />,
                  )}
                </div>
                <p className="z-help">
                  Pelo menos 12 caracteres. As outras sessões terminam quando a
                  alterares.
                </p>
                <div className="actions">
                  <button
                    className="z-btn z-btn--primary z-btn--sm"
                    disabled={!!busy}
                  >
                    Alterar palavra-passe
                  </button>
                </div>
              </form>
              <h3 className="sub">Verificação em dois passos</h3>
              <div className="row">
                <div>
                  <b>App de autenticação</b>
                  <p>
                    Protege o acesso com um código da tua app de autenticação.
                  </p>
                </div>
                <span className="z-tag z-tag--gold">
                  {user?.twoFactorEnabled ? "Activa" : "Por configurar"}
                </span>
              </div>
              {user?.twoFactorEnabled ? (
                <>
                  <div className="actions" style={{ marginTop: 12 }}>
                    <button
                      className="z-btn z-btn--secondary z-btn--sm"
                      aria-expanded={showBackup}
                      onClick={() => setShowBackup(!showBackup)}
                    >
                      Gerar novos códigos de recuperação
                    </button>
                  </div>
                  {showBackup && (
                    <form
                      className="confirm"
                      onSubmit={(e) => {
                        e.preventDefault();
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
                            setShowBackup(false);
                          },
                          "Novos códigos gerados. Guarda-os antes de sair desta página.",
                        );
                      }}
                    >
                      <p>
                        Os códigos actuais deixam de funcionar logo que gerares
                        novos.
                      </p>
                      {field(
                        "Confirma a palavra-passe",
                        <input
                          className="z-input"
                          type="password"
                          autoComplete="current-password"
                          value={backupPassword}
                          onChange={(e) => setBackupPassword(e.target.value)}
                          required
                        />,
                      )}
                      <button
                        className="z-btn z-btn--primary z-btn--sm"
                        disabled={!!busy}
                      >
                        Gerar códigos
                      </button>
                      <button
                        className="z-btn z-btn--ghost z-btn--sm"
                        type="button"
                        onClick={() => setShowBackup(false)}
                      >
                        Cancelar
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <a className="z-btn z-btn--primary" href="/entrada">
                  Configurar autenticador
                </a>
              )}
              {codes.length > 0 && (
                <>
                  <div
                    className="plaque"
                    role="group"
                    aria-label="Códigos de recuperação"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <i className="rivet" key={i} />
                    ))}
                    <h3>Códigos de recuperação</h3>
                    <p>Cada código serve uma vez. Guarda-os fora do Zeus.</p>
                    <ol>
                      {codes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="actions" style={{ marginTop: 14 }}>
                    <button
                      className="z-btn z-btn--secondary z-btn--sm"
                      onClick={() =>
                        void run(
                          "copy",
                          () => navigator.clipboard.writeText(codes.join("\n")),
                          "Códigos copiados.",
                        )
                      }
                    >
                      Copiar
                    </button>
                    <button
                      className="z-btn z-btn--secondary z-btn--sm"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([codes.join("\n")], { type: "text/plain" }),
                        );
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = "zeus-codigos-recuperacao.txt";
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Descarregar .txt
                    </button>
                    <button
                      className="z-btn z-btn--ghost z-btn--sm"
                      onClick={() => setCodes([])}
                    >
                      Já os guardei
                    </button>
                  </div>
                </>
              )}
              <h3 className="sub">Sessões activas</h3>
              <ul className="sessions">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <rect x="3" y="4" width="18" height="13" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
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
                        void run(
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
                  </li>
                ))}
              </ul>
              {!sessions.length && (
                <p className="z-help">Nenhuma sessão disponível.</p>
              )}
              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  className="z-btn z-btn--danger z-btn--sm"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
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
                  Terminar todas as outras sessões
                </button>
              </div>
            </section>
            <section className="sec" id="tmdb">
              <h2 className="z-t2">Chave TMDB</h2>
              <p className="z-callout">
                Os cartazes, sinopses e elencos vêm do The Movie Database. Com a
                tua chave, os pedidos contam na tua conta TMDB.
              </p>
              <form
                className="form"
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
                    "Chave guardada de forma cifrada.",
                  );
                }}
              >
                {field(
                  "Chave da API (v3)",
                  <div className="z-input-wrap">
                    <input
                      className="z-input z-input--mono"
                      type={showKey ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={tmdb}
                      onChange={(e) => setTmdb(e.target.value.trim())}
                    />
                    <button
                      type="button"
                      aria-pressed={showKey}
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>,
                )}
                <p className="z-help">
                  Deixa em branco para remover. Guardar não verifica a validade
                  junto do TMDB.
                </p>
                <div className="actions">
                  <button
                    className="z-btn z-btn--primary z-btn--sm"
                    disabled={!!busy || loading || !!stateError}
                  >
                    Guardar chave
                  </button>
                </div>
              </form>
            </section>
            <section className="sec" id="leitor">
              <h2 className="z-t2">Preferências do leitor</h2>
              <p className="z-callout">
                Valem para todos os filmes e séries. A ordem dos idiomas decide
                qual é escolhido primeiro.
              </p>
              {[
                {
                  key: "audioLanguages",
                  label: "Idiomas de áudio, por ordem de preferência",
                  fallback: [state.preferences.language || "pt-PT", "original"],
                  options: [
                    ["pt-PT", "Português"],
                    ["original", "Original"],
                    ["en", "Inglês"],
                    ["es", "Espanhol"],
                    ["fr", "Francês"],
                  ],
                },
                {
                  key: "subtitleLanguages",
                  label: "Idiomas das legendas, por ordem de preferência",
                  fallback: [state.preferences.language || "pt-PT"],
                  options: [
                    ["pt-PT", "Português (Portugal)"],
                    ["pt-BR", "Português (Brasil)"],
                    ["en", "Inglês"],
                    ["es", "Espanhol"],
                  ],
                },
              ].map((group) => {
                const chosen: string[] =
                  state.preferences[group.key] || group.fallback;
                return (
                  <fieldset key={group.key}>
                    <legend className="z-label">{group.label}</legend>
                    <div className="z-chips">
                      {group.options.map(([id, label]) => (
                        <button
                          key={id}
                          className="z-chip"
                          aria-pressed={chosen.includes(id)}
                          disabled={loading || !!busy || !!stateError}
                          onClick={() => {
                            if (chosen.length === 1 && chosen.includes(id)) {
                              setMessage("Escolhe pelo menos um idioma.");
                              return;
                            }
                            const next = chosen.includes(id)
                              ? chosen.filter((code) => code !== id)
                              : [...chosen, id];
                            void preferences({
                              [group.key]: next,
                              ...(group.key === "audioLanguages"
                                ? {
                                    language:
                                      next.find(
                                        (code) => code !== "original",
                                      ) || "pt-PT",
                                  }
                                : {}),
                            });
                          }}
                        >
                          {chosen.includes(id) && (
                            <span className="z-chip__n">
                              {chosen.indexOf(id) + 1}
                            </span>
                          )}
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <div className="toggles">
                <button
                  className="z-switch"
                  role="switch"
                  aria-checked={state.preferences.autoplay !== false}
                  disabled={loading || !!busy || !!stateError}
                  onClick={() =>
                    preferences({
                      autoplay: state.preferences.autoplay === false,
                    })
                  }
                >
                  Reproduzir o episódio seguinte automaticamente
                </button>
                <button
                  className="z-switch"
                  role="switch"
                  aria-checked={state.preferences.previews === true}
                  disabled={loading || !!busy || !!stateError}
                  onClick={() =>
                    preferences({
                      previews: state.preferences.previews !== true,
                    })
                  }
                >
                  Mostrar pré-visualizações ao passar o rato
                </button>
              </div>
              <h3 className="sub" style={{ marginTop: 0 }}>
                Aparência das legendas
              </h3>
              <div className="segs">
                <div>
                  <span className="z-label" id="subtitle-size">
                    Tamanho
                  </span>
                  <div
                    className="z-seg"
                    role="radiogroup"
                    aria-labelledby="subtitle-size"
                  >
                    {[
                      ["small", "Pequeno"],
                      ["medium", "Médio"],
                      ["large", "Grande"],
                    ].map(([id, label]) => (
                      <label key={id}>
                        <input
                          type="radio"
                          name="subtitle-size"
                          checked={subtitleSize === id}
                          disabled={loading || !!busy || !!stateError}
                          onChange={() => preferences({ subtitleSize: id })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {[
                  {
                    key: "subtitleColor",
                    label: "Cor",
                    fallback: "#ffffff",
                    options: [
                      ["#ffffff", "Branco"],
                      ["#ffe45c", "Amarelo"],
                    ],
                  },
                  {
                    key: "subtitleBackground",
                    label: "Fundo",
                    fallback: "sombra",
                    options: [
                      ["nenhum", "Nenhum"],
                      ["sombra", "Sombra"],
                      ["caixa", "Caixa"],
                    ],
                  },
                ].map((group) => (
                  <div key={group.key}>
                    <span className="z-label" id={group.key}>
                      {group.label}
                    </span>
                    <div
                      className="z-seg"
                      role="radiogroup"
                      aria-labelledby={group.key}
                    >
                      {group.options.map(([id, label]) => (
                        <label key={id}>
                          <input
                            type="radio"
                            name={group.key}
                            checked={
                              (state.preferences[group.key] ||
                                group.fallback) === id
                            }
                            disabled={loading || !!busy || !!stateError}
                            onChange={() => preferences({ [group.key]: id })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="preview"
                data-bg={state.preferences.subtitleBackground || "sombra"}
                role="img"
                aria-label="Pré-visualização das legendas"
              >
                <span
                  style={{
                    color: state.preferences.subtitleColor || "#ffffff",
                    fontSize:
                      subtitleSize === "large"
                        ? 30
                        : subtitleSize === "small"
                          ? 18
                          : 23,
                  }}
                >
                  Ninguém atravessa estas portas sem o meu consentimento.
                </span>
              </div>
              <p className="save-note">
                As preferências são guardadas na tua conta.
              </p>
            </section>
            <section className="sec" id="importar">
              <h2 className="z-t2">Importar dados do MacStream</h2>
              <p className="z-callout">
                A migração ainda está por decidir. Os dados do MacStream
                continuam intactos; a importação estará disponível quando for
                definida.
              </p>
              <div className="drop" aria-disabled="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
                  <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
                <b>Exportação do MacStream</b>
                <span className="z-foot">Importação ainda indisponível.</span>
              </div>
            </section>
            <div className="actions">
              <button
                className="z-btn z-btn--ghost"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    "logout",
                    async () => {
                      await api("/auth/sign-out", {
                        method: "POST",
                        body: "{}",
                      });
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
      </div>
    </Page>
  );
}
