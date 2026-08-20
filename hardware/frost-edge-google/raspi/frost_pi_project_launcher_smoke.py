#!/usr/bin/env python3
"""Offline smoke checks for the Whisplay project and mode launcher."""

from pathlib import Path
from tempfile import TemporaryDirectory

from frost_pi_project_launcher import (
    AGENTS,
    CONTENT_CACHE,
    DAYBOOK_ENTRIES,
    MenuState,
    PODCAST_MODES,
    POCKET_MODES,
    PROJECTS,
    SAFE_FOREGROUND_APPS,
    TOPIC_AGENT_KEYS,
    VENDOR_APPS,
    _content_pages,
    _font_supports_text,
    cjk_font_status,
    flatten_sunset_tracks,
    font_for_text,
)


SUNSET_CATALOG = [
    {
        "slug": "los-angeles",
        "cityName": "Los Angeles",
        "cityNameZh": "洛杉矶",
        "tzOffset": -8,
        "tracks": [
            {"id": "la-1", "title": "Los Angeles", "artist": "X", "audioUrl": "https://example/la", "citySlug": "los-angeles"},
            {"id": "la-2", "title": "California", "artist": "Y", "audioUrl": "https://example/ca", "citySlug": "los-angeles"},
        ],
    },
    {
        "slug": "beijing",
        "cityName": "Beijing",
        "cityNameZh": "北京",
        "tzOffset": 8,
        "tracks": [{"id": "bj-1", "title": "北京北京", "artist": "Z", "audioUrl": "https://example/bj", "citySlug": "beijing"}],
    },
]


