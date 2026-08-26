import { describe, expect, it } from "vitest";
import { createServiceEndpoints } from "../apps/game/src/config/services";

describe("service endpoints", () => {
  it("keeps the Pages capture prefix for HTTP and WebSocket endpoints", () => {
    const endpoints = createServiceEndpoints("https://human-stack-battle-game.pages.dev/capture");

    expect(endpoints.apiUrl("/api/health")).toBe(
      "https://human-stack-battle-game.pages.dev/capture/api/health"
    );
    expect(endpoints.websocketUrl("/ws")).toBe(
      "wss://human-stack-battle-game.pages.dev/capture/ws"
    );
  });

  it("keeps root-based local development endpoints unchanged", () => {
    const endpoints = createServiceEndpoints("http://127.0.0.1:5180");

    expect(endpoints.apiUrl("/api/characters")).toBe("http://127.0.0.1:5180/api/characters");
  });
});
