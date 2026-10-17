import { describe, expect, it } from "vitest";
import { gamepadFaceMapping } from "../apps/game/src/game/GamepadMapping";

const buttons = Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 }));

describe("gamepad face mapping", () => {
  it("uses the browser standard A and B positions", () => {
    expect(gamepadFaceMapping({ buttons, mapping: "standard" })).toEqual({ confirm: 0, back: 1 });
  });

  it("uses the common USB Famicom A and B positions for non-standard pads", () => {
    expect(gamepadFaceMapping({ buttons, mapping: "" })).toEqual({ confirm: 1, back: 0 });
  });
});
