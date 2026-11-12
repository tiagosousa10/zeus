import { loadThree } from "../lib/graphics";
import { useEffect, useRef, useState } from "react";
import { Page } from "../components/Layout";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import "./management.css";
import "./admin-fidelity.css";
import "./management-hero.css";
import gsap from "gsap";
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active?: boolean;
  twoFactorEnabled?: boolean;
};
type Invite = {
  id: string;
  email: string;
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  status?: string;
};
type Addon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  status: string;
};
export default function Admin() {
  const { user } = useSession();
  const paintingRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<Member | null>(null);
  useEffect(() => {
    let disposed = false,
      painting: any;
    Promise.all([loadThree(), import("../lib/fx.js")]).then(([three, fx]) => {
      if (disposed || !paintingRef.current) return;
      Object.assign(window, { THREE: three, gsap });
      painting = (fx.livingPainting as any)(
        paintingRef.current,
        "/art/img/conselho.webp",
        {
          focus: { x: 0.83, y: 0.2 },
          anchor: { x: 0.78, y: 0.42 },
          anchorNarrow: { x: 0.68, y: 0.23 },
          figure: [
            [0.78, 0.62, 0.2, 0.38],
            [0.83, 0.2, 0.08, 0.13],
            [0.95, 0.65, 0.06, 0.3],
          ],
          size: (w: number, h: number) =>
            w < 700 ? Math.max(700, w * 1.8) : Math.max(w * 0.95, h * 1.4),
          kenBurns: 0.025,
          parallax: [8, 5],
        },
      );
      painting.state.exposure = 0.88;
    });
    return () => {
      disposed = true;
      painting?.destroy();
    };
  }, []);
  useEffect(() => {
    if (chosen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [chosen]);
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [addons, setAddons] = useState<Addon[]>([]),
    [tab, setTab] = useState(
      location.hash === "#invites"
        ? "invites"
        : location.hash === "#catalogue"
          ? "addons"
          : "members",
    ),
    [query, setQuery] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const [m, i, a] = await Promise.all([
        api<{ members: Member[] }>("/admin/members"),
        api<{ invites: Invite[] }>("/admin/invites"),
        api<{ addons: Addon[] }>("/admin/addons"),
      ]);
      setMembers(m.members);
      setInvites(i.invites);
      setAddons(a.addons);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar a Administração.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role]);
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  };
  const pending = (i: Invite) =>
    !i.usedAt &&
    !i.revokedAt &&
    i.status !== "used" &&
    i.status !== "revoked" &&
    new Date(i.expiresAt) > new Date();
  if (user && user.role !== "admin")
    return (
      <Page>
        <div className="management-content">
          <h1 className="z-t2">Acesso reservado</h1>
          <p className="mg-lede">
            Só um Administrador pode gerir os Membros e o Catálogo de Add-ons.
          </p>
          <a className="z-btn z-btn--primary" href="/portal">
            Voltar ao Portal
          </a>
        </div>
      </Page>
    );
  return (
    <Page>
      <div className="admin-fidelity">
        <section
          className="council management-hero"
          aria-labelledby="admin-title"
        >
          <div ref={paintingRef} aria-hidden="true" />
          <div className="council-copy management-hero-copy">
            <div className="sigil" aria-hidden="true">
              Ζ
            </div>
            <p className="eyebrow">O Conselho do Olimpo</p>
            <h1 id="admin-title">
              Quem entra.
              <br />O que permanece.
            </h1>
            <p className="z-lede">
              Um lugar privado, cuidado por ti. Gere os Membros, abre as portas
              e escolhe os Add-ons que fazem parte do Zeus.
            </p>
          </div>
        </section>
        <div className="workspace">
          <div className="stats">
            <div className="stat">
              <b>{members.filter((m) => m.active !== false).length}</b>
              <span>Membros activos</span>
            </div>
            <div className="stat">
              <b>{addons.filter((a) => a.status === "pending").length}</b>
              <span>Add-ons por decidir</span>
            </div>
            <div className="stat">
              <b>{invites.filter(pending).length}</b>
              <span>
                {invites.filter(pending).length === 1
                  ? "Convite pendente"
                  : "Convites pendentes"}
              </span>
            </div>
          </div>
          <nav className="section-nav" aria-label="Administração">
            {[
              ["members", "Membros"],
              ["invites", "Convites"],
              ["addons", "Catálogo de Add-ons"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`z-btn ${tab === id ? "z-btn--secondary" : "z-btn--ghost"}`}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  history.replaceState(
                    null,
                    "",
                    `#${id === "addons" ? "catalogue" : id}`,
                  );
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="panels">
            {error && (
              <p role="alert" className="mg-message mg-error">
                {error}{" "}
                <button className="mg-link" onClick={load}>
                  Tentar novamente
                </button>
              </p>
            )}
            {message && (
              <p role="status" className="mg-message">
                {message}
              </p>
            )}
            {loading && <p className="mg-muted">A actualizar…</p>}
            {tab === "members" && (
              <section>
                <div className="section-head">
                  <div>
                    <h2 className="z-t2">As pessoas do Zeus</h2>
                    <p>
                      Cada Membro tem a sua conta, a sua lista e o seu
                      progresso.
                    </p>
                  </div>
                  <input
                    className="z-input"
                    style={{ maxWidth: 260 }}
                    type="search"
                    aria-label="Procurar Membro"
                    placeholder="Procurar Membro"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {members
                  .filter((m) =>
                    (m.name + " " + m.email)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((m) => (
                    <article className="member" key={m.id}>
                      <span className="initial" aria-hidden="true">
                        {m.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <div className="identity">
                        <b>{m.name}</b>
                        <small>{m.email}</small>
                      </div>
                      <div className="member-actions">
                        <span
                          className={`z-tag ${m.active !== false ? "z-tag--gold" : ""}`}
                        >
                          {m.role === "admin"
                            ? m.id === user?.id
                              ? "Administrador · Tu"
                              : "Administrador"
                            : m.active === false
                              ? "Desactivado"
                              : "Membro activo"}
                        </span>
                        {m.id !== user?.id && (
                          <button
                            className="z-btn z-btn--ghost z-btn--sm"
                            disabled={!!busy}
                            onClick={() => {
                              if (m.active !== false) {
                                setChosen(m);
                                return;
                              }
                              void run(m.id, async () => {
                                await api(
                                  "/admin/members/" + encodeURIComponent(m.id),
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      active: m.active === false,
                                    }),
                                  },
                                );
                                setMessage(
                                  m.active === false
                                    ? "Membro reactivado."
                                    : "Membro desactivado.",
                                );
                              });
                            }}
                          >
                            {m.active === false ? "Reactivar" : "Desactivar"}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </section>
            )}
            {tab === "invites" && (
              <section>
                <div className="section-head">
                  <div>
                    <h2 className="z-t2">Abre as portas a alguém</h2>
                    <p>
                      Cada Convite é pessoal, de uso único e válido durante sete
                      dias.
                    </p>
                  </div>
                </div>
                <form
                  className="invite-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("invite", async () => {
                      const r = await api<{
                        url: string;
                        emailSent: boolean;
                        deliveryError?: string;
                      }>("/admin/invites", {
                        method: "POST",
                        body: JSON.stringify({ email }),
                      });
                      setInviteUrl(new URL(r.url, location.origin).href);
                      setEmail("");
                      if (r.deliveryError) setError(r.deliveryError);
                      setMessage(
                        r.emailSent
                          ? "Convite criado e enviado por email."
                          : "Convite criado. Nenhum email foi enviado; copia o link para o partilhares.",
                      );
                    });
                  }}
                >
                  <label className="z-field">
                    <span className="z-label">Email do novo Membro</span>
                    <input
                      className="z-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <button
                    className="z-btn z-btn--primary"
                    style={{ justifySelf: "start" }}
                    disabled={!!busy}
                  >
                    Criar Convite
                  </button>
                </form>
                {inviteUrl && (
                  <div className="mg-message">
                    <label className="mg-form">
                      Link do Convite
                      <input
                        className="z-input"
                        readOnly
                        value={inviteUrl}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <button
                      className="mg-link"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(inviteUrl)
                          .then(() => setMessage("Link copiado."))
                          .catch(() =>
                            setError(
                              "Selecciona o link e copia-o manualmente.",
                            ),
                          )
                      }
                    >
                      Copiar link
                    </button>
                  </div>
                )}
                {invites.map((i) => (
                  <article className="invite" key={i.id}>
                    <div className="identity">
                      <b>{i.email}</b>
                      <small>
                        Validade:{" "}
                        {new Date(i.expiresAt).toLocaleString("pt-PT")}
                      </small>
                    </div>
                    <span className="invite-state">
                      {i.usedAt || i.status === "used"
                        ? "Aceite"
                        : i.revokedAt || i.status === "revoked"
                          ? "Revogado"
                          : pending(i)
                            ? "Pendente"
                            : "Expirado"}
                    </span>
                    {pending(i) && (
                      <button
                        className="z-btn z-btn--ghost z-btn--sm"
                        disabled={!!busy}
                        onClick={() =>
                          run(i.id, async () => {
                            await api(
                              "/admin/invites/" + encodeURIComponent(i.id),
                              { method: "DELETE" },
                            );
                            setMessage("Convite revogado.");
                          })
                        }
                      >
                        Revogar
                      </button>
                    )}
                  </article>
                ))}
                {!invites.length && !loading && (
                  <p className="mg-empty">Ainda não foram criados Convites.</p>
                )}
              </section>
            )}
            {tab === "addons" && (
              <section>
                <div className="section-head">
                  <div>
                    <h2 className="z-t2">O teu selo de aprovação</h2>
                    <p>
                      Estes Add-ons vieram do registo público. Só os aprovados
                      ficam disponíveis para os Membros instalarem.
                    </p>
                  </div>
                  <button
                    className="z-btn z-btn--ghost"
                    disabled={!!busy}
                    onClick={() =>
                      run("sync", async () => {
                        await api("/admin/addons/sync", {
                          method: "POST",
                          body: "{}",
                        });
                        setMessage(
                          "Catálogo sincronizado. Revê os novos Add-ons pendentes.",
                        );
                      })
                    }
                  >
                    {busy === "sync"
                      ? "A sincronizar…"
                      : "Sincronizar catálogo"}
                  </button>
                </div>
                <div className="catalogue">
                  {addons.map((a) => (
                    <article
                      className="proposal"
                      data-status={
                        a.status === "approved"
                          ? "aprovado"
                          : a.status === "rejected"
                            ? "rejeitado"
                            : "pendente"
                      }
                      key={a.id}
                    >
                      <span className="z-tag">Add-on</span>
                      {a.status !== "pending" && (
                        <span className="stamp">
                          {a.status === "approved" ? "APROVADO" : "REJEITADO"}
                        </span>
                      )}
                      <h3>{a.name}</h3>
                      <p>{a.description}</p>
                      <footer>
                        {a.status !== "approved" && (
                          <button
                            className="z-btn z-btn--secondary z-btn--sm"
                            disabled={!!busy}
                            onClick={() =>
                              run(a.id, () =>
                                api(
                                  "/admin/addons/" + encodeURIComponent(a.id),
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      status: "approved",
                                    }),
                                  },
                                ),
                              )
                            }
                          >
                            Aprovar
                          </button>
                        )}
                        {a.status !== "rejected" && (
                          <button
                            className="z-btn z-btn--ghost z-btn--sm"
                            disabled={!!busy}
                            onClick={() =>
                              run(a.id, () =>
                                api(
                                  "/admin/addons/" + encodeURIComponent(a.id),
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      status: "rejected",
                                    }),
                                  },
                                ),
                              )
                            }
                          >
                            Rejeitar
                          </button>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
                {!addons.length && !loading && (
                  <p className="mg-empty">
                    O catálogo ainda não tem Add-ons. Sincroniza o registo
                    público para começar.
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
        <dialog
          ref={dialogRef}
          className="admin-confirm z-sheet"
          onCancel={() => setChosen(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setChosen(null);
          }}
          aria-labelledby="confirm-title"
        >
          <button
            className="z-icon-btn z-sheet__close"
            onClick={() => setChosen(null)}
            aria-label="Fechar"
          >
            ×
          </button>
          <div className="z-sheet__body">
            <h2 className="z-t2" id="confirm-title">
              Desactivar Membro?
            </h2>
            <p>
              {chosen?.name} deixará de poder entrar no Zeus. Podes reactivar o
              acesso mais tarde.
            </p>
            <div>
              <button
                className="z-btn z-btn--danger"
                disabled={!!busy}
                onClick={() => {
                  if (!chosen) return;
                  void run(chosen.id, async () => {
                    await api(
                      "/admin/members/" + encodeURIComponent(chosen.id),
                      {
                        method: "PATCH",
                        body: JSON.stringify({ active: false }),
                      },
                    );
                    setChosen(null);
                    setMessage("Membro desactivado.");
                  });
                }}
              >
                Desactivar Membro
              </button>{" "}
              <button
                className="z-btn z-btn--ghost"
                onClick={() => setChosen(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </dialog>
      </div>
    </Page>
  );
}
