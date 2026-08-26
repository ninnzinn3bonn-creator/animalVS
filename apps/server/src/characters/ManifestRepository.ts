import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CharacterDefinition, CharacterManifest } from "./CharacterTypes.js";

const vertexSchema = z.object({ x: z.number(), y: z.number() });
const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  spriteUrl: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  collisionMode: z.enum(["convexHull", "capsule", "box"]),
  vertices: z.array(vertexSchema).min(3),
  sourceHash: z.string().optional(),
  createdAt: z.string()
});
const manifestSchema = z.object({ characters: z.array(characterSchema) });

export class ManifestRepository {
  constructor(private readonly manifestPath: string) {}

  async ensure(): Promise<void> {
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    try {
      await fs.access(this.manifestPath);
    } catch {
      await this.write({ characters: [] });
    }
  }

  async read(): Promise<CharacterManifest> {
    await this.ensure();
    const raw = await fs.readFile(this.manifestPath, "utf8");
    return manifestSchema.parse(JSON.parse(raw));
  }

  async add(character: CharacterDefinition): Promise<CharacterManifest> {
    const manifest = await this.read();
    const filtered = manifest.characters.filter((item) => item.id !== character.id && item.sourceHash !== character.sourceHash);
    const next = {
      characters: [...filtered, character].sort((a, b) => a.name.localeCompare(b.name))
    };
    await this.write(next);
    return next;
  }

  async remove(id: string): Promise<CharacterManifest> {
    const manifest = await this.read();
    const next = { characters: manifest.characters.filter((item) => item.id !== id) };
    await this.write(next);
    return next;
  }

  async setEnabled(id: string, enabled: boolean): Promise<CharacterDefinition | null> {
    const manifest = await this.read();
    const character = manifest.characters.find((item) => item.id === id);
    if (!character) {
      return null;
    }
    const updated = { ...character, enabled };
    await this.write({
      characters: manifest.characters.map((item) => (item.id === id ? updated : item))
    });
    return updated;
  }

  async hasHash(sourceHash: string): Promise<boolean> {
    const manifest = await this.read();
    return manifest.characters.some((item) => item.sourceHash === sourceHash);
  }

  private async write(manifest: CharacterManifest): Promise<void> {
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    const tmp = `${this.manifestPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.manifestPath);
  }
}
