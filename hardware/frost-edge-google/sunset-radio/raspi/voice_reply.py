#!/usr/bin/env python3
"""Local, keyless speech replies for Frost Edge.

Generated reasoning stays inside Google Gemma/Gemini. Speech output is a
device-local accessibility layer and never sends reply text to another cloud.
"""

import argparse
import os
import shlex
import shutil
import subprocess
import tempfile
import time

from audio_mode import audio_allows_dialog, load_audio_mode


TTS_COMMAND = os.environ.get("SUNSET_TTS_COMMAND", "").strip()
TTS_PROVIDER = "device-local"
TTS_TIMEOUT = float(os.environ.get("SUNSET_TTS_TIMEOUT", "22"))
TTS_CACHE_DIR = os.environ.get("SUNSET_TTS_CACHE_DIR", os.path.join(tempfile.gettempdir(), "sunset-radio-tts"))
TTS_MARKER_PATH = os.environ.get("SUNSET_TTS_ACTIVE_PATH", os.path.join(tempfile.gettempdir(), "sunset-radio-tts-active"))
DISABLE_TTS = os.environ.get("SUNSET_DISABLE_TTS", "").lower() in {"1", "true", "yes", "on"}


def ensure_dialog_audio_output():
    if not audio_allows_dialog(load_audio_mode()):
        return
    wpctl = shutil.which("wpctl")
    if not wpctl:
        return
    volume = os.environ.get("SUNSET_DIALOG_VOLUME", "55")
    subprocess.run([wpctl, "set-mute", "@DEFAULT_AUDIO_SINK@", "0"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    subprocess.run([wpctl, "set-volume", "@DEFAULT_AUDIO_SINK@", f"{volume}%"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def touch_marker():
    try:
        with open(TTS_MARKER_PATH, "w", encoding="utf-8") as handle:
            handle.write(str(int(time.time())))
    except OSError:
        pass


def clear_marker():
    try:
        os.unlink(TTS_MARKER_PATH)
    except OSError:
        pass


def run_shell_tts(text, timeout):
    command = TTS_COMMAND.format(text=shlex.quote(text), raw=text)
    touch_marker()
    try:
        result = subprocess.run(command, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
        return result.returncode == 0
    finally:
        clear_marker()


def speak_local(text, timeout):
    engine = shutil.which("espeak-ng") or shutil.which("espeak")
    if not engine:
        return False
    touch_marker()
    try:
        result = subprocess.run(
            [engine, "-v", os.environ.get("SUNSET_TTS_VOICE", "zh"), "-s", os.environ.get("SUNSET_TTS_SPEED", "150"), text],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
        return result.returncode == 0
    finally:
        clear_marker()


def speak_text(text, require_dialog=True, timeout=8):
    text = " ".join(str(text or "").split()).strip()
    if not text or DISABLE_TTS:
        return False
    if require_dialog and not audio_allows_dialog(load_audio_mode()):
        return False
    timeout = max(timeout, TTS_TIMEOUT)
    ensure_dialog_audio_output()
    if TTS_COMMAND:
        return run_shell_tts(text, timeout)
    return speak_local(text, timeout)


def main():
    parser = argparse.ArgumentParser(description="Speak one short reply through a local device command.")
    parser.add_argument("text", nargs="*", help="Text to speak.")
    parser.add_argument("--force", action="store_true", help="Ignore dialog mode for a deliberate hardware test.")
    args = parser.parse_args()
    return 0 if speak_text(" ".join(args.text), require_dialog=not args.force) else 1


if __name__ == "__main__":
    raise SystemExit(main())
