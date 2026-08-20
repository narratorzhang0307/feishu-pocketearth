#!/usr/bin/env python3
"""agent_runtime 冒烟：单一入口 handle() 把 决策→执行/确认/反问/婉拒/回退 收口正确。
纯离线，假大脑+假执行器：python3 agent_runtime_smoke.py"""
import agent_runtime as rt


def brain_of(raw):
    return lambda p, t, s: raw


def test_acted():
    ex = {"play_music": lambda a: "正在放爵士"}
    r = rt.handle("放点爵士", {}, brain=brain_of({"tool": "play_music", "arguments": {"genre": "爵士"}}), executors=ex, dry_run=False)
    assert r["outcome"] == "acted" and r["tool"] == "play_music" and "爵士" in r["observation"]
    print("  ✓ acted：选工具→执行→带 observation/spoken")


def test_confirm_then_confirm():
    ex = {"switch_city": lambda a: "已切城"}
    r = rt.handle("切到东京", {}, brain=brain_of({"tool": "switch_city", "arguments": {"city": "东京"}}), executors=ex, dry_run=False)
    assert r["outcome"] == "confirm" and r["pending"]["tool"] == "switch_city" and r["spoken"]
    r2 = rt.confirm(r["pending"], executors=ex, dry_run=False)
    assert r2["outcome"] == "acted" and "已切城" in r2["observation"]
    print("  ✓ confirm：惊扰动作先返回待确认；confirm() 点头后才执行")


def test_clarify_decline_final():
    assert rt.handle("放首歌", {}, brain=brain_of({"reply": "想听哪种？"}))["outcome"] == "clarify"
    assert rt.handle("订机票", {}, brain=brain_of({"decline": "帮不上~"}))["outcome"] == "decline"
    assert rt.handle("就这样", {}, brain=brain_of({"final": "好的"}))["outcome"] == "final"
    print("  ✓ clarify/decline/final：直接带 spoken 出去")


def test_fallback_on_none():
    assert rt.handle("北极熊冬眠吗", {}, brain=brain_of(None))["outcome"] == "fallback"
    # 大脑异常也回退
    r = rt.handle("放歌", {}, brain=lambda p, t, s: (_ for _ in ()).throw(RuntimeError()))
    assert r["outcome"] == "fallback"
    print("  ✓ fallback：大脑无决策/异常 → 交回正则旧路径（带 reason）")


def test_no_executor_falls_back():
    # 大脑选了工具但没绑执行器 → 回退（让 daemon 走旧路径）
    r = rt.handle("放歌", {}, brain=brain_of({"tool": "play_music", "arguments": {}}), executors={}, dry_run=False)
    assert r["outcome"] == "fallback" and r["reason"] == "no_executor"
    print("  ✓ 无执行器 → fallback（带 reason，可审计）")


def test_dry_run_default_safe():
    # 默认 dry_run=True：选了工具也不真执行、只报
    called = {"n": 0}
    ex = {"play_music": lambda a: called.__setitem__("n", called["n"] + 1) or "放了"}
    r = rt.handle("放歌", {}, brain=brain_of({"tool": "play_music", "arguments": {}}), executors=ex)
    assert r["outcome"] == "acted" and "[dry-run]" in r["observation"] and called["n"] == 0
    print("  ✓ 默认 dry_run=True：安全验证，绝不真执行")


if __name__ == "__main__":
    test_acted()
    test_confirm_then_confirm()
    test_clarify_decline_final()
    test_fallback_on_none()
    test_no_executor_falls_back()
    test_dry_run_default_safe()
    print("AGENT RUNTIME SMOKE OK")
