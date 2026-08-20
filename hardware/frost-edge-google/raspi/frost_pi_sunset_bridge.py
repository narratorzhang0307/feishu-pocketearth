#!/usr/bin/env python3
"""Read-only bridge from PI Home to the independent Sunset Radio service.

Pocket Earth owns the menu only.  The catalog, sunset calculation, command
queue and playback remain in ``/home/pi/sunset-radio``.
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


SUNSET_ROOT = Path(os.environ.get("SUNSET_RADIO_ROOT", "/home/pi/sunset-radio"))
SUNSET_API = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")
HINT_PATH = Path(
    os.environ.get(
        "SUNSET_COMMAND_HINTS",
        str(Path(__file__).with_name("frost_pi_sunset_hints.json")),
    )
)


def load_command_hints(path: Path | str = HINT_PATH) -> dict[str, str]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("schema") == "sunset-radio-command-hints/v1":
            return {str(key): str(value) for key, value in payload.get("hints", {}).items()}
    except (OSError, ValueError, TypeError):
        pass
    return {}


COMMAND_HINTS = load_command_hints()


def load_catalog(root: Path | str = SUNSET_ROOT) -> list[dict]:
    cities = []
    city_dir = Path(root) / "resource-library" / "cities"
    for path in sorted(city_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            continue
        tracks = [
            {
                "id": str(track.get("id") or ""),
                "title": str(track.get("title") or "Untitled"),
                "artist": str(track.get("artist") or payload.get("cityNameZh") or ""),
                "audioUrl": str(track.get("audioUrl") or ""),
                "introText": str(track.get("introText") or ""),
                "citySlug": str(payload.get("slug") or path.stem),
                "cityName": str(payload.get("cityName") or ""),
                "cityNameZh": str(payload.get("cityNameZh") or payload.get("cityName") or path.stem),
            }
            for track in payload.get("tracks", [])
            if isinstance(track, dict) and track.get("audioUrl")
        ]
        if not tracks:
            continue
        cities.append(
            {
                "slug": str(payload.get("slug") or path.stem),
                "cityName": str(payload.get("cityName") or ""),
                "cityNameZh": str(payload.get("cityNameZh") or payload.get("cityName") or path.stem),
                "tzOffset": float(payload.get("tzOffset") or 0),
                "tracks": tracks,
                "lat": payload.get("lat"),
                "lng": payload.get("lng"),
            }
        )
    return cities


def _compact_track_hint(track: dict) -> str:
    parts = []
    for source in (track.get("title", ""), track.get("artist", "")):
        parts.extend(re.findall(r"[A-Za-z0-9][A-Za-z0-9\-']*|[\u4e00-\u9fff]+", str(source)))
    result = ""
    for part in parts:
        candidate = f"{result} {part}".strip()
        if len(candidate) > 17:
            remaining = 17 - len(result) - (1 if result else 0)
            if remaining >= 2:
                result = f"{result} {part[:remaining]}".strip()
            break
        result = candidate
    return result or "今夜一首"


def command_hint(track: dict, catalog: list[dict]) -> str:
    """Return the pre-audited local query for one exact track."""
    del catalog  # Kept in the signature so callers make the catalog boundary explicit.
    key = f"{track.get('citySlug', '')}::{track.get('id', '')}"
    return COMMAND_HINTS.get(key) or _compact_track_hint(track)


def catalog_groups(catalog: list[dict]) -> list[dict]:
    bands = (
        ("UTC -8 / -7", -8, -7),
        ("UTC -6 / -5", -6, -5),
        ("UTC -4 — -1", -4, -1),
        ("UTC 0", 0, 0),
        ("UTC +1", 1, 1),
        ("UTC +2 / +3", 2, 3),
        ("UTC +5 / +6", 5, 6),
        ("UTC +7 / +8", 7, 8),
        ("UTC +9 / +10", 9, 10),
    )
    groups = []
    for label, start, end in bands:
        cities = [city for city in catalog if start <= float(city.get("tzOffset") or 0) <= end]
        if cities:
            groups.append({"label": label, "cities": cities})
    return groups


def upcoming_sunsets(catalog: list[dict], limit: int = 12) -> list[dict]:
    """Use Sunset Radio's real solar calculator; fall back to its old clock rule."""
    raspi_dir = SUNSET_ROOT / "raspi"
    try:
        if str(raspi_dir) not in sys.path:
            sys.path.insert(0, str(raspi_dir))
        import sunset_skill

        return sunset_skill.order_cities_by_sunset(
            catalog,
            now_utc=datetime.now(timezone.utc),
            user_tz_offset=8,
            limit=limit,
        )
    except (ImportError, OSError, TypeError, ValueError):
        now = datetime.now(timezone.utc)
        utc_minutes = now.hour * 60 + now.minute
        events = []
        for city in catalog:
            offset = float(city.get("tzOffset") or 0)
            local_minutes = (utc_minutes + round(offset * 60)) % 1440
            wait = (18 * 60 + 20 - local_minutes) % 1440
            user_minutes = (utc_minutes + wait + 8 * 60) % 1440
            events.append(
                {
                    **city,
                    "minutesUntil": wait,
                    "cityLocalSunsetClock": "18:20",
                    "userSunsetClock": f"{user_minutes // 60:02d}:{user_minutes % 60:02d}",
                    "source": "fallback-local-1820",
                }
            )
        return sorted(events, key=lambda item: (item["minutesUntil"], item["cityNameZh"]))[:limit]


def random_track(catalog: list[dict], chooser=None) -> tuple[dict, dict]:
    playable = [city for city in catalog if city.get("tracks")]
    if not playable:
        raise ValueError("sunset catalog is empty")
    pick = chooser or random.choice
    city = pick(playable)
    return city, pick(city["tracks"])


def queue_command(text: str, api_base: str = SUNSET_API) -> dict:
    payload = json.dumps(
        {"text": str(text).strip(), "source": "pocket-earth-menu", "target": "pi"},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{api_base.rstrip('/')}/api/pi-control",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=4) as response:
        return json.loads(response.read().decode("utf-8"))


def enable_music() -> None:
    """Treat a physical menu selection as explicit consent to play audio."""
    raspi_dir = SUNSET_ROOT / "raspi"
    if str(raspi_dir) not in sys.path:
        sys.path.insert(0, str(raspi_dir))
    import audio_mode

    audio_mode.save_audio_mode("radio", ttl_sec=3600, reason="Pocket Earth physical menu selection")


def queue_city(city: dict, api_base: str = SUNSET_API) -> dict:
    enable_music()
    return queue_command(f"切换到{city.get('cityNameZh') or city.get('cityName')}", api_base=api_base)


def queue_track(track: dict, catalog: list[dict], api_base: str = SUNSET_API) -> dict:
    enable_music()
    # This phrasing reaches Sunset Radio's local qualified-playlist branch
    # before its generic "continue playback" and cloud-agent branches.  Omit
    # the city name: the city matcher would otherwise start the first song.
    hint = command_hint(track, catalog)
    return queue_command(
        f"换首{hint}的歌",
        api_base=api_base,
    )
