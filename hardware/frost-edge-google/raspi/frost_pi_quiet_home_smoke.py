#!/usr/bin/env python3
"""Offline visual/data smoke checks for the Pocket Earth quiet home."""

from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from frost_pi_project_launcher import CONTENT_CACHE, _wrapped_lines, font, font_for_text
from frost_pi_quiet_home import daybook_entry, load_daybook, render_daybook, render_quiet_home


def main() -> int:
    moment = datetime.fromisoformat("2026-07-18T21:06:00+08:00")
    entries = load_daybook()
    assert len(entries) == 31
    assert daybook_entry(moment, entries) == daybook_entry(moment, entries)
    assert all(item.get("line") and item.get("action") for item in entries)

    quiet = render_quiet_home(moment, CONTENT_CACHE, font, font_for_text)
    daybook = render_daybook(moment, entries, font, font_for_text, _wrapped_lines)
    assert quiet.size == (240, 280)
    assert daybook.size == (240, 280)

    with TemporaryDirectory() as directory:
        quiet_path = Path(directory) / "quiet.png"
        daybook_path = Path(directory) / "daybook.png"
        quiet.save(quiet_path)
        daybook.save(daybook_path)
        assert quiet_path.stat().st_size > 2048
        assert daybook_path.stat().st_size > 2048

    print(f"frost_pi_quiet_home smoke passed; entries={len(entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
