# Architecture

## Components

```text
apps/game       Vite + TypeScript + Canvas + Matter.js
apps/server     Express API, Chokidar watcher, ws broadcaster
services/image-worker
                FastAPI worker for local image processing
runtime         Local inbox, processing, characters, rejected, manifest
```

## Flow

```text
photo saved to runtime/inbox or POST /api/photos
  -> Node watcher queues processing
  -> Python worker creates sprite, mask, vertices, character.json
  -> Node updates runtime/manifest.json atomically
  -> WebSocket sends character.added
  -> browser refetches /api/characters
```

## Character Contract

`character.json` stores normalized vertices where `(0, 0)` is the image center. The game scales those vertices to the rendered character size before creating the Matter.js body.

```json
{
  "id": "uuid",
  "name": "display-name",
  "spriteUrl": "/characters/uuid/sprite.png",
  "width": 300,
  "height": 500,
  "collisionMode": "convexHull",
  "vertices": [{ "x": -0.4, "y": -0.5 }],
  "sourceHash": "sha256",
  "createdAt": "2026-07-15T12:00:00.000Z"
}
```

## Privacy

The segmentation model runs locally and does not send photos to an external AI service. When the public capture route is used, encrypted requests pass through Cloudflare to the local API. `SAVE_ORIGINALS=false` prevents an extra copy under the character directory, but the accepted source remains in `runtime/inbox` until it is explicitly deleted. EXIF location data is not copied into generated output.

The current public capture route still depends on a local PC being online. For an always-on service, move the Express API and Python image worker to a cloud VM, container host, or suitable rental server. See [Image processing](IMAGE_PROCESSING.md) for the shared-filesystem changes, queue, storage, security, and retention requirements.
