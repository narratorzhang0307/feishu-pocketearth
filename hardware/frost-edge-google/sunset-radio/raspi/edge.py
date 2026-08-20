#!/usr/bin/env python3
"""Pocket Earth Frost Edge local inference adapter.

Only bounded intent classification is delegated to Google Gemma 4 E4B IT on
the Raspberry Pi.  The runtime is an OpenAI-compatible ``llama-server`` bound
to loopback, so no private text leaves the device.  Deterministic commands
remain the first route and every model failure returns ``None`` for a safe
rules/cache fallback.
"""

from __future__ import annotations

import json
import os
import urllib.request


GEMMA_URL = os.environ.get(
    "POCKET_EARTH_GEMMA_URL", "http://127.0.0.1:8787/v1"
).rstrip("/")
EDGE_MODEL = os.environ.get("POCKET_EARTH_GEMMA_MODEL", "gemma-4-e4b-it")
EDGE_ENABLED = os.environ.get("POCKET_EARTH_GEMMA_ENABLED", "1").lower() not in {
    "0",
    "false",
    "no",
    "off",
}
TIMEOUT = float(os.environ.get("POCKET_EARTH_GEMMA_TIMEOUT", "8"))

EDGE_INTENTS = (
    "open_dj",
    "make_radio",
    "tour",
    "city_culture",
    "chitchat",
    "general",
)

_CLASSIFY_SYSTEM = """你是 Frost-Agent 的端侧意图分类器，只输出一个候选标签。
open_dj：想听某类音乐、城市或场景；
make_radio：生成或安排一档电台；
tour：询问日落路线、城市顺序或此刻地点；
city_culture：询问城市、作品、歌手或文化背景；
chitchat：打招呼、说心情或陪聊；
general：其余请求。
不得输出解释，不得执行动作。"""


def _request(path: str, payload: dict | None = None, timeout: float = TIMEOUT) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        GEMMA_URL + path,
        data=data,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def available() -> bool:
    """Return whether the loopback Gemma endpoint exposes the configured model."""
    if not EDGE_ENABLED:
        return False
    try:
        payload = _request("/models", timeout=2.5)
        models = {str(item.get("id") or "") for item in payload.get("data") or []}
        return EDGE_MODEL in models or bool(models)
    except Exception:
        return False


def _chat(prompt: str, system: str, max_tokens: int = 24) -> str:
    try:
        payload = _request(
            "/chat/completions",
            {
                "model": EDGE_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
                "max_tokens": max_tokens,
            },
        )
        return str(
            ((payload.get("choices") or [{}])[0].get("message") or {}).get("content")
            or ""
        ).strip()
    except Exception:
        return ""


def classify(text: str, labels=EDGE_INTENTS):
    """Classify ambiguous text into the caller's fixed allow-list."""
    text = str(text or "").strip()
    labels = tuple(str(label) for label in labels or ())
    if not text or not labels or not available():
        return None
    prompt = f"文本：{text}\n候选：{' / '.join(labels)}\n标签："
    raw = _chat(prompt, _CLASSIFY_SYSTEM)
    normalized = raw.strip().strip("`\"' ").lower()
    for label in labels:
        if normalized == label.lower() or label.lower() in normalized:
            return label
    return None


def rank(query, candidates):
    """Deterministic local rank fallback; no generation or network is required."""
    query = str(query or "")
    scored = []
    for index, candidate in enumerate(candidates or []):
        text = str(candidate or "")
        overlap = sum(1 for char in set(query) if char.strip() and char in text)
        scored.append((overlap, index))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [index for _, index in scored]


if __name__ == "__main__":
    print(
        json.dumps(
            {
                "ready": available(),
                "provider": "local-gemma",
                "modelOwner": "Google",
                "model": EDGE_MODEL,
                "transport": "loopback",
            },
            ensure_ascii=False,
        )
    )
