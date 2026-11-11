import { useEffect, useState } from "react";
import { Art, Page } from "../components/Layout";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import "./management.css";
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
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [addons, setAddons] = useState<Addon[]>([]),
    [tab, setTab] = useState("members"),
    [query, setQuery] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [filter, setFilter] = useState("pending"),
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
      <div className="management">
        <Art
          image="conselho"
          title="Quem entra. O que permanece."
          eyebrow="O Conselho do Olimpo"
        />
        <div className="management-content">
          <h1 className="z-t2">Administração</h1>
          <p className="mg-lede">
            Um lugar privado, cuidado por ti. Gere os Membros, abre as portas e
            escolhe os Add-ons do Zeus.
          </p>
          <div
            className="mg-grid"
            style={{
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              marginBottom: 28,
            }}
          >
            <div>
              <b className="mg-stat">
                {members.filter((m) => m.active !== false).length}
              </b>
              <span className="mg-stat-label">Membros activos</span>
            </div>
            <div>
              <b className="mg-stat">
                {addons.filter((a) => a.status === "pending").length}
              </b>
              <span className="mg-stat-label">Add-ons pendentes</span>
            </div>
            <div>
              <b className="mg-stat">{invites.filter(pending).length}</b>
              <span className="mg-stat-label">Convites pendentes</span>
            </div>
          </div>
          <nav className="mg-tabs" aria-label="Administração">
            {[
              ["members", "Membros"],
              ["invites", "Convites"],
              ["addons", "Catálogo de Add-ons"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`z-btn ${tab === id ? "z-btn--secondary" : "z-btn--ghost"}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
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
              <div className="mg-section-head">
                <h2 className="z-t3">As pessoas do Zeus</h2>
                <input
                  className="mg-input"
                  style={{ maxWidth: 300 }}
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
                  <article className="mg-row" key={m.id}>
                    <div>
                      <b>{m.name}</b>
                      <small>{m.email}</small>
                    </div>
                    <span className="mg-tag">
                      {m.role === "admin"
                        ? "Administrador"
                        : m.active === false
                          ? "Desactivado"
                          : "Membro"}
                    </span>
                    <span className="mg-muted">
                      {m.twoFactorEnabled
                        ? "TOTP activo"
                        : "TOTP por configurar"}
                    </span>
                    {m.id !== user?.id && (
                      <button
                        className="z-btn z-btn--ghost z-btn--sm"
                        disabled={!!busy}
                        onClick={() => {
                          if (
                            m.active !== false &&
                            !window.confirm(`Desactivar o acesso de ${m.name}?`)
                          )
                            return;
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
                  </article>
                ))}
            </section>
          )}
          {tab === "invites" && (
            <section>
              <h2 className="z-t3">Abre as portas a alguém</h2>
              <p className="mg-lede">
                Cada Convite permite criar uma única conta.
              </p>
              <form
                className="mg-form"
                style={{ maxWidth: 640 }}
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
                <label>
                  Email do novo Membro
                  <input
                    className="mg-input"
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
                      className="mg-input"
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
                          setError("Selecciona o link e copia-o manualmente."),
                        )
                    }
                  >
                    Copiar link
                  </button>
                </div>
              )}
              {invites.map((i) => (
                <article className="mg-row" key={i.id}>
                  <div>
                    <b>{i.email}</b>
                    <small>
                      Validade: {new Date(i.expiresAt).toLocaleString("pt-PT")}
                    </small>
                  </div>
                  <span className="mg-tag">
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
              <div className="mg-section-head">
                <div>
                  <h2 className="z-t3">O teu selo de aprovação</h2>
                  <p className="mg-lede">
                    Sincroniza o registo público e escolhe quais os Add-ons
                    disponíveis para os Membros.
                  </p>
                </div>
                <button
                  className="z-btn z-btn--primary"
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
                  {busy === "sync" ? "A sincronizar…" : "Sincronizar catálogo"}
                </button>
              </div>
              <div className="mg-tabs">
                {[
                  ["pending", "Pendentes"],
                  ["approved", "Aprovados"],
                  ["rejected", "Rejeitados"],
                ].map(([id, label]) => (
                  <button
                    className="z-chip"
                    aria-pressed={filter === id}
                    key={id}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mg-install-grid">
                {addons
                  .filter((a) => a.status === filter)
                  .map((a) => (
                    <article className="mg-card" key={a.id}>
                      {a.status === "approved" && (
                        <span className="mg-stamp">APROVADO</span>
                      )}
                      <h3>{a.name}</h3>
                      <p>{a.description}</p>
                      <p
                        className="mg-muted"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {a.manifestUrl}
                      </p>
                      <div className="mg-actions">
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
                      </div>
                    </article>
                  ))}
              </div>
              {!addons.some((a) => a.status === filter) && !loading && (
                <p className="mg-empty">Nenhum Add-on neste estado.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
