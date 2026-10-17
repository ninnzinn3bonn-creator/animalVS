import type { GameController } from "./GameController";
import { gamepadButtonPressed, gamepadDirections, gamepadFaceMapping } from "./GamepadMapping";

export interface SoloGamepadStatus {
  connected: boolean;
  label?: string;
}

export class SoloGamepadInput {
  private frame: number | null = null;
  private active = false;
  private needsActivationBaseline = false;
  private gamepadIndex: number | null = null;
  private previous = new Set<string>();
  private lastMoveAt = 0;
  private neutralAxes: number[] = [];

  constructor(
    private readonly controller: GameController,
    private readonly onStatus: (status: SoloGamepadStatus) => void = () => undefined,
    private readonly getGamepads: () => readonly (Gamepad | null)[] = () =>
      typeof navigator.getGamepads === "function" ? Array.from(navigator.getGamepads()) : []
  ) {}

  connect(): void {
    if (this.frame !== null) return;
    const poll = () => {
      this.poll();
      this.frame = window.requestAnimationFrame(poll);
    };
    this.frame = window.requestAnimationFrame(poll);
  }

  dispose(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.previous.clear();
    this.needsActivationBaseline = active;
  }

  poll(now = performance.now()): void {
    const pads = this.getGamepads();
    let pad = this.gamepadIndex === null ? null : pads[this.gamepadIndex];
    if (!pad?.connected) {
      const replacement = pads.find((candidate): candidate is Gamepad => Boolean(candidate?.connected)) ?? null;
      if (this.gamepadIndex !== null && !replacement) {
        this.controller.setPaused(true);
        this.onStatus({ connected: false });
      }
      this.gamepadIndex = replacement?.index ?? null;
      pad = replacement;
      this.neutralAxes = replacement ? Array.from(replacement.axes) : [];
      this.previous.clear();
      if (replacement) this.onStatus({ connected: true, label: replacement.id });
    }
    if (!pad) return;

    const down = (index: number) => Boolean(pad?.buttons[index]?.pressed);
    const face = gamepadFaceMapping(pad);
    const directions = gamepadDirections(pad.axes, this.neutralAxes);
    const left = down(14) || directions.left;
    const right = down(15) || directions.right;
    const rotateLeft = down(12) || directions.up;
    const rotateRight = down(13) || directions.down;
    const drop = gamepadButtonPressed(pad, face.confirm);
    const pause = down(9);
    const activeInputs = new Set<string>();
    if (left) activeInputs.add("left");
    if (right) activeInputs.add("right");
    if (rotateLeft) activeInputs.add("rotate-left");
    if (rotateRight) activeInputs.add("rotate-right");
    if (drop) activeInputs.add("drop");
    if (pause) activeInputs.add("pause");
    if (!this.active) {
      this.previous = activeInputs;
      return;
    }
    if (this.needsActivationBaseline) {
      this.previous = activeInputs;
      this.needsActivationBaseline = false;
      return;
    }
    if ((left || right) && now - this.lastMoveAt >= 90) {
      this.controller.move(left ? -1 : 1);
      this.lastMoveAt = now;
    }

    const pressed = new Set<string>();
    const edge = (key: string, active: boolean, action: () => void) => {
      if (!active) return;
      pressed.add(key);
      if (!this.previous.has(key)) action();
    };
    edge("rotate-left", rotateLeft, () => this.controller.rotate(-1));
    edge("rotate-right", rotateRight, () => this.controller.rotate(1));
    edge("drop", drop, () => this.controller.drop());
    edge("pause", pause, () => this.controller.pauseToggle());
    this.previous = pressed;
  }
}
