import { physicsConfig } from "../config/physics";
import { platformThickness, platformWidth } from "../game/PhysicsWorld";

export const VERSUS_WORLD_WIDTH = 640;
export const VERSUS_WORLD_HEIGHT = 680;
export const VERSUS_PLATFORM_WIDTH = platformWidth(390) * 1.5;
export const VERSUS_PLATFORM_CONTROL_OVERHANG = 16;
export const VERSUS_GRAVITY_SCALE = 0.5;
export const VERSUS_GRAVITY_Y = physicsConfig.gravityY * VERSUS_GRAVITY_SCALE;
export const VERSUS_DROP_INITIAL_VELOCITY_SCALE = 2;
export const VERSUS_DROP_INITIAL_VELOCITY_Y =
  physicsConfig.dropInitialVelocityY * VERSUS_DROP_INITIAL_VELOCITY_SCALE;
export const VERSUS_PLATFORM_EDGE_RISE = 0;
export const VERSUS_PLATFORM_THICKNESS_SCALE = 1 / 3;
export const VERSUS_PLATFORM_THICKNESS = platformThickness * VERSUS_PLATFORM_THICKNESS_SCALE;
export const VERSUS_SURFACE_FRICTION_SCALE = 1.5;
export const VERSUS_PLATFORM_FRICTION = physicsConfig.platformFriction * VERSUS_SURFACE_FRICTION_SCALE;
export const VERSUS_PLATFORM_FRICTION_STATIC =
  physicsConfig.platformFrictionStatic * VERSUS_SURFACE_FRICTION_SCALE;
export const VERSUS_CHARACTER_FRICTION = physicsConfig.friction * VERSUS_SURFACE_FRICTION_SCALE;
export const VERSUS_CHARACTER_FRICTION_STATIC = physicsConfig.frictionStatic * VERSUS_SURFACE_FRICTION_SCALE;
export const VERSUS_TURN_DURATION_MS = 7_000;
export const VERSUS_START_COUNTDOWN_MS = 3_000;
export const VERSUS_LIVES = 2;
export const VERSUS_ATTACK_CHARACTER_THRESHOLD = 10;
export const VERSUS_ATTACK_SCALE = 2;
export const VERSUS_ATTACK_EARNED_MESSAGE = "１０体先取！！巨大化攻撃！！";
export const VERSUS_ATTACK_INCOMING_MESSAGE = "相手からの巨大化攻撃を受けた！！";
