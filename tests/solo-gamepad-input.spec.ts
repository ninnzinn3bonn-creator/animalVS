import { describe, expect, it, vi } from "vitest";
import type { GameController } from "../apps/game/src/game/GameController";
import { SoloGamepadInput } from "../apps/game/src/game/SoloGamepadInput";

function gamepad(pressed: number[] = [], axes = [0, 0]): Gamepad {
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index), touched: false, value: pressed.includes(index) ? 1 : 0 })),
    connected: true,
    id: "USB controller",
    index: 0,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null
  } as unknown as Gamepad;
}

describe("solo gamepad input", () => {
  it("drops only once while A is held", () => {
    const controller = {
      move: vi.fn(), rotate: vi.fn(), drop: vi.fn(), pauseToggle: vi.fn(), setPaused: vi.fn()
    } as unknown as GameController;
    let pads: readonly (Gamepad | null)[] = [gamepad([0])];
    const input = new SoloGamepadInput(controller, undefined, () => pads);

    input.poll(100);
    input.poll(200);
    pads = [gamepad([])];
    input.poll(300);
    pads = [gamepad([0])];
    input.poll(400);

    expect(controller.drop).toHaveBeenCalledTimes(2);
  });

  it("pauses when its controller is disconnected", () => {
    const controller = {
      move: vi.fn(), rotate: vi.fn(), drop: vi.fn(), pauseToggle: vi.fn(), setPaused: vi.fn()
    } as unknown as GameController;
    let pads: readonly (Gamepad | null)[] = [gamepad()];
    const input = new SoloGamepadInput(controller, undefined, () => pads);
    input.poll(100);
    pads = [];
    input.poll(200);
    expect(controller.setPaused).toHaveBeenCalledWith(true);
  });
});
