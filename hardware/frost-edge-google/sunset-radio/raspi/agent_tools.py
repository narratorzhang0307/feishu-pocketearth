#!/usr/bin/env python3
"""树莓派推理智能体 · 工具清单（见 raspi/ADAPTIVE-AGENT-PLAN.md）。

把 `pi_command_daemon.py` 里**已存在**的动作函数，登记成「带 JSON schema 的工具」，供推理大脑
做 function-calling 选择。本模块**纯声明**：不 import daemon、不触碰运行时、零行为改变——它是
「大脑能调用哪些能力、每个填什么参、有多大副作用、执行后世界变成什么样」的**单一事实源**。

按两本书方法论专业化（黄佳《Harness》+ Chip Huyen《AI 工程》）：
- description=灵魂（Harness 3.4.2）：summary + trigger_examples(穷举口语说法) + not_for(负向边界)，
  拼进给大脑的 description，命中率才高。
- 确定性阶梯（Harness 5.4）：tier = regex|edge|cloud，标注「所需最低判断层级」，能正则不端侧、能端侧不云端。
- 最小权限/副作用分级（Harness 3.4.4/4.4、AI工程 6.2.2）：safety = read_only|mutating|disruptive，
  驱动「惊扰动作先确认」，而非散在分支里判断。
- 世界模型（AI工程 6.2.3.2）：effect = 执行后的后置状态，帮大脑规划多步、给「执行后反思」比对预期。
- 评估先行（AI工程 3.x/4.x）：examples = 黄金示例，一份两用（大脑 few-shot + 评估锚点）。

派发（把决策真正执行到 daemon 函数）、接进 handle_command，留后续阶段（需真机验证）。本文件独立可测。
"""

# ---- 分类维度（正交，别混为一谈）----
KIND_ACTION = "action"          # 判到即本地执行、断网也能转
KIND_GENERATION = "generation"  # 要有文采的内容，云端优先、端侧兜底

SAFETY_READONLY = "read_only"    # 只感知、不改世界（AI工程「只读动作」）
SAFETY_MUTATING = "mutating"     # 改播放态，但可秒撤/可回滚
SAFETY_DISRUPTIVE = "disruptive" # 改变用户正在体验且不易撤销 → 惊扰，需先确认

TIER_REGEX = "regex"  # 明确命令，确定性正则秒回，最可靠 ~0ms
TIER_EDGE = "edge"     # 需一点语义判断，由端侧 Google Gemma 处理
TIER_CLOUD = "cloud"   # 需生成/多步推理，云端主脑 ~1-3s


