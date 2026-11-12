import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { TVChannel, Programme } from "./types";
const modalStack: HTMLElement[] = [];
let originalOverflow = "";
let originalFocus: HTMLElement | null = null;
export function ownsModalInteraction(element: HTMLElement | null) {
  return !!element && !!modalStack.at(-1)?.contains(element);
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
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
      originalOverflow = document.body.style.overflow;
      originalFocus = previous;
    }
    modalStack.push(element);
    document.body.style.overflow = "hidden";
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
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.offsetParent !== null);
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
      if (!modalStack.length) document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handler);
      if (wasTop && previous?.isConnected) previous.focus();
      else if (!modalStack.length && originalFocus?.isConnected)
        originalFocus.focus();
    };
  }, []);
  return createPortal(
    <div
      className="tv-modal"
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
  return (
    <div className="tv-grid" aria-label="A carregar" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="tv-skeleton" key={i} />
      ))}
    </div>
  );
}
