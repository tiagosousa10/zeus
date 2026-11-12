import { AppHeader } from "../../../shared/components/AppHeader";
import { openUniversalSearch } from "./UniversalSearch";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "../../../shared/hooks/session";
import { useMotorStatus } from "../../motor/hooks/motor-status";
import { signOut } from "../../auth/services/entry";
const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
export function Nav({
  module,
  sections,
  onTVSettings,
  className = "z-nav",
}: {
  module?: "cinema" | "tv";
  sections?: ReactNode;
  onTVSettings?: () => void;
  className?: string;
} = {}) {
  const { user } = useSession();
  const host = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<"menu" | null>(null);
  const status = useMotorStatus();
  const motor = status === null ? "busy" : status ? "ok" : "off";
  const [hash, setHash] = useState(location.hash);
  const [signOutError, setSignOutError] = useState("");
  const tv = module ? module === "tv" : location.pathname === "/tv";
  const active = tv ? "tv" : "cinema";
  const page = tv
    ? hash === "#guia"
      ? "guia"
      : "canais"
    : location.pathname === "/cinema"
      ? hash === "#lista"
        ? "lista"
        : "inicio"
      : location.pathname.slice(1);
  const links = tv
    ? [
        ["canais", "Canais", "/tv"],
        ["guia", "Guia", "/tv#guia"],
      ]
    : [
        ["inicio", "Início", "/cinema"],
        ["explorar", "Explorar", "/explorar"],
        ["lista", "A minha lista", "/cinema#lista"],
      ];
  const motorLabel = {
    ok: "Motor ligado",
    busy: "Motor a arrancar",
    off: "Motor desligado",
  }[motor];
  useEffect(() => {
    const changeHash = () => setHash(location.hash);
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(null);
    };
    addEventListener("hashchange", changeHash);
    document.addEventListener("pointerdown", outside);
    return () => {
      removeEventListener("hashchange", changeHash);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const panel = host.current?.querySelector<HTMLElement>("#z-nav-menu");
    panel?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const tween =
      panel && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? panel.animate(
            [
              { opacity: 0, transform: "translateY(-8px) scale(.98)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 300, easing: "ease-out" },
          )
        : undefined;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        host.current?.querySelector<HTMLElement>(`[data-nav-${open}]`)?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      tween?.cancel();
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <AppHeader
      module={active}
      className={className}
      ref={host}
      sections={
        sections ?? (
          <nav
            className="z-tabs z-nav__links app-header-sections"
            aria-label={`Secções de ${tv ? "TV" : "Cinema"}`}
          >
            {links.map(([key, label, href]) => (
              <a
                key={key}
                href={href}
                aria-current={page === key ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        )
      }
      tools={
        <div
          className={`z-nav__end app-header-tools ${tv ? "tv-header-tools" : ""}`}
        >
          <button
            className="z-icon-btn app-header-search"
            type="button"
            data-nav-search
            aria-label="Pesquisar"
            aria-haspopup="dialog"
            onClick={openUniversalSearch}
          >
            <SearchIcon />
            <span>Pesquisar</span>
            <kbd>⌘K</kbd>
          </button>
          <a
            className="z-status"
            href="/estados"
            data-state={motor}
            aria-live="polite"
          >
            {motorLabel}
          </a>
          <a
            className="z-icon-btn z-nav__portal"
            href="/portal"
            aria-label="Portal"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {[
                [4, 4],
                [13.5, 4],
                [4, 13.5],
                [13.5, 13.5],
              ].map(([x, y]) => (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width="6.5"
                  height="6.5"
                  rx="2"
                />
              ))}
            </svg>
          </a>
          <button
            className="z-avatar"
            type="button"
            data-nav-menu
            aria-haspopup="menu"
            aria-expanded={open === "menu"}
            aria-controls="z-nav-menu"
            aria-label={`Menu da conta, ${user?.name || ""}`}
            onClick={() => setOpen(open === "menu" ? null : "menu")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen("menu");
              }
            }}
          >
            {user?.name
              .split(/\s+/)
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "Ζ"}
          </button>
        </div>
      }
    >
      <div
        className="z-menu"
        id="z-nav-menu"
        role="menu"
        aria-label="Conta"
        hidden={open !== "menu"}
        onKeyDown={(e) => {
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
          );
          const index = items.indexOf(document.activeElement as HTMLElement);
          const next = (
            {
              ArrowDown: index + 1,
              ArrowUp: index - 1,
              Home: 0,
              End: items.length - 1,
            } as Record<string, number>
          )[e.key];
          if (next !== undefined) {
            e.preventDefault();
            items[(next + items.length) % items.length]?.focus();
          }
        }}
      >
        <div className="z-menu__head">
          <b>{user?.name}</b>
          {user?.email}
          <br />
          <span className="z-status" data-state={motor}>
            {motorLabel}
          </span>
        </div>
        {onTVSettings && (
          <button
            className="z-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(null);
              host.current
                ?.querySelector<HTMLElement>("[data-nav-menu]")
                ?.focus();
              onTVSettings();
            }}
          >
            Configuração da TV
          </button>
        )}
        {[
          ["conta", "Conta"],
          ["addons", "Add-ons"],
          ...(user?.role === "admin" ? [["admin", "Administração"]] : []),
          ["portal", "Portal"],
        ].map(([key, label]) => (
          <a
            className="z-menu__item"
            role="menuitem"
            key={key}
            href={`/${key}`}
            aria-current={page === key ? "page" : undefined}
          >
            {label}
          </a>
        ))}
        <hr />
        <button
          className="z-menu__item"
          role="menuitem"
          onClick={async () => {
            try {
              await signOut();
              location.assign("/entrada");
            } catch (e) {
              setSignOutError(
                e instanceof Error ? e.message : "Não foi possível sair.",
              );
            }
          }}
        >
          Sair
        </button>
        {signOutError && (
          <p role="alert" className="error-message">
            {signOutError}
          </p>
        )}
      </div>
    </AppHeader>
  );
}
