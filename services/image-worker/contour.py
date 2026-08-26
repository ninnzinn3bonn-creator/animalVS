from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class HullResult:
    vertices: list[dict[str, float]]
    mode: str


def extract_hull(mask: Image.Image, max_vertices: int = 8) -> HullResult:
    alpha = np.array(mask.convert("L"))
    ys, xs = np.where(alpha > 24)
    if len(xs) < 20 or len(ys) < 20:
        return fallback_box()

    try:
        import cv2

        _, binary = cv2.threshold(alpha, 24, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return fallback_box()
        contour = max(contours, key=cv2.contourArea)
        hull = cv2.convexHull(contour)
        perimeter = cv2.arcLength(hull, True)
        epsilon = 0.025 * perimeter
        approx = cv2.approxPolyDP(hull, epsilon, True).reshape(-1, 2)
        approx = reduce_vertices(approx, max_vertices)
        return normalize_vertices(approx, alpha.shape[1], alpha.shape[0])
    except Exception:
        points = np.array(
            [
                [xs.min(), ys.min()],
                [xs.max(), ys.min()],
                [xs.max(), ys.max()],
                [xs.min(), ys.max()],
            ],
            dtype=np.float32,
        )
        return normalize_vertices(points, alpha.shape[1], alpha.shape[0])


def reduce_vertices(points: np.ndarray, max_vertices: int) -> np.ndarray:
    if len(points) <= max_vertices:
        return points
    indices = np.linspace(0, len(points) - 1, max_vertices, dtype=int)
    return points[indices]


def normalize_vertices(points: np.ndarray, width: int, height: int) -> HullResult:
    normalized: list[dict[str, float]] = []
    for x, y in points:
        normalized.append(
            {
                "x": round((float(x) - width / 2) / width, 4),
                "y": round((float(y) - height / 2) / height, 4),
            }
        )

    if len(normalized) < 3:
        return fallback_box()

    return HullResult(vertices=normalized, mode="convexHull")


def fallback_box() -> HullResult:
    return HullResult(
        vertices=[
            {"x": -0.38, "y": -0.46},
            {"x": 0.38, "y": -0.46},
            {"x": 0.42, "y": 0.42},
            {"x": -0.42, "y": 0.42},
        ],
        mode="box",
    )
