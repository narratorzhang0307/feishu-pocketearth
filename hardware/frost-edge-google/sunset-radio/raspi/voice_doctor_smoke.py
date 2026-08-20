#!/usr/bin/env python3
import json
import subprocess

import voice_doctor


COMMAND_ENV = (
    "SUNSET_ARECORD=arecord "
    "SUNSET_MIC_DEVICE=default "
    "SUNSET_ASR_PROVIDER=command "
    "SUNSET_ASR_COMMAND=/home/pi/sunset-radio/raspi/asr_local.py\\ {file} "
    "SUNSET_ASR_MODEL=device-local-asr "
    "SUNSET_ASR_LANGUAGE=zh"
)


def collect_with(
    active=True,
    enabled=True,
    env=COMMAND_ENV,
    arecord_path="/usr/bin/arecord",
    arecord_ok=True,
):
    originals = {
        "active_service": voice_doctor.active_service,
        "enabled_service": voice_doctor.enabled_service,
        "service_environment": voice_doctor.service_environment,
        "service_environment_files": voice_doctor.service_environment_files,
        "shutil_which": voice_doctor.shutil_which,
        "run": voice_doctor.run,
    }
    try:
        voice_doctor.active_service = lambda service: active
        voice_doctor.enabled_service = lambda service: enabled
        voice_doctor.service_environment = lambda service: env
        voice_doctor.service_environment_files = lambda name=voice_doctor.VOICE_SERVICE: []
        voice_doctor.shutil_which = lambda command: arecord_path if command == "arecord" and arecord_path else ""
        voice_doctor.run = lambda args: subprocess.CompletedProcess(
            args,
            0 if arecord_ok else 1,
            "default\n" if arecord_ok else "",
            "" if arecord_ok else "no devices",
        )
        return voice_doctor.collect_voice_doctor()
    finally:
        for name, original in originals.items():
            setattr(voice_doctor, name, original)


def main():
    ready = collect_with()
    ready_compact = voice_doctor.compact_report(ready)
    missing_command = collect_with(env="SUNSET_ASR_PROVIDER=command SUNSET_ARECORD=arecord SUNSET_MIC_DEVICE=default")
    missing_command_compact = voice_doctor.compact_report(missing_command)
    unsupported_provider = collect_with(env="SUNSET_ASR_PROVIDER=banana SUNSET_ARECORD=arecord")
    missing_arecord = collect_with(arecord_path="")
    no_service = collect_with(active=False, enabled=False)
    cases = [
        {
            "name": "local command ASR with arecord passes",
            "passed": ready.get("ok") is True
            and ready.get("asr", {}).get("provider") == "command"
            and ready.get("asr", {}).get("commandConfigured") is True
            and ready.get("wake", {}).get("required") is True,
        },
        {
            "name": "missing command ASR config asks for credentials/config",
            "passed": missing_command.get("ok") is False
            and missing_command.get("severity") == "needs_credentials",
        },
        {
            "name": "unsupported ASR provider is not configured",
            "passed": unsupported_provider.get("ok") is False
            and unsupported_provider.get("severity") == "not_configured",
        },
        {
            "name": "missing arecord is reported as hardware missing",
            "passed": missing_arecord.get("ok") is False
            and missing_arecord.get("severity") == "hardware_missing",
        },
        {
            "name": "disabled voice service remains nonconfigured",
            "passed": no_service.get("ok") is False
            and no_service.get("severity") == "not_configured",
        },
        {
            "name": "voice doctor message stays user-facing",
            "passed": "语音唤醒链路已待命" in ready.get("message", ""),
        },
        {
            "name": "compact voice report shows readiness layers",
            "passed": ready_compact.get("ok") is True
            and ready_compact.get("service", {}).get("active") is True
            and ready_compact.get("microphone", {}).get("listOk") is True
            and ready_compact.get("asr", {}).get("configured") is True
            and ready_compact.get("wake", {}).get("required") is True,
            "detail": ready_compact,
        },
        {
            "name": "compact voice report keeps failed checks readable",
            "passed": missing_command_compact.get("ok") is False
            and missing_command_compact.get("severity") == "needs_credentials"
            and "asrConfigured" in missing_command_compact.get("failedChecks", []),
            "detail": missing_command_compact,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
