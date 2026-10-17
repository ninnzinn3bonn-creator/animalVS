import { describe, expect, it } from "vitest";
import {
  defaultControlIndex,
  gamepadMenuDirection,
  GamepadReleaseGate,
  movedControlIndex
} from "../apps/game/src/ui/GamepadUiNavigator";

describe("gamepad UI default focus", () => {
  it("prefers the control that continues the game", () => {
    const controls = [false, true, false].map((preferred) => ({
      hasAttribute: (name: string) => name === "data-gamepad-default" && preferred,
      classList: { contains: () => false }
    }));
    expect(defaultControlIndex(controls)).toBe(1);
  });

  it("falls back to the first control when no preferred control exists", () => {
    expect(defaultControlIndex([{ hasAttribute: () => false, classList: { contains: () => false } }])).toBe(0);
  });

  it("keeps the current game selected inside the menu", () => {
    const controls = [false, true].map((active) => ({
      hasAttribute: () => false,
      classList: { contains: (name: string) => name === "active" && active }
    }));
    expect(defaultControlIndex(controls)).toBe(1);
  });
});

describe("gamepad overlay input release", () => {
  it("blocks the held button and its release before accepting another press", () => {
    const gate = new GamepadReleaseGate();
    gate.arm();

    expect(gate.consume(true)).toBe(true);
    expect(gate.consume(true)).toBe(true);
    expect(gate.consume(false)).toBe(true);
    expect(gate.consume(false)).toBe(false);
    expect(gate.consume(true)).toBe(false);
  });
});

describe("gamepad choice navigation", () => {
  it("moves right from the preferred 1P choice to the 2P choice on the first press", () => {
    expect(movedControlIndex(2, -1, 0, "next")).toBe(1);
  });

  it("moves left from the preferred choice and wraps around", () => {
    expect(movedControlIndex(2, -1, 0, "previous")).toBe(1);
  });
});

describe("generic gamepad menu direction", () => {
  const buttons = (pressed: number[] = []) =>
    Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index), touched: false, value: 0 }));

  it("supports standard d-pad buttons and shoulder buttons", () => {
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([14]) })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([15]) })).toBe("next");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([4]) })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [], buttons: buttons([5]) })).toBe("next");
  });

  it("uses any active controller axis for non-standard retro pads", () => {
    expect(gamepadMenuDirection({ axes: [0, 0, -1], buttons: buttons() })).toBe("previous");
    expect(gamepadMenuDirection({ axes: [0, 0, 0.72], buttons: buttons() })).toBe("next");
  });

  it("measures direction from the controller's real neutral axis values", () => {
    const pad = { axes: [-1, 3.285], buttons: buttons() };
    expect(gamepadMenuDirection(pad, [-1, 3.285])).toBeNull();
    expect(gamepadMenuDirection({ ...pad, axes: [1, 3.285] }, [-1, 3.285])).toBe("next");
    expect(gamepadMenuDirection({ ...pad, axes: [-1, -1] }, [-1, 3.285])).toBe("previous");
  });
});
