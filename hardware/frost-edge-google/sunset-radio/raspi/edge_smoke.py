#!/usr/bin/env python3
"""Gemma edge adapter 冒烟：服务不可用时安全回退、rank 顺序与标签解析。"""
import os
os.environ["POCKET_EARTH_GEMMA_URL"] = "http://127.0.0.1:59999/v1"

import edge


def test_unavailable_returns_none():
    assert edge.available() is False, "指向死端口应不可用"
    assert edge.classify("想听点海边的歌") is None, "不可用时 classify 必须回退 None"
    print("  ✓ 不可用 → available False、classify None（回退规则/云端）")


def test_rank_fallback_order():
    order = edge.rank("海边夜晚", ["城市街道的白天", "海边的夜风", "山里的清晨"])
    assert order[0] == 1, f"与'海边夜晚'重合最多的应排第一，got {order}"
    assert sorted(order) == [0, 1, 2], "rank 必须是候选索引的全排列"
    print("  ✓ rank 兜底：按关键词重合排序、返回完整索引排列")


def test_parse_label_from_raw():
    # 测新解析路径：format=string(enum) 时 content 是 JSON 串（带引号）；先 json 解析，失败再子串兜底
    import json

    def parse(raw, labels=edge.EDGE_INTENTS):
        if not raw:
            return None
        try:
            val = json.loads(raw)
            if isinstance(val, str) and val in labels:
                return val
        except Exception:
            pass
        low = raw.strip().strip('"').lower()
        return next((lb for lb in labels if lb in low), None)

    for raw, expect in [
        ('"open_dj"', "open_dj"),                    # enum 结构化输出标准形态（JSON 串）
        ("tour", "tour"),                            # 裸标签兜底
        ("意图是 city_culture。", "city_culture"),   # 含多余字符子串兜底
        ("", None),                                  # 空串
        ("不知道", None),                            # 无候选
    ]:
        got = parse(raw)
        assert got == expect, f"{raw!r} → {got}, 期望 {expect}"
    print("  ✓ Gemma 标签解析：JSON 串优先、裸标签/含标点子串兜底；空/无候选返回 None")


if __name__ == "__main__":
    test_unavailable_returns_none()
    test_rank_fallback_order()
    test_parse_label_from_raw()
    print("EDGE SMOKE OK")
