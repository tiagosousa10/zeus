import type { ChannelTag } from "./names.js";

export type Section = "live" | "movie" | "series";
export interface TVCategory {
  id: string;
  section: Section;
  name: string;
  country?: string;
  logo?: string;
  adult: boolean;
  count: number;
}
export interface TVChannel {
  id: string;
  categoryId: string;
  name: string;
  number?: number;
  logo?: string;
  epgId?: string;
  tags: ChannelTag[];
  adult: boolean;
  source?: string;
}
export interface TVMovie {
  id: string;
  categoryId: string;
  name: string;
  poster?: string;
  year?: number;
  rating?: number;
  added?: number;
  container: string;
  adult: boolean;
  source?: string;
}
export interface TVSeries {
  id: string;
  categoryId: string;
  name: string;
  poster?: string;
  year?: number;
  rating?: number;
  added?: number;
  adult: boolean;
  episodes?: TVEpisode[];
}
export interface TVEpisode {
  id: string;
  season: number;
  number: number;
  title: string;
  thumb?: string;
  plot?: string;
  durationMin?: number;
  container: string;
  source?: string;
}
export interface TVMovieDetail extends TVMovie {
  backdrop?: string;
  plot?: string;
  cast: string[];
  director?: string;
  genre?: string;
  durationMin?: number;
  age?: string;
  trailer?: string;
  tmdbId?: string;
}
export interface TVSeriesDetail extends TVSeries {
  backdrop?: string;
  plot?: string;
  cast: string[];
  genre?: string;
  seasons: { number: number; name: string; episodes: TVEpisode[] }[];
}
export interface SectionData<T> {
  categories: TVCategory[];
  items: T[];
}
export interface TVCatalog {
  fetchedAt: number;
  live: SectionData<TVChannel>;
  movie: SectionData<TVMovie>;
  series: SectionData<TVSeries>;
}
export type IPTVList = {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  url: string;
  username?: string;
  password?: string;
  epgUrl?: string;
};
