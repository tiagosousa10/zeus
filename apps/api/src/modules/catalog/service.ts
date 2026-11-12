import { getState } from "../member/service.js";
import { safeFetch } from "../../lib/safe-fetch.js";

export const getMetadata = async (
  memberId: string,
  input: import("./models.js").GetMetadataInputData,
) => {
  const { id, type } = input;

  const state = await getState(memberId);
  const key = state.preferences.tmdbKey;
  if (!key) return { meta: null };
  if (!/^[a-f0-9]{32}$/i.test(key))
    return { meta: null, error: "A chave TMDB guardada não é válida." };
  const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(
    state.preferences.language || "",
  )
    ? state.preferences.language
    : "pt-PT";
  async function get(path: string) {
    const u = new URL("https://api.themoviedb.org/3" + path);
    u.searchParams.set("api_key", key);
    u.searchParams.set("language", language);
    u.searchParams.set("external_source", "imdb_id");
    u.searchParams.set("append_to_response", "credits");
    const r = await safeFetch(u.href, {
      timeout: 8000,
      maxBytes: 2 * 1024 * 1024,
    });
    if (!r.ok)
      throw Error("O TMDB não respondeu. Confirma a tua chave na Conta.");
    return r.json() as Promise<any>;
  }
  try {
    const found = await get(`/find/${id}`);
    const item = (
      type === "movie" ? found.movie_results : found.tv_results
    )?.[0];
    if (!item) return { meta: null };
    const details = await get(
      `/${type === "movie" ? "movie" : "tv"}/${item.id}`,
    );
    return {
      meta: {
        name: details.title || details.name,
        description: details.overview,
        genres: details.genres?.map((g: any) => g.name),
        ...(details.poster_path
          ? { poster: "https://image.tmdb.org/t/p/w500" + details.poster_path }
          : {}),
        ...(details.backdrop_path
          ? {
              background:
                "https://image.tmdb.org/t/p/original" + details.backdrop_path,
            }
          : {}),
        cast: details.credits?.cast?.slice(0, 12).map((p: any) => p.name),
        director: details.credits?.crew
          ?.filter((p: any) => p.job === "Director")
          .map((p: any) => p.name),
      },
    };
  } catch (e) {
    return { meta: null, error: (e as Error).message };
  }
};