# 每个工具字段：name / summary(功能定位) / trigger_examples(口语穷举) / not_for(负向边界) /
# parameters(JSON schema) / kind / safety / tier / effect(后置状态) / impl(指向现有函数) /
# high_noise(高噪声执行型，隔离只回摘要) / examples(黄金示例：utterance+context→args)
TOOLS = [
    {
        "name": "play_music",
        "summary": "按城市/心情/风格/场景，从本地曲库接一段音乐播放。",
        "trigger_examples": ["放点爵士", "来首东京的歌", "想听海边夜里的音乐", "换个伤感的歌单", "放几首安静的钢琴曲"],
        "not_for": "只是问某城/某歌背后的故事而不想听→describe_city/describe_song；想整档换城收听→switch_city",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，如 东京/柏林/巴黎；不给则用当前城或按心情挑"},
                "mood": {"type": "string", "description": "心情或氛围，如 安静/伤感/热闹/深夜/治愈"},
                "genre": {"type": "string", "description": "曲风，如 爵士/钢琴/摇滚/电子/民谣"},
                "scene": {"type": "string", "description": "场景，如 海边/看书/开车/入睡"},
            },
        },
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_EDGE,
        "effect": "开始播放符合条件的一段本地曲目",
        "impl": "candidate_tracks(text) -> set_playlist_tracks(tracks)",
        "examples": [
            {"utterance": "想听点海边夜里的爵士", "context": {}, "args": {"scene": "海边", "genre": "爵士"}},
            {"utterance": "放几首安静的", "context": {"city": "京都"}, "args": {"mood": "安静"}},
        ],
    },
    {
        "name": "next_song", "summary": "切到下一首/换一首/跳过当前这首。",
        "trigger_examples": ["下一首", "切歌", "换一首别的", "跳过这首", "这首不想听了"], "not_for": "想听某类新音乐→play_music",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "播放列表前进一首", "impl": "play_next(1)",
        "examples": [{"utterance": "切歌", "context": {"playing": True}, "args": {}}],
    },
    {
        "name": "prev_song", "summary": "回到上一首/回刚才那首。",
        "trigger_examples": ["上一首", "回刚才那首", "退回上一首"], "not_for": "",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "播放列表后退一首", "impl": "play_next(-1)",
        "examples": [{"utterance": "回上一首", "context": {"playing": True}, "args": {}}],
    },
    {
        "name": "pause", "summary": "暂停/停止当前播放。",
        "trigger_examples": ["暂停", "停一下", "先停停", "把声音停了"],
        "not_for": "静音(只上屏不出声、但不是停播)→mute",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "播放暂停，屏幕停在当前曲", "impl": "stop_player()",
        "examples": [{"utterance": "先暂停一下", "context": {"playing": True}, "args": {}}],
    },
    {
        "name": "resume", "summary": "继续/恢复播放刚才的音乐。",
        "trigger_examples": ["继续放", "接着放", "恢复播放"], "not_for": "",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "从暂停处继续播放", "impl": "start_radio_playback()",
        "examples": [{"utterance": "接着放吧", "context": {}, "args": {}}],
    },
    {
        "name": "replay", "summary": "重播/再听一遍当前这首。",
        "trigger_examples": ["重播", "再听一遍", "这首再来一次"], "not_for": "",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "当前曲从头再放", "impl": "play_next(0)",
        "examples": [{"utterance": "再听一遍", "context": {"playing": True}, "args": {}}],
    },
    {
        "name": "set_volume", "summary": "调大或调小音量。",
        "trigger_examples": ["放大音量", "调大点", "太吵了", "听不清", "小声点", "减小音量"], "not_for": "彻底静音→mute",
        "parameters": {
            "type": "object",
            "properties": {"direction": {"type": "string", "enum": ["up", "down"], "description": "up=调大，down=调小"}},
            "required": ["direction"],
        },
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "系统音量调大或调小一档", "impl": "adjust_radio_volume(direction)",
        "examples": [
            {"utterance": "太吵了", "context": {"playing": True}, "args": {"direction": "down"}},
            {"utterance": "大点声", "context": {}, "args": {"direction": "up"}},
        ],
    },
    {
        "name": "mute", "summary": "静音/进入安静模式（只在屏幕上响应、不出声）。",
        "trigger_examples": ["静音", "闭麦", "别出声了", "睡觉模式"], "not_for": "只是暂停音乐(不改出声纪律)→pause",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_DISRUPTIVE, "tier": TIER_REGEX,
        "effect": "进入硬静音，之后只上屏不出声、不放歌", "impl": 'publish_audio_mode("hard_mute")',
        "examples": [{"utterance": "静音", "context": {}, "args": {}}],
    },
    {
        "name": "unmute", "summary": "解除静音/打开声音，恢复能出声与播放。",
        "trigger_examples": ["解除静音", "取消静音", "打开声音", "可以说话了"], "not_for": "",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_MUTATING, "tier": TIER_REGEX,
        "effect": "退出静音，恢复出声与放歌", "impl": 'publish_audio_mode("radio")',
        "examples": [{"utterance": "解除静音", "context": {"audio_mode": "hard_mute"}, "args": {}}],
    },
    {
        "name": "make_24h_radio", "summary": "生成/排一档 24 小时（逐城随日落）电台节目单。",
        "trigger_examples": ["生成24小时电台", "排一天的节目", "做一档日落电台", "安排今天听什么"],
        "not_for": "只想现在听一段→play_music",
        "parameters": {
            "type": "object",
            "properties": {"sense_ambient": {"type": "boolean", "description": "是否先用摄像头感知一次环境光再排（用户明确要求时才 true）"}},
        },
        "kind": KIND_ACTION, "safety": SAFETY_DISRUPTIVE, "tier": TIER_EDGE, "high_noise": True,
        "effect": "重排整档 24h 节目单，切走当前收听", "impl": "publish_day_plan(capture=sense_ambient)",
        "examples": [{"utterance": "帮我把今天的电台排好", "context": {}, "args": {}}],
    },
    {
        "name": "follow_sunset", "summary": "跟着日落走：预览逐城日落路线 / 现在哪座城正在日落 / 下一座日落的城。",
        "trigger_examples": ["现在哪座城在日落", "跟着日落走", "下一座日落的城", "带我看看日落到哪了"],
        "not_for": "排一整天节目→make_24h_radio；只想听某城的歌→play_music",
        "parameters": {"type": "object", "properties": {}},
        "kind": KIND_ACTION, "safety": SAFETY_READONLY, "tier": TIER_EDGE,
        "effect": "在屏上呈现此刻日落城与逐城路线预览", "impl": "publish_route_preview()  (可配合 hop_city)",
        "examples": [{"utterance": "现在轮到哪个城市看日落了", "context": {}, "args": {}}],
    },
    {
        "name": "switch_city", "summary": "切换到某座城市（切城）。",
        "trigger_examples": ["切换到东京", "换到柏林", "去巴黎", "切到北京"], "not_for": "只想问这城的故事→describe_city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "目标城市名，如 东京/柏林"}},
            "required": ["city"],
        },
        # ⚠️ 跨城传完整 RadioTrack，不传 id：track id 跨城不唯一，只传 id 会串台（由 validate 做硬约束）
        "kind": KIND_ACTION, "safety": SAFETY_DISRUPTIVE, "tier": TIER_EDGE,
        "effect": "当前城市→目标城，清空跨城歌单换成该城的歌", "impl": "switch_city(city)",
        "examples": [{"utterance": "切到东京", "context": {"city": "柏林"}, "args": {"city": "东京"}}],
    },
    {
        "name": "describe_city", "summary": "讲讲某座城市的故事/文化/风物（问某城背后的事）。",
        "trigger_examples": ["讲讲东京", "柏林有什么故事", "介绍下这座城"], "not_for": "想听这城的歌→play_music/switch_city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "城市名"}},
            "required": ["city"],
        },
        "kind": KIND_GENERATION, "safety": SAFETY_READONLY, "tier": TIER_CLOUD,
        "effect": "口播一段该城的故事（不改播放态）", "impl": "introText 检索 / 云端大脑生成（城市知识按需加载）",
        "examples": [{"utterance": "柏林有什么故事", "context": {}, "args": {"city": "柏林"}}],
    },
    {
        "name": "describe_song", "summary": "讲讲某首歌/歌手/作品背后的事（这首谁唱的、什么故事）。",
        "trigger_examples": ["这首歌是谁唱的", "这歌什么故事", "介绍下这个歌手"], "not_for": "想换首歌→next_song/play_music",
        "parameters": {
            "type": "object",
            "properties": {"track": {"type": "string", "description": "歌名或歌手；不给则指当前播放的这首"}},
        },
        "kind": KIND_GENERATION, "safety": SAFETY_READONLY, "tier": TIER_CLOUD,
        "effect": "口播一段该曲背后的事（不改播放态）", "impl": "introText / 云端大脑生成",
        "examples": [{"utterance": "这首谁写的", "context": {"track": "Merry Christmas Mr. Lawrence"}, "args": {}}],
    },
    {
        "name": "device_status", "summary": "报设备状态/自检（电量/网络/温度/相机/屏/按键/TTS 等真硬件诊断）。",
        "trigger_examples": ["还有多少电", "网络怎么样", "自检一下", "麦克风好使吗"], "not_for": "",
        "parameters": {
            "type": "object",
            "properties": {
                "subsystem": {
                    "type": "string",
                    "enum": ["battery", "network", "camera", "screen", "button", "tts", "voice", "all"],
                    "description": "要查的子系统，不给则综合状态",
                }
            },
        },
        "kind": KIND_ACTION, "safety": SAFETY_READONLY, "tier": TIER_EDGE, "high_noise": True,
        "effect": "口播/上屏一句设备状态摘要（只读硬件、不改配置）", "impl": "collect_device_status() / 各 *_doctor",
        "examples": [{"utterance": "还有多少电", "context": {}, "args": {"subsystem": "battery"}}],
    },
    {
        "name": "chitchat", "summary": "闲聊/打招呼/回应情绪/回答一般问题（没有具体动作请求时）。",
        "trigger_examples": ["在吗", "有点想你了", "今天好累啊", "随便聊聊", "我有点无聊"],
        "not_for": "有明确动作请求(听歌/切歌/调音量/问城市歌曲)→对应工具",
        "parameters": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "用户原话，交给对话大脑回应"}},
            "required": ["text"],
        },
        "kind": KIND_GENERATION, "safety": SAFETY_READONLY, "tier": TIER_CLOUD,
        "effect": "口播一句陪伴式回应（不改播放态）", "impl": "chat_agent.respond() / 云端大脑",
        "examples": [{"utterance": "有点想你了", "context": {}, "args": {"text": "有点想你了"}}],
    },
]


