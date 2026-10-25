from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import tempfile
import time
from pathlib import Path
from urllib.request import Request, urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark a local Human Stack Battle image worker.")
    parser.add_argument("--url", default="http://127.0.0.1:8789")
    parser.add_argument("--image", required=True)
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()

    source = Path(args.image).resolve()
    if not source.is_file():
        raise SystemExit(f"image not found: {source}")
    if args.runs < 1:
        raise SystemExit("runs must be at least 1")

    totals: list[float] = []
    backgrounds: list[float] = []
    provider = "unknown"
    model = "unknown"
    with tempfile.TemporaryDirectory(prefix="hsb-worker-benchmark-") as output:
        for index in range(args.runs):
            digest = hashlib.sha256(source.read_bytes() + str(index).encode()).hexdigest()
            payload = json.dumps(
                {
                    "sourcePath": str(source),
                    "name": "benchmark",
                    "sourceHash": digest,
                    "charactersDir": output,
                    "saveOriginal": False,
                    "diagnostics": True,
                }
            ).encode()
            request = Request(
                f"{args.url.rstrip('/')}/process",
                data=payload,
                headers={"content-type": "application/json"},
                method="POST",
            )
            started = time.perf_counter()
            with urlopen(request, timeout=180) as response:
                result = json.load(response)
            totals.append((time.perf_counter() - started) * 1000)
            diagnostics = result.get("diagnostics", {})
            provider = diagnostics.get("provider", provider)
            model = diagnostics.get("model", model)
            stage = diagnostics.get("stagesMs", {}).get("removeBackground")
            if isinstance(stage, (int, float)):
                backgrounds.append(float(stage))

    report = {
        "url": args.url,
        "provider": provider,
        "model": model,
        "runs": args.runs,
        "wallMs": summarize(totals),
        "removeBackgroundMs": summarize(backgrounds) if backgrounds else None,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


def summarize(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    p95_index = min(len(ordered) - 1, round((len(ordered) - 1) * 0.95))
    return {
        "min": round(ordered[0], 2),
        "median": round(statistics.median(ordered), 2),
        "p95": round(ordered[p95_index], 2),
        "max": round(ordered[-1], 2),
    }


if __name__ == "__main__":
    main()
