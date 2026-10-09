import base64
import hashlib
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from processor import process_photo

app = FastAPI(title="Human Stack Battle Image Worker")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024


class ProcessRequest(BaseModel):
    sourcePath: str
    name: str = Field(min_length=1, max_length=80)
    sourceHash: str = Field(min_length=16)
    charactersDir: str
    saveOriginal: bool = True


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/process")
def process(request: ProcessRequest):
    try:
        return process_photo(
            source_path=request.sourcePath,
            name=request.name,
            source_hash=request.sourceHash,
            characters_dir=request.charactersDir,
            save_original=request.saveOriginal,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/process-upload")
async def process_upload(
    photo: UploadFile = File(...),
    name: str = Form(min_length=1, max_length=80),
    source_hash: str | None = Form(default=None, min_length=16),
):
    data = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="photo exceeds 12MB")
    if not data:
        raise HTTPException(status_code=422, detail="photo is empty")

    computed_hash = hashlib.sha256(data).hexdigest()
    if source_hash and source_hash != computed_hash:
        raise HTTPException(status_code=422, detail="source hash mismatch")

    suffix = safe_suffix(photo.filename, photo.content_type)
    try:
        with tempfile.TemporaryDirectory(prefix="human-stack-") as temp_dir:
            source = Path(temp_dir) / f"source{suffix}"
            characters_dir = Path(temp_dir) / "characters"
            source.write_bytes(data)
            character = process_photo(
                source_path=str(source),
                name=name,
                source_hash=computed_hash,
                characters_dir=str(characters_dir),
                save_original=False,
            )
            output_dir = characters_dir / character["id"]
            return {
                "character": character,
                "spriteBase64": base64.b64encode((output_dir / "sprite.png").read_bytes()).decode("ascii"),
                "maskBase64": base64.b64encode((output_dir / "mask.png").read_bytes()).decode("ascii"),
            }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def safe_suffix(filename: str | None, content_type: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return suffix
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(content_type or "", ".img")
