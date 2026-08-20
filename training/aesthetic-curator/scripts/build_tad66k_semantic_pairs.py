#!/usr/bin/env python3
"""Apply the CLIP semantic gate and select balanced TAD66K preference pairs."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


SPLITS = ("train", "validation", "test")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def cosine(left: np.ndarray, right: np.ndarray) -> float:
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    return float(np.dot(left, right) / denominator) if denominator else 0.0


def select_theme_pairs(
    pool: list[dict[str, Any]],
    quota: int,
    max_image_uses: int,
    max_photographer_pairs: int,
) -> list[dict[str, Any]]:
    by_photographer: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in pool:
        by_photographer[candidate["photographerKey"]].append(candidate)
    for photographer_pool in by_photographer.values():
        photographer_pool.sort(key=lambda row: (
            -row["clipSimilarity"],
            -row["scoreGap"],
            row["sequenceGap"] is None,
            row["sequenceGap"] if row["sequenceGap"] is not None else 2**63,
            row["candidateId"],
        ))
    photographers = sorted(
        by_photographer,
        key=lambda name: (-by_photographer[name][0]["clipSimilarity"], name),
    )
    cursor = Counter()
    photographer_uses = Counter()
    image_uses = Counter()
    selected: list[dict[str, Any]] = []
    while len(selected) < quota:
        progressed = False
        for photographer in photographers:
            if photographer_uses[photographer] >= max_photographer_pairs:
                continue
            photographer_pool = by_photographer[photographer]
            while cursor[photographer] < len(photographer_pool):
                candidate = photographer_pool[cursor[photographer]]
                cursor[photographer] += 1
                if (
                    image_uses[candidate["imageLeft"]] >= max_image_uses
                    or image_uses[candidate["imageRight"]] >= max_image_uses
                ):
                    continue
                selected.append(candidate)
                photographer_uses[photographer] += 1
                image_uses[candidate["imageLeft"]] += 1
                image_uses[candidate["imageRight"]] += 1
                progressed = True
                break
            if len(selected) >= quota:
                break
        if not progressed:
            break
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--embeddings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--minimum-similarity", type=float, default=0.72)
    parser.add_argument("--train-pairs-per-theme", type=int, default=20)
    parser.add_argument("--evaluation-pairs-per-theme", type=int, default=2)
    parser.add_argument("--minimum-train-pairs-per-theme", type=int, default=12)
    parser.add_argument("--max-image-uses-per-theme", type=int, default=2)
    parser.add_argument("--max-photographer-pairs-per-theme", type=int, default=4)
    args = parser.parse_args()

    candidates = read_jsonl(args.candidates)
    images = {record["image"]: record for record in read_jsonl(args.images)}
    embedding_rows = read_jsonl(args.embeddings)
    embeddings = {
        row["image"]: np.asarray(row["vector"], dtype=np.float32)
        for row in embedding_rows
    }
    versions = {(row["modelId"], row["version"], row["dimension"], row["quantization"]) for row in embedding_rows}
    if len(versions) != 1:
        raise ValueError(f"Mixed CLIP embedding contracts: {versions}")

    scored: list[dict[str, Any]] = []
    for candidate in candidates:
        left, right = candidate["imageLeft"], candidate["imageRight"]
        similarity = cosine(embeddings[left], embeddings[right])
        row = dict(candidate)
        row["clipSimilarity"] = round(similarity, 6)
        if similarity >= args.minimum_similarity:
            scored.append(row)

    themes = sorted({candidate["theme"] for candidate in candidates})
    selected_candidates = []
    selection_shortfalls = {}
    for split in SPLITS:
        quota = (
            args.train_pairs_per_theme
            if split == "train"
            else args.evaluation_pairs_per_theme
        )
        for theme in themes:
            pool = [
                candidate for candidate in scored
                if candidate["split"] == split and candidate["theme"] == theme
            ]
            selection = select_theme_pairs(
                pool,
                quota,
                args.max_image_uses_per_theme,
                args.max_photographer_pairs_per_theme,
            )
            selected_candidates.extend(selection)
            if len(selection) != quota:
                selection_shortfalls[f"{split}:{theme}"] = {
                    "required": quota,
                    "selected": len(selection),
                    "semanticCandidates": len(pool),
                }

    pairs = []
    for candidate in selected_candidates:
        left_wins = float(candidate["scoreLeft"]) > float(candidate["scoreRight"])
        winner = candidate["imageLeft"] if left_wins else candidate["imageRight"]
        loser = candidate["imageRight"] if left_wins else candidate["imageLeft"]
        pair_hash = hashlib.sha256(
            f"TAD66K-semantic:{candidate['candidateId']}".encode()
        ).hexdigest()[:20]
        winner_first = int(pair_hash[-1], 16) % 2 == 0
        image_a, image_b = (winner, loser) if winner_first else (loser, winner)
        pair = {
            "pairId": f"tad66k-semantic-{pair_hash}",
            "dataset": "TAD66K",
            "split": candidate["split"],
            "theme": candidate["theme"],
            "imageA": image_a,
            "imageB": image_b,
            "pathA": images[image_a]["path"],
            "pathB": images[image_b]["path"],
            "preferred": "A" if winner_first else "B",
            "reasonCode": "overallAesthetic",
            "scoreGap": candidate["scoreGap"],
            "clipSimilarity": candidate["clipSimilarity"],
            "clipModel": next(iter(versions))[0],
            "clipVersion": next(iter(versions))[1],
            "photographerKey": candidate["photographerKey"],
            "groupA": images[image_a]["duplicateGroup"],
            "groupB": images[image_b]["duplicateGroup"],
            "leakageComponent": candidate["leakageComponent"],
            "positionSwapRequired": True,
            "labelSource": "TAD66K score within same-theme, same-photographer, CLIP-semantic pair",
        }
        pairs.append(pair)

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "clipContract": {
            "modelId": next(iter(versions))[0],
            "version": next(iter(versions))[1],
            "dimension": next(iter(versions))[2],
            "quantization": next(iter(versions))[3],
        },
        "minimumClipSimilarity": args.minimum_similarity,
        "inputCandidates": len(candidates),
        "candidatesPassingSemanticGate": len(scored),
        "semanticCandidateCounts": {
            split: {
                theme: sum(
                    candidate["split"] == split and candidate["theme"] == theme
                    for candidate in scored
                )
                for theme in themes
            }
            for split in SPLITS
        },
        "selectionRules": {
            "trainPairsPerTheme": args.train_pairs_per_theme,
            "evaluationPairsPerTheme": args.evaluation_pairs_per_theme,
            "minimumTrainPairsPerTheme": args.minimum_train_pairs_per_theme,
            "maxImageUsesPerTheme": args.max_image_uses_per_theme,
            "maxPhotographerPairsPerTheme": args.max_photographer_pairs_per_theme,
            "balance": "target quota for all 47 themes; preserve CLIP threshold and enforce a declared minimum instead of backfilling weak pairs",
            "positionSwapRequired": True,
        },
        "selectionShortfalls": selection_shortfalls,
        "canonicalPairs": dict(sorted(Counter(pair["split"] for pair in pairs).items())),
        "themeCounts": {
            split: dict(sorted(Counter(
                pair["theme"] for pair in pairs if pair["split"] == split
            ).items()))
            for split in SPLITS
        },
        "preferredPositionCounts": {
            split: dict(sorted(Counter(
                pair["preferred"] for pair in pairs if pair["split"] == split
            ).items()))
            for split in SPLITS
        },
        "clipSimilarity": {
            split: {
                "min": min(pair["clipSimilarity"] for pair in pairs if pair["split"] == split),
                "median": float(np.median([
                    pair["clipSimilarity"] for pair in pairs if pair["split"] == split
                ])),
                "max": max(pair["clipSimilarity"] for pair in pairs if pair["split"] == split),
            }
            for split in SPLITS
        },
        "trainingRowsAfterPositionSwap": sum(pair["split"] == "train" for pair in pairs) * 2,
        "gates": {
            "allCandidateImagesHaveEmbeddings": all(
                name in embeddings
                for candidate in candidates
                for name in (candidate["imageLeft"], candidate["imageRight"])
            ),
            "allPairsMeetSemanticThreshold": all(
                pair["clipSimilarity"] >= args.minimum_similarity for pair in pairs
            ),
            "allPairsCrossDuplicateGroups": all(pair["groupA"] != pair["groupB"] for pair in pairs),
            "allPairsHavePositionSwap": all(pair["positionSwapRequired"] for pair in pairs),
            "minimumThemeCoverageMet": all(
                sum(pair["split"] == split and pair["theme"] == theme for pair in pairs)
                >= (
                    args.minimum_train_pairs_per_theme
                    if split == "train"
                    else args.evaluation_pairs_per_theme
                )
                for split in SPLITS
                for theme in themes
            ),
        },
    }
    if not all(report["gates"].values()):
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise RuntimeError(f"TAD66K semantic pair gates failed: {report['gates']}; shortfalls={selection_shortfalls}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for pair in sorted(pairs, key=lambda row: row["pairId"]):
            handle.write(json.dumps(pair, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
