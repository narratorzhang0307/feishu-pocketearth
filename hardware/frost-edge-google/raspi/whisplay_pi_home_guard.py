#!/usr/bin/env python3
"""Make PI HOME the only button-driven Whisplay desktop.

The vendor Bluetooth, Wi-Fi, volume, and demo implementations stay available to
an SSH maintainer, but cannot be reached from the orange button.  A branded safe
frame replaces the vendor app list during foreground gaps, and the daemon's
quad-click gesture is disabled for PI HOME because double-click is legitimate
launcher navigation.  The installer is idempotent and keeps a source backup.
"""

from __future__ import annotations

import argparse
import os
import py_compile
import shutil
import tempfile
from pathlib import Path


DEFAULT_TARGET = Path("/home/pi/Whisplay/daemon/whisplay_daemon.py")
MARKER = "POCKET_EARTH_PI_HOME_GUARD_V2"
OLD_MARKER = "POCKET_EARTH_PI_HOME_GUARD"
DESKTOP_NEEDLE = "    def _render_desktop(self):\n        self.last_frame = None\n"
OLD_DESKTOP_REPLACEMENT = (
    "    def _render_desktop(self):\n"
    f"        # {OLD_MARKER}: PI HOME is the only user-facing project switcher.\n"
    "        if \"pocket-earth-launcher\" in self.apps:\n"
    "            return\n"
    "        self.last_frame = None\n"
)
DESKTOP_REPLACEMENT = (
    "    def _render_desktop(self):\n"
    f"        # {MARKER}: never expose Whisplay's vendor/demo app list.\n"
    "        from PIL import Image, ImageDraw, ImageFont\n"
    "        from daemon_shared import image_to_rgb565_bytes\n"
    "        self.last_frame = None\n"
    "        image = Image.new(\"RGB\", (SCREEN_WIDTH, SCREEN_HEIGHT), (5, 10, 16))\n"
    "        draw = ImageDraw.Draw(image)\n"
    "        font_path = \"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf\"\n"
    "        title = ImageFont.truetype(font_path, 21)\n"
    "        body = ImageFont.truetype(font_path, 15)\n"
    "        draw.rounded_rectangle((14, 18, SCREEN_WIDTH - 14, SCREEN_HEIGHT - 18), "
    "radius=16, fill=(8, 18, 26), outline=(0, 244, 139), width=2)\n"
    "        draw.text((28, 52), \"POCKET EARTH\", font=title, fill=(240, 247, 244))\n"
    "        draw.text((28, 88), \"PI HOME\", font=title, fill=(0, 244, 139))\n"
    "        draw.text((28, 136), \"Restoring your agent...\", font=body, fill=(150, 172, 180))\n"
    "        draw.text((28, 218), \"Private by default\", font=body, fill=(90, 150, 160))\n"
    "        frame = image_to_rgb565_bytes(image)\n"
    "        self.board.draw_image(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, frame)\n"
    "        return\n"
)

EXIT_NEEDLE = "                if app and app.exit_gesture == EXIT_GESTURE_QUAD_CLICK:\n"
EXIT_REPLACEMENT = (
    "                # POCKET_EARTH_PI_HOME_NO_QUAD_EXIT: four quick navigation clicks\n"
    "                # must not revoke PI HOME and strand the user on the daemon desktop.\n"
    "                if (\n"
    "                    app\n"
    "                    and app.app_id != \"pocket-earth-launcher\"\n"
    "                    and app.exit_gesture == EXIT_GESTURE_QUAD_CLICK\n"
    "                ):\n"
)

BUTTON_NEEDLE = (
    "            self._recent_release_times = []\n"
    "            apps = self._app_list()\n"
    "            if not apps:\n"
    "                self._render_desktop()\n"
    "                return\n"
)
BUTTON_REPLACEMENT = (
    "            self._recent_release_times = []\n"
    "            # POCKET_EARTH_PI_HOME_BUTTON_GUARD: a foreground gap may only\n"
    "            # return to PI HOME; it may never select a vendor internal app.\n"
    "            home_app = self.apps.get(\"pocket-earth-launcher\")\n"
    "            if home_app is not None:\n"
    "                try:\n"
    "                    self._launch_app(home_app)\n"
    "                except Exception as exc:\n"
    "                    print(f\"[WhisplayDaemon] PI HOME recovery failed: {exc}\")\n"
    "                    self._render_desktop()\n"
    "                return\n"
    "            apps = self._app_list()\n"
    "            if not apps:\n"
    "                self._render_desktop()\n"
    "                return\n"
)


def backup_path(target: Path) -> Path:
    return target.with_suffix(target.suffix + ".pre-pocket-earth")


def guarded(target: Path) -> bool:
    if not target.is_file():
        return False
    source = target.read_text(encoding="utf-8")
    return all(
        marker in source
        for marker in (
            MARKER,
            "POCKET_EARTH_PI_HOME_NO_QUAD_EXIT",
            "POCKET_EARTH_PI_HOME_BUTTON_GUARD",
        )
    )


def install(target: Path) -> None:
    source = target.read_text(encoding="utf-8")
    if guarded(target):
        py_compile.compile(str(target), doraise=True)
        return
    backup = backup_path(target)
    if not backup.exists():
        shutil.copy2(target, backup)
    if OLD_DESKTOP_REPLACEMENT in source:
        source = source.replace(OLD_DESKTOP_REPLACEMENT, DESKTOP_NEEDLE, 1)
    if source.count(DESKTOP_NEEDLE) != 1:
        raise RuntimeError("unsupported Whisplay daemon: desktop renderer anchor changed")
    if source.count(EXIT_NEEDLE) != 1:
        raise RuntimeError("unsupported Whisplay daemon: exit gesture anchor changed")
    if source.count(BUTTON_NEEDLE) != 1:
        raise RuntimeError("unsupported Whisplay daemon: button desktop anchor changed")
    updated = source.replace(DESKTOP_NEEDLE, DESKTOP_REPLACEMENT, 1)
    updated = updated.replace(EXIT_NEEDLE, EXIT_REPLACEMENT, 1)
    updated = updated.replace(BUTTON_NEEDLE, BUTTON_REPLACEMENT, 1)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, delete=False) as handle:
        handle.write(updated)
        temporary = Path(handle.name)
    temporary.chmod(target.stat().st_mode)
    os.replace(temporary, target)
    py_compile.compile(str(target), doraise=True)


def restore(target: Path) -> None:
    backup = backup_path(target)
    if not backup.is_file():
        raise RuntimeError(f"backup not found: {backup}")
    shutil.copy2(backup, target)
    py_compile.compile(str(target), doraise=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true")
    action.add_argument("--check", action="store_true")
    action.add_argument("--restore", action="store_true")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    args = parser.parse_args(argv)
    if args.install:
        install(args.target)
    elif args.restore:
        restore(args.target)
        print(f"PI HOME desktop guard was restored from backup in {args.target}")
        return 0
    if not guarded(args.target):
        print(f"PI HOME desktop guard is not installed in {args.target}")
        return 2
    print(f"PI HOME desktop guard is installed in {args.target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
