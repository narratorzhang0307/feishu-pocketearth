#!/usr/bin/env python3
"""Synchronise the verified Pocket Podcast artifact to the Frost Edge Node.

The server-side Knowledge Scout Harness owns discovery, verification and daily
composition.  The Pi is a read-only client: it validates the small public
artifact, writes it atomically, and keeps the last good copy when offline.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PODCAST_SCHEMA = "pocket-earth-daily-podcast/v1"
PODCAST_RUN_SCHEMA = "pocket-earth-podcast-agent-run/v1"
DEFAULT_API_BASE = os.environ.get(
    "POCKET_EARTH_API_BASE",
    "https://pocketearth-google.throughtheglass.art",
).rstrip("/")
DEFAULT_CACHE_PATH = Path(
    os.environ.get(
        "POCKET_EARTH_PODCAST_CACHE",
        "/var/lib/pocket-earth-edge/pocket-podcast.json",
    )
)
FALLBACK_CACHE_PATH = Path(__file__).with_name("frost_pi_podcast_cache.json")


def validate_podcast(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("schema") != PODCAST_SCHEMA:
        raise ValueError("unsupported podcast schema")
    if payload.get("state") not in {"ready", "waiting-for-verified-knowledge"}:
        raise ValueError("unsupported podcast state")
    segments = payload.get("segments")
    if not isinstance(segments, list):
        raise ValueError("podcast segments must be a list")
    for segment in segments:
        if not isinstance(segment, dict) or not str(segment.get("title") or "").strip():
            raise ValueError("podcast segment is missing a title")
        sources = segment.get("sources")
        if not isinstance(sources, list) or len(sources) < 2:
            raise ValueError("podcast segment requires two public sources")
    if payload.get("state") == "ready":
        run = payload.get("run")
        if not isinstance(run, dict) or run.get("schema") != PODCAST_RUN_SCHEMA:
            raise ValueError("ready podcast requires a versioned Agent run receipt")
        if run.get("agentId") != "pocket-podcast.orchestrator.v1" or run.get("state") != "complete":
            raise ValueError("podcast Agent run is incomplete")
        events = run.get("events")
        if not isinstance(events, list) or len(events) < 6:
            raise ValueError("podcast Agent run is missing lifecycle events")
        receipt = next((event.get("detail") for event in events if event.get("stage") == "receipt"), None)
        if not isinstance(receipt, dict) or receipt.get("automaticPublication") is not False:
            raise ValueError("podcast receipt must retain the human publication boundary")
    return payload


def load_podcast_cache(
    cache_path: Path = DEFAULT_CACHE_PATH,
    fallback_path: Path = FALLBACK_CACHE_PATH,
) -> dict:
    for path in (cache_path, fallback_path):
        try:
            return validate_podcast(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            continue
    return {
        "schema": PODCAST_SCHEMA,
        "state": "waiting-for-verified-knowledge",
        "date": "OFFLINE",
        "title": "口袋播客",
        "intro": "当前没有可用的已核验播客缓存。",
        "outro": "",
        "script": "",
        "segments": [],
        "memory": {"hotWindowDays": 7, "policy": "完整新闻保留七天；精选记录进入长期层。"},
    }


def write_podcast_cache(payload: dict, output: Path = DEFAULT_CACHE_PATH) -> Path:
    verified = validate_podcast(payload)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(verified, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    return output


def podcast_url(api_base: str = DEFAULT_API_BASE, date: str = "") -> str:
    query = {"tool": "podcast"}
    if date:
        query["date"] = date
    return f"{api_base.rstrip('/')}/api/knowledge?{urlencode(query)}"


def sync_podcast(
    api_base: str = DEFAULT_API_BASE,
    output: Path = DEFAULT_CACHE_PATH,
    date: str = "",
    timeout: float = 12.0,
) -> dict:
    request = Request(
        podcast_url(api_base, date),
        headers={"accept": "application/json", "user-agent": "Pocket-Earth-Frost-Edge/1"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise RuntimeError(f"podcast sync failed: {exc}") from exc
    write_podcast_cache(payload, output)
    return payload


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Synchronise the verified Pocket Podcast to this Pi")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--output", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--date", default="")
    parser.add_argument("--timeout", type=float, default=12.0)
    args = parser.parse_args(argv)
    try:
        payload = sync_podcast(args.api_base, args.output, args.date, args.timeout)
    except RuntimeError as exc:
        print(str(exc))
        return 1
    print(json.dumps({
        "ok": True,
        "date": payload.get("date"),
        "segments": len(payload.get("segments", [])),
        "agent": (payload.get("run") or {}).get("agentId"),
        "output": str(args.output),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
