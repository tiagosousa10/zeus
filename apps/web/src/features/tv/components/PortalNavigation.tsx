import { useState } from "react";
import type { CategoryView } from "../models/types";
import { CategoryEmblem } from "./PortalCard";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT");
export function PortalNavigation({
  categories,
  selected,
  onSelect,
  onManage,
}: {
  categories: CategoryView[];
  selected?: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}) {
  const [search, setSearch] = useState("");
  const visible = categories.filter((category) =>
    normalize(category.name).includes(normalize(search.trim())),
  );
  return (
    <aside className="tv-workspace-sidebar">
      <div className="tv-workspace-sidebar-title">
        <span>Os teus portais</span>
        <small>{categories.length}</small>
      </div>
      <label className="tv-workspace-search">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          type="search"
          aria-label="Filtrar portais"
          placeholder="Encontrar portal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <nav className="tv-workspace-portals" aria-label="Portais do workspace">
        {visible.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-current={selected === category.id ? "page" : undefined}
            onClick={() => onSelect(category.id)}
          >
            <CategoryEmblem category={category} />
            <span>
              {category.name}
              {category.pinned && <small>Fixado</small>}
            </span>
            <small>{category.count.toLocaleString("pt-PT")}</small>
          </button>
        ))}
        {!visible.length && (
          <p className="tv-workspace-no-match" role="status">
            Nenhum portal encontrado.
          </p>
        )}
      </nav>
      <button className="tv-workspace-manage" type="button" onClick={onManage}>
        Gerir pastas <span aria-hidden="true">↗</span>
      </button>
    </aside>
  );
}
