import { Container } from "@cloudflare/containers";
import { z } from "zod";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ACTIVE_JOB_STATUSES = "('queued','processing','retrying')";

export class ImageProcessor extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "15m";
  enableInternet = false;
  envVars = { ALLOW_SEGMENTATION_FALLBACK: "false" };
}

const queueMessageSchema = z.object({ jobId: z.string().uuid() });
const processorResponseSchema = z.object({
  character: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    spriteUrl: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    collisionMode: z.string().min(1),
    vertices: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    sourceHash: z.string().min(16),
    createdAt: z.string().min(1)
  }),
  spriteBase64: z.string().min(1),
  maskBase64: z.string().min(1)
});

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") return corsResponse(request, env, new Response(null, { status: 204 }));

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    let response: Response;

    try {
      if (request.method === "GET" && path === "/api/health") {
        response = Response.json({ ok: true, service: "cloud-image-processing" });
      } else if (request.method === "POST" && path === "/api/capture-jobs") {
        response = await createCaptureJob(request, env);
      } else if (request.method === "GET" && path.startsWith("/api/capture-jobs/")) {
        response = await getCaptureJob(request, env, path.slice("/api/capture-jobs/".length));
      } else if (request.method === "GET" && path === "/api/characters") {
        response = await listCharacters(env);
      } else if (request.method === "PATCH" && path.startsWith("/api/characters/")) {
        if (!isAdminRequest(request, env)) return Response.json({ message: "forbidden" }, { status: 403 });
        response = await updateCharacter(request, env, path.slice("/api/characters/".length));
      } else if (request.method === "DELETE" && path.startsWith("/api/characters/")) {
        if (!isAdminRequest(request, env)) return Response.json({ message: "forbidden" }, { status: 403 });
        response = await deleteCharacter(env, path.slice("/api/characters/".length));
      } else if (request.method === "GET" && path.startsWith("/characters/")) {
        response = await serveCharacterFile(env, path);
      } else {
        response = Response.json({ message: "not found" }, { status: 404 });
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "capture_api_error", path, error: errorMessage(error) }));
      response = Response.json({ message: "画像処理サービスでエラーが発生しました" }, { status: 500 });
    }

    return corsResponse(request, env, response);
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      const parsed = queueMessageSchema.safeParse(message.body);
      if (!parsed.success) {
        console.error(JSON.stringify({ event: "invalid_capture_job", body: message.body }));
        message.ack();
        continue;
      }

      try {
        await processCaptureJob(parsed.data.jobId, env);
        message.ack();
      } catch (error) {
        const attempts = message.attempts;
        const finalAttempt = attempts >= 3;
        await env.CAPTURE_DB.prepare(
          "UPDATE capture_jobs SET status = ?, stage = ?, error_message = ?, updated_at = ? WHERE id = ?"
        ).bind(
          finalAttempt ? "failed" : "retrying",
          finalAttempt ? "failed" : "queued",
          publicError(error),
          new Date().toISOString(),
          parsed.data.jobId
        ).run();

        if (finalAttempt) message.ack();
        else message.retry({ delaySeconds: Math.min(30, attempts * 5) });
      }
    }
  }
} satisfies ExportedHandler<Env, QueueMessage>;

async function createCaptureJob(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ message: "画像は12MB以下にしてください" }, { status: 413 });
  }

  const sessionId = request.headers.get("x-capture-session") ?? "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
    return Response.json({ message: "撮影セッションを開始し直してください" }, { status: 400 });
  }

  const form = await request.formData();
  const photo = form.get("photo");
  const name = String(form.get("name") ?? "").trim();
  const turnstileToken = String(form.get("turnstileToken") ?? "");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_UPLOAD_BYTES) {
    return Response.json({ message: "12MB以下の画像を選択してください" }, { status: 422 });
  }
  if (!/^image\/(jpeg|png|webp)$/.test(photo.type)) {
    return Response.json({ message: "JPEG、PNG、WebP画像を使用してください" }, { status: 415 });
  }
  if (name.length < 1 || name.length > 80) {
    return Response.json({ message: "キャラクター名は1〜80文字で入力してください" }, { status: 422 });
  }
  if (!(await verifyTurnstile(turnstileToken, request, env))) {
    return Response.json({ message: "セキュリティ確認に失敗しました" }, { status: 403 });
  }

  const sessionHash = await sha256(sessionId);
  const active = await env.CAPTURE_DB.prepare(
    `SELECT id FROM capture_jobs WHERE session_hash = ? AND status IN ${ACTIVE_JOB_STATUSES} LIMIT 1`
  ).bind(sessionHash).first();
  if (active) return Response.json({ message: "前のキャラクターを処理中です" }, { status: 409 });

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const accessToken = randomToken();
  const extension = extensionFor(photo.type);
  const inputKey = `input/${jobId}/source.${extension}`;
  const sourceBytes = await photo.arrayBuffer();
  const sourceHash = await sha256(sourceBytes);

  await env.CAPTURE_FILES.put(inputKey, sourceBytes, {
    httpMetadata: { contentType: photo.type },
    customMetadata: { sourceHash, jobId }
  });

  try {
    await env.CAPTURE_DB.prepare(
      `INSERT INTO capture_jobs
       (id, session_hash, token_hash, character_name, input_key, status, stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 'queued', ?, ?)`
    ).bind(jobId, sessionHash, await sha256(accessToken), name, inputKey, now, now).run();
    await env.CAPTURE_QUEUE.send({ jobId });
  } catch (error) {
    await env.CAPTURE_FILES.delete(inputKey);
    throw error;
  }

  return Response.json({ jobId, jobToken: accessToken, status: "queued", stage: "queued" }, { status: 202 });
}

