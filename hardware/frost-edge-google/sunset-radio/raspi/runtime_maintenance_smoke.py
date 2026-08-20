#!/usr/bin/env python3
import json
import os
import tempfile
import time

import runtime_maintenance


def write_file(path, content=b"x", mtime=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(content)
    if mtime is not None:
        os.utime(path, (mtime, mtime))


def main():
    now = time.time()
    with tempfile.TemporaryDirectory(prefix="sunset-runtime-maintenance-") as tmp:
        cache_dir = os.path.join(tmp, "tts-cache")
        voice_dir = os.path.join(tmp, "voice")
        capture_dir = os.path.join(tmp, "ambient")
        marker_path = os.path.join(tmp, "tts-active")

        for index in range(6):
            write_file(os.path.join(cache_dir, f"{index}.mp3"), b"x" * 2048, mtime=now - index)
        write_file(os.path.join(voice_dir, "sunset-voice-old.wav"), mtime=now - 1800)
        write_file(os.path.join(voice_dir, "sunset-voice-new.wav"), mtime=now)
        write_file(os.path.join(capture_dir, "ambient-old.jpg"), mtime=now - 1800)
        write_file(os.path.join(capture_dir, "ambient-new.jpg"), mtime=now)
        write_file(marker_path, mtime=now - 1800)

        original_limit = runtime_maintenance.TTS_CACHE_LIMIT
        try:
            runtime_maintenance.TTS_CACHE_LIMIT = 3
            report = runtime_maintenance.collect_runtime_maintenance(
                compact_state=False,
                tts_cache_dir=cache_dir,
                voice_tmp_dir=voice_dir,
                capture_dir=capture_dir,
                marker_path=marker_path,
            )
        finally:
            runtime_maintenance.TTS_CACHE_LIMIT = original_limit

        cache_after = sorted(os.listdir(cache_dir))
        voice_after = sorted(os.listdir(voice_dir))
        capture_after = sorted(os.listdir(capture_dir))

    cases = [
        {
            "name": "tts cache keeps newest configured files",
            "passed": cache_after == ["0.mp3", "1.mp3", "2.mp3"],
        },
        {
            "name": "voice temp keeps fresh recordings only",
            "passed": voice_after == ["sunset-voice-new.wav"],
        },
        {
            "name": "ambient capture keeps fresh frame only",
            "passed": capture_after == ["ambient-new.jpg"],
        },
        {
            "name": "stale tts marker is removed",
            "passed": report.get("checks", {}).get("ttsMarker", {}).get("removed") is True,
        },
    ]
    ok = report.get("ok") and all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "report": report}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
