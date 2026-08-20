#!/usr/bin/env python3
"""Offline smoke test for the Frost Edge Node physical rendering lane."""

import json
import tempfile
from pathlib import Path

from frost_pi_device_driver import PocketEarthDeviceDriver, cjk_font_status, render_evidence_card, rgb565_bytes


ACTIONS = [
    {
        "type": "state",
        "state": "attention",
        "sourceKind": "public_knowledge_brief",
        "createdAt": "2026-07-18T00:00:00.000Z",
    },
    {
        "type": "tts",
        "text": "Frost 带回一条经过 Google AI 双角色核验的公共知识简报。",
    },
    {
        "type": "display",
        "title": "公共知识简报",
        "body": "来源与不确定性已保留，仍需人工确认后发布。",
        "subtitle": "Truth Score 82 · review_required",
        "truthScore": 82,
        "verdict": "review_required",
        "sourceKind": "public_knowledge_brief",
        "createdAt": "2026-07-18T00:00:00.000Z",
    },
]


def main() -> int:
    image = render_evidence_card(ACTIONS)
    assert image.size == (240, 280)
    assert len(rgb565_bytes(image)) == 240 * 280 * 2
    cjk_ok, cjk_font = cjk_font_status()
    if Path(cjk_font).exists() and ("wqy" in cjk_font.lower() or "cjk" in cjk_font.lower()):
        assert cjk_ok, f"Chinese glyph smoke failed for {cjk_font}"
    with tempfile.TemporaryDirectory(prefix="frost-edge-smoke-") as directory:
        driver = PocketEarthDeviceDriver(dry_run=True, mirror_port=0)
        driver.snapshot_path = Path(directory) / "live.png"
        try:
            assert driver.speak("用户主动播放的播客条目", max_chars=1200) is True
            result = driver.apply_actions(ACTIONS)
        finally:
            driver.close()
        assert result["screen"] is True
        assert result["state"] == "attention"
        assert driver.snapshot_path.stat().st_size > 1024
    print(json.dumps({"ok": True, "screen": "240x280", "rgb565Bytes": 134400, "cjkFont": cjk_font, "cjkGlyphs": cjk_ok}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
