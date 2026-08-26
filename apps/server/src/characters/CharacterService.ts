import { promises as fs } from "node:fs";
import path from "node:path";
import type { CharacterDefinition } from "./CharacterTypes.js";
import { ManifestRepository } from "./ManifestRepository.js";

export class CharacterService {
  constructor(
    private readonly manifest: ManifestRepository,
    private readonly charactersDir: string
  ) {}

  async list(): Promise<CharacterDefinition[]> {
    return (await this.manifest.read()).characters;
  }

  async get(id: string): Promise<CharacterDefinition | null> {
    return (await this.list()).find((character) => character.id === id) ?? null;
  }

  async register(character: CharacterDefinition): Promise<void> {
    await this.manifest.add(character);
  }

  async remove(
    id: string
  ): Promise<{ status: "removed" } | { status: "not-found" } | { status: "last-character" } | { status: "last-enabled" }> {
    const all = await this.list();
    const existing = all.find((character) => character.id === id);
    if (!existing) {
      return { status: "not-found" };
    }
    if (all.length <= 1) {
      return { status: "last-character" };
    }
    if (existing.enabled && all.filter((character) => character.enabled).length <= 1) {
      return { status: "last-enabled" };
    }
    await this.manifest.remove(id);
    await fs.rm(path.join(this.charactersDir, id), { recursive: true, force: true });
    return { status: "removed" };
  }

  async setEnabled(
    id: string,
    enabled: boolean
  ): Promise<
    | { status: "updated"; character: CharacterDefinition }
    | { status: "not-found" }
    | { status: "last-enabled" }
  > {
    const all = await this.list();
    const existing = all.find((character) => character.id === id);
    if (!existing) {
      return { status: "not-found" };
    }
    const enabledCount = all.filter((character) => character.enabled).length;
    if (!enabled && existing.enabled && enabledCount <= 1) {
      return { status: "last-enabled" };
    }
    const character = await this.manifest.setEnabled(id, enabled);
    return character ? { status: "updated", character } : { status: "not-found" };
  }

  async hasHash(hash: string): Promise<boolean> {
    return this.manifest.hasHash(hash);
  }
}
