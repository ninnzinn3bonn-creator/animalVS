export const appViews = ["title", "game", "versus", "capture", "characters", "ranking"] as const;

export type AppView = (typeof appViews)[number];

export function initialViewFromSearch(search: string): AppView {
  const requestedView = new URLSearchParams(search).get("view");
  return appViews.includes(requestedView as AppView) ? (requestedView as AppView) : "title";
}
