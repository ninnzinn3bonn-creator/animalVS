import Matter from "matter-js";
import { physicsConfig } from "../config/physics";
import type { PlayerId } from "./TurnManager";

export class LoseDetector {
  private contacts = new Map<number, number>();

  constructor(private readonly loseSensor: Matter.Body) {}

  attach(engine: Matter.Engine, onLose: (loser: PlayerId, character: Matter.Body) => void): void {
    Matter.Events.on(engine, "collisionActive", (event) => {
      const now = performance.now();
      for (const pair of event.pairs) {
        const character = this.getCharacterContact(pair.bodyA, pair.bodyB);
        if (!character) {
          continue;
        }
        const droppedBy = (character.plugin as { player?: PlayerId }).player;
        if (!droppedBy) {
          continue;
        }
        const firstContact = this.contacts.get(character.id) ?? now;
        this.contacts.set(character.id, firstContact);
        if (now - firstContact >= physicsConfig.loseContactMs) {
          onLose(droppedBy, character);
        }
      }
    });
    Matter.Events.on(engine, "collisionEnd", (event) => {
      for (const pair of event.pairs) {
        const character = this.getCharacterContact(pair.bodyA, pair.bodyB);
        if (character) {
          this.contacts.delete(character.id);
        }
      }
    });
  }

  reset(): void {
    this.contacts.clear();
  }

  private getCharacterContact(bodyA: Matter.Body, bodyB: Matter.Body): Matter.Body | null {
    if (bodyA === this.loseSensor && bodyB.label.startsWith("character:")) {
      return bodyB;
    }
    if (bodyB === this.loseSensor && bodyA.label.startsWith("character:")) {
      return bodyA;
    }
    return null;
  }
}
