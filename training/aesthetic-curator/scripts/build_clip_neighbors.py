#!/usr/bin/env python3
"""Build same-split CLIP semantic neighbor edges for content-matched pairing."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


EXPECTED_MODEL = "Xenova/clip-vit-base-patch32"
EXPECTED_VERSION = "clip-vit-b32-q8-int8-v1"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--embeddings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--top-k", type=int, default=40)
    parser.add_argument("--minimum-similarity", type=float, default=0.65)
    parser.add_argument("--block-size", type=int, default=256)
    args = parser.parse_args()

    records = read_jsonl(args.records)
    embeddings = read_jsonl(args.embeddings)
    by_image = {record["image"]: record for record in embeddings}
    if len(records) != 9_958 or len(by_image) != len(records):
        raise ValueError("AADB record/embedding count mismatch")
    if set(by_image) != {record["image"] for record in records}:
        raise ValueError("AADB record/embedding image-name mismatch")
    if any(
        item["modelId"] != EXPECTED_MODEL
        or item["version"] != EXPECTED_VERSION
        or item["dimension"] != 512
        for item in embeddings
    ):
        raise ValueError("Unexpected CLIP model, version or dimension")

    all_edges: dict[tuple[int, int], dict[str, Any]] = {}
    split_stats = {}
    for split in ("train", "validation", "test"):
        global_indices = np.array([
            index for index, record in enumerate(records) if record["split"] == split
        ], dtype=np.int32)
        matrix = np.array([
            by_image[records[index]["image"]]["vector"] for index in global_indices
        ], dtype=np.float32)
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True).clip(min=1e-8)
        split_similarities = []
        for start in range(0, len(global_indices), args.block_size):
            stop = min(start + args.block_size, len(global_indices))
            similarities = matrix[start:stop] @ matrix.T
            row_ids = np.arange(start, stop)
            similarities[np.arange(stop - start), row_ids] = -np.inf
            take = min(args.top_k, len(global_indices) - 1)
            nearest = np.argpartition(similarities, -take, axis=1)[:, -take:]
            for row_offset, local_neighbors in enumerate(nearest):
                local_left = start + row_offset
                for local_right in local_neighbors:
                    similarity = float(similarities[row_offset, local_right])
                    if similarity < args.minimum_similarity:
                        continue
                    left = int(global_indices[local_left])
                    right = int(global_indices[local_right])
                    if records[left]["duplicateGroup"] == records[right]["duplicateGroup"]:
                        continue
                    low, high = sorted((left, right))
                    key = (low, high)
                    previous = all_edges.get(key)
                    if previous is None or similarity > previous["similarity"]:
                        all_edges[key] = {
                            "split": split,
                            "leftIndex": low,
                            "rightIndex": high,
                            "imageLeft": records[low]["image"],
                            "imageRight": records[high]["image"],
                            "similarity": round(similarity, 6),
                            "modelId": EXPECTED_MODEL,
                            "version": EXPECTED_VERSION,
                        }
                    split_similarities.append(similarity)
        split_stats[split] = {
            "images": len(global_indices),
            "directedNeighborHits": len(split_similarities),
            "similarityP05": float(np.quantile(split_similarities, 0.05)) if split_similarities else None,
            "similarityP50": float(np.quantile(split_similarities, 0.50)) if split_similarities else None,
            "similarityP95": float(np.quantile(split_similarities, 0.95)) if split_similarities else None,
        }

    edges = sorted(all_edges.values(), key=lambda edge: (edge["split"], -edge["similarity"], edge["imageLeft"], edge["imageRight"]))
    for split in split_stats:
        split_stats[split]["uniqueUndirectedEdges"] = sum(edge["split"] == split for edge in edges)
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelId": EXPECTED_MODEL,
        "version": EXPECTED_VERSION,
        "topK": args.top_k,
        "minimumSimilarity": args.minimum_similarity,
        "uniqueEdges": len(edges),
        "splits": split_stats,
        "rule": "Only semantic-neighbor edges may become AADB training pairs; pHash duplicate groups are excluded.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for edge in edges:
            handle.write(json.dumps(edge, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
