import { useState } from "react";
import { useTV } from "./state";
import { Modal, Outline } from "./ui";
import { sectionNames, togglePinned, toggleVisibility } from "./helpers";
import type { Section } from "./types";
export default function Folders() {
  const tv = useTV(),
    [section, setSection] = useState<Section>(tv.section),
    [drag, setDrag] = useState<string | null>(null),
    [error, setError] = useState("");
  const categories = tv.summary?.sections[section]?.categories || [];
  async function change(fn: Parameters<typeof tv.updatePrefs>[0]) {
    try {
      await tv.updatePrefs(fn);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function move(id: string, to: number) {
    const order = categories.map((c) => c.id),
      from = order.indexOf(id);
    if (to < 0 || to >= order.length) return;
    order.splice(from, 1);
    order.splice(to, 0, id);
    void change((p) => ({
      ...p,
      order: { ...p.order, [section]: order },
      pinned: {
        ...p.pinned,
        [section]: order.filter((x) => p.pinned[section].includes(x)),
      },
    }));
  }
  return (
    <Modal title="Gerir pastas" onClose={tv.closeModal}>
      <p>Os teus portais, à tua maneira. Fixa até quatro por secção.</p>
      <div className="tv-toolbar">
        {(["live", "series", "movie"] as const)
          .filter((s) => tv.summary?.sections[s])
          .map((s) => (
            <button
              key={s}
              aria-pressed={section === s}
              onClick={() => setSection(s)}
            >
              {sectionNames[s]}
            </button>
          ))}
      </div>
      <div className="tv-folder-list">
        {categories.map((c, i) => (
          <article
            className="tv-folder"
            key={c.id}
            draggable
            onDragStart={() => setDrag(c.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) move(drag, i);
              setDrag(null);
            }}
          >
            <span className="tv-drag" aria-hidden="true">
              ⠿
            </span>
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.hidden ? "Escondida" : `${c.count} canais e conteúdos`}
              </small>
            </div>
            <Outline>{c.count}</Outline>
            <button
              aria-label={`Mover ${c.name} para cima`}
              disabled={!i}
              onClick={() => move(c.id, i - 1)}
            >
              ↑
            </button>
            <button
              aria-label={`Mover ${c.name} para baixo`}
              disabled={i === categories.length - 1}
              onClick={() => move(c.id, i + 1)}
            >
              ↓
            </button>
            <button
              aria-label={`Fixar ${c.name}`}
              aria-pressed={c.pinned}
              onClick={() => void change((p) => togglePinned(p, section, c.id))}
            >
              ★
            </button>
            <button
              className="tv-switch"
              role="switch"
              aria-checked={!c.hidden}
              aria-label={`Mostrar ${c.name}`}
              onClick={() =>
                void change((p) =>
                  toggleVisibility(
                    p,
                    section,
                    c.id,
                    c.hidden && !tv.prefs.hidden[section].includes(c.id),
                  ),
                )
              }
            />
          </article>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="tv-primary" onClick={tv.closeModal}>
        Concluído
      </button>
    </Modal>
  );
}
