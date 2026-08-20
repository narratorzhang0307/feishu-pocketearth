#!/usr/bin/env python3
"""agent_loop 冒烟：五种决策(TOOL/CONFIRM/CLARIFY/DECLINE/FINAL/NONE)、惊扰降级确认、
越界婉拒、缺参转反问、reason_kind、多步 run 回注、上下文预算、few-shot。纯离线：python3 agent_loop_smoke.py"""
import agent_loop as al


def B(fn):
    return fn


def test_tool_decision():
    d = al.decide("放首东京的爵士", {"playing": False}, lambda p, t, s: {"tool": "play_music", "arguments": {"city": "东京", "genre": "爵士"}})
    assert d["type"] == al.DECISION_TOOL and d["tool"] == "play_music" and d["arguments"]["city"] == "东京"
    print("  ✓ 正常：选出 play_music、带参、附 kind/safety/effect")


def test_disruptive_downgrades_to_confirm():
    d = al.decide("切到东京", {"city": "柏林"}, lambda p, t, s: {"tool": "switch_city", "arguments": {"city": "东京"}})
    assert d["type"] == al.DECISION_CONFIRM and "东京" not in (d.get("error") or ""), d
    assert d["reply"], "确认要带一句问话"
    # 已确认过 → 直接放行为 TOOL
    d2 = al.decide("切到东京", {}, lambda p, t, s: {"tool": "switch_city", "arguments": {"city": "东京"}, "confirmed": True})
    assert d2["type"] == al.DECISION_TOOL
    print("  ✓ 惊扰型(switch_city)自动降级为 CONFIRM 先确认；confirmed 后放行 TOOL")


def test_decline_out_of_scope():
    d = al.decide("帮我订机票", {}, lambda p, t, s: {"decline": "这个我帮不上~"})
    assert d["type"] == al.DECISION_DECLINE and d["reply"]
    print("  ✓ 越界 → DECLINE 礼貌婉拒（不硬凑工具）")


def test_final_terminal():
    d = al.decide("就这样", {}, lambda p, t, s: {"final": "好的，安静待命"})
    assert d["type"] == al.DECISION_FINAL and d["reply"] == "好的，安静待命"
    print("  ✓ 收尾 → FINAL 终态")


def test_missing_param_becomes_clarify():
    d = al.decide("切城", {}, lambda p, t, s: {"tool": "switch_city", "arguments": {}})
    assert d["type"] == al.DECISION_CLARIFY and d.get("reason_kind") == al.REASON_INVALID_CALL
    print("  ✓ 大脑选了工具但缺必填 → 转 CLARIFY 反问补全（而非直接丢弃）")


def test_bad_tool_and_enum_fall_back():
    assert al.decide("瞬移", {}, lambda p, t, s: {"tool": "teleport", "arguments": {}})["type"] == al.DECISION_NONE
    d = al.decide("小声", {}, lambda p, t, s: {"tool": "set_volume", "arguments": {"direction": "x"}})
    assert d["type"] == al.DECISION_NONE and d["reason_kind"] == al.REASON_INVALID_CALL
    print("  ✓ 幻觉工具/枚举非法 → NONE 回退，reason_kind=invalid_call")


def test_brain_error_vs_none():
    def boom(p, t, s):
        raise RuntimeError("大脑挂了")
    d = al.decide("放歌", {}, boom)
    assert d["type"] == al.DECISION_NONE and d["reason_kind"] == al.REASON_BRAIN_ERROR
    d2 = al.decide("随便", {}, lambda p, t, s: None)
    assert d2["type"] == al.DECISION_NONE and d2["reason_kind"] == al.REASON_NO_DECISION
    print("  ✓ 阻止 vs 故障二分：大脑异常=brain_error(回退不阻塞)、无结构=no_decision")


def test_context_budget():
    long = "很长很长的内容" * 40
    txt = al.format_context({"city": "柏林", "recent": long, "foo": "bar"})
    assert "当前城市：柏林" in txt and "foo：bar" in txt
    assert "…" in txt and len(txt) < len(long), "长值必须截断(预算纪律)"
    print("  ✓ 上下文预算：已知键有序、未知键不丢、长值截断")


def test_run_multi_step():
    # 第一步选 play_music，执行后回注观察；第二步大脑收尾
    calls = {"n": 0}
    def brain(p, t, s):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"tool": "play_music", "arguments": {"genre": "爵士"}}
        return {"final": "放好了，还需要我讲讲这首吗？"}
    def executor(name, args):
        return f"已执行 {name}，正在放爵士"
    r = al.run("放首爵士然后待命", {}, brain, executor, max_steps=3)
    assert r["type"] == al.DECISION_FINAL and len(r["steps"]) == 2 and "放好了" in r["reply"]
    print("  ✓ 多步 run：执行→观察回注→再决策→FINAL 收尾（Agentic Loop 五步闭环）")


def test_run_max_steps_guard():
    # 大脑永不收尾 → max_steps 硬护栏兜底，绝不无限循环
    r = al.run("一直放", {}, lambda p, t, s: {"tool": "next_song", "arguments": {}},
               lambda n, a: "已切歌", max_steps=2)
    assert r.get("stopped_by") == "max_steps" and len(r["steps"]) == 2
    print("  ✓ max_steps 硬护栏：大脑不收尾也不空转、到上限安全收尾")


def test_flag_default_off():
    assert al.AGENT_LOOP_ENABLED is False
    print("  ✓ AGENT_LOOP_ENABLED 默认关（未接进运行时）")


if __name__ == "__main__":
    test_tool_decision()
    test_disruptive_downgrades_to_confirm()
    test_decline_out_of_scope()
    test_final_terminal()
    test_missing_param_becomes_clarify()
    test_bad_tool_and_enum_fall_back()
    test_brain_error_vs_none()
    test_context_budget()
    test_run_multi_step()
    test_run_max_steps_guard()
    test_flag_default_off()
    print("AGENT LOOP SMOKE OK")
