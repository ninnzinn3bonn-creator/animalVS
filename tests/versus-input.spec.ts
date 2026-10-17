import { afterEach, describe, expect, it, vi } from "vitest";
import {
  gamepadControlState,
  keyboardAction,
  recommendedVersusAssignments,
  validateInputAssignments,
  VersusInputRouter,
  type ConnectedGamepad
} from "../apps/game/src/versus/VersusInput";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("versus input assignments", () => {
  const gamepads: ConnectedGamepad[] = [
    { index: 0, label: "Controller A" },
    { index: 1, label: "Controller B" }
  ];

  it("assigns two connected controllers to separate players", () => {
    expect(recommendedVersusAssignments([{ index: 2, label: "Pad A" }, { index: 5, label: "Pad B" }])).toEqual({
      1: "gamepad:2",
      2: "gamepad:5"
    });
  });

  it("keeps player 2 on keyboard when only one controller is connected", () => {
    expect(recommendedVersusAssignments([{ index: 3, label: "Pad" }])).toEqual({
      1: "gamepad:3",
      2: "keyboard:arrows"
    });
  });

  it("maps both keyboard profiles to five independent actions", () => {
    expect(keyboardAction("keyboard:wasd", "KeyA")).toBe("left");
    expect(keyboardAction("keyboard:wasd", "KeyD")).toBe("right");
    expect(keyboardAction("keyboard:wasd", "KeyW")).toBe("rotate-left");
    expect(keyboardAction("keyboard:wasd", "KeyS")).toBe("rotate-right");
    expect(keyboardAction("keyboard:wasd", "Space")).toBe("drop");
    expect(keyboardAction("keyboard:arrows", "ArrowLeft")).toBe("left");
    expect(keyboardAction("keyboard:arrows", "ArrowRight")).toBe("right");
    expect(keyboardAction("keyboard:arrows", "ArrowUp")).toBe("rotate-left");
    expect(keyboardAction("keyboard:arrows", "ArrowDown")).toBe("rotate-right");
    expect(keyboardAction("keyboard:arrows", "Enter")).toBe("drop");
  });

  it("rejects duplicate and disconnected devices", () => {
    expect(validateInputAssignments("screen", "screen", gamepads)).toContain("同じ入力方法");
    expect(validateInputAssignments("gamepad:0", "gamepad:0", gamepads)).toContain("同じ入力方法");
    expect(validateInputAssignments("gamepad:2", "keyboard:arrows", gamepads)).toContain("接続されていない");
    expect(validateInputAssignments("gamepad:0", "gamepad:1", gamepads)).toBeNull();
  });

  it("maps a generic USB Famicom controller using axes, A and START without double actions", () => {
    const controls = gamepadControlState({ ...fakeGamepad([0, -1], [1, 9]), mapping: "" });

    expect(controls.rotateLeft).toBe(true);
    expect(controls.rotateRight).toBe(false);
    expect(controls.drop).toBe(true);
    expect(controls.pause).toBe(true);
  });

  it("keeps standard D-pad and shoulder-button mappings", () => {
    const controls = gamepadControlState(fakeGamepad([0, 0], [4, 5, 13, 14]));

    expect(controls.left).toBe(true);
    expect(controls.rotateLeft).toBe(true);
    expect(controls.rotateRight).toBe(true);
    expect(controls.drop).toBe(false);
  });

  it("uses a Buffalo POV axis for movement and rotation during play", () => {
    const neutral = [-1, 3.285714];
    expect(gamepadControlState({ ...fakeGamepad([-1, -0.428571], []), mapping: "" }, neutral).right).toBe(true);
    expect(gamepadControlState({ ...fakeGamepad([-1, 0.714286], []), mapping: "" }, neutral).left).toBe(true);
    expect(gamepadControlState({ ...fakeGamepad([-1, -1], []), mapping: "" }, neutral).rotateLeft).toBe(true);
    expect(gamepadControlState({ ...fakeGamepad([-1, 0.142857], []), mapping: "" }, neutral).rotateRight).toBe(true);
  });

  it("toggles pause once per START press and can toggle again after release", () => {
    let nextFrame: FrameRequestCallback | null = null;
    const gamepad = fullGamepad([0, 0], [9]);
    const togglePause = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback;
        return 1;
      }),
      cancelAnimationFrame: vi.fn()
    });
    const router = new VersusInputRouter(vi.fn(), togglePause, vi.fn(), () => [gamepad]);
    router.configure({ 1: "gamepad:0", 2: "keyboard:arrows" });
    router.setActive(true);
    router.connect();

    expect(togglePause).toHaveBeenCalledTimes(1);
    runNextFrame(nextFrame);
    expect(togglePause).toHaveBeenCalledTimes(1);

    gamepad.buttons[9] = gamepadButton(false);
    runNextFrame(nextFrame);
    gamepad.buttons[9] = gamepadButton(true);
    runNextFrame(nextFrame);
    expect(togglePause).toHaveBeenCalledTimes(2);
    router.dispose();
  });
});

function fakeGamepad(axes: number[], pressedButtons: number[]): Pick<Gamepad, "axes" | "buttons"> {
  const pressed = new Set(pressedButtons);
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.has(index),
      touched: pressed.has(index),
      value: pressed.has(index) ? 1 : 0
    }))
  };
}

function fullGamepad(axes: number[], pressedButtons: number[]): Gamepad {
  return {
    axes,
    buttons: fakeGamepad(axes, pressedButtons).buttons,
    connected: true,
    id: "USB NES Gamepad",
    index: 0,
    mapping: "",
    timestamp: 0,
    vibrationActuator: null
  } as unknown as Gamepad;
}

function gamepadButton(pressed: boolean): GamepadButton {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

function runNextFrame(frame: FrameRequestCallback | null): void {
  if (!frame) {
    throw new Error("次のゲームパッドポーリングが予約されていません");
  }
  frame(performance.now());
}