def main() -> int:
    state = MenuState(SUNSET_CATALOG)
    flattened = flatten_sunset_tracks(SUNSET_CATALOG)
    assert len(flattened) == 3
    assert flattened[0]["cityNameZh"] == "洛杉矶"
    assert state.level == "root"
    assert [item["label"] for item in PROJECTS] == ["日落电台", "口袋播客", "地球答案"]
    assert [item["path"] for item in PROJECTS] == [
        "/home/pi/sunset-radio",
        "/home/pi/pocket-earth",
        "/home/pi/earth-answers",
    ]
    assert len(AGENTS) == 12
    assert len(TOPIC_AGENT_KEYS) == 8
    assert [item["label"] for item in POCKET_MODES] == ["静默地球", "AGENTS", "今日一页"]
    assert [item["label"] for item in PODCAST_MODES] == ["播客模式", "文字模式"]
    assert len(DAYBOOK_ENTRIES) == 31
    assert CONTENT_CACHE["schema"] == "pocket-earth-edge-content-cache/v1"
    assert [item["state"] for item in CONTENT_CACHE["buffer"]] == ["cached", "miss", "reviewed"]
    assert CONTENT_CACHE["knowledgeBrief"]["reviewedCount"] == 2
    assert set(CONTENT_CACHE["signals"]["topics"]) == set(TOPIC_AGENT_KEYS)
    assert sum(len(topic["signals"]) for topic in CONTENT_CACHE["signals"]["topics"].values()) == 16
    assert CONTENT_CACHE["signals"]["sourceSignalCount"] == 37
    assert "pocket-earth-edge" in SAFE_FOREGROUND_APPS
    assert {"whisplay-bluetooth", "whisplay-wifi"}.issubset(VENDOR_APPS)
    assert state.image().size == (240, 280)

    assert PROJECTS[state.root_index]["key"] == "pocket"
    assert state.enter() == "draw" and state.level == "podcast_modes"
    state.move()
    assert PODCAST_MODES[state.podcast_mode_index]["key"] == "reading"
    assert state.enter() == "draw" and state.level == "pocket_modes"
    assert state.image().size == (240, 280)
    assert state.enter() == "draw" and state.level == "pocket_idle"
    assert state.image().size == (240, 280)
    assert state.back() == "draw" and state.level == "pocket_modes"
    assert state.image().size == (240, 280)
    state.move()
    assert POCKET_MODES[state.pocket_mode_index]["key"] == "agents"
    assert state.enter() == "draw" and state.level == "agents"
    assert state.image().size == (240, 280)
    assert state.agent_index == 0
    state.move()
    assert state.agent_index == 1
    assert state.enter() == "draw" and state.level == "agent"
    assert state.image().size == (240, 280)
    page_count = len(_content_pages(AGENTS[state.agent_index]))
    assert page_count >= 3
    state.move()
    assert state.level == "agent" and state.page_index == 1
    for _ in range(page_count - 1):
        state.move()
    assert state.page_index == 0
    assert state.back() == "draw" and state.level == "agents"
    assert state.back() == "draw" and state.level == "pocket_modes"
    state.move()
    assert POCKET_MODES[state.pocket_mode_index]["key"] == "daybook"
    assert state.enter() == "draw" and state.level == "daybook"
    assert state.image().size == (240, 280)
    assert state.back() == "draw" and state.level == "pocket_modes"
    assert state.back() == "draw" and state.level == "podcast_modes"
    assert state.back() == "draw" and state.level == "root"
    assert state.back() == "sunset"

    state = MenuState(SUNSET_CATALOG)
    assert state.enter() == "draw" and state.level == "podcast_modes"
    assert state.enter() == "draw" and state.level == "podcast_preview"
    assert state.image().size == (240, 280)
    assert len(state.podcast["segments"]) >= 1
    first_podcast_index = state.podcast_index
    state.move()
    if len(state.podcast["segments"]) > 1:
        assert state.podcast_index != first_podcast_index
    else:
        assert state.podcast_index == first_podcast_index
    podcast_action = state.enter()
    assert podcast_action[0] == "play_podcast" and podcast_action[1]
    assert state.back() == "draw" and state.level == "podcast_modes"

    state = MenuState(SUNSET_CATALOG)
    state.root_index = 0
    assert PROJECTS[state.root_index]["key"] == "sunset"
    assert state.enter() == "draw" and state.level == "sunset_modes"
    assert state.image().size == (240, 280)
    assert state.enter() == "draw" and state.level == "sunset_tracks"
    assert len(state.sunset_tracks) == 3
    action = state.enter()
    assert action[0] == "play_track" and action[1]["id"] == "la-1"
    assert state.back() == "draw" and state.level == "sunset_modes"

    state.move()
    assert state.enter() == "draw" and state.level == "sunset_times"
    assert state.image().size == (240, 280)
    assert state.enter()[0] == "play_city"
    assert state.back() == "draw" and state.level == "sunset_modes"

    state.move()
    assert state.enter() == "draw" and state.level == "sunset_dice"
    assert state.enter() == "roll_dice"
    state.set_dice_frame()
    assert state.dice_phase == "rolling" and state.image().size == (240, 280)
    state.land_dice()
    assert state.dice_phase == "landed" and state.dice_track
    assert state.enter()[0] == "play_track"
    assert state.back() == "draw" and state.level == "sunset_modes"

    state = MenuState(SUNSET_CATALOG)
    state.root_index = 2
    assert PROJECTS[state.root_index]["key"] == "answers"
    assert state.enter() == "draw" and state.level == "earth_answer"
    assert state.image().size == (240, 280)
    assert state.back() == "draw" and state.level == "root"

    with TemporaryDirectory() as directory:
        output = Path(directory) / "launcher.png"
        state.image().save(output)
        assert output.stat().st_size > 1024

    cjk_ok, cjk_font = cjk_font_status()
    if Path(cjk_font).exists() and ("wqy" in cjk_font.lower() or "cjk" in cjk_font.lower()):
        assert cjk_ok, f"Chinese glyph smoke failed for {cjk_font}"

    thai_text = "ไม่เคย"
    thai_font = font_for_text(thai_text, 11, "bold")
    thai_path = str(getattr(thai_font, "path", "PIL-default"))
    if Path(thai_path).exists():
        assert _font_supports_text(thai_font, thai_text), f"Thai glyph smoke failed for {thai_path}"

    print(
        f"frost_pi_project_launcher smoke passed; cjkFont={cjk_font} "
        f"cjkGlyphs={cjk_ok} thaiFont={thai_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
