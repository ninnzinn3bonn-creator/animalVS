import type { CharacterRepository } from "../character/CharacterRepository";
import { physicsConfig } from "../config/physics";
import {
  GameController,
  type GameControllerResult,
  type GameHud,
  type StackMeasurement
} from "../game/GameController";
import { PhysicsWorld } from "../game/PhysicsWorld";
import type { PlayerId } from "../game/TurnManager";
import {
  VERSUS_ATTACK_CHARACTER_THRESHOLD,
  VERSUS_ATTACK_SCALE,
  VERSUS_CHARACTER_FRICTION,
  VERSUS_CHARACTER_FRICTION_STATIC,
  VERSUS_DROP_INITIAL_VELOCITY_Y,
  VERSUS_GRAVITY_Y,
  VERSUS_LIVES,
  VERSUS_PLATFORM_EDGE_RISE,
  VERSUS_PLATFORM_FRICTION,
  VERSUS_PLATFORM_FRICTION_STATIC,
  VERSUS_PLATFORM_THICKNESS,
  VERSUS_PLATFORM_CONTROL_OVERHANG,
  VERSUS_PLATFORM_WIDTH,
  VERSUS_START_COUNTDOWN_MS,
  VERSUS_TURN_DURATION_MS,
  VERSUS_WORLD_HEIGHT,
  VERSUS_WORLD_WIDTH
} from "./VersusConfig";
import {
  type ConnectedGamepad,
  type InputAssignment,
  type VersusAction,
  validateInputAssignments,
  VersusInputRouter
} from "./VersusInput";

export type VersusPhase = "setup" | "countdown" | "playing" | "measuring" | "overtime" | "paused" | "result";
export type VersusPauseReason = "manual" | "controller";

export interface VersusResult {
  winner: PlayerId;
  loser: PlayerId;
  reason: "drop" | "height" | "characters";
  measurements: Record<PlayerId, StackMeasurement>;
}

export interface VersusCoordinatorEvents {
  phaseChanged(phase: VersusPhase): void;
  timerChanged(remainingMs: number, overtime: boolean): void;
  gamepadsChanged(gamepads: ConnectedGamepad[]): void;
  paused(reason: VersusPauseReason, disconnectedPlayer?: PlayerId): void;
  resumed(): void;
  startCountdownChanged(value: 3 | 2 | 1 | null): void;
  livesChanged(player: PlayerId, remainingLives: number): void;
  attackTriggered(attacker: PlayerId, target: PlayerId): void;
  finished(result: VersusResult): void;
}

export class VersusCoordinator {
  private readonly controllers: Record<PlayerId, GameController>;
  private readonly input: VersusInputRouter;
  private assignments: Record<PlayerId, InputAssignment> = {
    1: "keyboard:wasd",
    2: "keyboard:arrows"
  };
  private phase: VersusPhase = "setup";
  private phaseBeforePause: "playing" | "overtime" = "playing";
  private deadline = 0;
  private pausedAt = 0;
  private frame: number | null = null;
  private deadlineInFlight = false;
  private attackOwner: PlayerId | null = null;
  private countdownDeadline = 0;
  private lastCountdownValue: 3 | 2 | 1 | null = null;

  constructor(
    canvases: Record<PlayerId, HTMLCanvasElement>,
    repository: CharacterRepository,
    huds: Record<PlayerId, GameHud>,
    private readonly events: VersusCoordinatorEvents
  ) {
    const createController = (player: PlayerId): GameController => {
      const world = new PhysicsWorld(canvases[player], VERSUS_WORLD_WIDTH, VERSUS_WORLD_HEIGHT, {
        platformWidth: VERSUS_PLATFORM_WIDTH,
        platformEdgeRise: VERSUS_PLATFORM_EDGE_RISE,
        platformThickness: VERSUS_PLATFORM_THICKNESS,
        platformFriction: VERSUS_PLATFORM_FRICTION,
        platformFrictionStatic: VERSUS_PLATFORM_FRICTION_STATIC,
        gravityY: VERSUS_GRAVITY_Y
      });
      return new GameController(world, repository, huds[player], {
        clock: "external",
        keyboard: false,
        movementBounds: {
          minX: world.platform.bounds.min.x - VERSUS_PLATFORM_CONTROL_OVERHANG,
          maxX: world.platform.bounds.max.x + VERSUS_PLATFORM_CONTROL_OVERHANG
        },
        turnDurationMs: VERSUS_TURN_DURATION_MS,
        dropInitialVelocityY: VERSUS_DROP_INITIAL_VELOCITY_Y,
        characterFriction: VERSUS_CHARACTER_FRICTION,
        characterFrictionStatic: VERSUS_CHARACTER_FRICTION_STATIC,
        dropLimit: VERSUS_LIVES,
        onRemainingLivesChanged: (remainingLives) => this.events.livesChanged(player, remainingLives),
        onCharacterSettled: (settledCharacters) => this.handleCharacterSettled(player, settledCharacters),
        onResult: (result) => this.handleBoardResult(player, result)
      });
    };
    this.controllers = { 1: createController(1), 2: createController(2) };
    this.input = new VersusInputRouter(
      (player, action) => this.dispatch(player, action),
      () => this.togglePause(),
      () => this.handleGamepadChange()
    );
    this.controllers[1].start();
    this.controllers[2].start();
    this.input.connect();
    this.events.gamepadsChanged(this.input.connectedGamepads());
    this.loop();
  }

