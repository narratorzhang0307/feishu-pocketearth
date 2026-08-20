#!/usr/bin/env python3
"""树莓派推理智能体 · 决策循环（见 raspi/ADAPTIVE-AGENT-PLAN.md）。

核心：不再「一句话挨个试 115 条正则」，而是
    一句话 + 环境上下文 + 工具清单  →  可注入的「大脑」推理  →  一个决策（选工具/确认/反问/婉拒/收尾）。

按两书方法论专业化：
- Agentic Loop（Harness 1.2.5 / AI工程 6.2.3）：decide() 是**单步**原语；run() 是**多步**编排
  （执行→结果回注→再决策，带 max_steps + 大脑主动收尾两个停止条件）。
  但 Pi 绝大多数是「一句话→一个动作」的输入≈输出场景（AI工程 6.6 Token 经济学），**默认走单步 decide()、
  不 fork 子进程、不过度设计**；多步 run() 只在云端主脑、需要依赖中间结果时才用（小 max_steps 2~3）。
- 五种决策 + ask/decline（Harness 5.5 permissionDecision / AI工程 6.2.3.1 IRRELEVANT）：
  TOOL / CONFIRM(惊扰先确认) / CLARIFY(信息不足反问) / DECLINE(越界婉拒) / FINAL(收尾) / NONE(回退)。
- 阻止 vs 故障二分（Harness 5.4）：大脑崩了=故障→回退绝不阻塞；参数缺=可反问补全。reason_kind 区分。
- 上下文预算纪律（Harness 3.3 渐进式披露）：format_context 只喂决策相关字段、长值截断，给端侧窄上下文减负。
- 结构化判据 + few-shot + 温度0（AI工程 3.4.2）：SYSTEM_HINT 讲清任务/判据/输出契约，注入工具黄金示例。
- flag 隔离：SUNSET_AGENT_LOOP 默认关，不被 daemon import、不接进 handle_command → 零行为改变。
"""
import os

import agent_tools

AGENT_LOOP_ENABLED = os.environ.get("SUNSET_AGENT_LOOP", "0").lower() in {"1", "true", "yes", "on"}

# 决策类型
DECISION_TOOL = "tool"        # 选了工具（带参数）→ 直接执行
DECISION_CONFIRM = "confirm"  # 惊扰型工具 → 先向用户确认（Harness 5.5 ask=不确定交人定）
DECISION_CLARIFY = "clarify"  # 信息不足 → 反问补全
DECISION_DECLINE = "decline"  # 超范围/越界 → 礼貌婉拒（AI工程 6.2.3.1 IRRELEVANT，别硬凑工具）
DECISION_FINAL = "final"      # 任务完成 → 这是最终要说的话（Agentic Loop 出口）
DECISION_NONE = "none"        # 无有效决策 → 调用方回退正则/端侧/云端

# 失败/无决策的性质（阻止 vs 故障二分）
REASON_BRAIN_ERROR = "brain_error"    # 大脑抛异常/崩了 = 故障 → 回退，绝不阻塞
REASON_INVALID_CALL = "invalid_call"  # 大脑选了工具但校验没过（幻觉/参数错）
REASON_NO_DECISION = "no_decision"    # 大脑没给有效结构

SYSTEM_HINT = (
    "你是日落电台弗洛斯特的决策大脑。任务：看用户这句话 + 当前环境，从工具清单里挑**一个**最合适的来满足他。\n"
    "判据：\n"
    "· 有明确动作请求(听歌/切歌/调音量/静音/切城/生成电台) → 选对应工具，参数从话里抽。\n"
    "· 信息不足(如说『放首歌』没说哪种) → 反问一句(reply)。\n"
    "· 只是聊天/说心情/没有具体请求 → 选 chitchat。\n"
    "· 超出能力范围(订机票/转账/politics 等) → 婉拒(decline)，别硬凑工具。\n"
    "输出**一个** JSON：{\"tool\":名,\"arguments\":{...}} 或 {\"reply\":反问} 或 {\"decline\":婉拒} 或 {\"final\":最终要说的话}。\n"
    "采样温度=0（同一句话同一环境，决策要可复现）。不要解释。"
)

