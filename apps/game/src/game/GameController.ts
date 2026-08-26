import Matter from "matter-js";
import { CharacterRepository } from "../character/CharacterRepository";
import type { CharacterDefinition } from "../character/CharacterTypes";
import { physicsConfig } from "../config/physics";
import { CharacterFactory } from "./CharacterFactory";
import { LoseDetector } from "./LoseDetector";
import { PhysicsWorld } from "./PhysicsWorld";

export type GameState = "idle" | "playing" | "paused" | "result";
export type ResultReason = "drop" | "time" | "opponent";

export interface StackMeasurement {
  height: number;
  boardCharacters: number;
}

export interface GameControllerResult extends StackMeasurement {
  reason: ResultReason;
}

export interface GameControllerOptions {
  clock?: "internal" | "external";
  keyboard?: boolean;
  onResult?: (result: GameControllerResult) => void;
  onCharacterSettled?: (settledCharacters: number) => void;
  movementBounds?: { minX: number; maxX: number };
  turnDurationMs?: number;
  dropInitialVelocityY?: number;
  characterFriction?: number;
  characterFrictionStatic?: number;
  dropLimit?: number;
  onRemainingLivesChanged?: (remainingLives: number) => void;
}

export interface GameHud {
  setState(state: {
    nextName: string;
    drops: number;
    height: number | null;
    boardCharacters: number;
    remainingMs: number;
    status: string;
    mode: GameState;
    canControl: boolean;
    turnCountdown?: number | null;
    characters: CharacterDefinition[];
    resultReason?: ResultReason;
  }): void;
  notify(message: string): void;
}

export class GameController {
  private readonly factory = new CharacterFactory();
  private readonly loseDetector: LoseDetector;
  private state: GameState = "idle";
  private activeBody: Matter.Body | null = null;
  private activeCharacter: CharacterDefinition | null = null;
  private drops = 0;
  private settleTimer: number | null = null;
  private timer: number | null = null;
  private heightMeasurementTimer: number | null = null;
  private startedAt = 0;
  private remainingMs: number = physicsConfig.matchDurationMs;
  private finalHeight: number | null = null;
  private finalBoardCharacters = 0;
  private resultReason: ResultReason | undefined;
  private readonly clock: "internal" | "external";
  private readonly keyboardEnabled: boolean;
  private readonly onResult?: (result: GameControllerResult) => void;
  private readonly onCharacterSettled?: (settledCharacters: number) => void;
  private readonly movementBounds: { minX: number; maxX: number };
  private readonly turnDurationMs: number | null;
  private readonly dropInitialVelocityY: number;
  private readonly characterFriction: number;
  private readonly characterFrictionStatic: number;
  private readonly dropLimit: number;
  private readonly onRemainingLivesChanged?: (remainingLives: number) => void;
  private failedDrops = 0;
  private readonly handledDroppedBodies = new Set<number>();
  private turnDeadline = 0;
  private pausedTurnRemainingMs: number | null = null;
  private turnCountdown: number | null = null;
  private pendingCharacterScale = 1;
  private readonly keyHandler = (event: KeyboardEvent) => this.handleKey(event);

  constructor(
    private readonly world: PhysicsWorld,
    private readonly repository: CharacterRepository,
    private readonly hud: GameHud,
    options: GameControllerOptions = {}
  ) {
    this.clock = options.clock ?? "internal";
    this.keyboardEnabled = options.keyboard ?? true;
    this.onResult = options.onResult;
    this.onCharacterSettled = options.onCharacterSettled;
    this.movementBounds = options.movementBounds ?? { minX: 70, maxX: this.world.width - 70 };
    this.turnDurationMs = options.turnDurationMs ?? null;
    this.dropInitialVelocityY = options.dropInitialVelocityY ?? physicsConfig.dropInitialVelocityY;
    this.characterFriction = options.characterFriction ?? physicsConfig.friction;
    this.characterFrictionStatic = options.characterFrictionStatic ?? physicsConfig.frictionStatic;
    this.dropLimit = Math.max(1, Math.floor(options.dropLimit ?? 1));
    this.onRemainingLivesChanged = options.onRemainingLivesChanged;
    this.loseDetector = new LoseDetector(world.loseSensor);
    this.loseDetector.attach(this.world.engine, (_player, character) => this.handleDroppedCharacter(character));
    if (this.keyboardEnabled) {
      window.addEventListener("keydown", this.keyHandler);
    }
  }

