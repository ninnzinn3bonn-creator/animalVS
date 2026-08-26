import chokidar, { type FSWatcher } from "chokidar";
import type { ProcessingQueue } from "../processing/ProcessingQueue.js";

export class PhotoWatcher {
  private watcher: FSWatcher | null = null;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly inboxDir: string,
    private readonly queue: ProcessingQueue
  ) {}

  start(): void {
    this.watcher = chokidar.watch(this.inboxDir, {
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 1200,
        pollInterval: 150
      }
    });
    this.watcher.on("add", (filePath) => this.debounce(filePath));
    this.watcher.on("change", (filePath) => this.debounce(filePath));
  }

  async stop(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    await this.watcher?.close();
  }

  private debounce(filePath: string): void {
    const existing = this.timers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      filePath,
      setTimeout(() => {
        this.timers.delete(filePath);
        this.queue.enqueue(filePath);
      }, 250)
    );
  }
}
