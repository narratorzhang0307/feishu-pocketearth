#!/usr/bin/env python3
"""树莓派推理智能体 · 运行时组装（见 ADAPTIVE-AGENT-PLAN.md）。

把 大脑(agent_brain) + 决策(agent_loop) + 校验(agent_tools) + 派发(agent_dispatch) 组装成一个
**单一入口** handle()——这是 Phase 5 最终要接进 daemon『模糊意图兜底』位的那个调用。

确定性阶梯（Harness 5.4）在这里收口：
- 明确命令（切歌/音量/静音）由 daemon 现有 115 条正则 command 层秒回，**根本不进本运行时**。
- 走到这里的都是正则没命中的模糊/新颖话：在线→云端主脑(聪明)、断网→端侧 edge(兜底)，都不行→回退。

契约（handle 返回，供 daemon 决定怎么回应）：
  {"outcome":"acted","tool":..,"observation":..,"spoken":..}   执行了工具
  {"outcome":"confirm","spoken":问话,"pending":{tool,arguments}} 惊扰动作待用户确认
  {"outcome":"clarify"/"decline"/"final","spoken":要说的话}      反问/婉拒/收尾
  {"outcome":"fallback","reason":..}                            大脑无有效决策 → 交回正则/旧路径

flag 隔离：SUNSET_AGENT_LOOP 默认关；本运行时不被 daemon import、不接进 handle_command → 零行为改变。
"""
import agent_dispatch as ad
import agent_loop as al


def handle(utterance, context, *, brain, executors=None, dry_run=True, trace=None):
    """智能体处理一句话。brain 由调用方按在线/离线选好（agent_brain.make_brain）。
    executors 为空或 dry_run=True 时只走决策、不真执行（安全验证）。"""
    d = al.decide(utterance, context, brain, trace=trace)
    t = d.get("type")

    if t == al.DECISION_NONE:
        return {"outcome": "fallback", "reason": d.get("reason_kind")}

    if t in (al.DECISION_CLARIFY, al.DECISION_DECLINE, al.DECISION_FINAL):
        kind = {al.DECISION_CLARIFY: "clarify", al.DECISION_DECLINE: "decline", al.DECISION_FINAL: "final"}[t]
        return {"outcome": kind, "spoken": d.get("reply") or ""}

    if t == al.DECISION_CONFIRM:
        return {"outcome": "confirm", "spoken": d.get("reply") or "",
                "pending": {"tool": d.get("tool"), "arguments": d.get("arguments")}}

    # DECISION_TOOL：派发（dry_run 或真执行器）
    out = ad.dispatch(d, executors or {}, dry_run=dry_run)
    if out["type"] in ("no_executor", "exec_error"):
        # 执行不了 → 也算回退（让 daemon 走旧路径），但带上原因便于审计
        return {"outcome": "fallback", "reason": out["type"], "observation": out.get("observation")}
    return {"outcome": "acted", "tool": d.get("tool"),
            "observation": out.get("observation"), "spoken": out.get("observation")}


def confirm(pending, *, executors=None, dry_run=True):
    """用户对惊扰动作点头后，执行待确认动作。"""
    out = ad.confirm_pending(pending, executors or {}, dry_run=dry_run)
    if out["type"] in ("no_executor", "exec_error"):
        return {"outcome": "fallback", "reason": out["type"]}
    return {"outcome": "acted", "tool": pending.get("tool"),
            "observation": out.get("observation"), "spoken": out.get("observation")}
