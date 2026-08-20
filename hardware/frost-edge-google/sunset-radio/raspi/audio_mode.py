#!/usr/bin/env python3
import argparse
import calendar
import json
import os
import time


MODE_PATH = os.environ.get(
    "SUNSET_AUDIO_MODE_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "audio-mode.json"),
)
DEFAULT_MODE = os.environ.get("SUNSET_AUDIO_DEFAULT_MODE", "soft_mute")
MODES = {"hard_mute", "soft_mute", "dialog", "radio"}
MODE_LABELS = {
    "hard_mute": "硬静音",
    "soft_mute": "安静待命",
    "dialog": "对话待命",
    "radio": "电台播放",
}
MODE_MESSAGES = {
    "hard_mute": "硬静音：只在屏幕响应，不出声。",
    "soft_mute": "安静待命：电台不出声，听到唤醒词后进入对话。",
    "dialog": "对话待命：可以短暂回应，不自动放歌。",
    "radio": "电台播放：允许按你的指令出声播放。",
}


def now_ts():
    return int(time.time())


def now_iso(ts=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts if ts is not None else now_ts()))


def parse_iso_seconds(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return calendar.timegm(time.strptime(text, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return None


def normalize_mode(mode):
    mode = str(mode or "").strip().lower()
    return mode if mode in MODES else "soft_mute"


def default_state():
    mode = normalize_mode(DEFAULT_MODE)
    return {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "updatedAt": "",
        "expiresAt": "",
        "reason": "default",
    }


def load_audio_mode(path=MODE_PATH, now=None):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        payload = default_state()
    if not isinstance(payload, dict):
        payload = default_state()
    mode = normalize_mode(payload.get("mode"))
    expires_at = str(payload.get("expiresAt") or "")
    expires_ts = parse_iso_seconds(expires_at)
    expired = bool(expires_ts is not None and expires_ts <= int(now if now is not None else now_ts()))
    if expired and mode in {"dialog", "radio"}:
        mode = "soft_mute"
    return {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "updatedAt": payload.get("updatedAt") or "",
        "expiresAt": "" if expired else expires_at,
        "reason": payload.get("reason") or "",
        "expired": expired,
    }


def save_audio_mode(mode, ttl_sec=0, reason="", path=MODE_PATH):
    mode = normalize_mode(mode)
    now = now_ts()
    ttl = max(0, int(ttl_sec or 0))
    payload = {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "updatedAt": now_iso(now),
        "expiresAt": now_iso(now + ttl) if ttl else "",
        "reason": str(reason or "")[:120],
    }
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return payload


def audio_allows_dialog(state=None):
    state = state if isinstance(state, dict) else load_audio_mode()
    return normalize_mode(state.get("mode")) in {"dialog", "radio"}


def audio_allows_music(state=None):
    state = state if isinstance(state, dict) else load_audio_mode()
    return normalize_mode(state.get("mode")) == "radio"


def is_hard_mute(state=None):
    state = state if isinstance(state, dict) else load_audio_mode()
    return normalize_mode(state.get("mode")) == "hard_mute"


def is_soft_or_hard_mute(state=None):
    state = state if isinstance(state, dict) else load_audio_mode()
    return normalize_mode(state.get("mode")) in {"hard_mute", "soft_mute"}


def audio_mode_message(state=None):
    state = state if isinstance(state, dict) else load_audio_mode()
    return MODE_MESSAGES.get(normalize_mode(state.get("mode")), MODE_MESSAGES["soft_mute"])


def main():
    parser = argparse.ArgumentParser(description="Read or update the Sunset Radio Raspberry Pi audio mode.")
    parser.add_argument("mode", nargs="?", choices=sorted(MODES), help="Mode to save.")
    parser.add_argument("--ttl", type=int, default=0, help="Seconds before dialog/radio mode falls back to soft mute.")
    parser.add_argument("--reason", default="", help="Short reason saved in the mode state.")
    parser.add_argument("--message", action="store_true", help="Print a short user-facing message.")
    parser.add_argument("--mode", dest="print_mode", action="store_true", help="Print only the normalized mode.")
    parser.add_argument("--allows-dialog", action="store_true", help="Exit 0 when short spoken replies are allowed.")
    parser.add_argument("--allows-music", action="store_true", help="Exit 0 when music playback is allowed.")
    args = parser.parse_args()

    state = save_audio_mode(args.mode, ttl_sec=args.ttl, reason=args.reason) if args.mode else load_audio_mode()
    if args.allows_dialog:
        return 0 if audio_allows_dialog(state) else 1
    if args.allows_music:
        return 0 if audio_allows_music(state) else 1
    if args.print_mode:
        print(state["mode"])
    elif args.message:
        print(audio_mode_message(state))
    else:
        print(json.dumps({**state, "message": audio_mode_message(state)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
