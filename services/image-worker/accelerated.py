from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageDraw


CUDA_PROVIDER = "CUDAExecutionProvider"
DML_PROVIDER = "DmlExecutionProvider"
CPU_PROVIDER = "CPUExecutionProvider"


@dataclass(frozen=True)
class AcceleratedRuntime:
    session: Any
    model: str
    requested_provider: str
    provider: str
    warmup_ms: float
    fallback_reason: str | None
    onnxruntime_version: str

    def public_info(self) -> dict[str, object]:
        return {
            "model": self.model,
            "requestedProvider": self.requested_provider,
            "provider": self.provider,
            "warmupMs": self.warmup_ms,
            "fallbackReason": self.fallback_reason,
            "onnxruntimeVersion": self.onnxruntime_version,
        }


def choose_providers(requested: str, available: list[str]) -> tuple[list[str], str | None]:
    normalized = requested.strip().lower()
    if normalized not in {"auto", "cuda", "dml", "cpu"}:
        raise ValueError("IMAGE_WORKER_PROVIDER must be auto, cuda, dml, or cpu")
    if normalized == "cpu":
        return [CPU_PROVIDER], None
    if normalized == "dml":
        if DML_PROVIDER in available:
            return [DML_PROVIDER, CPU_PROVIDER], None
        return [CPU_PROVIDER], "DirectML provider is unavailable; using CPU"
    if normalized == "cuda" and CUDA_PROVIDER not in available:
        return [CPU_PROVIDER], "CUDA provider is unavailable; using CPU"
    if CUDA_PROVIDER in available:
        return [CUDA_PROVIDER, CPU_PROVIDER], None
    if DML_PROVIDER in available:
        return [DML_PROVIDER, CPU_PROVIDER], None
    return [CPU_PROVIDER], "GPU provider is unavailable; using CPU"


def create_runtime() -> AcceleratedRuntime:
    import onnxruntime as ort
    from rembg import new_session

    requested = os.environ.get("IMAGE_WORKER_PROVIDER", "auto")
    model = os.environ.get("FAST_REMBG_MODEL", "u2net_human_seg")
    providers, fallback_reason = choose_providers(requested, ort.get_available_providers())
    started = time.perf_counter()

    try:
        session = new_session(model, providers=providers)
        warm_session(session)
        active_provider = read_active_provider(session, providers[0])
    except Exception as exc:
        if providers[0] not in {CUDA_PROVIDER, DML_PROVIDER}:
            raise
        fallback_reason = f"GPU initialization failed ({type(exc).__name__}); using CPU"
        session = new_session(model, providers=[CPU_PROVIDER])
        warm_session(session)
        active_provider = CPU_PROVIDER

    return AcceleratedRuntime(
        session=session,
        model=model,
        requested_provider=requested.strip().lower(),
        provider=active_provider,
        warmup_ms=round((time.perf_counter() - started) * 1000, 2),
        fallback_reason=fallback_reason,
        onnxruntime_version=ort.__version__,
    )


def warm_session(session: Any) -> None:
    from rembg import remove

    image = Image.new("RGBA", (96, 128), (245, 245, 245, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((28, 12, 68, 52), fill=(60, 90, 180, 255))
    draw.rectangle((34, 48, 62, 112), fill=(60, 90, 180, 255))
    remove(image, session=session)


def read_active_provider(session: Any, fallback: str) -> str:
    inner = getattr(session, "inner_session", None)
    get_providers = getattr(inner, "get_providers", None)
    if callable(get_providers):
        providers = get_providers()
        if providers:
            return str(providers[0])
    return fallback
