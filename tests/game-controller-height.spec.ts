import Matter from "matter-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterRepository } from "../apps/game/src/character/CharacterRepository";
import { GameController, type GameHud } from "../apps/game/src/game/GameController";
import type { PhysicsWorld } from "../apps/game/src/game/PhysicsWorld";

describe("GameController final height", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
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

  it("measures only after the timer has reached zero", () => {
    const stackHeight = vi.fn(() => 148);
    const engine = Matter.Engine.create();
    const loseSensor = Matter.Bodies.rectangle(0, 0, 10, 10, { isSensor: true });
    const world = {
      engine,
      loseSensor,
      runner: { enabled: true },
      stackHeight
    } as unknown as PhysicsWorld;
    const states: Parameters<GameHud["setState"]>[0][] = [];
    const hud: GameHud = {
      setState: (state) => states.push(state),
      notify: vi.fn()
    };
    const repository = { getAll: () => [] } as unknown as CharacterRepository;
    const controller = new GameController(world, repository, hud);

    (controller as unknown as { finish(reason: "time"): void }).finish("time");

    expect(stackHeight).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ remainingMs: 0, height: null, resultReason: "time" });
    expect(world.runner.enabled).toBe(false);

    vi.runOnlyPendingTimers();

    expect(stackHeight).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ remainingMs: 0, height: 148, resultReason: "time" });
  });
});
