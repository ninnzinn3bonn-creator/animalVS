import { describe, expect, it, vi } from "vitest";
import { GameMusic, MUSIC_PREFERENCE_KEY } from "../apps/game/src/audio/GameMusic";

function createHarness(saved: string | null = null) {
  const audio = {
    loop: false,
    preload: "",
    volume: 1,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn()
  };
  const storage = {
    getItem: vi.fn(() => saved),
    setItem: vi.fn()
  };
  const music = new GameMusic("/test.m4a", { createAudio: () => audio, storage });
  return { audio, music, storage };
}

describe("GameMusic", () => {
  it("configures a quiet looping track and follows active game channels", () => {
    const { audio, music } = createHarness();

    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe("auto");
    expect(audio.volume).toBe(0.3);

    music.setActive("solo", true);
    music.setActive("solo", true);
    expect(audio.play).toHaveBeenCalledTimes(1);

    music.setActive("versus", true);
    music.setActive("solo", false);
    expect(audio.pause).not.toHaveBeenCalled();

    music.setActive("versus", false);
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });

  it("persists the mute setting and resumes an active game when enabled", () => {
    const { audio, music, storage } = createHarness("false");

    expect(music.isEnabled()).toBe(false);
    music.setActive("solo", true);
    expect(audio.play).not.toHaveBeenCalled();

    expect(music.toggle()).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(MUSIC_PREFERENCE_KEY, "true");
    expect(audio.play).toHaveBeenCalledTimes(1);

    expect(music.toggle()).toBe(false);
    expect(audio.pause).toHaveBeenCalled();
  });
});
