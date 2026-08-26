import { describe, expect, it } from "vitest";
import { TurnManager } from "../apps/game/src/game/TurnManager";

describe("TurnManager", () => {
  it("alternates players and counts completed drops", () => {
    const turns = new TurnManager();
    expect(turns.player).toBe(1);
    expect(turns.count).toBe(0);

    expect(turns.next()).toBe(2);
    expect(turns.count).toBe(1);
    expect(turns.next()).toBe(1);
    expect(turns.count).toBe(2);
  });

  it("resets to player one", () => {
    const turns = new TurnManager();
    turns.next();
    turns.reset();
    expect(turns.player).toBe(1);
    expect(turns.count).toBe(0);
  });
});
