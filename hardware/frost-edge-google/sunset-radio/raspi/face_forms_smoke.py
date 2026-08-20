#!/usr/bin/env python3
"""face_forms 离线自测：调度器契约（放歌才切换、≤12s、不重复当前、停播回头像、
睡意偏向低垂眼族）+ 两种帧序列的尺寸/帧数/非空渲染 + 缓存有界。"""
import random

from PIL import Image

import face_forms as ff


def _non_blank(frame):
    # RGBA 帧至少要有 5% 的不透明像素
    alpha = frame.getchannel("A")
    hist = alpha.histogram()
    opaque = sum(hist[200:])
    return opaque > frame.width * frame.height * 0.05


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    # ---- 调度器：不放歌永远是 avatar，不产生切换噪声 ----
    sched = ff.FormScheduler(rng=random.Random(7))
    check("idle_starts_avatar", sched.form == ff.FORM_AVATAR)
    check("idle_no_switch", sched.tick(100.0, playing=False) is False)

    # ---- 放歌：开始切换；时长 5~12s；下一形态不与当前重复；照片就绪时四形态全轮到 ----
    now = 1000.0
    seen_forms = set()
    last_form = sched.form
    for _ in range(80):
        changed = sched.tick(now, playing=True, photo_ready=True)
        if changed:
            check("no_repeat_form", sched.form != last_form or last_form == ff.FORM_AVATAR)
            dur = sched.until_ts - now
            check("duration_bounds", ff.FORM_MIN_SEC - 1e-6 <= dur <= ff.FORM_MAX_SEC + 1e-6)
            last_form = sched.form
            seen_forms.add(sched.form)
        now = sched.until_ts + 0.01  # 跳到到期时刻
    check("all_forms_visited", seen_forms == set(ff.FORMS))

    # ---- 照片没就绪：绝不抽照片盘（屏幕不等网络） ----
    sched_np = ff.FormScheduler(rng=random.Random(23))
    t = 0.0
    seen_np = set()
    for _ in range(60):
        if sched_np.tick(t, playing=True, photo_ready=False):
            seen_np.add(sched_np.form)
        t = sched_np.until_ts + 0.01
    check("photo_excluded_when_not_ready", ff.FORM_PHOTO not in seen_np)

    # ---- 到期前不切换 ----
    sched2 = ff.FormScheduler(rng=random.Random(3))
    sched2.tick(0.0, playing=True)
    form_before = sched2.form
    variant_before = sched2.variant
    check("holds_until_due", sched2.tick(sched2.until_ts - 1.0, playing=True) is False)
    check("holds_same_variant", sched2.form == form_before and sched2.variant == variant_before)

    # ---- 停播：立刻回 avatar ----
    check("stop_returns_avatar", sched2.tick(sched2.until_ts - 0.5, playing=False) is True)
    check("stopped_form_avatar", sched2.form == ff.FORM_AVATAR)

    # ---- 洗牌袋：普通心情下，前 N 次抽脸必须 N 款各来一次（不重复，全轮到） ----
    n_expr = len(ff.FACE_EXPRESSIONS)
    sched3 = ff.FormScheduler(rng=random.Random(11))
    first_bag = [sched3._pick_variant(ff.FORM_FACE, "calm").split(":", 1)[1] for _ in range(n_expr)]
    check("bag_all_unique", len(set(first_bag)) == n_expr)
    check("bag_covers_all", set(first_bag) == set(ff.FACE_EXPRESSIONS))
    # 第二袋重洗后同样全覆盖
    second_bag = [sched3._pick_variant(ff.FORM_FACE, "calm").split(":", 1)[1] for _ in range(n_expr)]
    check("bag_refills", set(second_bag) == set(ff.FACE_EXPRESSIONS))
    # 蓝眼版已处决：黄底全员黑眼系
    check("bluecute_removed", "bluecute" not in ff.FACE_EXPRESSIONS)

    # ---- 底色与上一次防重；唱标交替 ----
    sched4 = ff.FormScheduler(rng=random.Random(5))
    colors = [sched4._pick_variant(ff.FORM_FACE, "calm").split(":", 1)[0] for _ in range(40)]
    check("color_no_immediate_repeat", all(a != b for a, b in zip(colors, colors[1:])))
    tapes = [sched4._pick_variant(ff.FORM_TAPE, "") for _ in range(10)]
    check("tape_always_red", all(t == "red" for t in tapes))  # 唱标锁经典红，与照片盘中心完全一致

    # ---- 睡意心情：低垂眼族占比明显抬升，但不吞没其他表情 ----
    sched5 = ff.FormScheduler(rng=random.Random(11))
    lidded = sum(
        1 for _ in range(300)
        if sched5._pick_variant(ff.FORM_FACE, "sleepy").split(":", 1)[1] in ff.LIDDED_FAMILY
    )
    check("sleepy_biases_lidded", 0.45 < lidded / 300 < 0.75)

    # ---- 表演模式：节奏 4~7s，出脸概率高于其他形态 ----
    sched6 = ff.FormScheduler(rng=random.Random(9))
    counts = {f: 0 for f in ff.FORMS}
    t = 0.0
    for _ in range(200):
        if sched6.tick(t, playing=True, demo=True):
            counts[sched6.form] += 1
            dur = sched6.until_ts - t
            check("demo_duration_bounds", ff.DEMO_MIN_SEC - 1e-6 <= dur <= ff.DEMO_MAX_SEC + 1e-6)
        t = sched6.until_ts + 0.01
    check("demo_prefers_face", counts[ff.FORM_FACE] > counts[ff.FORM_TAPE])
    check("demo_prefers_face2", counts[ff.FORM_FACE] > counts[ff.FORM_AVATAR])

    # ---- 身份模式：常驻本命形态池、黄族限色、客串到期回归 ----
    sid = ff.FormScheduler(rng=random.Random(31))
    t = 0.0
    seen_id = set()
    for _ in range(40):
        sid.tick(t, playing=True, photo_ready=True, identity=ff.IDENTITY_TURNTABLE)
        seen_id.add(sid.form)
        t = sid.until_ts + 0.01
    check("identity_turntable_pool", seen_id == {ff.FORM_TAPE, ff.FORM_PHOTO})
    # 照片没就绪：只在磁带盘上待着
    sid2 = ff.FormScheduler(rng=random.Random(37))
    seen_np2 = set()
    t = 0.0
    for _ in range(20):
        sid2.tick(t, playing=True, photo_ready=False, identity=ff.IDENTITY_TURNTABLE)
        seen_np2.add(sid2.form)
        t = sid2.until_ts + 0.01
    check("identity_turntable_no_photo", seen_np2 == {ff.FORM_TAPE})
    # 大圆脸身份：永远是脸，底色只出黄族
    sid3 = ff.FormScheduler(rng=random.Random(41))
    t = 0.0
    colors_id = set()
    for _ in range(30):
        sid3.tick(t, playing=True, identity=ff.IDENTITY_FACE)
        check("identity_face_form", sid3.form == ff.FORM_FACE)
        colors_id.add(sid3.variant.split(":", 1)[0])
        t = sid3.until_ts + 0.01
    check("identity_face_yellow_only", colors_id == set(ff.YELLOW_FAMILY))
    # 崽身份：放歌也不离开头像
    sid4 = ff.FormScheduler(rng=random.Random(43))
    t = 0.0
    for _ in range(20):
        sid4.tick(t, playing=True, photo_ready=True, identity=ff.IDENTITY_AVATAR)
        check("identity_avatar_stays", sid4.form == ff.FORM_AVATAR)
        t = sid4.until_ts + 0.01
    # 客串：非本命形态闪现 CAMEO_SEC，到期回本命池
    check("cameo_switches", sid4.cameo(t, photo_ready=True) is True)
    check("cameo_not_home", sid4.form != ff.FORM_AVATAR)
    check("cameo_flag", sid4.in_cameo is True)
    check("cameo_holds", sid4.tick(t + ff.CAMEO_SEC - 0.5, playing=True, identity=ff.IDENTITY_AVATAR) is False)
    sid4.tick(t + ff.CAMEO_SEC + 0.1, playing=True, identity=ff.IDENTITY_AVATAR)
    check("cameo_returns_home", sid4.form == ff.FORM_AVATAR and sid4.in_cameo is False)
    # 待机：唱片机身份停播时仍留在盘上（不弹回头像）；dwell 内不切换
    sid5 = ff.FormScheduler(rng=random.Random(47))
    sid5.tick(0.0, playing=True, photo_ready=True, identity=ff.IDENTITY_TURNTABLE)
    check("identity_idle_stays_on_disc", sid5.tick(1.0, playing=False, identity=ff.IDENTITY_TURNTABLE) is False)
    check("identity_idle_form_disc", sid5.form in (ff.FORM_TAPE, ff.FORM_PHOTO))
    # 未定型（identity=""）：维持旧行为——停播回头像
    check("legacy_still_default", ff.FormScheduler(rng=random.Random(3)).tick(0.0, playing=False) is False)
    # 唱片机不歇班：待机也磁带⇄照片来回切换，每个约 10 秒
    sid6 = ff.FormScheduler(rng=random.Random(59))
    sid6.tick(0.0, playing=False, photo_ready=True, identity=ff.IDENTITY_TURNTABLE)
    t = sid6.until_ts + 0.01
    idle_discs = []
    for _ in range(6):
        changed = sid6.tick(t, playing=False, photo_ready=True, identity=ff.IDENTITY_TURNTABLE)
        check("disc_idle_rotates", changed is True)
        dur = sid6.until_ts - t
        check("disc_idle_dwell", ff.TURNTABLE_DWELL_MIN_SEC - 1e-6 <= dur <= ff.TURNTABLE_DWELL_MAX_SEC + 1e-6)
        idle_discs.append(sid6.form)
        t = sid6.until_ts + 0.01
    check("disc_idle_alternates", set(idle_discs) == {ff.FORM_TAPE, ff.FORM_PHOTO})
    # 大圆脸不歇班：不放歌表情也按 4.5~6s 轮换，前几袋不重样
    sid9 = ff.FormScheduler(rng=random.Random(71))
    sid9.tick(0.0, playing=False, identity=ff.IDENTITY_FACE)
    t = sid9.until_ts + 0.01
    idle_faces = []
    for _ in range(8):
        changed = sid9.tick(t, playing=False, identity=ff.IDENTITY_FACE)
        check("face_idle_rotates", changed is True)
        dur = sid9.until_ts - t
        check("face_idle_dwell", ff.FACE_DWELL_MIN_SEC - 1e-6 <= dur <= ff.FACE_DWELL_MAX_SEC + 1e-6)
        idle_faces.append(sid9.variant.split(":", 1)[1])
        t = sid9.until_ts + 0.01
    check("face_idle_varied", len(set(idle_faces)) == len(idle_faces))
    # 演示窗一关：立即落回本命池，不骑完 demo 分配的旧 dwell
    sid7 = ff.FormScheduler(rng=random.Random(61))
    for _ in range(6):
        sid7.tick(sid7.until_ts + 0.01, playing=True, demo=True, identity=ff.IDENTITY_FACE)
    sid7.tick(sid7.until_ts - 1.0, playing=True, demo=False, identity=ff.IDENTITY_FACE)
    check("demo_off_settles_home", sid7.form == ff.FORM_FACE)
    # 大圆脸身份：表情按 4~5.5s 快节奏轮换（用户点名的节奏）
    sid8 = ff.FormScheduler(rng=random.Random(67))
    t = 0.0
    for _ in range(10):
        sid8.tick(t, playing=True, identity=ff.IDENTITY_FACE)
        dur = sid8.until_ts - t
        check("face_dwell_fast", ff.FACE_DWELL_MIN_SEC - 1e-6 <= dur <= ff.FACE_DWELL_MAX_SEC + 1e-6)
        t = sid8.until_ts + 0.01

    # ---- 幼年随机轮播的底色也收敛到黄族（橙底只保留渲染能力） ----
    sched7 = ff.FormScheduler(rng=random.Random(53))
    legacy_colors = {sched7._pick_variant(ff.FORM_FACE, "calm").split(":", 1)[0] for _ in range(20)}
    check("legacy_face_yellow_only", legacy_colors == set(ff.YELLOW_FAMILY))

    # ---- 帧序列契约：小尺寸渲染保证 smoke 快 ----
    box = 72
    tape = ff.tape_frames(box, "red")
    check("tape_frame_count", len(tape) == ff.TAPE_FRAMES)
    check("tape_frame_size", tape[0].size == (box, box))
    check("tape_non_blank", all(_non_blank(f) for f in (tape[0], tape[len(tape) // 2])))
    check("tape_rotates", tape[0].tobytes() != tape[len(tape) // 2].tobytes())

    for color in ff.FACE_COLORS:
        for expr in ff.FACE_EXPRESSIONS:
            frames = ff.face_frames(box, color, expr, frames=8)
            check(f"face_{color}_{expr}_count", len(frames) == 8)
            check(f"face_{color}_{expr}_non_blank", _non_blank(frames[0]))
    # 眨眼帧与普通帧不同
    frames = ff.face_frames(box, "sphere_yellow", "lidded", frames=32)
    check("face_blinks", frames[1].tobytes() != frames[31].tobytes())

    # ---- 照片黑胶盘：合成渐变图 → 旋转帧非空且逐帧不同；同 key 命中缓存 ----
    from PIL import Image as _Image
    sunset = _Image.new("RGB", (300, 200))
    for y in range(200):
        for x in range(0, 300, 4):
            sunset.putpixel((x, y), (250 - y // 2, 130 - y // 3, 60 + y // 4))
    pf = ff.photo_frames(box, sunset, cache_key="smoke:p1", frames=8)
    check("photo_frame_count", len(pf) == 8)
    check("photo_frame_size", pf[0].size == (box, box))
    check("photo_non_blank", _non_blank(pf[0]))
    check("photo_rotates", pf[0].tobytes() != pf[4].tobytes())
    check("photo_cache_hit", ff.photo_frames(box, sunset, cache_key="smoke:p1", frames=8) is pf)

    # ---- 唱臂覆层：尺寸正确、非空（细线条，阈值 0.5%） ----
    arm = ff.tonearm_overlay(240, 208, 120, 105, 204)
    check("tonearm_size", arm.size == (240, 208))
    arm_opaque = sum(arm.getchannel("A").histogram()[200:])
    check("tonearm_non_blank", arm_opaque > 240 * 208 * 0.005)

    # ---- 抬臂姿态：与落针姿态确实不同、整臂不出屏（右缘两列无不透明像素） ----
    arm_lifted = ff.tonearm_overlay(240, 208, 120, 105, 204, lifted=True)
    check("tonearm_lifted_size", arm_lifted.size == (240, 208))
    lifted_opaque = sum(arm_lifted.getchannel("A").histogram()[200:])
    check("tonearm_lifted_non_blank", lifted_opaque > 240 * 208 * 0.005)
    check("tonearm_lifted_differs", arm_lifted.tobytes() != arm.tobytes())
    edge = arm_lifted.crop((238, 0, 240, 208)).getchannel("A").histogram()
    check("tonearm_lifted_inside", sum(edge[200:]) == 0)

    # ---- frames_for 分派 + 缓存有界 ----
    got, fps = ff.frames_for(ff.FORM_TAPE, "sunset", box)
    check("frames_for_tape", got is not None and fps == ff.TAPE_FPS)
    got, fps = ff.frames_for(ff.FORM_FACE, "insta_orange:sideeye", box)
    check("frames_for_face", got is not None and fps == ff.FACE_FPS)
    got, fps = ff.frames_for(ff.FORM_AVATAR, "", box)
    check("frames_for_avatar_none", got is None and fps == 0.0)
    check("frames_for_bad_variant", ff.frames_for(ff.FORM_FACE, "nonsense", box)[0] is not None)
    check("cache_bounded", len(ff._FRAME_CACHE) <= ff._FRAME_CACHE_LIMIT)

    # ---- frame_at 越界安全 ----
    check("frame_at_wraps", ff.frame_at(tape, 1e6, ff.TAPE_FPS) is not None)

    if failures:
        print("FACE FORMS SMOKE FAILED:", ", ".join(failures))
        return 1
    print("FACE FORMS SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
