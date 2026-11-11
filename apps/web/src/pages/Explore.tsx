import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Art, Page } from "../components/Layout";
import { catalog, poster, titleHref, type MediaType } from "../lib/catalog";
import "./cinema.css";
const genres = [
  ["", "Todos os géneros"],
  ["Action", "Acção"],
  ["Adventure", "Aventura"],
  ["Animation", "Animação"],
  ["Comedy", "Comédia"],
  ["Crime", "Crime"],
  ["Documentary", "Documentário"],
  ["Drama", "Drama"],
  ["Fantasy", "Fantasia"],
  ["Horror", "Terror"],
  ["Romance", "Romance"],
  ["Sci-Fi", "Ficção científica"],
  ["Thriller", "Thriller"],
];
export default function Explore() {
  const [search, setSearch] = useState(
    new URLSearchParams(location.search).get("q") ?? "",
  );
  const [term, setTerm] = useState(search);
  const [type, setType] = useState<MediaType>("movie");
  const [genre, setGenre] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      const url = new URL(location.href);
      search.trim()
        ? url.searchParams.set("q", search.trim())
        : url.searchParams.delete("q");
      history.replaceState(null, "", url);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useQuery({
    queryKey: ["explore", type, genre, term],
    queryFn: ({ signal }) =>
      catalog(
        type,
        { search: term || undefined, genre: genre || undefined },
        signal,
      ),
    staleTime: 60000,
  });
  return (
    <Page>
      <Art
        image="ulisses"
        eyebrow="CINEMA · EXPLORAR"
        title="Segue a tua curiosidade."
      >
        <p>Há sempre uma história para lá do horizonte.</p>
      </Art>
      <div className="cinema-content explore-content">
        <form
          className="explore-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(search.trim());
          }}
        >
          <label htmlFor="catalog-search">O que te apetece descobrir?</label>
          <div>
            <input
              id="catalog-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar um filme ou uma série"
              autoComplete="off"
            />
            <button className="z-btn z-btn--primary" type="submit">
              Pesquisar
            </button>
          </div>
        </form>
        <div className="cinema-filters">
          <div className="z-seg" aria-label="Tipo de título">
            <button
              className="z-btn"
              aria-pressed={type === "movie"}
              onClick={() => setType("movie")}
            >
              Filmes
            </button>
            <button
              className="z-btn"
              aria-pressed={type === "series"}
              onClick={() => setType("series")}
            >
              Séries
            </button>
          </div>
          <label className="cinema-select">
            Género
            <select
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
            >
              {genres.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cinema-results-head">
          <h2>
            {term
              ? `Resultados para «${term}»`
              : genre
                ? genres.find(([key]) => key === genre)?.[1]
                : "Para descobrir"}
          </h2>
          <span role="status">
            {result.isFetching
              ? "A procurar…"
              : `${result.data?.length ?? 0} títulos`}
          </span>
        </div>
        {result.isError ? (
          <div className="cinema-message" role="alert">
            <p>{result.error.message}</p>
            <button className="z-btn" onClick={() => result.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : result.data?.length === 0 ? (
          <div className="cinema-no-results">
            <img src="/art/img/icaro.webp" alt="" />
            <div>
              <p className="cinema-eyebrow">UM NOVO HORIZONTE</p>
              <h2>Ainda não encontrámos essa história.</h2>
              <p>Experimenta outro nome ou retira o filtro de género.</p>
              <button
                className="z-btn z-btn--secondary"
                onClick={() => {
                  setGenre("");
                  setSearch("");
                }}
              >
                Limpar pesquisa
              </button>
            </div>
          </div>
        ) : (
          <div className="cinema-grid" aria-busy={result.isFetching}>
            {result.data?.map((item) => (
              <a className="cinema-card" key={item.id} href={titleHref(item)}>
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
                  <small>
                    {item.releaseInfo}{" "}
                    {item.imdbRating && `· ${item.imdbRating}`}
                  </small>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
