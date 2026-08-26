import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import { CharacterService } from "./characters/CharacterService.js";
import { ManifestRepository } from "./characters/ManifestRepository.js";
import { loadConfig } from "./config/env.js";
import { ProcessingQueue } from "./processing/ProcessingQueue.js";
import { PhotoWatcher } from "./watcher/PhotoWatcher.js";
import { CharacterSocketServer } from "./websocket/CharacterSocketServer.js";

const config = loadConfig();

await Promise.all([
  fs.mkdir(config.inboxDir, { recursive: true }),
  fs.mkdir(config.processingDir, { recursive: true }),
  fs.mkdir(config.charactersDir, { recursive: true }),
  fs.mkdir(config.rejectedDir, { recursive: true })
]);

if (config.serveGame) {
  await fs.access(path.join(config.gameDistDir, "index.html"));
}

const manifest = new ManifestRepository(config.manifestPath);
await manifest.ensure();

const app = express();
const server = http.createServer(app);
const sockets = new CharacterSocketServer(server);
const characters = new CharacterService(manifest, config.charactersDir);
const queue = new ProcessingQueue(config, characters, sockets);
const watcher = new PhotoWatcher(config.inboxDir, queue);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 }
});

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || config.gameOrigins.includes(origin));
    }
  })
);
app.use(express.json());
app.use("/characters", express.static(config.charactersDir, { maxAge: "30s", fallthrough: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/characters", async (_req, res, next) => {
  try {
    res.json({ characters: await characters.list() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/characters/:id", async (req, res, next) => {
  try {
    const character = await characters.get(req.params.id);
    if (!character) {
      res.status(404).json({ message: "character not found" });
      return;
    }
    res.json(character);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/characters/:id", async (req, res, next) => {
  try {
    if (typeof req.body.enabled !== "boolean") {
      res.status(400).json({ message: "enabled must be a boolean" });
      return;
    }
    const result = await characters.setEnabled(req.params.id, req.body.enabled);
    if (result.status === "not-found") {
      res.status(404).json({ message: "character not found" });
      return;
    }
    if (result.status === "last-enabled") {
      res.status(409).json({ message: "At least one character must remain enabled" });
      return;
    }
    sockets.broadcast({
      type: "character.updated",
      payload: {
        characterId: result.character.id,
        enabled: result.character.enabled,
        updatedAt: new Date().toISOString()
      }
    });
    res.json(result.character);
  } catch (error) {
    next(error);
  }
});

app.post("/api/photos", upload.single("photo"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "photo is required" });
      return;
    }
    const rawName = String(req.body.name || path.parse(req.file.originalname).name || "participant");
    const safeName = rawName.replace(/[^\p{L}\p{N}_ -]+/gu, "").trim().slice(0, 60) || "participant";
    const ext = extensionFromMime(req.file.mimetype) ?? path.extname(req.file.originalname).toLowerCase() ?? ".jpg";
    const filename = `${Date.now()}-${safeName}${ext}`;
    const target = path.join(config.inboxDir, filename);
    await fs.writeFile(target, req.file.buffer);
    queue.enqueue(target);
    res.status(202).json({ status: "queued", filename });
  } catch (error) {
    next(error);
  }
});

app.get("/api/processing", (_req, res) => {
  res.json({ items: queue.status() });
});

app.delete("/api/characters/:id", async (req, res, next) => {
  try {
    const result = await characters.remove(req.params.id);
    if (result.status === "not-found") {
      res.status(404).json({ message: "character not found" });
      return;
    }
    if (result.status === "last-character" || result.status === "last-enabled") {
      res.status(409).json({ message: "Enable another character before deleting this one" });
      return;
    }
    sockets.broadcast({
      type: "character.deleted",
      payload: { characterId: req.params.id, updatedAt: new Date().toISOString() }
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/characters/rebuild", async (_req, res) => {
  res.status(202).json({ status: "not-needed", message: "manifest is updated as each character completes" });
});

if (config.serveGame) {
  app.use(express.static(config.gameDistDir, { maxAge: "1h", index: false }));
  app.get("/{*splat}", (req, res, next) => {
    if (!req.accepts("html")) {
      next();
      return;
    }
    res.sendFile(path.join(config.gameDistDir, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "internal server error";
  res.status(500).json({ message });
});

watcher.start();

server.listen(config.port, config.host, () => {
  console.log(`Human Stack Battle listening on http://${config.host}:${config.port}`);
});

process.on("SIGINT", () => {
  void watcher.stop().finally(() => server.close());
});

function extensionFromMime(mime: string): string | null {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return null;
}