# 上下文字段呈现顺序 + 单值截断上限（预算纪律：别把整个 state 倒进 prompt）
_CTX_ORDER = [
    ("playing", "正在播放"), ("city", "当前城市"), ("track", "当前曲目"), ("audio_mode", "音频模式"),
    ("time", "此刻时间"), ("sunset", "当地日落"), ("ambient_light", "环境光"), ("battery", "电量"),
    ("network", "网络"), ("location", "位置"), ("recent", "近期对话"),
]
_CTX_MAX_LEN = 80


def _clip(v):
    s = str(v)
    return s if len(s) <= _CTX_MAX_LEN else s[:_CTX_MAX_LEN] + "…"


def format_context(context):
    """把环境上下文组织成给大脑看的简明文本。预算纪律(Harness 3.3)：已知键有序、未知键不丢、长值截断。"""
    if not context:
        return "（无额外环境信息）"
    known = {k for k, _ in _CTX_ORDER}
    lines = [f"- {label}：{_clip(context[key])}" for key, label in _CTX_ORDER
             if context.get(key) not in (None, "", [], {})]
    for k in context:
        if k not in known and context[k] not in (None, "", [], {}):
            lines.append(f"- {k}：{_clip(context[k])}")
    return "\n".join(lines) if lines else "（无额外环境信息）"


def few_shot(subset=None):
    """从工具的黄金示例拼 few-shot（AI工程 3.4.2：示例能显著提升一致性）。"""
    src = subset if subset is not None else agent_tools.TOOLS
    lines = []
    for tool in src:
        for ex in (tool.get("examples") or [])[:1]:  # 每工具取一条，控预算
            lines.append(f"『{ex['utterance']}』→ {{\"tool\":\"{tool['name']}\",\"arguments\":{ex.get('args', {})}}}")
    return "示例：\n" + "\n".join(lines) if lines else ""


def build_prompt(utterance, context, last_observation=None):
    """给大脑的用户侧输入：环境 + 这句话 (+ 上一步工具执行结果，供多步回注/自愈)。"""
    parts = [f"当前环境：\n{format_context(context)}"]
    if last_observation:
        parts.append(f"上一步结果：{_clip(last_observation)}")
    parts.append(f"用户说：{str(utterance or '').strip()}")
    return "\n\n".join(parts)


def _normalize(raw):
    """把大脑返回的原始决策规整成统一结构。大脑契约（五选一）：
        {"tool": 名, "arguments": {...}}  → 工具（惊扰型自动降级为 CONFIRM）
        {"confirm": 问, "tool":..,"arguments":..} → 显式确认
        {"reply": 反问}   → CLARIFY
        {"decline": 婉拒} → DECLINE
        {"final": 话}     → FINAL（收尾）
        None/其它         → NONE
    """
    if not isinstance(raw, dict):
        return {"type": DECISION_NONE, "reason_kind": REASON_NO_DECISION}
    if raw.get("decline"):
        return {"type": DECISION_DECLINE, "reply": str(raw["decline"]).strip()}
    if raw.get("final"):
        return {"type": DECISION_FINAL, "reply": str(raw["final"]).strip()}
    if raw.get("reply"):
        return {"type": DECISION_CLARIFY, "reply": str(raw["reply"]).strip()}
    if raw.get("tool"):
        name = raw["tool"]
        args = raw.get("arguments") or raw.get("args") or {}
        ok, err, reason = agent_tools.validate_call(name, args)
        if not ok:
            # 缺必填 → 可反问补全(CLARIFY)；其它(幻觉工具/枚举/类型/裸id) → 无效回退(NONE)
            if reason == agent_tools.REASON_MISSING_PARAM:
                return {"type": DECISION_CLARIFY, "reply": f"（需要补充：{err}）", "reason_kind": REASON_INVALID_CALL}
            return {"type": DECISION_NONE, "error": err, "reason_kind": REASON_INVALID_CALL, "raw_tool": name}
        tool = agent_tools.get_tool(name)
        base = {"tool": name, "arguments": args, "kind": tool.get("kind"),
                "safety": tool.get("safety"), "effect": tool.get("effect")}
        # 惊扰型：即便大脑直接给了工具，也降级为先确认（Harness 3.4.4 副作用越大控制权越收紧）
        if agent_tools.needs_confirmation(name) and not raw.get("confirmed"):
            base["type"] = DECISION_CONFIRM
            base["reply"] = str(raw.get("confirm") or f"要{tool.get('effect') or '执行这个动作'}吗？").strip()
        else:
            base["type"] = DECISION_TOOL
        return base
    return {"type": DECISION_NONE, "reason_kind": REASON_NO_DECISION}


