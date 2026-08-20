#!/usr/bin/env python3
"""Re-run every cheap bundle invariant immediately before upload or GPU use."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def expected_row(pair: dict[str, Any], swapped: bool, system: str, user: str) -> dict[str, Any]:
    preferred = pair["preferred"]
    images = [pair["imageA"], pair["imageB"]]
    if swapped:
        preferred = "B" if preferred == "A" else "A"
        images.reverse()
    answer = json.dumps(
        {"choice": preferred, "reasonCode": pair["reasonCode"]},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
            {"role": "assistant", "content": answer},
        ],
        "images": images,
    }


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads((args.bundle / "bundle-manifest.json").read_text(encoding="utf-8"))
    prompts = json.loads((args.bundle / "prompts.json").read_text(encoding="utf-8"))
    canonical_pairs = read_jsonl(args.bundle / "canonical-pairs.jsonl")
    image_manifest = read_jsonl(args.bundle / "image-manifest.jsonl")
    allowed_reasons = set(prompts["allowedReasonCodes"])

    tracked_hashes_match = all(
        (args.bundle / name).stat().st_size == details["bytes"]
        and sha256_file(args.bundle / name) == details["sha256"]
        for name, details in manifest["files"].items()
    )
    image_hashes_match = True
    for image in image_manifest:
        path = args.bundle / image["path"]
        if (
            not path.is_file()
            or path.stat().st_size != image["bytes"]
            or sha256_file(path) != image["sha256"]
        ):
            image_hashes_match = False
            break

    split_by_image: dict[str, set[str]] = defaultdict(set)
    canonical_by_split: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pair in canonical_pairs:
        canonical_by_split[pair["split"]].append(pair)
        split_by_image[pair["imageA"]].add(pair["split"])
        split_by_image[pair["imageB"]].add(pair["split"])

    row_contract_ok = True
    row_multiset_ok = True
    row_counts = {}
    for split in ("train", "validation", "test"):
        rows = read_jsonl(args.bundle / f"{split}.jsonl")
        row_counts[split] = len(rows)
        actual = Counter(canonical_json(row) for row in rows)
        expected = Counter()
        for pair in canonical_by_split[split]:
            for swapped in (False, True):
                row = expected_row(
                    pair,
                    swapped,
                    prompts["minimalSystem"],
                    prompts["user"],
                )
                expected[canonical_json(row)] += 1
        row_multiset_ok = row_multiset_ok and actual == expected
        for row in rows:
            if (
                list(row) != ["images", "messages"]
                or len(row["images"]) != 2
                or [message["role"] for message in row["messages"]] != ["system", "user", "assistant"]
                or row["messages"][0]["content"] != prompts["minimalSystem"]
                or row["messages"][1]["content"].count("<image>") != 2
                or any(not (args.bundle / image).is_file() for image in row["images"])
            ):
                row_contract_ok = False
                break
            try:
                answer = json.loads(row["messages"][2]["content"])
            except json.JSONDecodeError:
                row_contract_ok = False
                break
            if (
                set(answer) != {"choice", "reasonCode"}
                or answer["choice"] not in {"A", "B"}
                or answer["reasonCode"] not in allowed_reasons
            ):
                row_contract_ok = False
                break

    gates = {
        "trackedFileHashesMatchFrozenManifest": tracked_hashes_match,
        "allImageHashesMatchFrozenManifest": image_hashes_match,
        "canonicalPairCountMatches": len(canonical_pairs) == sum(manifest["canonicalPairs"].values()),
        "rowCountsMatch": all(
            row_counts[split] == manifest["sftRowsAfterPositionSwap"][split]
            for split in ("train", "validation", "test")
        ),
        "rowSchemaAndStrictJsonValid": row_contract_ok,
        "eachCanonicalPairHasExactOriginalAndSwapRows": row_multiset_ok,
        "noSelectedImageCrossesSplit": all(len(splits) == 1 for splits in split_by_image.values()),
        "allCanonicalReasonCodesAllowed": all(pair["reasonCode"] in allowed_reasons for pair in canonical_pairs),
    }
    result = {
        "bundle": str(args.bundle),
        "canonicalPairs": len(canonical_pairs),
        "rows": row_counts,
        "images": len(image_manifest),
        "gates": gates,
        "ready": all(gates.values()),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
