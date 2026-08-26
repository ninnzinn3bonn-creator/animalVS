import { describe, expect, it, vi } from "vitest";
import { CharacterRepository } from "../apps/game/src/character/CharacterRepository";
import type { CharacterDefinition } from "../apps/game/src/character/CharacterTypes";
import type { ServiceEndpoints } from "../apps/game/src/config/services";

function character(id: string, enabled = true): CharacterDefinition {
  return {
    id,
    name: id,
    enabled,
    spriteUrl: `/characters/${id}/sprite.png`,
    width: 100,
    height: 200,
    collisionMode: "box",
    vertices: [
      { x: -0.4, y: -0.4 },
      { x: 0.4, y: -0.4 },
      { x: 0.4, y: 0.4 },
      { x: -0.4, y: 0.4 }
    ],
    createdAt: "2026-07-16T00:00:00.000Z"
  };
}

const endpoints: ServiceEndpoints = {
  apiUrl: (path) => `https://api.example.test${path}`,
  websocketUrl: (path) => `wss://api.example.test${path}`,
  staticCharactersUrl: "https://game.example.test/data/characters.json"
};

describe("CharacterRepository Pages fallback", () => {
  it("uses static characters when the PC API is unavailable", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.example.test")) {
        throw new TypeError("offline");
      }
      return Response.json({ characters: [character("static-one"), character("static-two")] });
    });
    const repository = new CharacterRepository(fetcher, null, endpoints);

    await expect(repository.load()).resolves.toHaveLength(2);
    expect(repository.isRemoteAvailable()).toBe(false);
    expect(repository.getAll()[0]?.spriteUrl).toBe("/characters/static-one/sprite.png");
  });

  it("stores enable settings locally while the PC API is unavailable", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.example.test")) {
        throw new TypeError("offline");
      }
      return Response.json({ characters: [character("one"), character("two")] });
    });
    const repository = new CharacterRepository(fetcher, storage, endpoints);
    await repository.load();

    await repository.setEnabled("two", false);

    const reloaded = new CharacterRepository(fetcher, storage, endpoints);
    await reloaded.load();
    expect(reloaded.getAll().find((item) => item.id === "two")?.enabled).toBe(false);
  });

  it("deletes a character remotely and keeps it hidden during static fallback", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    let online = true;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("api.example.test")) {
        if (!online) throw new TypeError("offline");
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return Response.json({ characters: [character("one"), character("two")] });
      }
      return Response.json({ characters: [character("one"), character("two")] });
    });
    const repository = new CharacterRepository(fetcher, storage, endpoints);
    await repository.load();

    await repository.remove("two");
    expect(repository.getAll().map((item) => item.id)).toEqual(["one"]);
    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/api/characters/two", { method: "DELETE" });

    online = false;
    const reloaded = new CharacterRepository(fetcher, storage, endpoints);
    await reloaded.load();
    expect(reloaded.getAll().map((item) => item.id)).toEqual(["one"]);
  });

  it("does not delete the last enabled character", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.example.test")) throw new TypeError("offline");
      return Response.json({ characters: [character("one"), character("two", false)] });
    });
    const repository = new CharacterRepository(fetcher, null, endpoints);
    await repository.load();

    await expect(repository.remove("one")).rejects.toThrow("削除する前に別のキャラクターを有効にしてください");
    expect(repository.getAll()).toHaveLength(2);
  });
});
