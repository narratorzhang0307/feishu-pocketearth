"""Pure result normalization for the Pocket Earth OCR service.

This file intentionally has no Paddle/FastAPI imports so the API contract can be
unit-tested without downloading model runtimes.
"""

from __future__ import annotations

from statistics import fmean
from typing import Any


def _as_mapping(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", result)
    if callable(payload):
        payload = payload()
    if not isinstance(payload, dict):
        raise ValueError("paddle_result_not_mapping")
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


def extract_page(result: Any, fallback_page: int) -> dict[str, Any]:
    """Convert one PP-StructureV3 result into the Node service page contract."""

    payload = _as_mapping(result)
    raw_index = payload.get("page_index")
    page = int(raw_index) + 1 if isinstance(raw_index, int) and raw_index >= 0 else fallback_page

    blocks = payload.get("parsing_res_list")
    ordered_text: list[str] = []
    if isinstance(blocks, list):
        for block in blocks:
            if not isinstance(block, dict):
                continue
            content = str(block.get("block_content") or "").strip()
            if content:
                ordered_text.append(content)

    overall = payload.get("overall_ocr_res")
    if not isinstance(overall, dict):
        overall = {}
    rec_texts = overall.get("rec_texts")
    if not ordered_text and isinstance(rec_texts, (list, tuple)):
        ordered_text = [str(item).strip() for item in rec_texts if str(item).strip()]

    scores = overall.get("rec_scores")
    numeric_scores: list[float] = []
    if scores is not None:
        try:
            numeric_scores = [float(score) for score in scores if 0 <= float(score) <= 1]
        except (TypeError, ValueError):
            numeric_scores = []

    return {
        "page": page,
        "text": "\n".join(ordered_text).strip(),
        "confidence": round(fmean(numeric_scores), 6) if numeric_scores else None,
    }


def normalize_results(results: Any, max_pages: int) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    for index, result in enumerate(results):
        if index >= max_pages:
            raise ValueError("document_page_limit_exceeded")
        page = extract_page(result, index + 1)
        if page["text"]:
            pages.append(page)
    if not pages:
        raise ValueError("ocr_returned_no_text")
    return pages
