import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
export function ZeusLoader({
  label = "A carregar…",
  compact = false,
  scope = "local",
}: {
  label?: string;
  compact?: boolean;
  scope?: "local" | "global";
}) {
  return (
    <div
      className={`zeus-loader ${compact ? "is-compact" : ""}`}
      data-loading-scope={scope}
      role="status"
      aria-live="polite"
    >
      <span className="zeus-loader-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" />
          <path d="M23 7 12 22h8l-3 11 12-17h-9z" />
        </svg>
      </span>
      <span>{label}</span>
    </div>
  );
}
/** Delayed foreground feedback, excluding heartbeats and background refreshes. */
export function ActivityIndicator() {
  const fetching = useIsFetching({
    predicate: (q) =>
      q.state.data === undefined &&
      !["motor-status", "session"].includes(String(q.queryKey[0])),
  });
  const mutations = useIsMutating();
  const [requests, setRequests] = useState(0);
  useEffect(() => {
    const listener = (e: Event) =>
      setRequests((n) => Math.max(0, n + (e as CustomEvent<number>).detail));
    window.addEventListener("zeus:request", listener);
    return () => window.removeEventListener("zeus:request", listener);
  }, []);
  const mutating = mutations + requests;
  const [visible, setVisible] = useState(false);
  const [navigation, setNavigation] = useState(false);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest("a");
      if (
        !a ||
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button ||
        a.target ||
        a.hasAttribute("download")
      )
        return;
      const url = new URL(a.href);
      if (
        url.origin === location.origin &&
        (url.pathname !== location.pathname || url.search !== location.search)
      )
        setNavigation(true);
    };
    const reset = () => setNavigation(false);
    document.addEventListener("click", click);
    window.addEventListener("pageshow", reset);
    const id = setTimeout(reset, 15000);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("pageshow", reset);
      clearTimeout(id);
    };
  }, [navigation]);
  useEffect(() => {
    if (!fetching && !mutating && !navigation) {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(id);
  }, [fetching, mutating, navigation]);
  return visible ? (
    <div className="zeus-activity">
      <ZeusLoader
        scope="global"
        compact
        label={navigation ? "A abrir…" : "A carregar…"}
      />
    </div>
  ) : null;
}
