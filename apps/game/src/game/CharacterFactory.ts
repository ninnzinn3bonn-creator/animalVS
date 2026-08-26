import Matter from "matter-js";
import type { CharacterDefinition } from "../character/CharacterTypes";
import { physicsConfig } from "../config/physics";

export interface CharacterBody {
  body: Matter.Body;
  definition: CharacterDefinition;
}

export interface CharacterPhysicsOptions {
  friction?: number;
  frictionStatic?: number;
}

export class CharacterFactory {
  create(
    definition: CharacterDefinition,
    x: number,
    y: number,
    worldWidth: number,
    scaleMultiplier = 1,
    physics: CharacterPhysicsOptions = {}
  ): CharacterBody {
    const scale = this.computeScale(definition, worldWidth) * scaleMultiplier;
    const width = definition.width * scale;
    const height = definition.height * scale;
    const vertices = this.toVertices(definition, width, height);
    const friction = physics.friction ?? physicsConfig.friction;
    const frictionStatic = physics.frictionStatic ?? physicsConfig.frictionStatic;
    const body = Matter.Bodies.fromVertices(x, y, [vertices], {
      restitution: physicsConfig.restitution,
      friction,
      frictionStatic,
      frictionAir: physicsConfig.frictionAir,
      density: physicsConfig.density,
      render: {
        sprite: {
          texture: definition.spriteUrl,
          xScale: scale,
          yScale: scale
        }
      }
    });

    Matter.Body.set(body, {
      label: `character:${definition.id}`
    });
    for (const part of body.parts) {
      part.friction = friction;
      part.frictionStatic = frictionStatic;
    }
    body.plugin = { definitionId: definition.id, droppedAt: 0, dropped: false, settled: false };
    return { body, definition };
  }

  private computeScale(definition: CharacterDefinition, worldWidth: number): number {
    const baseScale = physicsConfig.characterBaseHeight / definition.height;
    const maxWidth = worldWidth * physicsConfig.maxCharacterWidthRatio;
    return Math.min(baseScale, maxWidth / definition.width);
  }

  private toVertices(definition: CharacterDefinition, width: number, height: number): Matter.Vector[] {
    if (definition.vertices.length < 3) {
      return [
        { x: -width * 0.42, y: -height * 0.45 },
        { x: width * 0.42, y: -height * 0.45 },
        { x: width * 0.42, y: height * 0.45 },
        { x: -width * 0.42, y: height * 0.45 }
      ];
    }
    return definition.vertices.map((vertex) => ({
      x: vertex.x * width,
      y: vertex.y * height
    }));
  }
}
