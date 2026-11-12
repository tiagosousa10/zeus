import type { CSSProperties } from "react";
import type { CategoryView } from "../models/types";
import { Outline } from "./ui";
export const countryStyle = (country?: string) =>
  ({
    "--aurora-a":
      (
        {
          PT: "14,91,51",
          BR: "15,90,55",
          ES: "104,43,23",
          FR: "23,52,102",
        } as Record<string, string>
      )[country || ""] || "19,69,83",
    "--aurora-b":
      (
        {
          PT: "117,35,29",
          BR: "102,87,24",
          ES: "107,69,25",
          FR: "96,37,45",
        } as Record<string, string>
      )[country || ""] || "37,43,83",
  }) as CSSProperties;
export function CategoryEmblem({ category: c }: { category: CategoryView }) {
  return (
    <span className="tv-category-emblem" aria-hidden="true">
      {c.logo ? (
        <img
          src={c.logo}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : c.country && /^[A-Z]{2}$/.test(c.country) ? (
        [...c.country]
          .map((x) => String.fromCodePoint(127397 + x.charCodeAt(0)))
          .join("")
      ) : /sport|desporto/i.test(c.name) ? (
        "◉"
      ) : /infantil|kids/i.test(c.name) ? (
        "✦"
      ) : /music/i.test(c.name) ? (
        "♫"
      ) : (
        "✧"
      )}
    </span>
  );
}
export function PortalCard({
  category: c,
  index: i,
  onSelect,
}: {
  category: CategoryView;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button
      className={"tv-portal " + (c.pinned ? "is-pinned" : "")}
      style={countryStyle(c.country)}
      onClick={onSelect}
    >
      <span className="tv-eyebrow">
        {c.pinned ? "★ FIXADA" : `PORTAL ${String(i + 1).padStart(2, "0")}`}
      </span>
      <CategoryEmblem category={c} />
      <h2>{c.name}</h2>
      <Outline>{c.count}</Outline>
      <small>canais · Entrar ↗</small>
    </button>
  );
}
