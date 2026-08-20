#!/usr/bin/env python3
"""Check whether the Pi is ready to leave the house.

This desktop-side helper wraps the remote quick unattended check, then verifies
the portable-specific contract: long-press power, phone hotspot failover, silent
safety, voice/TTS readiness, Whisplay, and the full avatar catalog.
"""
import argparse
import json
import subprocess
import sys

import pi_remote_quick_check


EXPECTED_HOTSPOTS = ("PocketEarth-iPhone", "PocketEarth-Android")
MIN_POSE_COUNT = 483


def service_ready(report, name):
    item = (report.get("services") or {}).get(name) or {}
    return bool(item.get("active") and item.get("enabled"))


def hotspot_profiles(report):
    button = report.get("button") or {}
    wifi = button.get("wifiFailover") or {}
    profiles = wifi.get("profiles") or []
    return [p for p in profiles if isinstance(p, dict)]


def profile_summary(profiles):
    return [
        {
            "ssid": str(profile.get("ssid") or ""),
            "priority": profile.get("priority"),
            "passwordSet": bool(profile.get("passwordSet")),
        }
        for profile in profiles
    ]


def evaluate_report(report):
    checks = []

    audio = report.get("audio") or {}
    players = audio.get("players") or []
    checks.append({
        "name": "silent standby",
        "passed": audio.get("mode") in {"soft_mute", "hard_mute"} and not players,
        "detail": {"mode": audio.get("mode"), "players": players},
    })

    for service in (
        "sunset-radio",
        "sunset-radio-pi-native",
        "sunset-radio-pisugar-button",
        "sunset-radio-voice",
        "sunset-radio-whisplay",
        "whisplay-daemon",
    ):
        checks.append({
            "name": f"service {service}",
            "passed": service_ready(report, service),
        })

    avatars = report.get("avatars") or {}
    checks.append({
        "name": "avatar catalog",
        "passed": int(avatars.get("poseCount") or 0) >= MIN_POSE_COUNT,
        "detail": avatars,
    })

    screen = report.get("screen") or {}
    checks.append({
        "name": "whisplay screen",
        "passed": bool(screen.get("ok")),
        "detail": screen.get("message", ""),
    })

    queue = report.get("queue") or {}
    checks.append({
        "name": "command queue clean",
        "passed": bool(queue.get("ok"))
        and int(queue.get("pending") or 0) == 0
        and int(queue.get("unclaimedCount") or 0) == 0,
        "detail": {
            "message": queue.get("message", ""),
            "pending": queue.get("pending"),
            "unclaimedCount": queue.get("unclaimedCount"),
        },
    })

    button = report.get("button") or {}
    controls = button.get("controls") or {}
    checks.append({
        "name": "orange long press toggles radio",
        "passed": controls.get("long") == "开/关电台",
        "detail": controls,
    })

    wifi = button.get("wifiFailover") or {}
    profiles = hotspot_profiles(report)
    names = [str(profile.get("ssid") or "") for profile in profiles]
    expected_present = all(ssid in names for ssid in EXPECTED_HOTSPOTS)
    expected_order = names[:2] == list(EXPECTED_HOTSPOTS)
    passwords_set = all(bool(profile.get("passwordSet")) for profile in profiles if profile.get("ssid") in EXPECTED_HOTSPOTS)
    checks.append({
        "name": "portable hotspot failover",
        "passed": bool(wifi.get("enabledOnLongPress"))
        and bool(wifi.get("configured"))
        and expected_present
        and expected_order
        and passwords_set,
        "detail": {
            "enabledOnLongPress": wifi.get("enabledOnLongPress"),
            "configured": wifi.get("configured"),
            "profiles": profile_summary(profiles),
        },
    })

    checks.append({
        "name": "voice wake ready",
        "passed": bool((report.get("voice") or {}).get("ok")),
        "detail": (report.get("voice") or {}).get("message", ""),
    })
    checks.append({
        "name": "tts ready but silent",
        "passed": bool((report.get("tts") or {}).get("ok"))
        and ((report.get("tts") or {}).get("audioMode") or {}).get("mode") in {"soft_mute", "hard_mute"},
        "detail": (report.get("tts") or {}).get("message", ""),
    })

    ambient = report.get("ambient") or {}
    rules = ambient.get("rules") or {}
    checks.append({
        "name": "ambient privacy boundary",
        "passed": bool(ambient.get("ok"))
        and rules.get("capture") == "manual_only"
        and rules.get("autoCapture") is False
        and rules.get("identity") == "not_used"
        and rules.get("emotion") == "not_inferred",
        "detail": ambient.get("message", ""),
    })

    return checks


def summarize(checks):
    failed = [check for check in checks if not check.get("passed")]
    if failed:
        return "出门检查还有项目没就绪：" + "、".join(check["name"] for check in failed[:3])
    return "出门检查通过：热点、长按开关、语音、小屏和静音保护都就绪。"


def run(args, runner=subprocess.run):
    quick_args = pi_remote_quick_check.parse_args([
        "--hosts", args.hosts,
        "--user", args.user,
        "--key", args.key,
        "--root", args.root,
        "--host-cache", args.host_cache,
        "--hosts-file", args.hosts_file,
        "--retries", str(args.retries),
        "--connect-timeout", str(args.connect_timeout),
        "--check-timeout", str(args.check_timeout),
        "--total-timeout", str(args.total_timeout),
    ])
    remote = pi_remote_quick_check.run(quick_args, runner=runner)
    if not remote.get("ok"):
        return {
            "ok": False,
            "portableReady": False,
            "host": "",
            "message": "无法确认出门状态：Pi 当前无法通过 SSH 完成静默巡检。",
            "remote": remote,
            "checks": [],
        }

    report = remote.get("report") or {}
    checks = evaluate_report(report)
    ok = bool(report.get("ok")) and all(check.get("passed") for check in checks)
    return {
        "ok": ok,
        "portableReady": ok,
        "host": remote.get("host") or "",
        "message": summarize(checks),
        "checks": checks,
        "hotspots": profile_summary(hotspot_profiles(report)),
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Check Sunset Radio Pi outdoor readiness without playing audio.")
    parser.add_argument("--hosts", default=",".join(pi_remote_quick_check.DEFAULT_HOSTS))
    parser.add_argument("--user", default=pi_remote_quick_check.DEFAULT_USER)
    parser.add_argument("--key", default=pi_remote_quick_check.DEFAULT_KEY)
    parser.add_argument("--root", default=pi_remote_quick_check.DEFAULT_ROOT)
    parser.add_argument("--host-cache", default=pi_remote_quick_check.DEFAULT_HOST_CACHE, help="Reuse the last successful Pi host remembered by pi_remote_quick_check.py; pass empty string to disable.")
    parser.add_argument("--hosts-file", default=pi_remote_quick_check.DEFAULT_HOSTS_FILE, help="Optional newline/comma separated extra Pi host candidates.")
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--connect-timeout", type=int, default=6)
    parser.add_argument("--check-timeout", type=int, default=25)
    parser.add_argument("--total-timeout", type=int, default=35)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    result = run(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
