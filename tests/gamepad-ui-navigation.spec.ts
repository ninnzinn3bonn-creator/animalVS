import { describe, expect, it } from "vitest";
import { defaultControlIndex, GamepadReleaseGate } from "../apps/game/src/ui/GamepadUiNavigator";

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
