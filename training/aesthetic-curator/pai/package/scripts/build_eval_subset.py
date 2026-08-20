#!/usr/bin/env python3
"""Freeze a small source-balanced, position-swapped Base/MD/LoRA evaluation set."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def stable(value: str) -> str:
    return hashlib.sha256(f"pocket-earth-eval-v1:{value}".encode()).hexdigest()


def answer(choice: str, reason: str) -> str:
    return json.dumps({"choice": choice, "reasonCode": reason}, ensure_ascii=False, separators=(",", ":"))


def row(pair: dict, system: str, user: str, swapped: bool) -> dict:
    images = [pair["imageA"], pair["imageB"]]
    choice = pair["preferred"]
    if swapped:
        images.reverse()
        choice = "B" if choice == "A" else "A"
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": answer(choice, pair["reasonCode"])},
        ],
        "images": images,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--pairs-per-source", type=int, default=8)
    args = parser.parse_args()
    prompts = json.loads((args.bundle / "prompts.json").read_text(encoding="utf-8"))
    pairs = [pair for pair in read_jsonl(args.bundle / "canonical-pairs.jsonl") if pair["split"] == "test"]
    by_source = defaultdict(list)
    for pair in pairs:
        by_source[pair["dataset"]].append(pair)

    selected = []
    aadb_by_reason = defaultdict(list)
    for pair in by_source["AADB"]:
        aadb_by_reason[pair["reasonCode"]].append(pair)
    for reason in sorted(aadb_by_reason):
        if len(selected) >= args.pairs_per_source:
            break
        selected.append(sorted(aadb_by_reason[reason], key=lambda item: stable(item["pairId"]))[0])
    if len(selected) < args.pairs_per_source:
        selected_ids = {pair["pairId"] for pair in selected}
        selected.extend(sorted(
            (pair for pair in by_source["AADB"] if pair["pairId"] not in selected_ids),
            key=lambda item: stable(item["pairId"]),
        )[: args.pairs_per_source - len(selected)])

    tad_by_theme = defaultdict(list)
    for pair in by_source["TAD66K"]:
        tad_by_theme[pair["theme"]].append(pair)
    for theme in sorted(tad_by_theme, key=stable)[: args.pairs_per_source]:
        selected.append(sorted(tad_by_theme[theme], key=lambda item: stable(item["pairId"]))[0])
    selected.sort(key=lambda item: stable(item["pairId"]))
    if len(selected) != args.pairs_per_source * 2:
        raise RuntimeError("Could not build the required source-balanced evaluation subset")

    minimal_rows = []
    md_rows = []
    manifest_rows = []
    for pair in selected:
        for swapped in (False, True):
            minimal_rows.append(row(pair, prompts["minimalSystem"], prompts["user"], swapped))
            md_rows.append(row(pair, prompts["mdBaselineSystem"], prompts["user"], swapped))
            expected = pair["preferred"]
            if swapped:
                expected = "B" if expected == "A" else "A"
            manifest_rows.append({
                "index": len(manifest_rows),
                "pairId": pair["pairId"],
                "dataset": pair["dataset"],
                "theme": pair.get("theme"),
                "orientation": "swapped" if swapped else "original",
                "expectedChoice": expected,
                "expectedReasonCode": pair["reasonCode"],
                "images": list(reversed([pair["imageA"], pair["imageB"]])) if swapped else [pair["imageA"], pair["imageB"]],
            })

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in (("minimal.jsonl", minimal_rows), ("md.jsonl", md_rows)):
        with (args.output_dir / name).open("w", encoding="utf-8") as handle:
            for item in rows:
                handle.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    manifest = {
        "canonicalPairs": len(selected),
        "rows": len(manifest_rows),
        "pairsPerSource": args.pairs_per_source,
        "positionSwap": True,
        "samples": manifest_rows,
    }
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"canonicalPairs": len(selected), "rows": len(manifest_rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
