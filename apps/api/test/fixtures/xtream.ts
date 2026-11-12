import type { safeFetch } from "../../src/lib/safe-fetch.js";

export const xtreamFixture = {
  catalog: {
    liveCategories: [
      { category_id: "1", category_name: "★●· PORTUGAL ●·★" },
      { category_id: "2", category_name: "ADULTOS" },
      { category_id: "3", category_name: "Exclusivos" },
    ],
    live: [
      { num: 1, name: "RTP1 HD", stream_id: 101, stream_icon: "https://img.test/rtp1.png", epg_channel_id: "rtp1.pt", category_id: "1" },
      { num: 2, name: "SIC", stream_id: 102, stream_icon: "", epg_channel_id: "", category_id: "1" },
      { num: 3, name: "XXX Gold", stream_id: 103, stream_icon: "", epg_channel_id: "", category_id: "3" },
      { num: 4, name: "Canal 18", stream_id: 104, stream_icon: "", epg_channel_id: "", category_id: "2" },
    ],
    vodCategories: [{ category_id: "10", category_name: "Filmes" }],
    vod: [
      { stream_id: 201, name: "Filme A", stream_icon: "https://img.test/a.jpg", rating: "", added: "1700000000", category_id: "10", container_extension: "mp4" },
      { stream_id: 202, name: "Filme B", stream_icon: "", rating: "7.6", added: "1700000100", category_id: "10", container_extension: "mkv" },
    ],
    seriesCategories: [{ category_id: "20", category_name: "Séries" }],
    series: [
      { series_id: 301, name: "Série X", cover: "https://img.test/x.jpg", rating: "8.1", releaseDate: "2020-05-01", last_modified: "1700000200", category_id: "20" },
    ],
  },
  vodInfo: {
    info: {
      movie_image: "https://img.test/a.jpg",
      backdrop_path: "https://img.test/a-bg.jpg",
      plot: "Uma história.",
      cast: "Ana, Rui",
      director: "Maria",
      genre: "Drama",
      duration_secs: 5400,
      age: "12",
      youtube_trailer: "abc123",
      tmdb_id: "555",
      releasedate: "2021-03-04",
    },
    movie_data: { stream_id: 201, container_extension: "mp4" },
  },
  seriesInfo: {
    info: { cover: "https://img.test/x.jpg", backdrop_path: ["https://img.test/x-bg.jpg"], plot: "Enredo.", cast: "Ana, Rui", genre: "Drama" },
    seasons: [{ season_number: 1, name: "Primeira" }, { season_number: 2, name: "" }],
    episodes: {
      "1": [
        { id: "4001", episode_num: 1, title: "Piloto", container_extension: "mp4", info: { movie_image: "https://img.test/e1.jpg", plot: "Começa.", duration_secs: 1800 } },
        { id: "4002", episode_num: 2, title: "Segundo", container_extension: "mkv" },
      ],
      "2": [{ id: "4003", episode_num: 1, title: "Regresso", container_extension: "mp4", info: { duration_secs: 2400 } }],
    },
  },
};

export function fakeFetch(routes: (url: URL) => unknown | Response): typeof safeFetch & { calls: URL[] } {
  const calls: URL[] = [];
  const fn = async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const out = routes(url);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(fn, { calls });
}

export function xtreamRoutes(url: URL): unknown {
  const { catalog, vodInfo, seriesInfo } = xtreamFixture;
  const routes: Record<string, unknown> = {
    get_live_categories: catalog.liveCategories,
    get_live_streams: catalog.live,
    get_vod_categories: catalog.vodCategories,
    get_vod_streams: catalog.vod,
    get_series_categories: catalog.seriesCategories,
    get_series: catalog.series,
    get_vod_info: vodInfo,
    get_series_info: seriesInfo,
  };
  return routes[url.searchParams.get("action") ?? ""] ?? [];
}
