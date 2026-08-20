#!/usr/bin/env python3
import json

from PIL import Image, ImageDraw

import whisplay_status


SAMPLES = [
    "东京 Plastic Love 竹内まりや",
    "กรุงเทพ القاهرة Reykjavík São Paulo",
    "안녕 Привет Αθήνα नमस्ते",
]


def visible_pixels(image):
    rgb = image.convert("RGB")
    return sum(
        1
        for y in range(image.height)
        for x in range(image.width)
        if rgb.getpixel((x, y)) != whisplay_status.DARK
    )


def draw_multiscript_text():
    image = Image.new("RGB", (whisplay_status.WIDTH, whisplay_status.HEIGHT), whisplay_status.DARK)
    draw = ImageDraw.Draw(image)
    y = 18
    for sample in SAMPLES:
        fitted = whisplay_status.fb_fit(draw, sample, 15, 205)
        whisplay_status.fb_draw(draw, (16, y), fitted, 15, whisplay_status.INK)
        y += 38
    return image


def main():
    image = draw_multiscript_text()
    draw = ImageDraw.Draw(image)
    widths = [whisplay_status.fb_width(draw, sample, 15) for sample in SAMPLES]
    cases = [
        {
            "name": "fallback font chain is available",
            "passed": bool(whisplay_status._FB_PATHS),
            "detail": whisplay_status._FB_PATHS[:3],
        },
        {
            "name": "multiscript text has measurable width",
            "passed": all(width > 30 for width in widths),
            "detail": widths,
        },
        {
            "name": "multiscript text renders visible pixels",
            "passed": visible_pixels(image) > 900,
            "detail": {"visiblePixels": visible_pixels(image)},
        },
        {
            "name": "cjk bold chain avoids latin-only DejaVu bold",
            "passed": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
            not in whisplay_status.CJK_FONTS_BOLD,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
