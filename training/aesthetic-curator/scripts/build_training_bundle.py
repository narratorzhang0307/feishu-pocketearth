#!/usr/bin/env python3
"""Freeze a portable ms-swift multi-image SFT bundle with reproducibility gates."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MINIMAL_SYSTEM = (
    "你是 Pocket Earth 的旅程相册策展器。只比较两张内容相近的候选图，选择更适合作为旅程精选、"
    "封面或叙事节点的一张。判断清晰度、构图、光线、色彩、主体表达与整体审美；不要因为人物身份、"
    "动物种类或题材类别本身而偏好某张。只输出严格 JSON，不要输出解释性正文。"
)
MD_SYSTEM = (
    MINIMAL_SYSTEM
    + " 评判顺序：先排除明显失焦、严重抖动、过曝欠曝、遮挡和低信息截图；再比较主体是否明确、"
      "画面层次、视觉平衡、光线、色彩协调、景深、重复、对称和三分构图；技术质量接近时，选择更能"
      "代表同一地点、事件或回忆的一张。不能把风景、人像、宠物等题材类别当作质量证据。"
)
USER_TEXT = (
    "<image><image>照片 A 与照片 B 属于同一主题或相近内容。选出更适合作为旅程精选/封面的照片。"
    "只输出 {\"choice\":\"A或B\",\"reasonCode\":\"原因代码\"}。"
)


REASON_CODES = {
    "BalancingElements": "balancing_elements",
    "ColorHarmony": "color_harmony",
    "Content": "content",
    "DoF": "depth_of_field",
    "Light": "light",
    "MotionBlur": "motion_blur",
    "Object": "subject_expression",
    "Repetition": "repetition",
    "RuleOfThirds": "rule_of_thirds",
    "Symmetry": "symmetry",
    "VividColor": "vivid_color",
    "overallAesthetic": "overall_aesthetic",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def stable_order_key(value: str) -> str:
    return hashlib.sha256(f"pocket-earth-bundle-v1:{value}".encode()).hexdigest()


def sft_row(pair: dict[str, Any], swapped: bool) -> tuple[str, dict[str, Any]]:
    image_a = pair["bundleImageB"] if swapped else pair["bundleImageA"]
    image_b = pair["bundleImageA"] if swapped else pair["bundleImageB"]
    preferred = pair["preferred"]
    if swapped:
        preferred = "B" if preferred == "A" else "A"
    row_id = f"{pair['pairId']}:{'swap' if swapped else 'original'}"
    answer = json.dumps(
        {"choice": preferred, "reasonCode": pair["normalizedReasonCode"]},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    row = {
        "messages": [
            {"role": "system", "content": MINIMAL_SYSTEM},
            {"role": "user", "content": USER_TEXT},
            {"role": "assistant", "content": answer},
        ],
        "images": [image_a, image_b],
    }
    return row_id, row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aadb-pairs", type=Path, required=True)
    parser.add_argument("--tad66k-pairs", type=Path, required=True)
    parser.add_argument("--aadb-images", type=Path, required=True)
    parser.add_argument("--tad66k-images", type=Path, required=True)
    parser.add_argument("--cross-duplicate-audit", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    pairs = read_jsonl(args.aadb_pairs) + read_jsonl(args.tad66k_pairs)
    image_records = {}
    for dataset, manifest_path in (
        ("AADB", args.aadb_images),
        ("TAD66K", args.tad66k_images),
    ):
        for record in read_jsonl(manifest_path):
            image_records[(dataset, record["image"])] = record
    cross_audit = json.loads(args.cross_duplicate_audit.read_text(encoding="utf-8"))
    cross_duplicate_names = {
        (member["dataset"], member["image"])
        for group in cross_audit["groups"]
        for member in group["members"]
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    copied = {}
    selected_cross_duplicates = set()
    for pair in pairs:
        for side in ("A", "B"):
            image_name = pair[f"image{side}"]
            key = (pair["dataset"], image_name)
            if key in cross_duplicate_names:
                selected_cross_duplicates.add(key)
            record = image_records[key]
            source = Path(pair[f"path{side}"])
            if not source.is_absolute():
                source = (Path.cwd() / source).resolve()
            relative = Path("images") / pair["dataset"].lower() / image_name
            destination = args.output_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if key not in copied:
                if sha256_file(source) != record["sha256"]:
                    raise ValueError(f"Source image SHA-256 mismatch: {source}")
                shutil.copyfile(source, destination)
                if sha256_file(destination) != record["sha256"]:
                    raise ValueError(f"Copied image SHA-256 mismatch: {destination}")
                copied[key] = {
                    "dataset": pair["dataset"],
                    "image": image_name,
                    "path": relative.as_posix(),
                    "bytes": destination.stat().st_size,
                    "sha256": record["sha256"],
                    "phash": record["phash"],
                    "split": pair["split"],
                    "duplicateGroup": record["duplicateGroup"],
                }
            elif copied[key]["split"] != pair["split"]:
                raise ValueError(f"Selected image crosses split: {key}")
            pair[f"bundleImage{side}"] = relative.as_posix()
        pair["normalizedReasonCode"] = REASON_CODES[pair["reasonCode"]]

    pair_ids = [pair["pairId"] for pair in pairs]
    split_by_image: dict[tuple[str, str], set[str]] = defaultdict(set)
    duplicate_split: dict[tuple[str, str], set[str]] = defaultdict(set)
    for pair in pairs:
        for side in ("A", "B"):
            key = (pair["dataset"], pair[f"image{side}"])
            split_by_image[key].add(pair["split"])
            duplicate_split[(pair["dataset"], pair[f"group{side}"])].add(pair["split"])

    canonical_rows = []
    sft_rows_by_split: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    for pair in pairs:
        canonical = {
            "pairId": pair["pairId"],
            "dataset": pair["dataset"],
            "split": pair["split"],
            "imageA": pair["bundleImageA"],
            "imageB": pair["bundleImageB"],
            "preferred": pair["preferred"],
            "reasonCode": pair["normalizedReasonCode"],
            "scoreGap": pair["scoreGap"],
            "clipSimilarity": pair["clipSimilarity"],
            "theme": pair.get("theme"),
            "labelSource": pair["labelSource"],
        }
        canonical_rows.append(canonical)
        sft_rows_by_split[pair["split"]].append(sft_row(pair, swapped=False))
        sft_rows_by_split[pair["split"]].append(sft_row(pair, swapped=True))

    canonical_rows.sort(key=lambda row: stable_order_key(row["pairId"]))
    write_jsonl(args.output_dir / "canonical-pairs.jsonl", canonical_rows)
    for split in ("train", "validation", "test"):
        ordered = [
            row for _row_id, row in sorted(
                sft_rows_by_split[split], key=lambda item: stable_order_key(item[0])
            )
        ]
        write_jsonl(args.output_dir / f"{split}.jsonl", ordered)
    image_manifest_rows = sorted(copied.values(), key=lambda row: (row["dataset"], row["image"]))
    write_jsonl(args.output_dir / "image-manifest.jsonl", image_manifest_rows)
    prompts = {
        "schemaVersion": 1,
        "minimalSystem": MINIMAL_SYSTEM,
        "mdBaselineSystem": MD_SYSTEM,
        "user": USER_TEXT,
        "allowedReasonCodes": sorted(set(REASON_CODES.values())),
        "trainingSystem": "minimalSystem",
        "evaluationRule": "Base and LoRA use minimalSystem; MD baseline uses mdBaselineSystem; all share the same user prompt and parser.",
    }
    (args.output_dir / "prompts.json").write_text(
        json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "bundleVersion": "pocket-earth-aesthetic-curator-learnability-v1",
        "canonicalPairs": dict(sorted(Counter(pair["split"] for pair in pairs).items())),
        "canonicalPairsByDataset": {
            split: dict(sorted(Counter(
                pair["dataset"] for pair in pairs if pair["split"] == split
            ).items()))
            for split in ("train", "validation", "test")
        },
        "sftRowsAfterPositionSwap": {
            split: len(sft_rows_by_split[split])
            for split in ("train", "validation", "test")
        },
        "uniqueImages": len(copied),
        "imageBytes": sum(record["bytes"] for record in copied.values()),
        "reasonCountsTrain": dict(sorted(Counter(
            pair["normalizedReasonCode"] for pair in pairs if pair["split"] == "train"
        ).items())),
        "crossDatasetAudit": {
            "fullSourceNearDuplicateGroups": cross_audit["crossDatasetNearDuplicateGroups"],
            "fullSourceCrossSplitGroups": cross_audit["crossSplitGroups"],
            "selectedImagesInThoseGroups": [list(key) for key in sorted(selected_cross_duplicates)],
        },
        "gates": {
            "uniquePairIds": len(pair_ids) == len(set(pair_ids)),
            "noSelectedImageCrossesSplit": all(len(splits) == 1 for splits in split_by_image.values()),
            "noSelectedDuplicateGroupCrossesSplit": all(len(splits) == 1 for splits in duplicate_split.values()),
            "noSelectedCrossDatasetNearDuplicate": not selected_cross_duplicates,
            "allPairsPositionSwappedExactlyOnce": all(
                len(sft_rows_by_split[split]) == 2 * sum(pair["split"] == split for pair in pairs)
                for split in ("train", "validation", "test")
            ),
            "allImagesCopiedAndSha256Verified": len(copied) == len(image_manifest_rows),
            "allReasonCodesNormalized": all(pair["normalizedReasonCode"] in REASON_CODES.values() for pair in pairs),
        },
    }
    if not all(report["gates"].values()):
        raise RuntimeError(f"Training bundle gates failed: {report['gates']}")
    tracked_files = [
        "canonical-pairs.jsonl", "train.jsonl", "validation.jsonl", "test.jsonl",
        "image-manifest.jsonl", "prompts.json",
    ]
    report["files"] = {
        name: {
            "bytes": (args.output_dir / name).stat().st_size,
            "sha256": sha256_file(args.output_dir / name),
        }
        for name in tracked_files
    }
    (args.output_dir / "bundle-manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
