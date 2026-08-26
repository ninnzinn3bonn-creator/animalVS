export const captureCooldownDurationMs = 5_000;

export class CaptureCooldown {
  private availableAt = 0;

  constructor(
    private readonly durationMs = captureCooldownDurationMs,
    private readonly now: () => number = () => Date.now()
  ) {}

  start(): void {
    this.availableAt = this.now() + this.durationMs;
  }

  isActive(): boolean {
    return this.remainingMs() > 0;
  }

  remainingMs(): number {
    return Math.max(0, this.availableAt - this.now());
  }

  remainingSeconds(): number {
    return Math.ceil(this.remainingMs() / 1_000);
  }
}
