from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from processor import process_photo

app = FastAPI(title="Human Stack Battle Image Worker")


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
