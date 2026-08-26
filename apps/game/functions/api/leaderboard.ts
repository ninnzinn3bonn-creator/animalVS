type RankingEntry = {
  id: string;
  name: string;
  height: number;
  characters: number;
  recordedAt: string;
};

const maxEntries = 10;
const maxNameLength = 24;
const maxHeight = 100_000;
const maxCharacters = 1_000;

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === "GET") {
    return json({ entries: await readRankings(context.env) });
  }
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload: unknown = await context.request.json();
    const entries = normalizeEntries(payload);
    if (entries.length === 0) {
      return json({ error: "No valid rankings supplied" }, 400);
    }
    await context.env.DB.batch(
      entries.map((entry) =>
        context.env.DB
          .prepare(
            "INSERT OR IGNORE INTO rankings (client_entry_id, name, height, characters, recorded_at) VALUES (?, ?, ?, ?, ?)"
          )
          .bind(entry.id, entry.name, entry.height, entry.characters, entry.recordedAt)
      )
    );
    return json({ entries: await readRankings(context.env) });
  } catch (error) {
    console.error("leaderboard request failed", error);
    return json({ error: "Could not save rankings" }, 500);
  }
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

async function readRankings(env: Env): Promise<RankingEntry[]> {
  const result = await env.DB
    .prepare(
      "SELECT client_entry_id, name, height, characters, recorded_at FROM rankings ORDER BY height DESC, characters DESC, recorded_at ASC, id ASC LIMIT ?"
    )
    .bind(maxEntries)
    .all<{ client_entry_id: string; name: string; height: number; characters: number; recorded_at: string }>();
  return result.results.map((row) => ({
    id: row.client_entry_id,
    name: row.name,
    height: row.height,
    characters: row.characters,
    recordedAt: row.recorded_at
  }));
}

function normalizeEntries(payload: unknown): RankingEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const entries = (payload as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set<string>();
  return entries
    .map(normalizeEntry)
    .filter((entry): entry is RankingEntry => entry !== null)
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    })
    .slice(0, maxEntries);
}

function normalizeEntry(value: unknown): RankingEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Partial<RankingEntry>;
  if (
    typeof entry.id !== "string" ||
    !/^[A-Za-z0-9_-]{8,96}$/.test(entry.id) ||
    typeof entry.name !== "string" ||
    typeof entry.height !== "number" ||
    typeof entry.characters !== "number" ||
    typeof entry.recordedAt !== "string"
  ) {
    return null;
  }
  const recordedAt = new Date(entry.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) {
    return null;
  }
  return {
    id: entry.id,
    name: entry.name.trim().slice(0, maxNameLength) || "Guest",
    height: Math.min(maxHeight, Math.max(0, Math.round(entry.height))),
    characters: Math.min(maxCharacters, Math.max(0, Math.round(entry.characters))),
    recordedAt: recordedAt.toISOString()
  };
}
