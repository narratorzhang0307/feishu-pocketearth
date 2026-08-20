#!/usr/bin/env python3
import argparse
import json
import os
from collections import Counter


MEMORY_PATH = os.environ.get(
    "SUNSET_AMBIENT_MEMORY_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-memory.json"),
)


def safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


MEMORY_LIMIT = max(2, min(100, safe_int(os.environ.get("SUNSET_AMBIENT_MEMORY_LIMIT"), 12)))

PRIVACY_POLICY = {
    "retention": "structured_recent_states_only",
    "images": "not_stored",
    "identity": "not_used",
    "emotion": "not_inferred",
}


def safe_float(value, fallback=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def load_ambient_memory(path=MEMORY_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"entries": [], "privacy": PRIVACY_POLICY}
    entries = payload.get("entries") if isinstance(payload, dict) else []
    return {
        "entries": entries if isinstance(entries, list) else [],
        "privacy": payload.get("privacy") or PRIVACY_POLICY if isinstance(payload, dict) else PRIVACY_POLICY,
    }


def compact_state(state):
    state = state if isinstance(state, dict) else {}
    camera = state.get("camera") if isinstance(state.get("camera"), dict) else {}
    signals = state.get("signals") if isinstance(state.get("signals"), dict) else {}
    tags = state.get("tags") if isinstance(state.get("tags"), list) else []
    entry = {
        "updatedAt": state.get("updatedAt") or "",
        "ok": bool(state.get("ok")),
        "stage": state.get("stage") or "unknown",
        "summary": str(state.get("summary") or "")[:140],
        "scene": str(state.get("scene") or "")[:120],
        "light": state.get("light") or signals.get("light") or "unknown",
        "activity": state.get("activity") or signals.get("activity") or "unknown",
        "tags": [str(tag)[:24] for tag in tags[:5]],
        "confidence": safe_float(state.get("confidence"), 0.0),
        "camera": {
            "available": bool(camera.get("available")),
            "model": camera.get("model") or "",
        },
        "blockedReason": str(state.get("blockedReason") or "")[:160],
    }
    if signals:
        entry["signals"] = {
            "brightness": safe_float(signals.get("brightness")),
            "contrast": safe_float(signals.get("contrast")),
            "light": signals.get("light") or "unknown",
        }
    return entry


def save_ambient_memory(memory, path=MEMORY_PATH):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(memory, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return memory


def remember_ambient_state(state, path=MEMORY_PATH, limit=MEMORY_LIMIT):
    memory = load_ambient_memory(path)
    entry = compact_state(state)
    limit = max(1, min(100, safe_int(limit, MEMORY_LIMIT)))
    entries = [item for item in memory.get("entries", []) if item.get("updatedAt") != entry.get("updatedAt")]
    entries.append(entry)
    entries = entries[-limit:]
    return save_ambient_memory({"entries": entries, "privacy": PRIVACY_POLICY}, path)


def compact_ambient_memory(path=MEMORY_PATH, limit=MEMORY_LIMIT):
    limit = max(1, min(100, safe_int(limit, MEMORY_LIMIT)))
    memory = load_ambient_memory(path)
    entries = memory.get("entries") if isinstance(memory.get("entries"), list) else []
    compacted = entries[-limit:]
    payload = {"entries": compacted, "privacy": memory.get("privacy") or PRIVACY_POLICY}
    save_ambient_memory(payload, path)
    return {
        "ok": True,
        "path": path,
        "originalCount": len(entries),
        "kept": len(compacted),
        "compacted": len(entries) > len(compacted),
    }


def brightness(entry):
    signals = entry.get("signals") if isinstance(entry.get("signals"), dict) else {}
    return safe_float(signals.get("brightness"))


def light_trend(entries):
    values = [value for value in (brightness(entry) for entry in entries if entry.get("ok")) if value is not None]
    if len(values) < 2:
        return "unknown"
    delta = values[-1] - values[0]
    if delta <= -0.12:
        return "dimming"
    if delta >= 0.12:
        return "brightening"
    return "steady"


def memory_report(memory=None):
    memory = memory if isinstance(memory, dict) else load_ambient_memory()
    entries = memory.get("entries") if isinstance(memory.get("entries"), list) else []
    usable = [entry for entry in entries if entry.get("ok")]
    blocked = [entry for entry in entries if not entry.get("ok")]
    lights = Counter(str(entry.get("light") or "unknown") for entry in usable)
    activities = Counter(str(entry.get("activity") or "unknown") for entry in usable)
    latest = entries[-1] if entries else {}
    return {
        "ok": bool(entries),
        "count": len(entries),
        "usableCount": len(usable),
        "blockedCount": len(blocked),
        "latest": latest,
        "dominantLight": lights.most_common(1)[0][0] if lights else "unknown",
        "dominantActivity": activities.most_common(1)[0][0] if activities else "unknown",
        "lightTrend": light_trend(entries),
        "privacy": memory.get("privacy") or PRIVACY_POLICY,
    }


def ambient_memory_message(report=None):
    report = report if isinstance(report, dict) else memory_report()
    if not report.get("count"):
        return "环境DJ 还没有短时记忆；先说“环境感知”或“扫描此刻”。"
    if not report.get("usableCount"):
        latest = report.get("latest") or {}
        reason = latest.get("blockedReason") or latest.get("summary") or "相机还没准备好"
        return f"环境DJ 记下了最近阻塞点：{reason}"
    trend_text = {
        "dimming": "光线在变暗",
        "brightening": "光线在变亮",
        "steady": "光线较稳定",
        "unknown": "光线趋势待确认",
    }.get(report.get("lightTrend"), "光线趋势待确认")
    latest = report.get("latest") or {}
    scene = latest.get("scene") or latest.get("summary") or "最近环境"
    return f"{trend_text}；最近{report.get('usableCount')}次观察用于下一段调音：{scene}"


def main():
    parser = argparse.ArgumentParser(description="Summarize Sunset Radio ambient short-term memory.")
    parser.add_argument("--message", action="store_true", help="Print only the short user-facing message.")
    parser.add_argument("--compact", action="store_true", help="Trim the memory file to the configured recent-state limit.")
    args = parser.parse_args()

    if args.compact:
        print(json.dumps(compact_ambient_memory(), ensure_ascii=False, indent=2))
        return 0

    report = memory_report()
    if args.message:
        print(ambient_memory_message(report))
    else:
        print(json.dumps({**report, "message": ambient_memory_message(report)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
