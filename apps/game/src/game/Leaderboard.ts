export interface LeaderboardEntry {
  id: string;
  name: string;
  height: number;
  characters: number;
  recordedAt: string;
}

const storageKey = "human-stack-battle:leaderboard";
const maxEntries = 10;

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeStoredEntry)
      .filter((entry): entry is LeaderboardEntry => entry !== null)
      .sort(compareEntries)
      .slice(0, maxEntries);
  } catch {
    return [];
  }
}

export function recordLeaderboardEntry(name: string, height: number, characters: number): LeaderboardEntry[] {
  const entry: LeaderboardEntry = {
    id: `score_${crypto.randomUUID().replaceAll("-", "")}`,
    name: name.trim().slice(0, 24) || "\u30b2\u30b9\u30c8",
    height: Math.max(0, Math.round(height)),
    characters: Math.max(0, Math.round(characters)),
    recordedAt: new Date().toISOString()
  };
  const entries = [...loadLeaderboard(), entry].sort(compareEntries).slice(0, maxEntries);
  saveLeaderboard(entries);
  return entries;
}

export async function syncLeaderboard(): Promise<LeaderboardEntry[]> {
  const localEntries = loadLeaderboard();
  const response = localEntries.length
    ? await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: localEntries })
      })
    : await fetch("/api/leaderboard", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Leaderboard request failed: ${response.status}`);
  }
  const payload: unknown = await response.json();
  const entries = payload && typeof payload === "object" ? (payload as { entries?: unknown }).entries : undefined;
  if (!Array.isArray(entries)) {
    throw new Error("Leaderboard response was invalid");
  }
  return entries
    .map(normalizeStoredEntry)
    .filter((entry): entry is LeaderboardEntry => entry !== null)
    .sort(compareEntries)
    .slice(0, maxEntries);
}

function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function normalizeStoredEntry(value: unknown): LeaderboardEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Partial<LeaderboardEntry>;
  if (
    typeof entry.name !== "string" ||
    typeof entry.height !== "number" ||
    !Number.isFinite(entry.height) ||
    (entry.characters !== undefined && (typeof entry.characters !== "number" || !Number.isFinite(entry.characters))) ||
    (entry.recordedAt !== undefined && typeof entry.recordedAt !== "string")
  ) {
    return null;
  }
  const characters = Math.max(0, Math.round(entry.characters ?? 0));
  const recordedAt = validDate(entry.recordedAt) ? entry.recordedAt : new Date(0).toISOString();
  const id = validEntryId(entry.id) ? entry.id : legacyEntryId(entry.name, entry.height, characters, recordedAt);
  return {
    id,
    name: entry.name.trim().slice(0, 24) || "\u30b2\u30b9\u30c8",
    height: Math.max(0, Math.round(entry.height)),
    characters,
    recordedAt
  };
}

function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.height - left.height || right.characters - left.characters || left.recordedAt.localeCompare(right.recordedAt);
}

function validEntryId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function legacyEntryId(name: string, height: number, characters: number, recordedAt: string): string {
  const value = `${name}|${height}|${characters}|${recordedAt}`;
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `legacy_${(first >>> 0).toString(36)}_${(second >>> 0).toString(36)}`;
}
