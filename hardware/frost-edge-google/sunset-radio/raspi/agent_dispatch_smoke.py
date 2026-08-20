#!/usr/bin/env python3
"""agent_dispatch 冒烟：决策→执行→observation、CONFIRM 不执行、执行失败回退、
high_noise 收口、dry-run 不产副作用。纯离线：python3 agent_dispatch_smoke.py"""
import agent_dispatch as ad
import agent_loop as al


def test_tool_executes_and_observes():
    ex = {"next_song": lambda a: "已切到下一首：X"}
    r = ad.dispatch({"type": al.DECISION_TOOL, "tool": "next_song", "arguments": {}}, ex)
    assert r["type"] == "observed" and "已切到下一首" in r["observation"]
    print("  ✓ 工具执行 → 回结构化 observation（Agentic Loop 第4步的燃料）")


def test_confirm_not_executed():
    called = {"n": 0}
    ex = {"switch_city": lambda a: called.__setitem__("n", called["n"] + 1) or "已切城"}
    r = ad.dispatch({"type": al.DECISION_CONFIRM, "tool": "switch_city", "arguments": {"city": "东京"}, "reply": "要切走主线吗？"}, ex)
    assert r["type"] == "await_confirm" and called["n"] == 0, "确认前绝不执行惊扰动作"
    # 用户点头后重派才执行
    r2 = ad.confirm_pending(r["pending"], ex)
    assert r2["type"] == "observed" and called["n"] == 1
    print("  ✓ 惊扰型 CONFIRM 确认前不执行；点头后 confirm_pending 才真执行")


def test_exec_error_falls_back():
    ex = {"play_music": lambda a: (_ for _ in ()).throw(RuntimeError("曲库炸了"))}
    r = ad.dispatch({"type": al.DECISION_TOOL, "tool": "play_music", "arguments": {}}, ex)
    assert r["type"] == "exec_error" and "失败" in r["observation"]
    print("  ✓ 执行器抛异常 → exec_error 记为观察、不崩（失败即回退）")


def test_no_executor():
    r = ad.dispatch({"type": al.DECISION_TOOL, "tool": "play_music", "arguments": {}}, {})
    assert r["type"] == "no_executor"
    print("  ✓ 没绑执行器 → no_executor")


def test_reply_types_carry_through():
    for t in (al.DECISION_CLARIFY, al.DECISION_DECLINE, al.DECISION_FINAL):
        r = ad.dispatch({"type": t, "reply": "一句话"}, {})
        assert r["type"] == "reply" and r["reply"] == "一句话"
    print("  ✓ 反问/婉拒/收尾 → reply 直接带出（无需执行）")


def test_high_noise_summarized():
    long = "诊断详情" * 50
    ex = {"device_status": lambda a: long}
    r = ad.dispatch({"type": al.DECISION_TOOL, "tool": "device_status", "arguments": {}}, ex)
    assert len(r["observation"]) <= 61 and "…" in r["observation"], "高噪声工具 observation 必须收口成摘要"
    print("  ✓ high_noise 工具(device_status) observation 收口成 ≤1 句（信噪比/舱壁）")


def test_dry_run_no_side_effect():
    called = {"n": 0}
    ex = {"play_music": lambda a: called.__setitem__("n", called["n"] + 1) or "放了"}
    r = ad.dispatch({"type": al.DECISION_TOOL, "tool": "play_music", "arguments": {"genre": "爵士"}}, ex, dry_run=True)
    assert r["type"] == "observed" and "[dry-run]" in r["observation"] and called["n"] == 0
    print("  ✓ dry-run：只报『将调用什么』、绝不真执行（真机安全验证路由）")


def test_dry_run_executors_registry():
    ex = ad.dry_run_executors()
    assert set(ex) == set(__import__("agent_tools").tool_names())
    assert ex["next_song"]({}).startswith("将执行 next_song")
    print("  ✓ dry_run_executors：覆盖全部工具的只报不做执行器")


if __name__ == "__main__":
    test_tool_executes_and_observes()
    test_confirm_not_executed()
    test_exec_error_falls_back()
    test_no_executor()
    test_reply_types_carry_through()
    test_high_noise_summarized()
    test_dry_run_no_side_effect()
    test_dry_run_executors_registry()
    print("AGENT DISPATCH SMOKE OK")
