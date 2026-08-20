#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile

import pi_outdoor_ready_check


def ready_report():
    return {
        "ok": True,
        "audio": {"mode": "soft_mute", "players": []},
        "services": {
            "sunset-radio": {"active": True, "enabled": True},
            "sunset-radio-pi-native": {"active": True, "enabled": True},
            "sunset-radio-pisugar-button": {"active": True, "enabled": True},
            "sunset-radio-voice": {"active": True, "enabled": True},
            "sunset-radio-whisplay": {"active": True, "enabled": True},
            "whisplay-daemon": {"active": True, "enabled": True},
        },
        "avatars": {"poseCount": 483},
        "screen": {"ok": True, "message": "ok"},
        "queue": {"ok": True, "message": "clean", "pending": 0, "unclaimedCount": 0},
        "button": {
            "controls": {"long": "开/关电台"},
            "wifiFailover": {
                "enabledOnLongPress": True,
                "configured": True,
                "profiles": [
                    {"ssid": "PocketEarth-iPhone", "priority": 100, "passwordSet": True},
                    {"ssid": "PocketEarth-Android", "priority": 90, "passwordSet": True},
                ],
            },
        },
        "voice": {"ok": True, "message": "ok"},
        "tts": {"ok": True, "audioMode": {"mode": "soft_mute"}, "message": "ok"},
        "ambient": {
            "ok": True,
            "message": "ok",
            "rules": {
                "capture": "manual_only",
                "autoCapture": False,
                "identity": "not_used",
                "emotion": "not_inferred",
            },
        },
    }


class FakeRunner:
    def __init__(self, report=None, return_code=0, stderr=""):
        self.report = report
        self.return_code = return_code
        self.stderr = stderr
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append({"command": command, "kwargs": kwargs})
        stdout = json.dumps(self.report, ensure_ascii=False) if self.report is not None else ""
        return subprocess.CompletedProcess(command, self.return_code, stdout, self.stderr)


def run_with(report=None, return_code=0, stderr="", extra_args=None):
    args = pi_outdoor_ready_check.parse_args([
        "--hosts", "sunset-pi.local",
        "--host-cache", "",
        "--hosts-file", "",
        "--retries", "1",
        "--connect-timeout", "3",
        "--check-timeout", "9",
        "--total-timeout", "12",
    ] + list(extra_args or []))
    runner = FakeRunner(report=report, return_code=return_code, stderr=stderr)
    return pi_outdoor_ready_check.run(args, runner=runner), runner


def main():
    ok_result, ok_runner = run_with(ready_report())

    with tempfile.TemporaryDirectory() as tmp:
        cache_path = os.path.join(tmp, "pi-last-host.txt")
        hosts_file = os.path.join(tmp, "pi-hosts.txt")
        with open(cache_path, "w", encoding="utf-8") as handle:
            handle.write("cached-pi.local\n")
        with open(hosts_file, "w", encoding="utf-8") as handle:
            handle.write("from-file.local\n")
        cached_result, cached_runner = run_with(
            ready_report(),
            extra_args=[
                "--hosts", "cli.local",
                "--host-cache", cache_path,
                "--hosts-file", hosts_file,
            ],
        )

    missing_hotspot = ready_report()
    missing_hotspot["button"]["wifiFailover"]["profiles"] = [
        {"ssid": "PocketEarth-iPhone", "priority": 100, "passwordSet": True},
    ]
    hotspot_result, _ = run_with(missing_hotspot)

    wrong_button = ready_report()
    wrong_button["button"]["controls"]["long"] = "切换静音"
    button_result, _ = run_with(wrong_button)

    busy_queue = ready_report()
    busy_queue["queue"] = {"ok": False, "message": "pending voice command", "pending": 1, "unclaimedCount": 1}
    queue_result, _ = run_with(busy_queue)

    network_result, _ = run_with(None, return_code=255, stderr="ssh timeout")

    rendered_ok = json.dumps(ok_result, ensure_ascii=False)
    command_text = " ".join(ok_runner.calls[0]["command"])
    cases = [
        {
            "name": "ready Pi passes outdoor check",
            "passed": ok_result.get("ok") is True
            and ok_result.get("portableReady") is True
            and ok_result.get("hotspots", [])[0].get("ssid") == "PocketEarth-iPhone",
            "detail": ok_result.get("message"),
        },
        {
            "name": "outdoor check reuses remembered Pi host before static hosts",
            "passed": cached_result.get("host") == "cached-pi.local"
            and "pi@cached-pi.local" in cached_runner.calls[0]["command"],
            "detail": cached_runner.calls[0]["command"],
        },
        {
            "name": "missing fallback phone hotspot fails",
            "passed": hotspot_result.get("ok") is False
            and "portable hotspot failover" in hotspot_result.get("message", ""),
            "detail": hotspot_result.get("message"),
        },
        {
            "name": "legacy long-press mute behavior fails",
            "passed": button_result.get("ok") is False
            and "orange long press" in button_result.get("message", ""),
            "detail": button_result.get("message"),
        },
        {
            "name": "pending command queue blocks outdoor ready",
            "passed": queue_result.get("ok") is False
            and "command queue clean" in queue_result.get("message", ""),
            "detail": queue_result.get("message"),
        },
        {
            "name": "network failure stays distinct from Pi health",
            "passed": network_result.get("ok") is False
            and network_result.get("checks") == []
            and "SSH" in network_result.get("message", ""),
            "detail": network_result.get("message"),
        },
        {
            "name": "does not expose private hotspot password",
            "passed": "123666999" not in rendered_ok and "123666999" not in command_text,
            "detail": command_text,
        },
    ]
    ok = all(case["passed"] for case in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
