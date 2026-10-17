import { describe, expect, it } from "vitest";
import { captureCountdownIntervalMs, captureCountdownValues } from "../apps/game/src/capture/CaptureCountdown";

describe("capture countdown", () => {
  it("counts a full five seconds before taking the photo", () => {
    expect(captureCountdownValues).toEqual([5, 4, 3, 2, 1]);
    expect(captureCountdownIntervalMs).toBe(1_000);
  });
});
