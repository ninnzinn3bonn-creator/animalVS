from __future__ import annotations

import os
from functools import lru_cache
from io import BytesIO

from PIL import Image, ImageFilter


def remove_background(image: Image.Image) -> Image.Image:
    """Return an RGBA image. Prefer rembg, fall back to a soft rectangular mask."""
    rgba = image.convert("RGBA")
    try:
        from rembg import remove

        model = os.environ.get("REMBG_MODEL", "birefnet-portrait")
        session = get_session(model)
        output = remove(rgba, session=session)
        if isinstance(output, bytes):
            return Image.open(BytesIO(output)).convert("RGBA")
        return output.convert("RGBA")
    except Exception:
        return fallback_mask(rgba)


@lru_cache(maxsize=2)
def get_session(model: str):
    from rembg import new_session

    return new_session(model)


def fallback_mask(image: Image.Image) -> Image.Image:
    width, height = image.size
    mask = Image.new("L", (width, height), 0)
    inner = Image.new("L", (max(1, int(width * 0.72)), max(1, int(height * 0.9))), 255)
    mask.paste(inner, (int(width * 0.14), int(height * 0.05)))
    mask = mask.filter(ImageFilter.GaussianBlur(max(3, width // 45)))

    output = image.copy()
    output.putalpha(mask)
    return output


def trim_transparent(image: Image.Image, padding: int = 20) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("no foreground detected")
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def add_sticker_style(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    outline = alpha.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(1))
    shadow = alpha.filter(ImageFilter.GaussianBlur(10))

    canvas = Image.new("RGBA", (image.width + 34, image.height + 42), (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", image.size, (0, 0, 0, 70))
    shadow_layer.putalpha(shadow)
    canvas.alpha_composite(shadow_layer, (17, 26))

    outline_layer = Image.new("RGBA", image.size, (255, 255, 255, 255))
    outline_layer.putalpha(outline)
    canvas.alpha_composite(outline_layer, (17, 10))
    canvas.alpha_composite(image, (17, 10))
    return canvas
