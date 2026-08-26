export const MUSIC_PREFERENCE_KEY = "human-stack-bgm-enabled";

export type MusicChannel = "solo" | "versus";

interface MusicAudio {
  loop: boolean;
  preload: string;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
}

interface MusicStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GameMusicOptions {
  createAudio?: (source: string) => MusicAudio;
  storage?: MusicStorage | null;
}

export class GameMusic {
  private readonly audio: MusicAudio;
  private readonly storage: MusicStorage | null;
  private readonly activeChannels = new Set<MusicChannel>();
  private enabled: boolean;

  constructor(source = "/audio/bgm-relaxed-loop.m4a", options: GameMusicOptions = {}) {
    this.audio = options.createAudio?.(source) ?? new Audio(source);
    this.storage = options.storage === undefined ? this.defaultStorage() : options.storage;
    this.enabled = this.readPreference();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.volume = 0.3;
    if (typeof HTMLAudioElement !== "undefined" && this.audio instanceof HTMLAudioElement) {
      this.audio.dataset.gameMusic = "true";
      this.audio.hidden = true;
      this.audio.setAttribute("aria-hidden", "true");
      document.body.append(this.audio);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setActive(channel: MusicChannel, active: boolean): void {
    const changed = active ? !this.activeChannels.has(channel) : this.activeChannels.has(channel);
    if (!changed) {
      return;
    }
    if (active) {
      this.activeChannels.add(channel);
    } else {
      this.activeChannels.delete(channel);
    }
    this.syncPlayback();
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      this.storage?.setItem(MUSIC_PREFERENCE_KEY, String(this.enabled));
    } catch {
      // Playback still works when storage is blocked by the browser.
    }
    this.syncPlayback();
    return this.enabled;
  }

  private syncPlayback(): void {
    if (!this.enabled || this.activeChannels.size === 0) {
      this.audio.pause();
      return;
    }
    try {
      const playback = this.audio.play();
      if (playback instanceof Promise) {
        void playback.catch(() => undefined);
      }
    } catch {
      // A later user gesture will call setActive or toggle again.
    }
  }

  private readPreference(): boolean {
    try {
      return this.storage?.getItem(MUSIC_PREFERENCE_KEY) !== "false";
    } catch {
      return true;
    }
  }

  private defaultStorage(): MusicStorage | null {
    return typeof window === "undefined" ? null : window.localStorage;
  }
}