# ---------------- 访问器 ----------------

_BY_NAME = {t["name"]: t for t in TOOLS}


def tool_names():
    return [t["name"] for t in TOOLS]


def get_tool(name):
    return _BY_NAME.get(name)


def action_tools():
    return [t for t in TOOLS if t["kind"] == KIND_ACTION]


def generation_tools():
    return [t for t in TOOLS if t["kind"] == KIND_GENERATION]


def offline_tools():
    """端侧/断网可用的最小工具白名单（确定性阶梯 regex|edge，排除云端生成）。
    缩小选择空间：既筑安全防线，也显著降低端侧 0.6b 的幻觉（Harness 1.2.3 --allowed-tools 思想）。"""
    return [t for t in TOOLS if t["tier"] in (TIER_REGEX, TIER_EDGE)]


def needs_confirmation(name):
    """该工具是否属于惊扰型（disruptive），执行前应先向用户确认（Harness 3.4.4 最坏情况测试）。"""
    tool = get_tool(name)
    return bool(tool and tool.get("safety") == SAFETY_DISRUPTIVE)


def _describe(tool):
    """把 summary + trigger_examples + not_for + effect 拼成给大脑看的完整 description（灵魂三段式）。"""
    parts = [tool["summary"]]
    if tool.get("trigger_examples"):
        parts.append("用户会说：" + "、".join(tool["trigger_examples"]))
    if tool.get("not_for"):
        parts.append("不适用：" + tool["not_for"])
    if tool.get("effect"):
        parts.append("执行后：" + tool["effect"])
    return "  ".join(parts)


