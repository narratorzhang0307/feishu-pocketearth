#!/usr/bin/env python3
"""Render deterministic pair contact sheets for human pre-training inspection."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def load_thumb(path: str, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "#101820")
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def render_tile(pair: dict, width: int = 580, height: int = 270) -> Image.Image:
    tile = Image.new("RGB", (width, height), "#F4F1EA")
    draw = ImageDraw.Draw(tile)
    font = ImageFont.load_default(size=14)
    thumb_size = (270, 205)
    for label, key, x in (("A", "pathA", 12), ("B", "pathB", 298)):
        thumb = load_thumb(pair[key], thumb_size)
        tile.paste(thumb, (x, 34))
        color = "#16A34A" if pair["preferred"] == label else "#9CA3AF"
        draw.rectangle((x - 2, 32, x + thumb_size[0] + 1, 240), outline=color, width=4)
        draw.text((x, 10), f"{label}{'  PREFERRED' if pair['preferred'] == label else ''}", fill=color, font=font)
    caption = (
        f"{pair['reasonCode']} | score gap {pair['scoreGap']:.2f} | "
        f"target gap {pair['targetAttributeGap']:.2f} | other MAE {pair['otherAttributeMAE']:.2f}"
    )
    draw.text((12, 248), caption, fill="#111827", font=font)
    return tile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", default="train")
    parser.add_argument("--per-reason", type=int, default=4)
    args = parser.parse_args()

    grouped = defaultdict(list)
    with args.pairs.open(encoding="utf-8") as handle:
        for line in handle:
            pair = json.loads(line)
            if pair["split"] == args.split:
                grouped[pair["reasonCode"]].append(pair)
    selected = []
    for reason in sorted(grouped):
        selected.extend(sorted(grouped[reason], key=lambda pair: pair["pairId"])[:args.per_reason])

    args.output.mkdir(parents=True, exist_ok=True)
    page_size = 8
    for page_number, start in enumerate(range(0, len(selected), page_size), start=1):
        page_pairs = selected[start:start + page_size]
        page = Image.new("RGB", (1180, 40 + 4 * 280), "#D9E2E8")
        draw = ImageDraw.Draw(page)
        draw.text((12, 10), f"AADB {args.split} pair QA — page {page_number}", fill="#0F172A")
        for index, pair in enumerate(page_pairs):
            x = 10 + (index % 2) * 590
            y = 40 + (index // 2) * 280
            page.paste(render_tile(pair), (x, y))
        page.save(args.output / f"aadb-{args.split}-pairs-{page_number:02d}.jpg", quality=90)
    print(f"rendered {len(selected)} pairs across {page_number} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
