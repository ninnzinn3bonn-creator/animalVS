import type { PlayerId } from "../game/TurnManager";

export type VersusAction = "left" | "right" | "rotate-left" | "rotate-right" | "drop";
export type InputAssignment = "keyboard:wasd" | "keyboard:arrows" | "screen" | `gamepad:${number}`;

export interface ConnectedGamepad {
  index: number;
  label: string;
}

export interface GamepadControlState {
  left: boolean;
  right: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  drop: boolean;
  pause: boolean;
}

export function validateInputAssignments(
  player1: InputAssignment,
  player2: InputAssignment,
  connectedGamepads: readonly ConnectedGamepad[]
): string | null {
  if (player1 === player2) {
    return "同じ入力方法を両プレイヤーに割り当てることはできません";
  }
  const connected = new Set(connectedGamepads.map((gamepad) => gamepad.index));
  for (const assignment of [player1, player2]) {
    if (assignment.startsWith("gamepad:") && !connected.has(gamepadIndex(assignment))) {
      return "接続されていないコントローラーが選択されています";
    }
  }
  return null;
}

export function keyboardAction(assignment: InputAssignment, code: string): VersusAction | null {
  if (assignment === "keyboard:wasd") {
    return (
      {
        KeyA: "left",
        KeyD: "right",
        KeyW: "rotate-left",
        KeyS: "rotate-right",
        Space: "drop"
      } as Record<string, VersusAction>
    )[code] ?? null;
  }
  if (assignment === "keyboard:arrows") {
    return (
      {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "rotate-left",
        ArrowDown: "rotate-right",
        Enter: "drop"
      } as Record<string, VersusAction>
    )[code] ?? null;
  }
  return null;
}

export function gamepadIndex(assignment: InputAssignment): number {
  return Number(assignment.slice("gamepad:".length));
}

export function gamepadControlState(gamepad: Pick<Gamepad, "axes" | "buttons">): GamepadControlState {
  const horizontal = gamepad.axes[0] ?? 0;
  const vertical = gamepad.axes[1] ?? 0;
  const pressed = (index: number) => Boolean(gamepad.buttons[index]?.pressed);
  return {
    left: horizontal < -0.5 || pressed(14),
    right: horizontal > 0.5 || pressed(15),
    rotateLeft: vertical < -0.5 || pressed(12) || pressed(4) || pressed(8),
    rotateRight: vertical > 0.5 || pressed(13) || pressed(5) || pressed(1),
    drop: pressed(0),
    pause: pressed(9)
  };
}

type GamepadGetter = () => readonly (Gamepad | null)[];

export class VersusInputRouter {
  private assignments: Record<PlayerId, InputAssignment> = {
    1: "keyboard:wasd",
    2: "keyboard:arrows"
  };
  private active = false;
  private frame: number | null = null;
  private readonly buttonStates = new Map<string, { down: boolean; firstAt: number; lastAt: number }>();
  private readonly keyHandler = (event: KeyboardEvent) => this.handleKey(event);
  private readonly gamepadChangeHandler = () => this.onGamepadsChanged();

  constructor(
    private readonly dispatch: (player: PlayerId, action: VersusAction) => void,
    private readonly togglePause: () => void,
    private readonly onGamepadsChanged: () => void,
    private readonly getGamepads: GamepadGetter = browserGamepads
  ) {}

  connect(): void {
    window.addEventListener("keydown", this.keyHandler);
    window.addEventListener("gamepadconnected", this.gamepadChangeHandler);
    window.addEventListener("gamepaddisconnected", this.gamepadChangeHandler);
    this.pollGamepads();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.keyHandler);
    window.removeEventListener("gamepadconnected", this.gamepadChangeHandler);
    window.removeEventListener("gamepaddisconnected", this.gamepadChangeHandler);
    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  configure(assignments: Record<PlayerId, InputAssignment>): void {
    this.assignments = { ...assignments };
    this.buttonStates.clear();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.buttonStates.clear();
    }
  }

  connectedGamepads(): ConnectedGamepad[] {
    return this.getGamepads()
      .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected)
      .map((gamepad) => ({ index: gamepad.index, label: gamepad.id || `コントローラー ${gamepad.index + 1}` }));
  }

  assignedDisconnectedPlayer(): PlayerId | null {
    const connected = new Set(this.connectedGamepads().map((gamepad) => gamepad.index));
    for (const player of [1, 2] as const) {
      const assignment = this.assignments[player];
      if (assignment.startsWith("gamepad:") && !connected.has(gamepadIndex(assignment))) {
        return player;
      }
    }
    return null;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      event.preventDefault();
      if (!event.repeat) {
        this.togglePause();
      }
      return;
    }
    if (!this.active) {
      return;
    }
    for (const player of [1, 2] as const) {
      const action = keyboardAction(this.assignments[player], event.code);
      if (action) {
        event.preventDefault();
        this.dispatch(player, action);
        return;
      }
    }
  }

  private pollGamepads(): void {
    if (this.active) {
      const now = performance.now();
      const gamepads = this.getGamepads();
      for (const player of [1, 2] as const) {
        const assignment = this.assignments[player];
        if (!assignment.startsWith("gamepad:")) {
          continue;
        }
        const gamepad = gamepads[gamepadIndex(assignment)];
        if (!gamepad?.connected) {
          continue;
        }
        const controls = gamepadControlState(gamepad);
        this.updateGamepadAction(player, "left", controls.left, now);
        this.updateGamepadAction(player, "right", controls.right, now);
        this.updateGamepadAction(player, "rotate-left", controls.rotateLeft, now);
        this.updateGamepadAction(player, "rotate-right", controls.rotateRight, now);
        this.updateGamepadAction(player, "drop", controls.drop, now);
        if (this.updateGamepadPause(player, controls.pause, now)) {
          break;
        }
      }
    }
    this.frame = window.requestAnimationFrame(() => this.pollGamepads());
  }

  private updateGamepadAction(player: PlayerId, action: VersusAction, down: boolean, now: number): void {
    const key = `${player}:${action}`;
    const previous = this.buttonStates.get(key) ?? { down: false, firstAt: 0, lastAt: 0 };
    const repeatable = action !== "drop";
    const shouldFire =
      down &&
      (!previous.down || (repeatable && now - previous.firstAt >= 240 && now - previous.lastAt >= 130));
    if (shouldFire) {
      this.dispatch(player, action);
    }
    this.buttonStates.set(key, {
      down,
      firstAt: down ? (previous.down ? previous.firstAt : now) : 0,
      lastAt: shouldFire ? now : previous.lastAt
    });
  }

  private updateGamepadPause(player: PlayerId, down: boolean, now: number): boolean {
    const key = `${player}:pause`;
    const previous = this.buttonStates.get(key) ?? { down: false, firstAt: 0, lastAt: 0 };
    const shouldFire = down && !previous.down;
    if (shouldFire) {
      this.togglePause();
    }
    this.buttonStates.set(key, {
      down,
      firstAt: down ? (previous.down ? previous.firstAt : now) : 0,
      lastAt: shouldFire ? now : previous.lastAt
    });
    return shouldFire;
  }
}

function browserGamepads(): readonly (Gamepad | null)[] {
  return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
    ? Array.from(navigator.getGamepads())
    : [];
}