def gemini_tools(subset=None):
    """转成 Gemini 工具声明格式。subset 传 offline_tools() 可给端侧窄白名单。"""
    src = subset if subset is not None else TOOLS
    return [{"name": t["name"], "description": _describe(t), "input_schema": t["parameters"]} for t in src]


def compatible_functions(subset=None):
    """转成兼容 JSON 工具调用接口的 functions 格式。"""
    src = subset if subset is not None else TOOLS
    return [
        {"type": "function", "function": {"name": t["name"], "description": _describe(t), "parameters": t["parameters"]}}
        for t in src
    ]


# ---------------- 校验（事中护栏）----------------

# 失败性质分类（对齐 AI工程 6.2.4 规划故障 + Harness 5.4「阻止 vs 故障」二分）
REASON_UNKNOWN_TOOL = "unknown_tool"   # 大脑幻觉出不存在的工具 → 彻底无效
REASON_NOT_OBJECT = "not_object"       # 参数不是对象
REASON_MISSING_PARAM = "missing_param" # 必填缺失 → 可反问补全
REASON_BAD_ENUM = "bad_enum"           # 枚举取值非法
REASON_BAD_TYPE = "bad_type"           # 类型不符
REASON_BARE_ID = "bare_id"             # 跨城传了裸 id 而非完整 RadioTrack（项目硬坑）

