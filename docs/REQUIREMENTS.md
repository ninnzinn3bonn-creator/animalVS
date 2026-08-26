# Requirements

## Goal

Build a local two-player physics stacking game that turns participant photos into playable characters. The working title is **Human Stack Battle**.

## MVP Scope

- Local play on one PC for Player 1 and Player 2.
- Turn-based placement with horizontal movement, rotation, and drop confirmation.
- Matter.js physics simulation with a platform and a lose sensor below it.
- Character list sourced from `runtime/manifest.json`.
- Photo ingestion by folder watch (`runtime/inbox`) and in-browser camera/upload.
- Person cutout pipeline that creates `sprite.png`, `mask.png`, and `character.json`.
- WebSocket notification so newly processed characters appear without refreshing.
- Privacy-first default: image processing stays local.

## Controls

- `A` or left arrow: move left.
- `D` or right arrow: move right.
- `Q`: rotate left.
- `E`: rotate right.
- `Space` or `Enter`: drop.
- `Esc`: pause.

## Completion Criteria

- `npm run dev` starts the frontend, Node.js API, and Python image worker.
- A character can be added through `runtime/inbox` or the camera screen.
- New characters appear in the UI via WebSocket.
- The next match can use newly added characters.
- Invalid images do not crash the app.
- `npm run test` and `npm run build` pass.
