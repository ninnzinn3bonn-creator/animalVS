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

  it("keeps a player deletion local and hidden during static fallback", async () => {
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
    expect(fetcher).not.toHaveBeenCalledWith("https://api.example.test/api/characters/two", { method: "DELETE" });

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

  it("keeps local enable preferences when cloud characters are available", async () => {
    const values = new Map<string, string>([
      ["human-stack-battle.character-enabled", JSON.stringify({ two: false })]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.example.test")) {
        return Response.json({ characters: [character("two")] });
      }
      return Response.json({ characters: [character("one")] });
    });
    const repository = new CharacterRepository(fetcher, storage, endpoints);

    await repository.load();

    expect(repository.getAll().find((item) => item.id === "two")?.enabled).toBe(false);
  });

  it("keeps a player enable change locally after reloading", async () => {
    const values = new Map<string, string>([
      ["human-stack-battle.character-enabled", JSON.stringify({ one: true, two: false })]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("api.example.test")) {
        if (init?.method === "PATCH") return Response.json(character("two", true));
        return Response.json({ characters: [character("one"), character("two", true)] });
      }
      return Response.json({ characters: [character("one"), character("two", true)] });
    });
    const repository = new CharacterRepository(fetcher, storage, endpoints);
    await repository.load();

    await repository.setEnabled("two", true);
    expect(fetcher).not.toHaveBeenCalledWith(
      "https://api.example.test/api/characters/two",
      expect.objectContaining({ method: "PATCH" })
    );

    const reloaded = new CharacterRepository(fetcher, storage, endpoints);
    await reloaded.load();
    expect(reloaded.getAll().find((item) => item.id === "two")?.enabled).toBe(true);
  });

  it("only returns enabled characters to the game", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.example.test")) {
        return Response.json({ characters: [character("enabled"), character("disabled", false)] });
      }
      return Response.json({ characters: [] });
    });
    const repository = new CharacterRepository(fetcher, null, endpoints);
    await repository.load();

    for (let index = 0; index < 20; index += 1) {
      expect(repository.random().id).toBe("enabled");
    }
  });

  it("falls back to a local hide when cloud deletion requires admin access", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("api.example.test")) {
        if (init?.method === "DELETE") return Response.json({ message: "forbidden" }, { status: 403 });
        return Response.json({ characters: [character("one"), character("two")] });
      }
      return Response.json({ characters: [character("one"), character("two")] });
    });
    const repository = new CharacterRepository(fetcher, storage, endpoints);
    await repository.load();

    await expect(repository.remove("two")).resolves.toMatchObject({ id: "two" });
    expect(repository.getAll().map((item) => item.id)).toEqual(["one"]);
  });
});
