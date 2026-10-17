import type { GameController } from "./GameController";
import { gamepadButtonPressed, gamepadDirections, gamepadFaceMapping } from "./GamepadMapping";

export interface SoloGamepadStatus {
  connected: boolean;
  label?: string;
}

export class SoloGamepadInput {
  private frame: number | null = null;
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
    edge("rotate-left", down(12) || directions.up, () => this.controller.rotate(-1));
    edge("rotate-right", down(13) || directions.down, () => this.controller.rotate(1));
    edge("drop", gamepadButtonPressed(pad, face.confirm), () => this.controller.drop());
    edge("pause", down(9), () => this.controller.pauseToggle());
    this.previous = pressed;
  }
}
