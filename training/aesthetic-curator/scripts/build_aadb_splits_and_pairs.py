#!/usr/bin/env python3
"""Build deterministic pHash-grouped AADB splits and conservative attribute pairs."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


ATTRIBUTE_NAMES = [
    "BalacingElements", "ColorHarmony", "Content", "DoF", "Light",
    "MotionBlur", "Object", "Repetition", "RuleOfThirds", "Symmetry", "VividColor",
]
DISPLAY_NAMES = {"BalacingElements": "BalancingElements"}


def stable_unit(text: str) -> float:
    value = int.from_bytes(hashlib.blake2b(text.encode(), digest_size=8).digest(), "big")
    return value / 2**64


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def assign_grouped_splits(records: list[dict[str, Any]], seed: str) -> dict[str, str]:
    grouped_scores: dict[str, list[float]] = defaultdict(list)
    for record in records:
        grouped_scores[record["duplicateGroup"]].append(float(record["attributes"]["score"]))
    assignments = {}
    for group, scores in grouped_scores.items():
        score_bin = min(9, int(float(np.median(scores)) * 10))
        value = stable_unit(f"{seed}:{score_bin}:{group}")
        assignments[group] = "train" if value < 0.80 else "validation" if value < 0.90 else "test"
    return assignments


def candidate_pairs(
    records: list[dict[str, Any]],
    indices: np.ndarray,
    attribute_index: int,
    rng: np.random.Generator,
    samples: int,
) -> list[tuple[float, float, float, int, int]]:
    if len(indices) < 2:
        return []
    values = np.array([
        [float(record["attributes"][name]) for name in ATTRIBUTE_NAMES]
        for record in records
    ], dtype=np.float32)
    scores = np.array([float(record["attributes"]["score"]) for record in records], dtype=np.float32)
    left = rng.choice(indices, size=samples, replace=True)
    right = rng.choice(indices, size=samples, replace=True)
    different = left != right
    left, right = left[different], right[different]
    score_gap = scores[right] - scores[left]
    target_gap = values[right, attribute_index] - values[left, attribute_index]
    aligned = score_gap * target_gap > 0
    strong = (np.abs(score_gap) >= 0.10) & (np.abs(target_gap) >= 0.40)
    keep = aligned & strong
    left, right = left[keep], right[keep]
    score_gap, target_gap = score_gap[keep], target_gap[keep]
    if len(left) == 0:
        return []
    other = np.delete(values, attribute_index, axis=1)
    other_mae = np.mean(np.abs(other[left] - other[right]), axis=1)
    keep = other_mae <= 0.35
    left, right = left[keep], right[keep]
    score_gap, target_gap, other_mae = score_gap[keep], target_gap[keep], other_mae[keep]

    best: dict[tuple[int, int], tuple[float, float, float, int, int]] = {}
    for mae, s_gap, a_gap, i, j in zip(other_mae, score_gap, target_gap, left, right):
        low, high = sorted((int(i), int(j)))
        candidate = (float(mae), -abs(float(s_gap)), -abs(float(a_gap)), low, high)
        previous = best.get((low, high))
        if previous is None or candidate < previous:
            best[(low, high)] = candidate
    return sorted(best.values())


def select_pairs(
    records: list[dict[str, Any]],
    split_indices: dict[str, np.ndarray],
    quotas: dict[str, int],
    seed: int,
    max_image_uses: int,
) -> list[dict[str, Any]]:
    selected = []
    for split, quota in quotas.items():
        rng = np.random.default_rng(seed + {"train": 0, "validation": 1, "test": 2}[split])
        samples = max(250_000, len(split_indices[split]) * 80)
        candidates = {
            attribute: candidate_pairs(records, split_indices[split], index, rng, samples)
            for index, attribute in enumerate(ATTRIBUTE_NAMES)
        }
        cursors = Counter()
        uses = Counter()
        used_pairs = set()
        per_attribute = Counter()
        while len([pair for pair in selected if pair["split"] == split]) < quota:
            progressed = False
            for attribute in ATTRIBUTE_NAMES:
                pool = candidates[attribute]
                while cursors[attribute] < len(pool):
                    _, neg_score_gap, neg_target_gap, left, right = pool[cursors[attribute]]
                    cursors[attribute] += 1
                    pair_key = (left, right)
                    left_group = records[left]["duplicateGroup"]
                    right_group = records[right]["duplicateGroup"]
                    if (
                        pair_key in used_pairs
                        or left_group == right_group
                        or uses[left] >= max_image_uses
                        or uses[right] >= max_image_uses
                    ):
                        continue
                    score_left = float(records[left]["attributes"]["score"])
                    score_right = float(records[right]["attributes"]["score"])
                    winner, loser = (left, right) if score_left > score_right else (right, left)
                    canonical_id = hashlib.sha256(
                        f"AADB:{split}:{records[left]['image']}:{records[right]['image']}:{attribute}".encode()
                    ).hexdigest()[:20]
                    winner_first = int(canonical_id[-1], 16) % 2 == 0
                    image_a, image_b = (winner, loser) if winner_first else (loser, winner)
                    selected.append({
                        "pairId": f"aadb-{canonical_id}",
                        "dataset": "AADB",
                        "split": split,
                        "imageA": records[image_a]["image"],
                        "imageB": records[image_b]["image"],
                        "pathA": records[image_a]["path"],
                        "pathB": records[image_b]["path"],
                        "preferred": "A" if winner_first else "B",
                        "reasonCode": DISPLAY_NAMES.get(attribute, attribute),
                        "scoreGap": round(abs(score_left - score_right), 6),
                        "targetAttributeGap": round(-neg_target_gap, 6),
                        "otherAttributeMAE": round(pool[cursors[attribute] - 1][0], 6),
                        "groupA": records[image_a]["duplicateGroup"],
                        "groupB": records[image_b]["duplicateGroup"],
                        "positionSwapRequired": True,
                        "labelSource": "AADB aggregate score aligned with one strong attribute difference",
                    })
                    used_pairs.add(pair_key)
                    uses[left] += 1
                    uses[right] += 1
                    per_attribute[attribute] += 1
                    progressed = True
                    break
                if len([pair for pair in selected if pair["split"] == split]) >= quota:
                    break
            if not progressed:
                raise RuntimeError(f"Could only construct {sum(per_attribute.values())}/{quota} pairs for {split}")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--splits", type=Path, required=True)
    parser.add_argument("--pairs", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--split-seed", default="pocket-earth-aadb-v1")
    parser.add_argument("--pair-seed", type=int, default=20260811)
    parser.add_argument("--train-pairs", type=int, default=400)
    parser.add_argument("--validation-pairs", type=int, default=80)
    parser.add_argument("--test-pairs", type=int, default=80)
    parser.add_argument("--max-image-uses", type=int, default=2)
    args = parser.parse_args()

    records = load_jsonl(args.input)
    if len(records) != 9_958:
        raise ValueError(f"Expected 9,958 AADB records, found {len(records)}")
    assignments = assign_grouped_splits(records, args.split_seed)
    for record in records:
        record["split"] = assignments[record["duplicateGroup"]]
    split_indices = {
        split: np.array([index for index, record in enumerate(records) if record["split"] == split])
        for split in ("train", "validation", "test")
    }
    pairs = select_pairs(
        records,
        split_indices,
        {"train": args.train_pairs, "validation": args.validation_pairs, "test": args.test_pairs},
        args.pair_seed,
        args.max_image_uses,
    )

    groups_by_split = {
        split: {record["duplicateGroup"] for record in records if record["split"] == split}
        for split in split_indices
    }
    overlap = {
        "trainValidation": len(groups_by_split["train"] & groups_by_split["validation"]),
        "trainTest": len(groups_by_split["train"] & groups_by_split["test"]),
        "validationTest": len(groups_by_split["validation"] & groups_by_split["test"]),
    }
    if any(overlap.values()):
        raise RuntimeError(f"duplicateGroup leakage: {overlap}")
    split_counts = {split: int(len(indices)) for split, indices in split_indices.items()}
    pair_counts = Counter(pair["split"] for pair in pairs)
    reason_counts = {
        split: dict(sorted(Counter(pair["reasonCode"] for pair in pairs if pair["split"] == split).items()))
        for split in split_indices
    }
    preferred_counts = {
        split: dict(sorted(Counter(pair["preferred"] for pair in pairs if pair["split"] == split).items()))
        for split in split_indices
    }
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "splitSeed": args.split_seed,
        "pairSeed": args.pair_seed,
        "images": len(records),
        "splitImages": split_counts,
        "splitGroups": {split: len(groups) for split, groups in groups_by_split.items()},
        "duplicateGroupOverlap": overlap,
        "canonicalPairs": dict(pair_counts),
        "trainingRowsAfterPositionSwap": int(pair_counts["train"] * 2),
        "maxCanonicalImageUses": args.max_image_uses,
        "reasonCounts": reason_counts,
        "preferredPositionCounts": preferred_counts,
        "gates": {
            "zeroDuplicateGroupLeakage": not any(overlap.values()),
            "allPairsWithinOneSplit": all(
                assignments[pair["groupA"]] == pair["split"] == assignments[pair["groupB"]]
                for pair in pairs
            ),
            "allPairsHavePositionSwap": all(pair["positionSwapRequired"] for pair in pairs),
        },
    }
    if not all(report["gates"].values()):
        raise RuntimeError(f"AADB pair gates failed: {report['gates']}")

    for path in (args.splits, args.pairs, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
    with args.splits.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    with args.pairs.open("w", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
