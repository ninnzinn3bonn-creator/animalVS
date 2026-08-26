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
  collisionMode: "convexHull" | "capsule" | "box";
  vertices: CharacterVertex[];
  sourceHash?: string;
  createdAt: string;
}

export interface CharacterManifest {
  characters: CharacterDefinition[];
}
