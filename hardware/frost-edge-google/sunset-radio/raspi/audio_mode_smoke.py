#!/usr/bin/env python3
import json
import os
import tempfile

import audio_mode


def main():
    with tempfile.TemporaryDirectory(prefix="sunset-audio-mode-smoke-") as tmp:
        path = os.path.join(tmp, "audio-mode.json")
        dialog = audio_mode.save_audio_mode("dialog", ttl_sec=3, reason="smoke", path=path)
        dialog_now = audio_mode.load_audio_mode(path=path, now=audio_mode.parse_iso_seconds(dialog["updatedAt"]) + 1)
        dialog_expired = audio_mode.load_audio_mode(path=path, now=audio_mode.parse_iso_seconds(dialog["updatedAt"]) + 4)

        radio = audio_mode.save_audio_mode("radio", ttl_sec=3, reason="smoke", path=path)
        radio_now = audio_mode.load_audio_mode(path=path, now=audio_mode.parse_iso_seconds(radio["updatedAt"]) + 1)
        radio_expired = audio_mode.load_audio_mode(path=path, now=audio_mode.parse_iso_seconds(radio["updatedAt"]) + 4)

        hard = audio_mode.save_audio_mode("hard_mute", ttl_sec=1, reason="smoke", path=path)
        hard_later = audio_mode.load_audio_mode(path=path, now=audio_mode.parse_iso_seconds(hard["updatedAt"]) + 5)

    cases = [
        {
            "name": "dialog allows only short replies before ttl",
            "passed": audio_mode.audio_allows_dialog(dialog_now) and not audio_mode.audio_allows_music(dialog_now),
        },
        {
            "name": "dialog falls back to soft mute after ttl",
            "passed": dialog_expired.get("mode") == "soft_mute" and not audio_mode.audio_allows_dialog(dialog_expired),
        },
        {
            "name": "radio allows music before ttl",
            "passed": audio_mode.audio_allows_dialog(radio_now) and audio_mode.audio_allows_music(radio_now),
        },
        {
            "name": "radio falls back to soft mute after ttl",
            "passed": radio_expired.get("mode") == "soft_mute" and not audio_mode.audio_allows_music(radio_expired),
        },
        {
            "name": "hard mute never auto-unlocks",
            "passed": hard_later.get("mode") == "hard_mute" and not audio_mode.audio_allows_dialog(hard_later),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
