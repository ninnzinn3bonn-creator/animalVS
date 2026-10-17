export const appViews = ["title", "start", "game", "versus", "capture", "characters", "ranking"] as const;

export type AppView = (typeof appViews)[number];

export function initialViewFromSearch(search: string): AppView {
  const requestedView = new URLSearchParams(search).get("view");
  // Game and capture entry points must always pass through the 1P/2P choice.
  if (requestedView === "game" || requestedView === "versus" || requestedView === "capture") return "title";
  return appViews.includes(requestedView as AppView) ? (requestedView as AppView) : "title";
}
