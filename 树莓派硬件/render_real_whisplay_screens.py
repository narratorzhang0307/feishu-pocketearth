#!/usr/bin/env python3
"""Render review screenshots from the production Whisplay UI functions.

The output is generated from ``frost_pi_project_launcher.py`` itself instead
of redrawing screens by hand.  This keeps labels, colours, interaction hints,
content cache and the Frost persona consistent with the Raspberry Pi build.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RASPI = ROOT / "hardware" / "frost-edge-google" / "raspi"
OUTPUT = Path(__file__).resolve().parent / "真实Whisplay界面"
os.environ["EARTH_ANSWERS_STATE_PATH"] = str(Path(tempfile.gettempdir()) / "pocket-earth-review-answer-state.json")
sys.path.insert(0, str(RASPI))

import frost_pi_project_launcher as ui  # noqa: E402


CJK_REGULAR = "/System/Library/Fonts/STHeiti Light.ttc"
CJK_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
ui.FONT_REGULAR = (CJK_REGULAR, CJK_BOLD)
ui.FONT_BOLD = (CJK_BOLD, CJK_REGULAR)
ui.FONT_MONO = (CJK_BOLD, CJK_REGULAR)
ui.FONT_UNIVERSAL = (CJK_REGULAR, CJK_BOLD)
ui.FROST_PERSONA_SHEET = ROOT / "public" / "frost-personas" / "frost-personas-01.png"
ui._frost_podcast_portrait.cache_clear()


CATALOG = [
    {
        "cityName": "Lisbon",
        "cityNameZh": "里斯本",
        "tracks": [
            {"title": "Barco Negro", "artist": "Amália Rodrigues"},
            {"title": "Lisboa Menina e Moça", "artist": "Carlos do Carmo"},
        ],
    },
    {
        "cityName": "Tangier",
        "cityNameZh": "丹吉尔",
        "tracks": [{"title": "Ya Rayah", "artist": "Rachid Taha"}],
    },
    {
        "cityName": "Reykjavik",
        "cityNameZh": "雷克雅未克",
        "tracks": [{"title": "Hoppípolla", "artist": "Sigur Rós"}],
    },
]

SUNSETS = [
    {
        "cityNameZh": "里斯本",
        "userSunsetClock": "20:52",
        "cityLocalSunsetClock": "20:52",
        "minutesUntil": 18,
    },
    {
        "cityNameZh": "丹吉尔",
        "userSunsetClock": "21:06",
        "cityLocalSunsetClock": "21:06",
        "minutesUntil": 32,
    },
    {
        "cityNameZh": "雷克雅未克",
        "userSunsetClock": "23:17",
        "cityLocalSunsetClock": "23:17",
        "minutesUntil": 163,
    },
]


def save(name: str, image) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT / name, optimize=True)


def main() -> None:
    save("01_PI_HOME_三项目入口.png", ui.render_root(1))
    save("02_口袋播客_模式选择.png", ui.render_podcast_modes(0))
    save("03_口袋播客_真实核验内容.png", ui.render_podcast_preview(ui.load_podcast_cache(), 0))
    save("04_口袋播客_文字与Agent空间.png", ui.render_pocket_modes(1))
    save("05_日落电台_三模式.png", ui.render_sunset_modes(0, CATALOG))
    save("06_日落电台_歌曲目录.png", ui.render_sunset_tracks(ui.flatten_sunset_tracks(CATALOG), 0))
    save("07_日落电台_真实日落时刻.png", ui.render_sunset_times(SUNSETS, 0))

    state = ui.MenuState(CATALOG)
    state.dice_phase = "landed"
    state.dice_value = 5
    state.dice_code = "7D3A · 19C4"
    state.dice_city = CATALOG[0]
    state.dice_track = CATALOG[0]["tracks"][0]
    save("08_日落电台_随机骰子结果.png", ui.render_sunset_dice(state))

    answer = ui.EarthAnswerState(state_path=Path(tempfile.gettempdir()) / "pocket-earth-review-answer-state.json")
    answer.revealed_dates.discard(answer.day_key)
    answer.phase = "idle"
    save("09_地球答案_每日一次.png", ui.render_earth_answer(answer))
    answer.revealed_dates.add(answer.day_key)
    answer.phase = "revealed"
    save("10_地球答案_揭晓与回看.png", ui.render_earth_answer(answer))

    save("11_Frost_Agent_公共知识入口.png", ui.render_agents(1))
    save("12_Gemini双角色事实核验.png", ui.render_agent_page(ui.AGENTS[10], 0))

    manifest = OUTPUT / "README.md"
    manifest.write_text(
        "# Frost Edge 真实 Whisplay 界面\n\n"
        "这些 240×280 PNG 直接调用生产树莓派界面的渲染函数生成，"
        "用于数字孪生、架构图和审核证据。内容来自本地公共知识/口袋播客缓存；"
        "不包含私人记忆、原始照片、精确坐标或云密钥。\n\n"
        f"生成时间：{datetime.now().astimezone().isoformat()}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
