#!/usr/bin/env python3
import json

import wifi_failover


class FakeRunner:
    def __init__(self, visible=None, current="", fail_connect=None):
        self.visible = visible or []
        self.current = current
        self.fail_connect = set(fail_connect or [])
        self.calls = []

    def __call__(self, args, timeout=14):
        self.calls.append({"args": list(args), "timeout": timeout})
        if args[:4] == ["-t", "--escape", "yes", "-f"] and "SSID,SIGNAL" in args:
            body = "\n".join(f"{ssid}:{signal}" for ssid, signal in self.visible)
            return completed(args, 0, body)
        if args[:4] == ["-t", "--escape", "yes", "-f"] and "ACTIVE,SSID" in args:
            body = f"yes:{self.current}\n" if self.current else ""
            return completed(args, 0, body)
        if args[:3] == ["connection", "show", args[-1:][0]]:
            return completed(args, 10, "", "missing")
        if args[:3] == ["connection", "add", "type"]:
            return completed(args, 0, "added")
        if args[:3] == ["connection", "modify", args[2]]:
            return completed(args, 0, "modified")
        if args[:2] == ["connection", "up"]:
            ssid = str(args[2]).replace(wifi_failover.CONNECTION_PREFIX, "")
            if ssid in self.fail_connect:
                return completed(args, 4, "", "unavailable")
            self.current = ssid
            return completed(args, 0, "up")
        if args[:2] == ["device", "connect"]:
            return completed(args, 0, "home")
        return completed(args, 0, "")


def completed(args, returncode=0, stdout="", stderr=""):
    class Result:
        pass
    result = Result()
    result.args = args
    result.returncode = returncode
    result.stdout = stdout
    result.stderr = stderr
    return result


def base_env():
    return {
        "SUNSET_WIFI_1_SSID": "primary phone hotspot",
        "SUNSET_WIFI_1_PASSWORD": "secret-one",
        "SUNSET_WIFI_1_PRIORITY": "100",
        "SUNSET_WIFI_2_SSID": "backup phone hotspot",
        "SUNSET_WIFI_2_PASSWORD": "secret-two",
        "SUNSET_WIFI_2_PRIORITY": "90",
    }


