#!/usr/bin/env python3
"""Verify that the produced PEFT adapter does not modify language layers."""

from __future__ import annotations

import argparse
import json
import struct
from collections import Counter
from pathlib import Path


VISUAL = (".visual.", ".vision_model.", ".vision_tower.")
ALIGNER = (".merger.", ".aligner.", ".multi_modal_projector.", ".projector.")
LANGUAGE = (".language_model.", ".model.layers.", ".lm_head.")


def component(name: str) -> str:
    value = name.lower()
    if any(marker in value for marker in ALIGNER):
        return "aligner"
    if any(marker in value for marker in VISUAL):
        return "visual"
    if any(marker in value for marker in LANGUAGE):
        return "language"
    return "other"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("adapter", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with args.adapter.open("rb") as handle:
        header_size = struct.unpack("<Q", handle.read(8))[0]
        header = json.loads(handle.read(header_size))
    names = [name for name in header if name != "__metadata__"]
    counts = Counter(component(name) for name in names)
    report = {
        "tensorCount": len(names),
        "components": {key: counts.get(key, 0) for key in ("visual", "aligner", "language", "other")},
        "languageFrozen": counts.get("language", 0) == 0,
        "visualOrAlignerPresent": counts.get("visual", 0) + counts.get("aligner", 0) > 0,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["languageFrozen"] and report["visualOrAlignerPresent"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
