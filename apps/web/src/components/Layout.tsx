import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { useSession } from "../lib/session";
import { api } from "../lib/api";
Object.assign(window, { gsap });
const imageUrl = (image: string) =>
  image.startsWith("/")
    ? image
    : `/art/img/${image.replace(/^img\//, "").replace(/\.webp$/, "")}.webp`;
export function Art({
  image,
  title,
  eyebrow,
  children,
  className = "",
}: {
  image: string;
  title?: string;
  eyebrow?: string;
  children?: ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    Promise.all([import("three"), import("../lib/fx.js")])
      .then(([THREE, fxModule]) => {
        const fx = fxModule as any;
        Object.assign(window, { THREE });
        if (cancelled || !host.current) return;
        const painting = fx.livingPainting(host.current, imageUrl(image), {
          focus: { x: 0.62, y: 0.35 },
          anchor: { x: 0.72, y: 0.45 },
          anchorNarrow: { x: 0.6, y: 0.3 },
          figure: [
            [0.6, 0.4, 0.3, 0.35],
            [0.45, 0.6, 0.2, 0.2],
            [0.8, 0.6, 0.2, 0.25],
          ],
          size: (w: number, h: number) => Math.max(w, h * 1.4),
        });
        painting.state.exposure = 0.85;
        cleanup = () => painting.destroy();
      })
      .catch(() => {});
    const context = gsap.context(() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        gsap.fromTo(
          copy.current,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.15, ease: "power3.out" },
        );
    }, copy);
    return () => {
      cancelled = true;
      cleanup();
      context.revert();
    };
  }, [image]);
  return (
    <section className={`art-hero ${className}`}>
      <div
        className="art-painting"
        ref={host}
        style={{ backgroundImage: `url("${imageUrl(image)}")` }}
        aria-hidden="true"
      />
      <div className="art-shade" />
      <div className="art-copy" ref={copy}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h1>{title}</h1>}
        {children}
      </div>
    </section>
  );
}
export function Nav() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [motor, setMotor] = useState(false);
  const path = location.pathname;
  useEffect(() => {
    let alive = true;
    const check = () =>
      api<{ ok: boolean }>("/motor/status")
        .then((r) => alive && setMotor(r.ok))
        .catch(() => alive && setMotor(false));
    void check();
    const id = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return (
    <header className="app-nav">
      <a className="brand" href="/portal" aria-label="Zeus — Portal">
        ZEUS
      </a>
      <nav aria-label="Módulos" className="module-nav">
        <a
          href="/cinema"
          className={/cinema|explorar|titulo|leitor/.test(path) ? "active" : ""}
        >
          Cinema
        </a>
        <a href="/tv" className={path === "/tv" ? "active" : ""}>
          TV
        </a>
      </nav>
      {path === "/tv" ? (
        <nav className="section-nav" aria-label="TV">
          <a href="/tv">Canais</a>
          <a href="/tv#guia">Guia</a>
        </nav>
      ) : (
        <nav className="section-nav" aria-label="Cinema">
          <a href="/cinema">Início</a>
          <a href="/explorar">Explorar</a>
          <a href="/cinema#lista">A minha lista</a>
        </nav>
      )}
      <div className="nav-right">
        <a className="search-link" href="/explorar" aria-label="Pesquisar">
          ⌕
        </a>
        <a className={`motor-chip ${motor ? "online" : ""}`} href="/estados">
          <i />
          {motor ? "Motor ligado" : "Motor desligado"}
        </a>
        <button
          className="avatar"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Abrir menu da conta"
        >
          {user?.name?.slice(0, 2).toUpperCase() || "Ζ"}
        </button>
      </div>
      {open && (
        <nav className="account-pop" aria-label="Conta">
          <a href="/conta">A minha conta</a>
          <a href="/addons">Add-ons</a>
          {user?.role === "admin" && <a href="/admin">Administração</a>}
          <a href="/portal">Portal</a>
          <button
            onClick={async () => {
              await api("/auth/sign-out", { method: "POST", body: "{}" });
              location.assign("/entrada");
            }}
          >
            Sair
          </button>
        </nav>
      )}
    </header>
  );
}
export function Page({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <Nav />
      <main className={`app-page ${className}`}>{children}</main>
      <footer className="app-footer">
        <span>ZEUS · O teu universo.</span>
        <a href="/art/img/CREDITOS.md" target="_blank" rel="noreferrer">
          Créditos das obras
        </a>
      </footer>
    </>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">✦</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
