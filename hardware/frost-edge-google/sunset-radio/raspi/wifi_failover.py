#!/usr/bin/env python3
"""Prefer user hotspots for portable Raspberry Pi playback.

Secrets live in an env file on the Pi, not in git. Example variables:
SUNSET_WIFI_1_SSID="Phone hotspot"
SUNSET_WIFI_1_PASSWORD="..."
SUNSET_WIFI_1_PRIORITY=90
"""
import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass


DEFAULT_ENV_PATHS = (
    "/etc/sunset-radio/wifi-failover.env",
    os.path.join(os.path.expanduser("~"), ".config", "sunset-radio", "wifi-failover.env"),
)
DEFAULT_IFACE = os.environ.get("SUNSET_WIFI_IFACE", "wlan0")
CONNECTION_PREFIX = os.environ.get("SUNSET_WIFI_CONNECTION_PREFIX", "Sunset Radio - ")


@dataclass
class Profile:
    ssid: str
    password: str
    priority: int
    connection: str
    aliases: tuple = ()


def parse_env_value(value):
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        parts = shlex.split(value, comments=False, posix=True)
        if len(parts) == 1:
            return parts[0]
    except ValueError:
        pass
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def load_env_file(path):
    data = {}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                raw = line.strip()
                if not raw or raw.startswith("#") or "=" not in raw:
                    continue
                key, value = raw.split("=", 1)
                key = key.strip()
                if not key:
                    continue
                data[key] = parse_env_value(value)
    except OSError:
        pass
    return data


def load_env(paths=None):
    env = {}
    for path in paths or DEFAULT_ENV_PATHS:
        env.update(load_env_file(path))
    env.update(os.environ)
    return env


