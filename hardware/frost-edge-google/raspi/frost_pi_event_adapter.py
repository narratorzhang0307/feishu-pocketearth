#!/usr/bin/env python3
"""Transport-neutral Raspberry Pi adapter for Frost Buddy public events.

This file is the decoupled Pi branch: it consumes the public JSONL envelope
emitted by frost-hardware-bridge.mjs and turns each event into small device
actions. BLE, serial, MQTT, display, or local TTS integrations can sit after
these actions without importing Pocket Earth app code or any cloud credentials.
"""

import json
import re
import sys

ACTION_VERSION = "0.1.0"

SECRET_RE = re.compile(
    r"PRIVATE_KEY|API_KEY|ACCESS_TOKEN|PASSWORD|SECRET",
    re.I,
)

SAFE_EVENT_KEYS = {
    "version",
    "kind",
    "source",
    "state",
    "priority",
    "title",
    "body",
    "speak",
    "sourceUrls",
    "truthScore",
    "verdict",
    "track",
    "city",
    "createdAt",
}

SAFE_ACTION_KEYS = {
    "version",
    "type",
    "transport",
    "state",
    "priority",
    "text",
    "title",
    "body",
    "subtitle",
    "sourceUrls",
    "truthScore",
    "verdict",
    "createdAt",
    "source",
    "sourceKind",
}

ALLOWED_KINDS = {"music_now_playing", "public_knowledge_brief", "buddy_status"}
ALLOWED_ACTION_TYPES = {"state", "tts", "display"}


def _text(value, limit=180):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _assert_public_payload(label, payload, safe_keys):
    extra = set(payload) - safe_keys
    if extra:
        raise ValueError(f"{label} has unsupported keys: {sorted(extra)}")
    if SECRET_RE.search(json.dumps(payload, ensure_ascii=False)):
        raise ValueError(f"{label} must not contain secrets or profile hashes")


def load_event(raw):
    """Parse one public JSONL envelope and verify that it stays hardware-safe."""
    try:
        event = json.loads(str(raw or "").strip())
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid hardware event JSON: {exc}") from exc
    if not isinstance(event, dict):
        raise ValueError("hardware event must be a JSON object")
    _assert_public_payload("hardware event", event, SAFE_EVENT_KEYS)
    kind = event.get("kind")
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"unsupported hardware event kind: {kind}")
    return event


def _state_for(event):
    state = _text(event.get("state"), 32)
    if state:
        return state
    if event.get("kind") == "public_knowledge_brief":
        return "attention"
    if event.get("kind") == "music_now_playing":
        return "busy"
    return "idle"


def _track_subtitle(event):
    track = event.get("track") if isinstance(event.get("track"), dict) else {}
    artist = _text(track.get("artist"), 80)
    city = _text(track.get("city") or event.get("city"), 80)
    return " · ".join(part for part in [artist, city] if part)


def event_to_actions(event):
    """Convert one public event into device actions.

    The output is still transport-free. A Pi process can map:
    - state -> LED/expression state,
    - tts -> local speech,
    - display -> OLED/e-ink/UI line.
    """
    event = load_event(json.dumps(event, ensure_ascii=False))
    kind = event["kind"]
    priority = _text(event.get("priority") or "normal", 32)
    created_at = _text(event.get("createdAt"), 64)
    state = _state_for(event)

    actions = [
        {
            "version": ACTION_VERSION,
            "type": "state",
            "transport": "local",
            "state": state,
            "priority": priority,
            "sourceKind": kind,
            "source": _text(event.get("source"), 80),
            "createdAt": created_at,
        }
    ]

    if event.get("speak"):
        actions.append(
            {
                "version": ACTION_VERSION,
                "type": "tts",
                "transport": "local-tts",
                "text": _text(event.get("speak"), 160),
                "priority": priority,
                "sourceKind": kind,
                "source": _text(event.get("source"), 80),
                "createdAt": created_at,
            }
        )

    display = {
        "version": ACTION_VERSION,
        "type": "display",
        "transport": "display",
        "title": _text(event.get("title") or kind, 80),
        "body": _text(event.get("body") or event.get("speak"), 220),
        "priority": priority,
        "sourceKind": kind,
        "source": _text(event.get("source"), 80),
        "createdAt": created_at,
    }
    if kind == "music_now_playing":
        subtitle = _track_subtitle(event)
        if subtitle:
            display["subtitle"] = subtitle
    if kind == "public_knowledge_brief":
        score = max(0, min(100, int(event.get("truthScore") or 0)))
        verdict = _text(event.get("verdict") or "review_required", 40)
        display["truthScore"] = score
        display["verdict"] = verdict
        display["subtitle"] = f"Truth Score {score} · {verdict}"
        urls = [_text(item, 240) for item in event.get("sourceUrls", []) if _text(item, 240)][:4]
        if urls:
            display["sourceUrls"] = urls
    actions.append(display)

    for action in actions:
        _assert_public_action(action)
    return actions


def _assert_public_action(action):
    _assert_public_payload("hardware action", action, SAFE_ACTION_KEYS)
    if action.get("type") not in ALLOWED_ACTION_TYPES:
        raise ValueError(f"unsupported hardware action type: {action.get('type')}")


def action_to_json_line(action):
    _assert_public_action(action)
    return json.dumps(action, ensure_ascii=False, separators=(",", ":")) + "\n"


def _iter_lines(paths):
    if paths:
        for path in paths:
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle:
                    yield line
    else:
        for line in sys.stdin:
            yield line


def main(argv=None):
    argv = list(argv or sys.argv[1:])
    try:
        for line in _iter_lines(argv):
            if not line.strip():
                continue
            for action in event_to_actions(load_event(line)):
                sys.stdout.write(action_to_json_line(action))
        return 0
    except ValueError as exc:
        print(f"frost_pi_event_adapter error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
