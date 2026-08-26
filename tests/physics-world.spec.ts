import Matter from "matter-js";
import { describe, expect, it } from "vitest";
import { physicsConfig } from "../apps/game/src/config/physics";
import {
  calculateSettledStackHeight,
  createPlatform,
  isDroppedCharacterOutOfBounds,
  platformCenterSurfaceY,
  platformSurfaceY,
  platformThickness,
  platformWidth
} from "../apps/game/src/game/PhysicsWorld";
import {
  VERSUS_GRAVITY_SCALE,
  VERSUS_GRAVITY_Y,
  VERSUS_PLATFORM_EDGE_RISE,
  VERSUS_PLATFORM_FRICTION,
  VERSUS_PLATFORM_FRICTION_STATIC,
  VERSUS_PLATFORM_THICKNESS,
  VERSUS_PLATFORM_THICKNESS_SCALE,
  VERSUS_PLATFORM_WIDTH,
  VERSUS_SURFACE_FRICTION_SCALE,
  VERSUS_WORLD_HEIGHT,
  VERSUS_WORLD_WIDTH
} from "../apps/game/src/versus/VersusConfig";

function character(x: number, y: number, dropped = true): Matter.Body {
  const body = Matter.Bodies.rectangle(x, y, 40, 80, { label: "character:test" });
  body.plugin = { dropped };
  return body;
}

describe("isDroppedCharacterOutOfBounds", () => {
  it("detects dropped characters beyond the left, right, and bottom edges", () => {
    expect(isDroppedCharacterOutOfBounds(character(-60, 300), 390, 680)).toBe(true);
    expect(isDroppedCharacterOutOfBounds(character(450, 300), 390, 680)).toBe(true);
    expect(isDroppedCharacterOutOfBounds(character(195, 760), 390, 680)).toBe(true);
  });

  it("ignores visible and not-yet-dropped characters", () => {
    expect(isDroppedCharacterOutOfBounds(character(40, 300), 390, 680)).toBe(false);
    expect(isDroppedCharacterOutOfBounds(character(-60, 300, false), 390, 680)).toBe(false);
  });
});

describe("platform friction", () => {
  it("uses friction values increased by 50 percent from the previous settings", () => {
    const platform = createPlatform(390, 680);

    expect(platform.friction).toBeCloseTo(1.2 * 1.5);
    expect(platform.frictionStatic).toBeCloseTo(0.6 * 1.5);
  });

  it("uses higher friction only for the versus platform", () => {
    const platform = createPlatform(VERSUS_WORLD_WIDTH, VERSUS_WORLD_HEIGHT, {
      friction: VERSUS_PLATFORM_FRICTION,
      frictionStatic: VERSUS_PLATFORM_FRICTION_STATIC
    });

    expect(VERSUS_SURFACE_FRICTION_SCALE).toBe(1.5);
    expect(platform.friction).toBeCloseTo(physicsConfig.platformFriction * 1.5);
    expect(platform.frictionStatic).toBeCloseTo(physicsConfig.platformFrictionStatic * 1.5);
  });
});

describe("bowl platform", () => {
  it("keeps the existing width and raises both edges gently", () => {
    const worldWidth = 390;
    const worldHeight = 680;
    const width = platformWidth(worldWidth);
    const platform = createPlatform(worldWidth, worldHeight);

    expect(platform.bounds.max.x - platform.bounds.min.x).toBeCloseTo(width);
    expect(platformSurfaceY(0, width, worldHeight)).toBe(platformCenterSurfaceY(worldHeight));
    expect(platformSurfaceY(-width / 2, width, worldHeight)).toBe(platformCenterSurfaceY(worldHeight) - 8);
    expect(platformSurfaceY(width / 2, width, worldHeight)).toBe(platformCenterSurfaceY(worldHeight) - 8);
    expect(platform.parts.length).toBe(13);
  });

  it("uses a platform exactly 1.5 times wider in the versus world", () => {
    const soloWidth = platformWidth(390);
    const versusPlatform = createPlatform(VERSUS_WORLD_WIDTH, VERSUS_WORLD_HEIGHT, {
      width: VERSUS_PLATFORM_WIDTH
    });

    expect(VERSUS_PLATFORM_WIDTH).toBeCloseTo(soloWidth * 1.5);
    expect(versusPlatform.bounds.max.x - versusPlatform.bounds.min.x).toBeCloseTo(soloWidth * 1.5);
    expect((versusPlatform.bounds.min.x + versusPlatform.bounds.max.x) / 2).toBeCloseTo(VERSUS_WORLD_WIDTH / 2);
  });

  it("uses fifty percent gravity and a flat platform only for versus", () => {
    expect(VERSUS_GRAVITY_SCALE).toBe(0.5);
    expect(VERSUS_GRAVITY_Y).toBeCloseTo(physicsConfig.gravityY * VERSUS_GRAVITY_SCALE);
    expect(VERSUS_PLATFORM_EDGE_RISE).toBe(0);
    expect(
      platformSurfaceY(-VERSUS_PLATFORM_WIDTH / 2, VERSUS_PLATFORM_WIDTH, VERSUS_WORLD_HEIGHT, VERSUS_PLATFORM_EDGE_RISE)
    ).toBe(platformCenterSurfaceY(VERSUS_WORLD_HEIGHT));
    expect(
      platformSurfaceY(VERSUS_PLATFORM_WIDTH / 2, VERSUS_PLATFORM_WIDTH, VERSUS_WORLD_HEIGHT, VERSUS_PLATFORM_EDGE_RISE)
    ).toBe(platformCenterSurfaceY(VERSUS_WORLD_HEIGHT));
    expect(platformSurfaceY(platformWidth(390) / 2, platformWidth(390), 680)).toBe(
      platformCenterSurfaceY(680) - 8
    );
  });

  it("uses one-third platform thickness only for versus", () => {
    const versusPlatform = createPlatform(VERSUS_WORLD_WIDTH, VERSUS_WORLD_HEIGHT, {
      width: VERSUS_PLATFORM_WIDTH,
      edgeRise: VERSUS_PLATFORM_EDGE_RISE,
      thickness: VERSUS_PLATFORM_THICKNESS
    });

    expect(VERSUS_PLATFORM_THICKNESS_SCALE).toBeCloseTo(1 / 3);
    expect(VERSUS_PLATFORM_THICKNESS).toBeCloseTo(platformThickness / 3);
    expect(versusPlatform.bounds.max.y - versusPlatform.bounds.min.y).toBeCloseTo(VERSUS_PLATFORM_THICKNESS);
  });
});

describe("final stack height", () => {
  it("excludes a character that is still falling when time expires", () => {
    const settled = character(195, 534);
    settled.plugin = { dropped: true, settled: true };
    const falling = character(195, 150);
    falling.plugin = { dropped: true, settled: false };

    expect(calculateSettledStackHeight([settled, falling], 574)).toBe(80);
  });

  it("returns zero when no character has settled", () => {
    const falling = character(195, 150);
    falling.plugin = { dropped: true, settled: false };

    expect(calculateSettledStackHeight([falling], 574)).toBe(0);
  });
});
