import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import "./app-header.css";
/** One geometry for both modules; colour and section contents may differ. */
export const AppHeader = forwardRef<
  HTMLElement,
  {
    module: "cinema" | "tv";
    className?: string;
    sections: ReactNode;
    tools: ReactNode;
    children?: ReactNode;
  }
>(function AppHeader(
  { module, className = "", sections, tools, children },
  forwardedRef,
) {
  const host = useRef<HTMLElement>(null);
  useImperativeHandle(forwardedRef, () => host.current!, []);
  useEffect(() => {
    const scroll = () =>
      host.current?.classList.toggle("is-scrolled", scrollY > 24);
    addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => removeEventListener("scroll", scroll);
  }, []);
  return (
    <header
      ref={host}
      className={`app-header ${className}`}
      data-module={module}
    >
      <a
        className="app-header-logo"
        href="/portal"
        aria-label="Zeus, voltar ao Portal"
      >
        ZEUS
      </a>
      <nav className="app-header-modules" aria-label="Módulos">
        <a
          href="/cinema"
          aria-current={module === "cinema" ? "page" : undefined}
        >
          Cinema
        </a>
        <a href="/tv" aria-current={module === "tv" ? "page" : undefined}>
          TV
        </a>
      </nav>
      {sections}
      {tools}
      {children}
    </header>
  );
});
