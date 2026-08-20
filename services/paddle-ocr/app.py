from __future__ import annotations

import asyncio
import base64
import binascii
import os
import secrets
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from contract import normalize_results


MAX_BYTES = max(1024, int(os.getenv("OCR_MAX_BYTES", str(18 * 1024 * 1024))))
MAX_PAGES = max(1, int(os.getenv("OCR_MAX_PAGES", "30")))
CONCURRENCY = max(1, int(os.getenv("OCR_CONCURRENCY", "1")))
API_KEY = os.getenv("OCR_API_KEY", "").strip()
DEVICE = os.getenv("OCR_DEVICE", "cpu").strip()
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

app = FastAPI(title="Pocket Earth PaddleOCR", version="1.0.0")
inference_slots = asyncio.Semaphore(CONCURRENCY)


class OcrRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=300)
    mimeType: str
    dataBase64: str = Field(min_length=4)
    features: list[str] = Field(default_factory=list)


@lru_cache(maxsize=1)
def pipeline():
    # Import lazily: /health stays fast and deployment failures are visible on
    # the first real task instead of being hidden behind a fake readiness flag.
    from paddleocr import PPStructureV3

    return PPStructureV3(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_formula_recognition=False,
        use_chart_recognition=False,
        device=DEVICE,
    )


def require_api_key(authorization: str | None) -> None:
    if not API_KEY:
        return
    scheme, _, value = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(value, API_KEY):
        raise HTTPException(status_code=401, detail="invalid_ocr_api_key")


def decode_payload(request: OcrRequest) -> tuple[bytes, str]:
    suffix = ALLOWED_TYPES.get(request.mimeType)
    if not suffix:
        raise HTTPException(status_code=415, detail="unsupported_source_type")
    try:
        payload = base64.b64decode(request.dataBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="invalid_base64") from error
    if not payload:
        raise HTTPException(status_code=400, detail="empty_file")
    if len(payload) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="source_file_too_large")
    return payload, suffix


def run_inference(payload: bytes, suffix: str) -> list[dict[str, object]]:
    # Paddle accepts image/PDF paths directly and returns one result per page.
    # The temporary source is deleted after inference and never logged.
    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="pocket-earth-ocr-", suffix=suffix, delete=False) as handle:
            handle.write(payload)
            temp_path = handle.name
        return normalize_results(pipeline().predict(input=temp_path), MAX_PAGES)
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "engine": "paddleocr-pp-structure-v3",
        "modelLoaded": pipeline.cache_info().currsize > 0,
        "device": DEVICE,
        "maxPages": MAX_PAGES,
    }


@app.post("/v1/ocr")
async def ocr(request: OcrRequest, authorization: str | None = Header(default=None)) -> dict[str, object]:
    require_api_key(authorization)
    payload, suffix = decode_payload(request)
    async with inference_slots:
        try:
            pages = await asyncio.to_thread(run_inference, payload, suffix)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except Exception as error:
            # Do not echo document text, Base64 content or internal file paths.
            raise HTTPException(status_code=502, detail=f"paddle_inference_failed:{type(error).__name__}") from error
    return {"engine": "paddleocr-pp-structure-v3", "pages": pages}