  start(): void {
    this.world.start();
    this.restart();
  }

  startGame(): void {
    if (this.state === "paused") {
      this.pauseToggle();
      return;
    }
    if (this.state === "result") {
      this.restart();
    }
    if (this.state !== "idle") {
      return;
    }
    this.state = "playing";
    this.startedAt = performance.now();
    this.world.runner.enabled = true;
    if (this.clock === "internal") {
      this.timer = window.setInterval(() => this.tick(), 200);
    }
    this.startTurnTimer();
    this.updateHud();
  }

  pauseToggle(): void {
    if (this.state === "playing") {
      this.pauseTurnTimer();
      this.state = "paused";
      this.world.runner.enabled = false;
    } else if (this.state === "paused") {
      this.state = "playing";
      if (this.clock === "internal") {
        this.startedAt = performance.now() - (physicsConfig.matchDurationMs - this.remainingMs);
      }
      this.world.runner.enabled = true;
      this.resumeTurnTimer();
    }
    this.updateHud();
  }

  setPaused(paused: boolean): void {
    if (paused && this.state === "playing") {
      this.pauseToggle();
    } else if (!paused && this.state === "paused") {
      this.pauseToggle();
    }
  }

  setExternalRemaining(remainingMs: number): void {
    if (this.clock !== "external" || (this.state !== "playing" && this.state !== "paused")) {
      return;
    }
    this.remainingMs = Math.max(0, remainingMs);
    this.updateHud();
  }

  tickExternal(): void {
    if (this.clock !== "external" || this.state !== "playing") {
      return;
    }
    const droppedCharacter = this.world.droppedCharacterOutOfBounds();
    if (droppedCharacter) {
      this.handleDroppedCharacter(droppedCharacter);
      return;
    }
    this.tickTurnTimer();
  }

  async measureAtDeadline(): Promise<StackMeasurement> {
    if (this.clock !== "external") {
      return this.measureStack();
    }
    this.remainingMs = 0;
    if (this.state === "playing") {
      this.pauseTurnTimer();
      this.state = "paused";
    }
    this.world.runner.enabled = false;
    this.updateHud();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    return this.measureStack();
  }

  resumeAfterDeadline(): void {
    if (this.clock !== "external" || this.state !== "paused") {
      return;
    }
    this.state = "playing";
    this.world.runner.enabled = true;
    this.resumeTurnTimer();
    this.updateHud();
  }

  completeExternalResult(reason: "time" | "opponent", measurement = this.measureStack()): void {
    if (this.clock !== "external" || this.state === "result") {
      return;
    }
    this.resultReason = reason;
    this.state = "result";
    this.world.runner.enabled = false;
    if (reason === "time") {
      this.remainingMs = 0;
    }
    this.finalHeight = measurement.height;
    this.finalBoardCharacters = measurement.boardCharacters;
    this.activeBody = null;
    this.clearTimers();
    this.updateHud();
  }

  measureStack(): StackMeasurement {
    return {
      height: this.world.stackHeight(),
      boardCharacters: this.getSettledCharacterCount()
    };
  }

  dispose(): void {
    this.clearTimers();
    this.world.stop();
    if (this.keyboardEnabled) {
      window.removeEventListener("keydown", this.keyHandler);
    }
  }

