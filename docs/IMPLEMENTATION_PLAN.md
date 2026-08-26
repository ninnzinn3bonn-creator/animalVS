# Implementation Plan

## Phase 1: Physics Game

- Build the Matter.js world, platform, lose zone, and turn manager.
- Use generated demo characters when no processed photos exist.
- Add keyboard and touch controls.
- Provide restart and title/game/result screens.

Done in this MVP.

## Phase 2: Character Loading

- Load `runtime/manifest.json` through `GET /api/characters`.
- Convert normalized vertices to Matter.js polygons.
- Use per-character sprite images.

Done in this MVP.

## Phase 3: Folder Watch

- Watch `runtime/inbox` with Chokidar and `awaitWriteFinish`.
- Debounce repeated changes.
- Hash input bytes to avoid duplicate registrations.

Done in this MVP.

## Phase 4: Image Processing

- Run a persistent FastAPI worker.
- Prefer `rembg` for portrait/person segmentation.
- Fall back to a conservative alpha mask if optional native packages are unavailable.
- Generate a simplified convex hull for physics.

Done in this MVP with graceful fallback.

## Phase 5: Live Updates

- Broadcast `character.processing`, `character.added`, and `character.failed`.
- Refetch character data on `character.added`.

Done in this MVP.

## Phase 6: Camera Screen

- Capture from browser camera.
- Submit via `POST /api/photos`.
- Route through the same local processing pipeline.

Done in this MVP.

## Remaining Improvements

- Add Playwright browser E2E coverage.
- Add an admin confirmation flow for deleting original photos after a match.
- Tune physics constants with real event photos.
- Add optional GPU setup instructions for rembg.