async function getCaptureJob(request: Request, env: Env, jobId: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ message: "not found" }, { status: 404 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const row = await env.CAPTURE_DB.prepare(
    "SELECT id, token_hash, status, stage, character_id, error_message, created_at, updated_at FROM capture_jobs WHERE id = ?"
  ).bind(jobId).first<CaptureJobRow>();
  if (!row || !token || !(await constantTimeEqual(row.token_hash, await sha256(token)))) {
    return Response.json({ message: "not found" }, { status: 404 });
  }

  return Response.json({
    jobId: row.id,
    status: row.status,
    stage: row.stage,
    characterId: row.character_id,
    error: row.status === "failed" ? row.error_message : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function processCaptureJob(jobId: string, env: Env): Promise<void> {
  const job = await env.CAPTURE_DB.prepare(
    "SELECT id, character_name, input_key, status FROM capture_jobs WHERE id = ?"
  ).bind(jobId).first<{ id: string; character_name: string; input_key: string; status: string }>();
  if (!job || job.status === "completed") return;

  const now = new Date().toISOString();
  await env.CAPTURE_DB.prepare(
    "UPDATE capture_jobs SET status = 'processing', stage = 'cutout', error_message = NULL, updated_at = ? WHERE id = ?"
  ).bind(now, jobId).run();

  const source = await env.CAPTURE_FILES.get(job.input_key);
  if (!source) throw new Error("source image is missing");
  const sourceBytes = await source.arrayBuffer();
  const sourceHash = await sha256(sourceBytes);
  const form = new FormData();
  form.set("photo", new File([sourceBytes], "source.jpg", { type: source.httpMetadata?.contentType ?? "image/jpeg" }));
  form.set("name", job.character_name);
  form.set("source_hash", sourceHash);

  const container = env.IMAGE_PROCESSOR.getByName("primary");
  await container.startAndWaitForPorts({ ports: 8080 });
  const result = await container.fetch("http://container/process-upload", { method: "POST", body: form });
  if (!result.ok) throw new Error(`processor returned ${result.status}: ${await result.text()}`);
  const parsed = processorResponseSchema.parse(await result.json());
  const character = parsed.character;
  const spriteKey = `characters/${character.id}/sprite.png`;
  const maskKey = `characters/${character.id}/mask.png`;

  await Promise.all([
    env.CAPTURE_FILES.put(spriteKey, decodeBase64(parsed.spriteBase64), { httpMetadata: { contentType: "image/png" } }),
    env.CAPTURE_FILES.put(maskKey, decodeBase64(parsed.maskBase64), { httpMetadata: { contentType: "image/png" } })
  ]);

  await env.CAPTURE_DB.batch([
    env.CAPTURE_DB.prepare(
      `INSERT OR REPLACE INTO characters
       (id, name, enabled, sprite_key, mask_key, width, height, collision_mode, vertices_json, source_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      character.id, character.name, character.enabled ? 1 : 0, spriteKey, maskKey,
      character.width, character.height, character.collisionMode,
      JSON.stringify(character.vertices), character.sourceHash, new Date().toISOString()
    ),
    env.CAPTURE_DB.prepare(
      "UPDATE capture_jobs SET status = 'completed', stage = 'completed', character_id = ?, updated_at = ? WHERE id = ?"
    ).bind(character.id, new Date().toISOString(), jobId)
  ]);
  await env.CAPTURE_FILES.delete(job.input_key);
}

async function listCharacters(env: Env): Promise<Response> {
  const { results } = await env.CAPTURE_DB.prepare(
    "SELECT id, name, enabled, width, height, collision_mode, vertices_json, source_hash, created_at FROM characters ORDER BY created_at ASC"
  ).all<CharacterRow>();
  return Response.json({
    characters: results.map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      spriteUrl: `/capture/characters/${row.id}/sprite.png`,
      width: row.width,
      height: row.height,
      collisionMode: row.collision_mode,
      vertices: JSON.parse(row.vertices_json),
      sourceHash: row.source_hash,
      createdAt: row.created_at
    }))
  });
}

async function updateCharacter(request: Request, env: Env, id: string): Promise<Response> {
  const body = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ message: "invalid request" }, { status: 422 });
  if (!body.data.enabled) {
    const count = await env.CAPTURE_DB.prepare("SELECT COUNT(*) AS count FROM characters WHERE enabled = 1").first<{ count: number }>();
    if ((count?.count ?? 0) <= 1) return Response.json({ message: "少なくとも1人を有効にしてください" }, { status: 409 });
  }
  const updated = await env.CAPTURE_DB.prepare("UPDATE characters SET enabled = ? WHERE id = ?").bind(body.data.enabled ? 1 : 0, id).run();
  if (!updated.meta.changes) return Response.json({ message: "not found" }, { status: 404 });
  const row = await env.CAPTURE_DB.prepare(
    "SELECT id, name, enabled, width, height, collision_mode, vertices_json, source_hash, created_at FROM characters WHERE id = ?"
  ).bind(id).first<CharacterRow>();
  return Response.json(characterResponse(row!));
}

async function deleteCharacter(env: Env, id: string): Promise<Response> {
  const row = await env.CAPTURE_DB.prepare("SELECT enabled, sprite_key, mask_key FROM characters WHERE id = ?")
    .bind(id).first<{ enabled: number; sprite_key: string; mask_key: string }>();
  if (!row) return new Response(null, { status: 404 });
  if (row.enabled === 1) {
    const count = await env.CAPTURE_DB.prepare("SELECT COUNT(*) AS count FROM characters WHERE enabled = 1").first<{ count: number }>();
    if ((count?.count ?? 0) <= 1) return Response.json({ message: "削除する前に別のキャラクターを有効にしてください" }, { status: 409 });
  }
  await env.CAPTURE_DB.prepare("DELETE FROM characters WHERE id = ?").bind(id).run();
  await Promise.all([env.CAPTURE_FILES.delete(row.sprite_key), env.CAPTURE_FILES.delete(row.mask_key)]);
  return new Response(null, { status: 204 });
}

function characterResponse(row: CharacterRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    spriteUrl: `/capture/characters/${row.id}/sprite.png`,
    width: row.width,
    height: row.height,
    collisionMode: row.collision_mode,
    vertices: JSON.parse(row.vertices_json),
    sourceHash: row.source_hash,
    createdAt: row.created_at
  };
}

async function serveCharacterFile(env: Env, path: string): Promise<Response> {
  const match = /^\/characters\/([^/]+)\/(sprite|mask)\.png$/.exec(path);
  if (!match) return Response.json({ message: "not found" }, { status: 404 });
  const key = `characters/${match[1]}/${match[2]}.png`;
  const object = await env.CAPTURE_FILES.get(key);
  if (!object) return Response.json({ message: "not found" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function verifyTurnstile(token: string, request: Request, env: Env): Promise<boolean> {
  const secrets = env as Env & { TURNSTILE_SECRET?: string };
  if (String(env.TURNSTILE_REQUIRED) !== "true") return true;
  if (!secrets.TURNSTILE_SECRET || !token) return false;
  const form = new FormData();
  form.set("secret", secrets.TURNSTILE_SECRET);
  form.set("response", token);
  const remoteIp = request.headers.get("cf-connecting-ip");
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = await response.json<TurnstileResult>();
  return result.success && (!env.TURNSTILE_HOSTNAME || result.hostname === env.TURNSTILE_HOSTNAME);
}

function normalizePath(path: string): string {
  return path.startsWith("/capture/") ? path.slice("/capture".length) : path;
}

function isAdminRequest(request: Request, env: Env): boolean {
  const secrets = env as Env & { ADMIN_TOKEN?: string };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(secrets.ADMIN_TOKEN && token && token === secrets.ADMIN_TOKEN);
}

function corsResponse(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("origin");
  if (origin && origin === env.ALLOWED_ORIGIN) {
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("vary", "origin");
    response.headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.headers.set("access-control-allow-headers", "authorization,content-type,x-capture-session");
  }
  return response;
}

function extensionFor(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicError(error: unknown): string {
  console.error(JSON.stringify({ event: "capture_job_failed", error: errorMessage(error) }));
  return "キャラクター生成に失敗しました。別の写真でやり直してください";
}

interface QueueMessage { jobId: string }
interface CaptureJobRow {
  id: string;
  token_hash: string;
  status: string;
  stage: string;
  character_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
interface CharacterRow {
  id: string;
  name: string;
  enabled: number;
  width: number;
  height: number;
  collision_mode: string;
  vertices_json: string;
  source_hash: string;
  created_at: string;
}
interface TurnstileResult { success: boolean; hostname?: string }
