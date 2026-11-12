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
import "./cinema-reference.css";
import { rows as wireRows, ICON } from "../lib/fx.js";

export default function Cinema() {
  const { state, save, loading: stateLoading } = useMemberState();
  const [notice, setNotice] = useState("");
  const curtain = useRef<HTMLDivElement>(null);
  const rowRoot = useRef<HTMLDivElement>(null);
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
        .to(".curtain__bolt", {
          opacity: 0.8,
          duration: 0.2,
          delay: 0.4,
        })
        .to(
          ".curtain__left",
          { xPercent: -62, duration: 1.8, ease: "power3.inOut" },
          0.65,
        )
        .to(
          ".curtain__right",
          { xPercent: 62, duration: 1.8, ease: "power3.inOut" },
          0.65,
        )
        .to(".curtain__bolt", { opacity: 0, duration: 0.4 }, 0.8)
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
  useEffect(() => {
    const root = rowRoot.current;
    if (!root) return;
    const controller = wireRows(root as unknown as Document, {
      previews: state.preferences.previews === true,
    });
    const action = (event: Event) => {
      const { action, card } = (
        event as CustomEvent<{ action: string; card: HTMLAnchorElement }>
      ).detail;
      if (action === "play") {
        location.href = card.href;
        return;
      }
      const item = [
        ...library,
        ...(query.data?.movies ?? []),
        ...(query.data?.series ?? []),
        ...(query.data?.action ?? []),
        ...(query.data?.comedy ?? []),
      ].find((m) => m.id === card.dataset.id);
      if (item)
        save({
          library: library.some((m) => m.id === item.id)
            ? library.filter((m) => m.id !== item.id)
            : [item, ...library],
        }).catch((e) => setNotice(e.message));
    };
    root.addEventListener("z:action", action);
    return () => {
      controller.hide(true);
      root.removeEventListener("z:action", action);
    };
  }, [query.data, library, watching.length, state.preferences.previews]);
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
    <Page className="cinema-page">
      <section className="bb is-live">
        {hero && (
          <div className="z-art bb__art">
            <img src={backdrop(hero)} alt="" />
          </div>
        )}
        <div className="curtain" ref={curtain} aria-hidden="true">
          <div className="curtain__half curtain__left">
            <img src="/art/img/aquiles.webp" alt="" />
          </div>
          <div className="curtain__half curtain__right">
            <img src="/art/img/aquiles.webp" alt="" />
          </div>
          <p className="curtain__label">
            Rubens, <i>Aquiles vence Heitor</i>, 1630
          </p>
          <svg
            className="curtain__bolt"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d="M53 0L46 19 52 23 45 40 51 43 43 63 49 67 42 88 47 100" />
          </svg>
        </div>
        <div className="bb__content">
          <h1 className="bb__title">
            {hero ? (
              <>
                <img
                  src={
                    hero.logo ||
                    `https://images.metahub.space/logo/medium/${hero.id}/img`
                  }
                  alt={hero.name}
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                    (e.currentTarget.nextElementSibling as HTMLElement).hidden =
                      false;
                  }}
                />
                <span hidden>{hero.name}</span>
              </>
            ) : (
              "Histórias que atravessam o tempo."
            )}
          </h1>
          {hero && (
            <div className="z-meta">
              {hero.imdbRating && (
                <span className="z-pill">IMDb {hero.imdbRating}</span>
              )}
              <span>{hero.releaseInfo}</span>
              {hero.runtime && (
                <span>{`${Math.floor(parseInt(hero.runtime) / 60)} h ${parseInt(hero.runtime) % 60} min`}</span>
              )}
              {hero.genres?.slice(0, 2).map((genre) => (
                <span key={genre}>
                  {(
                    {
                      Adventure: "Aventura",
                      "Sci-Fi": "Ficção científica",
                      Action: "Acção",
                      Comedy: "Comédia",
                    } as Record<string, string>
                  )[genre] || genre}
                </span>
              ))}
            </div>
          )}
          <p className="bb__syn">
            {hero?.description ??
              (query.isPending
                ? "A abrir o catálogo…"
                : "O teu lugar para descobrir filmes e séries.")}
          </p>
          <div className="bb__actions">
            {hero && (
              <>
                <a className="z-btn z-btn--primary" href={titleHref(hero)}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7 4.9v14.2c0 .8.9 1.3 1.6.9l11-7.1a1 1 0 0 0 0-1.8l-11-7.1C7.9 3.6 7 4.1 7 4.9z" />
                  </svg>{" "}
                  Reproduzir
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
                  <span
                    dangerouslySetInnerHTML={{
                      __html: library.some((item) => item.id === hero.id)
                        ? ICON.check
                        : ICON.plus,
                    }}
                  />
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      <div className="z-rows" ref={rowRoot}>
        {query.isError && (
          <div className="cinema-message" role="alert">
            <p>{query.error.message}</p>
            <button className="z-btn" onClick={() => query.refetch()}>
              Tentar novamente
            </button>
          </div>
        )}
        {watching.length > 0 && (
          <section className="z-row is-in">
            <div className="rh">
              <span className="rh__n">Ⅰ</span>
              <h2 className="z-row__title">Continuar a ver</h2>
              <span className="rh__rule" />
            </div>
            <div className="z-row__body">
              <div className="z-track">
                {watching.map((item, i) => (
                  <a
                    key={`${item.id}:${item.season}:${item.episode}:${i}`}
                    data-id={item.id}
                    data-title={item.name}
                    data-backdrop={backdrop(item)}
                    data-progress={progressRatio(item)}
                    className="z-card z-card--wide"
                    href={`${titleHref(item)}${item.season ? `&s=${item.season}&e=${item.episode}` : ""}`}
                  >
                    <span className="z-card__art">
                      <img src={backdrop(item)} alt="" loading="lazy" />
                      <span className="z-progress">
                        <i
                          style={{
                            transform: `scaleX(${progressRatio(item)})`,
                          }}
                        />
                      </span>
                    </span>
                    <span className="z-card__cap">
                      {item.name}
                      {item.season && (
                        <small>
                          T{item.season} · E{item.episode}
                        </small>
                      )}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}
        {rows.map((row, index) => (
          <section
            className="z-row is-in"
            key={row.title}
            id={row.id}
            data-wired={!row.items.length ? "" : undefined}
          >
            <div className="rh">
              <span className="rh__n">{["Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"][index]}</span>
              <h2 className="z-row__title">{row.title}</h2>
              <span className="rh__rule" />
            </div>
            {row.items.length ? (
              <div className="z-row__body">
                <div className="z-track">
                  {row.items.map((item) => (
                    <a
                      className="z-card z-card--poster"
                      key={item.id}
                      data-id={item.id}
                      data-title={item.name}
                      data-meta={[item.imdbRating, item.releaseInfo]
                        .filter(Boolean)
                        .join("|")}
                      data-backdrop={backdrop(item)}
                      data-in-list={library.some((m) => m.id === item.id)}
                      href={titleHref(item)}
                    >
                      <span className="z-card__art">
                        <img
                          src={poster(item)}
                          alt={item.name}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.opacity = "0";
                          }}
                        />
                        <span className="z-card__fallback">{item.name}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="row-empty">
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
      <footer className="cine-foot">
        Catálogo: Cinemeta. Rubens, Aquiles vence Heitor, 1630. Domínio público.
      </footer>
    </Page>
  );
}
