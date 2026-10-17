import { describe, expect, it } from "vitest";
import { captureDestination } from "../apps/game/src/capture/CaptureFlow";

describe("capture flow", () => {
  it("sends the solo route to the solo game", () => {
    expect(captureDestination({ mode: "solo", player: 1 })).toBe("solo-game");
  });

  it("keeps both versus players in the versus route", () => {
    expect(captureDestination({ mode: "versus", player: 1 })).toBe("versus-player-2");
    expect(captureDestination({ mode: "versus", player: 2 })).toBe("versus-settings");
  });

  it("does not send standalone capture into either game mode", () => {
    expect(captureDestination({ mode: "standalone", player: 1 })).toBe("standalone-complete");
  });
});
