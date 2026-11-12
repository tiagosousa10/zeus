import { ZeusLoader } from "../../../shared/components/ZeusLoader";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { TVChannel, Programme } from "../models/types";
const modalStack: HTMLElement[] = [];
let restoreDocumentOverflow = () => {};
function lockDocumentScroll() {
  // html remains the viewport scroller when global styles set overflow-x: clip.
  // Preserve each axis (including inline priorities) rather than a lossy shorthand.
  const snapshots = [document.documentElement, document.body].map(
    (element) => ({
      element,
      axes: ["overflow-x", "overflow-y"].map((property) => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      })),
    }),
  );
  for (const { element } of snapshots) element.style.overflow = "hidden";
  return () => {
    for (const { element, axes } of snapshots) {
      for (const { property, value, priority } of axes) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
  };
}
let originalFocus: HTMLElement | null = null;
export function ownsModalInteraction(element: HTMLElement | null) {
  return !!element && !!modalStack.at(-1)?.contains(element);
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
  fullViewport = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  fullViewport?: boolean;
}) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const root = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    const previous = previousFocus.current;
    const element = root.current!;
    if (!modalStack.length) {
      restoreDocumentOverflow = lockDocumentScroll();
      originalFocus = previous;
    }
    modalStack.push(element);
    (
      root.current?.querySelector<HTMLElement>("input,select") ||
      root.current?.querySelector<HTMLElement>("button")
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== element) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) || [],
        ).filter(
          (el) =>
            el.offsetParent !== null &&
            !el.closest("[inert]") &&
            getComputedStyle(el).visibility !== "hidden",
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      const wasTop = modalStack.at(-1) === element;
      modalStack.splice(modalStack.indexOf(element), 1);
      if (!modalStack.length) restoreDocumentOverflow();
      document.removeEventListener("keydown", handler);
      if (wasTop && previous?.isConnected) previous.focus();
      else if (!modalStack.length && originalFocus?.isConnected)
        originalFocus.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`tv-modal${fullViewport ? " tv-modal-full-viewport" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={root}
        className={"tv-sheet " + className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function Outline({ children }: { children: ReactNode }) {
  return (
    <span className="tv-outline" aria-hidden="true">
      {children}
    </span>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="tv-empty">
      <span className="tv-eyebrow">ZEUS · TV</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Poster({
  src,
  title,
  progress = 0,
  onClick,
}: {
  src?: string;
  title: string;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <button className="tv-poster" onClick={onClick}>
      {src ? (
        <img src={src} alt="" loading="lazy" />
      ) : (
        <span>{title.slice(0, 2)}</span>
      )}
      <strong>{title}</strong>
      {progress > 0 && <progress value={progress} max={1} />}
    </button>
  );
}
export function ChannelCard({
  channel,
  now,
  next,
  favorite,
  onPlay,
  onFavorite,
}: {
  channel: TVChannel;
  now?: Programme;
  next?: Programme;
  favorite: boolean;
  onPlay: () => void;
  onFavorite: () => void;
}) {
  const ratio = now
    ? Math.min(
        1,
        Math.max(0, (Date.now() - now.start) / (now.stop - now.start)),
      )
    : 0;
  return (
    <article className="tv-channel">
      <button className="tv-channel-main" onClick={onPlay}>
        <span className="tv-logo">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            channel.name.slice(0, 3)
          )}
        </span>
        <span
          className="tv-ring"
          style={{ "--progress": `${ratio * 360}deg` } as CSSProperties}
        >
          {now ? `${Math.round(ratio * 100)}%` : "—"}
        </span>
        <strong>{channel.name}</strong>
        <span>{now?.title || "Sem guia"}</span>
        {next && (
          <small>
            {new Date(next.start).toLocaleTimeString("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {next.title}
          </small>
        )}
      </button>
      <button
        className="tv-favorite"
        aria-label={`${favorite ? "Remover" : "Adicionar"} ${channel.name} ${favorite ? "dos" : "aos"} favoritos`}
        aria-pressed={favorite}
        onClick={onFavorite}
      >
        {favorite ? "★" : "☆"}
      </button>
    </article>
  );
}
export function Skeleton() {
  return <ZeusLoader />;
}
