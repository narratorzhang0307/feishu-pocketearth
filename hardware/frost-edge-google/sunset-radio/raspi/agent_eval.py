#!/usr/bin/env python3
"""树莓派推理智能体 · 工具选择跑分器（评估先行，见 ADAPTIVE-AGENT-PLAN.md）。

喂一个待测的大脑(brain)，在 agent_eval_set 黄金集上跑 decide()，按 6 切片分别算准确率。
工具选择=封闭集精确匹配(AI工程 3.2，非 AI 裁判)：工具名 + enum/必填参数必等，自由文本容错。

用法：
  真机在线： brain = 云端 function-calling（温度0）
  真机端侧： brain = 包 raspi/edge 的 Google Gemma（只喂 offline_tools 白名单）
  CI/离线：  用 mock 大脑验证跑分器本身（见 agent_eval_smoke.py）

验收线(AI工程 4.3.2 实用性阈值 / Harness 3.4.3)：相关切片准确率 >90%、越界 decline 召回高。
达不到就回去改工具 summary/trigger_examples，**不加正则**。
"""
import agent_eval_set as gold
import agent_loop as al
import agent_tools


def chosen_tool(decision):
    """从决策里取『大脑选中的工具名』——TOOL 与 CONFIRM 都算选了工具(CONFIRM 只是护栏层，正交于选择)。"""
    if decision.get("type") in (al.DECISION_TOOL, al.DECISION_CONFIRM):
        return decision.get("tool")
    return None


def case_tier(case):
    """这条黄金案『该由哪一层处理』（确定性阶梯 Harness 5.4）：
    - 期望某工具 → 用该工具的 tier(regex 明确命令 / edge 模糊动作 / cloud 生成)。
    - 期望 decline/clarify → 需推理/婉拒 → cloud。
    分层跑分才公平：端侧大脑只该在 edge 层案子上评，明确命令是正则的活、婉拒反问是云端的活。"""
    exp = case["expect"]
    if exp.get("type") == gold.T:
        tool = agent_tools.get_tool(exp.get("tool"))
        return tool["tier"] if tool else agent_tools.TIER_CLOUD
    return agent_tools.TIER_CLOUD


def score_case(brain, case, trace=None):
    """跑一条，返回 (correct: bool, got_type, detail)。断网切片只喂离线白名单。"""
    tools = None
    if case.get("slice") == "offline_degrade":
        tools = agent_tools.gemini_tools(agent_tools.offline_tools())
    d = al.decide(case["u"], case.get("ctx") or {}, brain, tools=tools, trace=trace)
    exp = case["expect"]
    et = exp["type"]
    if et == gold.T:
        name = chosen_tool(d)
        if name is None:
            return False, d["type"], f"期望选工具 {exp.get('tool')}，实得 {d['type']}"
        ok, mism = agent_tools.match_decision(name, d.get("arguments") or {}, exp)
        return ok, d["type"], ("" if ok else mism)
    # clarify / decline / none：只比决策类型
    type_map = {gold.CLARIFY: al.DECISION_CLARIFY, gold.DECLINE: al.DECISION_DECLINE, "none": al.DECISION_NONE}
    want = type_map.get(et)
    return d["type"] == want, d["type"], ("" if d["type"] == want else f"期望 {want}，实得 {d['type']}")


def run_eval(brain, cases=None, verbose=True, trace=None, tier=None):
    """在黄金集上跑分，返回 {slice: {n, correct, acc}, 'overall': {...}}。
    tier 传 'edge'/'cloud'/'regex' 时只评『该由这一层处理』的案子——分层公平评估。"""
    cases = cases or gold.CASES
    if tier is not None:
        cases = [c for c in cases if case_tier(c) == tier]
    by_slice = {}
    misses = []
    for c in cases:
        ok, got, detail = score_case(brain, c, trace=trace)
        s = by_slice.setdefault(c["slice"], {"n": 0, "correct": 0})
        s["n"] += 1
        s["correct"] += 1 if ok else 0
        if not ok:
            misses.append((c["slice"], c["u"], detail))
    for s in by_slice.values():
        s["acc"] = s["correct"] / s["n"] if s["n"] else 0.0
    total_n = sum(s["n"] for s in by_slice.values())
    total_c = sum(s["correct"] for s in by_slice.values())
    by_slice["overall"] = {"n": total_n, "correct": total_c, "acc": total_c / total_n if total_n else 0.0}
    if verbose:
        for name in list(gold.slices().keys()) + ["overall"]:
            if name in by_slice:
                s = by_slice[name]
                print(f"  {name:16} {s['correct']}/{s['n']}  ({s['acc']*100:.0f}%)")
        for sl, u, d in misses:
            print(f"    ❌ [{sl}] {u} — {d}")
    return by_slice


def bootstrap_acc(brain, cases=None, rounds=50, seed_list=None):
    """有放回自助抽样估工具准确率方差(AI工程 4.3.3)：方差大=集子太小、该补样本。
    不用 random(工作流/复现约束)，用确定性的轮转抽样近似。"""
    cases = cases or gold.CASES
    n = len(cases)
    results = [1 if score_case(brain, c)[0] else 0 for c in cases]
    accs = []
    for r in range(rounds):
        # 确定性重抽样：每轮用不同步长轮转取 n 个（近似有放回）
        step = 1 + (r % max(1, n - 1))
        sample = [results[(r + i * step) % n] for i in range(n)]
        accs.append(sum(sample) / n)
    mean = sum(accs) / len(accs)
    var = sum((a - mean) ** 2 for a in accs) / len(accs)
    return {"mean": mean, "std": var ** 0.5}


if __name__ == "__main__":
    # 无真大脑时的占位说明：真正跑分请喂云端/端侧 brain。这里用一个『参考大脑』演示跑分器可用。
    def reference_brain(prompt, tools, system):
        # 极简参考实现：仅用于演示跑分器，不代表真实大脑能力
        p = prompt
        if "订" in p or "转" in p or "辞职" in p:
            return {"decline": "这个我帮不上~"}
        if "下一" in p or "切" in p or "换一首" in p:
            return {"tool": "next_song", "arguments": {}}
        if "放首歌" in p or p.strip().endswith("换个"):
            return {"reply": "想听哪种？"}
        return {"reply": "（参考大脑不判此句）"}
    print("== 参考大脑跑分（仅演示跑分器）==")
    run_eval(reference_brain)
