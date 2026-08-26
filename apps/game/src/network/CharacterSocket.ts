type CharacterSocketMessage =
  | { type: "character.processing"; payload: { filename: string; status: string } }
  | { type: "character.added"; payload: { characterId: string; updatedAt: string } }
  | { type: "character.updated"; payload: { characterId: string; enabled: boolean; updatedAt: string } }
  | { type: "character.deleted"; payload: { characterId: string; updatedAt: string } }
  | { type: "character.failed"; payload: { filename: string; message: string } };

export class CharacterSocket {
  private socket: WebSocket | null = null;
  private retryMs = 1000;

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: CharacterSocketMessage) => void,
    private readonly onConnectionChange: (connected: boolean) => void
  ) {}

  connect(): void {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      try {
        this.onMessage(JSON.parse(event.data) as CharacterSocketMessage);
      } catch {
        // Ignore malformed dev-server messages.
      }
    });
    this.socket.addEventListener("close", () => {
      this.onConnectionChange(false);
      window.setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 1.6, 8000);
    });
    this.socket.addEventListener("open", () => {
      this.retryMs = 1000;
      this.onConnectionChange(true);
    });
  }
}
