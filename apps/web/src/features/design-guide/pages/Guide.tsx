import { useEffect, useRef } from "react";
import { Page } from "../../shell/components/Layout";
import markup from "./guide-markup.html?raw";
import { mountGuide } from "./guide-effects.js";
import "../styles/guide.css";
// The approved local specimen is inert markup; interactions are mounted with lifecycle cleanup.
export default function Guide() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const el = root.current;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      cleanup = mountGuide(el);
    else
      void import("../../../shared/graphics/three-runtime").then((THREE) => {
        if (cancelled) return;
        Object.assign(window, { THREE });
        cleanup = mountGuide(el);
      });
    return () => {
      cancelled = true;
      cleanup?.();
      el.innerHTML = markup;
    };
  }, []);
  return (
    <Page className="guide-page">
      <div id="top" ref={root} dangerouslySetInnerHTML={{ __html: markup }} />
    </Page>
  );
}
