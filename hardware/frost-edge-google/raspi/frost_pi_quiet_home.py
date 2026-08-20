#!/usr/bin/env python3
"""Silent Pocket Earth clock and original daily decision card.

These views are deliberately local and read-only.  They do not call a model,
play audio, or publish anything on-chain; the quiet home only summarizes the
public cache already shipped with the Frost Edge Node.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw


WIDTH = 240
HEIGHT = 280
INK = (10, 10, 12)
PAPER = (245, 244, 239)
GREEN = (0, 244, 139)
CYAN = (30, 202, 255)
MAGENTA = (255, 20, 199)
GREY = (101, 105, 112)
NIGHT = (5, 8, 9)

DEFAULT_DAYBOOK_PATH = Path(__file__).with_name("frost_pi_daybook.json")
WEEKDAYS_ZH = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")
WEEKDAYS_EN = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")


def load_daybook(path: Path = DEFAULT_DAYBOOK_PATH) -> list[dict]:
    """Load only the tiny, audited local daybook schema."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload.get("entries", [])
        if payload.get("schema") == "pocket-earth-daybook/v1" and entries:
            return entries
    except (OSError, ValueError, TypeError):
        pass
    return [
        {
            "line": "在可逆的选择上快一点，在不可逆的选择上睡一晚。",
            "action": "今天先推进一个可以随时回头的小步骤。",
        }
    ]


def daybook_entry(moment: datetime, entries: list[dict]) -> dict:
    """Return one stable entry for the local calendar day."""
    if not entries:
        return {"line": "今天只做一件真正重要的事。", "action": "把它写下来。"}
    return entries[(moment.timetuple().tm_yday - 1) % len(entries)]


def _draw_pixel_globe(draw: ImageDraw.ImageDraw, centre=(120, 132), radius=58) -> None:
    """Draw a Pocket Earth mark without a bitmap dependency."""
    cx, cy = centre
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(box, outline=GREEN, width=4)
    draw.ellipse((cx - 28, cy - radius, cx + 28, cy + radius), outline=(0, 126, 79), width=2)
    draw.ellipse((cx - radius, cy - 24, cx + radius, cy + 24), outline=(0, 126, 79), width=2)
    draw.line((cx, cy - radius, cx, cy + radius), fill=(0, 126, 79), width=2)
    draw.line((cx - radius, cy, cx + radius, cy), fill=(0, 126, 79), width=2)

    # Frost lives inside the world: a consistent square silhouette with a
    # small individual signal mark, rather than a speculative collectible.
    draw.rounded_rectangle((cx - 22, cy - 22, cx + 22, cy + 21), radius=5, fill=NIGHT, outline=PAPER, width=2)
    draw.rectangle((cx - 14, cy - 13, cx - 7, cy - 6), fill=GREEN)
    draw.rectangle((cx + 7, cy - 13, cx + 14, cy - 6), fill=GREEN)
    draw.line((cx - 12, cy + 9, cx + 12, cy + 9), fill=PAPER, width=2)
    draw.rectangle((cx + 16, cy - 26, cx + 23, cy - 19), fill=MAGENTA)

    # A single public signal orbits the globe; it is not a land parcel.
    draw.arc((cx - radius - 13, cy - radius + 8, cx + radius + 13, cy + radius - 8), 205, 340, fill=CYAN, width=2)
    draw.ellipse((cx + radius - 5, cy + radius // 2, cx + radius + 3, cy + radius // 2 + 8), fill=MAGENTA, outline=PAPER, width=1)


def render_quiet_home(moment: datetime, content_cache: dict, font, font_for_text) -> Image.Image:
    """Render the silent, clock-first Pocket Earth home screen."""
    image = Image.new("RGB", (WIDTH, HEIGHT), NIGHT)
    draw = ImageDraw.Draw(image)
    local = moment.astimezone()
    identity = content_cache.get("identity", {})
    edition = content_cache.get("knowledgeEdition", {})

    draw.text((12, 10), "POCKET EARTH", font=font(14, "mono"), fill=PAPER)
    draw.rectangle((212, 9, 228, 27), fill=GREEN, outline=PAPER, width=1)
    draw.text((12, 34), "安静地，和世界待在一起", font=font_for_text("安静地，和世界待在一起", 10), fill=(151, 162, 158))

    clock = local.strftime("%H:%M")
    draw.text((54, 55), clock, font=font(36, "mono"), fill=PAPER)
    date_line = f"{local:%Y.%m.%d}  {WEEKDAYS_EN[local.weekday()]}"
    draw.text((59, 93), date_line, font=font(10, "mono"), fill=GREEN)

    _draw_pixel_globe(draw, centre=(120, 145), radius=48)

    agents = len(identity.get("agentIds", []))
    revision = edition.get("revision", 0)
    draw.rectangle((11, 201, 229, 232), fill=(15, 20, 20), outline=(61, 76, 72), width=1)
    draw.text((19, 208), f"{agents} AGENTS", font=font(9, "mono"), fill=GREEN)
    draw.text((96, 208), f"KNOWLEDGE REV {revision}", font=font(9, "mono"), fill=CYAN)
    draw.ellipse((211, 211, 219, 219), fill=GREEN)

    draw.text((12, 241), "GOOGLE AI · PUBLIC KNOWLEDGE", font=font(8, "mono"), fill=(137, 148, 144))
    draw.text((12, 259), "2X: BACK", font=font(8, "mono"), fill=(90, 102, 98))
    return image


def render_daybook(moment: datetime, entries: list[dict], font, font_for_text, wrap_lines) -> Image.Image:
    """Render an original one-page calendar and decision prompt."""
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)
    local = moment.astimezone()
    entry = daybook_entry(local, entries)

    draw.rectangle((0, 0, WIDTH, 39), fill=INK)
    draw.text((11, 8), "今日一页", font=font_for_text("今日一页", 15, "bold"), fill=PAPER)
    draw.text((173, 11), "DAYBOOK", font=font(8, "mono"), fill=GREEN)

    draw.text((12, 48), f"{local:%Y} / {local:%m}", font=font(9, "mono"), fill=GREY)
    draw.text((11, 65), f"{local:%d}", font=font(52, "mono"), fill=INK)
    draw.text((105, 73), WEEKDAYS_ZH[local.weekday()], font=font_for_text(WEEKDAYS_ZH[local.weekday()], 16, "bold"), fill=INK)
    draw.text((106, 98), local.strftime("%H:%M"), font=font(15, "mono"), fill=GREEN)
    draw.line((12, 125, 228, 125), fill=INK, width=3)

    draw.text((12, 136), "今天的选择", font=font_for_text("今天的选择", 10, "bold"), fill=MAGENTA)
    line_font = font_for_text(str(entry.get("line", "")), 16, "bold")
    y = 157
    for line in wrap_lines(draw, entry.get("line", ""), line_font, 214, 4):
        draw.text((12, y), line, font=line_font, fill=INK)
        y += 23

    action = str(entry.get("action", ""))
    action_font = font_for_text(action, 10)
    draw.rectangle((11, 229, 229, 254), fill=GREEN, outline=INK, width=2)
    action_lines = wrap_lines(draw, action, action_font, 202, 1)
    draw.text((18, 237), action_lines[0] if action_lines else "", font=action_font, fill=INK)
    draw.text((12, 265), "2X: BACK", font=font(8, "mono"), fill=GREY)
    return image
