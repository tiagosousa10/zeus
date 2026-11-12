export const liveLayouts = ["cards", "list", "workspace"] as const;
export type LiveLayout = (typeof liveLayouts)[number];
export function isLiveLayout(value: unknown): value is LiveLayout {
  return liveLayouts.some((layout) => layout === value);
}
