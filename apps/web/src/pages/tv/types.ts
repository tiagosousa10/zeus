export type {
  Section,
  TVChannel,
  TVMovie,
  TVSeries,
  TVEpisode,
  TVMovieDetail,
  TVSeriesDetail,
} from "../../../../api/src/modules/iptv/types";
export type { TVListPrefs } from "../../../../api/src/modules/iptv/prefs";
import type { Section } from "../../../../api/src/modules/iptv/types";
export interface CategoryView {
  id: string;
  name: string;
  country?: string;
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
} from "../../../../api/src/modules/member/public-state";
