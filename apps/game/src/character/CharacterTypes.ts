export type CollisionMode = "convexHull" | "capsule" | "box";

export interface CharacterVertex {
  x: number;
  y: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  enabled: boolean;
  spriteUrl: string;
  width: number;
  height: number;
  collisionMode: CollisionMode;
  vertices: CharacterVertex[];
  sourceHash?: string;
  createdAt: string;
}

export interface CharacterManifest {
  characters: CharacterDefinition[];
}