def main():
    visible_primary = FakeRunner(visible=[("backup phone hotspot", 54), ("primary phone hotspot", 71)])
    report_primary = wifi_failover.run_failover(env=base_env(), runner=visible_primary)
    serialized = json.dumps(report_primary, ensure_ascii=False)

    visible_secondary = FakeRunner(visible=[("backup phone hotspot", 50)], fail_connect={"primary phone hotspot"})
    report_secondary = wifi_failover.run_failover(env=base_env(), runner=visible_secondary)

    fallback = FakeRunner(visible=[], fail_connect={"primary phone hotspot", "backup phone hotspot"})
    report_fallback = wifi_failover.run_failover(env=base_env(), runner=fallback)

    no_config = wifi_failover.run_failover(env={}, runner=FakeRunner())
    iphone_env = {
        "SUNSET_WIFI_1_SSID": "PocketEarth iPhone",
        "SUNSET_WIFI_1_PASSWORD": "secret-phone",
        "SUNSET_WIFI_1_PRIORITY": "100",
    }
    iphone_runner = FakeRunner(visible=[("pocketearth iphone", 82)])
    report_iphone = wifi_failover.run_failover(env=iphone_env, runner=iphone_runner)
    iphone_modify_calls = [
        call["args"]
        for call in iphone_runner.calls
        if call["args"][:2] == ["connection", "modify"]
    ]
    iphone_uses_actual_ssid = any(
        "802-11-wireless.ssid" in args
        and args[args.index("802-11-wireless.ssid") + 1] == "pocketearth iphone"
        for args in iphone_modify_calls
    )
    pi_hotspot_env = {
        "SUNSET_WIFI_1_SSID": "PocketEarth-iPhone",
        "SUNSET_WIFI_1_PASSWORD": "test-primary-psk",
        "SUNSET_WIFI_1_PRIORITY": "120",
        "SUNSET_WIFI_1_ALIASES": "PocketEarth-iPhone,primary iPhone",
        "SUNSET_WIFI_2_SSID": "PocketEarth-Android",
        "SUNSET_WIFI_2_PASSWORD": "test-backup-psk",
        "SUNSET_WIFI_2_PRIORITY": "110",
    }
    pi_hotspot_runner = FakeRunner(visible=[("PocketEarth-Android", 95), ("PocketEarth-iPhone", 42)])
    report_pi_hotspot = wifi_failover.run_failover(env=pi_hotspot_env, runner=pi_hotspot_runner)
    pi_hotspot_serialized = json.dumps(report_pi_hotspot, ensure_ascii=False)
    pi_hotspot_modify_calls = [
        call["args"]
        for call in pi_hotspot_runner.calls
        if call["args"][:2] == ["connection", "modify"]
    ]
    pi_hotspot_uses_actual_ssid = any(
        "802-11-wireless.ssid" in args
        and args[args.index("802-11-wireless.ssid") + 1] == "PocketEarth-iPhone"
        for args in pi_hotspot_modify_calls
    )
    fast_env = {
        **base_env(),
        "SUNSET_WIFI_SCAN_TIMEOUT": "4",
        "SUNSET_WIFI_CONNECT_TIMEOUT": "5",
        "SUNSET_WIFI_FALLBACK_TIMEOUT": "6",
        "SUNSET_WIFI_CURRENT_TIMEOUT": "2",
    }
    fast_runner = FakeRunner(visible=[("primary phone hotspot", 71)])
    wifi_failover.run_failover(env=fast_env, runner=fast_runner)
    fast_timeouts = {
        "scan": next(
            (call["timeout"] for call in fast_runner.calls if "SSID,SIGNAL" in call["args"]),
            None,
        ),
        "connect": next(
            (call["timeout"] for call in fast_runner.calls if call["args"][:2] == ["connection", "up"]),
            None,
        ),
        "current": next(
            (call["timeout"] for call in fast_runner.calls if "ACTIVE,SSID" in call["args"]),
            None,
        ),
    }

    cases = [
        {
            "name": "primary phone hotspot wins when visible",
            "passed": report_primary.get("ok") is True and report_primary.get("selected") == "primary phone hotspot",
            "detail": report_primary.get("message"),
        },
        {
            "name": "secondary phone hotspot is used when primary cannot connect",
            "passed": report_secondary.get("ok") is True and report_secondary.get("selected") == "backup phone hotspot",
            "detail": report_secondary.get("message"),
        },
        {
            "name": "home fallback is attempted when phone hotspots are unavailable",
            "passed": report_fallback.get("ok") is True
            and any(action.get("action") == "existing-profile-fallback" for action in report_fallback.get("actions", [])),
            "detail": report_fallback.get("message"),
        },
        {
            "name": "reports never include Wi-Fi passwords",
            "passed": "secret-one" not in serialized and "secret-two" not in serialized,
            "detail": report_primary.get("profiles"),
        },
        {
            "name": "missing config is a safe no-op",
            "passed": no_config.get("ok") is True and no_config.get("configured") is False,
            "detail": no_config.get("message"),
        },
        {
            "name": "iPhone hotspot spacing and case still match the configured profile",
            "passed": report_iphone.get("ok") is True
            and report_iphone.get("selected") == "pocketearth iphone"
            and iphone_uses_actual_ssid,
            "detail": {
                "selected": report_iphone.get("selected"),
                "modifiedActualSsid": iphone_uses_actual_ssid,
            },
        },
        {
            "name": "Pi hotspot order prefers primary iPhone before PocketEarth-Android",
            "passed": report_pi_hotspot.get("ok") is True
            and report_pi_hotspot.get("selected") == "PocketEarth-iPhone"
            and [profile.get("ssid") for profile in report_pi_hotspot.get("profiles", [])[:2]] == ["PocketEarth-iPhone", "PocketEarth-Android"]
            and [profile.get("priority") for profile in report_pi_hotspot.get("profiles", [])[:2]] == [120, 110]
            and pi_hotspot_uses_actual_ssid
            and "test-primary-psk" not in pi_hotspot_serialized
            and "test-backup-psk" not in pi_hotspot_serialized,
            "detail": {
                "selected": report_pi_hotspot.get("selected"),
                "profiles": report_pi_hotspot.get("profiles"),
                "modifiedActualSsid": pi_hotspot_uses_actual_ssid,
            },
        },
        {
            "name": "per-stage timeouts are honored for button-friendly runs",
            "passed": fast_timeouts == {"scan": 4, "connect": 5, "current": 2},
            "detail": fast_timeouts,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
