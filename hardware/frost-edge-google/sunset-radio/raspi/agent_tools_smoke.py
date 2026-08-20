#!/usr/bin/env python3
"""agent_tools 冒烟：登记表健全、灵魂三段式 description、副作用分级、确定性阶梯、
离线白名单、硬化校验(reason_kind + RadioTrack 硬约束)、评估比较器。纯离线：python3 agent_tools_smoke.py"""
import agent_tools as t


def test_registry_wellformed():
    seen = set()
    for tool in t.TOOLS:
        for field in ("name", "summary", "trigger_examples", "parameters", "kind", "safety", "tier", "effect", "impl", "examples"):
            assert field in tool, f"{tool.get('name')} 缺字段 {field}"
        assert tool["name"] not in seen, f"重名: {tool['name']}"
        seen.add(tool["name"])
        assert tool["kind"] in (t.KIND_ACTION, t.KIND_GENERATION)
        assert tool["safety"] in (t.SAFETY_READONLY, t.SAFETY_MUTATING, t.SAFETY_DISRUPTIVE)
        assert tool["tier"] in (t.TIER_REGEX, t.TIER_EDGE, t.TIER_CLOUD)
        assert tool["parameters"].get("type") == "object"
        assert tool["examples"], f"{tool['name']} 应有黄金示例"
    print(f"  ✓ 登记表健全：{len(t.TOOLS)} 工具，六专业字段齐、无重名、各有黄金示例")


def test_soul_description():
    # description 三段式：summary + 用户会说 + 不适用 + 执行后
    an = t.gemini_tools()
    play = next(x for x in an if x["name"] == "play_music")
    assert "用户会说" in play["description"] and "不适用" in play["description"] and "执行后" in play["description"]
    print("  ✓ description=灵魂三段式：功能+口语穷举+负向边界+后置状态 都拼进去了")


def test_safety_and_confirm():
    assert t.needs_confirmation("switch_city") and t.needs_confirmation("make_24h_radio") and t.needs_confirmation("mute")
    assert not t.needs_confirmation("next_song") and not t.needs_confirmation("play_music")
    print("  ✓ 副作用分级：switch_city/make_24h_radio/mute=惊扰需确认；切歌/放歌不需要")


def test_determinism_ladder_offline_subset():
    off = {x["name"] for x in t.offline_tools()}
    assert "next_song" in off and "play_music" in off and "make_24h_radio" in off
    assert "describe_city" not in off and "chitchat" not in off, "云端生成型不该进离线白名单"
    print(f"  ✓ 确定性阶梯：离线白名单 {len(off)} 个(regex+edge)，云端生成型被排除")


def test_validate_reason_kinds():
    for args, rk in [
        ({}, None),  # play_music 无必填，空参 OK
    ]:
        ok, _, r = t.validate_call("play_music", args)
        assert ok and r is None
    assert t.validate_call("teleport", {})[2] == t.REASON_UNKNOWN_TOOL
    assert t.validate_call("switch_city", {})[2] == t.REASON_MISSING_PARAM
    assert t.validate_call("set_volume", {"direction": "sideways"})[2] == t.REASON_BAD_ENUM
    assert t.validate_call("make_24h_radio", {"sense_ambient": "yes"})[2] == t.REASON_BAD_TYPE
    print("  ✓ 校验带 reason_kind：未知工具/缺必填/枚举错/类型错 各归其类（供分级回退）")


def test_radiotrack_hard_constraint():
    # 惊扰型切城工具带裸 id → 硬约束拦下；带完整 RadioTrack dict → 放行
    ok, _, r = t.validate_call("switch_city", {"city": "东京", "track": "trk_123"})
    assert not ok and r == t.REASON_BARE_ID, "裸 id 必须被硬约束拦下"
    ok, _, _ = t.validate_call("switch_city", {"city": "东京", "track": {"title": "X", "city": "东京", "audioUrl": "u"}})
    assert ok, "完整 RadioTrack 应放行"
    print("  ✓ 跨城传完整 RadioTrack 硬约束：裸 id 拦下、完整实体放行（软约束→硬约束）")


def test_match_decision_for_eval():
    ok, _ = t.match_decision("set_volume", {"direction": "down"}, {"tool": "set_volume", "args": {"direction": "down"}})
    assert ok
    ok, _ = t.match_decision("set_volume", {"direction": "up"}, {"tool": "set_volume", "args": {"direction": "down"}})
    assert not ok, "enum 参数不同应判不匹配"
    ok, _ = t.match_decision("next_song", {}, {"tool": "play_music", "args": {}})
    assert not ok, "工具名不同应判不匹配"
    # 自由文本参数容错：play_music 的 mood 不同不算错（只要工具对）
    ok, _ = t.match_decision("play_music", {"mood": "安静"}, {"tool": "play_music", "args": {}})
    assert ok, "工具选对、无必填/enum 约束时应匹配"
    print("  ✓ 评估比较器：工具名+enum/必填精确比、自由文本容错（工具选择=精确匹配非AI裁判）")


if __name__ == "__main__":
    test_registry_wellformed()
    test_soul_description()
    test_safety_and_confirm()
    test_determinism_ladder_offline_subset()
    test_validate_reason_kinds()
    test_radiotrack_hard_constraint()
    test_match_decision_for_eval()
    print("AGENT TOOLS SMOKE OK")
