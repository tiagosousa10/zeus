import { useEffect, useState } from "react";
import { Art, Page } from "../components/Layout";
import { api } from "../lib/api";
import { useMemberState } from "../lib/session";
import "./management.css";
type Addon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  configFields?: Array<{
    key: string;
    title?: string;
    type?: string;
    options?: string[];
    default?: string;
    required?: boolean;
  }>;
  configurationRequired?: boolean;
};
export default function Addons() {
  const { state, save, loading, error: stateError } = useMemberState();
  const [catalogue, setCatalogue] = useState<Addon[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [q, setQ] = useState(""),
    [configuring, setConfiguring] = useState<string | null>(null),
    [config, setConfig] = useState<Record<string, any>>({}),
    [draft, setDraft] = useState<Addon | null>(null);
  const load = () =>
    api<{ addons: Addon[] }>("/addons")
      .then((x) => setCatalogue(x.addons))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const installed = state.addons || [];
  const mutate = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setBusy("");
    }
  };
  const update = (id: string, patch: Record<string, unknown>) =>
    save({
      addons: installed.map((a: any) => (a.id === id ? { ...a, ...patch } : a)),
    });
  const initialConfig = (a: Addon) =>
    Object.fromEntries(
      (a.configFields || [])
        .filter(
          (f) =>
            f.default !== undefined &&
            (f.type !== "checkbox" ||
              ["checked", "on", true].includes(f.default as any)),
        )
        .map((f) => [f.key, f.type === "checkbox" ? "on" : f.default]),
    );
  const ordered = installed.map((a: any) => ({
    ...catalogue.find((c) => c.id === a.id),
    ...a,
  }));
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
          image="hefesto"
          title="Forja o teu mundo."
          eyebrow="A forja de Hefesto"
        />
        <div className="management-content">
          <section className="mg-section">
            <div className="mg-section-head">
              <div>
                <h1 className="z-t2">Os teus Add-ons</h1>
                <p className="mg-lede">
                  Cada aliado abre uma porta. A ordem define a prioridade dos
                  teus catálogos e Fontes.
                </p>
              </div>
              <a className="z-btn z-btn--ghost" href="#catalogue">
                Explorar catálogo
              </a>
            </div>
            {error && (
              <p role="alert" className="mg-message mg-error">
                {error}{" "}
                <button className="mg-link" onClick={load}>
                  Tentar novamente
                </button>
              </p>
            )}
            {draft && (
              <form
                className="mg-card mg-form"
                style={{ marginBottom: 24 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(draft.id, async () => {
                    await save({
                      addons: [
                        ...installed,
                        { id: draft.id, enabled: true, config },
                      ],
                    });
                    setDraft(null);
                  });
                }}
              >
                <h2 className="z-t3">Configurar {draft.name}</h2>
                <p className="mg-muted">
                  Preenche os campos pedidos pelo Add-on. A configuração fica
                  privada e cifrada.
                </p>
                {(draft.configFields || []).map((field) => (
                  <label
                    key={field.key}
                    className={
                      field.type === "checkbox" ? "mg-check" : undefined
                    }
                  >
                    {field.type === "checkbox" ? (
                      <>
                        <input
                          type="checkbox"
                          checked={config[field.key] === "on"}
                          required={field.required}
                          onChange={(e) => {
                            const next = { ...config };
                            if (e.target.checked) next[field.key] = "on";
                            else delete next[field.key];
                            setConfig(next);
                          }}
                        />
                        {field.title || field.key}
                      </>
                    ) : (
                      <>
                        {field.title || field.key}
                        {field.type === "select" ? (
                          <select
                            className="mg-input"
                            value={config[field.key] ?? ""}
                            required={field.required}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                [field.key]: e.target.value,
                              })
                            }
                          >
                            <option value="">Escolher…</option>
                            {(field.options || []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="mg-input"
                            type={
                              ["number", "password"].includes(field.type || "")
                                ? field.type
                                : "text"
                            }
                            autoComplete="off"
                            value={config[field.key] ?? ""}
                            required={field.required}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                [field.key]: e.target.value,
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </label>
                ))}
                <div className="mg-actions">
                  <button className="z-btn z-btn--primary" disabled={!!busy}>
                    Guardar e instalar
                  </button>
                  <button
                    className="z-btn z-btn--ghost"
                    type="button"
                    onClick={() => setDraft(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            {loading ? (
              <p>A carregar…</p>
            ) : ordered.length === 0 ? (
              <p className="mg-empty">
                Ainda não instalaste Add-ons. Escolhe um no catálogo abaixo.
              </p>
            ) : (
              ordered.map((a: any, i: number) => (
                <article
                  className="mg-card"
                  key={a.id}
                  style={{ marginBottom: 14 }}
                >
                  <div className="mg-row">
                    <div>
                      <h2 className="z-t3">{a.name || a.id}</h2>
                      <small>
                        {a.description ||
                          "Este Add-on já não está disponível no catálogo aprovado."}
                      </small>
                    </div>
                    <label className="mg-check">
                      <input
                        type="checkbox"
                        checked={a.enabled !== false}
                        disabled={busy === a.id}
                        onChange={(e) =>
                          mutate(a.id, () =>
                            update(a.id, { enabled: e.target.checked }),
                          )
                        }
                      />
                      Activado
                    </label>
                  </div>
                  <div className="mg-actions">
                    <button
                      className="z-btn z-btn--ghost z-btn--sm"
                      disabled={i === 0 || !!busy}
                      onClick={() =>
                        mutate(a.id, () => {
                          const next = [...installed];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return save({ addons: next });
                        })
                      }
                    >
                      Subir
                    </button>
                    <button
                      className="z-btn z-btn--ghost z-btn--sm"
                      disabled={i === ordered.length - 1 || !!busy}
                      onClick={() =>
                        mutate(a.id, () => {
                          const next = [...installed];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          return save({ addons: next });
                        })
                      }
                    >
                      Descer
                    </button>
                    {(/torrentio/i.test(a.name || a.id) ||
                      a.configFields?.length) && (
                      <button
                        className="z-btn z-btn--secondary z-btn--sm"
                        onClick={() => {
                          setConfiguring(configuring === a.id ? null : a.id);
                          setDraft(null);
                          setConfig(a.config || {});
                        }}
                      >
                        Configurar
                      </button>
                    )}
                    <button
                      className="z-btn z-btn--ghost z-btn--sm"
                      disabled={!!busy}
                      onClick={() =>
                        mutate(a.id, () =>
                          save({
                            addons: installed.filter((x: any) => x.id !== a.id),
                          }),
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                  {configuring === a.id && (
                    <form
                      className="mg-config mg-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mutate(a.id, async () => {
                          await update(a.id, { config });
                          setConfiguring(null);
                        });
                      }}
                    >
                      <h3>Configurar {a.name}</h3>
                      {/torrentio/i.test(a.name || a.id) ? (
                        <>
                          <label>
                            Serviço Debrid
                            <select
                              className="mg-input"
                              value={config.debridProvider || ""}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  debridProvider: e.target.value,
                                })
                              }
                            >
                              <option value="">Sem Debrid</option>
                              <option value="realdebrid">Real-Debrid</option>
                              <option value="alldebrid">AllDebrid</option>
                              <option value="premiumize">Premiumize</option>
                            </select>
                          </label>
                          {config.debridProvider && (
                            <label>
                              Chave API
                              <input
                                className="mg-input"
                                type="password"
                                autoComplete="off"
                                required
                                value={config.apiKey || ""}
                                onChange={(e) =>
                                  setConfig({
                                    ...config,
                                    apiKey: e.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                          <label>
                            Ordenação
                            <select
                              className="mg-input"
                              value={config.sort || "qualityseeders"}
                              onChange={(e) =>
                                setConfig({ ...config, sort: e.target.value })
                              }
                            >
                              <option value="qualityseeders">
                                Qualidade e seeders
                              </option>
                              <option value="seeders">Mais seeders</option>
                              <option value="size">Tamanho</option>
                            </select>
                          </label>
                          <p className="mg-muted">
                            A configuração é privada. A chave fica cifrada no
                            servidor e só é enviada ao Add-on aprovado ao
                            procurar Fontes.
                          </p>
                        </>
                      ) : (
                        (a.configFields || []).map((field: any) => (
                          <label
                            key={field.key}
                            className={
                              field.type === "checkbox" ? "mg-check" : undefined
                            }
                          >
                            {field.type === "checkbox" ? (
                              <>
                                <input
                                  type="checkbox"
                                  checked={
                                    config[field.key] === "on" ||
                                    config[field.key] === true
                                  }
                                  required={field.required}
                                  onChange={(e) => {
                                    const next = { ...config };
                                    if (e.target.checked)
                                      next[field.key] = "on";
                                    else delete next[field.key];
                                    setConfig(next);
                                  }}
                                />
                                {field.title || field.key}
                              </>
                            ) : (
                              <>
                                {field.title || field.key}
                                {field.type === "select" ? (
                                  <select
                                    className="mg-input"
                                    value={config[field.key] ?? ""}
                                    required={field.required}
                                    onChange={(e) =>
                                      setConfig({
                                        ...config,
                                        [field.key]: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">Escolher…</option>
                                    {(field.options || []).map(
                                      (option: string) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : (
                                  <input
                                    className="mg-input"
                                    type={
                                      ["number", "password"].includes(
                                        field.type,
                                      )
                                        ? field.type
                                        : "text"
                                    }
                                    autoComplete="off"
                                    value={config[field.key] ?? ""}
                                    required={field.required}
                                    onChange={(e) =>
                                      setConfig({
                                        ...config,
                                        [field.key]: e.target.value,
                                      })
                                    }
                                  />
                                )}
                              </>
                            )}
                          </label>
                        ))
                      )}
                      <div className="mg-actions">
                        <button
                          className="z-btn z-btn--primary"
                          disabled={!!busy}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="z-btn z-btn--ghost"
                          onClick={() => setConfiguring(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              ))
            )}
          </section>
          <section id="catalogue">
            <div className="mg-section-head">
              <div>
                <h2 className="z-t2">Catálogo de Add-ons</h2>
                <p className="mg-muted">
                  Aprovados pelo Administrador. Escolhidos por ti.
                </p>
              </div>
              <input
                className="mg-input"
                style={{ maxWidth: 300 }}
                type="search"
                placeholder="Procurar Add-on"
                aria-label="Procurar Add-on"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="mg-install-grid">
              {catalogue
                .filter((a) =>
                  (a.name + " " + a.description)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .map((a) => (
                  <article className="mg-card" key={a.id}>
                    <span className="mg-tag">APROVADO</span>
                    <h3 style={{ marginTop: 20 }}>{a.name}</h3>
                    <p>{a.description}</p>
                    {a.configurationRequired && (
                      <p className="mg-muted">
                        Precisa de configuração para instalar.
                      </p>
                    )}
                    <div className="mg-actions">
                      {installed.some((x: any) => x.id === a.id) ? (
                        <span className="mg-tag">Instalado</span>
                      ) : (
                        <button
                          className="z-btn z-btn--secondary"
                          disabled={!!busy || loading}
                          onClick={() => {
                            if (a.configurationRequired) {
                              setConfiguring(null);
                              setDraft(a);
                              setConfig(initialConfig(a));
                              return;
                            }
                            void mutate(a.id, () =>
                              save({
                                addons: [
                                  ...installed,
                                  {
                                    id: a.id,
                                    enabled: true,
                                    config: initialConfig(a),
                                  },
                                ],
                              }),
                            );
                          }}
                        >
                          {busy === a.id ? "A instalar…" : "Instalar"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
            {!catalogue.length && (
              <p className="mg-empty">
                O catálogo ainda não tem Add-ons aprovados. O Administrador pode
                sincronizá-lo e aprovar novas entradas.
              </p>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
