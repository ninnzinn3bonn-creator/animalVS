import { describe, expect, it } from "vitest";
import { guideContent } from "../apps/game/src/ui/GuideContent";

describe("child-friendly guide content", () => {
  it("contains every major transition guide", () => {
    expect(Object.keys(guideContent)).toEqual([
      "mode",
      "soloCapture",
      "player1Capture",
      "player2Capture",
      "soloGame",
      "versusGame"
    ]);
  });

  it("does not use kanji in the new guide copy", () => {
    const copy = Object.values(guideContent).flat().join("\n");
    expect(copy).not.toMatch(/[\u3400-\u4dbf\u4e00-\u9fff]/u);
  });
});
