import { z } from "zod";
import type { ServerConfig } from "../config/env.js";
import type { CharacterDefinition } from "../characters/CharacterTypes.js";

const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  spriteUrl: z.string(),
  width: z.number(),
  height: z.number(),
  collisionMode: z.enum(["convexHull", "capsule", "box"]),
  vertices: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
  sourceHash: z.string().optional(),
  createdAt: z.string()
});

export interface ProcessRequest {
  sourcePath: string;
  name: string;
  sourceHash: string;
}

export class PythonWorkerClient {
  constructor(private readonly config: ServerConfig) {}

  async process(request: ProcessRequest): Promise<CharacterDefinition> {
    const response = await fetch(`${this.config.pythonWorkerUrl}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        charactersDir: this.config.charactersDir,
        saveOriginal: this.config.saveOriginals
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Python worker failed with ${response.status}`);
    }
    return characterSchema.parse(await response.json());
  }
}
