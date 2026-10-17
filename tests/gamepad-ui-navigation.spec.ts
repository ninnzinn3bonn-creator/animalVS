import { describe, expect, it } from "vitest";
import {
  defaultControlIndex,
  gamepadHatDirection,
  gamepadMenuDirection,
  GamepadReleaseGate,
  isGenericConfirmButton,
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

  it("requires a release after a screen transition before accepting another press", () => {
    const gate = new GamepadReleaseGate();
    gate.arm();

    expect(gate.consume(true)).toBe(true);
    expect(gate.consume(false)).toBe(true);
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

  it("decodes the 8-way POV axis used by Buffalo retro controllers", () => {
    const neutral = [-1, 3.285714];
    const pad = (hat: number) => ({ axes: [-1, hat], buttons: buttons() });
    expect(gamepadMenuDirection(pad(3.285714), neutral)).toBeNull();
    expect(gamepadMenuDirection(pad(-1), neutral)).toBe("previous");
    expect(gamepadMenuDirection(pad(-0.428571), neutral)).toBe("next");
    expect(gamepadMenuDirection(pad(0.142857), neutral)).toBe("next");
    expect(gamepadMenuDirection(pad(0.714286), neutral)).toBe("previous");
  });

  it("maps Buffalo POV diagonals consistently for menu navigation", () => {
    expect(gamepadHatDirection(-0.714286)).toBe("next");
    expect(gamepadHatDirection(-0.142857)).toBe("next");
    expect(gamepadHatDirection(0.428571)).toBe("previous");
    expect(gamepadHatDirection(1)).toBe("previous");
  });

  it("treats an updated Buffalo neutral value as no movement", () => {
    expect(gamepadMenuDirection({ axes: [3.285714], buttons: buttons() }, [3.285714])).toBeNull();
  });
});

describe("generic gamepad confirmation", () => {
  it("accepts unknown face-button positions on every UI screen", () => {
    expect(isGenericConfirmButton(2, 0)).toBe(true);
    expect(isGenericConfirmButton(3, 0)).toBe(true);
    expect(isGenericConfirmButton(6, 0)).toBe(true);
  });

  it("does not turn back or navigation buttons into confirmation", () => {
    expect(isGenericConfirmButton(0, 0)).toBe(false);
    expect(isGenericConfirmButton(4, 0)).toBe(false);
    expect(isGenericConfirmButton(5, 0)).toBe(false);
    expect(isGenericConfirmButton(12, 0)).toBe(false);
    expect(isGenericConfirmButton(15, 0)).toBe(false);
  });
});
