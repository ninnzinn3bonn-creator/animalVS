import { demoCharacters } from "./demoCharacters";
import type { CharacterDefinition } from "./CharacterTypes";
import { serviceEndpoints, type ServiceEndpoints } from "../config/services";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const preferenceKey = "human-stack-battle.character-enabled";
const deletedKey = "human-stack-battle.character-deleted";

export class CharacterRepository {
  private characters: CharacterDefinition[] = demoCharacters;
  private remoteAvailable = false;

  constructor(
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    private readonly storage: PreferenceStorage | null = getBrowserStorage(),
    private readonly endpoints: ServiceEndpoints = serviceEndpoints
  ) {}

  async load(): Promise<CharacterDefinition[]> {
    const remoteCharacters = await this.loadRemote();
    if (remoteCharacters) {
      this.remoteAvailable = true;
      const staticCharacters = await this.loadStatic();
      this.characters = this.applyLocalDeletions(
        mergeById(this.normalize(staticCharacters, false), this.normalize(remoteCharacters, true))
      );
      return this.characters;
    }

    this.remoteAvailable = false;
    const staticCharacters = await this.loadStatic();
    this.characters = this.applyLocalPreferences(
      this.applyLocalDeletions(staticCharacters.length > 0 ? this.normalize(staticCharacters, false) : demoCharacters)
    );
    return this.characters;
  }

  isRemoteAvailable(): boolean {
    return this.remoteAvailable;
  }

  getAll(): CharacterDefinition[] {
    return this.characters;
  }

  async setEnabled(id: string, enabled: boolean): Promise<CharacterDefinition> {
    if (this.remoteAvailable) {
      try {
        const response = await this.fetcher(this.endpoints.apiUrl(`/api/characters/${encodeURIComponent(id)}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled })
        });
        if (!response.ok) {
          if (response.status === 409) {
            throw new Error("少なくとも1人のキャラクターを有効にしてください");
          }
          throw new Error(`キャラクター設定の更新に失敗しました: ${response.status}`);
        }
        const updated = this.normalize([(await response.json()) as CharacterDefinition], true)[0];
        if (!updated) {
          throw new Error("キャラクター設定の更新結果が不正です");
        }
        this.characters = this.characters.map((character) => (character.id === id ? updated : character));
        return updated;
      } catch (error) {
        if (error instanceof Error && error.message === "少なくとも1人のキャラクターを有効にしてください") {
          throw error;
        }
        this.remoteAvailable = false;
      }
    }

    const current = this.characters.find((character) => character.id === id);
    if (!current) {
      throw new Error("キャラクターが見つかりません");
    }
    const enabledCount = this.characters.filter((character) => character.enabled).length;
    if (!enabled && current.enabled && enabledCount <= 1) {
      throw new Error("少なくとも1人のキャラクターを有効にしてください");
    }
    const updated = { ...current, enabled };
    this.characters = this.characters.map((character) => (character.id === id ? updated : character));
    this.saveLocalPreferences();
    return updated;
  }

  async remove(id: string): Promise<CharacterDefinition> {
    const current = this.characters.find((character) => character.id === id);
    if (!current) {
      throw new Error("キャラクターが見つかりません");
    }
    if (this.characters.length <= 1) {
      throw new Error("最後のキャラクターは削除できません");
    }
    if (current.enabled && this.characters.filter((character) => character.enabled).length <= 1) {
      throw new Error("削除する前に別のキャラクターを有効にしてください");
    }

    if (this.remoteAvailable) {
      try {
        const response = await this.fetcher(this.endpoints.apiUrl(`/api/characters/${encodeURIComponent(id)}`), {
          method: "DELETE"
        });
        if (response.status === 409) {
          throw new Error("削除する前に別のキャラクターを有効にしてください");
        }
        if (!response.ok && response.status !== 404) {
          throw new Error(`キャラクターの削除に失敗しました: ${response.status}`);
        }
      } catch (error) {
        if (error instanceof Error && !isNetworkError(error)) {
          throw error;
        }
        this.remoteAvailable = false;
      }
    }

    this.characters = this.characters.filter((character) => character.id !== id);
    this.saveDeletedId(id);
    this.saveLocalPreferences();
    return current;
  }

  random(): CharacterDefinition {
    const enabled = this.characters.filter((character) => character.enabled);
    const pool = enabled.length > 0 ? enabled : this.characters;
    const index = Math.floor(Math.random() * pool.length);
    return pool[index] ?? demoCharacters[0];
  }

  private async loadRemote(): Promise<CharacterDefinition[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await this.fetcher(this.endpoints.apiUrl("/api/characters"), {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        return null;
      }
      return ((await response.json()) as { characters?: CharacterDefinition[] }).characters ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async loadStatic(): Promise<CharacterDefinition[]> {
    try {
      const response = await this.fetcher(this.endpoints.staticCharactersUrl, { cache: "no-store" });
      if (!response.ok) {
        return [];
      }
      return ((await response.json()) as { characters?: CharacterDefinition[] }).characters ?? [];
    } catch {
      return [];
    }
  }

  private normalize(characters: CharacterDefinition[], remote: boolean): CharacterDefinition[] {
    return characters.map((character) => ({
      ...character,
      enabled: character.enabled !== false,
      spriteUrl:
        remote && character.spriteUrl.startsWith("/")
          ? this.endpoints.apiUrl(character.spriteUrl)
          : character.spriteUrl
    }));
  }

  private applyLocalPreferences(characters: CharacterDefinition[]): CharacterDefinition[] {
    try {
      const stored = JSON.parse(this.storage?.getItem(preferenceKey) ?? "{}") as Record<string, boolean>;
      const updated = characters.map((character) =>
        typeof stored[character.id] === "boolean" ? { ...character, enabled: stored[character.id] } : character
      );
      return updated.some((character) => character.enabled)
        ? updated
        : characters.map((character, index) => ({ ...character, enabled: index === 0 }));
    } catch {
      return characters;
    }
  }

  private applyLocalDeletions(characters: CharacterDefinition[]): CharacterDefinition[] {
    try {
      const deleted = new Set(JSON.parse(this.storage?.getItem(deletedKey) ?? "[]") as string[]);
      const remaining = characters.filter((character) => !deleted.has(character.id));
      return remaining.length > 0 ? remaining : characters;
    } catch {
      return characters;
    }
  }

  private saveDeletedId(id: string): void {
    try {
      const deleted = new Set(JSON.parse(this.storage?.getItem(deletedKey) ?? "[]") as string[]);
      deleted.add(id);
      this.storage?.setItem(deletedKey, JSON.stringify([...deleted]));
    } catch {
      // Local deletion records are optional; private browsing may reject storage.
    }
  }

  private saveLocalPreferences(): void {
    try {
      this.storage?.setItem(
        preferenceKey,
        JSON.stringify(Object.fromEntries(this.characters.map((character) => [character.id, character.enabled])))
      );
    } catch {
      // Local preferences are optional; private browsing may reject storage.
    }
  }
}

function mergeById(primary: CharacterDefinition[], secondary: CharacterDefinition[]): CharacterDefinition[] {
  const merged = new Map(primary.map((character) => [character.id, character]));
  for (const character of secondary) merged.set(character.id, character);
  return [...merged.values()];
}

function isNetworkError(error: Error): boolean {
  return error instanceof TypeError || error.name === "AbortError";
}

function getBrowserStorage(): PreferenceStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
