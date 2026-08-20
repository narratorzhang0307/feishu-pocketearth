#!/usr/bin/env python3
"""Compare Base, MD baseline and LoRA on choice, symmetry and output validity."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ALLOWED_REASON_CODES = {
    "balancing_elements",
    "color_harmony",
    "content",
    "depth_of_field",
    "light",
    "motion_blur",
    "overall_aesthetic",
    "repetition",
    "rule_of_thirds",
    "subject_expression",
    "symmetry",
    "vivid_color",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def response_value(record: dict[str, Any]) -> Any:
    for key in ("response", "prediction", "predict", "output"):
        if key in record:
            return record[key]
    return ""


def parse_response(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        parsed = value
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        decorated = False
    else:
        raw = str(value or "").strip()
        decorated = raw.startswith("```") or bool(re.search(r"<think>", raw, flags=re.IGNORECASE))
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL | re.IGNORECASE).strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
    json_parseable = isinstance(parsed, dict)
    exact_fields = (
        json_parseable
        and set(parsed) == {"choice", "reasonCode"}
        and parsed.get("choice") in {"A", "B"}
        and isinstance(parsed.get("reasonCode"), str)
    )
    reason_in_vocabulary = exact_fields and parsed.get("reasonCode") in ALLOWED_REASON_CODES
    strict = not decorated and exact_fields and reason_in_vocabulary
    choice = parsed.get("choice") if isinstance(parsed, dict) else None
    reason = parsed.get("reasonCode") if isinstance(parsed, dict) else None
    if choice not in {"A", "B"}:
        match = re.search(r"(?:choice|选择|答案)[^AB]{0,12}([AB])", raw, flags=re.IGNORECASE)
        choice = match.group(1).upper() if match else None
    return {
        "raw": raw,
        "jsonParseable": json_parseable,
        "exactFields": exact_fields,
        "reasonInVocabulary": reason_in_vocabulary,
        "strictJson": strict,
        "choice": choice,
        "reasonCode": reason,
    }


def score_variant(records: list[dict[str, Any]], samples: list[dict[str, Any]]) -> dict[str, Any]:
    if len(records) != len(samples):
        raise ValueError(f"Result count {len(records)} does not match manifest {len(samples)}")
    rows = []
    for record, sample in zip(records, samples, strict=True):
        parsed = parse_response(response_value(record))
        rows.append({
            **sample,
            "prediction": parsed["choice"],
            "predictedReasonCode": parsed["reasonCode"],
            "jsonParseable": parsed["jsonParseable"],
            "exactFields": parsed["exactFields"],
            "reasonInVocabulary": parsed["reasonInVocabulary"],
            "strictJson": parsed["strictJson"],
            "correct": parsed["choice"] == sample["expectedChoice"],
            "reasonCorrect": parsed["reasonCode"] == sample["expectedReasonCode"],
            "rawResponse": parsed["raw"],
        })
    pairs = defaultdict(dict)
    for row in rows:
        pairs[row["pairId"]][row["orientation"]] = row
    symmetric = []
    inversion = []
    for orientations in pairs.values():
        original = orientations["original"]
        swapped = orientations["swapped"]
        symmetric.append(original["correct"] and swapped["correct"])
        inversion.append(
            original["prediction"] in {"A", "B"}
            and swapped["prediction"] in {"A", "B"}
            and original["prediction"] != swapped["prediction"]
        )
    def aggregate(items: list[dict[str, Any]]) -> dict[str, Any]:
        count = len(items)
        return {
            "rows": count,
            "choiceAccuracy": sum(row["correct"] for row in items) / count if count else 0.0,
            "jsonParseableRate": sum(row["jsonParseable"] for row in items) / count if count else 0.0,
            "exactFieldsRate": sum(row["exactFields"] for row in items) / count if count else 0.0,
            "reasonInVocabularyRate": sum(row["reasonInVocabulary"] for row in items) / count if count else 0.0,
            "strictJsonRate": sum(row["strictJson"] for row in items) / count if count else 0.0,
            "reasonAccuracy": sum(row["reasonCorrect"] for row in items) / count if count else 0.0,
            "positionAPredictionRate": sum(row["prediction"] == "A" for row in items) / count if count else 0.0,
            "unparsedRate": sum(row["prediction"] not in {"A", "B"} for row in items) / count if count else 0.0,
        }
    by_dataset = {
        dataset: aggregate([row for row in rows if row["dataset"] == dataset])
        for dataset in sorted({row["dataset"] for row in rows})
    }
    overall = aggregate(rows)
    overall["canonicalPairs"] = len(pairs)
    overall["pairSymmetricAccuracy"] = sum(symmetric) / len(symmetric) if symmetric else 0.0
    overall["positionInversionRate"] = sum(inversion) / len(inversion) if inversion else 0.0
    overall["choiceCounts"] = dict(sorted(Counter(row["prediction"] or "unparsed" for row in rows).items()))
    return {"overall": overall, "byDataset": by_dataset, "rows": rows}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--md", type=Path, required=True)
    parser.add_argument("--lora", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    samples = manifest["samples"]
    scored = {
        name: score_variant(read_jsonl(path), samples)
        for name, path in (("base", args.base), ("md", args.md), ("lora", args.lora))
    }
    base = scored["base"]["overall"]
    md = scored["md"]["overall"]
    lora = scored["lora"]["overall"]
    best_baseline_accuracy = max(base["choiceAccuracy"], md["choiceAccuracy"])
    best_baseline_symmetric = max(base["pairSymmetricAccuracy"], md["pairSymmetricAccuracy"])
    promotion = {
        "minimumCanonicalPairs": 16,
        "enoughPairs": lora["canonicalPairs"] >= 16,
        "minimumAccuracyGain": 0.05,
        "choiceAccuracyGainVsBestBaseline": lora["choiceAccuracy"] - best_baseline_accuracy,
        "pairSymmetricGainVsBestBaseline": lora["pairSymmetricAccuracy"] - best_baseline_symmetric,
        "strictJsonAtLeast95Percent": lora["strictJsonRate"] >= 0.95,
        "positionPredictionRateBetween30And70Percent": 0.30 <= lora["positionAPredictionRate"] <= 0.70,
    }
    promotion["passed"] = (
        promotion["enoughPairs"]
        and promotion["choiceAccuracyGainVsBestBaseline"] >= promotion["minimumAccuracyGain"]
        and promotion["pairSymmetricGainVsBestBaseline"] >= promotion["minimumAccuracyGain"]
        and promotion["strictJsonAtLeast95Percent"]
        and promotion["positionPredictionRateBetween30And70Percent"]
    )
    report = {
        "schema": "pocketearth.aesthetic_curator.learnability_comparison/v2",
        "evaluation": {
            "canonicalPairs": manifest["canonicalPairs"],
            "rows": manifest["rows"],
            "pairsPerSource": manifest["pairsPerSource"],
            "positionSwap": manifest["positionSwap"],
        },
        "base": {key: value for key, value in scored["base"].items() if key != "rows"},
        "md": {key: value for key, value in scored["md"].items() if key != "rows"},
        "lora": {key: value for key, value in scored["lora"].items() if key != "rows"},
        "promotionGate": promotion,
        "samplePredictions": {
            name: details["rows"] for name, details in scored.items()
        },
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
