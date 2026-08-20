#!/usr/bin/env python3
"""树莓派推理智能体 · 大脑适配器（见 ADAPTIVE-AGENT-PLAN.md）。

把「大脑」这一层做成可插拔：同一个 `brain(prompt, tools, system) -> dict|None` 契约，
底下可以是云端 Google Gemini 的受控工具选择（agent 层），也可以是树莓派端侧 Gemma 4 E4B（edge 层）。
契约返回（与 agent_loop._normalize 对齐）：
    {"tool": 名, "arguments": {...}} / {"reply": 反问} / {"decline": 婉拒} / {"final": 话} / None

设计纪律：
- **确定性阶梯**（Harness 5.4）：云端主脑给全工具全集；端侧只喂 offline_tools() 白名单，缩小选择空间降幻觉。
- **可注入 + 离线可测**：HTTP 传输做成参数，测试注入假传输，不依赖真网络或真模型服务。
- **失败即回退**（Harness 5.4 阻止 vs 故障）：任何异常/超时/解析失败 → 返回 None，让 agent_loop 回退。
- 端侧不 import daemon、不硬编 daemon 逻辑；云端解析兼容标准工具调用与裸 JSON 两种形态。
"""
import json
import re
import urllib.request

# 端侧 6 标签意图 → 工具（复用已验证的 raspi/edge.classify，14/15）。
# 明确命令(切歌/音量/静音)走 daemon 正则 command 层，不进大脑，故这里只映射模糊动作/生成意图。
INTENT_TO_TOOL = {
    "open_dj": "play_music",
    "make_radio": "make_24h_radio",
    "tour": "follow_sunset",
    "city_culture": "describe_city",
    "chitchat": "chitchat",
    # general → 交回 None（可能越界/杂项），让上层回退或婉拒
}


def extract_utterance(prompt):
    """从 agent_loop.build_prompt 生成的 prompt 里取回「用户说：X」那句原话（给端侧分类器用）。"""
    m = re.findall(r"用户说：(.+?)(?:\n|$)", str(prompt or ""))
    return m[-1].strip() if m else str(prompt or "").strip()


# ---------------- 端侧大脑（edge 层）----------------

def make_edge_brain(classify_fn):
    """把一个『一句话→6标签』的分类器（如 raspi.edge.classify）包成 brain。
    端侧 Gemma 只做**单步工具选择**，多步与高风险动作仍交给 Harness 和确认闸。
    classify_fn(text)->label|None 可注入 → 离线可测。"""
    def brain(prompt, tools, system):
        text = extract_utterance(prompt)
        try:
            label = classify_fn(text)
        except Exception:
            return None
        tool = INTENT_TO_TOOL.get(label)
        if not tool:
            return None  # general/None → 让上层回退（端侧不硬凑）
        # 尊重工具白名单：映射到的工具不在本次可用清单里（如离线时的云端生成工具）→ 回退
        if tools:
            if tool not in {t.get("name") for t in tools}:
                return None
        # 填端侧能可靠填的必填参：chitchat 的 text=原话；其余复杂参交空，由 daemon 从原话抽
        args = {"text": text} if tool == "chitchat" else {}
        return {"tool": tool, "arguments": args}
    return brain


# ---------------- 云端大脑（agent 层）----------------

def _parse_cloud(data):
    """把云端返回解析成决策契约，兼容三形态：
    - 标准 content block：content 里有 {type:'tool_use', name, input}
    - 兼容工具调用协议：choices[0].message.tool_calls[0].function{name, arguments(JSON串)}
    - 裸 JSON：{tool, arguments} / {reply}/{decline}/{final}
    解析不出 → None。"""
    if not isinstance(data, dict):
        return None
    # 标准 content block tool_use
    for block in data.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            return {"tool": block.get("name"), "arguments": block.get("input") or {}}
    # 兼容 tool_calls（传输协议，不代表模型所有者）
    try:
        tc = data["choices"][0]["message"].get("tool_calls")
        if tc:
            fn = tc[0]["function"]
            args = fn.get("arguments")
            if isinstance(args, str):
                args = json.loads(args or "{}")
            return {"tool": fn.get("name"), "arguments": args or {}}
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        pass
    # 裸决策 JSON（含从 message.content 里掏 JSON）
    for key in ("tool", "reply", "decline", "final"):
        if key in data:
            return data
    try:
        content = data["choices"][0]["message"]["content"]
        obj = json.loads(re.search(r"\{.*\}", content, re.S).group(0))
        if any(k in obj for k in ("tool", "reply", "decline", "final")):
            return obj
    except (KeyError, IndexError, TypeError, AttributeError, json.JSONDecodeError):
        pass
    return None


