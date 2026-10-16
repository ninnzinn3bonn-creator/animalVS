import { describe, expect, it } from "vitest";
import { captureFrameSize } from "../apps/game/src/capture/CaptureFrame";

describe("capture frame sizing", () => {
  it("keeps the source aspect ratio on desktop", () => {
    expect(captureFrameSize(1920, 1080, true)).toEqual({ width: 1600, height: 900 });
    expect(captureFrameSize(1280, 720, true)).toEqual({ width: 1280, height: 720 });
  });

  it("keeps the established portrait frame on mobile", () => {
    expect(captureFrameSize(1920, 1080, false)).toEqual({ width: 675, height: 1200 });
  });
});
