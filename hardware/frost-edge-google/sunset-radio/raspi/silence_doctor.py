#!/usr/bin/env python3
import argparse
import json
import time

from health_check import (
    active_service,
    enabled_service,
    native_silent_environment,
    pending_count,
    pi_state,
    player_processes,
    run,
    volume_state,
)
from audio_mode import audio_mode_message, load_audio_mode, save_audio_mode


MUTE_GUARD_SERVICE = "sunset-radio-mute-guard"


def ensure_silent(restart_guard=True, mode="hard_mute"):
    actions = []
    mode = "soft_mute" if mode == "soft_mute" else "hard_mute"
    save_audio_mode(mode, reason="silence doctor")
    action_mode = mode.replace("_", "-")
    actions.append(f"audio-mode-{action_mode}")
    run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1"])
    run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "0%"])
    actions.append("audio-muted")
    for name in ("ffplay", "cvlc"):
        result = run(["pkill", "-x", name])
        if result.returncode == 0:
            actions.append(f"stopped-{name}")
    if restart_guard and not active_service(MUTE_GUARD_SERVICE):
        result = run(["sudo", "systemctl", "restart", f"{MUTE_GUARD_SERVICE}.service"])
        if result.returncode == 0:
            actions.append("mute-guard-restarted")
    return actions


def collect_silence_doctor(enforce=False, mode="hard_mute"):
    actions = ensure_silent(mode=mode) if enforce else []
    if enforce:
        time.sleep(0.3)

    volume = volume_state()
    players = player_processes()
    mute_guard_active = active_service(MUTE_GUARD_SERVICE)
    mute_guard_enabled = enabled_service(MUTE_GUARD_SERVICE)
    native = native_silent_environment()
    audio_mode = load_audio_mode()
    try:
        state = pi_state()
        api_ok = True
    except Exception as exc:
        state = {"error": str(exc)}
        api_ok = False

    checks = {
        "api": api_ok,
        "muted": "MUTED" in volume and "0.00" in volume,
        "noPlayers": not players,
        "muteGuardActive": mute_guard_active,
        "muteGuardEnabled": mute_guard_enabled,
        "nativeSilentEnv": bool(native.get("ok")),
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "actions": actions,
        "volume": volume,
        "players": players,
        "state": state,
        "pending": pending_count(state) if api_ok else -1,
        "native": native,
        "audioMode": audio_mode,
    }


def silence_doctor_message(report):
    checks = report.get("checks") or {}
    if report.get("ok"):
        return f"静音守卫在线；音量 0，无播放器进程。{audio_mode_message(report.get('audioMode'))}"
    if not checks.get("muted"):
        return "已重新静音；音频服务还需要再确认一次。"
    if not checks.get("noPlayers"):
        return "已请求关闭播放器；音乐DJ 会保持安静。"
    if not checks.get("muteGuardActive"):
        return "静音守卫正在恢复；音乐DJ 会保持安静。"
    if not checks.get("nativeSilentEnv"):
        return "原生电台已保持静音；启动配置稍后复查。"
    if not checks.get("api"):
        return "静音已执行；状态服务稍后复查。"
    return "静音链路已复查；音乐DJ 会保持安静。"


def main():
    parser = argparse.ArgumentParser(description="Diagnose and optionally re-apply Sunset Radio silent mode.")
    parser.add_argument("--enforce", action="store_true", help="Mute the sink and stop player processes before checking.")
    parser.add_argument(
        "--mode",
        choices=("hard_mute", "soft_mute"),
        default="hard_mute",
        help="Audio mode to write when --enforce is used.",
    )
    args = parser.parse_args()

    report = collect_silence_doctor(enforce=args.enforce, mode=args.mode)
    report["message"] = silence_doctor_message(report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
