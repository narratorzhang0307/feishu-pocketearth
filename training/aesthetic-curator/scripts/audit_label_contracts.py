#!/usr/bin/env python3
"""Audit the upstream label contracts before any pair generation."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_scores(path: Path) -> list[tuple[str, float]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["image", "score"]:
            raise ValueError(f"Unexpected columns in {path}: {reader.fieldnames}")
        rows = []
        for line, row in enumerate(reader, start=2):
            name = row["image"].strip()
            score = float(row["score"])
            if not name or not math.isfinite(score):
                raise ValueError(f"Invalid row at {path}:{line}")
            rows.append((name, score))
        return rows


def audit_tad66k(root: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"root": str(root), "splits": {}}
    unmerged_names: dict[str, set[str]] = {}
    unmerged_scores: dict[str, dict[str, float]] = {}

    for split in ("train", "test"):
        theme_files = sorted((root / "unmerge" / split).glob("*.csv"))
        if len(theme_files) != 47:
            raise ValueError(f"Expected 47 TAD66K themes for {split}, found {len(theme_files)}")

        by_name: dict[str, list[tuple[str, float]]] = defaultdict(list)
        themes: dict[str, Any] = {}
        for path in theme_files:
            rows = read_scores(path)
            themes[path.stem] = {
                "rows": len(rows),
                "scoreMin": min(score for _, score in rows),
                "scoreMax": max(score for _, score in rows),
            }
            for name, score in rows:
                by_name[name].append((path.stem, score))

        duplicates = {name: values for name, values in by_name.items() if len(values) > 1}
        scores = {name: values[0][1] for name, values in by_name.items()}
        unmerged_names[split] = set(by_name)
        unmerged_scores[split] = scores
        result["splits"][split] = {
            "themes": len(theme_files),
            "rows": sum(item["rows"] for item in themes.values()),
            "uniqueImages": len(by_name),
            "duplicateImageNames": len(duplicates),
            "scoreMin": min(scores.values()),
            "scoreMax": max(scores.values()),
            "perTheme": themes,
        }

    train_test_overlap = unmerged_names["train"] & unmerged_names["test"]
    result["unmergedTrainTestOverlap"] = len(train_test_overlap)

    merged_names: dict[str, set[str]] = {}
    for split in ("train", "test"):
        merged = dict(read_scores(root / "merge" / f"{split}.csv"))
        merged_names[split] = set(merged)
        score_mismatches = sum(
            name not in merged or not math.isclose(score, merged[name], abs_tol=1e-12)
            for name, score in unmerged_scores[split].items()
        )
        result["splits"][split]["mergedRows"] = len(merged)
        result["splits"][split]["mergedScoreOrMembershipMismatches"] = score_mismatches

    moved_train_to_merged_test = (
        unmerged_names["train"] - merged_names["train"]
    ) & merged_names["test"]
    result["upstreamMergeSplitDrift"] = {
        "unmergedTrainImagesMovedToMergedTest": len(moved_train_to_merged_test),
        "mergedTrainTestOverlap": len(merged_names["train"] & merged_names["test"]),
        "rule": "Never use labels/merge as the Pocket Earth split; use theme files and rebuild a grouped split.",
    }
    return result


def matlab_strings(value: Any) -> list[str]:
    result = []
    for item in value.reshape(-1):
        while hasattr(item, "size") and getattr(item, "size", 0) == 1 and not isinstance(item, str):
            item = item.reshape(-1)[0]
        result.append(str(item))
    return result


def audit_aadb(path: Path) -> dict[str, Any]:
    try:
        from scipy.io import loadmat
    except ImportError as exc:
        raise RuntimeError("AADB audit requires scipy") from exc

    data = loadmat(path)
    required = {"trainNameList", "trainScore", "testNameList", "testScore"}
    missing = sorted(required - data.keys())
    if missing:
        raise ValueError(f"AADBinfo.mat is missing variables: {missing}")

    train_names = matlab_strings(data["trainNameList"])
    test_names = matlab_strings(data["testNameList"])
    train_scores = [float(value) for value in data["trainScore"].reshape(-1)]
    test_scores = [float(value) for value in data["testScore"].reshape(-1)]
    if len(train_names) != len(train_scores) or len(test_names) != len(test_scores):
        raise ValueError("AADB name and score lengths differ")

    variables = sorted(key for key in data if not key.startswith("__"))
    has_attribute_or_rater_labels = any(
        token in key.lower() for key in variables for token in ("attribute", "rater", "user")
    )
    all_scores = train_scores + test_scores
    return {
        "path": str(path),
        "variables": variables,
        "trainRows": len(train_names),
        "testRows": len(test_names),
        "totalRows": len(train_names) + len(test_names),
        "trainUniqueNames": len(set(train_names)),
        "testUniqueNames": len(set(test_names)),
        "trainTestNameOverlap": len(set(train_names) & set(test_names)),
        "scoreMin": min(all_scores),
        "scoreMax": max(all_scores),
        "hasAttributeOrRaterLabels": has_attribute_or_rater_labels,
        "rule": (
            "Use this file only for aggregate aesthetic pairs. Attribute-aware or rater-aware "
            "pairs remain blocked until their source labels are acquired and audited."
        ),
    }


def read_aadb_label_file(path: Path) -> tuple[list[str], list[float]]:
    names = []
    values = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        try:
            name, value = line.rsplit(maxsplit=1)
            values.append(float(value))
        except ValueError as exc:
            raise ValueError(f"Invalid AADB label at {path}:{line_number}") from exc
        names.append(name)
    return names, values


def audit_aadb_extracted(root: Path) -> dict[str, Any]:
    label_root = root / "imgListFiles_label"
    attributes = [
        "score", "BalacingElements", "ColorHarmony", "Content", "DoF", "Light",
        "MotionBlur", "Object", "Repetition", "RuleOfThirds", "Symmetry", "VividColor",
    ]
    prefixes = {
        "train": "imgListTrainRegression_",
        "validation": "imgListValidationRegression_",
        "test": "imgListTestRegression_",
        "testNew": "imgListTestNewRegression_",
    }
    phases: dict[str, Any] = {}
    phase_names: dict[str, set[str]] = {}
    for phase, prefix in prefixes.items():
        reference_names = None
        all_values = []
        for attribute in attributes:
            names, values = read_aadb_label_file(label_root / f"{prefix}{attribute}.txt")
            if reference_names is None:
                reference_names = names
            elif names != reference_names:
                raise ValueError(f"AADB attribute row order differs in {phase}/{attribute}")
            all_values.extend(values)
        assert reference_names is not None
        phase_names[phase] = set(reference_names)
        phases[phase] = {
            "rows": len(reference_names),
            "uniqueImages": len(set(reference_names)),
            "attributeCount": len(attributes),
            "valueMin": min(all_values),
            "valueMax": max(all_values),
        }

    image_dirs = {
        "original": root / "datasetImages_originalSize",
        "warp256": root / "datasetImages_warp256",
        "testNewOriginal": root / "AADB_newtest_originalSize",
    }
    image_names = {
        key: {path.name for path in directory.iterdir() if path.is_file()}
        for key, directory in image_dirs.items()
    }
    all_images = set().union(*image_names.values())
    missing = {
        phase: len(names - all_images)
        for phase, names in phase_names.items()
    }
    return {
        "root": str(root),
        "attributes": attributes,
        "phases": phases,
        "imageCounts": {key: len(names) for key, names in image_names.items()},
        "missingImagesByPhase": missing,
        "overlap": {
            "trainValidation": len(phase_names["train"] & phase_names["validation"]),
            "trainTestNew": len(phase_names["train"] & phase_names["testNew"]),
            "validationTestNew": len(phase_names["validation"] & phase_names["testNew"]),
            "oldTestTestNew": len(phase_names["test"] & phase_names["testNew"]),
        },
        "hasAttributeLabels": True,
        "hasRaterIdentifiers": False,
        "rule": (
            "Use the mutually exclusive train/validation/old-test union as one 9,958-image source pool, "
            "ignore testNew as a redundant resplit, then rebuild every Pocket Earth split by pHash group. "
            "Rater-aware pairs remain disabled."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tad-labels", type=Path, required=True)
    parser.add_argument("--aadb-info", type=Path, required=True)
    parser.add_argument("--aadb-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tad66k": audit_tad66k(args.tad_labels),
        "aadb": audit_aadb(args.aadb_info),
        "aadbExtracted": audit_aadb_extracted(args.aadb_root),
    }
    blockers = []
    if report["tad66k"]["unmergedTrainTestOverlap"]:
        blockers.append("TAD66K unmerged train/test overlap is non-zero")
    drift = report["tad66k"]["upstreamMergeSplitDrift"]["unmergedTrainImagesMovedToMergedTest"]
    if drift:
        blockers.append(f"TAD66K merged labels move {drift} images across the upstream split")
    if not report["aadbExtracted"]["hasAttributeLabels"]:
        blockers.append("AADB attribute labels are unavailable")
    if any(report["aadbExtracted"]["missingImagesByPhase"].values()):
        blockers.append("AADB contains labels without matching decoded images")
    blockers.extend([
        "Image archives are not yet fully downloaded, hashed and decoded",
        "The Pocket Earth blind evaluation set is not yet frozen",
        "pHash near-duplicate groups have not yet been computed",
    ])
    report["blockers"] = blockers
    report["warnings"] = [
        "AADB rater identifiers are unavailable; do not generate rater-aware pairs",
        "AADB testNew is a redundant resplit; use the train/validation/old-test union only as an unsplit source pool",
    ]
    report["trainingReady"] = not blockers

    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
