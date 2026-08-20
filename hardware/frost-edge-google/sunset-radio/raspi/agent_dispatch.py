#!/usr/bin/env python3
"""树莓派推理智能体 · 派发器（见 ADAPTIVE-AGENT-PLAN.md）。

把 agent_loop 的**决策**真正执行到 daemon 函数，并回一句结构化 **observation**——这是 Agentic Loop
第4步『结果回注』的燃料（Harness 1.2.5），没有它多步循环就退化成开环。

设计纪律：
- **执行器可注入**（executors 字典）：本模块不 import daemon、不硬编 daemon 逻辑；真机由 bind 层把
  工具名绑到 daemon 函数，测试用假执行器 → 离线可测。
- **CONFIRM 不执行**（Harness 5.5 ask）：惊扰型返回待确认，等用户点头再带 confirmed 重派。
- **失败即回退**（Harness 5.4）：执行器抛异常 → 记为观察、不崩。
- **信噪比/舱壁**（Harness 4.1）：high_noise 工具(device_status/make_24h_radio)的 observation 必须是
  ≤1 句摘要，原始诊断不回流——由 _summarize 收口。
- **dry-run**：只报『将调用什么』不真执行 → 真机上可安全验证整条链（不产副作用、不出声）。
"""
import agent_loop as al
import agent_tools

_OBS_MAX = 120


def _summarize(name, obs):
    """observation 收口：high_noise 工具只回摘要、其余截断，防噪声回流污染下一轮推理。"""
    s = str(obs if obs is not None else "")
    tool = agent_tools.get_tool(name) or {}
    limit = 60 if tool.get("high_noise") else _OBS_MAX
    return s if len(s) <= limit else s[:limit] + "…"


def dispatch(decision, executors, dry_run=False):
    """派发一个决策，返回统一结果：
      {"type":"observed","observation":..} 执行了工具、带回观察（喂下一轮/收口出声）
      {"type":"await_confirm","reply":..,"pending":{tool,arguments}} 惊扰型待用户确认
      {"type":"reply","reply":..} 反问/婉拒/收尾——无需执行，直接说
      {"type":"no_executor"/"exec_error","observation":..} 没绑执行器/执行失败 → 回退
    dry_run=True 时工具只报『将调用什么』、不真执行（真机安全验证）。"""
    t = decision.get("type")
    if t == al.DECISION_TOOL:
        name = decision.get("tool")
        args = decision.get("arguments") or {}
        if dry_run:
            return {"type": "observed", "observation": f"[dry-run] 将调用 {name}({args})", "tool": name}
        fn = (executors or {}).get(name)
        if fn is None:
            return {"type": "no_executor", "observation": f"无执行器: {name}", "tool": name}
        try:
            obs = fn(args)
        except Exception as exc:
            return {"type": "exec_error", "observation": f"{name} 执行失败: {exc}", "tool": name}
        return {"type": "observed", "observation": _summarize(name, obs), "tool": name}
    if t == al.DECISION_CONFIRM:
        return {"type": "await_confirm", "reply": decision.get("reply"),
                "pending": {"tool": decision.get("tool"), "arguments": decision.get("arguments")}}
    # CLARIFY / DECLINE / FINAL / NONE → 直接把要说的话带出去（没有可执行动作）
    return {"type": "reply", "reply": decision.get("reply") or ""}


def confirm_pending(pending, executors, dry_run=False):
    """用户点头后，把待确认的惊扰动作带 confirmed 重新派发执行。"""
    d = {"type": al.DECISION_TOOL, "tool": pending.get("tool"), "arguments": pending.get("arguments") or {}}
    return dispatch(d, executors, dry_run=dry_run)


def dry_run_executors():
    """一套只报不做的执行器（所有工具都返回『将执行』字符串）——真机验证路由用，零副作用。"""
    return {name: (lambda args, n=name: f"将执行 {n}({args})") for name in agent_tools.tool_names()}