  startMatch(assignments: Record<PlayerId, InputAssignment>): string | null {
    const validation = validateInputAssignments(assignments[1], assignments[2], this.input.connectedGamepads());
    if (validation) {
      return validation;
    }
    this.assignments = { ...assignments };
    this.input.configure(this.assignments);
    this.controllers[1].restart();
    this.controllers[2].restart();
    this.deadlineInFlight = false;
    this.attackOwner = null;
    this.input.setActive(false);
    this.countdownDeadline = performance.now() + VERSUS_START_COUNTDOWN_MS;
    this.lastCountdownValue = 3;
    this.setPhase("countdown");
    this.events.startCountdownChanged(3);
    this.updateRemaining(physicsConfig.matchDurationMs);
    return null;
  }

  rematch(): string | null {
    return this.startMatch(this.assignments);
  }

  returnToSetup(): void {
    this.input.setActive(false);
    this.controllers[1].restart();
    this.controllers[2].restart();
    this.deadlineInFlight = false;
    this.attackOwner = null;
    this.countdownDeadline = 0;
    this.lastCountdownValue = null;
    this.events.startCountdownChanged(null);
    this.setPhase("setup");
    this.events.timerChanged(physicsConfig.matchDurationMs, false);
  }

  screenAction(player: PlayerId, action: VersusAction): void {
    if (this.assignments[player] === "screen") {
      this.dispatch(player, action);
    }
  }

  togglePause(): void {
    if (this.phase === "paused") {
      this.resume();
    } else if (this.phase === "playing" || this.phase === "overtime") {
      this.pause("manual");
    }
  }

  pauseForNavigation(): void {
    if (this.phase === "countdown") {
      this.returnToSetup();
    } else if (this.phase === "playing" || this.phase === "overtime") {
      this.pause("manual");
    }
  }

  resume(): boolean {
    if (this.phase !== "paused") {
      return false;
    }
    const disconnected = this.input.assignedDisconnectedPlayer();
    if (disconnected !== null) {
      this.events.paused("controller", disconnected);
      return false;
    }
    if (this.phaseBeforePause === "playing") {
      this.deadline += performance.now() - this.pausedAt;
    }
    this.phase = this.phaseBeforePause;
    this.controllers[1].setPaused(false);
    this.controllers[2].setPaused(false);
    this.input.setActive(true);
    this.events.phaseChanged(this.phase);
    this.events.resumed();
    return true;
  }

  refreshCharacters(): void {
    this.controllers[1].refreshCharacters();
    this.controllers[2].refreshCharacters();
  }

  connectedGamepads(): ConnectedGamepad[] {
    return this.input.connectedGamepads();
  }

