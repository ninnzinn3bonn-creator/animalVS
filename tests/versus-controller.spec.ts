import Matter from "matter-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterRepository } from "../apps/game/src/character/CharacterRepository";
import { demoCharacters } from "../apps/game/src/character/demoCharacters";
import { physicsConfig } from "../apps/game/src/config/physics";
import {
  GameController,
  type GameControllerOptions,
  type GameHud
} from "../apps/game/src/game/GameController";
import type { PhysicsWorld } from "../apps/game/src/game/PhysicsWorld";
import { startCountdownValue, winnerByHeight } from "../apps/game/src/versus/VersusCoordinator";
import {
  VERSUS_ATTACK_EARNED_MESSAGE,
  VERSUS_ATTACK_INCOMING_MESSAGE,
  VERSUS_ATTACK_SCALE,
  VERSUS_CHARACTER_FRICTION,
  VERSUS_CHARACTER_FRICTION_STATIC,
  VERSUS_DROP_INITIAL_VELOCITY_SCALE,
  VERSUS_DROP_INITIAL_VELOCITY_Y,
  VERSUS_LIVES,
  VERSUS_START_COUNTDOWN_MS
} from "../apps/game/src/versus/VersusConfig";

describe("versus game sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps two boards independent", () => {
    const first = createSession();
    const second = createSession();
    first.controller.start();
    second.controller.start();
    first.controller.startGame();
    second.controller.startGame();

    const firstBody = first.added[0];
    const secondBody = second.added[0];
    const secondStartX = secondBody.position.x;
    first.controller.move(-1);

    expect(firstBody.position.x).toBeLessThan(secondStartX);
    expect(secondBody.position.x).toBe(secondStartX);
  });

  it("freezes at zero, measures settled characters, and resumes the same board for overtime", async () => {
    const session = createSession(152, 4);
    session.controller.start();
    session.controller.startGame();
    session.controller.setExternalRemaining(0);

    const measurementPromise = session.controller.measureAtDeadline();
    expect(session.world.runner.enabled).toBe(false);
    await vi.runOnlyPendingTimersAsync();
    await expect(measurementPromise).resolves.toEqual({ height: 152, boardCharacters: 4 });

    session.controller.resumeAfterDeadline();
    expect(session.world.runner.enabled).toBe(true);
  });

  it("uses settled character count after height and sends only exact ties to overtime", () => {
    expect(winnerByHeight({ 1: { height: 100, boardCharacters: 2 }, 2: { height: 90, boardCharacters: 8 } })).toBe(1);
    expect(winnerByHeight({ 1: { height: 100, boardCharacters: 2 }, 2: { height: 100, boardCharacters: 9 } })).toBe(2);
    expect(winnerByHeight({ 1: { height: 100, boardCharacters: 9 }, 2: { height: 100, boardCharacters: 9 } })).toBeNull();
  });

  it("shows 3-2-1 and automatically drops after seven seconds", () => {
    const session = createSession(0, 0, { turnDurationMs: 7_000 });
    session.controller.start();
    session.controller.startGame();
    const body = session.added[0];

    vi.advanceTimersByTime(4_100);
    session.controller.tickExternal();
    expect(session.states.at(-1)?.turnCountdown).toBe(3);

    vi.advanceTimersByTime(2_000);
    session.controller.tickExternal();
    expect(session.states.at(-1)?.turnCountdown).toBe(1);

    vi.advanceTimersByTime(1_000);
    session.controller.tickExternal();
    expect(body.isStatic).toBe(false);
    expect(body.plugin).toMatchObject({ dropped: true });
    expect(session.states.at(-1)?.turnCountdown).toBeNull();
  });

  it("shows a three-second countdown before the match starts", () => {
    expect(VERSUS_START_COUNTDOWN_MS).toBe(3_000);
    expect(startCountdownValue(3_000)).toBe(3);
    expect(startCountdownValue(2_000)).toBe(2);
    expect(startCountdownValue(1_000)).toBe(1);
    expect(startCountdownValue(0)).toBeNull();
  });

  it("continues after the first fall and ends on the second fall in versus", () => {
    const onRemainingLivesChanged = vi.fn();
    const onResult = vi.fn();
    const session = createSession(0, 0, {
      dropLimit: VERSUS_LIVES,
      onRemainingLivesChanged,
      onResult
    });
    session.controller.start();
    session.controller.startGame();

    const firstCharacter = session.added[0];
    session.controller.drop();
    session.setDroppedCharacterOutOfBounds(firstCharacter);
    session.controller.tickExternal();

    expect(onRemainingLivesChanged.mock.calls.map(([lives]) => lives)).toEqual([2, 1]);
    expect(onResult).not.toHaveBeenCalled();
    expect(session.world.remove).toHaveBeenCalledWith(firstCharacter);
    expect(session.added).toHaveLength(2);

    const secondCharacter = session.added[1];
    session.controller.drop();
    session.setDroppedCharacterOutOfBounds(secondCharacter);
    session.controller.tickExternal();

    expect(onRemainingLivesChanged.mock.calls.map(([lives]) => lives)).toEqual([2, 1, 0]);
    expect(onResult).toHaveBeenCalledWith({ reason: "drop", height: 0, boardCharacters: 0 });
  });

  it("doubles only the configured versus drop velocity", () => {
    expect(VERSUS_DROP_INITIAL_VELOCITY_SCALE).toBe(2);
    expect(VERSUS_DROP_INITIAL_VELOCITY_Y).toBeCloseTo(physicsConfig.dropInitialVelocityY * 2);

    const versus = createSession(0, 0, { dropInitialVelocityY: VERSUS_DROP_INITIAL_VELOCITY_Y });
    versus.controller.start();
    versus.controller.startGame();
    versus.controller.drop();

    const solo = createSession();
    solo.controller.start();
    solo.controller.startGame();
    solo.controller.drop();

    expect(versus.added[0].velocity.y).toBeCloseTo(VERSUS_DROP_INITIAL_VELOCITY_Y);
    expect(solo.added[0].velocity.y).toBeCloseTo(physicsConfig.dropInitialVelocityY);
  });

  it("applies higher friction only to versus characters", () => {
    const versus = createSession(0, 0, {
      characterFriction: VERSUS_CHARACTER_FRICTION,
      characterFrictionStatic: VERSUS_CHARACTER_FRICTION_STATIC
    });
    versus.controller.start();
    versus.controller.startGame();
    versus.controller.drop();

    const solo = createSession();
    solo.controller.start();
    solo.controller.startGame();
    solo.controller.drop();

    expect(versus.added[0].friction).toBeCloseTo(physicsConfig.friction * 1.5);
    expect(versus.added[0].frictionStatic).toBeCloseTo(physicsConfig.frictionStatic * 1.5);
    expect(solo.added[0].friction).toBeCloseTo(physicsConfig.friction);
    expect(solo.added[0].frictionStatic).toBeCloseTo(physicsConfig.frictionStatic);
  });

  it("uses the requested giant attack notices", () => {
    expect(VERSUS_ATTACK_EARNED_MESSAGE).toBe("１０体先取！！巨大化攻撃！！");
    expect(VERSUS_ATTACK_INCOMING_MESSAGE).toBe("相手からの巨大化攻撃を受けた！！");
  });

  it("enlarges the opponent's controllable character by 2 times", () => {
    const session = createSession();
    session.controller.start();
    session.controller.startGame();
    const body = session.added[0];
    const widthBefore = body.bounds.max.x - body.bounds.min.x;
    const spriteScaleBefore = body.render.sprite?.xScale ?? 1;

    expect(VERSUS_ATTACK_SCALE).toBe(2);
    expect(session.controller.enlargeCurrentOrNextCharacter(VERSUS_ATTACK_SCALE)).toBe("current");
    expect(body.bounds.max.x - body.bounds.min.x).toBeCloseTo(widthBefore * 2);
    expect(body.render.sprite?.xScale).toBeCloseTo(spriteScaleBefore * 2);
  });

  it("notifies the coordinator when the tenth character settles", () => {
    const onCharacterSettled = vi.fn();
    const session = createSession(0, 10, { onCharacterSettled });
    session.controller.start();
    session.controller.startGame();
    session.controller.drop();

    vi.advanceTimersByTime(2_300);

    expect(onCharacterSettled).toHaveBeenCalledWith(10);
  });
});

