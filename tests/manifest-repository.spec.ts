import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestRepository } from "../apps/server/src/characters/ManifestRepository";
import type { CharacterDefinition } from "../apps/server/src/characters/CharacterTypes";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "hsb-manifest-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function character(id: string, sourceHash: string): CharacterDefinition {
  return {
    id,
    name: id,
    enabled: true,
    spriteUrl: `/characters/${id}/sprite.png`,
    width: 100,
    height: 200,
    collisionMode: "convexHull",
    vertices: [
      { x: -0.4, y: -0.4 },
      { x: 0.4, y: -0.4 },
      { x: 0.4, y: 0.4 },
      { x: -0.4, y: 0.4 }
    ],
    sourceHash,
    createdAt: "2026-07-15T00:00:00.000Z"
  };
}

describe("ManifestRepository", () => {
  it("creates and reads an empty manifest", async () => {
    const manifestPath = path.join(dir, "manifest.json");
    const repo = new ManifestRepository(manifestPath);
    await repo.ensure();
    await expect(repo.read()).resolves.toEqual({ characters: [] });
  });

  it("replaces duplicate source hashes", async () => {
    const repo = new ManifestRepository(path.join(dir, "manifest.json"));
    await repo.add(character("first", "same-hash"));
    await repo.add(character("second", "same-hash"));

    const manifest = await repo.read();
    expect(manifest.characters).toHaveLength(1);
    expect(manifest.characters[0]?.id).toBe("second");
    expect(await repo.hasHash("same-hash")).toBe(true);
  });

  it("writes valid JSON atomically", async () => {
    const manifestPath = path.join(dir, "manifest.json");
    const repo = new ManifestRepository(manifestPath);
    await repo.add(character("alpha", "hash-a"));

    const raw = await readFile(manifestPath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("defaults legacy characters to enabled and persists updates", async () => {
    const manifestPath = path.join(dir, "manifest.json");
    const legacy = character("legacy", "hash-legacy") as CharacterDefinition & { enabled?: boolean };
    delete legacy.enabled;
    await writeFile(manifestPath, JSON.stringify({ characters: [legacy] }), "utf8");
    const repo = new ManifestRepository(manifestPath);

    expect((await repo.read()).characters[0]?.enabled).toBe(true);
    await repo.setEnabled("legacy", false);
    expect((await repo.read()).characters[0]?.enabled).toBe(false);
  });

  it("removes a character from the manifest", async () => {
    const repo = new ManifestRepository(path.join(dir, "manifest.json"));
    await repo.add(character("one", "hash-one"));
    await repo.add(character("two", "hash-two"));

    await repo.remove("one");

    expect((await repo.read()).characters.map((item) => item.id)).toEqual(["two"]);
  });
});
