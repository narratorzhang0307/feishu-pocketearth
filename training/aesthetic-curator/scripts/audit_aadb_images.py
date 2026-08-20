#!/usr/bin/env python3
"""Decode, hash and group every unique AADB image before splitting."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import imagehash
from PIL import Image, ImageOps


ATTRIBUTES = [
    "score", "BalacingElements", "ColorHarmony", "Content", "DoF", "Light",
    "MotionBlur", "Object", "Repetition", "RuleOfThirds", "Symmetry", "VividColor",
]
PHASE_PREFIXES = {
    "train": "imgListTrainRegression_",
    "validation": "imgListValidationRegression_",
    "test": "imgListTestRegression_",
}


def read_labels(path: Path) -> tuple[list[str], list[float]]:
    names = []
    values = []
    for line in path.read_text(encoding="utf-8").splitlines():
        name, value = line.rsplit(maxsplit=1)
        names.append(name)
        values.append(float(value))
    return names, values


def load_label_rows(label_root: Path) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for phase, prefix in PHASE_PREFIXES.items():
        phase_names = None
        phase_values: dict[str, list[float]] = {}
        for attribute in ATTRIBUTES:
            names, values = read_labels(label_root / f"{prefix}{attribute}.txt")
            if phase_names is None:
                phase_names = names
            elif names != phase_names:
                raise ValueError(f"Attribute order differs for {phase}/{attribute}")
            phase_values[attribute] = values
        assert phase_names is not None
        for index, name in enumerate(phase_names):
            if name in rows:
                raise ValueError(f"Image appears in more than one canonical phase: {name}")
            rows[name] = {
                "upstreamPhase": phase,
                "attributes": {
                    attribute: phase_values[attribute][index] for attribute in ATTRIBUTES
                },
            }
    return rows


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_image(item: tuple[str, Path, dict[str, Any]]) -> dict[str, Any]:
    name, path, labels = item
    with Image.open(path) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGB")
        width, height = image.size
        perceptual_hash = str(imagehash.phash(image, hash_size=8))
        image_format = source.format
    return {
        "image": name,
        "path": str(path),
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "format": image_format,
        "sha256": sha256_file(path),
        "phash": perceptual_hash,
        **labels,
    }


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def group_near_duplicates(records: list[dict[str, Any]], threshold: int) -> list[list[int]]:
    hashes = [int(record["phash"], 16) for record in records]
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    union_find = UnionFind(len(records))
    for index, value in enumerate(hashes):
        candidates = set()
        for chunk in range(4):
            key = (chunk, (value >> (chunk * 16)) & 0xFFFF)
            candidates.update(buckets[key])
        for candidate in candidates:
            if (value ^ hashes[candidate]).bit_count() <= threshold:
                union_find.union(index, candidate)
        for chunk in range(4):
            key = (chunk, (value >> (chunk * 16)) & 0xFFFF)
            buckets[key].append(index)

    groups: dict[int, list[int]] = defaultdict(list)
    for index in range(len(records)):
        groups[union_find.find(index)].append(index)
    return [members for members in groups.values() if len(members) > 1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--phash-distance", type=int, default=3)
    args = parser.parse_args()

    label_rows = load_label_rows(args.root / "imgListFiles_label")
    image_root = args.root / "datasetImages_originalSize"
    disk_names = {path.name for path in image_root.iterdir() if path.is_file()}
    missing = sorted(set(label_rows) - disk_names)
    unexpected = sorted(disk_names - set(label_rows))
    if missing or unexpected:
        raise ValueError(f"AADB label/image mismatch: missing={len(missing)}, unexpected={len(unexpected)}")

    items = [(name, image_root / name, label_rows[name]) for name in sorted(label_rows)]
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        records = list(executor.map(inspect_image, items))

    exact_groups: dict[str, list[int]] = defaultdict(list)
    for index, record in enumerate(records):
        exact_groups[record["sha256"]].append(index)
    exact_duplicate_groups = [members for members in exact_groups.values() if len(members) > 1]
    phash_groups = group_near_duplicates(records, args.phash_distance)

    group_by_index: dict[int, str] = {}
    for number, members in enumerate(sorted(phash_groups, key=lambda group: records[group[0]]["image"]), start=1):
        group_id = f"aadb-phash-{number:05d}"
        for index in members:
            group_by_index[index] = group_id
    for index, record in enumerate(records):
        record["duplicateGroup"] = group_by_index.get(index, f"aadb-single-{index:05d}")

    test_new_root = args.root / "AADB_newtest_originalSize"
    mirror_copy_mismatches = []
    original_hashes = {record["image"]: record["sha256"] for record in records}
    for copy_path in sorted(path for path in test_new_root.iterdir() if path.is_file()):
        expected_hash = original_hashes.get(copy_path.name)
        if expected_hash is None or sha256_file(copy_path) != expected_hash:
            mirror_copy_mismatches.append(copy_path.name)

    cross_phase_phash_groups = []
    for members in phash_groups:
        phases = {records[index]["upstreamPhase"] for index in members}
        if len(phases) > 1:
            cross_phase_phash_groups.append({
                "images": [records[index]["image"] for index in members],
                "phases": sorted(phases),
            })

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "images": len(records),
        "decoded": len(records),
        "missingLabelsOrImages": 0,
        "exactDuplicateGroups": len(exact_duplicate_groups),
        "phashDistance": args.phash_distance,
        "nearDuplicateGroups": len(phash_groups),
        "nearDuplicateImages": sum(len(group) for group in phash_groups),
        "crossUpstreamPhaseNearDuplicateGroups": len(cross_phase_phash_groups),
        "crossUpstreamPhaseNearDuplicateExamples": cross_phase_phash_groups[:50],
        "testNewMirrorCopyMismatches": len(mirror_copy_mismatches),
        "testNewMirrorCopyMismatchExamples": mirror_copy_mismatches[:50],
        "rule": "Rebuild all Pocket Earth splits by duplicateGroup; never preserve an upstream split across a group.",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with args.manifest.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
