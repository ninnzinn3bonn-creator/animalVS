import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const runtimeDir = path.join(workspaceRoot, "runtime");
const publicDir = path.join(workspaceRoot, "apps", "game", "public");
const publicCharactersDir = path.join(publicDir, "characters");
const publicDataDir = path.join(publicDir, "data");

if (!publicCharactersDir.startsWith(`${publicDir}${path.sep}`)) {
  throw new Error("Static character output escaped the game public directory");
}

const manifestPath = path.join(runtimeDir, "manifest.json");
let manifest = { characters: [] };
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
  console.log("No runtime character manifest found; building with demo characters only.");
}
const characters = [];

await rm(publicCharactersDir, { recursive: true, force: true });
await mkdir(publicCharactersDir, { recursive: true });
await mkdir(publicDataDir, { recursive: true });

for (const character of manifest.characters ?? []) {
  if (!/^[a-zA-Z0-9_-]+$/.test(character.id)) {
    throw new Error(`Invalid character id: ${character.id}`);
  }

  const targetDir = path.join(publicCharactersDir, character.id);
  await mkdir(targetDir, { recursive: true });
  await copyFile(
    path.join(runtimeDir, "characters", character.id, "sprite.png"),
    path.join(targetDir, "sprite.png")
  );

  const { sourceHash: _sourceHash, ...publicCharacter } = character;
  characters.push({
    ...publicCharacter,
    spriteUrl: `/characters/${character.id}/sprite.png`
  });
}

await writeFile(
  path.join(publicDataDir, "characters.json"),
  `${JSON.stringify({ characters }, null, 2)}\n`,
  "utf8"
);

console.log(`Synced ${characters.length} static characters for Cloudflare Pages.`);