  enlargeCurrentOrNextCharacter(scale: number): "current" | "next" {
    if (this.canControlActiveBody() && this.activeBody) {
      Matter.Body.scale(this.activeBody, scale, scale);
      if (this.activeBody.render.sprite) {
        this.activeBody.render.sprite.xScale *= scale;
        this.activeBody.render.sprite.yScale *= scale;
      }
      this.activeBody.plugin = { ...this.activeBody.plugin, versusAttackScale: scale };
      this.updateHud();
      return "current";
    }
    this.pendingCharacterScale = Math.max(this.pendingCharacterScale, scale);
    return "next";
  }

  move(direction: -1 | 1): void {
    if (!this.canControlActiveBody() || !this.activeBody) {
      return;
    }
    const activeBody = this.activeBody;
    const x = Math.max(
      this.movementBounds.minX,
      Math.min(this.movementBounds.maxX, this.activeBody.position.x + direction * physicsConfig.moveStep)
    );
    Matter.Body.setPosition(activeBody, { x, y: activeBody.position.y });
  }

  rotate(direction: -1 | 1): void {
    if (!this.canControlActiveBody() || !this.activeBody) {
      return;
    }
    Matter.Body.rotate(this.activeBody, direction * physicsConfig.rotationStep);
  }

  drop(): void {
    if (!this.canControlActiveBody() || !this.activeBody) {
      return;
    }
    const activeBody = this.activeBody;
    this.clearTurnTimer();
    Matter.Body.setStatic(activeBody, false);
    Matter.Body.setVelocity(activeBody, { x: 0, y: this.dropInitialVelocityY });
    activeBody.plugin = {
      ...activeBody.plugin,
      player: 1,
      dropped: true,
      settled: false,
      droppedAt: performance.now()
    };
    this.waitForSettle(activeBody);
    this.updateHud();
  }

  restart(): void {
    this.clearTimers();
    this.state = "idle";
    this.resultReason = undefined;
    this.startedAt = 0;
    this.remainingMs = physicsConfig.matchDurationMs;
    this.finalHeight = null;
    this.finalBoardCharacters = 0;
    this.drops = 0;
    this.activeBody = null;
    this.activeCharacter = null;
    this.pendingCharacterScale = 1;
    this.failedDrops = 0;
    this.handledDroppedBodies.clear();
    this.loseDetector.reset();
    this.world.runner.enabled = true;
    this.world.resetDynamicBodies();
    this.spawnNext();
    this.onRemainingLivesChanged?.(this.dropLimit);
    this.updateHud();
  }

  refreshCharacters(): void {
    const activeWasDisabled =
      this.activeCharacter &&
      !this.repository.getAll().some((character) => character.id === this.activeCharacter?.id && character.enabled);
    const activeWasDropped = Boolean((this.activeBody?.plugin as { dropped?: boolean } | undefined)?.dropped);
    if (activeWasDisabled && this.activeBody && !activeWasDropped) {
      this.world.remove(this.activeBody);
      this.activeBody = null;
      this.activeCharacter = null;
      this.spawnNext();
    }
    this.updateHud();
  }

  async setCharacterEnabled(id: string, enabled: boolean): Promise<boolean> {
    try {
      const character = await this.repository.setEnabled(id, enabled);
      this.refreshCharacters();
      this.hud.notify(`${character.name}を${enabled ? "有効" : "無効"}にしました`);
      return true;
    } catch (error) {
      this.updateHud();
      this.hud.notify(error instanceof Error ? error.message : "キャラクター設定の更新に失敗しました");
      return false;
    }
  }

  async deleteCharacter(id: string): Promise<boolean> {
    try {
      const character = await this.repository.remove(id);
      this.refreshCharacters();
      this.hud.notify(`${character.name}を削除しました`);
      return true;
    } catch (error) {
      this.updateHud();
      this.hud.notify(error instanceof Error ? error.message : "キャラクターの削除に失敗しました");
      return false;
    }
  }

