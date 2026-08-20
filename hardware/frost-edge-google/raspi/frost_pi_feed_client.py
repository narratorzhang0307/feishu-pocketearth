#!/usr/bin/env python3
"""Authenticated HTTP consumer for the Frost Edge Node public-event feed."""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from frost_pi_event_adapter import action_to_json_line, event_to_actions, load_event


def _cursor_file_default():
    return Path.home() / ".local" / "state" / "pocket-earth" / "frost-feed.cursor"


def _read_cursor(path):
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def _validate_cursor(cursor):
    if not cursor:
        raise ValueError("feed response is missing x-frost-next-cursor")
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("feed response has an invalid cursor") from exc
    if not decoded.startswith("frost:") or not decoded[6:].isdigit():
        raise ValueError("feed response has an invalid cursor")


def _write_cursor(path, cursor):
    _validate_cursor(cursor)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(cursor + "\n", encoding="utf-8")
    temporary.replace(path)


def _fetch_once(url, token, cursor, timeout):
    query = urlencode({"after": cursor}) if cursor else ""
    request_url = f"{url}{'&' if '?' in url else '?'}{query}" if query else url
    request = Request(request_url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.status == 204:
                return None, ""
            if response.status != 200:
                raise ValueError(f"feed returned HTTP {response.status}")
            content_type = response.headers.get("Content-Type", "")
            if "application/x-ndjson" not in content_type:
                raise ValueError("feed response is not application/x-ndjson")
            next_cursor = response.headers.get("X-Frost-Next-Cursor", "")
            _validate_cursor(next_cursor)
            raw = response.read().decode("utf-8").strip()
            if not raw or "\n" in raw:
                raise ValueError("feed response must contain exactly one JSONL event")
            return load_event(raw), next_cursor
    except HTTPError as exc:
        raise ValueError(f"feed returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise ValueError(f"feed connection failed: {exc.reason}") from exc


def _arguments(argv):
    parser = argparse.ArgumentParser(description="Consume Pocket Earth public events on a Raspberry Pi")
    parser.add_argument("--once", action="store_true", help="poll once and exit")
    parser.add_argument(
        "--device",
        action="store_true",
        help="apply actions to the Whisplay screen, RGB LED, and local TTS instead of stdout",
    )
    parser.add_argument("--cursor-file", type=Path, default=_cursor_file_default())
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    parser.add_argument("--timeout-seconds", type=float, default=15.0)
    parser.add_argument("--max-retry-seconds", type=float, default=30.0)
    return parser.parse_args(argv)


def main(argv=None):
    args = _arguments(argv)
    url = os.environ.get("FROST_FEED_URL", "").strip()
    token = os.environ.get("FROST_FEED_TOKEN", "").strip()
    if not url or not token:
        print("frost_pi_feed_client error: FROST_FEED_URL and FROST_FEED_TOKEN are required", file=sys.stderr)
        return 2

    driver = None
    if args.device:
        from frost_pi_device_driver import PocketEarthDeviceDriver

        driver = PocketEarthDeviceDriver()

    retry_seconds = max(0.25, args.poll_seconds)
    try:
        while True:
            try:
                event, next_cursor = _fetch_once(
                    url,
                    token,
                    _read_cursor(args.cursor_file),
                    max(1.0, args.timeout_seconds),
                )
                if event is not None:
                    actions = event_to_actions(event)
                    if driver is not None:
                        # The cursor advances only after the physical action group returns.
                        driver.apply_actions(actions)
                    else:
                        for action in actions:
                            sys.stdout.write(action_to_json_line(action))
                        sys.stdout.flush()
                    _write_cursor(args.cursor_file, next_cursor)
                retry_seconds = max(0.25, args.poll_seconds)
            except (ValueError, OSError, RuntimeError) as exc:
                print(f"frost_pi_feed_client error: {exc}", file=sys.stderr, flush=True)
                if args.once:
                    return 2
                time.sleep(retry_seconds)
                retry_seconds = min(max(retry_seconds * 2, 1.0), max(1.0, args.max_retry_seconds))
                continue

            if args.once:
                return 0
            time.sleep(max(0.25, args.poll_seconds))
    except KeyboardInterrupt:
        return 0
    finally:
        if driver is not None:
            driver.close()


if __name__ == "__main__":
    raise SystemExit(main())