function createSession(height = 0, boardCharacters = 0, options: GameControllerOptions = {}): {
  controller: GameController;
  world: PhysicsWorld;
  added: Matter.Body[];
  states: Parameters<GameHud["setState"]>[0][];
  setDroppedCharacterOutOfBounds(body: Matter.Body | null): void;
} {
  const added: Matter.Body[] = [];
  let droppedCharacterOutOfBounds: Matter.Body | null = null;
  const engine = Matter.Engine.create();
  const loseSensor = Matter.Bodies.rectangle(195, 662, 1950, 36, { isSensor: true });
  const world = {
    engine,
    loseSensor,
    runner: { enabled: true },
    width: 390,
    height: 680,
    start: vi.fn(),
    stop: vi.fn(),
    add: (body: Matter.Body) => added.push(body),
    remove: vi.fn(),
    resetDynamicBodies: vi.fn(),
    hasDroppedCharacterOutOfBounds: vi.fn(() => droppedCharacterOutOfBounds !== null),
    droppedCharacterOutOfBounds: vi.fn(() => droppedCharacterOutOfBounds),
    stackHeight: vi.fn(() => height),
    settledCharacterCount: vi.fn(() => boardCharacters)
  } as unknown as PhysicsWorld;
  const repository = {
    random: () => demoCharacters[0],
    getAll: () => demoCharacters
  } as unknown as CharacterRepository;
  const states: Parameters<GameHud["setState"]>[0][] = [];
  const hud: GameHud = { setState: (state) => states.push(state), notify: vi.fn() };
  const controller = new GameController(world, repository, hud, {
    clock: "external",
    keyboard: false,
    ...options
  });
  return {
    controller,
    world,
    added,
    states,
    setDroppedCharacterOutOfBounds: (body) => {
      droppedCharacterOutOfBounds = body;
    }
  };
}
