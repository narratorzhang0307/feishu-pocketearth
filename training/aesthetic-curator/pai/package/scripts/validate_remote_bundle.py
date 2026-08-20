#!/usr/bin/env python3
"""Cheap fail-closed validation after the bundle archive SHA-256 is verified."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((args.bundle / "bundle-manifest.json").read_text(encoding="utf-8"))
    prompts = json.loads((args.bundle / "prompts.json").read_text(encoding="utf-8"))
    image_rows = read_jsonl(args.bundle / "image-manifest.jsonl")
    gates = {
        "manifestReady": all(manifest["gates"].values()),
        "trainRows": len(read_jsonl(args.bundle / "train.jsonl")) == manifest["sftRowsAfterPositionSwap"]["train"],
        "validationRows": len(read_jsonl(args.bundle / "validation.jsonl")) == manifest["sftRowsAfterPositionSwap"]["validation"],
        "testRows": len(read_jsonl(args.bundle / "test.jsonl")) == manifest["sftRowsAfterPositionSwap"]["test"],
        "imageCount": len(image_rows) == manifest["uniqueImages"],
        "allImagesPresent": all((args.bundle / row["path"]).is_file() for row in image_rows),
        "promptContract": prompts["trainingSystem"] == "minimalSystem" and "<image><image>" in prompts["user"],
    }
    report = {"gates": gates, "ready": all(gates.values())}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
