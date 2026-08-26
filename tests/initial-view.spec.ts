import { describe, expect, it } from "vitest";
import { initialViewFromSearch } from "../apps/game/src/ui/InitialView";

describe("initial view", () => {
  it("opens the capture screen from the desktop launcher URL", () => {
    expect(initialViewFromSearch("?view=capture")).toBe("capture");
  });

  it("keeps the title screen for missing or unknown views", () => {
    expect(initialViewFromSearch("")).toBe("title");
    expect(initialViewFromSearch("?view=unknown")).toBe("title");
  });
});
