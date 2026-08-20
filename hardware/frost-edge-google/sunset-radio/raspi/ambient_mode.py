#!/usr/bin/env python3
import argparse
import json
import os
import time


MODE_PATH = os.environ.get(
    "SUNSET_AMBIENT_MODE_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-mode.json"),
)
DEFAULT_MODE = "adaptive"
MODES = {"classic", "adaptive", "scan_once"}
MODE_LABELS = {
    "classic": "原声电台",
    "adaptive": "环境自适应",
    "scan_once": "扫描此刻",
}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def normalize_mode(value):
    mode = str(value or "").strip().lower()
    return mode if mode in MODES else DEFAULT_MODE


def load_ambient_mode(path=MODE_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        payload = {}
    mode = normalize_mode(payload.get("mode") if isinstance(payload, dict) else "")
    return {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "updatedAt": payload.get("updatedAt") if isinstance(payload, dict) else "",
    }


def save_ambient_mode(mode, path=MODE_PATH):
    mode = normalize_mode(mode)
    payload = {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "updatedAt": now_iso(),
    }
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return payload


def ambient_mode_message(mode_state=None):
    mode_state = mode_state if isinstance(mode_state, dict) else load_ambient_mode()
    mode = normalize_mode(mode_state.get("mode"))
    if mode == "classic":
        return "原声电台：只按 24H 日落主线播放，不使用环境调音。"
    if mode == "scan_once":
        return "扫描此刻：只使用用户主动扫描得到的环境状态。"
    return "环境自适应：24H 主线优先，环境只轻调下一段节目。"


def main():
    parser = argparse.ArgumentParser(description="Read or update Sunset Radio ambient mode.")
    parser.add_argument("mode", nargs="?", choices=sorted(MODES), help="Mode to save.")
    parser.add_argument("--message", action="store_true", help="Print only the short user-facing message.")
    args = parser.parse_args()

    mode_state = save_ambient_mode(args.mode) if args.mode else load_ambient_mode()
    if args.message:
        print(ambient_mode_message(mode_state))
    else:
        print(json.dumps({**mode_state, "message": ambient_mode_message(mode_state)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
