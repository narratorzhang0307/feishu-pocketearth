#!/usr/bin/env python3
"""Extract only shortlisted TAD66K images and verify them against the full audit."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    records = {record["image"]: record for record in read_jsonl(args.records)}
    candidates = read_jsonl(args.candidates)
    selected_names = sorted({
        name
        for candidate in candidates
        for name in (candidate["imageLeft"], candidate["imageRight"])
    })
    expected_bytes = sum(int(records[name]["bytes"]) for name in selected_names)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    extracted = []
    with zipfile.ZipFile(args.archive) as archive:
        for number, name in enumerate(selected_names, start=1):
            record = records[name]
            payload = archive.read(record["zipMember"])
            if len(payload) != record["bytes"]:
                raise ValueError(f"Byte-size mismatch for {name}")
            digest = hashlib.sha256(payload).hexdigest()
            if digest != record["sha256"]:
                raise ValueError(f"SHA-256 mismatch for {name}")
            with Image.open(io.BytesIO(payload)) as image:
                image.verify()
            destination = args.output_dir / name
            destination.write_bytes(payload)
            enriched = dict(record)
            enriched["path"] = str(destination.resolve())
            enriched["candidateSubset"] = True
            extracted.append(enriched)
            if number % 500 == 0 or number == len(selected_names):
                print(f"extracted {number}/{len(selected_names)}", flush=True)

    actual_bytes = sum(Path(record["path"]).stat().st_size for record in extracted)
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "archive": str(args.archive),
        "candidatePairs": len(candidates),
        "uniqueImages": len(selected_names),
        "expectedBytes": expected_bytes,
        "actualBytes": actual_bytes,
        "gates": {
            "allSelectedImagesFoundInAudit": all(name in records for name in selected_names),
            "allImagesExtracted": len(extracted) == len(selected_names),
            "allByteSizesMatch": expected_bytes == actual_bytes,
            "allSha256Matched": True,
            "allImagesDecoded": True,
        },
    }
    if not all(report["gates"].values()):
        raise RuntimeError(f"TAD66K candidate extraction gates failed: {report['gates']}")
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    with args.manifest.open("w", encoding="utf-8") as handle:
        for record in extracted:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
