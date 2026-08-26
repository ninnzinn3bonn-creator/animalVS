import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CharacterService } from "../apps/server/src/characters/CharacterService";
import { ManifestRepository } from "../apps/server/src/characters/ManifestRepository";
import type { CharacterDefinition } from "../apps/server/src/characters/CharacterTypes";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "hsb-character-service-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function character(id: string, enabled = true): CharacterDefinition {
  return {
    id,
    name: id,
    enabled,
    spriteUrl: `/characters/${id}/sprite.png`,
    width: 100,
    height: 200,
    collisionMode: "box",
    vertices: [
      { x: -0.4, y: -0.4 },
      { x: 0.4, y: -0.4 },
      { x: 0.4, y: 0.4 },
      { x: -0.4, y: 0.4 }
    ],
    sourceHash: `hash-${id}`,
    createdAt: "2026-07-16T00:00:00.000Z"
  };
}

async function createService(characters: CharacterDefinition[]): Promise<CharacterService> {
  const charactersDir = path.join(dir, "characters");
  const manifest = new ManifestRepository(path.join(dir, "manifest.json"));
  await mkdir(charactersDir, { recursive: true });
  for (const item of characters) {
    await manifest.add(item);
    await mkdir(path.join(charactersDir, item.id), { recursive: true });
  }
  return new CharacterService(manifest, charactersDir);
}

describe("CharacterService removal", () => {
  it("removes a character while another enabled character remains", async () => {
    const service = await createService([character("one"), character("two")]);

    await expect(service.remove("two")).resolves.toEqual({ status: "removed" });
    await expect(service.list()).resolves.toEqual([expect.objectContaining({ id: "one" })]);
  });

  it("protects the last enabled character", async () => {
    const service = await createService([character("one"), character("two", false)]);

    await expect(service.remove("one")).resolves.toEqual({ status: "last-enabled" });
    await expect(service.list()).resolves.toHaveLength(2);
  });
});
