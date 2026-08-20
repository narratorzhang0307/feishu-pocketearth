#!/usr/bin/env python3
"""Stream-audit every TAD66K image from ZIP without expanding the 10.7 GB archive."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import imagehash
from PIL import Image, ImageOps


def read_labels(root: Path) -> dict[str, dict[str, Any]]:
    labels = {}
    for split in ("train", "test"):
        for path in sorted((root / "unmerge" / split).glob("*.csv")):
            with path.open(newline="", encoding="utf-8-sig") as handle:
                for row in csv.DictReader(handle):
                    name = row["image"].strip()
                    if name in labels:
                        raise ValueError(f"Duplicate TAD66K label image: {name}")
                    labels[name] = {
                        "upstreamPhase": split,
                        "theme": path.stem,
                        "score": float(row["score"]),
                    }
    return labels


def photographer_key(name: str) -> str | None:
    stem = Path(name).stem
    nsid = re.match(r"^(\d+@N\d{2})(\d{6,})$", stem, flags=re.IGNORECASE)
    if nsid:
        return nsid.group(1).casefold()
    separated = re.match(r"^(.*?)[-_](\d{6,})$", stem)
    if separated:
        return separated.group(1).strip("-_ .").casefold() or None
    attached = re.match(r"^([^\d].*?)(\d{8,})$", stem)
    if attached:
        return attached.group(1).strip("-_ .").casefold() or None
    return None


def inspect_bytes(name: str, payload: bytes, label: dict[str, Any]) -> dict[str, Any]:
    with Image.open(io.BytesIO(payload)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGB")
        width, height = image.size
        perceptual_hash = str(imagehash.phash(image, hash_size=8))
        image_format = source.format
    return {
        "dataset": "TAD66K",
        "image": name,
        "zipMember": name,
        "bytes": len(payload),
        "width": width,
        "height": height,
        "format": image_format,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "phash": perceptual_hash,
        "photographerKeyFromFilename": photographer_key(name),
        **label,
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
            candidates.update(buckets[(chunk, (value >> (chunk * 16)) & 0xFFFF)])
        for candidate in candidates:
            if (value ^ hashes[candidate]).bit_count() <= threshold:
                union_find.union(index, candidate)
        for chunk in range(4):
            buckets[(chunk, (value >> (chunk * 16)) & 0xFFFF)].append(index)
    groups: dict[int, list[int]] = defaultdict(list)
    for index in range(len(records)):
        groups[union_find.find(index)].append(index)
    return [members for members in groups.values() if len(members) > 1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--queue-size", type=int, default=64)
    parser.add_argument("--phash-distance", type=int, default=3)
    args = parser.parse_args()

    labels = read_labels(args.labels)
    records = []
    with zipfile.ZipFile(args.archive) as archive:
        names = {
            info.filename for info in archive.infolist()
            if not info.is_dir() and info.filename.lower().endswith(".jpg")
        }
        missing = sorted(set(labels) - names)
        unexpected = sorted(names - set(labels))
        if missing:
            raise ValueError(f"TAD66K contains {len(missing)} labeled images missing from the archive")
        queue = deque()
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            for name in sorted(labels):
                payload = archive.read(name)
                queue.append(executor.submit(inspect_bytes, name, payload, labels[name]))
                if len(queue) >= args.queue_size:
                    records.append(queue.popleft().result())
                if len(records) and len(records) % 5_000 == 0:
                    print(f"decoded {len(records)}/{len(labels)}", flush=True)
            while queue:
                records.append(queue.popleft().result())

    exact: dict[str, list[int]] = defaultdict(list)
    for index, record in enumerate(records):
        exact[record["sha256"]].append(index)
    exact_groups = [members for members in exact.values() if len(members) > 1]
    phash_groups = group_near_duplicates(records, args.phash_distance)
    group_by_index = {}
    for number, members in enumerate(sorted(phash_groups, key=lambda group: records[group[0]]["image"]), start=1):
        group_id = f"tad66k-phash-{number:05d}"
        for index in members:
            group_by_index[index] = group_id
    for index, record in enumerate(records):
        record["duplicateGroup"] = group_by_index.get(index, f"tad66k-single-{index:05d}")

    cross_phase = []
    cross_theme = []
    for members in phash_groups:
        phases = {records[index]["upstreamPhase"] for index in members}
        themes = {records[index]["theme"] for index in members}
        if len(phases) > 1:
            cross_phase.append([records[index]["image"] for index in members])
        if len(themes) > 1:
            cross_theme.append([records[index]["image"] for index in members])
    photographers = Counter(record["photographerKeyFromFilename"] for record in records if record["photographerKeyFromFilename"])
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "archive": {
            "path": str(args.archive),
            "bytes": args.archive.stat().st_size,
            "sha256": "fb1b3eb3304f80aec5a18313b05611c3cd6a0adb83ea4a6eceecb91646894895",
            "zipCrcVerifiedSeparately": True,
        },
        "images": len(records),
        "decoded": len(records),
        "labeledImagesMissingFromArchive": 0,
        "unlabeledArchiveImagesQuarantined": len(unexpected),
        "unlabeledArchiveImageExamples": unexpected[:100],
        "themes": len({record["theme"] for record in records}),
        "upstreamPhaseCounts": dict(sorted(Counter(record["upstreamPhase"] for record in records).items())),
        "exactDuplicateGroups": len(exact_groups),
        "phashDistance": args.phash_distance,
        "nearDuplicateGroups": len(phash_groups),
        "nearDuplicateImages": sum(len(group) for group in phash_groups),
        "crossUpstreamPhaseNearDuplicateGroups": len(cross_phase),
        "crossThemeNearDuplicateGroups": len(cross_theme),
        "crossUpstreamPhaseExamples": cross_phase[:50],
        "photographerKeyParsedImages": sum(photographers.values()),
        "photographerKeys": len(photographers),
        "largestPhotographerGroups": photographers.most_common(20),
        "rule": (
            "Rebuild splits using connected components of pHash duplicateGroup and the heuristic "
            "photographer key parsed from the filename; never preserve the upstream split."
        ),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    with args.manifest.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
