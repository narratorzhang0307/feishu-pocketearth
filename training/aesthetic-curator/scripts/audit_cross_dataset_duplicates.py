#!/usr/bin/env python3
"""Audit cross-source exact and near duplicates before combining pair datasets."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aadb", type=Path, required=True)
    parser.add_argument("--tad66k", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--phash-distance", type=int, default=3)
    args = parser.parse_args()

    aadb_records = read_jsonl(args.aadb)
    tad66k_records = read_jsonl(args.tad66k)
    for record in aadb_records:
        record.setdefault("dataset", "AADB")
    for record in tad66k_records:
        record.setdefault("dataset", "TAD66K")
    records = aadb_records + tad66k_records
    union_find = UnionFind(len(records))
    hashes = [int(record["phash"], 16) for record in records]
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    cross_edges = []
    for index, value in enumerate(hashes):
        candidates = set()
        for chunk in range(4):
            candidates.update(buckets[(chunk, (value >> (chunk * 16)) & 0xFFFF)])
        for candidate in candidates:
            if records[index]["dataset"] == records[candidate]["dataset"]:
                continue
            distance = (value ^ hashes[candidate]).bit_count()
            if distance <= args.phash_distance:
                union_find.union(index, candidate)
                cross_edges.append((candidate, index, distance))
        for chunk in range(4):
            buckets[(chunk, (value >> (chunk * 16)) & 0xFFFF)].append(index)

    groups: dict[int, set[int]] = defaultdict(set)
    for left, right, _distance in cross_edges:
        root = union_find.find(left)
        groups[root].update((left, right))
    normalized_groups = []
    for members in groups.values():
        member_records = [records[index] for index in sorted(members)]
        datasets = {record["dataset"] for record in member_records}
        if len(datasets) < 2:
            continue
        normalized_groups.append({
            "members": [
                {
                    "dataset": record["dataset"],
                    "image": record["image"],
                    "split": record.get("split"),
                    "sha256": record["sha256"],
                    "phash": record["phash"],
                }
                for record in member_records
            ],
            "crossesSplit": len({record.get("split") for record in member_records}) > 1,
            "containsExactSha256Match": len({record["sha256"] for record in member_records}) < len(member_records),
        })

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "records": len(records),
        "datasets": {
            "AADB": sum(record["dataset"] == "AADB" for record in records),
            "TAD66K": sum(record["dataset"] == "TAD66K" for record in records),
        },
        "phashDistance": args.phash_distance,
        "crossDatasetNearDuplicateEdges": len(cross_edges),
        "crossDatasetNearDuplicateGroups": len(normalized_groups),
        "crossDatasetNearDuplicateImages": sum(len(group["members"]) for group in normalized_groups),
        "crossSplitGroups": sum(group["crossesSplit"] for group in normalized_groups),
        "exactSha256Groups": sum(group["containsExactSha256Match"] for group in normalized_groups),
        "groups": normalized_groups,
        "gate": {
            "noCrossDatasetNearDuplicates": not normalized_groups,
            "safeToCombineWithoutAdditionalQuarantine": not normalized_groups,
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