def int_value(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def env_timeout(env, key, default):
    return max(1, int_value((env or os.environ).get(key), default))


def split_aliases(value):
    aliases = []
    for item in str(value or "").replace("\n", ",").split(","):
        alias = item.strip()
        if alias and alias not in aliases:
            aliases.append(alias)
    return tuple(aliases)


def normalized_ssid(value):
    return re.sub(r"\s+", "", str(value or "").casefold())


def profile_ssid_names(profile):
    names = [profile.ssid]
    for alias in getattr(profile, "aliases", ()) or ():
        if alias and alias not in names:
            names.append(alias)
    return names


def match_visible_ssid(profile, visible_ssids):
    if not visible_ssids:
        return ""
    for name in profile_ssid_names(profile):
        if name in visible_ssids:
            return name
    visible_by_key = {normalized_ssid(ssid): ssid for ssid in visible_ssids}
    for name in profile_ssid_names(profile):
        matched = visible_by_key.get(normalized_ssid(name))
        if matched:
            return matched
    return ""


def with_visible_ssid(profile, actual_ssid):
    if not actual_ssid or actual_ssid == profile.ssid:
        return profile
    return Profile(
        ssid=actual_ssid,
        password=profile.password,
        priority=profile.priority,
        connection=profile.connection,
        aliases=profile.aliases,
    )


def load_profiles(env):
    raw_json = env.get("SUNSET_WIFI_PROFILES_JSON", "").strip()
    profiles = []
    if raw_json:
        try:
            payload = json.loads(raw_json)
        except json.JSONDecodeError:
            payload = []
        for index, item in enumerate(payload if isinstance(payload, list) else []):
            if not isinstance(item, dict):
                continue
            ssid = str(item.get("ssid") or "").strip()
            if not ssid:
                continue
            password = str(item.get("password") or "")
            priority = int_value(item.get("priority"), 90 - index)
            connection = str(item.get("connection") or f"{CONNECTION_PREFIX}{ssid}").strip()
            if isinstance(item.get("aliases"), list):
                aliases = tuple(str(alias).strip() for alias in item.get("aliases", []) if str(alias).strip())
            else:
                aliases = split_aliases(item.get("aliases", ""))
            profiles.append(Profile(ssid=ssid, password=password, priority=priority, connection=connection, aliases=aliases))

    for index in range(1, 10):
        ssid = (
            env.get(f"SUNSET_WIFI_{index}_SSID")
            or env.get(f"SUNSET_WIFI_SSID_{index}")
            or ""
        ).strip()
        if not ssid:
            continue
        password = env.get(f"SUNSET_WIFI_{index}_PASSWORD") or env.get(f"SUNSET_WIFI_PASSWORD_{index}") or ""
        priority = int_value(env.get(f"SUNSET_WIFI_{index}_PRIORITY") or env.get(f"SUNSET_WIFI_PRIORITY_{index}"), 90 - index)
        connection = (env.get(f"SUNSET_WIFI_{index}_CONNECTION") or f"{CONNECTION_PREFIX}{ssid}").strip()
        aliases = split_aliases(env.get(f"SUNSET_WIFI_{index}_ALIASES") or env.get(f"SUNSET_WIFI_ALIASES_{index}") or "")
        if not any(profile.ssid == ssid for profile in profiles):
            profiles.append(Profile(ssid=ssid, password=password, priority=priority, connection=connection, aliases=aliases))
    profiles.sort(key=lambda item: item.priority, reverse=True)
    return profiles


def run_nmcli(args, timeout=14):
    command = ["nmcli"] + list(args)
    try:
        return subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def split_nmcli_line(line):
    parts = []
    current = []
    escaped = False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


def scan_wifi(runner=run_nmcli, iface=DEFAULT_IFACE, timeout=None):
    result = runner(
        ["-t", "--escape", "yes", "-f", "SSID,SIGNAL", "dev", "wifi", "list", "ifname", iface, "--rescan", "yes"],
        timeout=timeout if timeout is not None else env_timeout(None, "SUNSET_WIFI_SCAN_TIMEOUT", 18),
    )
    networks = []
    for line in result.stdout.splitlines():
        parts = split_nmcli_line(line)
        if not parts:
            continue
        ssid = parts[0].strip()
        if not ssid:
            continue
        signal = int_value(parts[1] if len(parts) > 1 else None, 0)
        networks.append({"ssid": ssid, "signal": signal})
    by_ssid = {}
    for network in networks:
        current = by_ssid.get(network["ssid"])
        if not current or network["signal"] > current["signal"]:
            by_ssid[network["ssid"]] = network
    return {
        "ok": result.returncode == 0,
        "error": result.stderr.strip(),
        "networks": sorted(by_ssid.values(), key=lambda item: item["signal"], reverse=True),
    }


def current_wifi(runner=run_nmcli, timeout=None):
    result = runner(
        ["-t", "--escape", "yes", "-f", "ACTIVE,SSID", "dev", "wifi"],
        timeout=timeout if timeout is not None else env_timeout(None, "SUNSET_WIFI_CURRENT_TIMEOUT", 6),
    )
    for line in result.stdout.splitlines():
        parts = split_nmcli_line(line)
        if len(parts) >= 2 and parts[0] == "yes":
            return parts[1]
    return ""


def sanitized_profiles(profiles):
    return [
        {
            "ssid": profile.ssid,
            "priority": profile.priority,
            "connection": profile.connection,
            "passwordSet": bool(profile.password),
        }
        for profile in profiles
    ]


def configure_profile(profile, runner=run_nmcli, iface=DEFAULT_IFACE, dry_run=False, timeouts=None):
    timeouts = timeouts or {}
    if dry_run:
        return {"ok": True, "connection": profile.connection, "dryRun": True}
    show = runner(["connection", "show", profile.connection], timeout=timeouts.get("show", env_timeout(None, "SUNSET_WIFI_SHOW_TIMEOUT", 5)))
    if show.returncode != 0:
        add = runner(
            [
                "connection",
                "add",
                "type",
                "wifi",
                "ifname",
                iface,
                "con-name",
                profile.connection,
                "ssid",
                profile.ssid,
            ],
            timeout=timeouts.get("add", env_timeout(None, "SUNSET_WIFI_ADD_TIMEOUT", 10)),
        )
        if add.returncode != 0:
            return {"ok": False, "connection": profile.connection, "error": add.stderr.strip() or add.stdout.strip()}
    args = [
        "connection",
        "modify",
        profile.connection,
        "connection.autoconnect",
        "yes",
        "connection.autoconnect-priority",
        str(profile.priority),
        "802-11-wireless.ssid",
        profile.ssid,
        "ipv4.method",
        "auto",
        "ipv6.method",
        "auto",
    ]
    if profile.password:
        args.extend([
            "802-11-wireless-security.key-mgmt",
            "wpa-psk",
            "802-11-wireless-security.psk",
            profile.password,
        ])
    modify = runner(args, timeout=timeouts.get("modify", env_timeout(None, "SUNSET_WIFI_MODIFY_TIMEOUT", 10)))
    return {
        "ok": modify.returncode == 0,
        "connection": profile.connection,
        "error": modify.stderr.strip() if modify.returncode else "",
    }


def connect_profile(profile, runner=run_nmcli, iface=DEFAULT_IFACE, dry_run=False, timeout=None):
    if dry_run:
        return {"ok": True, "ssid": profile.ssid, "connection": profile.connection, "dryRun": True}
    result = runner(
        ["connection", "up", profile.connection, "ifname", iface],
        timeout=timeout if timeout is not None else env_timeout(None, "SUNSET_WIFI_CONNECT_TIMEOUT", 20),
    )
    return {
        "ok": result.returncode == 0,
        "ssid": profile.ssid,
        "connection": profile.connection,
        "error": result.stderr.strip() if result.returncode else "",
    }


def fallback_to_existing(runner=run_nmcli, iface=DEFAULT_IFACE, dry_run=False, timeout=None):
    if dry_run:
        return {"ok": True, "action": "existing-profile-fallback", "dryRun": True}
    result = runner(
        ["device", "connect", iface],
        timeout=timeout if timeout is not None else env_timeout(None, "SUNSET_WIFI_FALLBACK_TIMEOUT", 10),
    )
    return {
        "ok": result.returncode == 0,
        "action": "existing-profile-fallback",
        "error": result.stderr.strip() if result.returncode else "",
    }


def run_failover(env=None, runner=run_nmcli, dry_run=False, force=False):
    if env is None:
        env = load_env()
    iface = env.get("SUNSET_WIFI_IFACE") or DEFAULT_IFACE
    profiles = load_profiles(env)
    report = {
        "ok": False,
        "iface": iface,
        "configured": bool(profiles),
        "profiles": sanitized_profiles(profiles),
        "current": "",
        "visible": [],
        "selected": "",
        "actions": [],
        "message": "",
    }
    if not profiles:
        report["ok"] = True
        report["message"] = "未配置热点；保留现有 Wi-Fi 自动连接。"
        return report
    if not shutil.which("nmcli") and runner is run_nmcli:
        report["message"] = "找不到 nmcli；需要 Raspberry Pi OS NetworkManager。"
        return report

    timeouts = {
        "show": env_timeout(env, "SUNSET_WIFI_SHOW_TIMEOUT", 5),
        "add": env_timeout(env, "SUNSET_WIFI_ADD_TIMEOUT", 10),
        "modify": env_timeout(env, "SUNSET_WIFI_MODIFY_TIMEOUT", 10),
        "connect": env_timeout(env, "SUNSET_WIFI_CONNECT_TIMEOUT", 20),
        "current": env_timeout(env, "SUNSET_WIFI_CURRENT_TIMEOUT", 6),
        "fallback": env_timeout(env, "SUNSET_WIFI_FALLBACK_TIMEOUT", 10),
        "scan": env_timeout(env, "SUNSET_WIFI_SCAN_TIMEOUT", 18),
    }
    for profile in profiles:
        action = configure_profile(profile, runner=runner, iface=iface, dry_run=dry_run, timeouts=timeouts)
        report["actions"].append({"type": "configure", **action})

    report["current"] = current_wifi(runner=runner, timeout=timeouts["current"])
    scan = scan_wifi(runner=runner, iface=iface, timeout=timeouts["scan"])
    report["scanOk"] = scan.get("ok")
    report["scanError"] = scan.get("error", "")
    report["visible"] = scan.get("networks", [])
    visible_ssids = {item["ssid"] for item in report["visible"]}
    preferred = [
        with_visible_ssid(profile, actual_ssid)
        for profile in profiles
        for actual_ssid in [match_visible_ssid(profile, visible_ssids)]
        if actual_ssid
    ]

    if preferred and report["current"] == preferred[0].ssid and not force:
        report["ok"] = True
        report["selected"] = preferred[0].ssid
        report["message"] = f"已经连接首选热点：{preferred[0].ssid}。"
        return report

    candidates = preferred or profiles if env.get("SUNSET_WIFI_TRY_SAVED", "1").lower() not in {"0", "false", "no"} else preferred
    for profile in candidates:
        if profile not in profiles:
            report["actions"].append({"type": "configure", **configure_profile(profile, runner=runner, iface=iface, dry_run=dry_run, timeouts=timeouts)})
        action = connect_profile(profile, runner=runner, iface=iface, dry_run=dry_run, timeout=timeouts["connect"])
        report["actions"].append({"type": "connect", **action})
        if action.get("ok"):
            report["ok"] = True
            report["selected"] = profile.ssid
            report["message"] = f"已切到首选热点：{profile.ssid}。"
            return report

    fallback = fallback_to_existing(runner=runner, iface=iface, dry_run=dry_run, timeout=timeouts["fallback"])
    report["actions"].append(fallback)
    report["ok"] = bool(fallback.get("ok"))
    report["message"] = "手机热点未连接；已交回 NetworkManager 使用已保存 Wi-Fi。" if fallback.get("ok") else "手机热点和已保存 Wi-Fi 都未连接。"
    return report


def main():
    parser = argparse.ArgumentParser(description="Prefer Sunset Radio phone hotspots, then fall back to saved Wi-Fi.")
    parser.add_argument("--json", action="store_true", help="Print JSON report.")
    parser.add_argument("--profiles-json", action="store_true", help="Print sanitized configured hotspot profiles and exit.")
    parser.add_argument("--quiet", action="store_true", help="Do not print unless there is an error.")
    parser.add_argument("--dry-run", action="store_true", help="Scan and plan without changing connections.")
    parser.add_argument("--force", action="store_true", help="Reconnect even if already on the preferred hotspot.")
    args = parser.parse_args()
    if args.profiles_json:
        profiles = load_profiles(load_env())
        print(json.dumps({"ok": True, "configured": bool(profiles), "profiles": sanitized_profiles(profiles)}, ensure_ascii=False, indent=2))
        return 0
    report = run_failover(dry_run=args.dry_run, force=args.force)
    if not args.quiet:
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(report.get("message") or ("ok" if report.get("ok") else "failed"))
    return 0 if report.get("ok") or not report.get("configured") else 1


if __name__ == "__main__":
    raise SystemExit(main())
