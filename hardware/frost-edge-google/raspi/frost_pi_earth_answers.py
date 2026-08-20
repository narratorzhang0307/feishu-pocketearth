#!/usr/bin/env python3
"""Calendar and persistence model for the Whisplay ``地球答案`` experience."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path


DEFAULT_ANSWERS_PATH = Path("/home/pi/earth-answers/earth_answers_365.json")
LOCAL_ANSWERS_PATH = Path(__file__).with_name("earth_answers_365.json")
ANSWERS_PATH = Path(os.environ.get("EARTH_ANSWERS_PATH", str(DEFAULT_ANSWERS_PATH)))
STATE_PATH = Path(
    os.environ.get(
        "EARTH_ANSWERS_STATE_PATH",
        "/var/lib/pocket-earth-edge/earth-answer-state.json",
    )
)


def load_answers(path: Path | None = None) -> list[dict]:
    """Load the reviewed annual edition and reject incomplete packages."""
    candidate = path or ANSWERS_PATH
    if not candidate.exists() and candidate == DEFAULT_ANSWERS_PATH:
        candidate = LOCAL_ANSWERS_PATH
    payload = json.loads(candidate.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or len(payload) != 365:
        raise ValueError("earth answers edition must contain exactly 365 entries")
    dates = [item.get("date") for item in payload]
    if len(set(dates)) != 365 or any(not item.get("quote") or not item.get("author") for item in payload):
        raise ValueError("earth answers edition contains missing or duplicate records")
    return payload


class EarthAnswerState:
    """Keep tomorrow hidden, reveal today once, and browse only backwards."""

    def __init__(self, answers: list[dict] | None = None, state_path: Path | None = None):
        self.answers = answers if answers is not None else load_answers()
        self.state_path = state_path or STATE_PATH
        self.revealed_dates = self._load_revealed_dates()
        self.day_key = ""
        self.today_index = 0
        self.history_offset = 0
        self.phase = "idle"
        self.dice_value = 1
        self.sync_day()

    def _load_revealed_dates(self) -> set[str]:
        try:
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
            return {str(value) for value in payload.get("revealedDates", [])}
        except (OSError, ValueError, TypeError):
            return set()

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(
                {
                    "schema": "pocket-earth-earth-answers-state/v1",
                    "revealedDates": sorted(self.revealed_dates)[-730:],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        temporary.replace(self.state_path)

    def sync_day(self, now: datetime | None = None) -> None:
        current = (now or datetime.now().astimezone()).astimezone()
        day_key = current.strftime("%Y-%m-%d")
        if day_key == self.day_key:
            return
        month_day = current.strftime("%m-%d")
        self.today_index = next(
            (index for index, item in enumerate(self.answers) if item.get("date") == month_day),
            58 if month_day == "02-29" else 0,
        )
        self.day_key = day_key
        self.history_offset = 0
        self.phase = "revealed" if day_key in self.revealed_dates else "idle"

    @property
    def today_revealed(self) -> bool:
        self.sync_day()
        return self.day_key in self.revealed_dates

    @property
    def selected_index(self) -> int:
        return (self.today_index - self.history_offset) % len(self.answers)

    @property
    def selected(self) -> dict:
        self.sync_day()
        return self.answers[self.selected_index]

    @property
    def viewing_today(self) -> bool:
        return self.history_offset == 0

    def start_roll(self) -> bool:
        self.sync_day()
        if self.today_revealed:
            self.phase = "revealed"
            return False
        self.phase = "rolling"
        return True

    def set_roll_frame(self, value: int) -> None:
        self.phase = "rolling"
        self.dice_value = max(1, min(6, int(value)))

    def reveal_today(self) -> None:
        self.sync_day()
        self.revealed_dates.add(self.day_key)
        self.history_offset = 0
        self.phase = "revealed"
        self._save()

    def previous(self) -> None:
        """Walk into history; no input path ever advances into tomorrow."""
        self.sync_day()
        if not self.today_revealed:
            return
        self.history_offset = (self.history_offset + 1) % len(self.answers)
        self.phase = "revealed"
