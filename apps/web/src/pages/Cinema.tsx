import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { Page } from "../components/Layout";
import { useMemberState } from "../lib/session";
import {
  backdrop,
  catalog,
  poster,
  progressRatio,
  titleHref,
  type Media,
  type ProgressEntry,
} from "../lib/catalog";
import "./cinema.css";

export default function Cinema() {
  const { state, save, loading: stateLoading } = useMemberState();
  const [notice, setNotice] = useState("");
  const curtain = useRef<HTMLDivElement>(null);
  const library = state.library as Media[];
  const progress = state.progress as Record<string, ProgressEntry>;
  const query = useQuery({
    queryKey: ["cinema"],
    queryFn: async ({ signal }) => {
      const [movies, series, action, comedy] = await Promise.all([
        catalog("movie", {}, signal),
        catalog("series", {}, signal),
        catalog("movie", { genre: "Action" }, signal),
        catalog("movie", { genre: "Comedy" }, signal),
      ]);
      return { movies, series, action, comedy };
    },
    staleTime: 300000,
  });
  const hero = query.data?.movies[0];
  useEffect(() => {
    if (!hero || !curtain.current) return;
    const context = gsap.context(() => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(curtain.current, { autoAlpha: 0 });
        return;
      }
      gsap
        .timeline()
        .to(".cinema-curtain__bolt", {
          opacity: 0.8,
          duration: 0.2,
          delay: 0.4,
        })
        .to(
          ".cinema-curtain__left",
          { xPercent: -105, duration: 1.8, ease: "power3.inOut" },
          0.65,
        )
        .to(
          ".cinema-curtain__right",
          { xPercent: 105, duration: 1.8, ease: "power3.inOut" },
          0.65,
        )
        .to(".cinema-curtain__bolt", { opacity: 0, duration: 0.4 }, 0.8)
        .set(curtain.current, { autoAlpha: 0 });
    }, curtain);
    return () => context.revert();
  }, [hero?.id]);
  const watching = Object.values(progress)
    .filter((p) => p.position > 0 && !p.completed && progressRatio(p) < 0.95)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows: { title: string; items: Media[]; id?: string }[] = [
    { title: "A minha lista", items: library, id: "lista" },
    { title: "Filmes populares", items: query.data?.movies.slice(1) ?? [] },
    { title: "Séries populares", items: query.data?.series ?? [] },
    { title: "Acção", items: query.data?.action ?? [] },
    { title: "Comédia", items: query.data?.comedy ?? [] },
  ];
  async function toggleHero() {
    if (!hero || stateLoading) return;
    try {
      const exists = library.some((item) => item.id === hero.id);
      await save({
        library: exists
          ? library.filter((item) => item.id !== hero.id)
          : [
              {
                id: hero.id,
                type: hero.type,
                name: hero.name,
                poster: hero.poster,
                background: hero.background,
              },
              ...library,
            ],
      });
      setNotice(exists ? "Removido da tua lista." : "Adicionado à tua lista.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível guardar.",
      );
    }
  }
  return (
    <Page>
      <section className="cinema-billboard">
        {hero && (
          <img className="cinema-billboard__back" src={backdrop(hero)} alt="" />
        )}
        <div className="cinema-curtain" ref={curtain} aria-hidden="true">
          <div className="cinema-curtain__left">
            <img src="/art/img/aquiles.webp" alt="" />
          </div>
          <div className="cinema-curtain__right">
            <img src="/art/img/aquiles.webp" alt="" />
          </div>
          <svg
            className="cinema-curtain__bolt"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d="M53 0L46 19 52 23 45 40 51 43 43 63 49 67 42 88 47 100" />
          </svg>
        </div>
        <div className="cinema-billboard__copy">
          <p className="cinema-eyebrow">ZEUS · CINEMA</p>
          <h1>{hero?.name ?? "Histórias que atravessam o tempo."}</h1>
          {hero && (
            <p className="cinema-meta">
              {hero.releaseInfo}{" "}
              {hero.imdbRating && `· IMDb ${hero.imdbRating}`} ·{" "}
              {hero.genres?.slice(0, 3).join(" · ")}
            </p>
          )}
          <p className="cinema-synopsis">
            {hero?.description ??
              (query.isPending
                ? "A abrir o catálogo…"
                : "O teu lugar para descobrir filmes e séries.")}
          </p>
          <div className="cinema-actions">
            {hero && (
              <>
                <a className="z-btn z-btn--primary" href={titleHref(hero)}>
                  ▶ Escolher Fonte
                </a>
                <a className="z-btn z-btn--secondary" href={titleHref(hero)}>
                  Mais informações
                </a>
                <button
                  className="z-icon-btn"
                  disabled={stateLoading}
                  aria-label="Adicionar ou remover da minha lista"
                  aria-pressed={library.some((item) => item.id === hero.id)}
                  onClick={toggleHero}
                >
                  {library.some((item) => item.id === hero.id) ? "✓" : "+"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      <div className="cinema-rows">
        {query.isError && (
          <div className="cinema-message" role="alert">
            <p>{query.error.message}</p>
            <button className="z-btn" onClick={() => query.refetch()}>
              Tentar novamente
            </button>
          </div>
        )}
        {watching.length > 0 && (
          <section className="cinema-row">
            <h2>
              <span>Ⅰ</span>Continuar a ver
            </h2>
            <div className="cinema-track">
              {watching.map((item, i) => (
                <a
                  key={`${item.id}:${item.season}:${item.episode}:${i}`}
                  className="cinema-card cinema-card--wide"
                  href={`${titleHref(item)}${item.season ? `&s=${item.season}&e=${item.episode}` : ""}`}
                >
                  <img src={poster(item)} alt="" loading="lazy" />
                  <span className="cinema-card__label">
                    {item.name}
                    {item.season && (
                      <small>
                        T{item.season} · E{item.episode}
                      </small>
                    )}
                  </span>
                  <progress
                    value={progressRatio(item)}
                    max="1"
                    aria-label="Progresso"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
        {rows.map((row, index) => (
          <section className="cinema-row" key={row.title} id={row.id}>
            <h2>
              <span>{["Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"][index]}</span>
              {row.title}
            </h2>
            {row.items.length ? (
              <div className="cinema-track">
                {row.items.map((item) => (
                  <a
                    className="cinema-card"
                    key={item.id}
                    href={titleHref(item)}
                  >
                    <img
                      src={poster(item)}
                      alt={item.name}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.opacity = "0";
                      }}
                    />
                    <span className="cinema-card__label">
                      {item.name}
                      <small>{item.releaseInfo}</small>
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="cinema-empty">
                {row.id === "lista"
                  ? "Guarda um título para o encontrares aqui."
                  : query.isPending
                    ? "A carregar…"
                    : "Não há títulos disponíveis neste catálogo."}
              </p>
            )}
          </section>
        ))}
      </div>
      <p className="cinema-status" role="status">
        {notice}
      </p>
      <footer className="cinema-credit">
        Catálogo: Cinemeta. Rubens, Aquiles vence Heitor, 1630. Domínio público.
      </footer>
    </Page>
  );
}
