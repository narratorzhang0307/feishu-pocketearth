#!/usr/bin/env python3
import json

import capability_doctor


def collect_with(
    api=True,
    server_env="",
    voice_env="",
    native_env="SUNSET_NATIVE_CLAIM_AFTER_MS=150 SUNSET_AUDIO_DEFAULT_MODE=soft_mute",
    asr_provider="command",
    asr_command="/usr/local/bin/asr",
    chat_fallback="1",
    secrets=None,
    env_files=None,
):
    secrets = set(secrets or [])
    env_files = list(env_files or ["/home/pi/sunset-radio/.env.runtime"])
    env_by_service = {
        capability_doctor.SERVER_SERVICE: server_env,
        capability_doctor.VOICE_SERVICE: voice_env,
        capability_doctor.NATIVE_SERVICE: native_env,
    }
    originals = {
        "service_environment": capability_doctor.service_environment,
        "service_environment_files": capability_doctor.service_environment_files,
        "configured_value": capability_doctor.configured_value,
        "has_secret": capability_doctor.has_secret,
        "server_api_ok": capability_doctor.server_api_ok,
    }
    original_which = capability_doctor.shutil.which

    def fake_configured_value(key, _env, _files, default=""):
        if key == "SUNSET_ASR_PROVIDER":
            return asr_provider
        if key == "SUNSET_ASR_COMMAND":
            return asr_command
        if key == "SUNSET_CHAT_FALLBACK":
            return chat_fallback
        return default

    def fake_has_secret(keys, _env, _files):
        return any(key in secrets for key in keys)

    try:
        capability_doctor.service_environment = lambda service: env_by_service.get(service, "")
        capability_doctor.service_environment_files = lambda _service: list(env_files)
        capability_doctor.configured_value = fake_configured_value
        capability_doctor.has_secret = fake_has_secret
        capability_doctor.server_api_ok = lambda: bool(api)
        capability_doctor.shutil.which = lambda name: f"/usr/bin/{name}" if name == "espeak-ng" else None
        return capability_doctor.collect_capability_doctor()
    finally:
        for name, original in originals.items():
            setattr(capability_doctor, name, original)
        capability_doctor.shutil.which = original_which


def main():
    all_ready = collect_with(
        secrets={"GEMINI_API_KEY"},
    )
    missing_cloud = collect_with(secrets=set())
    command_asr = collect_with(
        asr_provider="command",
        asr_command="/usr/local/bin/asr",
        secrets={"GEMINI_API_KEY"},
    )
    missing_native = collect_with(native_env="SUNSET_PLAYER_VOLUME=45", secrets={"GEMINI_API_KEY"})
    api_down = collect_with(api=False, secrets={"GEMINI_API_KEY"})

    cases = [
        {
            "name": "all configured capabilities are reported ready",
            "passed": all_ready.get("ok") is True
            and set(all_ready.get("readyCapabilities") or []) == {"cloudGemini", "localTts", "asrWake", "nativeControl", "chatFallback"}
            and not all_ready.get("pendingCapabilities")
            and "能力总览已就绪" in all_ready.get("message", ""),
            "detail": all_ready,
        },
        {
            "name": "missing cloud secrets are pending without failing the Pi",
            "passed": missing_cloud.get("ok") is True
            and {"cloudGemini"}.issubset(set(missing_cloud.get("pendingCapabilities") or []))
            and "待配置" in missing_cloud.get("message", "")
            and "本机控制" in missing_cloud.get("message", ""),
            "detail": missing_cloud,
        },
        {
            "name": "chat fallback can be reported independently",
            "passed": collect_with(chat_fallback="0").get("capabilities", {}).get("chatFallback", {}).get("ready") is False
            and "chatFallback" in (collect_with(chat_fallback="0").get("pendingCapabilities") or []),
        },
        {
            "name": "local command asr provider is accepted without a cloud key",
            "passed": command_asr.get("ok") is True
            and "asrWake" in (command_asr.get("readyCapabilities") or [])
            and command_asr.get("capabilities", {}).get("asrWake", {}).get("provider") == "command",
            "detail": command_asr,
        },
        {
            "name": "missing native control blocks capability readiness",
            "passed": missing_native.get("ok") is False
            and missing_native.get("checks", {}).get("nativeControl") is False
            and "nativeControl" in (missing_native.get("pendingCapabilities") or []),
            "detail": missing_native,
        },
        {
            "name": "api failure has a readable message",
            "passed": api_down.get("ok") is False
            and api_down.get("checks", {}).get("api") is False
            and "读不到本机服务" in api_down.get("message", ""),
            "detail": api_down,
        },
    ]

    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