  dispose(): void {
    this.input.dispose();
    this.controllers[1].dispose();
    this.controllers[2].dispose();
    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private loop(): void {
    const now = performance.now();
    if (this.phase === "countdown") {
      this.tickStartCountdown(now);
    } else if (this.phase === "playing") {
      const remaining = Math.max(0, this.deadline - now);
      this.updateRemaining(remaining);
      this.controllers[1].tickExternal();
      this.controllers[2].tickExternal();
      if (remaining <= 0 && this.phase === "playing" && !this.deadlineInFlight) {
        this.deadlineInFlight = true;
        void this.handleDeadline();
      }
    } else if (this.phase === "overtime") {
      this.controllers[1].tickExternal();
      this.controllers[2].tickExternal();
      this.events.timerChanged(0, true);
    }
    this.frame = window.requestAnimationFrame(() => this.loop());
  }

  private updateRemaining(remainingMs: number): void {
    this.controllers[1].setExternalRemaining(remainingMs);
    this.controllers[2].setExternalRemaining(remainingMs);
    this.events.timerChanged(remainingMs, false);
  }

  private tickStartCountdown(now: number): void {
    const value = startCountdownValue(this.countdownDeadline - now);
    if (value !== this.lastCountdownValue) {
      this.lastCountdownValue = value;
      this.events.startCountdownChanged(value);
    }
    if (value !== null) {
      return;
    }
    this.controllers[1].startGame();
    this.controllers[2].startGame();
    this.deadline = now + physicsConfig.matchDurationMs;
    this.setPhase("playing");
    this.input.setActive(true);
    this.updateRemaining(physicsConfig.matchDurationMs);
  }

  private async handleDeadline(): Promise<void> {
    this.input.setActive(false);
    this.setPhase("measuring");
    this.events.timerChanged(0, false);
    const [player1, player2] = await Promise.all([
      this.controllers[1].measureAtDeadline(),
      this.controllers[2].measureAtDeadline()
    ]);
    if (this.phase !== "measuring") {
      return;
    }
    const winner = winnerByHeight({ 1: player1, 2: player2 });
    if (winner === null) {
      this.controllers[1].resumeAfterDeadline();
      this.controllers[2].resumeAfterDeadline();
      this.setPhase("overtime");
      this.input.setActive(true);
      this.events.timerChanged(0, true);
      return;
    }
    this.controllers[1].completeExternalResult("time", player1);
    this.controllers[2].completeExternalResult("time", player2);
    this.finishMatch({
      winner,
      loser: winner === 1 ? 2 : 1,
      reason: player1.height === player2.height ? "characters" : "height",
      measurements: { 1: player1, 2: player2 }
    });
  }

  private handleBoardResult(player: PlayerId, result: GameControllerResult): void {
    if (result.reason !== "drop" || (this.phase !== "playing" && this.phase !== "overtime")) {
      return;
    }
    const winner: PlayerId = player === 1 ? 2 : 1;
    const winnerMeasurement = this.controllers[winner].measureStack();
    this.controllers[winner].completeExternalResult("opponent", winnerMeasurement);
    this.finishMatch({
      winner,
      loser: player,
      reason: "drop",
      measurements: {
        [player]: { height: result.height, boardCharacters: result.boardCharacters },
        [winner]: winnerMeasurement
      } as Record<PlayerId, StackMeasurement>
    });
  }

  private handleCharacterSettled(player: PlayerId, settledCharacters: number): void {
    if (
      this.attackOwner !== null ||
      settledCharacters < VERSUS_ATTACK_CHARACTER_THRESHOLD ||
      (this.phase !== "playing" && this.phase !== "overtime")
    ) {
      return;
    }
    const target: PlayerId = player === 1 ? 2 : 1;
    this.attackOwner = player;
    this.controllers[target].enlargeCurrentOrNextCharacter(VERSUS_ATTACK_SCALE);
    this.events.attackTriggered(player, target);
  }

  private finishMatch(result: VersusResult): void {
    this.input.setActive(false);
    this.setPhase("result");
    this.events.finished(result);
  }

  private dispatch(player: PlayerId, action: VersusAction): void {
    if (this.phase !== "playing" && this.phase !== "overtime") {
      return;
    }
    const controller = this.controllers[player];
    if (action === "left") controller.move(-1);
    if (action === "right") controller.move(1);
    if (action === "rotate-left") controller.rotate(-1);
    if (action === "rotate-right") controller.rotate(1);
    if (action === "drop") controller.drop();
  }

  private pause(reason: VersusPauseReason): void {
    this.phaseBeforePause = this.phase as "playing" | "overtime";
    this.pausedAt = performance.now();
    this.controllers[1].setPaused(true);
    this.controllers[2].setPaused(true);
    // Keep polling while paused so a controller's START button can resume.
    // Gameplay actions are ignored by dispatch until the phase is active again.
    this.input.setActive(true);
    this.phase = "paused";
    this.events.phaseChanged("paused");
    const disconnected = reason === "controller" ? this.input.assignedDisconnectedPlayer() ?? undefined : undefined;
    this.events.paused(reason, disconnected);
  }

  private handleGamepadChange(): void {
    const gamepads = this.input.connectedGamepads();
    this.events.gamepadsChanged(gamepads);
    const disconnected = this.input.assignedDisconnectedPlayer();
    if (disconnected !== null && this.phase === "countdown") {
      this.returnToSetup();
      return;
    }
    if (disconnected !== null && (this.phase === "playing" || this.phase === "overtime")) {
      this.pause("controller");
    }
  }

  private setPhase(phase: VersusPhase): void {
    this.phase = phase;
    this.events.phaseChanged(phase);
  }
}

export function startCountdownValue(remainingMs: number): 3 | 2 | 1 | null {
  if (remainingMs <= 0) return null;
  return Math.min(3, Math.ceil(remainingMs / 1_000)) as 3 | 2 | 1;
}

export function winnerByHeight(measurements: Record<PlayerId, StackMeasurement>): PlayerId | null {
  if (measurements[1].height !== measurements[2].height) {
    return measurements[1].height > measurements[2].height ? 1 : 2;
  }
  if (measurements[1].boardCharacters !== measurements[2].boardCharacters) {
    return measurements[1].boardCharacters > measurements[2].boardCharacters ? 1 : 2;
  }
  return null;
}
