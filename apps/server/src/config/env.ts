import path from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  gameOrigins: string[];
  serveGame: boolean;
  gameDistDir: string;
  runtimeDir: string;
  inboxDir: string;
  processingDir: string;
  charactersDir: string;
  rejectedDir: string;
  manifestPath: string;
  pythonWorkerUrl: string;
  saveOriginals: boolean;
  maxUploadMb: number;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(): ServerConfig {
  const runtimeDir = path.resolve(process.env.RUNTIME_DIR ?? "runtime");
  const inboxDir = path.resolve(process.env.CHARACTER_INBOX_DIR ?? path.join(runtimeDir, "inbox"));
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 5174),
    gameOrigins: (process.env.GAME_ORIGINS ?? process.env.GAME_ORIGIN ?? "http://127.0.0.1:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    serveGame: readBoolean(process.env.SERVE_GAME, false),
    gameDistDir: path.resolve(process.env.GAME_DIST_DIR ?? "apps/game/dist"),
    runtimeDir,
    inboxDir,
    processingDir: path.join(runtimeDir, "processing"),
    charactersDir: path.join(runtimeDir, "characters"),
    rejectedDir: path.join(runtimeDir, "rejected"),
    manifestPath: path.join(runtimeDir, "manifest.json"),
    pythonWorkerUrl: process.env.PYTHON_WORKER_URL ?? "http://127.0.0.1:8788",
    saveOriginals: readBoolean(process.env.SAVE_ORIGINALS, true),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 12)
  };
}
