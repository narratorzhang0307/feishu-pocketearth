#!/usr/bin/env python3
"""Audit and normalize SPAQ annotations before any image download or pairing."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


QUALITY_COLUMNS = ["MOS", "Brightness", "Colorfulness", "Contrast", "Noisiness", "Sharpness"]
SCENE_COLUMNS = [
    "Animal", "Cityscape", "Human", "Indoor scene", "Landscape",
    "Night scene", "Plant", "Still-life", "Others",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def assert_unique_names(frame: pd.DataFrame, source: str) -> list[str]:
    names = frame["Image name"].astype(str).tolist()
    if len(names) != 11_125:
        raise ValueError(f"{source}: expected 11,125 rows, found {len(names)}")
    if len(set(names)) != len(names):
        raise ValueError(f"{source}: duplicate image names")
    return names


def finite_range(frame: pd.DataFrame, columns: list[str], source: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column in columns:
        values = pd.to_numeric(frame[column], errors="coerce")
        if values.isna().any() or not values.map(math.isfinite).all():
            raise ValueError(f"{source}/{column}: missing or non-finite values")
        result[column] = {
            "min": float(values.min()),
            "max": float(values.max()),
            "mean": float(values.mean()),
            "p05": float(values.quantile(0.05)),
            "p50": float(values.quantile(0.50)),
            "p95": float(values.quantile(0.95)),
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    quality_path = args.annotations / "MOS and Image attribute scores.xlsx"
    scene_path = args.annotations / "Scene category labels.xlsx"
    exif_path = args.annotations / "EXIF_tags.xlsx"
    quality = pd.read_excel(quality_path)
    scene = pd.read_excel(scene_path)
    exif = pd.read_excel(exif_path, sheet_name="Source EXIF tags")

    quality_names = assert_unique_names(quality, "quality")
    scene_names = assert_unique_names(scene, "scene")
    exif_names = assert_unique_names(exif, "exif")
    if set(quality_names) != set(scene_names) or set(quality_names) != set(exif_names):
        raise ValueError("SPAQ annotation workbooks do not describe the same image-name set")

    quality_by_name = quality.set_index("Image name")
    scene_by_name = scene.set_index("Image name")
    exif_by_name = exif.set_index("Image name")
    quality_stats = finite_range(quality, QUALITY_COLUMNS, "quality")
    scene_stats = finite_range(scene, SCENE_COLUMNS, "scene")
    scene_sums = scene[SCENE_COLUMNS].sum(axis=1)
    invalid_scene_rows = int((scene_sums.sub(1.0).abs() > 1e-5).sum())
    if invalid_scene_rows:
        raise ValueError(f"SPAQ scene probabilities do not sum to one for {invalid_scene_rows} rows")

    records = []
    for name in sorted(quality_names):
        q = quality_by_name.loc[name]
        s = scene_by_name.loc[name]
        e = exif_by_name.loc[name]
        records.append({
            "dataset": "SPAQ",
            "image": name,
            "quality": {column: float(q[column]) for column in QUALITY_COLUMNS},
            "sceneProbabilities": {column: float(s[column]) for column in SCENE_COLUMNS},
            "sceneTop": max(SCENE_COLUMNS, key=lambda column: float(s[column])),
            "exif": {
                "focalLength": float(e["Focal length"]),
                "fNumber": float(e["F-number"]),
                "exposureTime": float(e["Exposure time"]),
                "iso": int(e["ISO"]),
                "brightness": float(e["Brightness"]),
                "flash": int(e["Flash"]),
            },
        })

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "images": len(records),
        "uniqueImageNames": len(set(quality_names)),
        "missingValues": 0,
        "annotationArchive": {
            "path": str(args.archive),
            "bytes": args.archive.stat().st_size,
            "sha256": sha256_file(args.archive),
        },
        "qualityStatistics": quality_stats,
        "sceneStatistics": scene_stats,
        "invalidSceneProbabilityRows": invalid_scene_rows,
        "sourceExposureTimeSentinelAtOneMillion": int((exif["Exposure time"] == 1_000_000).sum()),
        "rule": (
            "SPAQ is technical-quality supervision only. Generate pairs within compatible scene strata; "
            "never reinterpret MOS as universal aesthetic or personal-memory value."
        ),
        "imagesReady": False,
        "pairGenerationReady": False,
        "blockers": ["SPAQ image bytes have not yet been selected, hashed, decoded and pHash-grouped"],
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
