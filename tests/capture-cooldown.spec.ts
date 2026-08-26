import { describe, expect, it } from "vitest";
import { CaptureCooldown, captureCooldownDurationMs } from "../apps/game/src/capture/CaptureCooldown";

describe("CaptureCooldown", () => {
  it("blocks another capture for five seconds", () => {
    let now = 10_000;
    const cooldown = new CaptureCooldown(captureCooldownDurationMs, () => now);

    cooldown.start();

    expect(cooldown.isActive()).toBe(true);
    expect(cooldown.remainingSeconds()).toBe(5);

    now += 4_001;
    expect(cooldown.remainingSeconds()).toBe(1);
    expect(cooldown.isActive()).toBe(true);

    now += 999;
    expect(cooldown.remainingSeconds()).toBe(0);
    expect(cooldown.isActive()).toBe(false);
  });
});
