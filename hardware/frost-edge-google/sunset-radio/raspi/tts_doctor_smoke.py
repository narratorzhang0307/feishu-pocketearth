#!/usr/bin/env python3
import json

import tts_doctor


def run_with(configured=True, cache_ready=True, volume="Volume: 0.00 [MUTED]", players=None, native_env="SUNSET_TTS_PROVIDER=device-local"):
    players = [] if players is None else players
    originals = {
        "fetch_tts_status": tts_doctor.fetch_tts_status,
        "dry_run_tts": tts_doctor.dry_run_tts,
        "volume_state": tts_doctor.volume_state,
        "player_processes": tts_doctor.player_processes,
        "service_environment": tts_doctor.service_environment,
        "load_audio_mode": tts_doctor.load_audio_mode,
    }
    try:
        tts_doctor.fetch_tts_status = lambda: {
            "configured": configured,
            "cacheReady": cache_ready,
            "provider": "device-local",
            "engine": "command" if configured else "",
        }
        tts_doctor.dry_run_tts = lambda text: {"dryRun": True, "configured": configured}
        tts_doctor.volume_state = lambda: volume
        tts_doctor.player_processes = lambda: list(players)
        tts_doctor.service_environment = lambda service: native_env
        tts_doctor.load_audio_mode = lambda: {"mode": "soft_mute", "label": "安静待命"}
        return tts_doctor.collect_tts_doctor()
    finally:
        for name, original in originals.items():
            setattr(tts_doctor, name, original)


def main():
    ready = run_with()
    unsafe = run_with(volume="Volume: 0.55", players=["123 player song.mp3"])
    missing = run_with(configured=False)
    no_env = run_with(native_env="")
    cases = [
        {"name": "local speech is ready only while silent", "passed": ready.get("ok") is True and "保持静音" in ready.get("message", "")},
        {"name": "unsafe audio blocks readiness", "passed": unsafe.get("severity") == "unsafe_audio"},
        {"name": "missing local engine stays optional", "passed": missing.get("severity") == "not_configured" and "屏幕文字回复" in missing.get("message", "")},
        {"name": "native service exposes local speech marker", "passed": no_env.get("ok") is False and "环境标记" in no_env.get("message", "")},
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
