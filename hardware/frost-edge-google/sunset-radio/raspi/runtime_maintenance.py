#!/usr/bin/env python3
import argparse
import json
import os
import time

from ambient_memory import compact_ambient_memory
from ambient_observer import CAPTURE_DIR
from button_events import compact_button_events
from voice_agent import TMP_DIR as VOICE_TMP_DIR
from voice_reply import TTS_CACHE_DIR, TTS_MARKER_PATH


def safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


TTS_CACHE_LIMIT = max(4, min(200, safe_int(os.environ.get("SUNSET_TTS_CACHE_LIMIT"), 32)))
TTS_CACHE_MAX_AGE_SEC = max(3600, safe_int(os.environ.get("SUNSET_TTS_CACHE_MAX_AGE_SEC"), 14 * 24 * 3600))
TEMP_MAX_AGE_SEC = max(60, safe_int(os.environ.get("SUNSET_RUNTIME_TEMP_MAX_AGE_SEC"), 15 * 60))
TTS_MARKER_MAX_AGE_SEC = max(30, safe_int(os.environ.get("SUNSET_TTS_MARKER_MAX_AGE_SEC"), 120))


def file_size(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def file_mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def remove_path(path, dry_run=False):
    if dry_run:
        return True
    try:
        os.remove(path)
        return True
    except OSError:
        return False


def list_matching_files(directory, prefixes=None, suffixes=None):
    prefixes = tuple(prefixes or ())
    suffixes = tuple(suffixes or ())
    if not directory or not os.path.isdir(directory):
        return []
    matches = []
    try:
        names = os.listdir(directory)
    except OSError:
        return []
    for name in names:
        if prefixes and not name.startswith(prefixes):
            continue
        if suffixes and not name.endswith(suffixes):
            continue
        path = os.path.join(directory, name)
        if os.path.islink(path) or not os.path.isfile(path):
            continue
        matches.append({
            "path": path,
            "name": name,
            "mtime": file_mtime(path),
            "size": file_size(path),
        })
    return sorted(matches, key=lambda item: item["mtime"], reverse=True)


def prune_files(directory, prefixes=None, suffixes=None, keep=0, max_age_sec=0, dry_run=False, now=None):
    now = time.time() if now is None else now
    files = list_matching_files(directory, prefixes=prefixes, suffixes=suffixes)
    removed = []
    kept = []
    keep = max(0, safe_int(keep, 0))
    max_age_sec = max(0, safe_int(max_age_sec, 0))
    for index, item in enumerate(files):
        too_old = bool(max_age_sec) and now - item["mtime"] > max_age_sec
        over_limit = bool(keep) and index >= keep
        if too_old or over_limit:
            if remove_path(item["path"], dry_run=dry_run):
                removed.append({"name": item["name"], "bytes": item["size"], "reason": "age" if too_old else "limit"})
        else:
            kept.append(item)
    return {
        "ok": True,
        "path": directory,
        "seen": len(files),
        "kept": len(kept),
        "removed": len(removed),
        "removedBytes": sum(item["bytes"] for item in removed),
        "dryRun": bool(dry_run),
    }


def prune_stale_marker(path=TTS_MARKER_PATH, max_age_sec=TTS_MARKER_MAX_AGE_SEC, dry_run=False, now=None):
    now = time.time() if now is None else now
    if not path or not os.path.exists(path):
        return {"ok": True, "path": path, "removed": False, "reason": "missing"}
    age = now - file_mtime(path)
    if age <= max_age_sec:
        return {"ok": True, "path": path, "removed": False, "ageSec": round(age, 1)}
    return {
        "ok": remove_path(path, dry_run=dry_run),
        "path": path,
        "removed": True,
        "ageSec": round(age, 1),
        "dryRun": bool(dry_run),
    }


def collect_runtime_maintenance(
    dry_run=False,
    compact_state=True,
    tts_cache_dir=TTS_CACHE_DIR,
    voice_tmp_dir=VOICE_TMP_DIR,
    capture_dir=CAPTURE_DIR,
    marker_path=TTS_MARKER_PATH,
):
    checks = {
        "ttsCache": prune_files(
            tts_cache_dir,
            suffixes=(".mp3", ".wav"),
            keep=TTS_CACHE_LIMIT,
            max_age_sec=TTS_CACHE_MAX_AGE_SEC,
            dry_run=dry_run,
        ),
        "voiceTemp": prune_files(
            voice_tmp_dir,
            prefixes=("sunset-voice-",),
            suffixes=(".wav",),
            max_age_sec=TEMP_MAX_AGE_SEC,
            dry_run=dry_run,
        ),
        "ambientCaptures": prune_files(
            capture_dir,
            prefixes=("ambient-",),
            suffixes=(".jpg", ".jpeg", ".png"),
            max_age_sec=TEMP_MAX_AGE_SEC,
            dry_run=dry_run,
        ),
        "ttsMarker": prune_stale_marker(marker_path, dry_run=dry_run),
    }
    if compact_state and not dry_run:
        checks["buttonEvents"] = compact_button_events()
        checks["ambientMemory"] = compact_ambient_memory()
    ok = all(item.get("ok") for item in checks.values())
    removed = sum(item.get("removed", 0) for item in checks.values() if isinstance(item.get("removed"), int))
    report = {
        "ok": ok,
        "checks": checks,
        "removed": removed,
        "dryRun": bool(dry_run),
    }
    report["message"] = runtime_maintenance_message(report)
    return report


def runtime_maintenance_message(report):
    if not report.get("ok"):
        return "树莓派维护检查有一项没完成；稍后继续复查。"
    removed = report.get("removed", 0)
    if removed:
        return f"树莓派维护完成：清理了 {removed} 个过期缓存/临时文件，仍保持静音。"
    return "树莓派维护完成：缓存、临时文件和有界日志都在安全范围内。"


def main():
    parser = argparse.ArgumentParser(description="Quiet runtime maintenance for Sunset Radio Raspberry Pi.")
    parser.add_argument("--dry-run", action="store_true", help="Report what would be removed without deleting files.")
    args = parser.parse_args()
    report = collect_runtime_maintenance(dry_run=args.dry_run)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
