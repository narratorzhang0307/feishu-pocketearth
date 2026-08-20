#!/usr/bin/env python3
"""Silent readiness check for the device-local speech layer."""

import argparse
import json
import os
import shutil

from audio_mode import load_audio_mode
from health_check import player_processes, service_environment, volume_state


def local_engine():
    command = os.environ.get("SUNSET_TTS_COMMAND", "").strip()
    if command:
        return "command"
    if shutil.which("espeak-ng") or shutil.which("espeak"):
        return "device-local"
    return ""


def fetch_tts_status():
    engine = local_engine()
    cache_dir = os.environ.get("SUNSET_TTS_CACHE_DIR", "/tmp/sunset-radio-tts")
    try:
        os.makedirs(cache_dir, exist_ok=True)
        cache_ready = os.access(cache_dir, os.W_OK)
    except OSError:
        cache_ready = False
    return {
        "configured": bool(engine),
        "cacheReady": cache_ready,
        "provider": "device-local",
        "engine": engine,
    }


def dry_run_tts(_text):
    status = fetch_tts_status()
    return {"dryRun": True, "configured": bool(status.get("configured"))}


def native_tts_provider(native_env):
    return "device-local" if "SUNSET_TTS_PROVIDER=" in native_env else ""


def collect_tts_doctor():
    status = fetch_tts_status()
    dry = dry_run_tts("你好，我在。")
    volume = volume_state()
    players = player_processes()
    native_env = service_environment("sunset-radio-pi-native")
    checks = {
        "configured": bool(status.get("configured")),
        "cacheReady": bool(status.get("cacheReady")),
        "dryRun": bool(dry.get("dryRun")) and bool(dry.get("configured")),
        "nativeTtsEnv": "SUNSET_TTS_PROVIDER=" in native_env,
        "stillSilent": "MUTED" in volume and "0.00" in volume and not players,
    }
    report = {
        "ok": all(checks.values()),
        "severity": "ok",
        "checks": checks,
        "status": status,
        "dryRun": dry,
        "audioMode": load_audio_mode(),
        "volume": volume,
        "players": players,
        "nativeTtsEnv": {"present": checks["nativeTtsEnv"], "provider": native_tts_provider(native_env)},
    }
    if not report["ok"]:
        if not checks["stillSilent"]:
            report["severity"] = "unsafe_audio"
        elif not checks["configured"]:
            report["severity"] = "not_configured"
        else:
            report["severity"] = "not_ready"
    report["message"] = tts_doctor_message(report)
    return report


def tts_doctor_message(report):
    checks = report.get("checks") or {}
    if report.get("ok"):
        return "本地语音回复已待命，当前仍保持静音。"
    if not checks.get("configured"):
        return "本地语音命令尚未安装；屏幕文字回复仍可用。"
    if not checks.get("cacheReady"):
        return "本地语音缓存目录不可写；需要修复服务权限。"
    if not checks.get("nativeTtsEnv"):
        return "原生服务还缺本地语音环境标记；稍后复查部署配置。"
    if not checks.get("stillSilent"):
        return "本地语音检查完成，但静音状态需要复查。"
    return "本地语音链路需要继续复查。"


def main():
    parser = argparse.ArgumentParser(description="Silent device-local speech readiness check.")
    parser.add_argument("--message", action="store_true")
    args = parser.parse_args()
    report = collect_tts_doctor()
    print(report["message"] if args.message else json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
