#!/usr/bin/env python3
"""Rebuild leakage-safe TAD66K splits and shortlist same-series pair candidates.

The upstream train/test files are intentionally ignored.  A connected component
contains every image sharing either a filename-derived photographer key or a
pHash near-duplicate group.  Components, rather than images, are assigned to
train/validation/test.  Pair candidates must share theme and photographer and
are ranked by proximity of the source photo id before a later CLIP gate.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SPLITS = ("train", "validation", "test")


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def photo_sequence_id(image_name: str) -> int | None:
    """Return the final long numeric id, which is normally the Flickr photo id."""
    match = re.search(r"(\d{6,})$", Path(image_name).stem)
    return int(match.group(1)) if match else None


def stable_bucket(seed: str, component_key: str) -> int:
    digest = hashlib.sha256(f"{seed}:{component_key}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % 10_000


def assign_split(seed: str, component_key: str) -> str:
    bucket = stable_bucket(seed, component_key)
    if bucket < 8_000:
        return "train"
    if bucket < 9_000:
        return "validation"
    return "test"


def balanced_shortlist(
    candidates: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Prefer close sequence ids without letting one photographer dominate."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate["photographerKey"]].append(candidate)
    for pool in grouped.values():
        pool.sort(key=lambda row: (
            row["sequenceGap"] is None,
            row["sequenceGap"] if row["sequenceGap"] is not None else 2**63,
            -row["scoreGap"],
            row["candidateId"],
        ))
    photographers = sorted(grouped)
    output: list[dict[str, Any]] = []
    cursor = Counter()
    while len(output) < limit:
        progressed = False
        for photographer in photographers:
            index = cursor[photographer]
            if index >= len(grouped[photographer]):
                continue
            output.append(grouped[photographer][index])
            cursor[photographer] += 1
            progressed = True
            if len(output) >= limit:
                break
        if not progressed:
            break
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--split-output", type=Path, required=True)
    parser.add_argument("--candidate-output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--seed", default="pocket-earth-aesthetic-v1")
    parser.add_argument("--minimum-score-gap", type=float, default=0.75)
    parser.add_argument("--train-candidates-per-theme", type=int, default=180)
    parser.add_argument("--evaluation-candidates-per-theme", type=int, default=60)
    args = parser.parse_args()

    records = read_jsonl(args.records)
    union_find = UnionFind(len(records))
    photographer_anchor: dict[str, int] = {}
    duplicate_anchor: dict[str, int] = {}
    for index, record in enumerate(records):
        photographer = record.get("photographerKeyFromFilename")
        if photographer:
            if photographer in photographer_anchor:
                union_find.union(index, photographer_anchor[photographer])
            else:
                photographer_anchor[photographer] = index
        duplicate_group = record["duplicateGroup"]
        if not duplicate_group.startswith("tad66k-single-"):
            if duplicate_group in duplicate_anchor:
                union_find.union(index, duplicate_anchor[duplicate_group])
            else:
                duplicate_anchor[duplicate_group] = index

    components: dict[int, list[int]] = defaultdict(list)
    for index in range(len(records)):
        components[union_find.find(index)].append(index)
    split_by_root: dict[int, str] = {}
    component_id_by_root: dict[int, str] = {}
    for root, members in components.items():
        member_names = sorted(records[index]["image"] for index in members)
        key = member_names[0]
        component_id = hashlib.sha256(
            ("TAD66K-component:" + "\n".join(member_names)).encode()
        ).hexdigest()[:20]
        component_id_by_root[root] = f"tad66k-component-{component_id}"
        split_by_root[root] = assign_split(args.seed, key)

    split_records = []
    for index, record in enumerate(records):
        root = union_find.find(index)
        enriched = dict(record)
        enriched["split"] = split_by_root[root]
        enriched["leakageComponent"] = component_id_by_root[root]
        enriched["photoSequenceId"] = photo_sequence_id(record["image"])
        split_records.append(enriched)

    pools: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    series: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for index, record in enumerate(split_records):
        photographer = record.get("photographerKeyFromFilename")
        if photographer:
            series[(record["split"], record["theme"], photographer)].append(index)
    raw_candidate_counts = Counter()
    for (split, theme, photographer), members in series.items():
        if len(members) < 2:
            continue
        for left, right in itertools.combinations(members, 2):
            a, b = split_records[left], split_records[right]
            if a["duplicateGroup"] == b["duplicateGroup"]:
                continue
            score_gap = abs(float(a["score"]) - float(b["score"]))
            if score_gap < args.minimum_score_gap:
                continue
            sequence_gap = None
            if a["photoSequenceId"] is not None and b["photoSequenceId"] is not None:
                sequence_gap = abs(a["photoSequenceId"] - b["photoSequenceId"])
            left_name, right_name = sorted((a["image"], b["image"]))
            candidate_id = hashlib.sha256(
                f"TAD66K-candidate:{left_name}:{right_name}".encode()
            ).hexdigest()[:20]
            candidate = {
                "candidateId": f"tad66k-candidate-{candidate_id}",
                "dataset": "TAD66K",
                "split": split,
                "theme": theme,
                "photographerKey": photographer,
                "imageLeft": a["image"],
                "imageRight": b["image"],
                "zipMemberLeft": a["zipMember"],
                "zipMemberRight": b["zipMember"],
                "scoreLeft": a["score"],
                "scoreRight": b["score"],
                "scoreGap": round(score_gap, 6),
                "sequenceGap": sequence_gap,
                "duplicateGroupLeft": a["duplicateGroup"],
                "duplicateGroupRight": b["duplicateGroup"],
                "leakageComponent": a["leakageComponent"],
                "requiresClipGate": True,
            }
            if a["leakageComponent"] != b["leakageComponent"]:
                raise RuntimeError("Same photographer pair escaped its leakage component")
            pools[(split, theme)].append(candidate)
            raw_candidate_counts[(split, theme)] += 1

    shortlisted = []
    for split in SPLITS:
        limit = (
            args.train_candidates_per_theme
            if split == "train"
            else args.evaluation_candidates_per_theme
        )
        themes = sorted({record["theme"] for record in split_records})
        for theme in themes:
            shortlisted.extend(balanced_shortlist(pools[(split, theme)], limit))

    image_split = {record["image"]: record["split"] for record in split_records}
    component_split: dict[str, set[str]] = defaultdict(set)
    duplicate_split: dict[str, set[str]] = defaultdict(set)
    photographer_split: dict[str, set[str]] = defaultdict(set)
    for record in split_records:
        component_split[record["leakageComponent"]].add(record["split"])
        duplicate_split[record["duplicateGroup"]].add(record["split"])
        if record.get("photographerKeyFromFilename"):
            photographer_split[record["photographerKeyFromFilename"]].add(record["split"])

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "rules": {
            "upstreamSplitIgnored": True,
            "splitUnit": "connected component of filename-derived photographer and pHash duplicate group",
            "splitThresholds": {"train": 0.8, "validation": 0.1, "test": 0.1},
            "pairSameTheme": True,
            "pairSamePhotographer": True,
            "pairDifferentDuplicateGroup": True,
            "minimumScoreGap": args.minimum_score_gap,
            "shortlistRank": "round-robin photographers, then smallest source photo-id gap, then largest score gap",
            "clipGatePending": True,
        },
        "imagesBySplit": dict(sorted(Counter(record["split"] for record in split_records).items())),
        "components": len(components),
        "componentsBySplit": dict(sorted(Counter(split_by_root.values()).items())),
        "largestComponents": sorted((len(members) for members in components.values()), reverse=True)[:20],
        "rawCandidateCounts": {
            split: {
                theme: raw_candidate_counts[(split, theme)]
                for theme in sorted({record["theme"] for record in split_records})
            }
            for split in SPLITS
        },
        "shortlistedCandidateCounts": {
            split: dict(sorted(Counter(
                candidate["theme"] for candidate in shortlisted if candidate["split"] == split
            ).items()))
            for split in SPLITS
        },
        "shortlistedCandidates": dict(sorted(Counter(
            candidate["split"] for candidate in shortlisted
        ).items())),
        "shortlistedUniqueImages": len({
            image
            for candidate in shortlisted
            for image in (candidate["imageLeft"], candidate["imageRight"])
        }),
        "gates": {
            "allImagesAssignedExactlyOneSplit": len(image_split) == len(split_records),
            "noLeakageComponentCrossesSplit": all(len(splits) == 1 for splits in component_split.values()),
            "noDuplicateGroupCrossesSplit": all(len(splits) == 1 for splits in duplicate_split.values()),
            "noParsedPhotographerCrossesSplit": all(len(splits) == 1 for splits in photographer_split.values()),
            "allCandidatesSameThemeAndPhotographer": all(
                candidate["photographerKey"]
                and image_split[candidate["imageLeft"]] == candidate["split"]
                and image_split[candidate["imageRight"]] == candidate["split"]
                for candidate in shortlisted
            ),
            "allCandidatesNeedClipGate": all(candidate["requiresClipGate"] for candidate in shortlisted),
        },
    }
    if not all(report["gates"].values()):
        raise RuntimeError(f"TAD66K split/candidate gates failed: {report['gates']}")

    args.split_output.parent.mkdir(parents=True, exist_ok=True)
    with args.split_output.open("w", encoding="utf-8") as handle:
        for record in split_records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    args.candidate_output.parent.mkdir(parents=True, exist_ok=True)
    with args.candidate_output.open("w", encoding="utf-8") as handle:
        for candidate in sorted(shortlisted, key=lambda row: row["candidateId"]):
            handle.write(json.dumps(candidate, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
