#!/usr/bin/env python3
"""Select conservative AADB pairs only from CLIP semantic-neighbor edges."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


ATTRIBUTES = [
    "BalacingElements", "ColorHarmony", "Content", "DoF", "Light",
    "MotionBlur", "Object", "Repetition", "RuleOfThirds", "Symmetry", "VividColor",
]
DISPLAY_NAMES = {"BalacingElements": "BalancingElements"}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--neighbors", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--minimum-similarity", type=float, default=0.75)
    parser.add_argument("--maximum-other-attribute-mae", type=float, default=0.35)
    parser.add_argument("--minimum-score-gap", type=float, default=0.10)
    parser.add_argument("--minimum-target-gap", type=float, default=0.40)
    parser.add_argument("--train-pairs", type=int, default=400)
    parser.add_argument("--validation-pairs", type=int, default=80)
    parser.add_argument("--test-pairs", type=int, default=80)
    parser.add_argument("--max-image-uses", type=int, default=2)
    args = parser.parse_args()

    records = read_jsonl(args.records)
    edges = read_jsonl(args.neighbors)
    pools: dict[str, dict[str, list[tuple[Any, ...]]]] = defaultdict(lambda: defaultdict(list))
    for edge in edges:
        if edge["similarity"] < args.minimum_similarity:
            continue
        left, right = edge["leftIndex"], edge["rightIndex"]
        a, b = records[left], records[right]
        if a["split"] != edge["split"] or b["split"] != edge["split"]:
            raise ValueError("CLIP edge crosses split")
        score_gap = float(b["attributes"]["score"] - a["attributes"]["score"])
        for attribute in ATTRIBUTES:
            target_gap = float(b["attributes"][attribute] - a["attributes"][attribute])
            other_mae = float(np.mean([
                abs(float(b["attributes"][name]) - float(a["attributes"][name]))
                for name in ATTRIBUTES if name != attribute
            ]))
            if (
                score_gap * target_gap <= 0
                or abs(score_gap) < args.minimum_score_gap
                or abs(target_gap) < args.minimum_target_gap
                or other_mae > args.maximum_other_attribute_mae
            ):
                continue
            pools[edge["split"]][attribute].append((
                -float(edge["similarity"]), other_mae, -abs(score_gap), -abs(target_gap), left, right,
            ))
    for split in pools:
        for attribute in pools[split]:
            pools[split][attribute].sort()

    quotas = {
        "train": args.train_pairs,
        "validation": args.validation_pairs,
        "test": args.test_pairs,
    }
    selected = []
    for split, quota in quotas.items():
        cursors = Counter()
        image_uses = Counter()
        used_edges = set()
        split_pairs = []
        while len(split_pairs) < quota:
            progressed = False
            for attribute in ATTRIBUTES:
                pool = pools[split][attribute]
                while cursors[attribute] < len(pool):
                    neg_similarity, other_mae, neg_score_gap, neg_target_gap, left, right = pool[cursors[attribute]]
                    cursors[attribute] += 1
                    edge_key = (left, right)
                    if (
                        edge_key in used_edges
                        or image_uses[left] >= args.max_image_uses
                        or image_uses[right] >= args.max_image_uses
                    ):
                        continue
                    score_left = float(records[left]["attributes"]["score"])
                    score_right = float(records[right]["attributes"]["score"])
                    winner, loser = (left, right) if score_left > score_right else (right, left)
                    canonical_id = hashlib.sha256(
                        f"AADB-CLIP:{split}:{records[left]['image']}:{records[right]['image']}:{attribute}".encode()
                    ).hexdigest()[:20]
                    winner_first = int(canonical_id[-1], 16) % 2 == 0
                    image_a, image_b = (winner, loser) if winner_first else (loser, winner)
                    pair = {
                        "pairId": f"aadb-clip-{canonical_id}",
                        "dataset": "AADB",
                        "split": split,
                        "imageA": records[image_a]["image"],
                        "imageB": records[image_b]["image"],
                        "pathA": records[image_a]["path"],
                        "pathB": records[image_b]["path"],
                        "preferred": "A" if winner_first else "B",
                        "reasonCode": DISPLAY_NAMES.get(attribute, attribute),
                        "scoreGap": round(-neg_score_gap, 6),
                        "targetAttributeGap": round(-neg_target_gap, 6),
                        "otherAttributeMAE": round(other_mae, 6),
                        "clipSimilarity": round(-neg_similarity, 6),
                        "clipModel": "Xenova/clip-vit-base-patch32",
                        "clipVersion": "clip-vit-b32-q8-int8-v1",
                        "groupA": records[image_a]["duplicateGroup"],
                        "groupB": records[image_b]["duplicateGroup"],
                        "positionSwapRequired": True,
                        "labelSource": "AADB score/attribute agreement within a CLIP semantic-neighbor pair",
                    }
                    split_pairs.append(pair)
                    used_edges.add(edge_key)
                    image_uses[left] += 1
                    image_uses[right] += 1
                    progressed = True
                    break
                if len(split_pairs) >= quota:
                    break
            if not progressed:
                raise RuntimeError(f"Could only construct {len(split_pairs)}/{quota} semantic pairs for {split}")
        selected.extend(split_pairs)

    candidate_counts = {
        split: {DISPLAY_NAMES.get(attribute, attribute): len(pools[split][attribute]) for attribute in ATTRIBUTES}
        for split in quotas
    }
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "minimumClipSimilarity": args.minimum_similarity,
        "maximumOtherAttributeMAE": args.maximum_other_attribute_mae,
        "minimumScoreGap": args.minimum_score_gap,
        "minimumTargetAttributeGap": args.minimum_target_gap,
        "candidateCounts": candidate_counts,
        "canonicalPairs": dict(Counter(pair["split"] for pair in selected)),
        "reasonCounts": {
            split: dict(sorted(Counter(pair["reasonCode"] for pair in selected if pair["split"] == split).items()))
            for split in quotas
        },
        "preferredPositionCounts": {
            split: dict(sorted(Counter(pair["preferred"] for pair in selected if pair["split"] == split).items()))
            for split in quotas
        },
        "clipSimilarity": {
            split: {
                "min": min(pair["clipSimilarity"] for pair in selected if pair["split"] == split),
                "median": float(np.median([pair["clipSimilarity"] for pair in selected if pair["split"] == split])),
                "max": max(pair["clipSimilarity"] for pair in selected if pair["split"] == split),
            }
            for split in quotas
        },
        "maxCanonicalImageUses": args.max_image_uses,
        "trainingRowsAfterPositionSwap": args.train_pairs * 2,
        "gates": {
            "allPairsMeetSemanticThreshold": all(pair["clipSimilarity"] >= args.minimum_similarity for pair in selected),
            "allPairsStayWithinSplit": all(
                records[next(i for i, record in enumerate(records) if record["image"] == pair["imageA"])]["split"] == pair["split"]
                and records[next(i for i, record in enumerate(records) if record["image"] == pair["imageB"])]["split"] == pair["split"]
                for pair in selected
            ),
            "allPairsCrossDuplicateGroups": all(pair["groupA"] != pair["groupB"] for pair in selected),
            "allPairsHavePositionSwap": all(pair["positionSwapRequired"] for pair in selected),
        },
    }
    if not all(report["gates"].values()):
        raise RuntimeError(f"Semantic pair gates failed: {report['gates']}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for pair in selected:
            handle.write(json.dumps(pair, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
