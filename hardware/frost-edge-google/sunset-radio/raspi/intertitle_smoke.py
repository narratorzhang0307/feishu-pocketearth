#!/usr/bin/env python3
"""intertitle 冒烟：打字机节奏、像素换行、时长模型、触发判定。纯离线：python3 intertitle_smoke.py"""
import intertitle as it


def test_reveal_count():
    assert it.reveal_count(0, 20) == 0
    assert it.reveal_count(0.5, 20) == int(0.5 * it.CHARS_PER_SEC)
    assert it.reveal_count(999, 20) == 20, "封顶在总字数"
    print("  ✓ 打字机节奏：按耗时算字数、无状态、封顶")


def test_total_duration_capped():
    short = it.total_duration(10)
    long = it.total_duration(500)
    assert short < long or long == it.MAX_TOTAL_SEC
    assert long <= it.MAX_TOTAL_SEC, "长文必须封顶，不霸屏"
    print(f"  ✓ 时长模型：短文 {short:.1f}s、长文封顶 {long:.1f}s")


def test_clip_text():
    s = it.clip_text("好" * 300)
    assert len(s) <= it.MAX_CHARS and s.endswith("…")
    assert it.clip_text("  多  空 格  ") == "多 空 格"
    print("  ✓ 截断与空白规整")


def test_wrap_cjk_and_ascii():
    measure = lambda s: len(s) * 10  # 每字 10px
    lines = it.wrap_by_width("今晚的东京有点微雨适合坂本龙一", 100, measure)  # 每行最多10字
    assert all(measure(l) <= 100 for l in lines) and len(lines) >= 2
    assert "".join(lines) == "今晚的东京有点微雨适合坂本龙一", "换行不丢字"
    # 英文单词不拆
    lines2 = it.wrap_by_width("play Merry Christmas now", 120, measure)
    joined = " ".join(l.strip() for l in lines2)
    assert "Christmas" in joined and all(measure(l) <= 120 for l in lines2)
    # 显式换行
    lines3 = it.wrap_by_width("第一行\n第二行", 999, measure)
    assert lines3 == ["第一行", "第二行"]
    print("  ✓ 像素换行：CJK 逐字、英文单词不拆、不丢字、支持显式换行")


def test_should_show_and_noise():
    assert it.should_show("", "你好，我在。")
    assert not it.should_show("你好，我在。", "你好，我在。"), "同一条不重复弹"
    assert not it.should_show("", "")
    assert not it.should_show("", "没有听清，继续监听。"), "voice 待命噪音不弹"
    assert not it.should_show("", "随便什么", label="语音待命"), "语音待命标签不弹"
    assert not it.should_show("", "识别到：切歌", city="语音控制"), "voice瞬态(城市指纹)整类不弹"
    assert not it.should_show("", "播放东京的音乐", status="queued"), "命令入队回显(用户自己的话)不弹"
    assert not it.should_show("", "音乐DJ 已静音，载入 96 座城市。"), "心跳静音待命句不弹"
    assert not it.should_show("", "坂本龍一 - Merry Christmas", now_playing_line="坂本龍一 - Merry Christmas"), "歌名行不弹"
    assert it.should_show("旧消息", "音乐DJ 先按这句话从本地曲库接上一段")
    assert it.should_show("", "静音中：音乐DJ 记下了：帮我找一首歌", label="静音中"), "静音下的真回复要弹(这正是验证场景)"
    print("  ✓ 触发判定：新消息弹、重复/空/瞬态/入队回显/心跳/歌名行不弹、静音真回复弹")


if __name__ == "__main__":
    test_reveal_count()
    test_total_duration_capped()
    test_clip_text()
    test_wrap_cjk_and_ascii()
    test_should_show_and_noise()
    print("INTERTITLE SMOKE OK")
