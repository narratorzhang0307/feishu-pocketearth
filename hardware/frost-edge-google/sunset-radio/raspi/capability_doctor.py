#!/usr/bin/env python3
import json
import os
import shutil
import urllib.error
import urllib.request

from health_check import service_environment
from voice_doctor import configured_value, env_file_has_any, service_environment_files, systemd_env_value


SERVER_SERVICE = "sunset-radio"
VOICE_SERVICE = "sunset-radio-voice"
NATIVE_SERVICE = "sunset-radio-pi-native"
DEFAULT_ENV_FILES = ["/home/pi/sunset-radio/.env.runtime"]
CHAT_AGENT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat_agent.py")


def env_files_for(*services):
    files = []
    for service in services:
        for path in service_environment_files(service):
            if path not in files:
                files.append(path)
    for path in DEFAULT_ENV_FILES:
        if path not in files:
            files.append(path)
    return files


def has_secret(keys, env, env_files):
    return bool(
        any(os.environ.get(key) or systemd_env_value(env, key) for key in keys)
        or env_file_has_any(keys, env_files)
    )


def server_api_ok():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/api/pi-state", timeout=3) as response:
            return response.status == 200
    except (OSError, TimeoutError, urllib.error.URLError):
        return False


def collect_capability_doctor():
    server_env = service_environment(SERVER_SERVICE)
    voice_env = service_environment(VOICE_SERVICE)
    native_env = service_environment(NATIVE_SERVICE)
    env_files = env_files_for(SERVER_SERVICE, VOICE_SERVICE, NATIVE_SERVICE)
    asr_provider = configured_value("SUNSET_ASR_PROVIDER", voice_env, env_files, "command").strip().lower()
    asr_command = configured_value("SUNSET_ASR_COMMAND", voice_env, env_files, "")
    chat_fallback = configured_value("SUNSET_CHAT_FALLBACK", native_env, env_files, "1").strip().lower()
    capabilities = {
        "cloudGemini": {
            "ready": has_secret(["GEMINI_API_KEY", "GMI_API_KEY"], server_env, env_files),
            "label": "Gemini 云端补全",
            "provider": "google-gemini",
        },
        "localTts": {
            "ready": bool(shutil.which("espeak-ng") or shutil.which("espeak")),
            "label": "本地语音回复",
            "provider": "device-local",
        },
        "asrWake": {
            "ready": (
                asr_provider == "command"
                and bool(asr_command)
            ),
            "label": "麦克风识别",
            "provider": asr_provider,
        },
        "nativeControl": {
            "ready": "SUNSET_NATIVE_CLAIM_AFTER_MS=" in native_env and "SUNSET_AUDIO_DEFAULT_MODE=" in native_env,
            "label": "本机控制",
            "provider": "raspi",
        },
        "chatFallback": {
            "ready": os.path.exists(CHAT_AGENT_PATH) and chat_fallback not in {"0", "false", "no", "off"},
            "label": "对话兜底",
            "provider": "google-gemma/local-cache",
        },
    }
    ready = [name for name, item in capabilities.items() if item.get("ready")]
    pending = [name for name, item in capabilities.items() if not item.get("ready")]
    checks = {
        "api": server_api_ok(),
        "envReadable": bool(env_files),
        "nativeControl": bool(capabilities["nativeControl"]["ready"]),
        "chatFallback": bool(capabilities["chatFallback"]["ready"]),
    }
    report = {
        "ok": all(checks.values()),
        "checks": checks,
        "capabilities": capabilities,
        "readyCapabilities": ready,
        "pendingCapabilities": pending,
        "envFiles": env_files,
    }
    report["message"] = capability_message(report)
    return report


def capability_message(report):
    if not report.get("checks", {}).get("api"):
        return "能力总览暂时读不到本机服务；稍后复查。"
    capabilities = report.get("capabilities") or {}
    ready_labels = [item["label"] for item in capabilities.values() if item.get("ready")]
    pending_labels = [item["label"] for item in capabilities.values() if not item.get("ready")]
    if pending_labels:
        return f"已就绪：{'、'.join(ready_labels) or '基础服务'}；待配置：{'、'.join(pending_labels)}。"
    return f"能力总览已就绪：{'、'.join(ready_labels)}。"


def main():
    report = collect_capability_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
