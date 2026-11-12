export type {
  Section,
  TVChannel,
  TVMovie,
  TVSeries,
  TVEpisode,
  TVMovieDetail,
  TVSeriesDetail,
} from "../../../../../../packages/contracts/iptv";
export type { TVListPrefs } from "../../../../../../packages/contracts/tv-preferences";
import type { Section } from "../../../../../../packages/contracts/iptv";
export interface CategoryView {
  id: string;
  name: string;
  country?: string;
  logo?: string;
  count: number;
  pinned: boolean;
  hidden: boolean;
}
export interface Summary {
  fetchedAt: number;
  sections: Partial<
    Record<
      Section,
      { categories: CategoryView[]; total: number; hiddenCount: number }
    >
  >;
}
export interface Page<T> {
  tags?: string[];
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface SearchEntry {
  k: "l" | "m" | "s";
  id: string;
  n: string;
  c: string;
}
export interface PlaybackTarget {
  section: Section;
  id: string;
  episodeId?: string;
  title?: string;
  categoryId?: string;
  start?: number;
}
export interface TVView {
  section: Section;
  categoryId?: string;
  detailId?: string;
  guide?: boolean;
}
export interface Programme {
  channel?: string;
  title: string;
  start: number;
  stop: number;
  description?: string;
}

export type {
  PublicIPTVList as IPTVList,
  IPTVListUpdate,
} from "../../../../../../packages/contracts/member";