_JSON_TYPE = {"string": str, "boolean": bool, "number": (int, float), "integer": int, "object": dict, "array": list}


def validate_call(name, args):
    """对大脑给的一次工具调用做校验（不依赖 jsonschema 库）。
    返回 (ok, error, reason_kind)——reason_kind 让调用方按性质选回退层级（可反问 vs 彻底丢弃）。
    含项目硬约束：切城/放歌类若带 track，必须是完整 RadioTrack（有 title/city/audioUrl），不能是裸 id。"""
    tool = get_tool(name)
    if tool is None:
        return False, f"未知工具: {name}", REASON_UNKNOWN_TOOL
    if not isinstance(args, dict):
        return False, "参数必须是对象", REASON_NOT_OBJECT
    schema = tool.get("parameters") or {}
    props = schema.get("properties") or {}
    for req in schema.get("required") or []:
        if req not in args or args[req] in (None, ""):
            return False, f"缺少必填参数: {req}", REASON_MISSING_PARAM
    for key, val in args.items():
        spec = props.get(key)
        if not spec:
            continue  # 多给的参数忽略，不算错
        enum = spec.get("enum")
        if enum and val not in enum:
            return False, f"参数 {key} 取值非法: {val!r}（应为 {enum}）", REASON_BAD_ENUM
        pytype = _JSON_TYPE.get(spec.get("type"))
        if pytype and val is not None and not isinstance(val, pytype):
            # bool 是 int 的子类，单独放行 number/integer 收到 bool 的怪例交给业务，这里只挡明显类型错
            if not (spec.get("type") in ("number", "integer") and isinstance(val, bool) is False):
                if not isinstance(val, pytype):
                    return False, f"参数 {key} 类型应为 {spec.get('type')}", REASON_BAD_TYPE
    # 硬约束：跨城传完整 RadioTrack 不传 id。软约束升级为不可绕过的校验。
    track = args.get("track")
    if track is not None and not isinstance(track, dict) and tool.get("safety") == SAFETY_DISRUPTIVE:
        return False, "跨城必须传完整 RadioTrack，不能只传 id", REASON_BARE_ID
    return True, "", None


def match_decision(name, args, expect):
    """评估用比较器：工具选择是封闭集『功能正确性』问题，用精确匹配（AI工程 3.2），别用 AI 裁判。
    工具名必等；expect 里点名的 required/enum 关键参数必等；自由文本参数(mood/text/scene)不逐字比。
    expect = {"tool": name, "args": {...}}。返回 (ok, mismatch)。"""
    if name != expect.get("tool"):
        return False, f"工具应为 {expect.get('tool')}，实得 {name}"
    exp_args = expect.get("args") or {}
    tool = get_tool(name) or {}
    props = (tool.get("parameters") or {}).get("properties") or {}
    for key, want in exp_args.items():
        got = args.get(key)
        # 只严格比 enum/必填等『承载语义的关键字段』；自由文本容错
        is_enum = bool((props.get(key) or {}).get("enum"))
        if is_enum or key in (tool.get("parameters") or {}).get("required", []):
            if got != want:
                return False, f"参数 {key} 应为 {want!r}，实得 {got!r}"
        else:
            if got is None:
                return False, f"缺参数 {key}"
    return True, ""