  private spawnNext(): void {
    if (this.state !== "playing" && this.state !== "idle") {
      return;
    }
    this.activeCharacter = this.repository.random();
    const created = this.factory.create(
      this.activeCharacter,
      this.world.width / 2,
      physicsConfig.spawnY,
      this.world.width,
      this.pendingCharacterScale,
      {
        friction: this.characterFriction,
        frictionStatic: this.characterFrictionStatic
      }
    );
    this.pendingCharacterScale = 1;
    this.activeBody = created.body;
    Matter.Body.setStatic(this.activeBody, true);
    this.world.add(this.activeBody);
    this.startTurnTimer();
  }

  private waitForSettle(target: Matter.Body): void {
    if (this.settleTimer) {
      window.clearInterval(this.settleTimer);
    }
    const started = performance.now();
    this.settleTimer = window.setInterval(() => {
      if (this.state !== "playing" || this.activeBody !== target) {
        return;
      }
      const elapsed = performance.now() - started;
      const settled =
        target.speed < physicsConfig.settleSpeedThreshold &&
        Math.abs(target.angularSpeed) < physicsConfig.settleAngularThreshold;
      if (settled || elapsed >= physicsConfig.settleTimeoutMs) {
        window.clearInterval(this.settleTimer ?? undefined);
        this.settleTimer = null;
        target.plugin = { ...target.plugin, settled: true };
        this.activeBody = null;
        this.drops += 1;
        this.onCharacterSettled?.(this.getSettledCharacterCount());
        this.spawnNext();
        this.updateHud();
      }
    }, 120);
  }

  private tick(): void {
    if (this.state !== "playing") {
      return;
    }
    const droppedCharacter = this.world.droppedCharacterOutOfBounds();
    if (droppedCharacter) {
      this.handleDroppedCharacter(droppedCharacter);
      return;
    }
    this.remainingMs = Math.max(0, physicsConfig.matchDurationMs - (performance.now() - this.startedAt));
    if (this.remainingMs <= 0) {
      this.finish("time");
      return;
    }
    this.updateHud();
  }

  private finish(reason: ResultReason): void {
    if (this.state === "result") {
      return;
    }
    this.resultReason = reason;
    this.state = "result";
    this.world.runner.enabled = false;
    if (reason === "time") {
      this.remainingMs = 0;
    }
    this.activeBody = null;
    this.clearTimers();
    // A fallen character is excluded by stackHeight unless it has already settled.
    if (reason === "drop") {
      this.finalHeight = this.world.stackHeight();
      this.finalBoardCharacters = this.getSettledCharacterCount();
    }
    this.updateHud();
    if (reason === "time") {
      this.heightMeasurementTimer = window.setTimeout(() => {
        this.heightMeasurementTimer = null;
        if (this.state !== "result" || this.resultReason !== "time" || this.remainingMs !== 0) {
          return;
        }
        this.finalHeight = this.world.stackHeight();
        this.finalBoardCharacters = this.getSettledCharacterCount();
        this.updateHud();
        this.onResult?.({
          reason,
          height: this.finalHeight,
          boardCharacters: this.finalBoardCharacters
        });
      }, 0);
    } else {
      this.onResult?.({
        reason,
        height: this.finalHeight ?? 0,
        boardCharacters: this.finalBoardCharacters
      });
    }
  }

