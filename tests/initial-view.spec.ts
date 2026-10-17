import { describe, expect, it } from "vitest";
import { initialViewFromSearch } from "../apps/game/src/ui/InitialView";

describe("initial view", () => {
  it("keeps gameplay entry URLs on the title so mode selection is not skipped", () => {
    expect(initialViewFromSearch("?view=capture")).toBe("title");
    expect(initialViewFromSearch("?view=game")).toBe("title");
    expect(initialViewFromSearch("?view=versus")).toBe("title");
  });

  it("keeps the title screen for missing or unknown views", () => {
    expect(initialViewFromSearch("")).toBe("title");
    expect(initialViewFromSearch("?view=unknown")).toBe("title");
  });
});
