import os
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

IMAGE_WORKER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(IMAGE_WORKER_DIR))

from contour import extract_hull  # noqa: E402
from processor import resize_long_edge, sanitize_name  # noqa: E402
from segmentation import remove_background  # noqa: E402


class ProcessingTests(unittest.TestCase):
    def test_resize_long_edge_preserves_aspect_ratio(self):
        image = Image.new("RGBA", (2400, 1200), "white")
        resized = resize_long_edge(image, 1200)
        self.assertEqual(resized.size, (1200, 600))

    def test_sanitize_name_keeps_japanese_text(self):
        self.assertEqual(sanitize_name(" たにぐち<> "), "たにぐち")

    def test_contour_returns_normalized_convex_hull(self):
        mask = Image.new("L", (200, 300), 0)
        pixels = np.array(mask)
        pixels[30:270, 40:160] = 255
        result = extract_hull(Image.fromarray(pixels))
        self.assertEqual(result.mode, "convexHull")
        self.assertGreaterEqual(len(result.vertices), 3)
        self.assertTrue(all(-0.5 <= point["x"] <= 0.5 for point in result.vertices))
        self.assertTrue(all(-0.5 <= point["y"] <= 0.5 for point in result.vertices))

    def test_segmentation_fallback_can_be_disabled(self):
        previous_model = os.environ.get("REMBG_MODEL")
        previous_fallback = os.environ.get("ALLOW_SEGMENTATION_FALLBACK")
        os.environ["REMBG_MODEL"] = "model-that-does-not-exist"
        os.environ["ALLOW_SEGMENTATION_FALLBACK"] = "false"
        try:
            with self.assertRaises(Exception):
                remove_background(Image.new("RGBA", (16, 16), "white"))
        finally:
            if previous_model is None:
                os.environ.pop("REMBG_MODEL", None)
            else:
                os.environ["REMBG_MODEL"] = previous_model
            if previous_fallback is None:
                os.environ.pop("ALLOW_SEGMENTATION_FALLBACK", None)
            else:
                os.environ["ALLOW_SEGMENTATION_FALLBACK"] = previous_fallback


if __name__ == "__main__":
    unittest.main()
