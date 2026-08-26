import Matter from "matter-js";
import { physicsConfig } from "../config/physics";

export interface PhysicsWorldOptions {
  platformWidth?: number;
  platformEdgeRise?: number;
  platformThickness?: number;
  platformFriction?: number;
  platformFrictionStatic?: number;
  gravityY?: number;
}

export interface PlatformOptions {
  width?: number;
  edgeRise?: number;
  thickness?: number;
  friction?: number;
  frictionStatic?: number;
}

export class PhysicsWorld {
  readonly engine: Matter.Engine;
  readonly render: Matter.Render;
  readonly runner: Matter.Runner;
  readonly platform: Matter.Body;
  readonly loseSensor: Matter.Body;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    options: PhysicsWorldOptions = {}
  ) {
    this.engine = Matter.Engine.create();
    this.engine.gravity.y = options.gravityY ?? physicsConfig.gravityY;

    this.platform = createPlatform(width, height, {
      width: options.platformWidth,
      edgeRise: options.platformEdgeRise,
      thickness: options.platformThickness,
      friction: options.platformFriction,
      frictionStatic: options.platformFrictionStatic
    });

    this.loseSensor = Matter.Bodies.rectangle(width / 2, height - 18, width * 5, 36, {
      isStatic: true,
      isSensor: true,
      label: "lose-sensor",
      render: { fillStyle: "rgba(255, 59, 48, 0.2)" }
    });

    Matter.Composite.add(this.engine.world, [this.platform, this.loseSensor]);

    this.render = Matter.Render.create({
      canvas,
      engine: this.engine,
      options: {
        width,
        height,
        background: "transparent",
        wireframes: false,
        pixelRatio: window.devicePixelRatio
      }
    });
    this.runner = Matter.Runner.create();
  }

  start(): void {
    Matter.Render.run(this.render);
    Matter.Runner.run(this.runner, this.engine);
  }

  stop(): void {
    Matter.Render.stop(this.render);
    Matter.Runner.stop(this.runner);
  }

  add(body: Matter.Body): void {
    Matter.Composite.add(this.engine.world, body);
  }

  remove(body: Matter.Body): void {
    Matter.Composite.remove(this.engine.world, body);
  }

  resetDynamicBodies(): void {
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.label.startsWith("character:")) {
        Matter.Composite.remove(this.engine.world, body);
      }
    }
  }

  stackHeight(): number {
    return calculateSettledStackHeight(
      Matter.Composite.allBodies(this.engine.world),
      platformCenterSurfaceY(this.height)
    );
  }

  settledCharacterCount(): number {
    return Matter.Composite.allBodies(this.engine.world).filter(isSettledCharacter).length;
  }

  hasDroppedCharacterOutOfBounds(margin = 24): boolean {
    return this.droppedCharacterOutOfBounds(margin) !== null;
  }

  droppedCharacterOutOfBounds(margin = 24): Matter.Body | null {
    return (
      Matter.Composite.allBodies(this.engine.world).find((body) =>
        isDroppedCharacterOutOfBounds(body, this.width, this.height, margin)
      ) ?? null
    );
  }
}

export function calculateSettledStackHeight(bodies: Matter.Body[], platformTop: number): number {
  const characters = bodies.filter(isSettledCharacter);
  if (characters.length === 0) {
    return 0;
  }
  const highestY = Math.min(...characters.map((body) => body.bounds.min.y));
  return Math.max(0, Math.round(platformTop - highestY));
}

export function isSettledCharacter(body: Matter.Body): boolean {
  const state = body.plugin as { dropped?: boolean; settled?: boolean };
  return body.label.startsWith("character:") && state.dropped === true && state.settled === true;
}

export function createPlatform(
  width: number,
  height: number,
  options: PlatformOptions = {}
): Matter.Body {
  const requestedWidth = options.width ?? platformWidth(width);
  const edgeRise = options.edgeRise ?? platformEdgeRise;
  const thickness = options.thickness ?? platformThickness;
  const friction = options.friction ?? physicsConfig.platformFriction;
  const frictionStatic = options.frictionStatic ?? physicsConfig.platformFrictionStatic;
  const bowlWidth = Math.min(width - 24, requestedWidth);
  const halfWidth = bowlWidth / 2;
  const centerX = width / 2;
  const bottomY = platformCenterSurfaceY(height) + thickness;
  const parts = Array.from({ length: platformSegmentCount }, (_, index) => {
    const leftOffset = -halfWidth + (bowlWidth * index) / platformSegmentCount;
    const rightOffset = -halfWidth + (bowlWidth * (index + 1)) / platformSegmentCount;
    return createPlatformSegment(
      centerX + leftOffset,
      centerX + rightOffset,
      platformSurfaceY(leftOffset, bowlWidth, height, edgeRise),
      platformSurfaceY(rightOffset, bowlWidth, height, edgeRise),
      bottomY
    );
  });

  const platform = Matter.Body.create({
    parts,
    isStatic: true,
    label: "platform",
    friction,
    frictionStatic,
    render: { fillStyle: "#3a3a3c" }
  });
  for (const part of platform.parts) {
    part.label = "platform";
    part.friction = friction;
    part.frictionStatic = frictionStatic;
  }
  return platform;
}

const platformSegmentCount = 12;
export const platformThickness = 28;
const platformEdgeRise = 8;

export function platformWidth(worldWidth: number): number {
  return Math.min(480, worldWidth * 0.56);
}

export function platformCenterSurfaceY(worldHeight: number): number {
  return worldHeight - 106;
}

export function platformSurfaceY(
  offsetX: number,
  bowlWidth: number,
  worldHeight: number,
  edgeRise = platformEdgeRise
): number {
  const normalized = Math.min(1, Math.abs(offsetX) / (bowlWidth / 2));
  return platformCenterSurfaceY(worldHeight) - edgeRise * normalized * normalized;
}

function createPlatformSegment(
  leftX: number,
  rightX: number,
  leftTopY: number,
  rightTopY: number,
  bottomY: number
): Matter.Body {
  const segmentWidth = rightX - leftX;
  const body = Matter.Bodies.fromVertices(
    0,
    0,
    [[
      { x: 0, y: leftTopY - bottomY },
      { x: segmentWidth, y: rightTopY - bottomY },
      { x: segmentWidth, y: 0 },
      { x: 0, y: 0 }
    ]],
    {
      isStatic: true,
      label: "platform",
      friction: physicsConfig.platformFriction,
      frictionStatic: physicsConfig.platformFrictionStatic,
      render: { fillStyle: "#3a3a3c", strokeStyle: "#3a3a3c", lineWidth: 1 }
    },
    true
  );
  Matter.Body.translate(body, {
    x: leftX - body.bounds.min.x,
    y: bottomY - body.bounds.max.y
  });
  return body;
}

export function isDroppedCharacterOutOfBounds(
  body: Matter.Body,
  width: number,
  height: number,
  margin = 24
): boolean {
  const dropped = body.label.startsWith("character:") && (body.plugin as { dropped?: boolean }).dropped;
  if (!dropped) {
    return false;
  }
  return (
    body.bounds.max.x < -margin ||
    body.bounds.min.x > width + margin ||
    body.bounds.min.y > height + margin
  );
}
