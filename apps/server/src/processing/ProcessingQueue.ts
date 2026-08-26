import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { CharacterService } from "../characters/CharacterService.js";
import type { ServerConfig } from "../config/env.js";
import type { CharacterSocketServer } from "../websocket/CharacterSocketServer.js";
import { sha256File } from "./hash.js";
import { PythonWorkerClient } from "./PythonWorkerClient.js";

export type ProcessingStatus = "queued" | "processing" | "completed" | "rejected" | "failed";

export interface ProcessingRecord {
  filename: string;
  status: ProcessingStatus;
  message?: string;
  updatedAt: string;
}

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export class ProcessingQueue {
  private readonly records = new Map<string, ProcessingRecord>();
  private readonly queued = new Set<string>();
  private running = false;
  private readonly worker: PythonWorkerClient;

  constructor(
    private readonly config: ServerConfig,
    private readonly characters: CharacterService,
    private readonly socket: CharacterSocketServer
  ) {
    this.worker = new PythonWorkerClient(config);
  }

  status(): ProcessingRecord[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  enqueue(filePath: string): void {
    const absolute = path.resolve(filePath);
    if (!supportedExtensions.has(path.extname(absolute).toLowerCase())) {
      return;
    }
    if (this.queued.has(absolute)) {
      return;
    }
    this.queued.add(absolute);
    this.setRecord(absolute, "queued");
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (this.queued.size > 0) {
        const [filePath] = this.queued;
        this.queued.delete(filePath);
        await this.processOne(filePath);
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(filePath: string): Promise<void> {
    const filename = path.basename(filePath);
    try {
      this.setRecord(filePath, "processing");
      this.socket.broadcast({ type: "character.processing", payload: { filename, status: "processing" } });
      await this.validateImage(filePath);
      const hash = await sha256File(filePath);
      if (await this.characters.hasHash(hash)) {
        this.setRecord(filePath, "completed", "duplicate ignored");
        return;
      }
      const name = this.nameFromFilename(filePath);
      const character = await this.worker.process({ sourcePath: filePath, name, sourceHash: hash });
      await this.characters.register(character);
      this.setRecord(filePath, "completed");
      this.socket.broadcast({
        type: "character.added",
        payload: { characterId: character.id, updatedAt: new Date().toISOString() }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.setRecord(filePath, "failed", message);
      this.socket.broadcast({ type: "character.failed", payload: { filename, message } });
      await this.moveRejected(filePath);
    }
  }

  private async validateImage(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    if (stat.size > this.config.maxUploadMb * 1024 * 1024) {
      throw new Error(`file exceeds ${this.config.maxUploadMb}MB`);
    }
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("image dimensions missing");
    }
  }

  private async moveRejected(filePath: string): Promise<void> {
    try {
      await fs.mkdir(this.config.rejectedDir, { recursive: true });
      const target = path.join(this.config.rejectedDir, `${Date.now()}-${path.basename(filePath)}`);
      await fs.rename(filePath, target);
    } catch {
      // Keep processing resilient; the original file may have been deleted by the user.
    }
  }

  private nameFromFilename(filePath: string): string {
    return path
      .basename(filePath, path.extname(filePath))
      .replace(/[^\p{L}\p{N}_ -]+/gu, "")
      .trim()
      .slice(0, 60) || "participant";
  }

  private setRecord(filePath: string, status: ProcessingStatus, message?: string): void {
    this.records.set(filePath, {
      filename: path.basename(filePath),
      status,
      message,
      updatedAt: new Date().toISOString()
    });
  }
}
