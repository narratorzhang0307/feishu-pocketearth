#!/usr/bin/env python3
"""agent_brain 冒烟：端侧分类器包成 brain、云端三形态解析、失败回退 None、
工厂按网络选层。全用假传输/假分类器，纯离线：python3 agent_brain_smoke.py"""
import agent_brain as ab
import agent_loop as al


def test_extract_utterance():
    p = "当前环境：\n- 当前城市：柏林\n\n用户说：想听点海边的爵士"
    assert ab.extract_utterance(p) == "想听点海边的爵士"
    print("  ✓ 从 prompt 取回原话")


def test_edge_brain_maps_intent_to_tool():
    brain = ab.make_edge_brain(lambda text: "open_dj" if "听" in text else "chitchat")
    # 经 agent_loop.decide 走一遍，验证端侧大脑能驱动完整决策
    d = al.decide("我想听点安静的", {}, brain)
    assert d["type"] == al.DECISION_TOOL and d["tool"] == "play_music"
    d2 = al.decide("在吗", {}, brain)
    assert d2["type"] == al.DECISION_TOOL and d2["tool"] == "chitchat"
    print("  ✓ 端侧大脑：edge 6标签→工具映射，驱动 decide 选对 play_music/chitchat")


def test_edge_brain_general_returns_none():
    brain = ab.make_edge_brain(lambda text: "general")
    d = al.decide("北极熊会冬眠吗", {}, brain)
    assert d["type"] == al.DECISION_NONE, "general→端侧不硬凑，回退"
    # 分类器抛异常也回退
    boom = ab.make_edge_brain(lambda text: (_ for _ in ()).throw(RuntimeError()))
    assert boom("用户说：x", [], "")  is None
    print("  ✓ 端侧大脑：general/分类器异常 → None 回退（不硬凑）")


def test_cloud_parse_standard_tool_use():
    resp = {"content": [{"type": "tool_use", "name": "set_volume", "input": {"direction": "down"}}]}
    brain = ab.make_cloud_brain("http://x", post=lambda u, b, t: resp)
    d = al.decide("太吵了", {}, brain)
    assert d["type"] == al.DECISION_TOOL and d["tool"] == "set_volume" and d["arguments"]["direction"] == "down"
    print("  ✓ 云端解析标准 tool_use")


def test_cloud_parse_compatible_tool_calls():
    resp = {"choices": [{"message": {"tool_calls": [{"function": {"name": "next_song", "arguments": "{}"}}]}}]}
    brain = ab.make_cloud_brain("http://x", post=lambda u, b, t: resp)
    d = al.decide("切歌", {}, brain)
    assert d["type"] == al.DECISION_TOOL and d["tool"] == "next_song"
    print("  ✓ 云端解析兼容 tool_calls")


def test_cloud_parse_bare_json_and_decline():
    brain = ab.make_cloud_brain("http://x", post=lambda u, b, t: {"decline": "帮不上~"})
    assert al.decide("订机票", {}, brain)["type"] == al.DECISION_DECLINE
    brain2 = ab.make_cloud_brain("http://x", post=lambda u, b, t: {"choices": [{"message": {"content": '好的 {"reply":"想听哪种？"}'}}]})
    assert al.decide("放首歌", {}, brain2)["type"] == al.DECISION_CLARIFY
    print("  ✓ 云端解析裸 JSON / content 内嵌 JSON（decline/reply）")


def test_cloud_failure_falls_back():
    def boom(u, b, t):
        raise TimeoutError()
    brain = ab.make_cloud_brain("http://x", post=boom)
    # 云端大脑内部捕获超时、优雅返回 None（失败即回退，不外抛）→ decide 判 no_decision
    d = al.decide("放歌", {}, brain)
    assert d["type"] == al.DECISION_NONE and d["reason_kind"] == al.REASON_NO_DECISION
    # 无法解析的响应 → None → 回退
    brain2 = ab.make_cloud_brain("http://x", post=lambda u, b, t: {"weird": 1})
    assert al.decide("放歌", {}, brain2)["type"] == al.DECISION_NONE
    print("  ✓ 云端超时/无法解析 → 内部捕获返回 None → agent_loop 回退（no_decision）")


def test_frost_cloud_brain():
    # /api/frost-llm 返回 {text: 决策JSON, model}，适配器应掏出决策
    brain = ab.make_frost_cloud_brain(post=lambda u, b, t: {"text": '{"decline": "订不了机票~"}', "model": "x"})
    assert al.decide("帮我订机票", {}, brain)["type"] == al.DECISION_DECLINE
    brain2 = ab.make_frost_cloud_brain(post=lambda u, b, t: {"text": '好的 {"tool":"play_music","arguments":{"genre":"爵士"}}'})
    assert al.decide("放点爵士", {}, brain2)["type"] == al.DECISION_TOOL
    # 工具清单要被序列化进 prompt（body 里能看到工具名）
    seen = {}
    ab.make_frost_cloud_brain(post=lambda u, b, t: seen.update({"body": b.decode()}) or {"text": "{}"})("用户说：x", ab_tools(), "")
    assert "play_music" in seen["body"] and "可用工具" in seen["body"]
    # 取不到 text / 异常 → None 回退
    assert ab.make_frost_cloud_brain(post=lambda u, b, t: {"nope": 1})("用户说：x", [], "") is None
    print("  ✓ 项目云端大脑 /api/frost-llm：工具序列化进 prompt、从 text 掏决策、取不到→回退")


def ab_tools():
    import agent_tools
    return agent_tools.gemini_tools()


def test_factory_picks_layer():
    cf = lambda text: "open_dj"
    assert ab.make_brain("auto", classify_fn=cf, cloud_url=None, online=True) is not None  # 无 url → edge
    assert ab.make_brain("auto", classify_fn=cf, cloud_url="http://x", online=False) is not None  # 断网 → edge
    assert ab.make_brain("auto", classify_fn=cf, cloud_url="http://x", online=True) is not None  # 在线 → cloud
    assert ab.make_brain("auto", classify_fn=None, cloud_url=None, online=False) is None  # 啥都没有 → None
    print("  ✓ 工厂按确定性阶梯选层：在线→云端、断网/无url→端侧、都无→None")


if __name__ == "__main__":
    test_extract_utterance()
    test_edge_brain_maps_intent_to_tool()
    test_edge_brain_general_returns_none()
    test_cloud_parse_standard_tool_use()
    test_cloud_parse_compatible_tool_calls()
    test_cloud_parse_bare_json_and_decline()
    test_cloud_failure_falls_back()
    test_frost_cloud_brain()
    test_factory_picks_layer()
    print("AGENT BRAIN SMOKE OK")
