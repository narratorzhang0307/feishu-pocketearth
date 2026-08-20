#!/usr/bin/env python3
import json

import silence_doctor


class Result:
    def __init__(self, returncode=0):
        self.returncode = returncode
        self.stdout = ""
        self.stderr = ""


def main():
    calls = []
    modes = []

    originals = {
        "run": silence_doctor.run,
        "active_service": silence_doctor.active_service,
        "enabled_service": silence_doctor.enabled_service,
        "volume_state": silence_doctor.volume_state,
        "player_processes": silence_doctor.player_processes,
        "native_silent_environment": silence_doctor.native_silent_environment,
        "pending_count": silence_doctor.pending_count,
        "pi_state": silence_doctor.pi_state,
        "load_audio_mode": silence_doctor.load_audio_mode,
        "save_audio_mode": silence_doctor.save_audio_mode,
        "time": silence_doctor.time,
    }

    class FakeTime:
        @staticmethod
        def sleep(_seconds):
            calls.append(("sleep",))

    def fake_run(args):
        command = tuple(args)
        calls.append(command)
        if command[:2] == ("pkill", "-x") and command[-1] == "ffplay":
            return Result(0)
        if command[:2] == ("pkill", "-x") and command[-1] == "cvlc":
            return Result(1)
        return Result(0)

    def fake_save_audio_mode(mode, reason=""):
        modes.append((mode, reason))
        return {"mode": mode, "label": "安静待命" if mode == "soft_mute" else "硬静音", "reason": reason}

    def fake_active_service(name):
        if name != silence_doctor.MUTE_GUARD_SERVICE:
            return True
        restart = ("sudo", "systemctl", "restart", "sunset-radio-mute-guard.service")
        return restart in calls

    try:
        silence_doctor.run = fake_run
        silence_doctor.active_service = fake_active_service
        silence_doctor.enabled_service = lambda name: name == silence_doctor.MUTE_GUARD_SERVICE
        silence_doctor.volume_state = lambda: "Volume: 0.00 [MUTED]"
        silence_doctor.player_processes = lambda: []
        silence_doctor.native_silent_environment = lambda: {"ok": True}
        silence_doctor.pending_count = lambda state: int((state or {}).get("pending") or 0)
        silence_doctor.pi_state = lambda: {"label": "静音中", "pending": 0}
        silence_doctor.load_audio_mode = lambda: {"mode": "hard_mute", "label": "硬静音"}
        silence_doctor.save_audio_mode = fake_save_audio_mode
        silence_doctor.time = FakeTime

        actions = silence_doctor.ensure_silent()
        soft_actions = silence_doctor.ensure_silent(mode="soft_mute")
        report = silence_doctor.collect_silence_doctor(enforce=True)
        message = silence_doctor.silence_doctor_message(report)
    finally:
        for name, original in originals.items():
            setattr(silence_doctor, name, original)

    cases = [
        {
            "name": "silence doctor writes hard mute before touching players",
            "passed": modes[:1] == [("hard_mute", "silence doctor")]
            and actions[:2] == ["audio-mode-hard-mute", "audio-muted"],
            "detail": {"modes": modes, "actions": actions},
        },
        {
            "name": "silence doctor can enforce soft mute for unattended checks",
            "passed": ("soft_mute", "silence doctor") in modes
            and soft_actions[:2] == ["audio-mode-soft-mute", "audio-muted"],
            "detail": {"modes": modes, "actions": soft_actions},
        },
        {
            "name": "silence doctor mutes sink to zero volume",
            "passed": ("wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1") in calls
            and ("wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "0%") in calls,
            "detail": calls,
        },
        {
            "name": "silence doctor stops known players without requiring both to exist",
            "passed": "stopped-ffplay" in actions
            and "stopped-cvlc" not in actions
            and ("pkill", "-x", "ffplay") in calls
            and ("pkill", "-x", "cvlc") in calls,
            "detail": actions,
        },
        {
            "name": "silence doctor restarts inactive mute guard",
            "passed": "mute-guard-restarted" in actions
            and ("sudo", "systemctl", "restart", "sunset-radio-mute-guard.service") in calls,
            "detail": actions,
        },
        {
            "name": "silence doctor report stays quiet after enforce",
            "passed": report.get("ok") is True
            and report.get("checks", {}).get("muted") is True
            and report.get("checks", {}).get("noPlayers") is True
            and "静音守卫在线" in message,
            "detail": {"report": report, "message": message},
        },
    ]

    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
