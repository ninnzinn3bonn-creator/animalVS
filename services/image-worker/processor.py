from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

from contour import extract_hull
from segmentation import add_sticker_style, remove_background, trim_transparent

MAX_LONG_EDGE = 1200
OUTPUT_LONG_EDGE = 620


def process_photo(
    source_path: str,
    name: str,
    source_hash: str,
    characters_dir: str,
    save_original: bool = True,
) -> dict:
    source = Path(source_path)
    if not source.exists():
        raise ValueError(f"source not found: {source}")

    character_id = uuid.uuid4().hex[:12]
    output_dir = Path(characters_dir) / character_id
    output_dir.mkdir(parents=True, exist_ok=True)

    image = Image.open(source)
    image = ImageOps.exif_transpose(image).convert("RGBA")
    image = resize_long_edge(image, MAX_LONG_EDGE)

    cutout = remove_background(image)
    cutout = trim_transparent(cutout)
    cutout = resize_long_edge(cutout, OUTPUT_LONG_EDGE)
    sticker = add_sticker_style(cutout)

    sprite_path = output_dir / "sprite.png"
    mask_path = output_dir / "mask.png"
    character_path = output_dir / "character.json"

    sticker.save(sprite_path)
    sticker.getchannel("A").save(mask_path)
    if save_original:
        original_suffix = source.suffix.lower() or ".jpg"
        shutil.copy2(source, output_dir / f"original{original_suffix}")

    hull = extract_hull(sticker.getchannel("A"))
    character = {
        "id": character_id,
        "name": sanitize_name(name),
        "enabled": True,
        "spriteUrl": f"/characters/{character_id}/sprite.png",
        "width": sticker.width,
        "height": sticker.height,
        "collisionMode": hull.mode,
        "vertices": hull.vertices,
        "sourceHash": source_hash,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    character_path.write_text(json.dumps(character, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return character


def resize_long_edge(image: Image.Image, max_edge: int) -> Image.Image:
    width, height = image.size
    current = max(width, height)
    if current <= max_edge:
        return image
    scale = max_edge / current
    size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def sanitize_name(name: str) -> str:
    cleaned = "".join(ch for ch in name.strip() if ch.isalnum() or ch in " _-").strip()
    return cleaned[:60] or "participant"
