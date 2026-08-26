import type http from "node:http";
import { WebSocketServer } from "ws";

export type CharacterEvent =
  | { type: "character.processing"; payload: { filename: string; status: string } }
  | { type: "character.added"; payload: { characterId: string; updatedAt: string } }
  | { type: "character.updated"; payload: { characterId: string; enabled: boolean; updatedAt: string } }
  | { type: "character.deleted"; payload: { characterId: string; updatedAt: string } }
  | { type: "character.failed"; payload: { filename: string; message: string } };

export class CharacterSocketServer {
  private readonly wss: WebSocketServer;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
  }

  broadcast(event: CharacterEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
