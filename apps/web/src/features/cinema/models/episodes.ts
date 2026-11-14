import type { Episode } from "./media";

export function orderedEpisodes(episodes: Episode[]) {
  return episodes
    .filter(
      (item) =>
        Number.isInteger(item.season) &&
        item.season > 0 &&
        Number.isInteger(item.episode) &&
        item.episode > 0,
    )
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

export function availableNextEpisode(
  episodes: Episode[],
  season: number | undefined,
  episode: number | undefined,
  now = Date.now(),
) {
  const index = episodes.findIndex(
    (item) => item.season === season && item.episode === episode,
  );
  const next = index < 0 ? undefined : episodes[index + 1];
  if (!next || (next.released && Date.parse(next.released) > now))
    return undefined;
  return next;
}
