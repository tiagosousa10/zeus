import { useState, type FormEvent } from "react";
import { useTV } from "../hooks/state";
import { Modal } from "../components/ui";
import type { IPTVList, IPTVListUpdate } from "../models/types";
export default function Lists() {
  const tv = useTV(),
    [editing, setEditing] = useState<IPTVList | null | undefined>(),
    [kind, setKind] = useState("xtream"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(list: IPTVList | null) {
    setEditing(list);
    setKind(list?.type || "xtream");
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(async () => {
      const rawUrl = String(data.get("url") || "").trim();
      const url = rawUrl ? new URL(rawUrl) : null;
      if (url && !["http:", "https:"].includes(url.protocol))
        throw Error("Usa um endereço HTTP ou HTTPS.");
      const epg = String(data.get("epgUrl") || "").trim();
      if (epg && !["http:", "https:"].includes(new URL(epg).protocol))
        throw Error("O guia deve usar HTTP ou HTTPS.");
      const next: IPTVListUpdate = {
        id: editing?.id || crypto.randomUUID(),
        name: String(data.get("name")).trim(),
        type: kind as IPTVList["type"],
        ...(url ? { url: url.href } : {}),
        ...(data.get("username")
          ? { username: String(data.get("username")) }
          : {}),
        ...(data.get("password")
          ? { password: String(data.get("password")) }
          : {}),
        ...(data.get("clearEpg") ? { epgUrl: "" } : epg ? { epgUrl: epg } : {}),
      };
      await tv.saveLists((lists) =>
        editing
          ? lists.map((l) => (l.id === next.id ? next : l))
          : [...lists, next],
      );
      setEditing(undefined);
    });
  }
  return (
    <Modal title="Listas IPTV" onClose={tv.closeModal}>
      <p>As tuas listas privadas. Só tu tens acesso às credenciais.</p>
      {editing === undefined ? (
        <>
          <div className="tv-list-cards">
            {tv.lists.map((list) => (
              <article className="tv-list-card" key={list.id}>
                <div>
                  <h3>{list.name}</h3>
                  <small>
                    {list.type === "xtream" ? "Xtream" : "M3U"}{" "}
                    {list.id === tv.listId ? "· Activa" : ""}
                  </small>
                </div>
                <div className="tv-toolbar">
                  <button disabled={busy} onClick={() => edit(list)}>
                    Editar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => tv.refresh(list.id))}
                  >
                    Actualizar lista
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        tv.saveLists((lists) =>
                          lists.filter((l) => l.id !== list.id),
                        ),
                      )
                    }
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
          <button className="tv-primary" onClick={() => edit(null)}>
            ＋ Adicionar lista
          </button>
        </>
      ) : (
        <form
          className="tv-list-form"
          onSubmit={submit}
          key={editing?.id || "new"}
        >
          <h3>{editing ? "Editar lista" : "Adicionar lista"}</h3>
          <label>
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="xtream">Xtream</option>
              <option value="m3u">M3U</option>
            </select>
          </label>
          <label>
            Nome
            <input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={100}
            />
          </label>
          <label>
            {kind === "xtream" ? "Servidor" : "URL da lista"}
            <input
              type="url"
              name="url"
              placeholder={
                editing?.configured.url
                  ? "Configurado · deixa vazio para manter"
                  : ""
              }
              required={!editing}
              autoComplete="off"
            />
          </label>
          {kind === "xtream" && (
            <>
              <label>
                Nome de acesso do fornecedor
                <input
                  name="username"
                  placeholder={
                    editing?.configured.username
                      ? "Configurado · deixa vazio para manter"
                      : ""
                  }
                  required={!editing || editing.type !== kind}
                  autoComplete="off"
                />
              </label>
              <label>
                Palavra-passe
                <input
                  type="password"
                  name="password"
                  placeholder={
                    editing?.configured.password
                      ? "Configurada · deixa vazio para manter"
                      : ""
                  }
                  required={!editing || editing.type !== kind}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
          <label>
            URL do guia EPG (opcional)
            <input
              type="url"
              name="epgUrl"
              placeholder={
                editing?.configured.epgUrl
                  ? "Configurado · deixa vazio para manter"
                  : ""
              }
              autoComplete="off"
            />
          </label>
          {editing?.configured.epgUrl && (
            <label>
              <input type="checkbox" name="clearEpg" /> Remover guia EPG
            </label>
          )}
          <div className="tv-toolbar">
            <button type="submit" className="tv-primary" disabled={busy}>
              {busy ? "A guardar…" : "Guardar lista"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {busy && <p role="status">A concluir…</p>}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
