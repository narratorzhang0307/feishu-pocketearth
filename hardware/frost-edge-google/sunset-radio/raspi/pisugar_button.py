#!/usr/bin/env python3
import argparse
import json
import os
import shlex
import socket
import sys


SOCKET_CANDIDATES = (
    "/tmp/pisugar-server.sock",
    "/run/pisugar-server.sock",
)
WHISPLAY_SETTINGS_PATH = os.environ.get(
    "WHISPLAY_DAEMON_SETTINGS_PATH",
    os.path.join(os.path.expanduser("~"), ".whisplay-daemon", "settings.json"),
)


def socket_path():
    for path in SOCKET_CANDIDATES:
        if os.path.exists(path):
            return path
    return ""


def request(command, timeout=1.5):
    sock_path = socket_path()
    if not sock_path:
        return {"ok": False, "missing": True, "command": command, "response": ""}
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(timeout)
            client.connect(sock_path)
            client.sendall((command.strip() + "\n").encode("utf-8"))
            chunks = []
            while True:
                try:
                    data = client.recv(4096)
                except socket.timeout:
                    break
                if not data:
                    break
                chunks.append(data)
                if b"\n" in data:
                    break
    except Exception as exc:
        return {"ok": False, "error": str(exc), "command": command, "response": ""}
    response = b"".join(chunks).decode("utf-8", "replace").strip()
    return {"ok": "done" in response.lower() or bool(response), "command": command, "response": response}


def shell_for(text, event_name, log_name):
    pi_dir = os.environ.get("SUNSET_PI_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    api = os.environ.get("SUNSET_API", "http://127.0.0.1:8080")
    python = sys.executable or "/usr/bin/python3"
    log_path = f"/tmp/sunset-radio-{log_name}.log"
    script = os.path.join(pi_dir, "raspi", "button_command.py")
    return (
        f"SUNSET_API={shlex.quote(api)} "
        f"{shlex.quote(python)} {shlex.quote(script)} "
        f"--source pisugar --event {shlex.quote(event_name)} {shlex.quote(text)} "
        f"> {shlex.quote(log_path)} 2>&1"
    )


def ptt_shell_for(log_name="pisugar-long"):
    """长按橙色键 → 跑 ptt_arm.py 开一个听写窗（不发命令、不录音，只开窗+提示）。"""
    pi_dir = os.environ.get("SUNSET_PI_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    api = os.environ.get("SUNSET_API", "http://127.0.0.1:8080")
    python = sys.executable or "/usr/bin/python3"
    log_path = f"/tmp/sunset-radio-{log_name}.log"
    script = os.path.join(pi_dir, "raspi", "ptt_arm.py")
    return (
        f"SUNSET_API={shlex.quote(api)} "
        f"{shlex.quote(python)} {shlex.quote(script)} "
        f"> {shlex.quote(log_path)} 2>&1"
    )


def disable_whisplay_home_button():
    payload = {}
    try:
        with open(WHISPLAY_SETTINGS_PATH, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            payload = loaded
    except (OSError, json.JSONDecodeError):
        payload = {}
    changed = payload.get("pisugar_home_button") != "none"
    payload["pisugar_home_button"] = "none"
    payload.setdefault("apps_dir", os.path.join(os.path.expanduser("~"), ".whisplay-daemon", "app"))
    try:
        os.makedirs(os.path.dirname(WHISPLAY_SETTINGS_PATH), exist_ok=True)
        with open(WHISPLAY_SETTINGS_PATH, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
            handle.write("\n")
    except OSError as exc:
        return {"ok": False, "name": "whisplay-settings", "error": str(exc), "changed": changed}
    return {"ok": True, "name": "whisplay-settings", "path": WHISPLAY_SETTINGS_PATH, "changed": changed}


def install_hooks():
    settings_result = disable_whisplay_home_button()
    commands = [
        ("set_button_enable single 1", "single-enable"),
        (f"set_button_shell single {shell_for('下一首', 'single', 'pisugar-single')}", "single-shell"),
        ("set_button_enable double 1", "double-enable"),
        (f"set_button_shell double {shell_for('换个城市', 'double', 'pisugar-double')}", "double-shell"),
        ("set_button_enable long 1", "long-enable"),
        (f"set_button_shell long {ptt_shell_for()}", "long-shell"),
    ]
    results = [settings_result]
    for command, name in commands:
        result = request(command)
        result["name"] = name
        results.append(result)
    return results


def clear_hooks():
    commands = [
        ("set_button_shell single none", "single-shell-clear"),
        ("set_button_enable single 0", "single-disable"),
        ("set_button_shell double none", "double-shell-clear"),
        ("set_button_enable double 0", "double-disable"),
        ("set_button_shell long none", "long-shell-clear"),
        ("set_button_enable long 0", "long-disable"),
    ]
    results = []
    for command, name in commands:
        result = request(command)
        result["name"] = name
        results.append(result)
    return results


def status():
    commands = [
        ("get button_enable single", "single-enable"),
        ("get button_shell single", "single-shell"),
        ("get button_enable double", "double-enable"),
        ("get button_shell double", "double-shell"),
        ("get button_enable long", "long-enable"),
        ("get button_shell long", "long-shell"),
    ]
    results = []
    for command, name in commands:
        result = request(command)
        result["name"] = name
        results.append(result)
    return results


def print_report(action, results):
    ok = all(item.get("ok") or item.get("missing") for item in results)
    print(json.dumps({"ok": ok, "action": action, "socket": socket_path(), "results": results}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="Configure PiSugar side button shortcuts for Sunset Radio.")
    parser.add_argument("--install", action="store_true", help="Map single click to next song and double click to next city.")
    parser.add_argument("--clear", action="store_true", help="Remove Sunset Radio PiSugar button hooks.")
    parser.add_argument("--status", action="store_true", help="Print current PiSugar button hook state.")
    args = parser.parse_args()

    if args.clear:
        return print_report("clear", clear_hooks())
    if args.status:
        return print_report("status", status())
    return print_report("install", install_hooks())


if __name__ == "__main__":
    raise SystemExit(main())
