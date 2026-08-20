#!/usr/bin/env python3
import json
import os
import tempfile

import ambient_memory


def state(index, updated_at=None):
    return {
        "updatedAt": updated_at or f"2026-06-22T09:{index:02d}:00Z",
        "ok": True,
        "stage": "sensor",
        "scene": f"测试环境 {index}",
        "light": "dim" if index % 2 else "normal",
        "activity": "working",
        "tags": ["测试", "室内光线"],
        "confidence": 0.5,
        "camera": {"available": True, "model": "imx708"},
        "signals": {"brightness": min(0.95, 0.2 + index * 0.01), "contrast": 0.1, "light": "dim"},
    }


def main():
    with tempfile.TemporaryDirectory(prefix="sunset-ambient-memory-") as tmp:
        path = os.path.join(tmp, "ambient-memory.json")
        for index in range(10):
            ambient_memory.remember_ambient_state(state(index), path=path, limit=4)
        ambient_memory.remember_ambient_state(state(99, updated_at="2026-06-22T09:09:00Z"), path=path, limit=4)
        memory = ambient_memory.load_ambient_memory(path)
        report = ambient_memory.memory_report(memory)
        compacted = ambient_memory.compact_ambient_memory(path=path, limit=4)
        after_compact = ambient_memory.load_ambient_memory(path)

    entries = memory.get("entries", [])
    cases = [
        {
            "name": "ambient memory keeps configured recent limit",
            "passed": len(entries) == 4,
        },
        {
            "name": "ambient memory de-duplicates by timestamp",
            "passed": entries[-1].get("scene") == "测试环境 99",
        },
        {
            "name": "ambient memory report remains usable",
            "passed": report.get("usableCount") == 4 and report.get("dominantActivity") == "working",
        },
        {
            "name": "manual compaction is idempotent",
            "passed": compacted.get("ok") and len(after_compact.get("entries", [])) == 4,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "count": len(entries), "latest": entries[-1] if entries else {}}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
