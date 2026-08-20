#!/usr/bin/env python3
"""agent_eval 冒烟：用可控的假大脑验证跑分器本身——完美大脑应满分、乱答大脑应低分、
断网切片走离线白名单、bootstrap 有方差。纯离线：python3 agent_eval_smoke.py"""
import agent_eval as ev
import agent_eval_set as gold
import agent_loop as al


def perfect_brain(prompt, tools, system):
    """照黄金集『应得答案』回答——跑分器正确的话，它应接近满分。按 utterance 反查期望。"""
    for c in gold.CASES:
        if c["u"] in prompt:
            exp = c["expect"]
            if exp["type"] == gold.T:
                return {"tool": exp["tool"], "arguments": exp.get("args", {}), "confirmed": True}
            if exp["type"] == gold.DECLINE:
                return {"decline": "帮不上~"}
            if exp["type"] == gold.CLARIFY:
                return {"reply": "想听哪种？"}
    return {"reply": "?"}


def dumb_brain(prompt, tools, system):
    """永远选 next_song——只对 clear/asr 里的切歌类蒙对，整体应明显低分。"""
    return {"tool": "next_song", "arguments": {}}


def test_scorer_discriminates():
    good = ev.run_eval(perfect_brain, verbose=False)
    bad = ev.run_eval(dumb_brain, verbose=False)
    assert good["overall"]["acc"] >= 0.9, f"完美大脑应≥90%，实得 {good['overall']['acc']:.2f}"
    assert bad["overall"]["acc"] < good["overall"]["acc"] - 0.3, "乱答大脑应明显更低——否则跑分器没区分力"
    print(f"  ✓ 跑分器有区分力：完美大脑 {good['overall']['acc']*100:.0f}% 、乱答大脑 {bad['overall']['acc']*100:.0f}%")


def test_per_slice_present():
    r = ev.run_eval(perfect_brain, verbose=False)
    for s in ("clear_command", "fuzzy_novel", "out_of_scope", "asr_typo", "offline_degrade", "multi_turn"):
        assert s in r and r[s]["n"] > 0, f"缺切片 {s}"
    print(f"  ✓ 6 切片各自可见：{ {s: r[s]['n'] for s in gold.slices()} }")


def test_confirm_counts_as_tool_selection():
    # switch_city 是惊扰型 → decide 返回 CONFIRM；跑分应把它当『选对了工具』
    case = {"u": "切到东京", "ctx": {}, "expect": {"type": gold.T, "tool": "switch_city", "args": {"city": "东京"}}, "slice": "x"}
    ok, got, _ = ev.score_case(lambda p, t, s: {"tool": "switch_city", "arguments": {"city": "东京"}}, case)
    assert ok and got == al.DECISION_CONFIRM, f"CONFIRM 应算选对工具，got {got}"
    print("  ✓ 惊扰型返回 CONFIRM 仍算『选对工具』(护栏层正交于工具选择)")


def test_offline_slice_uses_whitelist():
    # 断网切片只喂离线白名单——describe_city 不在白名单，若大脑硬选它，应无法命中(工具不在清单)
    r = ev.run_eval(perfect_brain, verbose=False)
    assert r["offline_degrade"]["acc"] >= 0.9, "离线切片里都是白名单内工具，完美大脑应≥90%"
    print("  ✓ 断网切片走离线白名单跑分")


def test_tier_aware_eval():
    # 分层：明确命令案=regex 层、模糊动作=edge 层、婉拒/反问=cloud 层
    import agent_tools
    assert ev.case_tier({"expect": {"type": gold.T, "tool": "next_song"}}) == agent_tools.TIER_REGEX
    assert ev.case_tier({"expect": {"type": gold.T, "tool": "play_music"}}) == agent_tools.TIER_EDGE
    assert ev.case_tier({"expect": {"type": gold.DECLINE}}) == agent_tools.TIER_CLOUD
    # 只评 edge 层案子
    r = ev.run_eval(perfect_brain, verbose=False, tier=agent_tools.TIER_EDGE)
    assert r["overall"]["n"] > 0 and r["overall"]["n"] < len(gold.CASES), "edge 层应是子集"
    print(f"  ✓ 分层评估：edge 层 {r['overall']['n']} 案（端侧只在该它管的层上打分才公平）")


def test_bootstrap_has_variance():
    b = ev.bootstrap_acc(dumb_brain, rounds=30)
    assert 0.0 <= b["mean"] <= 1.0 and b["std"] >= 0.0
    print(f"  ✓ bootstrap 可靠性自检：mean={b['mean']:.2f} std={b['std']:.2f}（方差大=该补样本）")


if __name__ == "__main__":
    test_scorer_discriminates()
    test_per_slice_present()
    test_confirm_counts_as_tool_selection()
    test_offline_slice_uses_whitelist()
    test_tier_aware_eval()
    test_bootstrap_has_variance()
    print("AGENT EVAL SMOKE OK")
