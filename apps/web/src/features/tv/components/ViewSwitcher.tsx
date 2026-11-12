import { liveLayouts, type LiveLayout } from "../models/live-layout";
const labels: Record<LiveLayout, string> = {
  cards: "Cartões",
  list: "Lista",
  workspace: "Workspace",
};
export function ViewSwitcher({
  value,
  onChange,
}: {
  value: LiveLayout;
  onChange: (layout: LiveLayout) => void;
}) {
  return (
    <div
      className="tv-view-control"
      role="group"
      aria-label="Vista dos portais e canais"
    >
      {liveLayouts.map((layout) => (
        <button
          key={layout}
          type="button"
          aria-pressed={value === layout}
          onClick={() => onChange(layout)}
          title={`Vista ${labels[layout]}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            {layout === "cards" ? (
              <>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </>
            ) : layout === "list" ? (
              <>
                <path d="M8 5h13M8 12h13M8 19h13" />
                <path
                  d="M3 5h1M3 12h1M3 19h1"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M9 9h12M12 13h6M12 17h4" />
              </>
            )}
          </svg>
          <span>{labels[layout]}</span>
        </button>
      ))}
    </div>
  );
}