  private handleDroppedCharacter(character: Matter.Body): void {
    if (this.state !== "playing" || this.handledDroppedBodies.has(character.id)) {
      return;
    }
    this.handledDroppedBodies.add(character.id);
    this.world.remove(character);
    this.loseDetector.reset();

    if (this.activeBody === character) {
      if (this.settleTimer) {
        window.clearInterval(this.settleTimer);
        this.settleTimer = null;
      }
      this.clearTurnTimer();
      this.activeBody = null;
      this.activeCharacter = null;
    }

    this.failedDrops += 1;
    const remainingLives = Math.max(0, this.dropLimit - this.failedDrops);
    this.onRemainingLivesChanged?.(remainingLives);
    if (remainingLives === 0) {
      this.finish("drop");
      return;
    }

    if (!this.activeBody) {
      this.spawnNext();
    }
    this.updateHud();
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.pauseToggle();
      return;
    }
    if ((this.state === "idle" || this.state === "result") && event.key === "Enter") {
      this.startGame();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "a" || event.key === "ArrowLeft") {
      this.move(-1);
    } else if (key === "d" || event.key === "ArrowRight") {
      this.move(1);
    } else if (key === "q") {
      this.rotate(-1);
    } else if (key === "e") {
      this.rotate(1);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      this.drop();
    }
  }

  private updateHud(): void {
    const status =
      this.state === "result"
        ? this.resultReason === "drop"
          ? "ゲームオーバー：キャラクターが落下しました"
          : this.resultReason === "opponent"
            ? "対戦終了"
            : this.finalHeight === null
            ? "タイムアップ：最終の高さを測定中です"
            : "タイムアップ：最終の高さを記録しました"
        : this.state === "paused"
          ? "一時停止中"
          : this.state === "idle"
            ? "スタート待ち"
            : "できるだけ高く積み上げよう";
    this.hud.setState({
      nextName: this.activeCharacter?.name ?? "-",
      drops: this.drops,
      height: this.finalHeight,
      boardCharacters: this.finalBoardCharacters,
      remainingMs: this.remainingMs,
      status,
      mode: this.state,
      canControl: this.canControlActiveBody(),
      turnCountdown: this.turnCountdown,
      characters: this.repository.getAll(),
      resultReason: this.resultReason
    });
  }

  private clearTimers(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.settleTimer) {
      window.clearInterval(this.settleTimer);
      this.settleTimer = null;
    }
    if (this.heightMeasurementTimer) {
      window.clearTimeout(this.heightMeasurementTimer);
      this.heightMeasurementTimer = null;
    }
    this.clearTurnTimer();
  }

  private startTurnTimer(): void {
    if (!this.turnDurationMs || !this.canControlActiveBody()) {
      return;
    }
    this.turnDeadline = performance.now() + this.turnDurationMs;
    this.pausedTurnRemainingMs = null;
    this.setTurnCountdown(null);
  }

  private tickTurnTimer(): void {
    if (!this.turnDurationMs || !this.canControlActiveBody() || this.turnDeadline <= 0) {
      return;
    }
    const remainingMs = this.turnDeadline - performance.now();
    if (remainingMs <= 0) {
      this.drop();
      return;
    }
    this.setTurnCountdown(remainingMs <= 3_000 ? Math.ceil(remainingMs / 1_000) : null);
  }

  private pauseTurnTimer(): void {
    if (this.turnDeadline <= 0) {
      return;
    }
    this.pausedTurnRemainingMs = Math.max(0, this.turnDeadline - performance.now());
    this.turnDeadline = 0;
    this.setTurnCountdown(null);
  }

  private resumeTurnTimer(): void {
    if (!this.turnDurationMs || !this.canControlActiveBody()) {
      return;
    }
    const remainingMs = this.pausedTurnRemainingMs ?? this.turnDurationMs;
    this.pausedTurnRemainingMs = null;
    this.turnDeadline = performance.now() + remainingMs;
  }

  private clearTurnTimer(): void {
    this.turnDeadline = 0;
    this.pausedTurnRemainingMs = null;
    this.turnCountdown = null;
  }

  private setTurnCountdown(value: number | null): void {
    if (this.turnCountdown === value) {
      return;
    }
    this.turnCountdown = value;
    this.updateHud();
  }

  private getSettledCharacterCount(): number {
    const count = this.world.settledCharacterCount as (() => number) | undefined;
    return typeof count === "function" ? count.call(this.world) : this.drops;
  }

  private canControlActiveBody(): boolean {
    return (
      this.state === "playing" &&
      this.activeBody !== null &&
      !(this.activeBody.plugin as { dropped?: boolean }).dropped
    );
  }
}