def decide(utterance, context, brain, tools=None, last_observation=None, trace=None):
    """单步决策原语。`brain(prompt, tools, system) -> dict|None`（可注入，离线可用假大脑）。
    大脑抛异常/返回空 → NONE（reason_kind=brain_error，调用方回退，绝不崩）。trace 可选，记审计日志。"""
    text = str(utterance or "").strip()
    if not text:
        d = {"type": DECISION_NONE, "reason_kind": REASON_NO_DECISION}
        if trace:
            trace({"utterance": text, "decision": d})
        return d
    tool_schema = agent_tools.gemini_tools() if tools is None else tools
    prompt = build_prompt(text, context, last_observation)
    try:
        raw = brain(prompt, tool_schema, SYSTEM_HINT)
    except Exception as exc:
        d = {"type": DECISION_NONE, "error": f"brain 异常: {exc}", "reason_kind": REASON_BRAIN_ERROR}
        if trace:
            trace({"utterance": text, "decision": d})
        return d
    d = _normalize(raw)
    if trace:
        trace({"utterance": text, "context_keys": list((context or {}).keys()), "decision": d})
    return d


def run(utterance, context, brain, executor, tools=None, max_steps=3, trace=None):
    """多步 Agentic Loop（Harness 1.2.5 五步闭环）：decide→执行→结果回注→再 decide，直到大脑收尾或到 max_steps。
    `executor(tool_name, arguments) -> observation_str`：真正把决策派发到 daemon 并回一句结构化观察。
    ⚠️ 仅用于云端主脑 + 需依赖中间结果的多步请求；Pi 默认单步 decide()。CONFIRM/CLARIFY/DECLINE 即停交人。
    返回 {"type":..., "steps":[...], "reply"/"tool"...}。max_steps 是防无限循环+控成本的硬护栏。"""
    history_obs = None
    steps = []
    for i in range(max(1, max_steps)):
        d = decide(utterance, context, brain, tools=tools, last_observation=history_obs, trace=trace)
        steps.append(d)
        if d["type"] != DECISION_TOOL:
            # CONFIRM/CLARIFY/DECLINE/FINAL/NONE 都是终态：交人确认或收尾或回退
            d["steps"] = steps
            return d
        # 执行工具 → 取观察 → 回注，进入下一轮（第4步 result 回注）
        try:
            history_obs = executor(d["tool"], d.get("arguments") or {})
        except Exception as exc:
            # PostToolUse：执行失败 → 记为观察并停（失败即回退，绝不空转）
            fail = {"type": DECISION_NONE, "reason_kind": REASON_BRAIN_ERROR,
                    "error": f"executor 异常: {exc}", "steps": steps}
            return fail
    # 到 max_steps 仍未收尾：安全收尾（把最后一步已做的说出来），绝不无限循环
    return {"type": DECISION_FINAL, "reply": _clip(history_obs) if history_obs else "（已尽力）",
            "steps": steps, "stopped_by": "max_steps"}


if __name__ == "__main__":
    # 演示：单步 decide + 多步 run，都用假大脑
    def fake_brain(prompt, tools, system):
        if "海边" in prompt or "爵士" in prompt:
            return {"tool": "play_music", "arguments": {"scene": "海边", "genre": "爵士"}}
        if "太吵" in prompt:
            return {"tool": "set_volume", "arguments": {"direction": "down"}}
        if "切到" in prompt or "换到" in prompt:
            return {"tool": "switch_city", "arguments": {"city": "东京"}}
        if "订机票" in prompt:
            return {"decline": "这个我帮不上，我是管日落电台的~"}
        return {"reply": "你想听点什么？"}

    ctx = {"playing": True, "city": "柏林", "time": "18:40", "ambient_light": "偏暗"}
    print("== 单步 decide ==")
    for u in ["想听点海边的爵士", "太吵了", "切到东京", "帮我订机票", "嗯"]:
        d = decide(u, ctx, fake_brain)
        print(f"  {u} → {d['type']}: {d.get('tool') or d.get('reply')}")
