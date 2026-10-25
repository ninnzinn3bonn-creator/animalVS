from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from accelerated import AcceleratedRuntime, create_runtime
from processor import process_photo
from segmentation import remove_background

logger = logging.getLogger("image-worker-fast")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.runtime = create_runtime()
    runtime: AcceleratedRuntime = app.state.runtime
    logger.info("fast_worker_ready %s", json.dumps(runtime.public_info(), ensure_ascii=True))
    yield


app = FastAPI(title="Human Stack Battle Fast Image Worker", lifespan=lifespan)


class ProcessRequest(BaseModel):
    sourcePath: str
    name: str = Field(min_length=1, max_length=80)
    sourceHash: str = Field(min_length=16)
    charactersDir: str
    saveOriginal: bool = True
    diagnostics: bool = False


@app.get("/health")
def health(request: Request):
    runtime: AcceleratedRuntime = request.app.state.runtime
    return {"ok": True, "ready": True, **runtime.public_info()}


@app.post("/process")
def process(request: ProcessRequest, http_request: Request):
    runtime: AcceleratedRuntime = http_request.app.state.runtime
    request_id = uuid.uuid4().hex[:12]
    timings: dict[str, float] = {}
    started = time.perf_counter()
    try:
        character = process_photo(
            source_path=request.sourcePath,
            name=request.name,
            source_hash=request.sourceHash,
            characters_dir=request.charactersDir,
            save_original=request.saveOriginal,
            background_remover=lambda image: remove_background(
                image,
                session=runtime.session,
                allow_fallback=False,
            ),
            timings=timings,
        )
        diagnostics = {
            **runtime.public_info(),
            "requestId": request_id,
            "totalMs": round((time.perf_counter() - started) * 1000, 2),
            "stagesMs": timings,
        }
        logger.info("fast_worker_request %s", json.dumps(diagnostics, ensure_ascii=True))
        if request.diagnostics:
            return {**character, "diagnostics": diagnostics}
        return character
    except Exception as exc:
        logger.exception("fast_worker_failed requestId=%s error=%s", request_id, type(exc).__name__)
        raise HTTPException(status_code=422, detail="image processing failed") from exc
