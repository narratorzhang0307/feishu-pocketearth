#!/usr/bin/env python3
import argparse
import json
import os
import re
import shlex

import voice_agent
from health_check import active_service, enabled_service, run, service_environment, shutil_which


VOICE_SERVICE = "sunset-radio-voice"
DEFAULT_ENV_FILES = [
    "/home/pi/sunset-radio/.env.runtime",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.runtime"),
]


def service_environment_files(name=VOICE_SERVICE):
    result = run(["systemctl", "show", f"{name}.service", "--property=EnvironmentFiles", "--value"])
    files = []
    for token in (result.stdout or "").split():
        path = token.split("(", 1)[0].strip()
        if path and path != "n/a":
            files.append(path)
    return files


def env_file_has_any(keys, paths=None):
    paths = list(paths or []) + DEFAULT_ENV_FILES
    seen = set()
    for path in paths:
        if not path or path in seen:
            continue
        seen.add(path)
        try:
            with open(path, "r", encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            continue
        for key in keys:
            if re.search(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=", text, flags=re.MULTILINE):
                return True
    return False


def env_file_value(key, paths=None):
    paths = list(paths or []) + DEFAULT_ENV_FILES
    seen = set()
    for path in paths:
        if not path or path in seen:
            continue
        seen.add(path)
        try:
            with open(path, "r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except OSError:
            continue
        for line in lines:
            match = re.match(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=\s*(.*)\s*$", line)
            if not match:
                continue
            value = match.group(1).strip().strip('"').strip("'")
            return value
    return ""


def systemd_env_value(environment, key):
    try:
        for token in shlex.split(environment or ""):
            if token.startswith(f"{key}="):
                return token.split("=", 1)[1].strip().strip('"').strip("'")
    except ValueError:
        pass
    match = re.search(rf"(?:^|\s){re.escape(key)}=([^\s]+)", environment or "")
    return match.group(1).strip().strip('"').strip("'") if match else ""


def configured_value(key, environment, env_files, default=""):
    return os.environ.get(key) or systemd_env_value(environment, key) or env_file_value(key, env_files) or default


def command_preview(configured):
    return "configured" if configured else ""


def collect_voice_doctor():
    active = active_service(VOICE_SERVICE)
    enabled = enabled_service(VOICE_SERVICE)
    env = service_environment(VOICE_SERVICE)
    env_files = service_environment_files()
    arecord_cmd = configured_value("SUNSET_ARECORD", env, env_files, voice_agent.ARECORD)
    arecord_path = shutil_which(arecord_cmd)
    arecord_devices = run([arecord_cmd, "-L"]) if arecord_path else None
    provider = configured_value("SUNSET_ASR_PROVIDER", env, env_files, voice_agent.ASR_PROVIDER).strip().lower()
    model = configured_value("SUNSET_ASR_MODEL", env, env_files, voice_agent.ASR_MODEL)
    language = configured_value("SUNSET_ASR_LANGUAGE", env, env_files, voice_agent.ASR_LANGUAGE)
    mic_device = configured_value("SUNSET_MIC_DEVICE", env, env_files, voice_agent.MIC_DEVICE)
    command_configured = bool(configured_value("SUNSET_ASR_COMMAND", env, env_files, voice_agent.ASR_COMMAND))
    provider_supported = provider == "command"
    asr_configured = provider == "command" and command_configured
    checks = {
        "serviceEnabled": enabled,
        "serviceActive": active,
        "arecord": bool(arecord_path),
        "arecordList": bool(arecord_devices and arecord_devices.returncode == 0),
        "providerSupported": provider_supported,
        "asrConfigured": bool(asr_configured),
        "wakeRequired": bool(voice_agent.REQUIRE_WAKE),
    }
    report = {
        "ok": all(checks.values()),
        "severity": "ok",
        "checks": checks,
        "service": {
            "active": active,
            "enabled": enabled,
            "environmentPresent": bool(env),
            "environmentFiles": env_files,
        },
        "microphone": {
            "command": arecord_cmd,
            "arecord": arecord_path,
            "device": mic_device,
            "rate": voice_agent.RATE,
            "channels": voice_agent.CHANNELS,
            "listOk": bool(arecord_devices and arecord_devices.returncode == 0),
        },
        "asr": {
            "provider": provider,
            "model": model,
            "language": language,
            "commandConfigured": command_configured,
            "command": command_preview(command_configured),
        },
        "wake": {
            "required": voice_agent.REQUIRE_WAKE,
            "windowSec": voice_agent.WAKE_WINDOW_SEC,
            "source": voice_agent.COMMAND_SOURCE,
        },
    }
    if not report["ok"]:
        if not enabled and not active:
            report["severity"] = "not_configured"
        elif not provider_supported:
            report["severity"] = "not_configured"
        elif not asr_configured:
            report["severity"] = "needs_credentials"
        elif not arecord_path or not checks["arecordList"]:
            report["severity"] = "hardware_missing"
        else:
            report["severity"] = "not_ready"
    report["message"] = voice_doctor_message(report)
    return report


def voice_doctor_message(report):
    checks = report.get("checks") or {}
    if report.get("ok"):
        return "语音唤醒链路已待命：麦克风、ASR 配置和唤醒窗口都在线。"
    if not checks.get("serviceEnabled") and not checks.get("serviceActive"):
        return "语音服务还未启用；按钮和文字控制可用，麦克风唤醒先保持待配置。"
    if not checks.get("arecord"):
        return "语音服务已启用，但系统还缺 arecord/ALSA 录音工具。"
    if not checks.get("arecordList"):
        return "语音服务已启用，但麦克风设备列表暂时不可读。"
    if not checks.get("providerSupported"):
        return "语音识别提供方配置不在支持范围内。"
    if not checks.get("asrConfigured"):
        return "语音识别还缺 ASR 密钥或命令配置；唤醒会先保持待配置。"
    return "语音唤醒链路需要继续复查。"


def compact_report(report):
    checks = report.get("checks") or {}
    service = report.get("service") or {}
    microphone = report.get("microphone") or {}
    asr = report.get("asr") or {}
    wake = report.get("wake") or {}
    return {
        "ok": bool(report.get("ok")),
        "severity": report.get("severity") or "",
        "message": report.get("message") or "",
        "failedChecks": [name for name, passed in checks.items() if not passed],
        "service": {
            "active": bool(service.get("active")),
            "enabled": bool(service.get("enabled")),
        },
        "microphone": {
            "arecord": bool(microphone.get("arecord")),
            "listOk": bool(microphone.get("listOk")),
            "device": microphone.get("device") or "",
        },
        "asr": {
            "provider": asr.get("provider") or "",
            "model": asr.get("model") or "",
            "language": asr.get("language") or "",
            "configured": bool(asr.get("commandConfigured")),
        },
        "wake": {
            "required": bool(wake.get("required")),
            "windowSec": wake.get("windowSec"),
            "source": wake.get("source") or "",
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Silent microphone / ASR / wake-word readiness check.")
    parser.add_argument("--summary", action="store_true", help="Print compact JSON for recurring monitoring.")
    parser.add_argument("--message", action="store_true", help="Print the short human-readable message only.")
    args = parser.parse_args()
    report = collect_voice_doctor()
    if args.message:
        print(report["message"])
    else:
        output = compact_report(report) if args.summary else report
        print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