def make_cloud_brain(url, post=None, timeout=8.0):
    """把一个云端 function-calling 端点包成 brain。
    post(url, payload_bytes, timeout)->dict 可注入 → 离线可测；默认走 urllib。
    payload 里带 system/prompt/tools，端点负责调用 Google Gemini。"""
    def _default_post(u, body, tmo):
        req = urllib.request.Request(u, data=body, headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=tmo) as resp:
            return json.loads(resp.read().decode("utf-8"))

    sender = post or _default_post

    def brain(prompt, tools, system):
        payload = json.dumps({"system": system, "prompt": prompt, "tools": tools},
                             ensure_ascii=False).encode("utf-8")
        try:
            data = sender(url, payload, timeout)
        except Exception:
            return None  # 网络/超时/端点错 → 回退
        return _parse_cloud(data)
    return brain


# ---------------- 项目云端大脑（/api/frost-llm，completion 端点）----------------

def make_frost_cloud_brain(url="http://127.0.0.1:8080/api/frost-llm", post=None, timeout=12.0):
    """把本项目的 Google-first `/api/frost-llm` 包成 brain。
    它是 completion 端点（非原生 function-calling），故把工具清单**序列化进 prompt**、要它输出一个
    JSON 决策；响应形状 {text, model}，从 text 里掏决策 JSON。任何异常/取不到 → None 回退。"""
    def _default_post(u, body, tmo):
        req = urllib.request.Request(u, data=body, headers={"content-type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=tmo) as resp:
            return json.loads(resp.read().decode("utf-8"))

    sender = post or _default_post

    def brain(prompt, tools, system):
        tool_lines = "\n".join(f"- {t.get('name')}: {t.get('description')}" for t in (tools or []))
        full = (
            f"{prompt}\n\n可用工具：\n{tool_lines}\n\n"
            "只输出**一个** JSON 决策，从中挑一种：\n"
            '{"tool":"工具名","arguments":{...}} 或 {"reply":"反问的话"} 或 '
            '{"decline":"婉拒的话"} 或 {"final":"最终要说的话"}。不要解释、不要多余文字。'
        )
        payload = json.dumps({"system": system, "prompt": full, "json": True}, ensure_ascii=False).encode("utf-8")
        try:
            data = sender(url, payload, timeout)
        except Exception:
            return None
        text = data.get("text") if isinstance(data, dict) else None
        if not text:
            # 有的部署直接把决策放在顶层
            return _parse_cloud(data)
        try:
            obj = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
        except (AttributeError, json.JSONDecodeError):
            return None
        return obj if any(k in obj for k in ("tool", "reply", "decline", "final")) else None
    return brain


# ---------------- 工厂：按网络/能力选层 ----------------

def make_brain(mode="auto", *, classify_fn=None, cloud_url=None, online=True):
    """按确定性阶梯选大脑：
    online 且有 cloud_url → Gemini 云端主脑（全工具、可多步）；否则/断网 → Gemma edge（offline 白名单、单步）。
    两者都不可用 → None（agent_loop 再回退正则）。mode 可强制 'cloud'|'edge'。"""
    if mode == "edge" or (mode == "auto" and (not online or not cloud_url)):
        return make_edge_brain(classify_fn) if classify_fn else None
    if cloud_url:
        return make_cloud_brain(cloud_url)
    return make_edge_brain(classify_fn) if classify_fn else None
