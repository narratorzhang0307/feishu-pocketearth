#!/usr/bin/env python3
import json

import chat_agent
import pi_command_daemon


def main():
    original_llm_reply = chat_agent._llm_reply
    original_enabled = chat_agent.ENABLED
    original_urlopen = chat_agent.urllib.request.urlopen
    original_publish_state = pi_command_daemon.publish_state
    original_speak_text = pi_command_daemon.speak_text
    original_cloud_agent = pi_command_daemon.apply_cloud_agent
    original_open_playlist = pi_command_daemon.apply_local_open_playlist
    original_match_city = pi_command_daemon.match_city
    original_catalog = pi_command_daemon.catalog

    spoken = []
    published = []
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps({"text": "“我从资料里接住这句话。”"}).encode("utf-8")

    try:
        def fake_urlopen(request, timeout=0):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse()

        chat_agent.urllib.request.urlopen = fake_urlopen
        rag_reply = original_llm_reply("我正在看马尔克斯，给我一点歌单线索")
        # Later chat cases intentionally exercise the same request hook. Preserve
        # the literary request now so the RAG assertion does not inspect the
        # final, unrelated payload written by a subsequent case.
        rag_request = {
            "url": captured.get("url", ""),
            "payload": dict(captured.get("payload", {})),
        }

        chat_agent._llm_reply = lambda text: "我听见了，先陪你把这句话接住。"
        chat_agent.ENABLED = True

        handled = chat_agent.respond(
            "我正在看马尔克斯，今晚想听点什么",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        handled_spoken_count = len(spoken)
        important_speech_checks = {
            "ordinary_literary": chat_agent.should_speak("我正在看马尔克斯，今晚想听点什么") is False,
            "low_battery": chat_agent.should_speak("手机快没电了，先省点电") is True,
            "battery_enough_question": chat_agent.should_speak("手机电还够吗") is True,
            "battery_home_question": chat_agent.should_speak("手机电量撑得回家吗") is True,
            "battery_runtime_question": chat_agent.should_speak("还能撑多久") is True,
            "save_power_request": chat_agent.should_speak("省点手机电") is True,
            "bare_digit_percent_low_battery": chat_agent.should_speak("只剩5%了") is True,
            "phone_digit_percent_low_battery": chat_agent.should_speak("手机只有10%电了") is True,
            "one_bar_low_battery": chat_agent.should_speak("还有一格电") is True,
            "phone_bar_no_power_low_battery": chat_agent.should_speak("手机只剩一格了") is True,
            "single_digit_low_battery": chat_agent.should_speak("手机个位数了") is True,
            "one_mouth_low_battery": chat_agent.should_speak("只剩一口电了还能陪我到家吗") is True,
            "red_power_low_battery": chat_agent.should_speak("电量红了") is True,
            "phone_yellow_low_battery": chat_agent.should_speak("手机快黄了") is True,
            "low_power_mode": chat_agent.should_speak("低电模式吧") is True,
            "natural_nearly_empty_phone": chat_agent.should_speak("手机要没电了") is True,
            "phone_power_wont_last_home": chat_agent.should_speak("手机电撑不到家了") is True,
            "battery_alarm": chat_agent.should_speak("电量报警了") is True,
            "nearly_power_off": chat_agent.should_speak("快关机了") is True,
            "battery_draining_fast": chat_agent.should_speak("电快耗光了") is True,
            "phone_cannot_last": chat_agent.should_speak("手机撑不住了") is True,
            "battery_amount_question": chat_agent.should_speak("手机还有多少电") is True,
            "battery_reminder_question": chat_agent.should_speak("电量不够的话要不要提醒我") is True,
            "numeric_save_power_low_battery_stays_text": chat_agent.should_speak("电量只剩3%怎么省电") is False,
            "continue_listening_low_battery_stays_text": chat_agent.should_speak("手机没电还要继续听吗") is False,
            "late_way_home": chat_agent.should_speak("有点晚了，我准备打车回家") is True,
            "outdoor_followed_can_speak": chat_agent.should_speak("我在路上感觉被跟着") is True,
            "outdoor_followed_quiet_stays_text": chat_agent.should_speak("我在路上感觉被跟着只写屏") is False,
            "location_log_privacy_stays_text": chat_agent.should_speak("出门了不要把定位写日志") is False,
            "nearby_safety": chat_agent.should_speak("周围安全吗，我有点不安心") is True,
            "transit_help": chat_agent.should_speak("最近有地铁站吗") is True,
            "practical_shelter": chat_agent.should_speak("找个地方躲雨，再充会电") is True,
            "bathroom_help": chat_agent.should_speak("洗手间在哪") is True,
            "tts_policy_question": chat_agent.should_speak("哪些回复会走语音") is True,
            "tts_readout_question": chat_agent.should_speak("哪些回复会朗读") is True,
            "bystander_tts_policy_stays_text": chat_agent.should_speak("旁边有人会不会出声") is False,
            "external_audio_check_stays_text": chat_agent.should_speak("现在适合外放吗") is False,
            "audio_mode_question_stays_text": chat_agent.should_speak("现在是静音模式吗") is False,
            "audio_mode_release_stays_text": chat_agent.should_speak("可以出声了") is False,
            "external_audio_phrase_stays_text": chat_agent.should_speak("方不方便外放") is False,
            "earbud_readout_question_stays_text": chat_agent.should_speak("戴着耳机可以念吗") is False,
            "no_earbud_readout_question_stays_text": chat_agent.should_speak("没戴耳机能朗读吗") is False,
            "earbud_connected_readout_question_stays_text": chat_agent.should_speak("耳机连着能读出来吗") is False,
            "sudden_voice_check_stays_text": chat_agent.should_speak("会不会突然念出来") is False,
            "mute_guard_stays_text": chat_agent.should_speak("播放会不会绕过静音") is False,
            "soft_mute_guard_stays_text": chat_agent.should_speak("soft_mute 是不是还开着") is False,
            "current_track_question_stays_text": chat_agent.should_speak("现在放的什么歌") is False,
            "previous_heard_track_stays_text": chat_agent.should_speak("我刚刚听到的那首是什么") is False,
            "current_sunset_city_stays_text": chat_agent.should_speak("现在是哪座城市在日落") is False,
            "current_ringing_track_stays_text": chat_agent.should_speak("此刻是哪首在响") is False,
            "quiet_current_track_write_chars_stays_text": chat_agent.should_speak("旁边有人我想问现在什么歌只写字") is False,
            "route_question_stays_text": chat_agent.should_speak("今天电台怎么走") is False,
            "previous_city_plain_where_stays_text": chat_agent.should_speak("刚才那座城市是哪儿") is False,
            "next_city_plain_reason_stays_text": chat_agent.should_speak("为什么下一站选这座城") is False,
            "natural_next_stop_where_stays_text": chat_agent.should_speak("下一站去哪儿") is False,
            "natural_trip_progress_stays_text": chat_agent.should_speak("这趟电台走到哪了") is False,
            "quiet_route_write_chars_stays_text": chat_agent.should_speak("附近有人我能问你路线吗只写字") is False,
            "quiet_next_stop_write_chars_stays_text": chat_agent.should_speak("没戴耳机查一下下一站只写字") is False,
            "city_fit_songs_stays_text": chat_agent.should_speak("这座城市适合哪几首歌") is False,
            "later_city_playlist_glance_stays_text": chat_agent.should_speak("后面的城市歌单能先看一眼吗") is False,
            "quiet_playlist_write_chars_stays_text": chat_agent.should_speak("附近有人问歌单只写字") is False,
            "song_story_question_stays_text": chat_agent.should_speak("这首歌讲什么") is False,
            "city_story_question_stays_text": chat_agent.should_speak("讲讲这座城市") is False,
            "last_action_question_stays_text": chat_agent.should_speak("上一条成功了吗") is False,
            "last_action_variant_stays_text": chat_agent.should_speak("上一轮怎么样") is False,
            "last_skill_variant_stays_text": chat_agent.should_speak("刚才调了哪个skill") is False,
            "last_heard_question_stays_text": chat_agent.should_speak("你刚才听成什么了") is False,
            "last_heard_variant_stays_text": chat_agent.should_speak("上条我让你干嘛") is False,
            "cancel_previous_stays_text": chat_agent.should_speak("取消刚才") is False,
            "tv_source_cancel_stays_text": chat_agent.should_speak("刚才那句是电视里的别执行") is False,
            "not_my_voice_cancel_stays_text": chat_agent.should_speak("上一句不是我说的别连热点") is False,
            "misspoke_stays_text": chat_agent.should_speak("我刚才说错了") is False,
            "queue_stuck_stays_text": chat_agent.should_speak("命令队列卡住了吗") is False,
            "startup_recovery_stays_text": chat_agent.should_speak("断电重启后会自己恢复吗") is False,
            "autostart_stays_text": chat_agent.should_speak("开机自启正常吗") is False,
            "service_status_stays_text": chat_agent.should_speak("后台服务正常吗") is False,
            "screen_button_status_stays_text": chat_agent.should_speak("按钮没反应") is False,
            "whisplay_status_card_stays_text": chat_agent.should_speak("Whisplay 状态卡怎么看") is False,
            "status_card_current_stays_text": chat_agent.should_speak("状态卡现在写着什么") is False,
            "whisplay_refresh_stays_text": chat_agent.should_speak("Whisplay还在刷新吗") is False,
            "screen_stuck_stays_text": chat_agent.should_speak("屏幕是不是卡住了") is False,
            "avatar_motion_stays_text": chat_agent.should_speak("头像还在动吗") is False,
            "little_avatar_stuck_stays_text": chat_agent.should_speak("那个小人怎么不动了") is False,
            "hotspot_status_card_stays_text": chat_agent.should_speak("如果没连上热点状态卡会写什么") is False,
            "current_network_presence_stays_text": chat_agent.should_speak("现在有网吗") is False,
            "current_network_loss_stays_text": chat_agent.should_speak("现在是不是没网") is False,
            "current_network_alive_stays_text": chat_agent.should_speak("网还活着吗") is False,
            "current_casual_tether_status_stays_text": chat_agent.should_speak("现在蹭的是谁的网") is False,
            "hotspot_stability_stays_text": chat_agent.should_speak("热点现在稳吗") is False,
            "wifi_health_stays_text": chat_agent.should_speak("WiFi现在好吗") is False,
            "portable_network_question_stays_text": chat_agent.should_speak("出门了还能连得上吗") is False,
            "status_card_action_failure_stays_text": chat_agent.should_speak("状态卡会不会显示命令失败") is False,
            "screen_city_track_status_stays_text": chat_agent.should_speak("屏幕上的城市和歌曲是什么意思") is False,
            "local_control_api_stays_text": chat_agent.should_speak("手机能控制电台吗") is False,
            "local_control_phone_panel_stays_text": chat_agent.should_speak("手机面板会不会暴露到外网") is False,
            "local_control_public_exposure_stays_text": chat_agent.should_speak("你暴露公网了吗") is False,
            "local_api_public_playback_stays_text": chat_agent.should_speak("本地控制 API 会不会外网直接播放") is False,
            "capability_ready_stays_text": chat_agent.should_speak("哪些能力已经就绪") is False,
            "capability_pending_stays_text": chat_agent.should_speak("还有哪些模块 pending") is False,
            "voice_doctor_stays_text": chat_agent.should_speak("麦克风正常吗") is False,
            "voice_heard_me_stays_text": chat_agent.should_speak("你听得到我吗") is False,
            "quiet_voice_heard_me_stays_text": chat_agent.should_speak("我声音太小你听得见吗") is False,
            "far_voice_heard_me_stays_text": chat_agent.should_speak("我离远一点你还能听见吗") is False,
            "noisy_voice_heard_me_stays_text": chat_agent.should_speak("环境太吵你还听得清吗") is False,
            "wind_voice_heard_me_stays_text": chat_agent.should_speak("风声很大你能听清吗") is False,
            "missed_sentence_voice_status_stays_text": chat_agent.should_speak("我刚才那句是不是没收进去") is False,
            "missed_voice_status_stays_text": chat_agent.should_speak("你刚才是不是没收到我的声音") is False,
            "current_understand_me_stays_text": chat_agent.should_speak("现在能听懂我吗") is False,
            "previous_understood_me_stays_text": chat_agent.should_speak("你听懂我刚才说的吗") is False,
            "previous_heard_me_inverse_stays_text": chat_agent.should_speak("刚刚我说的你听见了吗") is False,
            "previous_clear_inverse_stays_text": chat_agent.should_speak("刚刚那句话你听清了吗") is False,
            "previous_recognized_stays_text": chat_agent.should_speak("刚才识别到了吗") is False,
            "previous_sentence_recognized_stays_text": chat_agent.should_speak("刚才那句识别了吗") is False,
            "wake_issue_stays_text": chat_agent.should_speak("唤醒词没反应") is False,
            "wake_window_stays_text": chat_agent.should_speak("唤醒后多久说话") is False,
            "partial_utterance_stays_text": chat_agent.should_speak("没听完整会不会执行半句") is False,
            "half_heard_wrong_press_stays_text": chat_agent.should_speak("如果只听到半句会不会按错") is False,
            "half_sentence_action_guard_stays_text": chat_agent.should_speak("半句话会不会乱跑动作") is False,
            "paused_half_utterance_stays_text": chat_agent.should_speak("唤醒后我停顿一下你会不会执行半句话") is False,
            "wake_source_no_name_stays_text": chat_agent.should_speak("没叫你名字别执行") is False,
            "wake_source_bystander_stays_text": chat_agent.should_speak("旁边人在聊天别当成命令") is False,
            "wake_source_partial_stays_text": chat_agent.should_speak("如果只听到半截别下发命令") is False,
            "outdoor_preflight_stays_text": chat_agent.should_speak("出门前帮我检查一下") is False,
            "portable_status_stays_text": chat_agent.should_speak("我能带你出去吗") is False,
            "frost_dialog_stays_text": chat_agent.should_speak("Frost 对话框会回复吗") is False,
            "frost_message_persistence_stays_text": chat_agent.should_speak("用户发送后消息会不会消失") is False,
            "frost_message_retained_stays_text": chat_agent.should_speak("我发出去的消息还会留在对话里吗") is False,
            "frost_phrase_persistence_stays_text": chat_agent.should_speak("我发出去的话会不会不见") is False,
            "frost_reply_swallow_stays_text": chat_agent.should_speak("你回复的时候会不会把我刚发的那条吞掉") is False,
            "frost_short_message_swallow_stays_text": chat_agent.should_speak("我发完消息你别吞") is False,
            "frost_short_reply_cover_stays_text": chat_agent.should_speak("你回我时不要盖掉我刚发的那条") is False,
            "dialog_done_mainline_stays_text": chat_agent.should_speak("对话完还能回二十四小时主线吗") is False,
            "chat_done_mainline_present_stays_text": chat_agent.should_speak("聊完之后主线还在吗") is False,
            "question_no_stop_radio_stays_text": chat_agent.should_speak("我问个问题别把24小时电台停掉") is False,
            "playlist_question_no_pause_stays_text": chat_agent.should_speak("问歌单的时候别停歌") is False,
            "playback_pause_continuity_stays_text": chat_agent.should_speak("暂停后能不能接着刚才那首") is False,
            "playback_no_execute_question_stays_text": chat_agent.should_speak("别暂停，只问暂停后能不能继续刚才那首") is False,
            "frost_tts_policy_stays_text": chat_agent.should_speak("Frost 回复会不会朗读") is False,
            "important_words_tts_policy_stays_text": chat_agent.should_speak("重要的话会不会读出来") is False,
            "readout_vs_screen_policy_stays_text": chat_agent.should_speak("哪些回复会读出来哪些只写屏") is False,
            "bystander_important_reply_stays_text": chat_agent.should_speak("旁边有人时重要提醒也别念吗") is False,
            "spaced_pi_tts_trigger_stays_text": chat_agent.should_speak("什么情况会走pi tts") is False,
            "frost_missing_tts_stays_text": chat_agent.should_speak("Frost 为什么没朗读") is False,
            "ordinary_question_speaker_stays_text": chat_agent.should_speak("普通问题会不会突然从喇叭出来") is False,
            "chat_no_interrupt_stays_text": chat_agent.should_speak("普通聊天会打断电台吗") is False,
            "answer_no_surprise_play_stays_text": chat_agent.should_speak("你回答问题会不会突然播歌") is False,
            "frost_branch_no_interrupt_stays_text": chat_agent.should_speak("弗洛斯特支线会不会打断播放") is False,
            "pi_tts_trigger_stays_text": chat_agent.should_speak("/api/pi-tts 什么时候调用") is False,
            "action_status_stays_text": chat_agent.should_speak("工具调用结果会不会写回屏幕") is False,
            "action_failure_status_stays_text": chat_agent.should_speak("技能失败后状态会写屏吗") is False,
            "duplicate_command_status_stays_text": chat_agent.should_speak("你会不会重复下发命令") is False,
            "command_sent_status_stays_text": chat_agent.should_speak("刚才那条命令发出去了吗") is False,
            "current_action_stuck_stays_text": chat_agent.should_speak("这个动作现在卡在哪") is False,
            "tool_midrun_disconnect_stays_text": chat_agent.should_speak("工具跑一半断了会显示吗") is False,
            "bare_midrun_disconnect_state_stays_text": chat_agent.should_speak("跑到一半断了状态还在屏幕吗") is False,
            "duplicate_sent_once_stays_text": chat_agent.should_speak("你是不是重复发了一次命令") is False,
            "repeat_pi_dispatch_status_stays_text": chat_agent.should_speak("这个动作会不会重复发给 Pi") is False,
            "previous_sent_to_pi_stays_text": chat_agent.should_speak("上一条有没有发到树莓派") is False,
            "device_received_previous_stays_text": chat_agent.should_speak("树莓派收到刚才那条了吗") is False,
            "dont_resend_to_pi_stays_text": chat_agent.should_speak("别再发给树莓派一遍") is False,
            "tool_finish_writeback_stays_text": chat_agent.should_speak("工具跑完有没有把结果写回来") is False,
            "midrun_tool_status_stays_text": chat_agent.should_speak("工具跑到一半卡住会不会把状态留屏幕") is False,
            "action_router_stays_text": chat_agent.should_speak("这句话会走哪个技能") is False,
            "no_tool_call_dispatch_router_stays_text": chat_agent.should_speak("不要调用工具，只想知道会不会下发动作") is False,
            "status_query_no_tool_call_stays_text": chat_agent.should_speak("我只是问能不能查状态，不要真的调用工具") is False,
            "direct_pi_dispatch_router_stays_text": chat_agent.should_speak("这句话会不会直接下发到树莓派") is False,
            "direct_pi_send_router_stays_text": chat_agent.should_speak("这句话会不会直接发给树莓派") is False,
            "direct_action_router_stays_text": chat_agent.should_speak("这句话会不会直接调动作") is False,
            "direct_pi_short_router_stays_text": chat_agent.should_speak("这句会下发到Pi吗") is False,
            "ordinary_chat_action_router_stays_text": chat_agent.should_speak("普通聊天会不会被当成动作") is False,
            "status_query_real_action_router_stays_text": chat_agent.should_speak("问状态会不会真的执行动作") is False,
            "previous_route_play_or_chat_stays_text": chat_agent.should_speak("刚才那个路由走的是播放还是聊天") is False,
            "judge_skill_before_action_stays_text": chat_agent.should_speak("你会先判断skill再动手吗") is False,
            "low_confidence_router_stays_text": chat_agent.should_speak("低置信度会不会乱播") is False,
            "asr_confidence_screen_stays_text": chat_agent.should_speak("ASR置信度低会不会先写屏") is False,
            "partial_heard_ask_first_stays_text": chat_agent.should_speak("听到一半不要执行先问我") is False,
            "ask_before_action_stays_text": chat_agent.should_speak("动作执行前会先确认吗") is False,
            "loud_background_mishear_stays_text": chat_agent.should_speak("如果背景音乐太大识别错了会不会切歌") is False,
            "uncertain_router_stays_text": chat_agent.should_speak("没把握就先别动") is False,
            "vague_command_router_stays_text": chat_agent.should_speak("别把模糊命令直接执行") is False,
            "unclear_no_action_stays_text": chat_agent.should_speak("我说得不清楚先别跑动作") is False,
            "ordinary_chat_not_song_stays_text": chat_agent.should_speak("会不会把普通聊天当成点歌") is False,
            "misheard_no_dispatch_stays_text": chat_agent.should_speak("如果没听懂会不会直接下命令") is False,
            "natural_language_question_stays_text": chat_agent.should_speak("你能听懂自然语言吗") is False,
            "no_keyword_question_stays_text": chat_agent.should_speak("不用关键词你能懂吗") is False,
            "memory_boundary_stays_text": chat_agent.should_speak("下次还记得我喜欢什么歌吗") is False,
            "context_retention_stays_text": chat_agent.should_speak("上下文会保留多久") is False,
            "continue_last_sentence_stays_text": chat_agent.should_speak("你能接着上一句聊吗") is False,
            "location_memory_stays_text": chat_agent.should_speak("会不会保存我的位置") is False,
            "chat_log_memory_stays_text": chat_agent.should_speak("聊天记录会不会长期保存") is False,
            "ambient_scan_stays_text": chat_agent.should_speak("扫描此刻会保存照片吗") is False,
            "ambient_manual_consent_stays_text": chat_agent.should_speak("没经过我同意别开摄像头") is False,
            "ambient_no_button_photo_stays_text": chat_agent.should_speak("没有我按按钮别拍照") is False,
            "ambient_no_auto_photo_stays_text": chat_agent.should_speak("别自动拍环境") is False,
            "ambient_secret_photo_stays_text": chat_agent.should_speak("环境扫描会不会偷偷拍") is False,
            "ambient_no_cloud_photo_stays_text": chat_agent.should_speak("别把环境照片上传云端") is False,
            "ambient_tuning_stays_text": chat_agent.should_speak("环境感知会自动调音吗") is False,
            "ambient_plate_privacy_stays_text": chat_agent.should_speak("环境扫描会不会识别车牌") is False,
            "ambient_screen_text_privacy_stays_text": chat_agent.should_speak("相机会不会读我屏幕上的文字") is False,
            "ambient_id_privacy_stays_text": chat_agent.should_speak("扫描此刻会不会看身份证号") is False,
            "ambient_qr_privacy_stays_text": chat_agent.should_speak("会不会识别二维码") is False,
            "ambient_doorplate_privacy_stays_text": chat_agent.should_speak("会不会记住门牌号") is False,
            "privacy_boundary": chat_agent.should_speak("你会不会一直拍我，或者识别人脸") is True,
            "microphone_privacy_stays_text": chat_agent.should_speak("麦克风会一直录音吗") is False,
            "failure_guardrail": chat_agent.should_speak("调用失败会不会乱点") is True,
            "missing_skill_casual_stays_text": chat_agent.should_speak("如果没有这个skill会怎样") is False,
            "missing_tool_no_action_stays_text": chat_agent.should_speak("工具缺了别自己装，只问怎么处理") is False,
            "plugin_no_call_fallback_stays_text": chat_agent.should_speak("别调用插件，只问插件没装会怎么兜底") is False,
            "missing_credential_no_action_stays_text": chat_agent.should_speak("凭证缺了别执行，只问怎么兜底") is False,
            "unavailable_model_no_action_stays_text": chat_agent.should_speak("模型不可用别乱点，只问会怎么兜底") is False,
            "missing_permission_no_action_stays_text": chat_agent.should_speak("没有权限别乱跑，只问会怎么兜底") is False,
            "silent_override": chat_agent.should_speak("别出声，我手机快没电了，文字回我") is False,
            "quiet_battery_runtime_override": chat_agent.should_speak("文字告诉我手机还能撑多久") is False,
            "quiet_digit_percent_override": chat_agent.should_speak("文字告诉我只剩5%怎么办") is False,
            "quiet_single_digit_override": chat_agent.should_speak("文字告诉我手机个位数了") is False,
            "quiet_last_bit_battery_override": chat_agent.should_speak("手机剩最后一点电了别突然出声") is False,
            "quiet_battery_draining_override": chat_agent.should_speak("文字告诉我电快耗光了怎么办") is False,
            "quiet_low_battery_override": chat_agent.should_speak("小声告诉我手机快没电了怎么办") is False,
            "soft_voice_way_home_override": chat_agent.should_speak("轻声回复我夜路怎么走") is False,
            "lower_voice_safety_override": chat_agent.should_speak("压低声音说周围安全吗") is False,
            "whisper_low_battery_override": chat_agent.should_speak("悄悄告诉我手机快没电了怎么办") is False,
            "quietly_way_home_override": chat_agent.should_speak("默默告诉我夜路怎么走") is False,
            "no_disturb_low_battery_override": chat_agent.should_speak("别惊动别人，我手机快没电了怎么办") is False,
            "no_alarm_low_battery_override": chat_agent.should_speak("别惊扰别人，我手机快没电了怎么办") is False,
            "no_bother_way_home_override": chat_agent.should_speak("别打搅别人，夜路怎么走") is False,
            "no_affect_safety_override": chat_agent.should_speak("不要影响旁边的人，周围安全吗") is False,
            "inverted_public_listener_override": chat_agent.should_speak("周围的人别听见，夜路怎么走") is False,
            "outdoor_text_override": chat_agent.should_speak("只在屏幕上告诉我附近有地铁站吗") is False,
            "tts_policy_text_override": chat_agent.should_speak("只在屏幕上告诉我哪些回复会朗读") is False,
            "screen_only_override": chat_agent.should_speak("只在屏幕上告诉我什么时候会出声") is False,
        }
        before_low_battery_tts_spoken = len(spoken)
        low_battery_tts_handled = chat_agent.respond(
            "手机快没电了，先省点电",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        low_battery_tts_spoken_count = len(spoken) - before_low_battery_tts_spoken
        before_numeric_low_battery_tts_spoken = len(spoken)
        before_numeric_low_battery_tts_published = len(published)
        numeric_low_battery_tts_handled = chat_agent.respond(
            "只剩5%了",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        numeric_low_battery_tts_spoken_count = len(spoken) - before_numeric_low_battery_tts_spoken
        numeric_low_battery_tts_published = published[before_numeric_low_battery_tts_published:]
        before_way_home_tts_spoken = len(spoken)
        way_home_tts_handled = chat_agent.respond(
            "有点晚了，我准备打车回家",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        way_home_tts_spoken_count = len(spoken) - before_way_home_tts_spoken
        before_outdoor_tts_spoken = len(spoken)
        outdoor_tts_handled = chat_agent.respond(
            "周围安全吗，我想找个地方躲雨",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        outdoor_tts_spoken_count = len(spoken) - before_outdoor_tts_spoken
        before_privacy_tts_spoken = len(spoken)
        privacy_tts_handled = chat_agent.respond(
            "你会不会一直拍我，或者识别人脸",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        privacy_tts_spoken_count = len(spoken) - before_privacy_tts_spoken
        before_failure_tts_spoken = len(spoken)
        failure_tts_handled = chat_agent.respond(
            "调用失败会不会乱点",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        failure_tts_spoken_count = len(spoken) - before_failure_tts_spoken
        before_tts_policy_spoken = len(spoken)
        tts_policy_handled = chat_agent.respond(
            "哪些回复会走语音",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        tts_policy_spoken_count = len(spoken) - before_tts_policy_spoken
        before_bystander_tts_policy_spoken = len(spoken)
        before_bystander_tts_policy_published = len(published)
        bystander_tts_policy_handled = chat_agent.respond(
            "旁边有人会不会出声",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        bystander_tts_policy_spoken_count = len(spoken) - before_bystander_tts_policy_spoken
        bystander_tts_policy_published = published[before_bystander_tts_policy_published:]
        before_silent_spoken = len(spoken)
        before_silent_published = len(published)
        silent_handled = chat_agent.respond(
            "别出声，我手机快没电了，文字回我就行",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        silent_spoken_count = len(spoken) - before_silent_spoken
        silent_published = published[before_silent_published:]
        before_no_talk_spoken = len(spoken)
        no_talk_handled = chat_agent.respond(
            "不用说话，只打字回我，我今晚只想看文字",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        no_talk_spoken_count = len(spoken) - before_no_talk_spoken
        before_screen_only_spoken = len(spoken)
        screen_only_handled = chat_agent.respond(
            "只在屏幕上回我，不要朗读，我有点累",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        screen_only_spoken_count = len(spoken) - before_screen_only_spoken
        before_screen_light_spoken = len(spoken)
        before_screen_light_published = len(published)
        screen_light_handled = chat_agent.respond(
            "屏幕亮一下就行，发屏幕上就好，别说",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        screen_light_spoken_count = len(spoken) - before_screen_light_spoken
        screen_light_published = published[before_screen_light_published:]
        before_shush_spoken = len(spoken)
        before_shush_published = len(published)
        shush_handled = chat_agent.respond(
            "嘘一下，我现在不方便听声音",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        shush_spoken_count = len(spoken) - before_shush_spoken
        shush_published = published[before_shush_published:]
        before_do_not_bother_spoken = len(spoken)
        before_do_not_bother_published = len(published)
        do_not_bother_handled = chat_agent.respond(
            "别吵我了，我现在只能看屏幕",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        do_not_bother_spoken_count = len(spoken) - before_do_not_bother_spoken
        do_not_bother_published = published[before_do_not_bother_published:]
        before_child_sleep_spoken = len(spoken)
        before_child_sleep_published = len(published)
        child_sleep_handled = chat_agent.respond(
            "孩子刚睡着不要响",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        child_sleep_spoken_count = len(spoken) - before_child_sleep_spoken
        child_sleep_published = published[before_child_sleep_published:]
        before_no_external_audio_spoken = len(spoken)
        before_no_external_audio_published = len(published)
        no_external_audio_handled = chat_agent.respond(
            "别外放，也别出语音，文字就行",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        no_external_audio_spoken_count = len(spoken) - before_no_external_audio_spoken
        no_external_audio_published = published[before_no_external_audio_published:]
        before_private_readout_spoken = len(spoken)
        before_private_readout_published = len(published)
        private_readout_handled = chat_agent.respond(
            "别把我的话念出来",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        private_readout_spoken_count = len(spoken) - before_private_readout_spoken
        private_readout_published = published[before_private_readout_published:]
        before_speaker_device_spoken = len(spoken)
        before_speaker_device_published = len(published)
        speaker_device_handled = chat_agent.respond(
            "别从喇叭放出来，也别用扬声器",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        speaker_device_spoken_count = len(spoken) - before_speaker_device_spoken
        speaker_device_published = published[before_speaker_device_published:]
        before_private_listener_spoken = len(spoken)
        before_private_listener_published = len(published)
        private_listener_handled = chat_agent.respond(
            "别让旁边人听见，我现在只能看屏幕",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        private_listener_spoken_count = len(spoken) - before_private_listener_spoken
        private_listener_published = published[before_private_listener_published:]
        before_public_listener_spoken = len(spoken)
        before_public_listener_published = len(published)
        public_listener_handled = chat_agent.respond(
            "别让司机听到，也不要让乘客听见",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        public_listener_spoken_count = len(spoken) - before_public_listener_spoken
        public_listener_published = published[before_public_listener_published:]
        before_venue_listener_spoken = len(spoken)
        before_venue_listener_published = len(published)
        venue_listener_handled = chat_agent.respond(
            "别让店员听见，也不要让服务员听到",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        venue_listener_spoken_count = len(spoken) - before_venue_listener_spoken
        venue_listener_published = published[before_venue_listener_published:]
        before_quiet_important_spoken = len(spoken)
        before_quiet_important_published = len(published)
        quiet_important_handled = chat_agent.respond(
            "小声告诉我手机快没电了怎么办",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        quiet_important_spoken_count = len(spoken) - before_quiet_important_spoken
        quiet_important_published = published[before_quiet_important_published:]
        before_whisper_important_spoken = len(spoken)
        before_whisper_important_published = len(published)
        whisper_important_handled = chat_agent.respond(
            "悄悄告诉我手机快没电了怎么办",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        whisper_important_spoken_count = len(spoken) - before_whisper_important_spoken
        whisper_important_published = published[before_whisper_important_published:]
        before_public_quiet_important_spoken = len(spoken)
        before_public_quiet_important_published = len(published)
        public_quiet_important_handled = chat_agent.respond(
            "别惊扰别人，我手机快没电了怎么办",
            speak_fn=lambda text, *args, **kwargs: spoken.append(text) or True,
            publish_fn=lambda **state: published.append(state),
        )
        public_quiet_important_spoken_count = len(spoken) - before_public_quiet_important_spoken
        public_quiet_important_published = published[before_public_quiet_important_published:]

        chat_agent._llm_reply = lambda text: ""
        fallback = chat_agent.reply_for("信号不好的时候你还在吗")
        silent_fallback = chat_agent.reply_for("别出声，我今天有点累，文字回我")
        digit_percent_low_battery_fallback = chat_agent.reply_for("只剩5%了")
        phone_percent_low_battery_fallback = chat_agent.reply_for("手机只有10%电了")
        arabic_power_point_low_battery_fallback = chat_agent.reply_for("我手机只剩8个电了")
        chinese_power_point_low_battery_fallback = chat_agent.reply_for("手机剩五个点了")
        one_bar_low_battery_fallback = chat_agent.reply_for("还有一格电")
        phone_two_bar_no_power_fallback = chat_agent.reply_for("手机就剩两格了")
        phone_one_bar_no_power_fallback = chat_agent.reply_for("手机只剩一格了")
        one_mouth_low_battery_fallback = chat_agent.reply_for("只剩一口电了还能陪我到家吗")
        single_digit_low_battery_fallback = chat_agent.reply_for("手机个位数了")
        red_power_low_battery_fallback = chat_agent.reply_for("电量红了")
        phone_yellow_low_battery_fallback = chat_agent.reply_for("手机快黄了")
        low_power_mode_fallback = chat_agent.reply_for("低电模式吧")
        natural_nearly_empty_phone_fallback = chat_agent.reply_for("手机要没电了")
        phone_power_wont_last_home_fallback = chat_agent.reply_for("手机电撑不到家了")
        battery_alarm_fallback = chat_agent.reply_for("电量报警了")
        nearly_power_off_fallback = chat_agent.reply_for("快关机了")
        battery_draining_fallback = chat_agent.reply_for("电快耗光了")
        phone_cannot_last_fallback = chat_agent.reply_for("手机撑不住了")
        battery_amount_fallback = chat_agent.reply_for("手机还有多少电")
        battery_reminder_fallback = chat_agent.reply_for("电量不够的话要不要提醒我")
        bare_percent_low_battery_runtime_fallback = chat_agent.reply_for("先别播歌，告诉我10%电还能听多久")
        low_battery_no_reminder_fallback = chat_agent.reply_for("不要提醒，只问低电量会不会自动停播")
        low_battery_auto_stop_fallback = chat_agent.reply_for("低电量会不会自动停播")
        low_battery_continuous_play_fallback = chat_agent.reply_for("我电量低你会不会还一直播放")
        low_battery_no_surprise_play_fallback = chat_agent.reply_for("省电的时候别突然放歌")
        low_battery_no_song_fallback = chat_agent.reply_for("快没电了别放歌只告诉我还能撑多久")
        low_battery_continue_listening_fallback = chat_agent.reply_for("手机没电还要继续听吗")
        low_battery_numeric_save_power_fallback = chat_agent.reply_for("电量只剩3%怎么省电")
        red_power_playback_policy_fallback = chat_agent.reply_for("手机红电了你会不会乱播")
        natural_nearly_empty_playback_policy_fallback = chat_agent.reply_for("手机要没电了别突然放歌")
        battery_alarm_playback_policy_fallback = chat_agent.reply_for("电量报警了会不会还播放")
        low_battery_auto_stop_speak = chat_agent.should_speak("低电量会不会自动停播")
        low_battery_continuous_play_speak = chat_agent.should_speak("我电量低你会不会还一直播放")
        low_battery_no_surprise_play_speak = chat_agent.should_speak("省电的时候别突然放歌")
        natural_nearly_empty_playback_speak = chat_agent.should_speak("手机要没电了别突然放歌")
        quiet_low_battery_fallback = chat_agent.reply_for("文字告诉我手机还能撑多久")
        quiet_low_battery_reminder_fallback = chat_agent.reply_for("如果电不够能不能只写屏提醒")
        quiet_digit_percent_fallback = chat_agent.reply_for("文字告诉我只剩5%怎么办")
        quiet_phone_power_point_fallback = chat_agent.reply_for("我手机只有五个点电了，别出声告诉我怎么办")
        quiet_single_digit_fallback = chat_agent.reply_for("文字告诉我手机个位数了")
        quiet_last_bit_battery_fallback = chat_agent.reply_for("手机剩最后一点电了别突然出声")
        quiet_battery_draining_fallback = chat_agent.reply_for("文字告诉我电快耗光了怎么办")
        quiet_drained_battery_text_fallback = chat_agent.reply_for("电快没了只写字告诉我怎么办")
        quiet_important_fallback = chat_agent.reply_for("轻声回复我夜路怎么走")
        whisper_important_fallback = chat_agent.reply_for("默默告诉我夜路怎么走")
        public_quiet_important_fallback = chat_agent.reply_for("不要打扰别人，夜路怎么走")
        quiet_outdoor_fallback = chat_agent.reply_for("只在屏幕上告诉我附近有地铁站吗")
        portable_charge_fallback = chat_agent.reply_for("哪里能借充电宝")
        no_action_safety_fallback = chat_agent.reply_for("别打车，只问附近安全吗")
        no_action_subway_fallback = chat_agent.reply_for("不要导航，只问地铁口在哪里")
        no_action_convenience_fallback = chat_agent.reply_for("不要找店，只问附近有没有便利店")
        place_action_boundary_no_nav_fallback = chat_agent.reply_for("只想问附近有没有厕所别导航")
        place_action_boundary_terse_no_nav_fallback = chat_agent.reply_for("附近有厕所吗别导航")
        place_action_boundary_inverted_no_nav_fallback = chat_agent.reply_for("别把附近厕所当导航")
        place_action_boundary_policy_fallback = chat_agent.reply_for("我说去地铁站你会直接导航吗")
        quiet_charge_spot_fallback = chat_agent.reply_for("这附近哪里能充电只显示")
        quiet_powerbank_fallback = chat_agent.reply_for("哪里能借充电宝别念出来")
        quiet_rest_spot_fallback = chat_agent.reply_for("我想找个地方坐会儿只写屏")
        quiet_public_rain_shelter_fallback = chat_agent.reply_for("我没带伞，旁边有人别出声哪里能躲雨")
        outdoor_followed_fallback = chat_agent.reply_for("我在路上感觉被跟着")
        outdoor_followed_quiet_fallback = chat_agent.reply_for("我在路上感觉被跟着只写屏")
        location_log_privacy_fallback = chat_agent.reply_for("出门了不要把定位写日志")
        quiet_portable_speaks = (
            chat_agent.should_speak("这附近哪里能充电只显示"),
            chat_agent.should_speak("哪里能借充电宝别念出来"),
            chat_agent.should_speak("我想找个地方坐会儿只写屏"),
            chat_agent.should_speak("我没带伞，旁边有人别出声哪里能躲雨"),
        )
        quiet_no_earbuds_screen_fallback = chat_agent.reply_for("我现在没戴耳机你只写屏幕可以吗")
        subway_text_only_fallback = chat_agent.reply_for("我在地铁上能不能只打字")
        quiet_failure_guardrail_fallback = chat_agent.reply_for("文字告诉我调用失败会不会乱点")
        quiet_failed_tool_readout_fallback = chat_agent.reply_for("工具挂了别念出来")
        quiet_failed_skill_readout_fallback = chat_agent.reply_for("技能失败别朗读")
        quiet_failed_call_type_fallback = chat_agent.reply_for("调用失败只打字")
        quiet_failure_screen_view_fallback = chat_agent.reply_for("失败原因屏幕上看就行")
        quiet_run_failure_broadcast_fallback = chat_agent.reply_for("没跑通也别播报")
        quiet_previous_failure_no_speech_fallback = chat_agent.reply_for("刚才失败了先别说话")
        quiet_public_failure_retry_fallback = chat_agent.reply_for("周围有人，技能失败了别读出来会不会一直重试")
        quiet_public_failure_retry_speak = chat_agent.should_speak("周围有人，技能失败了别读出来会不会一直重试")
        missing_skill_casual_fallback = chat_agent.reply_for("如果没有这个skill会怎样")
        missing_skill_casual_speak = chat_agent.should_speak("如果没有这个skill会怎样")
        quiet_prefixed_status_phrases = (
            "别出声告诉我现在播什么歌",
            "不要念出来现在这首是什么",
            "只看屏幕现在这首是谁唱的",
            "安静点告诉我现在在哪个城市",
            "别播报这趟后面去哪",
            "只打字给我看看歌单",
            "附近有人问歌单只写字",
            "文字回我下一首是哪儿的",
            "旁边有人我想问现在什么歌只写字",
            "没戴耳机问现在什么歌只写字",
            "屏幕上说这首歌为啥选",
            "别出声讲讲这座城",
            "小声告诉我现在歌单里还有几首",
        )
        quiet_prefixed_status_replies = {
            phrase: chat_agent.reply_for(phrase) for phrase in quiet_prefixed_status_phrases
        }
        quiet_prefixed_status_speaks = {
            phrase: chat_agent.should_speak(phrase) for phrase in quiet_prefixed_status_phrases
        }
        inverted_public_listener_fallback = chat_agent.reply_for("周围的人别听见，夜路怎么走")
        screen_only_fallback = chat_agent.reply_for("屏幕显示就行，不用声音")
        screen_light_fallback = chat_agent.reply_for("显示屏上就行，只显示别说")
        shush_fallback = chat_agent.reply_for("嘘一下，先别发出声音")
        do_not_bother_fallback = chat_agent.reply_for("不要吵，我在图书馆")
        child_sleep_fallback = chat_agent.reply_for("孩子刚睡着不要响")
        quiet_alone_fallback = chat_agent.reply_for("我想静静")
        no_external_audio_fallback = chat_agent.reply_for("不要语音回复，别讲出来，文字就好")
        private_readout_fallback = chat_agent.reply_for("不要把我说的话读出来")
        speaker_device_fallback = chat_agent.reply_for("不要从音箱里放出来")
        private_listener_fallback = chat_agent.reply_for("我在开会，别让人听到")
        public_listener_fallback = chat_agent.reply_for("不要让乘客听见")
        venue_listener_fallback = chat_agent.reply_for("别让同桌听见")
        outdoor_too_loud_fallback = chat_agent.reply_for("我在户外别播太响")
        public_no_sudden_song_fallback = chat_agent.reply_for("旁边有人别突然播歌")
        literary_fallback = chat_agent.reply_for("我正在看马尔克斯，有点想听点轻的")
        tired_fallback = chat_agent.reply_for("我今天有点累，一个人坐着")
        insomnia_fallback = chat_agent.reply_for("我今晚睡不着，有点失眠")
        homesick_fallback = chat_agent.reply_for("今晚有点想家，突然想起以前的朋友")
        anxious_fallback = chat_agent.reply_for("我今天压力很大，有点焦虑")
        hurt_fallback = chat_agent.reply_for("我有点委屈，突然很想哭")
        celebration_fallback = chat_agent.reply_for("我有一个好消息，今天太开心了")
        focus_fallback = chat_agent.reply_for("我还要写代码，帮我稳一下")
        lake_fallback = chat_agent.reply_for("我现在在西湖边走一走")
        crowded_fallback = chat_agent.reply_for("这边游客好多，有点吵")
        lost_fallback = chat_agent.reply_for("我有点迷路，快赶不上车了")
        going_home_fallback = chat_agent.reply_for("有点晚了，我准备打车回家")
        phone_low_fallback = chat_agent.reply_for("手机快没电了")
        phone_battery_enough_fallback = chat_agent.reply_for("手机电还够吗")
        phone_battery_home_fallback = chat_agent.reply_for("手机电量撑得回家吗")
        phone_battery_runtime_fallback = chat_agent.reply_for("还能撑多久")
        phone_save_power_fallback = chat_agent.reply_for("省点手机电")
        button_fallback = chat_agent.reply_for("长按橙色按钮现在会做什么")
        button_short_fallback = chat_agent.reply_for("短按橙色按钮做什么")
        button_double_fallback = chat_agent.reply_for("双击橙色键会怎样")
        button_playing_standby_fallback = chat_agent.reply_for("正在播的时候长按会安静待命吗")
        button_playing_no_restart_fallback = chat_agent.reply_for("播放中按住橙键会不会又重新放歌")
        button_idle_phone_fallback = chat_agent.reply_for("待机的时候按住橙键会先连手机吗")
        button_idle_no_song_fallback = chat_agent.reply_for("没播歌的时候长按橙色键会干嘛")
        button_playing_quiet_fallback = chat_agent.reply_for("正在播的时候按住橙键是不是就安静了")
        button_press_no_restart_fallback = chat_agent.reply_for("我按住橙色按钮是不是会重新放歌")
        button_long_press_alt_fallback = chat_agent.reply_for("播放中长摁橙键会不会安静")
        button_press_hold_alt_fallback = chat_agent.reply_for("播着的时候摁住橙键会不会停掉")
        button_idle_press_hold_alt_fallback = chat_agent.reply_for("待机时摁住橙色按钮会先找热点吗")
        button_long_press_now_toggle_fallback = chat_agent.reply_for("长按现在会关掉播放还是开电台")
        button_mute_current_sunset_fallback = chat_agent.reply_for("我在静音时长按是不是会解除静音并播放当前日落")
        button_mute_guard_fallback = chat_agent.reply_for("长按橙色键会不会绕过静音直接外放")
        button_mute_noise_fallback = chat_agent.reply_for("静音的时候按住按钮会不会直接吵出来")
        button_press_hold_mute_noise_fallback = chat_agent.reply_for("没播放的时候摁住橙键会不会突然外放")
        button_press_long_no_random_fallback = chat_agent.reply_for("橙色按钮按久一点会不会乱播")
        button_idle_key_press_long_direct_song_fallback = chat_agent.reply_for("没播歌的时候橙键按久点会直接放歌吗")
        button_quiet_explain_fallback = chat_agent.reply_for("长按的时候不要出声，只告诉我会发生什么")
        button_status_card_fallback = chat_agent.reply_for("长按后会不会写状态卡")
        button_screen_result_fallback = chat_agent.reply_for("长按后屏幕会显示结果吗")
        button_action_writeback_fallback = chat_agent.reply_for("按钮动作会写回状态吗")
        button_mute_guard_speak = chat_agent.should_speak("长按橙色键会不会绕过静音直接外放")
        outdoor_preflight_fallback = chat_agent.reply_for("出门前帮我检查一下")
        casual_outdoor_status_fallback = chat_agent.reply_for("出门之前帮我看状态")
        quick_outdoor_preflight_fallback = chat_agent.reply_for("我快出门了你能自己检查一下吗")
        portable_status_fallback = chat_agent.reply_for("我能带你出去吗")
        carry_ready_fallback = chat_agent.reply_for("你适合带出门吗")
        hotspot_fallback = chat_agent.reply_for("我想带你去西湖边，怎么联网")
        phone_hotspot_status_fallback = chat_agent.reply_for("现在连上我手机了吗")
        current_phone_attached_fallback = chat_agent.reply_for("现在连的是我手机吗")
        current_casual_tether_fallback = chat_agent.reply_for("现在蹭的是谁的网")
        current_phone_tethered_fallback = chat_agent.reply_for("现在是不是还蹭着我手机")
        mobile_data_status_fallback = chat_agent.reply_for("走我的流量了吗")
        cellular_route_status_fallback = chat_agent.reply_for("现在走的是蜂窝吗")
        current_network_fallback = chat_agent.reply_for("现在走哪个网络")
        current_wifi_name_fallback = chat_agent.reply_for("当前WiFi叫什么")
        guarded_network_ssid_fallback = chat_agent.reply_for("先别修网络，告诉我当前SSID是什么")
        home_or_phone_network_fallback = chat_agent.reply_for("现在是家里网还是手机网")
        current_home_network_casual_fallback = chat_agent.reply_for("你是不是还在家里的网")
        current_home_network_still_fallback = chat_agent.reply_for("现在还是家里网吗")
        current_network_presence_fallback = chat_agent.reply_for("现在有网吗")
        current_network_loss_fallback = chat_agent.reply_for("现在是不是没网")
        current_network_offline_fallback = chat_agent.reply_for("现在是不是离线了")
        current_network_alive_fallback = chat_agent.reply_for("网还活着吗")
        current_network_dead_fallback = chat_agent.reply_for("网是不是挂了")
        current_wifi_health_fallback = chat_agent.reply_for("WiFi现在好吗")
        hotspot_stability_fallback = chat_agent.reply_for("热点现在稳吗")
        portable_network_recovery_fallback = chat_agent.reply_for("出门了还能连得上吗")
        away_find_phone_fallback = chat_agent.reply_for("离开家以后会不会自己找我手机")
        away_from_home_network_fallback = chat_agent.reply_for("离开家之后会不会断网")
        outdoor_no_network_recovery_fallback = chat_agent.reply_for("出门没网时怎么连回来")
        no_network_playback_fallback = chat_agent.reply_for("没有网还会播放吗")
        hotspot_failure_fallback = chat_agent.reply_for("没连上 iPhone 怎么办")
        hotspot_priority_fallback = chat_agent.reply_for("热点优先级是什么")
        hotspot_home_wifi_fallback = chat_agent.reply_for("连不上手机会回家里Wi-Fi吗")
        vivo_priority_fallback = chat_agent.reply_for("vivo热点排第几")
        vivo_open_priority_fallback = chat_agent.reply_for("vivo开了会不会排第二")
        two_hotspots_priority_fallback = chat_agent.reply_for("两个热点都开了你先连哪个")
        hotspot_secret_fallback = chat_agent.reply_for("热点密码会写进代码吗")
        hotspot_secret_log_fallback = chat_agent.reply_for("热点密码会不会写进日志")
        hotspot_secret_readout_fallback = chat_agent.reply_for("手机热点密码会不会被你念出来")
        hotspot_secret_screen_fallback = chat_agent.reply_for("热点密码会不会显示在屏幕上")
        hotspot_secret_screen_direct_fallback = chat_agent.reply_for("密码别出现在屏幕上")
        wifi_secret_hidden_fallback = chat_agent.reply_for("WiFi密码别显示出来")
        hotspot_secret_screen_speak = chat_agent.should_speak("热点密码会不会显示在屏幕上")
        hotspot_secret_screen_direct_speak = chat_agent.should_speak("密码别出现在屏幕上")
        wifi_secret_hidden_speak = chat_agent.should_speak("WiFi密码别显示出来")
        apple_hotspot_missing_vivo_fallback = chat_agent.reply_for("苹果热点不见了会不会再试vivo")
        hotspot_both_missing_fallback = chat_agent.reply_for("两个热点都找不到会回家里Wi-Fi吗")
        hotspot_both_missing_casual_fallback = chat_agent.reply_for("两个热点都找不到怎么办")
        guarded_phone_hotspot_status_fallback = chat_agent.reply_for("别去连我手机，问一下热点状态")
        guarded_casual_tether_fallback = chat_agent.reply_for("别连接手机，只问现在蹭的是谁的网")
        guarded_vivo_home_wifi_fallback = chat_agent.reply_for("vivo也别连，只想知道会不会回家里Wi-Fi")
        guarded_iphone_failure_vivo_fallback = chat_agent.reply_for("别动网络，只问PocketEarth-iPhone失败了会不会试vivo")
        vivo_failure_fallback = chat_agent.reply_for("vivo也连不上会不会卡住")
        outdoor_hotspot_failure_fallback = chat_agent.reply_for("出门热点失败会不会回落家里网")
        hotspot_secret_git_fallback = chat_agent.reply_for("热点密码会不会写进git")
        wifi_repeat_switch_fallback = chat_agent.reply_for("Wi-Fi失败后会不会重复切换")
        casual_network_novel_fallback = chat_agent.reply_for("网络小说挺好看")
        casual_network_match_fallback = chat_agent.reply_for("这次比赛网络评分怎么样")
        hungry_fallback = chat_agent.reply_for("我有点饿了，还没吃晚饭")
        cold_fallback = chat_agent.reply_for("外面风大，有点冷")
        hot_fallback = chat_agent.reply_for("今天太热了，有点闷")
        practical_fallback = chat_agent.reply_for("我想找个洗手间，再买瓶水")
        rain_shelter_fallback = chat_agent.reply_for("我想找个地方避雨，顺便找把伞")
        ambient_scan_fallback = chat_agent.reply_for("扫描此刻会保存照片吗")
        ambient_manual_consent_fallback = chat_agent.reply_for("没经过我同意别开摄像头")
        ambient_no_button_photo_fallback = chat_agent.reply_for("没有我按按钮别拍照")
        ambient_no_auto_photo_fallback = chat_agent.reply_for("别自动拍环境")
        no_open_camera_status_fallback = chat_agent.reply_for("别开摄像头，只问你现在看得到吗")
        no_open_camera_road_status_fallback = chat_agent.reply_for("我在路上别开摄像头只看状态")
        ambient_secret_photo_fallback = chat_agent.reply_for("环境扫描会不会偷偷拍")
        ambient_ask_before_scan_fallback = chat_agent.reply_for("扫环境前会不会先问我")
        ambient_manual_trigger_fallback = chat_agent.reply_for("只在我手动触发时看一下")
        ambient_no_photo_storage_fallback = chat_agent.reply_for("看到什么别存照片")
        ambient_no_cloud_photo_fallback = chat_agent.reply_for("别把环境照片上传云端")
        ambient_continuous_capture_fallback = chat_agent.reply_for("环境扫描会一直拍吗")
        ambient_auto_scan_fallback = chat_agent.reply_for("会自动扫描周围吗")
        ambient_tuning_fallback = chat_agent.reply_for("环境感知会自动调音吗")
        ambient_frame_fallback = chat_agent.reply_for("相机扫描会不会录音或播放")
        visual_identifier_privacy_fallbacks = {
            "plate": chat_agent.reply_for("环境扫描会不会识别车牌"),
            "screenText": chat_agent.reply_for("相机会不会读我屏幕上的文字"),
            "idNumber": chat_agent.reply_for("扫描此刻会不会看身份证号"),
            "qrCode": chat_agent.reply_for("会不会识别二维码"),
            "doorplate": chat_agent.reply_for("会不会记住门牌号"),
            "plateStorage": chat_agent.reply_for("拍到别人的车牌会保存吗"),
            "screenUpload": chat_agent.reply_for("会不会把屏幕文字传到云端"),
        }
        visual_identifier_privacy_speaks = {
            name: chat_agent.should_speak(phrase)
            for name, phrase in {
                "plate": "环境扫描会不会识别车牌",
                "screenText": "相机会不会读我屏幕上的文字",
                "idNumber": "扫描此刻会不会看身份证号",
                "qrCode": "会不会识别二维码",
                "doorplate": "会不会记住门牌号",
                "plateStorage": "拍到别人的车牌会保存吗",
                "screenUpload": "会不会把屏幕文字传到云端",
            }.items()
        }
        ambient_extra_manual_fallbacks = {
            "noButtonCamera": chat_agent.reply_for("没按按钮你会不会自己开摄像头"),
            "noOrangeKeyFrame": chat_agent.reply_for("没按橙键会不会自己拍一帧"),
            "manualGlance": chat_agent.reply_for("只允许我手动触发看一眼可以吗"),
            "noConsentLens": chat_agent.reply_for("没有我同意别开镜头"),
        }
        ambient_extra_scan_fallbacks = {
            "photoUpload": chat_agent.reply_for("环境照片会不会上传云端"),
            "cameraFrameRetention": chat_agent.reply_for("相机看到的画面会不会留底"),
            "photoTraining": chat_agent.reply_for("环境照片会不会拿去训练"),
            "imageDelete": chat_agent.reply_for("拍完环境图片会删掉吗"),
            "bystanderExpressionAutoplay": chat_agent.reply_for("会不会根据旁边人的表情自动换歌"),
            "faceIdentity": chat_agent.reply_for("看到我的脸会不会识别身份"),
        }
        ambient_extra_privacy_speaks = {
            phrase: chat_agent.should_speak(phrase)
            for phrase in [
                "没按按钮你会不会自己开摄像头",
                "没按橙键会不会自己拍一帧",
                "环境照片会不会上传云端",
                "相机看到的画面会不会留底",
                "环境照片会不会拿去训练",
                "只允许我手动触发看一眼可以吗",
                "没有我同意别开镜头",
                "拍完环境图片会删掉吗",
                "会不会根据旁边人的表情自动换歌",
                "看到我的脸会不会识别身份",
            ]
        }
        expression_recognition_fallback = chat_agent.reply_for("会不会识别我的表情")
        ambient_memory_location_fallback = chat_agent.reply_for("环境记忆会记住我在哪吗")
        privacy_fallback = chat_agent.reply_for("你会不会一直拍我，或者识别人脸和表情")
        audio_privacy_fallback = chat_agent.reply_for("别录音，也不要监听我")
        no_open_microphone_status_fallback = chat_agent.reply_for("不要打开麦克风，只想知道麦克风现在开着吗")
        terse_audio_privacy_fallback = chat_agent.reply_for("关麦了吗")
        speech_cloud_privacy_fallback = chat_agent.reply_for("会不会把我说的话传到云端")
        voice_storage_privacy_fallback = chat_agent.reply_for("别把我的声音存起来")
        always_listening_privacy_fallback = chat_agent.reply_for("你是不是一直在听")
        always_on_mic_privacy_fallback = chat_agent.reply_for("麦克风是不是一直开着")
        lens_privacy_fallback = chat_agent.reply_for("镜头关了吗")
        identity_memory_privacy_fallback = chat_agent.reply_for("别记住我是谁")
        name_memory_privacy_fallback = chat_agent.reply_for("不要记住我的名字")
        companion_memory_privacy_fallback = chat_agent.reply_for("别记住我和谁在一起")
        companion_outdoor_privacy_fallback = chat_agent.reply_for("别记我和谁一起出门")
        server_upload_privacy_fallback = chat_agent.reply_for("这句不要上传到服务器")
        destination_memory_privacy_fallback = chat_agent.reply_for("刚才说的目的地别记了")
        destination_cloud_privacy_fallback = chat_agent.reply_for("别把我今天去哪儿发到云端")
        companion_record_privacy_fallback = chat_agent.reply_for("我跟朋友同路这件事不要记录")
        debug_log_privacy_fallback = chat_agent.reply_for("这段别写进日志")
        current_sentence_log_privacy_fallback = chat_agent.reply_for("这一句别放进日志")
        route_log_privacy_fallback = chat_agent.reply_for("不要把我的路线写进日志")
        destination_log_privacy_question_fallback = chat_agent.reply_for("会不会把目的地写进日志")
        error_log_location_privacy_fallback = chat_agent.reply_for("错误日志会不会有我的位置")
        destination_retention_privacy_fallback = chat_agent.reply_for("刚才说我要去哪别留底")
        companion_retention_privacy_fallback = chat_agent.reply_for("别把我跟谁一起走留下来")
        route_retention_privacy_fallback = chat_agent.reply_for("我的路线别留底")
        voice_retention_privacy_fallback = chat_agent.reply_for("这段声音别留底")
        companion_log_privacy_fallback = chat_agent.reply_for("别把我和同事在一起这事写到日志里")
        preference_retention_fallback = chat_agent.reply_for("我说过喜欢爵士这事别存")
        server_upload_privacy_speak = chat_agent.should_speak("这句不要上传到服务器")
        destination_memory_privacy_speak = chat_agent.should_speak("刚才说的目的地别记了")
        destination_cloud_privacy_speak = chat_agent.should_speak("别把我今天去哪儿发到云端")
        companion_record_privacy_speak = chat_agent.should_speak("我跟朋友同路这件事不要记录")
        companion_outdoor_privacy_speak = chat_agent.should_speak("别记我和谁一起出门")
        debug_log_privacy_speak = chat_agent.should_speak("这段别写进日志")
        route_log_privacy_speak = chat_agent.should_speak("不要把我的路线写进日志")
        destination_log_privacy_question_speak = chat_agent.should_speak("会不会把目的地写进日志")
        error_log_location_privacy_speak = chat_agent.should_speak("错误日志会不会有我的位置")
        destination_retention_privacy_speak = chat_agent.should_speak("刚才说我要去哪别留底")
        companion_retention_privacy_speak = chat_agent.should_speak("别把我跟谁一起走留下来")
        route_retention_privacy_speak = chat_agent.should_speak("我的路线别留底")
        voice_retention_privacy_speak = chat_agent.should_speak("这段声音别留底")
        companion_log_privacy_speak = chat_agent.should_speak("别把我和同事在一起这事写到日志里")
        preference_retention_speak = chat_agent.should_speak("我说过喜欢爵士这事别存")
        no_open_camera_status_speak = chat_agent.should_speak("别开摄像头，只问你现在看得到吗")
        no_open_camera_road_status_speak = chat_agent.should_speak("我在路上别开摄像头只看状态")
        no_open_microphone_status_speak = chat_agent.should_speak("不要打开麦克风，只想知道麦克风现在开着吗")
        last_action_fallback = chat_agent.reply_for("上一条成功了吗")
        last_action_variant_fallback = chat_agent.reply_for("上一轮怎么样")
        last_action_error_fallback = chat_agent.reply_for("上个动作有报错吗")
        last_action_short_result_fallback = chat_agent.reply_for("上次结果呢")
        last_action_casual_result_fallback = chat_agent.reply_for("刚刚那个结果呢")
        last_action_route_recall_fallback = chat_agent.reply_for("上一回路由到哪了")
        last_action_tool_used_fallback = chat_agent.reply_for("刚才那个用到什么工具")
        last_action_capability_used_fallback = chat_agent.reply_for("上一步用到哪个能力")
        last_action_state_retained_fallback = chat_agent.reply_for("上个动作状态还留着吗")
        last_skill_fallback = chat_agent.reply_for("刚才用了什么技能")
        last_skill_variant_fallback = chat_agent.reply_for("刚才调了哪个skill")
        last_heard_fallback = chat_agent.reply_for("你刚才听成什么了")
        last_heard_variant_fallback = chat_agent.reply_for("上条我让你干嘛")
        last_heard_short_fallback = chat_agent.reply_for("你刚听成什么了")
        last_heard_understood_fallback = chat_agent.reply_for("上一句你理解成什么")
        last_heard_misheard_question_fallback = chat_agent.reply_for("你刚才是不是把我听错了")
        last_heard_misheard_direct_fallback = chat_agent.reply_for("你刚才听错了吗")
        last_heard_plain_fallback = chat_agent.reply_for("你听成什么了")
        last_heard_casual_request_fallback = chat_agent.reply_for("刚才我让你干嘛来着")
        last_heard_instruction_fallback = chat_agent.reply_for("我刚才交代你什么来着")
        previous_reply_fallback = chat_agent.reply_for("上一句你回我啥")
        previous_reply_variant_fallback = chat_agent.reply_for("刚才你回啥")
        previous_reply_retype_fallback = chat_agent.reply_for("刚才你说的再打一遍")
        previous_reply_screen_fallback = chat_agent.reply_for("把刚才那句回复再显示一下")
        previous_reply_retained_fallback = chat_agent.reply_for("你刚才回我的那句还在屏幕上吗")
        quiet_previous_reply_fallback = chat_agent.reply_for("别出声把刚才回复重复一遍")
        previous_reply_retype_speak = chat_agent.should_speak("刚才你说的再打一遍")
        previous_reply_screen_speak = chat_agent.should_speak("把刚才那句回复再显示一下")
        previous_reply_retained_speak = chat_agent.should_speak("你刚才回我的那句还在屏幕上吗")
        quiet_previous_reply_speak = chat_agent.should_speak("别出声把刚才回复重复一遍")
        cancel_previous_fallback = chat_agent.reply_for("取消刚才")
        retract_previous_fallback = chat_agent.reply_for("不要执行刚才那句")
        previous_sentence_hold_fallback = chat_agent.reply_for("上一句别动我说错了")
        previous_sentence_no_action_fallback = chat_agent.reply_for("刚刚那句不要跑动作")
        previous_command_no_run_fallback = chat_agent.reply_for("别按刚才那条命令跑")
        misspoke_fallback = chat_agent.reply_for("我刚才说错了")
        previous_sentence_void_fallback = chat_agent.reply_for("刚才那句话作废")
        retract_previous_command_fallback = chat_agent.reply_for("撤回刚才那个命令")
        previous_sentence_not_counted_fallback = chat_agent.reply_for("上一句不算")
        misspoke_song_name_fallback = chat_agent.reply_for("我刚刚说错歌名了")
        tv_source_cancel_fallback = chat_agent.reply_for("刚才那句是电视里的别执行")
        passerby_source_cancel_fallback = chat_agent.reply_for("刚刚那句是路人说的别下发")
        bystander_source_cancel_fallback = chat_agent.reply_for("上一句是旁边人说的别当命令")
        not_my_voice_cancel_fallback = chat_agent.reply_for("不是我说的别执行")
        not_my_voice_hotspot_cancel_fallback = chat_agent.reply_for("上一句不是我说的别连热点")
        vague_no_action_fallback = chat_agent.reply_for("我没说清楚先别动")
        vague_no_direct_play_fallback = chat_agent.reply_for("我说得含糊别直接播")
        queue_stuck_fallback = chat_agent.reply_for("命令队列卡住了吗")
        queue_current_items_fallback = chat_agent.reply_for("现在队列里还有东西吗")
        previous_request_stuck_fallback = chat_agent.reply_for("刚才那个请求卡住了吗")
        previous_request_short_stuck_fallback = chat_agent.reply_for("上个请求卡住了吗")
        previous_queue_item_fallback = chat_agent.reply_for("上一条还在队列里吗")
        previous_queue_item_casual_fallback = chat_agent.reply_for("刚才那条还在队列里吗")
        startup_recovery_fallback = chat_agent.reply_for("断电重启后会自己恢复吗")
        autostart_fallback = chat_agent.reply_for("开机自启正常吗")
        systemd_fallback = chat_agent.reply_for("systemd 服务会自己起来吗")
        service_status_fallback = chat_agent.reply_for("后台服务正常吗")
        service_health_fallback = chat_agent.reply_for("你现在健康吗")
        no_restart_service_alive_fallback = chat_agent.reply_for("先别重启，只想知道服务是不是活着")
        no_restart_backend_online_fallback = chat_agent.reply_for("不要重启电台，只问后台服务在线吗")
        screen_status_fallback = chat_agent.reply_for("屏幕黑了")
        button_problem_fallback = chat_agent.reply_for("按钮没反应")
        whisplay_status_fallback = chat_agent.reply_for("Whisplay 状态卡怎么看")
        whisplay_status_current_fallback = chat_agent.reply_for("状态卡现在写着什么")
        whisplay_refresh_fallback = chat_agent.reply_for("Whisplay还在刷新吗")
        whisplay_screen_stuck_fallback = chat_agent.reply_for("屏幕是不是卡住了")
        whisplay_avatar_moving_fallback = chat_agent.reply_for("头像还在动吗")
        whisplay_little_avatar_stuck_fallback = chat_agent.reply_for("那个小人怎么不动了")
        hotspot_status_card_fallback = chat_agent.reply_for("如果没连上热点状态卡会写什么")
        status_card_action_failure_fallback = chat_agent.reply_for("状态卡会不会显示命令失败")
        whisplay_low_battery_card_fallback = chat_agent.reply_for("状态卡会不会显示低电量")
        whisplay_playback_status_fallback = chat_agent.reply_for("播放状态会不会留在Whisplay上")
        screen_city_track_status_fallback = chat_agent.reply_for("屏幕上的城市和歌曲是什么意思")
        local_control_fallback = chat_agent.reply_for("手机能控制电台吗")
        local_control_phone_panel_fallback = chat_agent.reply_for("手机面板会不会暴露到外网")
        local_control_phone_web_status_fallback = chat_agent.reply_for("手机网页能看电台状态吗")
        local_control_public_exposure_fallback = chat_agent.reply_for("你暴露公网了吗")
        local_api_public_fallback = chat_agent.reply_for("本地控制 API 会不会外网直接播放")
        capability_ready_fallback = chat_agent.reply_for("哪些能力已经就绪")
        capability_pending_fallback = chat_agent.reply_for("还有哪些模块 pending")
        tts_ready_fallback = chat_agent.reply_for("TTS 和 ASR 都 ready 吗")
        voice_doctor_fallback = chat_agent.reply_for("麦克风正常吗")
        wake_issue_fallback = chat_agent.reply_for("唤醒词没反应")
        voice_heard_me_fallback = chat_agent.reply_for("你听得到我吗")
        noisy_voice_status_fallbacks = {
            phrase: chat_agent.reply_for(phrase)
            for phrase in (
                "我声音太小你听得见吗",
                "我离远一点你还能听见吗",
                "环境太吵你还听得清吗",
                "风声很大你能听清吗",
                "我刚才那句是不是没收进去",
                "你刚才是不是没收到我的声音",
                "现在能听懂我吗",
                "你听懂我刚才说的吗",
                "刚刚我说的你听见了吗",
                "刚刚那句话你听清了吗",
                "刚才识别到了吗",
                "刚才那句识别了吗",
            )
        }
        wake_word_guide_fallback = chat_agent.reply_for("怎么叫醒你")
        wake_name_guide_fallback = chat_agent.reply_for("喊你什么能唤醒")
        wake_nickname_guide_fallback = chat_agent.reply_for("小福能不能唤醒你")
        wake_casual_nickname_fallback = chat_agent.reply_for("我喊小福可以吗")
        wake_name_no_response_fallback = chat_agent.reply_for("弗洛斯特没反应怎么办")
        wake_window_fallback = chat_agent.reply_for("唤醒后多久说话")
        partial_utterance_fallback = chat_agent.reply_for("没听完整会不会执行半句")
        half_heard_wrong_press_fallback = chat_agent.reply_for("如果只听到半句会不会按错")
        half_sentence_action_guard_fallback = chat_agent.reply_for("半句话会不会乱跑动作")
        paused_half_utterance_fallback = chat_agent.reply_for("唤醒后我停顿一下你会不会执行半句话")
        wait_until_done_fallback = chat_agent.reply_for("等我说完再执行可以吗")
        incomplete_no_action_fallback = chat_agent.reply_for("没说完整别跑动作")
        wake_source_guard_fallback = chat_agent.reply_for("旁边人在聊天别当成命令")
        wake_no_name_guard_fallback = chat_agent.reply_for("没叫你名字别执行")
        wake_partial_no_dispatch_fallback = chat_agent.reply_for("如果只听到半截别下发命令")
        partial_pause_no_execute_fallback = chat_agent.reply_for("我说到一半停了你别执行")
        half_sentence_not_command_fallback = chat_agent.reply_for("刚才那半句别当命令")
        bystander_call_no_move_fallback = chat_agent.reply_for("旁边人喊你会不会乱动")
        bystander_call_no_move_speak = chat_agent.should_speak("旁边人喊你会不会乱动")
        partial_pause_no_execute_speak = chat_agent.should_speak("我说到一半停了你别执行")
        half_sentence_not_command_speak = chat_agent.should_speak("刚才那半句别当命令")
        quoted_source_fallbacks = {
            phrase: chat_agent.reply_for(phrase)
            for phrase in (
                "不是命令只是举例播放东京的歌",
                "我只是举例说播放东京别真播",
                "别人说打开电台别当我的命令",
                "我说播放东京这几个字别执行",
                "听到别人说继续播放别恢复",
                "如果我说去厕所只是举例别导航",
                "不要把这句当命令只是演示",
                "朋友在旁边喊小福别理他",
                "这句话只是引用歌词别触发动作",
            )
        }
        quoted_source_speaks = {
            phrase: chat_agent.should_speak(phrase)
            for phrase in quoted_source_fallbacks
        }
        skill_fallback = chat_agent.reply_for("你能调用什么 skill，能帮我自检吗")
        skill_actions_fallback = chat_agent.reply_for("你能调用哪些动作")
        skill_tools_fallback = chat_agent.reply_for("你可以用哪些工具")
        no_call_skill_status_fallback = chat_agent.reply_for("别调用技能，只问你能不能查状态")
        current_city_fallback = chat_agent.reply_for("现在在哪个城市")
        current_city_casual_where_fallback = chat_agent.reply_for("现在这座城是哪儿")
        current_city_where_fallback = chat_agent.reply_for("当前城市是哪里")
        no_continue_current_city_fallback = chat_agent.reply_for("不要继续播放，只想知道当前城市")
        no_open_radio_current_city_fallback = chat_agent.reply_for("不要打开电台，只想知道现在是哪座城")
        no_switch_city_now_place_fallback = chat_agent.reply_for("别换城市，只问现在到哪了")
        current_city_followup_fallback = chat_agent.reply_for("咱们到哪儿了")
        current_city_following_fallback = chat_agent.reply_for("我们现在跟着哪座城走")
        current_sunset_followup_fallback = chat_agent.reply_for("追到哪场日落了")
        current_sunset_which_fallback = chat_agent.reply_for("这会儿是哪个日落")
        current_sunset_where_fallback = chat_agent.reply_for("这会儿在哪个日落")
        current_sunset_city_fallback = chat_agent.reply_for("现在追到哪座日落了")
        current_sunset_city_natural_fallback = chat_agent.reply_for("现在是哪座城市在日落")
        current_sunset_city_phrase_fallback = chat_agent.reply_for("这会儿是哪座城的日落")
        current_sunset_city_question_fallback = chat_agent.reply_for("这是哪个城市的日落")
        screen_city_where_fallback = chat_agent.reply_for("屏幕上这座城是哪儿")
        no_speaker_current_city_fallback = chat_agent.reply_for("别通过音箱回答我现在在哪座城市")
        no_speaker_current_city_speak = chat_agent.should_speak("别通过音箱回答我现在在哪座城市")
        current_track_fallback = chat_agent.reply_for("现在放的什么歌")
        current_track_casual_artist_fallback = chat_agent.reply_for("现在这个歌谁唱的")
        current_song_artist_direct_fallback = chat_agent.reply_for("这首歌是谁唱的来着")
        current_song_artist_plain_fallback = chat_agent.reply_for("这首歌的歌手是谁")
        current_title_casual_recall_fallback = chat_agent.reply_for("这首什么歌来着")
        current_title_short_fallback = chat_agent.reply_for("这首叫什么")
        current_title_now_casual_fallback = chat_agent.reply_for("现在这首叫啥来着")
        current_song_city_belongs_fallback = chat_agent.reply_for("这首歌属于哪座城")
        current_song_city_direct_fallback = chat_agent.reply_for("这首是哪座城市的歌")
        current_song_where_from_fallback = chat_agent.reply_for("这首歌哪儿来的")
        current_song_plain_from_fallback = chat_agent.reply_for("现在这首从哪来")
        current_song_from_city_fallback = chat_agent.reply_for("这首歌来自哪座城市")
        current_song_plain_from_city_fallback = chat_agent.reply_for("这首从哪座城市来的")
        current_artist_followup_fallback = chat_agent.reply_for("谁唱的")
        current_title_followup_fallback = chat_agent.reply_for("歌名呢")
        current_singing_which_fallback = chat_agent.reply_for("现在唱什么歌")
        current_singing_which_casual_fallback = chat_agent.reply_for("这会儿唱的是哪首啊")
        current_song_which_fallback = chat_agent.reply_for("这会儿是哪首歌")
        current_track_ringing_fallback = chat_agent.reply_for("此刻是哪首在响")
        current_ringing_front_fallback = chat_agent.reply_for("这会儿响的是哪首")
        recent_ringing_track_fallback = chat_agent.reply_for("刚响的是哪首")
        recent_current_song_fallback = chat_agent.reply_for("刚刚在播什么歌")
        currently_playing_which_fallback = chat_agent.reply_for("正在播哪首歌")
        current_who_singing_fallback = chat_agent.reply_for("这会儿谁在唱")
        current_sound_artist_fallback = chat_agent.reply_for("这声音是谁唱的")
        current_singing_artist_fallback = chat_agent.reply_for("正在唱的是谁")
        current_song_artist_terse_fallback = chat_agent.reply_for("这首歌歌手叫啥")
        current_city_song_compound_fallback = chat_agent.reply_for("我现在听到的是哪座城的哪一首")
        current_song_city_casual_fallback = chat_agent.reply_for("这会儿这首是哪座城市的歌")
        current_station_city_order_fallback = chat_agent.reply_for("这一站现在是哪座城")
        current_station_casual_fallback = chat_agent.reply_for("这会儿是哪一站来着")
        current_station_name_fallback = chat_agent.reply_for("当前这站叫什么名字")
        current_track_city_origin_fallback = chat_agent.reply_for("现在这首是哪座城市的歌")
        current_station_artist_fallback = chat_agent.reply_for("这一站在播谁的歌")
        current_station_title_write_fallback = chat_agent.reply_for("现在这站和歌名能写一下吗")
        quiet_current_track_city_fallback = chat_agent.reply_for("只写屏告诉我当前这首歌和城市")
        quiet_current_track_city_speak = chat_agent.should_speak("只写屏告诉我当前这首歌和城市")
        quiet_current_track_index_fallback = chat_agent.reply_for("旁边有人别出声当前第几首")
        quiet_current_song_no_voice_fallback = chat_agent.reply_for("别出声告诉我现在播什么")
        quiet_current_song_no_voice_speak = chat_agent.should_speak("别出声告诉我现在播什么")
        quiet_current_track_index_speak = chat_agent.should_speak("旁边有人别出声当前第几首")
        no_resume_current_song_fallback = chat_agent.reply_for("别恢复播放，我只是问现在是哪首歌")
        no_resume_terse_current_song_fallback = chat_agent.reply_for("不要恢复播放，只问现在这首歌")
        no_audio_current_song_fallback = chat_agent.reply_for("别开声音，只告诉我现在是什么歌")
        no_previous_current_song_fallback = chat_agent.reply_for("不要回上一首，只想知道刚才那首是什么")
        no_switch_current_artist_fallback = chat_agent.reply_for("不要换歌，只想知道这首谁唱的")
        previous_song_recall_fallback = chat_agent.reply_for("刚才那首什么来着")
        previous_song_direct_title_fallback = chat_agent.reply_for("刚才那首是什么歌")
        previous_song_heard_direct_fallback = chat_agent.reply_for("我刚刚听到的那首是什么")
        previous_rang_artist_fallback = chat_agent.reply_for("刚才响起来的是谁唱的")
        previous_rang_title_fallback = chat_agent.reply_for("刚刚响起来的是哪首歌")
        previous_heard_artist_direct_fallback = chat_agent.reply_for("刚才听到的是谁唱的")
        previous_song_played_back_fallback = chat_agent.reply_for("刚才放过什么歌来着")
        previous_song_no_replay_name_fallback = chat_agent.reply_for("刚才那首别重播我只是问名字")
        previous_song_no_replay_direct_name_fallback = chat_agent.reply_for("刚才那首别重播只告诉我名字")
        no_rewind_previous_song_title_fallback = chat_agent.reply_for("别回上一首，只告诉我刚才那首叫什么")
        no_rewind_previous_song_title_speak = chat_agent.should_speak("别回上一首，只告诉我刚才那首叫什么")
        no_replay_previous_song_title_fallback = chat_agent.reply_for("不要重播上一首，只问歌名")
        no_replay_previous_song_title_speak = chat_agent.should_speak("不要重播上一首，只问歌名")
        previous_station_song_title_no_cut_fallback = chat_agent.reply_for("上一站那首歌叫什么别切回去")
        previous_station_song_title_no_cut_speak = chat_agent.should_speak("上一站那首歌叫什么别切回去")
        previous_heard_artist_no_replay_fallback = chat_agent.reply_for("刚才听到那首是谁唱的别重播")
        previous_heard_artist_no_replay_speak = chat_agent.should_speak("刚才听到那首是谁唱的别重播")
        no_cut_station_song_title_fallback = chat_agent.reply_for("别切回上一站，只想知道那首歌名")
        no_cut_station_song_title_speak = chat_agent.should_speak("别切回上一站，只想知道那首歌名")
        no_replay_previous_artist_fallback = chat_agent.reply_for("不要回放刚才那首，告诉我歌手是谁")
        no_replay_previous_artist_speak = chat_agent.should_speak("不要回放刚才那首，告诉我歌手是谁")
        previous_song_recall_no_play_fallback = chat_agent.reply_for("刚刚那首什么来着别放")
        previous_song_recall_no_play_speak = chat_agent.should_speak("刚刚那首什么来着别放")
        previous_song_stop_origin_casual_fallback = chat_agent.reply_for("刚才那首归哪站来着")
        previous_song_title_fallback = chat_agent.reply_for("上一首叫啥")
        previous_song_city_origin_terse_fallback = chat_agent.reply_for("上一首是哪座城的")
        previous_song_artist_fallback = chat_agent.reply_for("前面那首谁唱的")
        previous_song_from_place_terse_fallback = chat_agent.reply_for("前面那首来自哪里")
        no_sound_current_title_fallback = chat_agent.reply_for("别开声音只告诉我这首叫什么")
        no_sound_current_title_speak = chat_agent.should_speak("别开声音只告诉我这首叫什么")
        route_fallback = chat_agent.reply_for("今天电台怎么走")
        route_later_plan_fallback = chat_agent.reply_for("后面路线怎么安排")
        route_later_casual_places_fallback = chat_agent.reply_for("后面会去哪几个地方")
        route_later_sunset_chase_fallback = chat_agent.reply_for("后面还追哪几场日落")
        route_later_casual_city_list_fallback = chat_agent.reply_for("待会儿还有哪几座城")
        route_later_multi_city_land_fallback = chat_agent.reply_for("等会儿还会落到哪几座城")
        route_pronoun_later_sunset_chase_fallback = chat_agent.reply_for("我们后面还追哪些日落")
        route_this_way_sunset_left_fallback = chat_agent.reply_for("这一路日落还剩哪几场")
        route_next_segment_city_fallback = chat_agent.reply_for("下一段会落在哪座城")
        route_later_city_order_fallback = chat_agent.reply_for("后面城市顺序给我看一下")
        route_later_sunset_order_fallback = chat_agent.reply_for("之后的日落顺序是什么")
        route_line_second_half_order_fallback = chat_agent.reply_for("这条线后半段怎么排")
        route_casual_later_plan_fallback = chat_agent.reply_for("等会儿路线怎么走")
        route_current_segment_fallback = chat_agent.reply_for("这段路线现在走到哪儿了")
        route_station_index_fallback = chat_agent.reply_for("现在是在路线第几站")
        route_today_pass_places_fallback = chat_agent.reply_for("今天还会经过哪些地方")
        route_today_where_passes_fallback = chat_agent.reply_for("今天这趟会经过哪里")
        route_casual_pass_places_fallback = chat_agent.reply_for("后面还会路过什么地方")
        route_this_way_pass_places_fallback = chat_agent.reply_for("这一路后面还会经过哪些地方")
        route_this_way_pass_cities_fallback = chat_agent.reply_for("这一路还要经过哪些城市")
        route_tonight_chase_cities_fallback = chat_agent.reply_for("今晚还追哪些城")
        route_today_sunset_remaining_fallback = chat_agent.reply_for("今天日落路线后面还有哪几站")
        route_today_walk_stops_fallback = chat_agent.reply_for("今天还会走几站")
        route_specific_remaining_stops_fallback = chat_agent.reply_for("剩下还有哪几站")
        no_action_next_route_plan_fallback = chat_agent.reply_for("不要切到下一站，只问后面路线怎么走")
        no_action_city_route_plan_fallback = chat_agent.reply_for("别跳到下个城市，只问路线后面怎么安排")
        no_action_city_remaining_route_fallback = chat_agent.reply_for("别切城，只问今天电台还剩几站")
        no_action_later_city_list_fallback = chat_agent.reply_for("只是问后面还有哪些城市别切城")
        no_cut_song_later_cities_fallback = chat_agent.reply_for("别切歌，只问后面还有哪些城")
        no_cut_next_stop_name_fallback = chat_agent.reply_for("别切到下一站，只问下一站叫什么")
        no_cut_next_stop_where_fallback = chat_agent.reply_for("下一站去哪儿别切过去")
        no_stop_today_places_fallback = chat_agent.reply_for("别停歌，只看一下今天还会经过哪些地方")
        no_action_previous_stop_name_fallback = chat_agent.reply_for("不要回上一站，只问上一站叫什么")
        no_action_previous_stop_where_fallback = chat_agent.reply_for("别切城，只问刚才那站是哪")
        previous_city_plain_where_fallback = chat_agent.reply_for("刚才那座城市是哪儿")
        previous_stop_casual_where_fallback = chat_agent.reply_for("上一站是哪儿来着")
        no_action_named_city_order_fallback = chat_agent.reply_for("别放东京，只问东京排第几站")
        no_action_named_city_eta_fallback = chat_agent.reply_for("不要去东京，只想知道东京什么时候到")
        no_action_route_rationale_fallback = chat_agent.reply_for("别停主线，问一下这趟为什么这么排")
        no_action_current_station_rationale_fallback = chat_agent.reply_for("只是问这站为什么排在这里别切城")
        no_action_current_station_rationale_prefix_fallback = chat_agent.reply_for("别切城只是问这站为什么排在这里")
        route_inverted_station_rationale_fallback = chat_agent.reply_for("为什么这一站排在这里")
        route_trip_current_station_rationale_fallback = chat_agent.reply_for("这趟为什么先到这里别切城市")
        no_action_later_rationale_fallback = chat_agent.reply_for("别执行只问后面为什么这么排")
        no_action_next_stop_rationale_fallback = chat_agent.reply_for("别切到下一站，只问下一站为什么去那里")
        next_city_plain_reason_fallback = chat_agent.reply_for("为什么下一站选这座城")
        no_action_previous_stop_rationale_fallback = chat_agent.reply_for("别回上一站，只问上一站为什么先去那里")
        remaining_stops_fallback = chat_agent.reply_for("还剩几站")
        colloquial_remaining_stops_fallback = chat_agent.reply_for("后面几站有哪些")
        trip_later_city_count_fallback = chat_agent.reply_for("这趟后面还有几座城")
        trip_radio_progress_fallback = chat_agent.reply_for("这趟电台走到哪了")
        later_place_fallback = chat_agent.reply_for("等会儿去哪儿")
        further_sunset_count_fallback = chat_agent.reply_for("再往后还有几场日落")
        direct_sunset_count_fallback = chat_agent.reply_for("这趟还剩几场日落")
        tonight_chase_sunset_count_fallback = chat_agent.reply_for("今晚还追几场日落")
        route_signoff_time_fallback = chat_agent.reply_for("这趟什么时候收台")
        route_long_left_fallback = chat_agent.reply_for("路线还长吗")
        route_distance_left_fallback = chat_agent.reply_for("接下来还有多少路")
        route_far_left_fallback = chat_agent.reply_for("今天还要走多远")
        route_duration_fallback = chat_agent.reply_for("这趟还要走多久")
        route_casual_remaining_places_fallback = chat_agent.reply_for("后面还有啥地方")
        route_today_where_next_fallback = chat_agent.reply_for("今天还去哪儿")
        route_trip_winding_later_fallback = chat_agent.reply_for("这趟电台后面还绕哪儿")
        route_later_land_cities_fallback = chat_agent.reply_for("后面还会落到哪几座城")
        route_later_city_fallback = chat_agent.reply_for("等会儿会到哪座城")
        route_later_station_fallback = chat_agent.reply_for("待会儿到哪站")
        route_next_stop_name_casual_fallback = chat_agent.reply_for("下一站叫什么来着")
        route_second_half_fallback = chat_agent.reply_for("后半程还去哪儿")
        quiet_route_write_chars_fallback = chat_agent.reply_for("附近有人我能问你路线吗只写字")
        quiet_route_detour_fallback = chat_agent.reply_for("只写屏告诉我这趟后面还绕哪几座城")
        quiet_next_stop_write_chars_fallback = chat_agent.reply_for("没戴耳机查一下下一站只写字")
        quiet_route_no_readout_fallback = chat_agent.reply_for("旁边有人问路线别念出来")
        quiet_route_natural_no_readout_fallback = chat_agent.reply_for("旁边有人，问一下这趟怎么走别念出来")
        quiet_route_no_readout_speak = chat_agent.should_speak("旁边有人问路线别念出来")
        quiet_route_natural_no_readout_speak = chat_agent.should_speak("旁边有人，问一下这趟怎么走别念出来")
        today_route_end_fallback = chat_agent.reply_for("今天这趟还有多久结束")
        today_route_duration_fallback = chat_agent.reply_for("今天这趟还要走多久")
        next_stop_arrival_fallback = chat_agent.reply_for("什么时候到下一站")
        compact_next_stop_arrival_fallback = chat_agent.reply_for("下站多久到")
        next_sunset_eta_fallback = chat_agent.reply_for("下个日落还有多久")
        next_city_eta_fallback = chat_agent.reply_for("还有多久到下个城市")
        next_stop_fallback = chat_agent.reply_for("下一站是哪")
        next_stop_where_fallback = chat_agent.reply_for("下一站去哪儿")
        next_stop_followup_fallback = chat_agent.reply_for("下一站呢")
        next_city_followup_fallback = chat_agent.reply_for("下一个城市呢")
        previous_stop_followup_fallback = chat_agent.reply_for("上站呢")
        next_city_story_fallback = chat_agent.reply_for("下一站有什么故事")
        next_city_story_plain_fallback = chat_agent.reply_for("讲讲下一个城市的故事")
        previous_city_story_fallback = chat_agent.reply_for("上一站有什么故事")
        no_jump_next_city_story_fallback = chat_agent.reply_for("不要跳到下个城市，只想知道下个城市什么来头")
        no_cut_next_city_story_fallback = chat_agent.reply_for("别切过去，只问下个城市什么来头")
        next_city_story_no_skip_fallback = chat_agent.reply_for("下一站有啥故事别切过去")
        no_jump_previous_city_story_fallback = chat_agent.reply_for("不要跳回上个城市，只想知道上个城市什么来头")
        quiet_next_city_story_fallback = chat_agent.reply_for("只写屏讲讲下一站")
        quiet_next_city_story_no_voice_fallback = chat_agent.reply_for("只显示一下下一站故事别出声")
        next_city_story_speak = chat_agent.should_speak("下一站有什么故事")
        quiet_next_city_story_speak = chat_agent.should_speak("只写屏讲讲下一站")
        quiet_next_city_story_no_voice_speak = chat_agent.should_speak("只显示一下下一站故事别出声")
        song_story_fallback = chat_agent.reply_for("这首歌讲什么")
        current_song_story_fallback = chat_agent.reply_for("讲讲这首歌的故事")
        casual_song_story_fallback = chat_agent.reply_for("给我讲下这首")
        colloquial_song_meaning_fallback = chat_agent.reply_for("这歌讲的是啥")
        song_relation_fallback = chat_agent.reply_for("这首歌和这座城市有什么关系")
        terse_song_relation_fallback = chat_agent.reply_for("这首歌跟这座城有什么关系")
        song_plain_city_relation_fallback = chat_agent.reply_for("现在这首和这座城有什么关系")
        song_city_first_relation_fallback = chat_agent.reply_for("这座城跟歌有什么关系")
        song_current_city_relation_fallback = chat_agent.reply_for("这首跟现在的城市有什么关系")
        song_city_fit_fallback = chat_agent.reply_for("这首歌适合这座城吗")
        song_city_fit_why_fallback = chat_agent.reply_for("这首为什么配这座城市")
        city_first_song_fit_why_fallback = chat_agent.reply_for("这座城为什么配这首歌")
        song_city_fit_why_speak = chat_agent.should_speak("这首为什么配这座城市")
        song_here_fit_fallback = chat_agent.reply_for("这歌为什么适合这里")
        song_short_here_fit_fallback = chat_agent.reply_for("这首为啥适合这里")
        song_here_no_skip_fallback = chat_agent.reply_for("只是问这首为什么在这里别跳歌")
        song_here_no_skip_speak = chat_agent.should_speak("只是问这首为什么在这里别跳歌")
        no_play_current_song_reason_fallback = chat_agent.reply_for("别播放，只想知道这首为什么适合这里")
        no_play_current_song_reason_speak = chat_agent.should_speak("别播放，只想知道这首为什么适合这里")
        song_current_sunset_fit_fallback = chat_agent.reply_for("这首歌配现在这场日落吗")
        song_current_sunset_relation_fallback = chat_agent.reply_for("这歌和当前日落有啥联系")
        song_current_sunset_plain_relation_fallback = chat_agent.reply_for("这歌和现在这场日落有什么关系")
        song_station_reason_fallback = chat_agent.reply_for("这首歌为什么放在这一站")
        song_station_selected_fallback = chat_agent.reply_for("这歌为什么选在这站")
        song_station_reason_no_skip_fallback = chat_agent.reply_for("这首歌为什么排在这一站别跳歌")
        song_station_reason_no_skip_speak = chat_agent.should_speak("这首歌为什么排在这一站别跳歌")
        song_place_reason_fallback = chat_agent.reply_for("这首歌为什么配这个地方")
        current_station_reason_fallback = chat_agent.reply_for("现在这站为什么选它")
        previous_song_station_relation_fallback = chat_agent.reply_for("刚才那首歌和上一站有关系吗")
        previous_song_terse_station_relation_fallback = chat_agent.reply_for("刚才那首跟上一站有关系吗")
        previous_song_colloquial_story_fallback = chat_agent.reply_for("刚才那首歌讲啥")
        previous_song_short_story_fallback = chat_agent.reply_for("上首歌有啥故事")
        previous_song_previous_station_reason_fallback = chat_agent.reply_for("前面那首为什么放在上一站")
        previous_song_previous_station_fit_fallback = chat_agent.reply_for("刚才那首为什么适合上一站")
        previous_song_previous_station_relation_fallback = chat_agent.reply_for("刚才那首和上一站有什么关系")
        previous_song_here_reason_fallback = chat_agent.reply_for("刚才那首为什么放这里")
        previous_song_related_fallback = chat_agent.reply_for("上一首和前一站有关吗")
        no_replay_previous_song_station_fallback = chat_agent.reply_for("不要重播刚才那首，只问它和上一站有什么关系")
        no_replay_previous_song_station_speak = chat_agent.should_speak("不要重播刚才那首，只问它和上一站有什么关系")
        no_rewind_previous_song_station_fallback = chat_agent.reply_for("别回放上一首，只想知道它为什么适合上一站")
        no_rewind_previous_song_station_speak = chat_agent.should_speak("别回放上一首，只想知道它为什么适合上一站")
        previous_song_more_story_fallback = chat_agent.reply_for("刚才那首歌还有故事吗别重播")
        previous_song_story_no_replay_short_fallback = chat_agent.reply_for("刚才那首讲什么别重播")
        previous_song_story_no_rewind_short_fallback = chat_agent.reply_for("刚才那歌什么意思别倒回")
        previous_song_more_story_speak = chat_agent.should_speak("刚才那首歌还有故事吗别重播")
        previous_station_song_more_story_fallback = chat_agent.reply_for("上一站那首歌还有故事吗别重播")
        previous_station_song_more_story_speak = chat_agent.should_speak("上一站那首歌还有故事吗别重播")
        no_rewind_previous_song_story_fallback = chat_agent.reply_for("别回上一首，只问刚才那首歌有什么故事")
        no_rewind_previous_song_story_speak = chat_agent.should_speak("别回上一首，只问刚才那首歌有什么故事")
        no_replay_previous_song_origin_fallback = chat_agent.reply_for("不要重播刚才那首，只讲它的来历")
        no_replay_previous_song_origin_speak = chat_agent.should_speak("不要重播刚才那首，只讲它的来历")
        song_origin_short_fallback = chat_agent.reply_for("这首歌啥来头")
        song_origin_colloquial_fallback = chat_agent.reply_for("这歌有啥来历")
        song_short_pick_reason_fallback = chat_agent.reply_for("这首为什么选它")
        next_song_selected_reason_fallback = chat_agent.reply_for("下一首为什么选它")
        city_story_fallback = chat_agent.reply_for("讲讲这座城市")
        city_story_this_city_fallback = chat_agent.reply_for("这个城市有什么故事")
        city_story_this_town_fallback = chat_agent.reply_for("这座城有什么故事")
        city_story_current_city_fallback = chat_agent.reply_for("讲讲现在这个城市")
        city_story_this_place_fallback = chat_agent.reply_for("讲讲这个地方")
        city_story_reason_fallback = chat_agent.reply_for("这座城为什么在日落电台里")
        city_story_origin_fallback = chat_agent.reply_for("这里有啥来头")
        no_play_current_city_story_fallback = chat_agent.reply_for("不要开始播放，只问这个城市有什么来头")
        no_play_current_city_story_speak = chat_agent.should_speak("不要开始播放，只问这个城市有什么来头")
        current_stop_story_casual_fallback = chat_agent.reply_for("讲讲这站的故事")
        current_sunset_story_fallback = chat_agent.reply_for("这场日落有什么故事")
        no_cut_current_city_story_fallback = chat_agent.reply_for("别切城只讲讲当前这座城")
        no_cut_current_city_story_speak = chat_agent.should_speak("别切城只讲讲当前这座城")
        city_story_station_origin_fallback = chat_agent.reply_for("这站什么来历")
        city_story_route_reason_fallback = chat_agent.reply_for("这站为什么在路线里")
        city_story_current_route_fallback = chat_agent.reply_for("现在这座城为啥在这条路线里")
        city_story_current_order_fallback = chat_agent.reply_for("这座城为什么排到现在")
        city_tracks_fallback = chat_agent.reply_for("东京有什么歌")
        recommend_city_tracks_fallback = chat_agent.reply_for("能推荐几首这座城的歌吗")
        future_tracks_fallback = chat_agent.reply_for("后面还有什么歌")
        later_specific_song_fallback = chat_agent.reply_for("等会儿会放哪首歌")
        show_playlist_fallback = chat_agent.reply_for("给我看看歌单")
        today_playlist_look_fallback = chat_agent.reply_for("今天歌单能看一下吗")
        today_playlist_glance_fallback = chat_agent.reply_for("今天的歌单能给我看一眼吗")
        playlist_next_track_fallback = chat_agent.reply_for("歌单里下一首是什么")
        playlist_upcoming_fallback = chat_agent.reply_for("这条歌单接下来有什么")
        current_station_playlist_show_fallback = chat_agent.reply_for("这站歌单给我看看")
        current_station_playlist_name_fallback = chat_agent.reply_for("现在这站的歌单是什么")
        current_city_more_listening_casual_fallback = chat_agent.reply_for("这座城还有啥能听")
        current_station_remaining_songs_casual_fallback = chat_agent.reply_for("这站剩哪些歌")
        current_stop_more_songs_fallback = chat_agent.reply_for("这站还能听啥")
        current_stop_available_playable_fallback = chat_agent.reply_for("这站还有什么能播")
        current_stop_available_playable_speak = chat_agent.should_speak("这站还有什么能播")
        current_stop_more_music_fallback = chat_agent.reply_for("这一站还能听什么")
        current_sunset_playlist_fallback = chat_agent.reply_for("当前日落歌单里有什么")
        current_sunset_available_fallback = chat_agent.reply_for("这场日落还能听啥")
        current_sunset_song_count_fallback = chat_agent.reply_for("这场日落还有几首歌")
        current_playlist_remaining_fallback = chat_agent.reply_for("现在歌单还剩多少首")
        current_city_remaining_songs_fallback = chat_agent.reply_for("这个城市还剩几首")
        here_remaining_listening_fallback = chat_agent.reply_for("这里还能听几首")
        soon_song_order_fallback = chat_agent.reply_for("等会儿歌怎么排")
        future_playlist_order_short_fallback = chat_agent.reply_for("后面歌怎么排")
        future_playlist_arrange_short_fallback = chat_agent.reply_for("后面的歌怎么安排")
        future_playlist_next_order_short_fallback = chat_agent.reply_for("接下来歌怎么排")
        next_song_order_reason_fallback = chat_agent.reply_for("下一首为什么这么排")
        future_playlist_good_listening_fallback = chat_agent.reply_for("后面还有哪些好听的")
        future_playlist_listenable_fallback = chat_agent.reply_for("后面还有哪些能听的")
        next_city_playlist_good_no_skip_fallback = chat_agent.reply_for("下一站有什么好听的别切过去")
        next_city_playlist_content_no_skip_fallback = chat_agent.reply_for("下一站歌单里有什么别切过去")
        next_song_arrival_fallback = chat_agent.reply_for("下一首啥时候来")
        next_song_advance_fallback = chat_agent.reply_for("下一首能提前告诉我吗")
        next_song_place_fallback = chat_agent.reply_for("下首是哪儿的")
        next_song_city_fallback = chat_agent.reply_for("下首是哪座城的")
        next_song_station_relation_fallback = chat_agent.reply_for("下一首和下一站有什么关系")
        next_song_station_fit_fallback = chat_agent.reply_for("下首为什么适合下一站")
        later_song_artist_fallback = chat_agent.reply_for("待会儿那首是谁唱的")
        later_song_no_stop_fallback = chat_agent.reply_for("问一下待会播啥不要停歌")
        later_song_casual_no_stop_fallback = chat_agent.reply_for("我只是问待会儿放啥别停歌")
        later_song_count_fallback = chat_agent.reply_for("待会儿还有几首")
        no_cut_next_song_fallback = chat_agent.reply_for("别切歌，我只是问下一首是什么")
        no_change_next_artist_fallback = chat_agent.reply_for("不要换歌，只想知道下一首谁唱的")
        no_switch_next_artist_fallback = chat_agent.reply_for("先别换歌，下一首是谁唱的")
        no_cut_next_song_station_fallback = chat_agent.reply_for("不要切到下一首，只问下一首和下一站有什么关系")
        no_cut_next_song_station_speak = chat_agent.should_speak("不要切到下一首，只问下一首和下一站有什么关系")
        no_jump_next_song_station_fit_fallback = chat_agent.reply_for("别跳歌，只想知道下一首为什么适合下一站")
        no_jump_next_song_station_fit_speak = chat_agent.should_speak("别跳歌，只想知道下一首为什么适合下一站")
        guarded_later_song_transition_fallback = chat_agent.reply_for("别跳下一首，只问待会儿那首为什么接这里")
        guarded_later_song_transition_speak = chat_agent.should_speak("别跳下一首，只问待会儿那首为什么接这里")
        next_city_playlist_reason_fallback = chat_agent.reply_for("下一站歌单为什么这样排")
        next_city_playlist_fit_fallback = chat_agent.reply_for("下个城市这些歌为什么适合那里")
        no_cut_next_city_playlist_reason_fallback = chat_agent.reply_for("先别切城，想知道下一站歌单为什么这么安排")
        no_cut_next_city_playlist_reason_speak = chat_agent.should_speak("先别切城，想知道下一站歌单为什么这么安排")
        no_cut_next_city_playlist_selected_fallback = chat_agent.reply_for("我只是问下一站为什么选这些歌，别切过去")
        no_cut_next_city_playlist_selected_speak = chat_agent.should_speak("我只是问下一站为什么选这些歌，别切过去")
        next_city_playlist_selected_casual_fallback = chat_agent.reply_for("只是想知道下个城市为什么放这些歌")
        previous_city_playlist_reason_fallback = chat_agent.reply_for("上一站为什么选这些歌，别切回去")
        previous_city_playlist_reason_speak = chat_agent.should_speak("上一站为什么选这些歌，别切回去")
        previous_city_playlist_casual_reason_fallback = chat_agent.reply_for("刚才那站歌单为什么这么排，不要回去")
        quiet_previous_city_playlist_reason_fallback = chat_agent.reply_for("别出声问上一站为什么选这些歌")
        quiet_previous_city_playlist_reason_speak = chat_agent.should_speak("别出声问上一站为什么选这些歌")
        previous_city_playlist_more_fallback = chat_agent.reply_for("上一站歌单里还有什么别切回去")
        previous_city_playlist_more_speak = chat_agent.should_speak("上一站歌单里还有什么别切回去")
        previous_station_more_songs_fallback = chat_agent.reply_for("刚才那站还能听哪些歌，别跳回去")
        previous_station_more_songs_speak = chat_agent.should_speak("刚才那站还能听哪些歌，别跳回去")
        previous_station_tracklist_fallback = chat_agent.reply_for("之前那站还有什么曲目，不要切回去")
        no_jump_next_city_playlist_fallback = chat_agent.reply_for("不要跳到下个城市，只想知道下个城市放啥")
        no_jump_next_station_playlist_fallback = chat_agent.reply_for("别跳下个城市，只看下站歌单")
        no_jump_previous_city_playlist_fallback = chat_agent.reply_for("不要跳回上个城市，只想知道上个城市放啥")
        no_play_playlist_count_fallback = chat_agent.reply_for("先别播，只告诉我歌单还剩几首")
        no_play_today_playlist_fallback = chat_agent.reply_for("不要播放，只想看今天歌单")
        no_switch_remaining_count_fallback = chat_agent.reply_for("别切歌，只问后面还有几首")
        no_switch_upcoming_playlist_fallback = chat_agent.reply_for("别换歌，只问接下来歌单里还有什么")
        no_play_upcoming_playlist_fallback = chat_agent.reply_for("给我看一下接下来歌单不要播放")
        no_skip_next_city_song_fallback = chat_agent.reply_for("不要切歌，只想问下一首是哪座城市的")
        current_track_later_exists_fallback = chat_agent.reply_for("这首歌后面还有吗")
        future_more_listen_fallback = chat_agent.reply_for("后面还能听哪些歌")
        current_city_other_songs_fallback = chat_agent.reply_for("这座城还有别的歌吗")
        current_city_available_songs_fallback = chat_agent.reply_for("这座城市还有哪些可播的歌")
        current_city_fit_song_count_fallback = chat_agent.reply_for("这座城市适合哪几首歌")
        later_city_playlist_glance_fallback = chat_agent.reply_for("后面的城市歌单能先看一眼吗")
        no_play_show_current_station_songs_fallback = chat_agent.reply_for("别播放只给我看这站还能播什么")
        next_song_list_only_fallback = chat_agent.reply_for("下一首能不能只列出来别播")
        dj_branch_return_fallback = chat_agent.reply_for("问完歌单故事怎么回到主线")
        dj_branch_interrupt_fallback = chat_agent.reply_for("歌曲故事支线会不会打断播放")
        dj_branch_direct_fallback = chat_agent.reply_for("回到24小时电台")
        dj_branch_cn_direct_fallback = chat_agent.reply_for("回到二十四小时电台")
        dj_branch_radio_mainline_fallback = chat_agent.reply_for("回到日落电台主线")
        dj_branch_question_mainline_fallback = chat_agent.reply_for("问完你还能继续二十四小时电台吗")
        dj_branch_dialog_mainline_fallback = chat_agent.reply_for("对话完还能回二十四小时主线吗")
        dj_branch_chat_mainline_present_fallback = chat_agent.reply_for("聊完之后主线还在吗")
        dj_branch_dj_continue_fallback = chat_agent.reply_for("DJ支线结束后会继续24小时电台吗")
        dj_branch_keep_playing_fallback = chat_agent.reply_for("我问完你还会继续播主线吗")
        dj_branch_no_stuck_fallback = chat_agent.reply_for("讲完故事别卡在支线里")
        dj_branch_voice_steal_fallback = chat_agent.reply_for("语音回复会不会抢掉电台主线")
        dj_branch_route_stop_song_fallback = chat_agent.reply_for("我问路线会不会停掉现在这首歌")
        dj_branch_chat_stuck_fallback = chat_agent.reply_for("支线聊完会不会卡住不回电台")
        dj_branch_dialog_only_fallback = chat_agent.reply_for("不要打断电台，只在对话里回我")
        dj_branch_keep_playing_speak = chat_agent.should_speak("我问完你还会继续播主线吗")
        dj_branch_no_stuck_speak = chat_agent.should_speak("讲完故事别卡在支线里")
        dj_branch_voice_steal_speak = chat_agent.should_speak("语音回复会不会抢掉电台主线")
        dj_branch_route_stop_song_speak = chat_agent.should_speak("我问路线会不会停掉现在这首歌")
        dj_branch_chat_stuck_speak = chat_agent.should_speak("支线聊完会不会卡住不回电台")
        dj_branch_dialog_only_speak = chat_agent.should_speak("不要打断电台，只在对话里回我")
        frost_dialog_fallback = chat_agent.reply_for("Frost 对话框会回复吗")
        frost_inline_dialog_reply_fallback = chat_agent.reply_for("Frost 会不会在对话框里回")
        frost_message_persistence_fallback = chat_agent.reply_for("用户发送后消息会不会消失")
        frost_message_retained_fallback = chat_agent.reply_for("我发出去的消息还会留在对话里吗")
        frost_sent_to_frost_retained_fallback = chat_agent.reply_for("发给Frost以后消息还在吗")
        frost_phrase_persistence_fallback = chat_agent.reply_for("我发出去的话会不会不见")
        frost_sent_message_casual_retained_fallback = chat_agent.reply_for("我刚发出去的消息还留着吗")
        frost_message_swallowed_after_send_fallback = chat_agent.reply_for("我发完会不会被你吞掉")
        frost_message_short_swallow_fallback = chat_agent.reply_for("我发完消息你别吞")
        frost_my_message_sent_retained_fallback = chat_agent.reply_for("我的消息发出去还在吗")
        frost_recent_message_visible_fallback = chat_agent.reply_for("刚才那条消息还能看到吗")
        frost_reply_swallow_fallback = chat_agent.reply_for("你回复的时候会不会把我刚发的那条吞掉")
        frost_reply_short_cover_fallback = chat_agent.reply_for("你回我时不要盖掉我刚发的那条")
        frost_message_cover_fallback = chat_agent.reply_for("我刚发的那条会不会被覆盖掉")
        frost_dialog_cover_fallback = chat_agent.reply_for("对话框里的回复会不会覆盖我的消息")
        frost_mainline_fallback = chat_agent.reply_for("对话支线怎么回到主线")
        frost_dialog_24h_mainline_fallback = chat_agent.reply_for("对话支线能回24小时主线吗")
        frost_dialog_no_stuck_fallback = chat_agent.reply_for("别停在对话支线")
        bare_mainline_present_fallback = chat_agent.reply_for("主线还在吗")
        chat_no_interrupt_fallback = chat_agent.reply_for("普通聊天会打断电台吗")
        chat_casual_no_mainline_steal_fallback = chat_agent.reply_for("普通闲聊别抢24小时主线")
        chat_return_after_fallback = chat_agent.reply_for("普通聊天完能回电台主线吗")
        ask_no_skip_fallback = chat_agent.reply_for("我只是问问题不要切歌")
        ask_no_stop_mainline_fallback = chat_agent.reply_for("只是问一下这首歌不要停主线")
        question_no_stop_radio_fallback = chat_agent.reply_for("我问个问题别把24小时电台停掉")
        chat_no_surprise_music_fallback = chat_agent.reply_for("普通聊天会不会突然开音乐")
        story_no_cut_song_fallback = chat_agent.reply_for("问这首歌故事会不会切歌")
        next_stop_no_cut_past_fallback = chat_agent.reply_for("我只是问下一站别切过去")
        chat_no_auto_next_fallback = chat_agent.reply_for("聊天的时候你会不会自己切到下一站")
        playlist_no_auto_city_fallback = chat_agent.reply_for("问歌单会不会自己换城")
        story_no_auto_next_fallback = chat_agent.reply_for("讲故事会不会自动跳下一站")
        answer_no_auto_city_fallback = chat_agent.reply_for("你会不会一边回答一边切城")
        playlist_no_pause_fallback = chat_agent.reply_for("问歌单的时候别停歌")
        playback_pause_continuity_fallback = chat_agent.reply_for("暂停后能不能接着刚才那首")
        playback_no_execute_question_fallback = chat_agent.reply_for("别暂停，只问暂停后能不能继续刚才那首")
        playback_resume_continuity_fallback = chat_agent.reply_for("恢复播放会从刚才那首继续吗")
        playback_control_fallbacks = {
            phrase: chat_agent.reply_for(phrase)
            for phrase in (
                "声音先收住",
                "电台先安静一下",
                "先停一下别播了",
                "继续刚才的电台",
                "恢复刚才那首吧",
                "声音回来吧",
                "先别唱了歇会儿",
                "先别放了歇一会儿",
                "可以接着唱了",
                "刚刚那首继续放",
                "恢复刚才那首歌",
            )
        }
        playback_state_fallbacks = {
            phrase: chat_agent.reply_for(phrase)
            for phrase in (
                "现在有没有在播放",
                "现在是不是还在播",
                "电台现在开着吗",
                "音乐是不是停了",
                "现在是暂停还是播放",
                "现在有声音吗",
                "别开声音只问现在有没有声音",
                "不要开声音，只问现在能不能继续播",
                "不要打开声音，只问恢复播放会不会接上刚才那首",
                "别播放只问现在是不是在播",
                "别恢复只问现在暂停了吗",
                "是不是还在安静待命",
                "现在是不是待机了",
                "你现在安静待着吗",
                "播放器现在活着吗",
                "我问一下你会不会自己突然开始播放",
                "别突然开始播歌好吗",
            )
        }
        playback_state_speaks = {
            phrase: chat_agent.should_speak(phrase)
            for phrase in playback_state_fallbacks
        }
        playlist_no_cutaway_fallback = chat_agent.reply_for("我只是问歌单别切走")
        route_no_cutaway_fallback = chat_agent.reply_for("我只是问路线别切走")
        route_no_pause_fallback = chat_agent.reply_for("看路线会不会停播")
        next_stop_no_cutaway_fallback = chat_agent.reply_for("问下一站会不会切走主线")
        frost_branch_no_interrupt_fallback = chat_agent.reply_for("弗洛斯特支线会不会打断播放")
        frost_tts_decision_fallback = chat_agent.reply_for("Frost 回复会不会朗读")
        frost_missing_tts_fallback = chat_agent.reply_for("Frost 为什么没朗读")
        pi_tts_trigger_fallback = chat_agent.reply_for("/api/pi-tts 什么时候调用")
        spaced_pi_tts_trigger_fallback = chat_agent.reply_for("什么情况会走pi tts")
        generic_reply_pi_tts_fallback = chat_agent.reply_for("这个回复要不要走 pi-tts")
        thanks_pi_tts_fallback = chat_agent.reply_for("我说谢谢会不会也走 tts")
        importance_screen_policy_fallback = chat_agent.reply_for("这条回复算重要吗还是只留屏幕")
        important_words_readout_fallback = chat_agent.reply_for("重要的话会不会读出来")
        screen_or_readout_policy_fallback = chat_agent.reply_for("什么时候只写屏什么时候念出来")
        ordinary_chat_pi_tts_fallback = chat_agent.reply_for("普通聊天会不会走pi-tts")
        ordinary_chat_spaced_pi_tts_fallback = chat_agent.reply_for("普通聊天会不会走 pi tts")
        ordinary_question_spaced_pi_tts_fallback = chat_agent.reply_for("普通问题会不会走 pi tts")
        current_city_voice_broadcast_fallback = chat_agent.reply_for("问当前城市会不会走语音播报")
        ordinary_chat_speaker_fallback = chat_agent.reply_for("普通聊天会不会突然用喇叭说出来")
        ordinary_question_speaker_fallback = chat_agent.reply_for("普通问题会不会突然从喇叭出来")
        quiet_chat_voice_fallback = chat_agent.reply_for("普通聊天不要走语音可以吗")
        question_tts_trigger_fallback = chat_agent.reply_for("只是问问题会不会触发TTS")
        playlist_readout_policy_fallback = chat_agent.reply_for("问歌单这种普通回复会朗读吗")
        ordinary_playlist_screen_policy_fallback = chat_agent.reply_for("普通问歌单只留屏幕吗")
        ordinary_next_stop_tts_policy_fallback = chat_agent.reply_for("普通问下一站会不会走TTS")
        ordinary_current_track_screen_policy_fallback = chat_agent.reply_for("普通问现在这首只留屏幕吗")
        ordinary_current_city_tts_policy_fallback = chat_agent.reply_for("普通问当前城市会朗读吗")
        ordinary_song_title_readout_policy_fallback = chat_agent.reply_for("普通问歌名会不会念出来")
        current_playing_speaker_policy_fallback = chat_agent.reply_for("只是问现在播什么会走喇叭吗")
        branch_readout_policy_fallback = chat_agent.reply_for("故事支线普通回复会不会朗读")
        tool_failure_important_fallback = chat_agent.reply_for("工具失败是不是重要回复")
        important_reply_definition_fallback = chat_agent.reply_for("什么才算重要回复")
        low_battery_pi_tts_fallback = chat_agent.reply_for("低电量提醒会不会走pi-tts")
        night_road_speaker_policy_fallback = chat_agent.reply_for("夜路求助会不会通过喇叭提醒")
        quiet_low_battery_pi_tts_fallback = chat_agent.reply_for("低电量提醒别走pi-tts")
        quiet_night_road_api_tts_fallback = chat_agent.reply_for("夜路提醒不用/api/pi-tts")
        readout_vs_screen_policy_fallback = chat_agent.reply_for("哪些回复会读出来哪些只写屏")
        typing_vs_broadcast_policy_fallback = chat_agent.reply_for("哪些情况会只打字哪些会播报")
        unimportant_reply_pi_tts_fallback = chat_agent.reply_for("不重要的回复会不会走pi tts")
        unimportant_message_dialog_fallback = chat_agent.reply_for("不重要的话只留在对话框")
        bystander_important_reply_fallback = chat_agent.reply_for("旁边有人时重要提醒也别念吗")
        bystander_important_type_fallback = chat_agent.reply_for("旁边有人重要提醒也先打字")
        bystander_low_battery_mute_fallback = chat_agent.reply_for("旁边有人时低电量提醒会不会还是尊重静音")
        tts_decision_no_object_fallback = chat_agent.reply_for("你怎么判断要不要朗读")
        tts_when_really_speak_fallback = chat_agent.reply_for("什么时候会真的出声")
        tool_failure_external_audio_fallback = chat_agent.reply_for("工具失败会不会直接外放")
        importance_decision_policy_fallback = chat_agent.reply_for("你怎么判断回复重不重要")
        terse_importance_policy_fallback = chat_agent.reply_for("这句重要吗会不会读")
        route_importance_policy_fallback = chat_agent.reply_for("路线问题算重要回复吗")
        story_tts_policy_fallback = chat_agent.reply_for("故事问题会不会触发TTS")
        weather_voice_policy_fallback = chat_agent.reply_for("我问天气会不会出声")
        greeting_readout_policy_fallback = chat_agent.reply_for("普通问候会不会读出来")
        ordinary_chat_pi_tts_speak = chat_agent.should_speak("普通聊天会不会走pi-tts")
        ordinary_chat_spaced_pi_tts_speak = chat_agent.should_speak("普通聊天会不会走 pi tts")
        ordinary_question_spaced_pi_tts_speak = chat_agent.should_speak("普通问题会不会走 pi tts")
        generic_reply_pi_tts_speak = chat_agent.should_speak("这个回复要不要走 pi-tts")
        thanks_pi_tts_speak = chat_agent.should_speak("我说谢谢会不会也走 tts")
        importance_screen_policy_speak = chat_agent.should_speak("这条回复算重要吗还是只留屏幕")
        current_city_voice_broadcast_speak = chat_agent.should_speak("问当前城市会不会走语音播报")
        ordinary_chat_speaker_speak = chat_agent.should_speak("普通聊天会不会突然用喇叭说出来")
        ordinary_question_speaker_speak = chat_agent.should_speak("普通问题会不会突然从喇叭出来")
        quiet_chat_voice_speak = chat_agent.should_speak("普通聊天不要走语音可以吗")
        question_tts_trigger_speak = chat_agent.should_speak("只是问问题会不会触发TTS")
        playlist_readout_policy_speak = chat_agent.should_speak("问歌单这种普通回复会朗读吗")
        ordinary_playlist_screen_policy_speak = chat_agent.should_speak("普通问歌单只留屏幕吗")
        ordinary_next_stop_tts_policy_speak = chat_agent.should_speak("普通问下一站会不会走TTS")
        ordinary_current_track_screen_policy_speak = chat_agent.should_speak("普通问现在这首只留屏幕吗")
        ordinary_current_city_tts_policy_speak = chat_agent.should_speak("普通问当前城市会朗读吗")
        ordinary_song_title_readout_policy_speak = chat_agent.should_speak("普通问歌名会不会念出来")
        current_playing_speaker_policy_speak = chat_agent.should_speak("只是问现在播什么会走喇叭吗")
        branch_readout_policy_speak = chat_agent.should_speak("故事支线普通回复会不会朗读")
        tool_failure_important_speak = chat_agent.should_speak("工具失败是不是重要回复")
        important_reply_definition_speak = chat_agent.should_speak("什么才算重要回复")
        low_battery_pi_tts_speak = chat_agent.should_speak("低电量提醒会不会走pi-tts")
        night_road_speaker_policy_speak = chat_agent.should_speak("夜路求助会不会通过喇叭提醒")
        quiet_low_battery_pi_tts_speak = chat_agent.should_speak("低电量提醒别走pi-tts")
        quiet_night_road_api_tts_speak = chat_agent.should_speak("夜路提醒不用/api/pi-tts")
        screen_or_readout_policy_speak = chat_agent.should_speak("什么时候只写屏什么时候念出来")
        readout_vs_screen_policy_speak = chat_agent.should_speak("哪些回复会读出来哪些只写屏")
        typing_vs_broadcast_policy_speak = chat_agent.should_speak("哪些情况会只打字哪些会播报")
        unimportant_reply_pi_tts_speak = chat_agent.should_speak("不重要的回复会不会走pi tts")
        unimportant_message_dialog_speak = chat_agent.should_speak("不重要的话只留在对话框")
        bystander_important_reply_speak = chat_agent.should_speak("旁边有人时重要提醒也别念吗")
        bystander_important_type_speak = chat_agent.should_speak("旁边有人重要提醒也先打字")
        bystander_low_battery_mute_speak = chat_agent.should_speak("旁边有人时低电量提醒会不会还是尊重静音")
        tts_decision_no_object_speak = chat_agent.should_speak("你怎么判断要不要朗读")
        tts_when_really_speak_speak = chat_agent.should_speak("什么时候会真的出声")
        tool_failure_external_audio_speak = chat_agent.should_speak("工具失败会不会直接外放")
        importance_decision_policy_speak = chat_agent.should_speak("你怎么判断回复重不重要")
        terse_importance_policy_speak = chat_agent.should_speak("这句重要吗会不会读")
        route_importance_policy_speak = chat_agent.should_speak("路线问题算重要回复吗")
        story_tts_policy_speak = chat_agent.should_speak("故事问题会不会触发TTS")
        weather_voice_policy_speak = chat_agent.should_speak("我问天气会不会出声")
        greeting_readout_policy_speak = chat_agent.should_speak("普通问候会不会读出来")
        action_status_fallback = chat_agent.reply_for("工具调用结果会不会写回屏幕")
        previous_action_screen_writeback_fallback = chat_agent.reply_for("上一条动作有没有写回屏幕")
        action_failure_status_fallback = chat_agent.reply_for("技能失败后状态会写屏吗")
        action_progress_fallback = chat_agent.reply_for("怎么知道动作执行到哪了")
        action_current_result_fallback = chat_agent.reply_for("这次动作结果怎么样")
        duplicate_command_status_fallback = chat_agent.reply_for("你会不会重复下发命令")
        action_executed_fallback = chat_agent.reply_for("你刚才真的执行了吗")
        previous_operation_summary_fallback = chat_agent.reply_for("你刚刚做了什么操作")
        previous_action_executed_fallback = chat_agent.reply_for("刚才那个动作执行了吗")
        previous_action_plain_success_fallback = chat_agent.reply_for("刚才的动作成功了吗")
        previous_run_fallback = chat_agent.reply_for("上一条有没有真的跑")
        previous_skill_success_fallback = chat_agent.reply_for("刚才那个skill成功了吗")
        previous_action_skill_used_fallback = chat_agent.reply_for("上一条用的是哪个skill")
        previous_step_tool_called_fallback = chat_agent.reply_for("上一步调了哪个工具")
        previous_failure_reason_fallback = chat_agent.reply_for("上一步失败原因是什么")
        tool_stuck_state_retained_fallback = chat_agent.reply_for("工具卡住以后状态还在吗")
        previous_action_failure_reason_fallback = chat_agent.reply_for("上一个动作失败原因是什么")
        previous_tool_hung_fallback = chat_agent.reply_for("刚才那个工具挂了吗")
        previous_wrong_tool_fallback = chat_agent.reply_for("刚才是不是走错工具了")
        previous_action_did_what_colloquial_fallback = chat_agent.reply_for("刚刚搞了啥来着")
        previous_action_what_did_you_do_fallback = chat_agent.reply_for("你刚刚干嘛了")
        previous_action_did_what_terse_fallback = chat_agent.reply_for("刚才弄了啥")
        previous_done_colloquial_fallback = chat_agent.reply_for("你刚才到底干成没")
        previous_action_that_time_done_fallback = chat_agent.reply_for("刚才那下有没有搞定")
        previous_thing_done_casual_fallback = chat_agent.reply_for("刚才那个弄好了吗")
        previous_row_done_casual_fallback = chat_agent.reply_for("上一条弄成了吗")
        previous_time_success_casual_fallback = chat_agent.reply_for("刚刚那次成功没")
        previous_action_stuck_casual_fallback = chat_agent.reply_for("上个动作卡住了吗")
        previous_tool_terse_called_fallback = chat_agent.reply_for("刚才你到底调了啥")
        previous_skill_direct_called_fallback = chat_agent.reply_for("刚才调的是哪个技能")
        previous_result_screen_casual_fallback = chat_agent.reply_for("刚刚那个结果写屏了吗")
        backend_action_done_casual_fallback = chat_agent.reply_for("后台动作有没有完成")
        current_action_stuck_fallback = chat_agent.reply_for("这个动作现在卡在哪")
        action_still_running_fallback = chat_agent.reply_for("动作还在跑吗")
        previous_stuck_step_fallback = chat_agent.reply_for("刚才卡在哪一步")
        previous_step_progress_fallback = chat_agent.reply_for("刚才那步走到哪了")
        previous_step_if_failure_reason_fallback = chat_agent.reply_for("上一步如果失败会不会告诉我原因")
        previous_result_screen_fallback = chat_agent.reply_for("刚才结果会留在屏幕上吗")
        previous_action_casual_success_fallback = chat_agent.reply_for("刚那个动作到底成功没")
        previous_step_direct_done_fallback = chat_agent.reply_for("刚刚那步到底成没成")
        previous_step_result_still_visible_fallback = chat_agent.reply_for("刚才那步结果还在屏幕上吗")
        previous_command_sent_fallback = chat_agent.reply_for("刚才那条命令发出去了吗")
        repeat_pi_dispatch_fallback = chat_agent.reply_for("这个动作会不会重复发给 Pi")
        previous_sent_to_pi_fallback = chat_agent.reply_for("上一条有没有发到树莓派")
        previous_command_sent_to_pi_fallback = chat_agent.reply_for("刚才命令发给Pi了吗")
        previous_command_really_sent_to_pi_fallback = chat_agent.reply_for("那个命令有没有真的发到树莓派")
        action_transmitted_to_device_fallback = chat_agent.reply_for("那个动作有没有传到设备上")
        device_received_previous_fallback = chat_agent.reply_for("树莓派收到刚才那条了吗")
        request_sent_over_fallback = chat_agent.reply_for("刚刚那个请求发过去了吗")
        no_execute_previous_sent_fallback = chat_agent.reply_for("先别执行，只是问上一条有没有发到树莓派")
        no_resend_previous_received_fallback = chat_agent.reply_for("不要重发，只想知道刚才命令有没有收到")
        dont_resend_to_pi_fallback = chat_agent.reply_for("别再发给树莓派一遍")
        duplicate_sent_once_fallback = chat_agent.reply_for("你是不是重复发了一次命令")
        duplicate_dispatch_plain_fallback = chat_agent.reply_for("刚才有没有重复下发")
        skill_writeback_result_fallback = chat_agent.reply_for("刚才那个skill有没有回写结果")
        tool_finish_writeback_fallback = chat_agent.reply_for("工具跑完有没有把结果写回来")
        midrun_tool_status_fallback = chat_agent.reply_for("工具跑到一半卡住会不会把状态留屏幕")
        tool_midrun_disconnect_visible_fallback = chat_agent.reply_for("工具跑一半断了会显示吗")
        bare_midrun_disconnect_state_fallback = chat_agent.reply_for("跑到一半断了状态还在屏幕吗")
        tool_pre_run_activity_fallback = chat_agent.reply_for("跑工具之前会不会告诉我在干嘛")
        tool_finished_result_fallback = chat_agent.reply_for("工具跑完会不会把结果留在屏幕上")
        song_action_failure_reason_fallback = chat_agent.reply_for("点歌动作失败会不会告诉我为什么")
        before_status_fallback = chat_agent.reply_for("执行前会不会先显示准备状态")
        tool_done_writeback_fallback = chat_agent.reply_for("工具调用完会不会回写状态卡")
        before_preparing_fallback = chat_agent.reply_for("工具调用前会先显示准备中吗")
        first_write_status_then_execute_fallback = chat_agent.reply_for("你会先写状态再执行吗")
        prewrite_preparing_fallback = chat_agent.reply_for("执行前会写准备中吗")
        postwrite_result_fallback = chat_agent.reply_for("执行后会回写结果吗")
        tool_done_complete_fallback = chat_agent.reply_for("工具调用后会不会显示完成状态")
        failure_reason_status_card_fallback = chat_agent.reply_for("失败原因会不会留在状态卡")
        last_action_failure_visible_fallback = chat_agent.reply_for("上次动作的失败原因还能看到吗")
        no_repeat_last_action_fallback = chat_agent.reply_for("别重复执行刚才那个动作")
        no_retry_previous_step_fallback = chat_agent.reply_for("上一步别再重试了")
        no_retry_previous_skill_fallback = chat_agent.reply_for("上个技能别再试了")
        no_repeat_previous_skill_status_fallback = chat_agent.reply_for("别重复调用上一个技能，只看状态")
        no_retry_previous_skill_status_card_fallback = chat_agent.reply_for("不要再调刚才那个skill，只看状态卡")
        no_repeat_previous_skill_screen_fallback = chat_agent.reply_for("上一个技能别重复调用，只写屏告诉我状态")
        action_router_fallback = chat_agent.reply_for("这句话会走哪个技能")
        previous_route_play_or_chat_fallback = chat_agent.reply_for("刚才那个路由走的是播放还是聊天")
        judge_skill_before_action_fallback = chat_agent.reply_for("你会先判断skill再动手吗")
        direct_action_router_fallback = chat_agent.reply_for("这句话会不会直接调动作")
        direct_pi_short_router_fallback = chat_agent.reply_for("这句会下发到Pi吗")
        ordinary_chat_as_action_fallback = chat_agent.reply_for("普通聊天会不会被当成动作")
        status_query_real_action_fallback = chat_agent.reply_for("问状态会不会真的执行动作")
        low_confidence_router_fallback = chat_agent.reply_for("低置信度会不会乱播")
        recognition_uncertain_no_click_fallback = chat_agent.reply_for("识别不确定会不会乱点")
        uncertain_router_fallback = chat_agent.reply_for("没把握就先别动")
        uncertain_router_direct_fallback = chat_agent.reply_for("路由不确定会不会直接执行")
        vague_command_router_fallback = chat_agent.reply_for("别把模糊命令直接执行")
        missed_router_fallback = chat_agent.reply_for("为什么没走技能")
        hearing_incomplete_router_fallback = chat_agent.reply_for("听不完整会不会乱放歌")
        partial_direct_router_fallback = chat_agent.reply_for("半句话会不会直接执行")
        unclear_heard_fallback = chat_agent.reply_for("你没听准会怎么兜底")
        low_confidence_dont_move_fallback = chat_agent.reply_for("路由低置信度先别动可以吗")
        ambiguous_speech_direct_fallback = chat_agent.reply_for("我说得很含糊你会直接执行吗")
        unclear_hearing_direct_play_fallback = chat_agent.reply_for("没听清会不会直接播放")
        recognition_wrong_direct_song_fallback = chat_agent.reply_for("识别错了会不会直接放歌")
        not_understood_direct_play_fallback = chat_agent.reply_for("没听懂会不会直接播")
        unclear_phrase_direct_song_fallback = chat_agent.reply_for("我说得不清楚你会不会直接放歌")
        misheard_phrase_no_execute_fallback = chat_agent.reply_for("没听准的话先别执行")
        partial_heard_ask_first_fallback = chat_agent.reply_for("听到一半不要执行先问我")
        incomplete_direct_play_guard_fallback = chat_agent.reply_for("你没听完整别直接播放")
        unfinished_no_dispatch_fallback = chat_agent.reply_for("如果我没说完不要下发动作")
        ask_before_action_fallback = chat_agent.reply_for("动作执行前会先确认吗")
        ask_before_song_fallback = chat_agent.reply_for("点歌前会先确认是哪首吗")
        ask_clear_before_play_fallback = chat_agent.reply_for("你会不会先问清楚再播")
        too_vague_no_random_play_fallback = chat_agent.reply_for("这句太模糊别乱播")
        sentence_skill_needed_fallback = chat_agent.reply_for("这句话要不要走技能")
        sentence_action_trigger_fallback = chat_agent.reply_for("这句话会触发什么动作")
        which_action_call_fallback = chat_agent.reply_for("你会调用哪个动作")
        no_real_song_router_fallback = chat_agent.reply_for("不要真的点歌，只问点歌会走哪个动作")
        no_tool_call_dispatch_router_fallback = chat_agent.reply_for("不要调用工具，只想知道会不会下发动作")
        no_skill_run_action_router_fallback = chat_agent.reply_for("先别跑skill，问一下这个请求会不会进动作路由")
        no_dispatch_open_radio_router_fallback = chat_agent.reply_for("别下发，只问这句会不会打开电台")
        no_call_skill_which_skill_fallback = chat_agent.reply_for("别调用skill，只问你会调用哪个skill来找歌")
        no_dispatch_close_radio_router_fallback = chat_agent.reply_for("不要下发，只问这句话会不会关闭电台")
        no_pause_question_router_fallback = chat_agent.reply_for("别执行，只问这句会不会暂停")
        no_mute_question_router_fallback = chat_agent.reply_for("别静音，只问安静一点会不会触发静音")
        status_query_no_tool_call_fallback = chat_agent.reply_for("我只是问能不能查状态，不要真的调用工具")
        no_song_skill_route_fallback = chat_agent.reply_for("别点歌，只问点歌会不会走skill")
        hypothetical_play_action_route_fallback = chat_agent.reply_for("不要播歌，只问如果我说播放会不会调用动作")
        direct_pi_dispatch_router_fallback = chat_agent.reply_for("这句话会不会直接下发到树莓派")
        direct_pi_send_router_fallback = chat_agent.reply_for("这句话会不会直接发给树莓派")
        planned_execute_sentence_fallback = chat_agent.reply_for("你准备怎么执行这句")
        sentence_execute_how_fallback = chat_agent.reply_for("这句话会怎么执行")
        route_play_or_chat_sentence_fallback = chat_agent.reply_for("这句会走点歌还是聊天")
        command_misroute_fallback = chat_agent.reply_for("你会不会把这句话当命令乱跑")
        misheard_no_dispatch_fallback = chat_agent.reply_for("如果没听懂会不会直接下命令")
        uncertain_misplay_fallback = chat_agent.reply_for("要是判断不准会不会误播")
        unclear_no_action_fallback = chat_agent.reply_for("我说得不清楚先别跑动作")
        incomplete_exact_no_action_fallback = chat_agent.reply_for("我说的不完整先别跑动作")
        vague_no_dispatch_fallback = chat_agent.reply_for("没把握别下发命令")
        unclear_no_hotspot_fallback = chat_agent.reply_for("听不准就别连热点")
        unclear_no_skip_fallback = chat_agent.reply_for("听不准别切歌")
        inaccurate_no_execute_fallback = chat_agent.reply_for("识别不准先别执行")
        no_confidence_no_hotspot_fallback = chat_agent.reply_for("没把握别连热点")
        misheard_no_hotspot_fallback = chat_agent.reply_for("听错了不要直接连手机热点")
        unclear_no_radio_fallback = chat_agent.reply_for("没听清别直接打开电台")
        not_understood_screen_only_fallback = chat_agent.reply_for("没听懂先写屏别动")
        low_confidence_no_pi_fallback = chat_agent.reply_for("低置信度别发给树莓派")
        uncertain_no_pi_fallback = chat_agent.reply_for("不确定的命令不要下发给Pi")
        ordinary_chat_as_song_fallback = chat_agent.reply_for("会不会把普通聊天当成点歌")
        chat_no_skill_fallback = chat_agent.reply_for("我只是聊天别走技能")
        asr_wrong_ask_first_fallback = chat_agent.reply_for("如果ASR听错了能不能先问我")
        asr_confidence_screen_fallback = chat_agent.reply_for("ASR置信度低会不会先写屏")
        misheard_song_ask_first_fallback = chat_agent.reply_for("听错歌名会不会先问我")
        loud_background_mishear_fallback = chat_agent.reply_for("如果背景音乐太大识别错了会不会切歌")
        natural_language_fallback = chat_agent.reply_for("你能听懂自然语言吗")
        no_keyword_language_fallback = chat_agent.reply_for("不用关键词你能懂吗")
        human_language_fallback = chat_agent.reply_for("我说人话你能懂吗")
        casual_natural_language_fallback = chat_agent.reply_for("我说得很随便你会懂吗")
        memory_boundary_fallback = chat_agent.reply_for("下次还记得我喜欢什么歌吗")
        context_ttl_fallback = chat_agent.reply_for("上下文会保留多久")
        context_continue_fallback = chat_agent.reply_for("你能接着上一句聊吗")
        previous_chat_context_fallback = chat_agent.reply_for("上一句我们聊到哪了")
        current_round_context_fallback = chat_agent.reply_for("这轮聊到哪了")
        recent_sentence_continue_fallback = chat_agent.reply_for("你能接着刚才那句话聊吗")
        casual_current_round_mood_memory_fallback = chat_agent.reply_for("这轮你会记住我刚才说的心情吗")
        casual_previous_context_fallback = chat_agent.reply_for("刚才上下文还在吗")
        previous_sentence_loss_fallback = chat_agent.reply_for("刚才那句你会不会丢")
        current_conversation_only_fallback = chat_agent.reply_for("这次只记当前对话可以吗")
        current_dialog_no_cloud_memory_fallback = chat_agent.reply_for("这次只记当前对话别同步云端")
        long_term_preference_no_save_fallback = chat_agent.reply_for("别把我的音乐偏好长期保存")
        location_memory_fallback = chat_agent.reply_for("会不会保存我的位置")
        location_direct_memory_fallback = chat_agent.reply_for("你会记住我在哪吗")
        mood_memory_fallback = chat_agent.reply_for("你会记住我刚才说的心情吗")
        preference_memory_fallback = chat_agent.reply_for("你会记住我喜欢爵士吗")
        just_said_preference_fallback = chat_agent.reply_for("我刚说喜欢不吵的歌你还记得吗")
        preference_continue_memory_fallback = chat_agent.reply_for("刚才我说喜欢不吵的歌你会接着吗")
        preference_long_term_memory_fallback = chat_agent.reply_for("别把我刚才说喜欢爵士写进长期记忆")
        preference_next_time_memory_fallback = chat_agent.reply_for("刚才说的音乐偏好别带到下次")
        mood_long_term_memory_fallback = chat_agent.reply_for("我刚才心情不好这事会存起来吗")
        future_no_preference_memory_fallback = chat_agent.reply_for("下次不要记得我喜欢这类歌")
        current_dialog_preference_memory_fallback = chat_agent.reply_for("只在当前对话里记住我想听慢一点")
        music_preference_saved_fallback = chat_agent.reply_for("我的音乐偏好会保存吗")
        music_preference_device_storage_fallback = chat_agent.reply_for("我的音乐口味会不会存在设备里")
        preference_training_fallback = chat_agent.reply_for("我刚才说的歌单偏好会不会被训练")
        preference_next_round_phrase_fallback = chat_agent.reply_for("我刚说想听慢一点这事别带到下一轮")
        current_dialog_plain_memory_fallback = chat_agent.reply_for("当前对话记一下我想听慢的可以吗")
        current_round_use_memory_fallback = chat_agent.reply_for("刚才说想听慢歌只在本轮用一下")
        current_round_keep_memory_fallback = chat_agent.reply_for("我说想听安静一点这事只留这轮")
        temporary_listen_memory_fallback = chat_agent.reply_for("临时记一下我现在想听慢一点")
        temporary_only_memory_fallback = chat_agent.reply_for("只临时记一下我想听慢一点")
        tonight_playlist_memory_fallback = chat_agent.reply_for("刚说的歌单口味只留到今晚")
        tonight_forget_mood_memory_fallback = chat_agent.reply_for("这段心情过了今晚就忘掉")
        current_round_now_preference_memory_fallback = chat_agent.reply_for("这轮只记我现在想听慢歌")
        current_round_tonight_preference_memory_fallback = chat_agent.reply_for("这次只记我今晚想听安静歌")
        tonight_after_forget_preference_memory_fallback = chat_agent.reply_for("今晚过后别记得我喜欢这种歌")
        just_said_mood_tonight_memory_fallback = chat_agent.reply_for("刚说的心情只留到今晚")
        current_mood_no_long_term_memory_fallback = chat_agent.reply_for("我现在心情不好这事别长期记")
        tomorrow_forget_preference_memory_fallback = chat_agent.reply_for("明天别记得我喜欢海边日落")
        today_preference_tomorrow_forget_fallback = chat_agent.reply_for("今天喜欢爵士这事明天别记得")
        tomorrow_boundary_memory_fallback = chat_agent.reply_for("这事别带到明天")
        utterance_next_time_memory_fallback = chat_agent.reply_for("这句话别带到下次")
        message_current_round_memory_fallback = chat_agent.reply_for("这条消息只留在本轮")
        message_current_round_plain_memory_fallback = chat_agent.reply_for("这条消息只留本轮可以吗")
        utterance_future_memory_fallback = chat_agent.reply_for("这段话不要带到以后")
        quiet_song_preference_saved_fallback = chat_agent.reply_for("我喜欢安静的歌这件事会不会存起来")
        persistent_song_memory_fallback = chat_agent.reply_for("你会一直记着我喜欢的歌吗")
        future_song_memory_fallback = chat_agent.reply_for("下次还记得我爱听海边的歌吗")
        next_time_mood_memory_fallback = chat_agent.reply_for("刚才我说心情不好会不会带到下一次")
        no_long_term_seaside_memory_fallback = chat_agent.reply_for("不用长期记我爱听海边日落")
        playlist_preference_cloud_fallback = chat_agent.reply_for("不要把我的歌单偏好同步到云端")
        outdoor_route_location_memory_fallback = chat_agent.reply_for("出门了别记我的路线和位置")
        friend_company_memory_fallback = chat_agent.reply_for("我现在和朋友在一起这件事你会一直记住吗")
        coworker_company_memory_fallback = chat_agent.reply_for("我跟同事同行这件事会保存吗")
        spoken_line_log_privacy_fallback = chat_agent.reply_for("刚才那句话会不会进debug日志")
        route_log_privacy_fallback = chat_agent.reply_for("会不会把我今天去哪儿写到日志里")
        going_home_saved_privacy_fallback = chat_agent.reply_for("你会把我刚说想回家这事存起来吗")
        going_home_log_privacy_fallback = chat_agent.reply_for("我刚说我要回家这件事会进日志吗")
        friend_log_privacy_fallback = chat_agent.reply_for("别把我和朋友在这儿这件事留日志")
        destination_log_written_fallback = chat_agent.reply_for("我说的目的地会不会写进日志")
        friend_walk_record_fallback = chat_agent.reply_for("我跟朋友一起走这事会不会留记录")
        preference_memory_speak = chat_agent.should_speak("你会记住我喜欢爵士吗")
        just_said_preference_speak = chat_agent.should_speak("我刚说喜欢不吵的歌你还记得吗")
        previous_sentence_loss_speak = chat_agent.should_speak("刚才那句你会不会丢")
        preference_continue_memory_speak = chat_agent.should_speak("刚才我说喜欢不吵的歌你会接着吗")
        preference_long_term_memory_speak = chat_agent.should_speak("别把我刚才说喜欢爵士写进长期记忆")
        preference_next_time_memory_speak = chat_agent.should_speak("刚才说的音乐偏好别带到下次")
        mood_long_term_memory_speak = chat_agent.should_speak("我刚才心情不好这事会存起来吗")
        future_no_preference_memory_speak = chat_agent.should_speak("下次不要记得我喜欢这类歌")
        current_dialog_preference_memory_speak = chat_agent.should_speak("只在当前对话里记住我想听慢一点")
        current_dialog_no_cloud_memory_speak = chat_agent.should_speak("这次只记当前对话别同步云端")
        current_round_use_memory_speak = chat_agent.should_speak("刚才说想听慢歌只在本轮用一下")
        current_round_keep_memory_speak = chat_agent.should_speak("我说想听安静一点这事只留这轮")
        temporary_listen_memory_speak = chat_agent.should_speak("临时记一下我现在想听慢一点")
        temporary_only_memory_speak = chat_agent.should_speak("只临时记一下我想听慢一点")
        tonight_playlist_memory_speak = chat_agent.should_speak("刚说的歌单口味只留到今晚")
        tonight_forget_mood_memory_speak = chat_agent.should_speak("这段心情过了今晚就忘掉")
        current_round_now_preference_memory_speak = chat_agent.should_speak("这轮只记我现在想听慢歌")
        current_round_tonight_preference_memory_speak = chat_agent.should_speak("这次只记我今晚想听安静歌")
        tonight_after_forget_preference_memory_speak = chat_agent.should_speak("今晚过后别记得我喜欢这种歌")
        just_said_mood_tonight_memory_speak = chat_agent.should_speak("刚说的心情只留到今晚")
        current_mood_no_long_term_memory_speak = chat_agent.should_speak("我现在心情不好这事别长期记")
        tomorrow_forget_preference_memory_speak = chat_agent.should_speak("明天别记得我喜欢海边日落")
        today_preference_tomorrow_forget_speak = chat_agent.should_speak("今天喜欢爵士这事明天别记得")
        tomorrow_boundary_memory_speak = chat_agent.should_speak("这事别带到明天")
        utterance_next_time_memory_speak = chat_agent.should_speak("这句话别带到下次")
        message_current_round_memory_speak = chat_agent.should_speak("这条消息只留在本轮")
        message_current_round_plain_memory_speak = chat_agent.should_speak("这条消息只留本轮可以吗")
        utterance_future_memory_speak = chat_agent.should_speak("这段话不要带到以后")
        preference_training_speak = chat_agent.should_speak("我刚才说的歌单偏好会不会被训练")
        preference_next_round_phrase_speak = chat_agent.should_speak("我刚说想听慢一点这事别带到下一轮")
        persistent_song_memory_speak = chat_agent.should_speak("你会一直记着我喜欢的歌吗")
        future_song_memory_speak = chat_agent.should_speak("下次还记得我爱听海边的歌吗")
        next_time_mood_memory_speak = chat_agent.should_speak("刚才我说心情不好会不会带到下一次")
        no_long_term_seaside_memory_speak = chat_agent.should_speak("不用长期记我爱听海边日落")
        playlist_preference_cloud_speak = chat_agent.should_speak("不要把我的歌单偏好同步到云端")
        outdoor_route_location_memory_speak = chat_agent.should_speak("出门了别记我的路线和位置")
        friend_company_memory_speak = chat_agent.should_speak("我现在和朋友在一起这件事你会一直记住吗")
        coworker_company_memory_speak = chat_agent.should_speak("我跟同事同行这件事会保存吗")
        spoken_line_log_privacy_speak = chat_agent.should_speak("刚才那句话会不会进debug日志")
        route_log_privacy_speak = chat_agent.should_speak("会不会把我今天去哪儿写到日志里")
        going_home_saved_privacy_speak = chat_agent.should_speak("你会把我刚说想回家这事存起来吗")
        going_home_log_privacy_speak = chat_agent.should_speak("我刚说我要回家这件事会进日志吗")
        friend_log_privacy_speak = chat_agent.should_speak("别把我和朋友在这儿这件事留日志")
        destination_log_written_speak = chat_agent.should_speak("我说的目的地会不会写进日志")
        friend_walk_record_speak = chat_agent.should_speak("我跟朋友一起走这事会不会留记录")
        current_sentence_log_privacy_speak = chat_agent.should_speak("这一句别放进日志")
        walking_companion_memory_fallback = chat_agent.reply_for("你会记住我和谁一起走吗")
        walking_companion_memory_speak = chat_agent.should_speak("你会记住我和谁一起走吗")
        tts_policy_fallback = chat_agent.reply_for("哪些回复会走语音，会不会突然出声")
        tool_failure_tts_policy_fallback = chat_agent.reply_for("工具挂了会不会朗读")
        low_battery_tts_policy_fallback = chat_agent.reply_for("低电量这种重要回复会念吗")
        night_road_tts_policy_fallback = chat_agent.reply_for("夜路提醒要不要读出来")
        external_audio_policy_fallback = chat_agent.reply_for("现在适合外放吗")
        sudden_ring_policy_fallback = chat_agent.reply_for("你会不会突然响起来")
        outdoor_speaker_policy_fallback = chat_agent.reply_for("我在外面会不会外放")
        no_earbud_ring_policy_fallback = chat_agent.reply_for("我没戴耳机会不会响")
        nearby_no_sudden_speak_fallback = chat_agent.reply_for("现在旁边有人别突然说话")
        audio_mode_fallback = chat_agent.reply_for("现在是静音模式吗")
        quiet_mode_status_fallback = chat_agent.reply_for("现在是安静模式吗")
        no_voice_reason_fallback = chat_agent.reply_for("为什么你不出声")
        audio_release_fallback = chat_agent.reply_for("可以出声了")
        audio_external_fallback = chat_agent.reply_for("方不方便外放")
        earbud_readout_fallback = chat_agent.reply_for("戴着耳机可以念吗")
        no_earbud_readout_fallback = chat_agent.reply_for("没戴耳机能朗读吗")
        earbud_connected_readout_fallback = chat_agent.reply_for("耳机连着能读出来吗")
        mute_guard_fallback = chat_agent.reply_for("播放会不会绕过静音")
        outdoor_no_external_audio_fallback = chat_agent.reply_for("出门之前帮我确认不会外放")
        soft_mute_fallback = chat_agent.reply_for("soft_mute 是不是还开着")
        restart_mute_fallback = chat_agent.reply_for("重启后还会保持静音吗")
        sudden_ring_speak = chat_agent.should_speak("你会不会突然响起来")
        outdoor_speaker_speak = chat_agent.should_speak("我在外面会不会外放")
        no_earbud_ring_speak = chat_agent.should_speak("我没戴耳机会不会响")
        nearby_no_sudden_speak = chat_agent.should_speak("现在旁边有人别突然说话")
        no_voice_reason_speak = chat_agent.should_speak("为什么你不出声")
        failure_guardrail_fallback = chat_agent.reply_for("调用失败会不会乱点")
        retry_guardrail_fallback = chat_agent.reply_for("没跑通会怎样，会重试吗")
        repeat_failure_guardrail_fallback = chat_agent.reply_for("失败了别一直重试")
        skill_not_rerun_failure_fallback = chat_agent.reply_for("如果技能没跑通别一直试")
        play_request_no_replay_failure_fallback = chat_agent.reply_for("如果点歌失败别自动重播")
        pi_delivery_failure_screen_fallback = chat_agent.reply_for("下发到树莓派失败会不会留在屏幕")
        previous_step_no_continue_fallback = chat_agent.reply_for("上一步没成功先别继续下发")
        tool_hung_no_random_action_fallback = chat_agent.reply_for("工具挂了你会不会乱执行")
        skill_not_rerun_failure_speak = chat_agent.should_speak("如果技能没跑通别一直试")
        play_request_no_replay_failure_speak = chat_agent.should_speak("如果点歌失败别自动重播")
        pi_delivery_failure_screen_speak = chat_agent.should_speak("下发到树莓派失败会不会留在屏幕")
        previous_step_no_continue_speak = chat_agent.should_speak("上一步没成功先别继续下发")
        tool_hung_no_random_action_speak = chat_agent.should_speak("工具挂了你会不会乱执行")
        tool_repeat_guardrail_fallback = chat_agent.reply_for("工具挂了会不会一直重试")
        tool_timeout_repeat_guardrail_fallback = chat_agent.reply_for("工具超时会不会一直重试")
        infinite_retry_guardrail_fallback = chat_agent.reply_for("你会不会无限重试技能")
        failure_retry_again_fallback = chat_agent.reply_for("失败之后会不会再试一次")
        previous_auto_retry_guardrail_fallback = chat_agent.reply_for("上一步没成功会不会自动重试很多次")
        previous_request_retry_guardrail_fallback = chat_agent.reply_for("上个请求会不会一直重试")
        skill_failure_reason_fallback = chat_agent.reply_for("如果skill失败了会不会告诉我原因")
        route_failure_reason_fallback = chat_agent.reply_for("路由失败会不会告诉我原因")
        pi_dispatch_failure_screen_fallback = chat_agent.reply_for("下发到Pi失败会不会留在屏幕")
        playback_command_failure_quiet_fallback = chat_agent.reply_for("如果播放命令失败会不会安静待命")
        failure_reason_screen_fallback = chat_agent.reply_for("失败原因能只写在屏幕上吗")
        skill_ran_bad_guardrail_fallback = chat_agent.reply_for("那个skill没跑通会不会乱点")
        broken_skill_no_retry_fallback = chat_agent.reply_for("这个技能跑坏了别给我再点一次")
        broken_skill_no_retry_speak = chat_agent.should_speak("这个技能跑坏了别给我再点一次")
        broken_tool_fallback = chat_agent.reply_for("工具坏了怎么办")
        unavailable_skill_fallback = chat_agent.reply_for("skill不可用怎么办")
        missing_plugin_guardrail_fallback = chat_agent.reply_for("插件没装会不会乱点")
        missing_tool_guardrail_fallback = chat_agent.reply_for("你没有这个工具会不会乱执行")
        missing_action_guardrail_fallback = chat_agent.reply_for("找不到这个动作会不会重复调用")
        missing_ability_guardrail_fallback = chat_agent.reply_for("这个能力还没准备好会不会先问我")
        unknown_skill_guardrail_fallback = chat_agent.reply_for("你不会的skill会怎么兜底")
        missing_tool_install_guardrail_fallback = chat_agent.reply_for("工具缺了别自己装，只问怎么处理")
        plugin_no_call_guardrail_fallback = chat_agent.reply_for("别调用插件，只问插件没装会怎么兜底")
        missing_credential_guardrail_fallback = chat_agent.reply_for("凭证缺了别执行，只问怎么兜底")
        unavailable_model_guardrail_fallback = chat_agent.reply_for("模型不可用别乱点，只问会怎么兜底")
        missing_permission_guardrail_fallback = chat_agent.reply_for("没有权限别乱跑，只问会怎么兜底")
        missing_tool_install_guardrail_speak = chat_agent.should_speak("工具缺了别自己装，只问怎么处理")
        plugin_no_call_guardrail_speak = chat_agent.should_speak("别调用插件，只问插件没装会怎么兜底")
        missing_credential_guardrail_speak = chat_agent.should_speak("凭证缺了别执行，只问怎么兜底")
        unavailable_model_guardrail_speak = chat_agent.should_speak("模型不可用别乱点，只问会怎么兜底")
        missing_permission_guardrail_speak = chat_agent.should_speak("没有权限别乱跑，只问会怎么兜底")
        screen_only_failure_fallback = chat_agent.reply_for("失败兜底只写屏可以吗")
        misunderstood_no_execute_fallback = chat_agent.reply_for("如果没听懂别直接执行")
        crowded_screen_reply_fallback = chat_agent.reply_for("周围有人，回答就打在屏幕上")
        crowded_screen_reply_speak = chat_agent.should_speak("周围有人，回答就打在屏幕上")
        route_screen_write_fallback = chat_agent.reply_for("后面路线给我写屏别换城市")
        route_screen_city_fallback = chat_agent.reply_for("这趟剩下的城市能打在屏幕上吗")
        route_no_jump_station_fallback = chat_agent.reply_for("我只是问后面怎么走不要跳站")
        playlist_screen_only_fallback = chat_agent.reply_for("这站歌单发屏幕就行别播放")
        important_crowded_text_fallback = chat_agent.reply_for("重要提醒旁边有人也只打字")
        phone_web_current_song_fallback = chat_agent.reply_for("手机网页能看现在第几首吗")
        tv_wake_cancel_fallback = chat_agent.reply_for("旁边电视说弗洛斯特别当命令")

        chat_agent.ENABLED = False
        disabled = chat_agent.respond("你好", speak_fn=lambda text: spoken.append(text))

        chat_agent.ENABLED = True
        pi_command_daemon.publish_state = lambda **state: published.append(state)
        pi_command_daemon.speak_text = lambda text, *args, **kwargs: spoken.append(text) or True
        pi_command_daemon.apply_cloud_agent = lambda text: False
        pi_command_daemon.apply_local_open_playlist = lambda text: False
        pi_command_daemon.match_city = lambda text: None
        before_spoken = len(spoken)
        pi_command_daemon.handle_command("我刚读完一本小说，想跟你说两句")
        daemon_spoken = spoken[before_spoken:]

        pi_command_daemon.catalog = [
            {
                "slug": "soft-night",
                "cityNameZh": "夜读城",
                "cityName": "Soft Night",
                "tracks": [
                    {
                        "id": "soft-night-1",
                        "title": "低声的夜",
                        "artist": "Frost",
                        "citySlug": "soft-night",
                        "cityNameZh": "夜读城",
                        "introText": "一首慢慢展开的 ambient 小曲，适合安静阅读。",
                        "audioUrl": "https://example.com/soft.mp3",
                    }
                ],
            },
            {
                "slug": "lake",
                "cityNameZh": "湖边城",
                "cityName": "Lake",
                "tracks": [
                    {
                        "id": "lake-1",
                        "title": "湖边慢走",
                        "artist": "Frost",
                        "citySlug": "lake",
                        "cityNameZh": "湖边城",
                        "introText": "west lake water shore evening walk open slow air",
                        "audioUrl": "https://example.com/lake.mp3",
                    }
                ],
            },
            {
                "slug": "club",
                "cityNameZh": "舞池城",
                "cityName": "Club",
                "tracks": [
                    {
                        "id": "club-1",
                        "title": "亮灯以后",
                        "artist": "Beat",
                        "citySlug": "club",
                        "cityNameZh": "舞池城",
                        "introText": "techno club peak time",
                        "audioUrl": "https://example.com/club.mp3",
                    }
                ],
            },
            {
                "slug": "focus",
                "cityNameZh": "专注城",
                "cityName": "Focus",
                "tracks": [
                    {
                        "id": "focus-1",
                        "title": "不抢注意力",
                        "artist": "Frost",
                        "citySlug": "focus",
                        "cityNameZh": "专注城",
                        "introText": "minimal focus coding work loop, steady and quiet",
                        "audioUrl": "https://example.com/focus.mp3",
                    }
                ],
            },
            {
                "slug": "rain",
                "cityNameZh": "雨城",
                "cityName": "Rain",
                "tracks": [
                    {
                        "id": "rain-1",
                        "title": "雨夜窗边",
                        "artist": "Frost",
                        "citySlug": "rain",
                        "cityNameZh": "雨城",
                        "introText": "rainy drizzle wet slow night ambience",
                        "audioUrl": "https://example.com/rain.mp3",
                    }
                ],
            },
            {
                "slug": "road",
                "cityNameZh": "公路城",
                "cityName": "Road",
                "tracks": [
                    {
                        "id": "road-1",
                        "title": "夜车灯线",
                        "artist": "Drive",
                        "citySlug": "road",
                        "cityNameZh": "公路城",
                        "introText": "night road trip driving highway pulse",
                        "audioUrl": "https://example.com/road.mp3",
                    }
                ],
            },
        ]
        literary_candidates = pi_command_daemon.candidate_tracks("我正在看马尔克斯，给我一点歌单线索", limit=2)
        sleep_candidates = pi_command_daemon.candidate_tracks("我睡不着，来点睡前的音乐", limit=3)
        hurt_candidates = pi_command_daemon.candidate_tracks("我有点想哭，给我一点不刺耳的歌", limit=3)
        anxious_candidates = pi_command_daemon.candidate_tracks("我有点焦虑，给我一点能呼吸的声音", limit=3)
        rain_candidates = pi_command_daemon.candidate_tracks("外面下雨了，给我一点雨天的声音", limit=3)
        rain_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("外面下雨了，给我一点雨天的声音"))
        rain_statement_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("外面下雨了"))
        volume_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("你声音小一点"))
        focus_candidates = pi_command_daemon.candidate_tracks("我要写代码，给我一点不抢注意力的音乐", limit=3)
        road_candidates = pi_command_daemon.candidate_tracks("晚上开车回去，来点路上的歌", limit=3)
        way_home_candidates = pi_command_daemon.candidate_tracks("回家路上来点稳的歌", limit=3)
        lake_candidates = pi_command_daemon.candidate_tracks("我在西湖边散步，来点水边的歌", limit=3)
        walking_quiet_candidates = pi_command_daemon.candidate_tracks("外面散步来点不吵的歌", limit=3)
        sea_sunset_candidates = pi_command_daemon.candidate_tracks("帮我挑几首海边日落的歌", limit=3)
        quiet_candidates = pi_command_daemon.candidate_tracks("给我一点不吵的歌", limit=3)
        quiet_song_candidates = pi_command_daemon.candidate_tracks("我想安静一点，来首不吵的歌", limit=3)
        tired_quiet_candidates = pi_command_daemon.candidate_tracks("我有点累，别太吵的歌", limit=3)
        bare_quiet_song_candidates = pi_command_daemon.candidate_tracks("来首不吵的", limit=3)
        spoken_quiet_play_candidates = pi_command_daemon.candidate_tracks("播放不吵的", limit=3)
        switch_quiet_song_candidates = pi_command_daemon.candidate_tracks("换首安静点的歌", limit=3)
        switch_not_too_loud_candidates = pi_command_daemon.candidate_tracks("换一首别太吵的歌", limit=3)
        switch_rain_song_candidates = pi_command_daemon.candidate_tracks("换首雨天的歌", limit=3)
        switch_way_home_song_candidates = pi_command_daemon.candidate_tracks("换首回家路上的歌", limit=3)
        switch_focus_song_candidates = pi_command_daemon.candidate_tracks("换首适合写代码的歌", limit=3)
        switch_focus_bare_candidates = pi_command_daemon.candidate_tracks("换首不抢注意力的", limit=3)
        switch_commute_bare_candidates = pi_command_daemon.candidate_tracks("换一首适合通勤的", limit=3)
        switch_lakeside_bare_candidates = pi_command_daemon.candidate_tracks("换首水边的", limit=3)
        way_home_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("回家路上来点稳的歌"))
        way_home_safety_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("回家路上有点慌"))
        lake_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("我在西湖边散步，来点水边的歌"))
        walking_quiet_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("外面散步来点不吵的歌"))
        quiet_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("我想安静一点，来首不吵的歌"))
        tired_quiet_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("我有点累，别太吵的歌"))
        bare_quiet_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("来首不吵的"))
        spoken_quiet_play_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("播放不吵的"))
        switch_quiet_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首安静点的歌"))
        switch_not_too_loud_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换一首别太吵的歌"))
        switch_quiet_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首安静点的歌"))
        switch_not_too_loud_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换一首别太吵的歌"))
        switch_rain_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首雨天的歌"))
        switch_way_home_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首回家路上的歌"))
        switch_focus_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首适合写代码的歌"))
        switch_focus_bare_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首不抢注意力的"))
        switch_commute_bare_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换一首适合通勤的"))
        switch_lakeside_bare_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首水边的"))
        switch_rain_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首雨天的歌"))
        switch_way_home_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首回家路上的歌"))
        switch_focus_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首适合写代码的歌"))
        switch_focus_bare_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首不抢注意力的"))
        switch_commute_bare_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换一首适合通勤的"))
        switch_lakeside_bare_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首水边的"))
        plain_change_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换个歌"))
        plain_change_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换个歌"))
        plain_switch_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换首歌"))
        plain_switch_one_song_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("换一首歌"))
        plain_switch_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换首歌"))
        plain_switch_one_song_is_qualified_playlist = bool(pi_command_daemon.QUALIFIED_NEXT_PLAYLIST_RE.search("换一首歌"))
        quiet_volume_only_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("声音安静点"))
        commute_traffic_statement_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("下班路上有点堵"))
        coding_do_not_bother_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("写代码的时候别吵我"))
        outside_walk_statement_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("我在外面走一走"))
        sea_sunset_phrase_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("帮我挑几首海边日落的歌"))
        lake_statement_is_playlist = bool(pi_command_daemon.OPEN_PLAYLIST_RE.search("我在西湖边走一走"))
    finally:
        chat_agent._llm_reply = original_llm_reply
        chat_agent.ENABLED = original_enabled
        chat_agent.urllib.request.urlopen = original_urlopen
        pi_command_daemon.publish_state = original_publish_state
        pi_command_daemon.speak_text = original_speak_text
        pi_command_daemon.apply_cloud_agent = original_cloud_agent
        pi_command_daemon.apply_local_open_playlist = original_open_playlist
        pi_command_daemon.match_city = original_match_city
        pi_command_daemon.catalog = original_catalog

    cases = [
        {
            "name": "cloud reply requests RAG context for literary/open speech",
            "passed": rag_request.get("payload", {}).get("search") is True
            and rag_request.get("payload", {}).get("json") is False
            and "frost-llm" in rag_request.get("url", "")
            and rag_reply == "我从资料里接住这句话。",
            "detail": rag_request.get("payload"),
        },
        {
            "name": "chat fallback publishes ordinary reply without casual TTS",
            "passed": handled is True
            and handled_spoken_count == 0
            and published[0].get("label") == "DJ"
            and published[0].get("city") == "音乐DJ",
            "detail": {"spokenCount": handled_spoken_count, "published": published[0]},
        },
        {
            "name": "chat fallback TTS gate only allows important replies",
            "passed": all(important_speech_checks.values()),
            "detail": important_speech_checks,
        },
        {
            "name": "low-battery important reply can use TTS",
            "passed": low_battery_tts_handled is True and low_battery_tts_spoken_count == 1,
            "detail": {"spokenCount": low_battery_tts_spoken_count},
        },
        {
            "name": "numeric low-battery important reply can use TTS",
            "passed": numeric_low_battery_tts_handled is True
            and numeric_low_battery_tts_spoken_count == 1
            and bool(numeric_low_battery_tts_published)
            and "省" in numeric_low_battery_tts_published[0].get("message", ""),
            "detail": {
                "spokenCount": numeric_low_battery_tts_spoken_count,
                "published": numeric_low_battery_tts_published,
            },
        },
        {
            "name": "late way-home important reply can use TTS",
            "passed": way_home_tts_handled is True and way_home_tts_spoken_count == 1,
            "detail": {"spokenCount": way_home_tts_spoken_count},
        },
        {
            "name": "outdoor safety/practical reply can use TTS",
            "passed": outdoor_tts_handled is True and outdoor_tts_spoken_count == 1,
            "detail": {"spokenCount": outdoor_tts_spoken_count},
        },
        {
            "name": "privacy-boundary important reply can use TTS",
            "passed": privacy_tts_handled is True and privacy_tts_spoken_count == 1,
            "detail": {"spokenCount": privacy_tts_spoken_count},
        },
        {
            "name": "skill-failure guardrail important reply can use TTS",
            "passed": failure_tts_handled is True and failure_tts_spoken_count == 1,
            "detail": {"spokenCount": failure_tts_spoken_count},
        },
        {
            "name": "TTS policy question can use TTS",
            "passed": tts_policy_handled is True and tts_policy_spoken_count == 1,
            "detail": {"spokenCount": tts_policy_spoken_count},
        },
        {
            "name": "bystander TTS policy question stays screen-only",
            "passed": bystander_tts_policy_handled is True
            and bystander_tts_policy_spoken_count == 0
            and bool(bystander_tts_policy_published)
            and "只写屏" in bystander_tts_policy_published[0].get("message", ""),
            "detail": {
                "spokenCount": bystander_tts_policy_spoken_count,
                "published": bystander_tts_policy_published,
            },
        },
        {
            "name": "explicit quiet chat request still displays but skips TTS",
            "passed": silent_handled is True
            and silent_spoken_count == 0
            and bool(silent_published)
            and silent_published[0].get("label") == "DJ"
            and "省电" in silent_published[0].get("message", ""),
            "detail": {
                "spokenCount": silent_spoken_count,
                "published": silent_published,
            },
        },
        {
            "name": "natural no-talking request still displays but skips TTS",
            "passed": no_talk_handled is True and no_talk_spoken_count == 0,
            "detail": {"spokenCount": no_talk_spoken_count},
        },
        {
            "name": "screen-only request still displays but skips TTS",
            "passed": screen_only_handled is True
            and screen_only_spoken_count == 0
            and "屏幕" in screen_only_fallback
            and "不出声" in screen_only_fallback,
            "detail": {"spokenCount": screen_only_spoken_count, "fallback": screen_only_fallback},
        },
        {
            "name": "screen-light request still displays but skips TTS",
            "passed": screen_light_handled is True
            and screen_light_spoken_count == 0
            and bool(screen_light_published)
            and screen_light_published[0].get("label") == "DJ",
            "detail": {"spokenCount": screen_light_spoken_count, "published": screen_light_published},
        },
        {
            "name": "shush request still displays but skips TTS",
            "passed": shush_handled is True
            and shush_spoken_count == 0
            and bool(shush_published)
            and shush_published[0].get("label") == "DJ",
            "detail": {"spokenCount": shush_spoken_count, "published": shush_published},
        },
        {
            "name": "do-not-bother request still displays but skips TTS",
            "passed": do_not_bother_handled is True
            and do_not_bother_spoken_count == 0
            and bool(do_not_bother_published)
            and do_not_bother_published[0].get("label") == "DJ",
            "detail": {"spokenCount": do_not_bother_spoken_count, "published": do_not_bother_published},
        },
        {
            "name": "sleeping-child request still displays but skips TTS",
            "passed": child_sleep_handled is True
            and child_sleep_spoken_count == 0
            and bool(child_sleep_published)
            and child_sleep_published[0].get("label") == "DJ",
            "detail": {"spokenCount": child_sleep_spoken_count, "published": child_sleep_published},
        },
        {
            "name": "no-external-audio request still displays but skips TTS",
            "passed": no_external_audio_handled is True
            and no_external_audio_spoken_count == 0
            and bool(no_external_audio_published)
            and no_external_audio_published[0].get("label") == "DJ",
            "detail": {"spokenCount": no_external_audio_spoken_count, "published": no_external_audio_published},
        },
        {
            "name": "private-readout request still displays but skips TTS",
            "passed": private_readout_handled is True
            and private_readout_spoken_count == 0
            and bool(private_readout_published)
            and private_readout_published[0].get("label") == "DJ",
            "detail": {"spokenCount": private_readout_spoken_count, "published": private_readout_published},
        },
        {
            "name": "speaker-device request still displays but skips TTS",
            "passed": speaker_device_handled is True
            and speaker_device_spoken_count == 0
            and bool(speaker_device_published)
            and speaker_device_published[0].get("label") == "DJ",
            "detail": {"spokenCount": speaker_device_spoken_count, "published": speaker_device_published},
        },
        {
            "name": "private-listener request still displays but skips TTS",
            "passed": private_listener_handled is True
            and private_listener_spoken_count == 0
            and bool(private_listener_published)
            and private_listener_published[0].get("label") == "DJ",
            "detail": {"spokenCount": private_listener_spoken_count, "published": private_listener_published},
        },
        {
            "name": "public-listener request still displays but skips TTS",
            "passed": public_listener_handled is True
            and public_listener_spoken_count == 0
            and bool(public_listener_published)
            and public_listener_published[0].get("label") == "DJ",
            "detail": {"spokenCount": public_listener_spoken_count, "published": public_listener_published},
        },
        {
            "name": "venue-listener request still displays but skips TTS",
            "passed": venue_listener_handled is True
            and venue_listener_spoken_count == 0
            and bool(venue_listener_published)
            and venue_listener_published[0].get("label") == "DJ",
            "detail": {"spokenCount": venue_listener_spoken_count, "published": venue_listener_published},
        },
        {
            "name": "quiet important request still displays but skips TTS",
            "passed": quiet_important_handled is True
            and quiet_important_spoken_count == 0
            and bool(quiet_important_published)
            and quiet_important_published[0].get("label") == "DJ"
            and "省电" in quiet_important_published[0].get("message", ""),
            "detail": {"spokenCount": quiet_important_spoken_count, "published": quiet_important_published},
        },
        {
            "name": "whisper important request still displays but skips TTS",
            "passed": whisper_important_handled is True
            and whisper_important_spoken_count == 0
            and bool(whisper_important_published)
            and whisper_important_published[0].get("label") == "DJ"
            and "省电" in whisper_important_published[0].get("message", ""),
            "detail": {"spokenCount": whisper_important_spoken_count, "published": whisper_important_published},
        },
        {
            "name": "public quiet important request still displays but skips TTS",
            "passed": public_quiet_important_handled is True
            and public_quiet_important_spoken_count == 0
            and bool(public_quiet_important_published)
            and public_quiet_important_published[0].get("label") == "DJ"
            and "省电" in public_quiet_important_published[0].get("message", ""),
            "detail": {"spokenCount": public_quiet_important_spoken_count, "published": public_quiet_important_published},
        },
        {
            "name": "local fallback replies when LLM is unavailable",
            "passed": fallback in chat_agent.LOCAL_REPLIES,
            "detail": fallback,
        },
        {
            "name": "local fallback respects explicit quiet text-only request",
            "passed": "屏幕" in silent_fallback and "不出声" in silent_fallback,
            "detail": silent_fallback,
        },
        {
            "name": "local fallback answers numeric low-battery phrasing",
            "passed": all(
                "省着电" in reply and "热点" in reply
                for reply in (
                    digit_percent_low_battery_fallback,
                    phone_percent_low_battery_fallback,
                    arabic_power_point_low_battery_fallback,
                    chinese_power_point_low_battery_fallback,
                    one_bar_low_battery_fallback,
                    phone_two_bar_no_power_fallback,
                    phone_one_bar_no_power_fallback,
                    one_mouth_low_battery_fallback,
                    natural_nearly_empty_phone_fallback,
                    phone_power_wont_last_home_fallback,
                    battery_alarm_fallback,
                    nearly_power_off_fallback,
                    battery_draining_fallback,
                    phone_cannot_last_fallback,
                    battery_amount_fallback,
                    battery_reminder_fallback,
                )
            ),
            "detail": {
                "digitPercent": digit_percent_low_battery_fallback,
                "phonePercent": phone_percent_low_battery_fallback,
                "arabicPowerPoint": arabic_power_point_low_battery_fallback,
                "chinesePowerPoint": chinese_power_point_low_battery_fallback,
                "oneBar": one_bar_low_battery_fallback,
                "phoneTwoBarNoPower": phone_two_bar_no_power_fallback,
                "phoneOneBarNoPower": phone_one_bar_no_power_fallback,
                "oneMouth": one_mouth_low_battery_fallback,
                "naturalNearlyEmpty": natural_nearly_empty_phone_fallback,
                "phonePowerWontLastHome": phone_power_wont_last_home_fallback,
                "batteryAlarm": battery_alarm_fallback,
                "nearlyOff": nearly_power_off_fallback,
                "drainingFast": battery_draining_fallback,
                "cannotLast": phone_cannot_last_fallback,
                "batteryAmount": battery_amount_fallback,
                "batteryReminder": battery_reminder_fallback,
            },
        },
        {
            "name": "local fallback answers low-battery slang",
            "passed": all(
                "省着电" in reply and "热点" in reply
                for reply in (
                    single_digit_low_battery_fallback,
                    red_power_low_battery_fallback,
                    phone_yellow_low_battery_fallback,
                    low_power_mode_fallback,
                )
            ),
            "detail": {
                "singleDigit": single_digit_low_battery_fallback,
                "redPower": red_power_low_battery_fallback,
                "phoneYellow": phone_yellow_low_battery_fallback,
                "lowPowerMode": low_power_mode_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet low-battery guidance contentful",
            "passed": "不出声" in quiet_low_battery_fallback
            and "省电" in quiet_low_battery_fallback
            and "热点" in quiet_low_battery_fallback
            and "不出声" in quiet_low_battery_reminder_fallback
            and "省电" in quiet_low_battery_reminder_fallback,
            "detail": {
                "runtime": quiet_low_battery_fallback,
                "reminder": quiet_low_battery_reminder_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet numeric low-battery guidance contentful",
            "passed": "不出声" in quiet_digit_percent_fallback
            and "省电" in quiet_digit_percent_fallback
            and "热点" in quiet_digit_percent_fallback
            and "不出声" in quiet_phone_power_point_fallback
            and "省电" in quiet_phone_power_point_fallback
            and "热点" in quiet_phone_power_point_fallback,
            "detail": {
                "digitPercent": quiet_digit_percent_fallback,
                "phonePowerPoint": quiet_phone_power_point_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet low-battery slang contentful",
            "passed": "不出声" in quiet_single_digit_fallback
            and "省电" in quiet_single_digit_fallback
            and "热点" in quiet_single_digit_fallback
            and "不出声" in quiet_last_bit_battery_fallback
            and "省电" in quiet_last_bit_battery_fallback,
            "detail": {
                "singleDigit": quiet_single_digit_fallback,
                "lastBit": quiet_last_bit_battery_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet battery-draining guidance contentful",
            "passed": "不出声" in quiet_battery_draining_fallback
            and "省电" in quiet_battery_draining_fallback
            and "热点" in quiet_battery_draining_fallback
            and "不出声" in quiet_drained_battery_text_fallback
            and "省电" in quiet_drained_battery_text_fallback
            and "热点" in quiet_drained_battery_text_fallback,
            "detail": {
                "draining": quiet_battery_draining_fallback,
                "drainedText": quiet_drained_battery_text_fallback,
            },
        },
        {
            "name": "local fallback keeps portable low-battery follow-ups text-only",
            "passed": "不出声" in low_battery_continue_listening_fallback
            and "省电" in low_battery_continue_listening_fallback
            and "不出声" in low_battery_numeric_save_power_fallback
            and "省电" in low_battery_numeric_save_power_fallback,
            "detail": {
                "continueListening": low_battery_continue_listening_fallback,
                "numericSavePower": low_battery_numeric_save_power_fallback,
            },
        },
        {
            "name": "local fallback keeps outdoor safety and location-log privacy quiet",
            "passed": "不出声" in outdoor_followed_quiet_fallback
            and "人多亮处" in outdoor_followed_quiet_fallback
            and "回家" in outdoor_followed_fallback
            and "安全" in outdoor_followed_fallback
            and "隐私" in location_log_privacy_fallback
            and "日志" in location_log_privacy_fallback,
            "detail": {
                "outdoorFollowed": outdoor_followed_fallback,
                "outdoorFollowedQuiet": outdoor_followed_quiet_fallback,
                "locationLogPrivacy": location_log_privacy_fallback,
            },
        },
        {
            "name": "local fallback respects quiet important request",
            "passed": "不出声" in quiet_important_fallback
            and "看路" in quiet_important_fallback
            and "地铁站" in quiet_important_fallback,
            "detail": quiet_important_fallback,
        },
        {
            "name": "local fallback respects whisper important request",
            "passed": "不出声" in whisper_important_fallback
            and "看路" in whisper_important_fallback
            and "地铁站" in whisper_important_fallback,
            "detail": whisper_important_fallback,
        },
        {
            "name": "local fallback respects public quiet important request",
            "passed": "不出声" in public_quiet_important_fallback
            and "看路" in public_quiet_important_fallback
            and "地铁站" in public_quiet_important_fallback,
            "detail": public_quiet_important_fallback,
        },
        {
            "name": "local fallback keeps quiet outdoor guidance contentful",
            "passed": "不出声" in quiet_outdoor_fallback
            and "看路" in quiet_outdoor_fallback
            and "地铁站" in quiet_outdoor_fallback,
            "detail": quiet_outdoor_fallback,
        },
        {
            "name": "local fallback keeps portable charge/rest guidance specific",
            "passed": "充电" in portable_charge_fallback
            and "充电宝" in portable_charge_fallback
            and "看路" in portable_charge_fallback,
            "detail": portable_charge_fallback,
        },
        {
            "name": "local fallback answers no-action outdoor place questions",
            "passed": "安全" in no_action_safety_fallback
            and "地铁站" in no_action_subway_fallback
            and "便利店" in no_action_convenience_fallback
            and "看路" in no_action_convenience_fallback
            and "不会直接导航" in place_action_boundary_no_nav_fallback
            and "不会直接导航" in place_action_boundary_terse_no_nav_fallback
            and "不会直接导航" in place_action_boundary_inverted_no_nav_fallback
            and "不会直接导航" in place_action_boundary_policy_fallback,
            "detail": {
                "safety": no_action_safety_fallback,
                "subway": no_action_subway_fallback,
                "convenience": no_action_convenience_fallback,
                "noNav": place_action_boundary_no_nav_fallback,
                "terseNoNav": place_action_boundary_terse_no_nav_fallback,
                "invertedNoNav": place_action_boundary_inverted_no_nav_fallback,
                "policy": place_action_boundary_policy_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet portable charge/rest guidance contentful",
            "passed": all(
                "不出声" in reply
                and "充电" in reply
                and "充电宝" in reply
                and "看路" in reply
                for reply in (
                    quiet_charge_spot_fallback,
                    quiet_powerbank_fallback,
                    quiet_rest_spot_fallback,
                    quiet_public_rain_shelter_fallback,
                )
            )
            and not any(quiet_portable_speaks),
            "detail": {
                "charge": quiet_charge_spot_fallback,
                "powerbank": quiet_powerbank_fallback,
                "rest": quiet_rest_spot_fallback,
                "rainShelter": quiet_public_rain_shelter_fallback,
                "speaks": quiet_portable_speaks,
            },
        },
        {
            "name": "local fallback keeps quiet skill-failure guidance contentful",
            "passed": "不出声" in quiet_failure_guardrail_fallback
            and "不会乱点" in quiet_failure_guardrail_fallback
            and "安静兜底" in quiet_failure_guardrail_fallback,
            "detail": quiet_failure_guardrail_fallback,
        },
        {
            "name": "local fallback keeps tool-failure no-readout requests quiet",
            "passed": all(
                "不出声" in reply and "技能失败" in reply and "安静兜底" in reply
                for reply in (
                    quiet_failed_tool_readout_fallback,
                    quiet_failed_skill_readout_fallback,
                    quiet_failed_call_type_fallback,
                    quiet_failure_screen_view_fallback,
                    quiet_run_failure_broadcast_fallback,
                    quiet_previous_failure_no_speech_fallback,
                    quiet_public_failure_retry_fallback,
                )
            )
            and "无限重试" in quiet_public_failure_retry_fallback
            and quiet_public_failure_retry_speak is False,
            "detail": {
                "tool": quiet_failed_tool_readout_fallback,
                "skill": quiet_failed_skill_readout_fallback,
                "call": quiet_failed_call_type_fallback,
                "screen": quiet_failure_screen_view_fallback,
                "run": quiet_run_failure_broadcast_fallback,
                "previous": quiet_previous_failure_no_speech_fallback,
                "publicRetry": quiet_public_failure_retry_fallback,
                "publicRetrySpeak": quiet_public_failure_retry_speak,
            },
        },
        {
            "name": "local fallback preserves quiet-prefixed status intents",
            "passed": all(not should_speak for should_speak in quiet_prefixed_status_speaks.values())
            and "当前城市和歌曲" in quiet_prefixed_status_replies["别出声告诉我现在播什么歌"]
            and "当前城市和歌曲" in quiet_prefixed_status_replies["不要念出来现在这首是什么"]
            and "当前城市和歌曲" in quiet_prefixed_status_replies["只看屏幕现在这首是谁唱的"]
            and "当前城市和歌曲" in quiet_prefixed_status_replies["安静点告诉我现在在哪个城市"]
            and "当前城市和歌曲" in quiet_prefixed_status_replies["旁边有人我想问现在什么歌只写字"]
            and "当前城市和歌曲" in quiet_prefixed_status_replies["没戴耳机问现在什么歌只写字"]
            and "24H 主线" in quiet_prefixed_status_replies["别播报这趟后面去哪"]
            and "歌单问题" in quiet_prefixed_status_replies["只打字给我看看歌单"]
            and "歌单问题" in quiet_prefixed_status_replies["附近有人问歌单只写字"]
            and "歌单问题" in quiet_prefixed_status_replies["文字回我下一首是哪儿的"]
            and "歌曲故事" in quiet_prefixed_status_replies["屏幕上说这首歌为啥选"]
            and "城市故事" in quiet_prefixed_status_replies["别出声讲讲这座城"]
            and "歌单问题" in quiet_prefixed_status_replies["小声告诉我现在歌单里还有几首"],
            "detail": {
                "replies": quiet_prefixed_status_replies,
                "speaks": quiet_prefixed_status_speaks,
            },
        },
        {
            "name": "local fallback respects inverted public-listener request",
            "passed": "屏幕" in inverted_public_listener_fallback and "不出声" in inverted_public_listener_fallback,
            "detail": inverted_public_listener_fallback,
        },
        {
            "name": "local fallback respects screen-light request",
            "passed": "屏幕" in screen_light_fallback and "不出声" in screen_light_fallback,
            "detail": screen_light_fallback,
        },
        {
            "name": "local fallback respects no-earbuds text-only request",
            "passed": "屏幕" in quiet_no_earbuds_screen_fallback
            and "不出声" in quiet_no_earbuds_screen_fallback
            and "屏幕" in subway_text_only_fallback
            and "不出声" in subway_text_only_fallback,
            "detail": {
                "noEarbuds": quiet_no_earbuds_screen_fallback,
                "subway": subway_text_only_fallback,
            },
        },
        {
            "name": "local fallback respects shush request",
            "passed": "屏幕" in shush_fallback and "不出声" in shush_fallback,
            "detail": shush_fallback,
        },
        {
            "name": "local fallback respects do-not-bother request",
            "passed": "屏幕" in do_not_bother_fallback and "不出声" in do_not_bother_fallback,
            "detail": do_not_bother_fallback,
        },
        {
            "name": "local fallback respects sleeping-child request",
            "passed": "屏幕" in child_sleep_fallback and "不出声" in child_sleep_fallback,
            "detail": child_sleep_fallback,
        },
        {
            "name": "local fallback respects no-external-audio request",
            "passed": all(
                "屏幕" in reply and "不出声" in reply
                for reply in (
                    no_external_audio_fallback,
                    outdoor_too_loud_fallback,
                    public_no_sudden_song_fallback,
                )
            ),
            "detail": {
                "noExternal": no_external_audio_fallback,
                "outdoorTooLoud": outdoor_too_loud_fallback,
                "publicNoSuddenSong": public_no_sudden_song_fallback,
            },
        },
        {
            "name": "local fallback respects private-readout request",
            "passed": "屏幕" in private_readout_fallback and "不出声" in private_readout_fallback,
            "detail": private_readout_fallback,
        },
        {
            "name": "local fallback respects speaker-device request",
            "passed": "屏幕" in speaker_device_fallback and "不出声" in speaker_device_fallback,
            "detail": speaker_device_fallback,
        },
        {
            "name": "local fallback respects private-listener request",
            "passed": "屏幕" in private_listener_fallback and "不出声" in private_listener_fallback,
            "detail": private_listener_fallback,
        },
        {
            "name": "local fallback respects public-listener request",
            "passed": "屏幕" in public_listener_fallback and "不出声" in public_listener_fallback,
            "detail": public_listener_fallback,
        },
        {
            "name": "local fallback respects venue-listener request",
            "passed": "屏幕" in venue_listener_fallback and "不出声" in venue_listener_fallback,
            "detail": venue_listener_fallback,
        },
        {
            "name": "local fallback respects quiet-alone request",
            "passed": "屏幕" in quiet_alone_fallback and "不出声" in quiet_alone_fallback,
            "detail": quiet_alone_fallback,
        },
        {
            "name": "local fallback answers literary open speech",
            "passed": "阅读" in literary_fallback and "放轻" in literary_fallback,
            "detail": literary_fallback,
        },
        {
            "name": "local fallback answers tired human speech",
            "passed": "慢的" in tired_fallback and "暖的" in tired_fallback,
            "detail": tired_fallback,
        },
        {
            "name": "local fallback answers insomnia human speech",
            "passed": "不逼自己睡着" in insomnia_fallback and "放慢" in insomnia_fallback,
            "detail": insomnia_fallback,
        },
        {
            "name": "local fallback answers homesick human speech",
            "passed": "旧灯" in homesick_fallback and "回忆" in homesick_fallback,
            "detail": homesick_fallback,
        },
        {
            "name": "local fallback answers anxious human speech",
            "passed": "节奏" in anxious_fallback and "呼吸" in anxious_fallback,
            "detail": anxious_fallback,
        },
        {
            "name": "local fallback answers hurt human speech",
            "passed": "难受" in hurt_fallback and "放软" in hurt_fallback,
            "detail": hurt_fallback,
        },
        {
            "name": "local fallback answers celebratory human speech",
            "passed": "放亮" in celebration_fallback and "好消息" in celebration_fallback,
            "detail": celebration_fallback,
        },
        {
            "name": "local fallback answers focus/work human speech",
            "passed": "不抢注意力" in focus_fallback and "继续做事" in focus_fallback,
            "detail": focus_fallback,
        },
        {
            "name": "local fallback answers lakeside/outdoor human speech",
            "passed": "水边" in lake_fallback and "开阔" in lake_fallback,
            "detail": lake_fallback,
        },
        {
            "name": "local fallback answers crowded/noisy outdoor speech",
            "passed": "压低" in crowded_fallback and "人声" in crowded_fallback,
            "detail": crowded_fallback,
        },
        {
            "name": "local fallback answers lost/late outdoor speech",
            "passed": "路" in lost_fallback and "下一步" in lost_fallback,
            "detail": lost_fallback,
        },
        {
            "name": "local fallback answers late-night going-home speech",
            "passed": "回家" in going_home_fallback and "安全" in going_home_fallback,
            "detail": going_home_fallback,
        },
        {
            "name": "local fallback answers phone low-battery speech",
            "passed": "省着电" in phone_low_fallback and "长按橙色键" in phone_low_fallback,
            "detail": phone_low_fallback,
        },
        {
            "name": "local fallback answers battery-sufficiency questions",
            "passed": "省着电" in phone_battery_enough_fallback
            and "长按橙色键" in phone_battery_home_fallback
            and "尽量短句" in phone_battery_runtime_fallback
            and "省着电" in phone_save_power_fallback
            and "省着电" in bare_percent_low_battery_runtime_fallback
            and "查询不会触发播放" in low_battery_no_reminder_fallback,
            "detail": {
                "enough": phone_battery_enough_fallback,
                "home": phone_battery_home_fallback,
                "runtime": phone_battery_runtime_fallback,
                "savePower": phone_save_power_fallback,
                "barePercentRuntime": bare_percent_low_battery_runtime_fallback,
                "noReminder": low_battery_no_reminder_fallback,
            },
        },
        {
            "name": "local fallback keeps low-battery playback policy quiet",
            "passed": "自动停播" in low_battery_auto_stop_fallback
            and "误停" in low_battery_auto_stop_fallback
            and "乱播" in low_battery_continuous_play_fallback
            and "查询不会触发播放" in low_battery_no_surprise_play_fallback
            and "查询不会触发播放" in low_battery_no_song_fallback
            and "查询不会触发播放" in red_power_playback_policy_fallback
            and "查询不会触发播放" in natural_nearly_empty_playback_policy_fallback
            and "查询不会触发播放" in battery_alarm_playback_policy_fallback
            and low_battery_auto_stop_speak is False
            and low_battery_continuous_play_speak is False
            and low_battery_no_surprise_play_speak is False
            and natural_nearly_empty_playback_speak is False,
            "detail": {
                "autoStop": low_battery_auto_stop_fallback,
                "continuousPlay": low_battery_continuous_play_fallback,
                "noSurprisePlay": low_battery_no_surprise_play_fallback,
                "noSong": low_battery_no_song_fallback,
                "redPower": red_power_playback_policy_fallback,
                "naturalNearlyEmpty": natural_nearly_empty_playback_policy_fallback,
                "batteryAlarm": battery_alarm_playback_policy_fallback,
                "speaks": (
                    low_battery_auto_stop_speak,
                    low_battery_continuous_play_speak,
                    low_battery_no_surprise_play_speak,
                    natural_nearly_empty_playback_speak,
                ),
            },
        },
        {
            "name": "local fallback answers long-press button semantics",
            "passed": "短按下一首" in button_fallback
            and "双击换下一座城市" in button_short_fallback
            and "待机或静音时长按" in button_double_fallback
            and "播放中长按关闭播放并安静待命" in button_fallback
            and "播放中长按关闭播放并安静待命" in button_playing_standby_fallback
            and "播放中长按关闭播放并安静待命" in button_playing_no_restart_fallback
            and "待机或静音时长按" in button_idle_phone_fallback
            and "先试手机热点" in button_idle_no_song_fallback
            and "播放中长按关闭播放并安静待命" in button_playing_quiet_fallback
            and "播放中长按关闭播放并安静待命" in button_press_no_restart_fallback
            and "播放中长按关闭播放并安静待命" in button_long_press_alt_fallback
            and "播放中长按关闭播放并安静待命" in button_press_hold_alt_fallback
            and "待机或静音时长按" in button_idle_press_hold_alt_fallback
            and "播放中长按关闭播放并安静待命" in button_long_press_now_toggle_fallback
            and "待机或静音时长按" in button_mute_current_sunset_fallback
            and "不会绕过保护突然外放" in button_mute_guard_fallback
            and "不会绕过保护突然外放" in button_mute_noise_fallback
            and "不会绕过保护突然外放" in button_press_hold_mute_noise_fallback
            and "播放中长按关闭播放并安静待命" in button_press_long_no_random_fallback
            and "待机或静音时长按" in button_idle_key_press_long_direct_song_fallback
            and "只写屏幕不出声" in button_quiet_explain_fallback
            and "待机或静音时长按" in button_quiet_explain_fallback
            and "结果会写到状态卡" in button_status_card_fallback
            and "结果会写到状态卡" in button_screen_result_fallback
            and "结果会写到状态卡" in button_action_writeback_fallback
            and button_mute_guard_speak is False,
            "detail": {
                "long": button_fallback,
                "short": button_short_fallback,
                "double": button_double_fallback,
                "playingStandby": button_playing_standby_fallback,
                "playingNoRestart": button_playing_no_restart_fallback,
                "idlePhone": button_idle_phone_fallback,
                "idleNoSong": button_idle_no_song_fallback,
                "playingQuiet": button_playing_quiet_fallback,
                "pressNoRestart": button_press_no_restart_fallback,
                "longPressAlt": button_long_press_alt_fallback,
                "pressHoldAlt": button_press_hold_alt_fallback,
                "idlePressHoldAlt": button_idle_press_hold_alt_fallback,
                "longPressNowToggle": button_long_press_now_toggle_fallback,
                "muteCurrentSunset": button_mute_current_sunset_fallback,
                "muteGuard": button_mute_guard_fallback,
                "muteNoise": button_mute_noise_fallback,
                "pressHoldMuteNoise": button_press_hold_mute_noise_fallback,
                "pressLongNoRandom": button_press_long_no_random_fallback,
                "quietExplain": button_quiet_explain_fallback,
                "statusCard": button_status_card_fallback,
                "screenResult": button_screen_result_fallback,
                "actionWriteback": button_action_writeback_fallback,
            },
        },
        {
            "name": "local fallback answers outdoor preflight status",
            "passed": "电量" in outdoor_preflight_fallback
            and "电量" in casual_outdoor_status_fallback
            and "热点" in outdoor_preflight_fallback
            and "电量" in quick_outdoor_preflight_fallback
            and "长按橙色键" in quick_outdoor_preflight_fallback
            and "音频模式" in portable_status_fallback
            and "队列" in carry_ready_fallback
            and "隐私边界" in carry_ready_fallback
            and "长按橙色键" in outdoor_preflight_fallback,
            "detail": {
                "preflight": outdoor_preflight_fallback,
                "casualStatus": casual_outdoor_status_fallback,
                "quickPreflight": quick_outdoor_preflight_fallback,
                "portable": portable_status_fallback,
                "ready": carry_ready_fallback,
            },
        },
        {
            "name": "local fallback answers portable hotspot failover",
            "passed": "PocketEarth-iPhone" in hotspot_fallback
            and "PocketEarth-Android" in hotspot_fallback
            and "家里 Wi-Fi" in hotspot_fallback
            and "失败原因" in hotspot_fallback,
            "detail": hotspot_fallback,
        },
        {
            "name": "local fallback answers exact hotspot priority",
            "passed": all(
                "PocketEarth-iPhone" in reply and "PocketEarth-Android" in reply and "家里 Wi-Fi" in reply
                for reply in (
                    hotspot_priority_fallback,
                    hotspot_home_wifi_fallback,
                    vivo_priority_fallback,
                    vivo_open_priority_fallback,
                    two_hotspots_priority_fallback,
                    hotspot_both_missing_casual_fallback,
                    guarded_vivo_home_wifi_fallback,
                    guarded_iphone_failure_vivo_fallback,
                )
            ),
            "detail": {
                "priority": hotspot_priority_fallback,
                "homeWifi": hotspot_home_wifi_fallback,
                "vivo": vivo_priority_fallback,
                "vivoOpen": vivo_open_priority_fallback,
                "twoHotspots": two_hotspots_priority_fallback,
                "twoHotspotsMissingCasual": hotspot_both_missing_casual_fallback,
                "guardedVivoHomeWifi": guarded_vivo_home_wifi_fallback,
                "guardedIphoneFailureVivo": guarded_iphone_failure_vivo_fallback,
            },
        },
        {
            "name": "local fallback answers hotspot failure edge cases",
            "passed": all(
                "PocketEarth-iPhone" in reply and "PocketEarth-Android" in reply and "家里 Wi-Fi" in reply
                for reply in (
                    hotspot_both_missing_fallback,
                    vivo_failure_fallback,
                    outdoor_hotspot_failure_fallback,
                    wifi_repeat_switch_fallback,
                )
            )
            and "不进 git" in hotspot_secret_git_fallback,
            "detail": {
                "bothMissing": hotspot_both_missing_fallback,
                "vivoFailure": vivo_failure_fallback,
                "outdoorFailure": outdoor_hotspot_failure_fallback,
                "secretGit": hotspot_secret_git_fallback,
                "repeatSwitch": wifi_repeat_switch_fallback,
            },
        },
        {
            "name": "local fallback answers phone hotspot status phrasing",
            "passed": "当前 SSID" in phone_hotspot_status_fallback
            and "手机热点" in phone_hotspot_status_fallback
            and "当前 SSID" in current_phone_attached_fallback
            and "手机热点" in current_phone_attached_fallback
            and "当前 SSID" in current_casual_tether_fallback
            and "手机热点" in current_casual_tether_fallback
            and "当前 SSID" in current_phone_tethered_fallback
            and "手机热点" in current_phone_tethered_fallback
            and "当前 SSID" in guarded_phone_hotspot_status_fallback
            and "手机热点" in guarded_phone_hotspot_status_fallback,
            "detail": {
                "connected": phone_hotspot_status_fallback,
                "attached": current_phone_attached_fallback,
                "casualTether": current_casual_tether_fallback,
                "phoneTethered": current_phone_tethered_fallback,
                "guardedPhoneStatus": guarded_phone_hotspot_status_fallback,
            },
        },
        {
            "name": "local fallback answers mobile data status phrasing",
            "passed": "当前 SSID" in mobile_data_status_fallback
            and "手机热点" in mobile_data_status_fallback
            and "当前 SSID" in cellular_route_status_fallback
            and "手机热点" in cellular_route_status_fallback,
            "detail": {
                "mobileData": mobile_data_status_fallback,
                "cellular": cellular_route_status_fallback,
            },
        },
        {
            "name": "local fallback answers network status and secret boundaries",
            "passed": "当前 SSID" in current_network_fallback
            and "当前 SSID" in current_wifi_name_fallback
            and "当前 SSID" in guarded_network_ssid_fallback
            and "当前 SSID" in home_or_phone_network_fallback
            and "当前 SSID" in current_home_network_casual_fallback
            and "当前 SSID" in current_network_presence_fallback
            and "当前 SSID" in current_network_loss_fallback
            and "当前 SSID" in current_network_offline_fallback
            and "当前 SSID" in current_network_alive_fallback
            and "当前 SSID" in current_network_dead_fallback
            and "当前 SSID" in current_wifi_health_fallback
            and "当前 SSID" in hotspot_stability_fallback
            and "手机热点" in portable_network_recovery_fallback
            and "手机热点" in away_find_phone_fallback
            and "手机热点" in away_from_home_network_fallback
            and "手机热点" in outdoor_no_network_recovery_fallback
            and "不会直接播放" in no_network_playback_fallback
            and "失败原因" in hotspot_failure_fallback
            and "当前 SSID" in guarded_casual_tether_fallback
            and "不进 git" in hotspot_secret_fallback
            and "不进 git" in hotspot_secret_log_fallback
            and "不进 git" in hotspot_secret_readout_fallback
            and "不进 git" in hotspot_secret_screen_direct_fallback
            and "不进 git" in wifi_secret_hidden_fallback
            and chat_agent.should_speak("手机热点密码会不会被你念出来") is False
            and hotspot_secret_screen_direct_speak is False
            and wifi_secret_hidden_speak is False
            and "PocketEarth-Android" in apple_hotspot_missing_vivo_fallback,
            "detail": {
                "network": current_network_fallback,
                "wifiName": current_wifi_name_fallback,
                "guardedSsid": guarded_network_ssid_fallback,
                "homeOrPhoneNetwork": home_or_phone_network_fallback,
                "homeNetworkCasual": current_home_network_casual_fallback,
                "networkPresence": current_network_presence_fallback,
                "networkLoss": current_network_loss_fallback,
                "networkOffline": current_network_offline_fallback,
                "networkAlive": current_network_alive_fallback,
                "networkDead": current_network_dead_fallback,
                "wifiHealth": current_wifi_health_fallback,
                "hotspotStability": hotspot_stability_fallback,
                "portableNetwork": portable_network_recovery_fallback,
                "awayFindPhone": away_find_phone_fallback,
                "awayFromHome": away_from_home_network_fallback,
                "outdoorNoNetwork": outdoor_no_network_recovery_fallback,
                "noNetworkPlayback": no_network_playback_fallback,
                "failure": hotspot_failure_fallback,
                "guardedCasualTether": guarded_casual_tether_fallback,
                "secret": hotspot_secret_fallback,
                "secretLog": hotspot_secret_log_fallback,
                "secretReadout": hotspot_secret_readout_fallback,
                "secretScreenDirect": hotspot_secret_screen_direct_fallback,
                "wifiSecretHidden": wifi_secret_hidden_fallback,
                "appleMissingVivo": apple_hotspot_missing_vivo_fallback,
            },
        },
        {
            "name": "local fallback leaves casual network topics conversational",
            "passed": "当前 SSID" not in casual_network_novel_fallback
            and "手机热点" not in casual_network_novel_fallback
            and "当前 SSID" not in casual_network_match_fallback
            and "手机热点" not in casual_network_match_fallback
            and chat_agent.should_speak("这次比赛网络评分怎么样") is False,
            "detail": {
                "networkNovel": casual_network_novel_fallback,
                "networkMatch": casual_network_match_fallback,
            },
        },
        {
            "name": "local fallback answers hungry human speech",
            "passed": "吃" in hungry_fallback and "不催人" in hungry_fallback,
            "detail": hungry_fallback,
        },
        {
            "name": "local fallback answers cold outdoor human speech",
            "passed": "暖" in cold_fallback and "外套" in cold_fallback,
            "detail": cold_fallback,
        },
        {
            "name": "local fallback answers hot outdoor human speech",
            "passed": "清" in hot_fallback and "空气" in hot_fallback,
            "detail": hot_fallback,
        },
        {
            "name": "local fallback answers practical outdoor needs",
            "passed": "指示牌" in practical_fallback and "找地方" in practical_fallback,
            "detail": practical_fallback,
        },
        {
            "name": "local fallback answers rain shelter needs",
            "passed": "屋檐" in rain_shelter_fallback and "看路" in rain_shelter_fallback,
            "detail": rain_shelter_fallback,
        },
        {
            "name": "local fallback explains ambient scan privacy boundary",
            "passed": "扫描此刻" in ambient_scan_fallback
            and "分析后删图" in ambient_scan_fallback
            and all(
                "手动同意边界" in reply
                and "扫描此刻" in reply
                and "不上传" in reply
                and "分析后删图" in reply
                for reply in (
                    ambient_manual_consent_fallback,
                    ambient_no_button_photo_fallback,
                    ambient_no_auto_photo_fallback,
                    no_open_camera_status_fallback,
                    no_open_camera_road_status_fallback,
                    ambient_secret_photo_fallback,
                    ambient_ask_before_scan_fallback,
                    ambient_manual_trigger_fallback,
                    ambient_no_photo_storage_fallback,
                    ambient_no_cloud_photo_fallback,
                )
            )
            and "扫描此刻" in ambient_continuous_capture_fallback
            and "不会自动调音或播放" in ambient_auto_scan_fallback
            and "不识别身份或表情" in ambient_tuning_fallback
            and "不做环境录音" in ambient_frame_fallback
            and "不会自动调音或播放" in ambient_frame_fallback
            and all(
                "扫描此刻" in reply
                and "分析后删图" in reply
                and "不读、保存或上传" in reply
                for reply in visual_identifier_privacy_fallbacks.values()
            )
            and all(
                token in visual_identifier_privacy_fallbacks["plate"]
                for token in ("车牌", "屏幕文字")
            )
            and "证件号" in visual_identifier_privacy_fallbacks["idNumber"]
            and "二维码" in visual_identifier_privacy_fallbacks["qrCode"]
            and "门牌号" in visual_identifier_privacy_fallbacks["doorplate"]
            and all(speak is False for speak in visual_identifier_privacy_speaks.values())
            and all(
                "手动同意边界" in reply and "不开摄像头" in reply
                for reply in ambient_extra_manual_fallbacks.values()
            )
            and all(
                "扫描此刻" in reply
                and "分析后删图" in reply
                and "不识别身份或表情" in reply
                and "不会自动调音或播放" in reply
                for reply in ambient_extra_scan_fallbacks.values()
            )
            and all(speak is False for speak in ambient_extra_privacy_speaks.values()),
            "detail": {
                "scan": ambient_scan_fallback,
                "manualConsent": ambient_manual_consent_fallback,
                "noButtonPhoto": ambient_no_button_photo_fallback,
                "noAutoPhoto": ambient_no_auto_photo_fallback,
                "noOpenCameraStatus": no_open_camera_status_fallback,
                "noOpenCameraRoadStatus": no_open_camera_road_status_fallback,
                "secretPhoto": ambient_secret_photo_fallback,
                "askBeforeScan": ambient_ask_before_scan_fallback,
                "manualTrigger": ambient_manual_trigger_fallback,
                "noPhotoStorage": ambient_no_photo_storage_fallback,
                "noCloudPhoto": ambient_no_cloud_photo_fallback,
                "continuousCapture": ambient_continuous_capture_fallback,
                "autoScan": ambient_auto_scan_fallback,
                "tuning": ambient_tuning_fallback,
                "frame": ambient_frame_fallback,
                "visualIdentifiers": visual_identifier_privacy_fallbacks,
                "visualIdentifierSpeaks": visual_identifier_privacy_speaks,
                "extraManual": ambient_extra_manual_fallbacks,
                "extraScan": ambient_extra_scan_fallbacks,
                "extraSpeaks": ambient_extra_privacy_speaks,
            },
        },
        {
            "name": "local fallback answers natural camera privacy questions",
            "passed": all(
                "扫描此刻" in reply and "不识别身份或表情" in reply
                for reply in (privacy_fallback, expression_recognition_fallback, lens_privacy_fallback)
            ),
            "detail": {
                "privacy": privacy_fallback,
                "expression": expression_recognition_fallback,
                "lens": lens_privacy_fallback,
            },
        },
        {
            "name": "local fallback answers ambient memory location boundary",
            "passed": "不长期记住" in ambient_memory_location_fallback
            and "位置" in ambient_memory_location_fallback
            and "偏好" in ambient_memory_location_fallback,
            "detail": ambient_memory_location_fallback,
        },
        {
            "name": "local fallback answers audio privacy questions",
            "passed": all(
                "不做环境录音" in reply and "扫描此刻" in reply
                for reply in (audio_privacy_fallback, terse_audio_privacy_fallback)
            )
            and all(
                "语音隐私" in reply and "不长期保存声音" in reply and "不会触发播放" in reply
                for reply in (
                    speech_cloud_privacy_fallback,
                    voice_storage_privacy_fallback,
                    always_listening_privacy_fallback,
                    always_on_mic_privacy_fallback,
                    no_open_microphone_status_fallback,
                    server_upload_privacy_fallback,
                )
            )
            and no_open_camera_status_speak is False
            and no_open_camera_road_status_speak is False
            and no_open_microphone_status_speak is False,
            "detail": {
                "audio": audio_privacy_fallback,
                "terse": terse_audio_privacy_fallback,
                "noOpenMicrophoneStatus": no_open_microphone_status_fallback,
                "speechCloud": speech_cloud_privacy_fallback,
                "voiceStorage": voice_storage_privacy_fallback,
                "alwaysListening": always_listening_privacy_fallback,
                "alwaysOnMic": always_on_mic_privacy_fallback,
                "serverUpload": server_upload_privacy_fallback,
                "speaks": {
                    "noOpenCameraStatus": no_open_camera_status_speak,
                    "noOpenCameraRoadStatus": no_open_camera_road_status_speak,
                    "noOpenMicrophoneStatus": no_open_microphone_status_speak,
                },
            },
        },
        {
            "name": "local fallback answers identity memory privacy requests",
            "passed": all(
                "语音隐私" in reply
                and "身份" in reply
                and "姓名" in reply
                and "同行关系" in reply
                and "不会触发播放" in reply
                for reply in (
                    identity_memory_privacy_fallback,
                    name_memory_privacy_fallback,
                    companion_memory_privacy_fallback,
                    companion_outdoor_privacy_fallback,
                    destination_memory_privacy_fallback,
                    destination_cloud_privacy_fallback,
                    companion_record_privacy_fallback,
                    debug_log_privacy_fallback,
                    route_log_privacy_fallback,
                    destination_log_privacy_question_fallback,
                    error_log_location_privacy_fallback,
                    destination_retention_privacy_fallback,
                    companion_retention_privacy_fallback,
                    route_retention_privacy_fallback,
                    voice_retention_privacy_fallback,
                    companion_log_privacy_fallback,
                )
            )
            and all(
                "调试日志" in reply
                for reply in (
                    debug_log_privacy_fallback,
                    route_log_privacy_fallback,
                    destination_log_privacy_question_fallback,
                    error_log_location_privacy_fallback,
                )
            )
            and all(
                speak is False
                for speak in (
                    server_upload_privacy_speak,
                    destination_memory_privacy_speak,
                    destination_cloud_privacy_speak,
                    companion_record_privacy_speak,
                    companion_outdoor_privacy_speak,
                    debug_log_privacy_speak,
                    route_log_privacy_speak,
                    destination_log_privacy_question_speak,
                    error_log_location_privacy_speak,
                    destination_retention_privacy_speak,
                    companion_retention_privacy_speak,
                    route_retention_privacy_speak,
                    voice_retention_privacy_speak,
                    companion_log_privacy_speak,
                    preference_retention_speak,
                )
            )
            and "偏好" in preference_retention_fallback,
            "detail": {
                "identity": identity_memory_privacy_fallback,
                "name": name_memory_privacy_fallback,
                "companion": companion_memory_privacy_fallback,
                "companionOutdoor": companion_outdoor_privacy_fallback,
                "serverUpload": server_upload_privacy_fallback,
                "destinationMemory": destination_memory_privacy_fallback,
                "destinationCloud": destination_cloud_privacy_fallback,
                "companionRecord": companion_record_privacy_fallback,
                "debugLog": debug_log_privacy_fallback,
                "routeLog": route_log_privacy_fallback,
                "destinationLogQuestion": destination_log_privacy_question_fallback,
                "errorLogLocation": error_log_location_privacy_fallback,
                "destinationRetention": destination_retention_privacy_fallback,
                "companionRetention": companion_retention_privacy_fallback,
                "routeRetention": route_retention_privacy_fallback,
                "voiceRetention": voice_retention_privacy_fallback,
                "companionLog": companion_log_privacy_fallback,
                "preferenceRetention": preference_retention_fallback,
                "speaks": {
                    "serverUpload": server_upload_privacy_speak,
                    "destinationMemory": destination_memory_privacy_speak,
                    "destinationCloud": destination_cloud_privacy_speak,
                    "companionRecord": companion_record_privacy_speak,
                    "companionOutdoor": companion_outdoor_privacy_speak,
                    "debugLog": debug_log_privacy_speak,
                    "routeLog": route_log_privacy_speak,
                    "destinationLogQuestion": destination_log_privacy_question_speak,
                    "errorLogLocation": error_log_location_privacy_speak,
                    "destinationRetention": destination_retention_privacy_speak,
                    "companionRetention": companion_retention_privacy_speak,
                    "routeRetention": route_retention_privacy_speak,
                    "voiceRetention": voice_retention_privacy_speak,
                    "companionLog": companion_log_privacy_speak,
                    "preferenceRetention": preference_retention_speak,
                },
            },
        },
        {
            "name": "local fallback answers previous action status questions",
            "passed": "上一动作状态" in last_action_fallback and "不会重复执行" in last_action_fallback,
            "detail": last_action_fallback,
        },
        {
            "name": "local fallback answers previous action variant questions",
            "passed": "上一动作状态" in last_action_variant_fallback
            and "不会重复执行" in last_action_variant_fallback
            and "上一动作状态" in last_action_error_fallback
            and "失败原因" in last_action_error_fallback,
            "detail": {"variant": last_action_variant_fallback, "error": last_action_error_fallback},
        },
        {
            "name": "local fallback answers casual previous action status variants",
            "passed": all(
                ("动作状态" in reply and "不重复下发" in reply)
                or ("上一动作状态" in reply and "不会重复执行" in reply)
                for reply in (
                    last_action_short_result_fallback,
                    last_action_casual_result_fallback,
                    last_action_route_recall_fallback,
                    last_action_tool_used_fallback,
                    last_action_capability_used_fallback,
                    last_action_state_retained_fallback,
                )
            ),
            "detail": {
                "shortResult": last_action_short_result_fallback,
                "casualResult": last_action_casual_result_fallback,
                "routeRecall": last_action_route_recall_fallback,
                "toolUsed": last_action_tool_used_fallback,
                "capabilityUsed": last_action_capability_used_fallback,
                "stateRetained": last_action_state_retained_fallback,
            },
        },
        {
            "name": "local fallback answers previous skill/tool questions",
            "passed": "用到的技能" in last_skill_fallback and "失败原因" in last_skill_fallback,
            "detail": last_skill_fallback,
        },
        {
            "name": "local fallback answers previous skill/tool variants",
            "passed": "用到的技能" in last_skill_variant_fallback and "不会重复执行" in last_skill_variant_fallback,
            "detail": last_skill_variant_fallback,
        },
        {
            "name": "local fallback answers last-heard ASR questions",
            "passed": "上一句语音" in last_heard_fallback and "不会按旧指令继续执行" in last_heard_fallback,
            "detail": last_heard_fallback,
        },
        {
            "name": "local fallback answers last-heard ASR variants",
            "passed": "上一句语音" in last_heard_variant_fallback
            and "不会按旧指令继续执行" in last_heard_variant_fallback
            and "上一句语音" in last_heard_short_fallback
            and "上一句语音" in last_heard_understood_fallback
            and "上一句语音" in last_heard_misheard_question_fallback
            and "上一句语音" in last_heard_misheard_direct_fallback
            and "上一句语音" in last_heard_plain_fallback
            and "上一句语音" in last_heard_casual_request_fallback
            and "上一句语音" in last_heard_instruction_fallback,
            "detail": {
                "variant": last_heard_variant_fallback,
                "short": last_heard_short_fallback,
                "understood": last_heard_understood_fallback,
                "misheard": last_heard_misheard_question_fallback,
                "misheardDirect": last_heard_misheard_direct_fallback,
                "plain": last_heard_plain_fallback,
                "casualRequest": last_heard_casual_request_fallback,
                "instruction": last_heard_instruction_fallback,
            },
        },
        {
            "name": "local fallback answers previous reply questions",
            "passed": "上一句回复" in previous_reply_fallback and "不会重新执行动作" in previous_reply_fallback,
            "detail": previous_reply_fallback,
        },
        {
            "name": "local fallback answers previous reply variants",
            "passed": all(
                "上一句回复" in reply and "重新执行动作" in reply
                for reply in (
                    previous_reply_variant_fallback,
                    previous_reply_retype_fallback,
                    previous_reply_screen_fallback,
                    previous_reply_retained_fallback,
                    quiet_previous_reply_fallback,
                )
            )
            and all(
                should_speak is False
                for should_speak in (
                    previous_reply_retype_speak,
                    previous_reply_screen_speak,
                    previous_reply_retained_speak,
                    quiet_previous_reply_speak,
                )
            ),
            "detail": {
                "variant": previous_reply_variant_fallback,
                "retype": previous_reply_retype_fallback,
                "screen": previous_reply_screen_fallback,
                "retained": previous_reply_retained_fallback,
                "quiet": quiet_previous_reply_fallback,
                "speaks": {
                    "retype": previous_reply_retype_speak,
                    "screen": previous_reply_screen_speak,
                    "retained": previous_reply_retained_speak,
                    "quiet": quiet_previous_reply_speak,
                },
            },
        },
        {
            "name": "local fallback confirms previous utterance cancellation",
            "passed": "上一句先作废" in cancel_previous_fallback
            and "不会按那条继续执行" in retract_previous_fallback
            and "上一句先作废" in previous_sentence_hold_fallback
            and "上一句先作废" in previous_sentence_no_action_fallback
            and "上一句先作废" in previous_command_no_run_fallback
            and "停播" in misspoke_fallback
            and "上一句先作废" in previous_sentence_void_fallback
            and "上一句先作废" in retract_previous_command_fallback
            and "上一句先作废" in previous_sentence_not_counted_fallback
            and "上一句先作废" in misspoke_song_name_fallback
            and all(
                "上一句按外部声音处理" in reply
                and "不下命令" in reply
                and "不连热点" in reply
                and "不播放" in reply
                for reply in (
                    tv_source_cancel_fallback,
                    passerby_source_cancel_fallback,
                    bystander_source_cancel_fallback,
                    not_my_voice_cancel_fallback,
                    not_my_voice_hotspot_cancel_fallback,
                )
            ),
            "detail": {
                "cancel": cancel_previous_fallback,
                "retract": retract_previous_fallback,
                "hold": previous_sentence_hold_fallback,
                "noAction": previous_sentence_no_action_fallback,
                "noRun": previous_command_no_run_fallback,
                "misspoke": misspoke_fallback,
                "void": previous_sentence_void_fallback,
                "retractCommand": retract_previous_command_fallback,
                "notCounted": previous_sentence_not_counted_fallback,
                "misspokeSong": misspoke_song_name_fallback,
                "tvSource": tv_source_cancel_fallback,
                "passerbySource": passerby_source_cancel_fallback,
                "bystanderSource": bystander_source_cancel_fallback,
                "notMyVoice": not_my_voice_cancel_fallback,
                "notMyVoiceHotspot": not_my_voice_hotspot_cancel_fallback,
            },
        },
        {
            "name": "local fallback answers command queue status questions",
            "passed": "命令队列" in queue_stuck_fallback
            and "待处理数量" in queue_stuck_fallback
            and "不会重复提交旧命令" in queue_stuck_fallback
            and "命令队列" in queue_current_items_fallback
            and "不会重复提交旧命令" in queue_current_items_fallback
            and "命令队列" in previous_request_stuck_fallback
            and "命令队列" in previous_request_short_stuck_fallback
            and "命令队列" in previous_queue_item_fallback
            and "命令队列" in previous_queue_item_casual_fallback,
            "detail": {
                "stuck": queue_stuck_fallback,
                "currentItems": queue_current_items_fallback,
                "previousRequest": previous_request_stuck_fallback,
                "previousShortRequest": previous_request_short_stuck_fallback,
                "previousQueueItem": previous_queue_item_fallback,
                "previousQueueItemCasual": previous_queue_item_casual_fallback,
            },
        },
        {
            "name": "local fallback answers startup recovery questions",
            "passed": "systemd" in startup_recovery_fallback
            and "Whisplay" in autostart_fallback
            and "静音守卫" in systemd_fallback
            and "不自动播放" in startup_recovery_fallback,
            "detail": {
                "recovery": startup_recovery_fallback,
                "autostart": autostart_fallback,
                "systemd": systemd_fallback,
            },
        },
        {
            "name": "local fallback answers service health questions",
            "passed": "服务医生" in service_status_fallback
            and "静音守卫" in service_status_fallback
            and "服务医生" in service_health_fallback
            and "服务医生" in no_restart_service_alive_fallback
            and "服务医生" in no_restart_backend_online_fallback,
            "detail": {
                "service": service_status_fallback,
                "health": service_health_fallback,
                "noRestartAlive": no_restart_service_alive_fallback,
                "noRestartOnline": no_restart_backend_online_fallback,
            },
        },
        {
            "name": "local fallback answers screen/button doctor questions",
            "passed": "Whisplay" in screen_status_fallback
            and "头像渲染" in screen_status_fallback
            and "橙色键长按语义" in button_problem_fallback
            and "不会触发播放" in button_problem_fallback,
            "detail": {"screen": screen_status_fallback, "button": button_problem_fallback},
        },
        {
            "name": "local fallback explains Whisplay status card fields",
            "passed": "Whisplay 状态卡" in whisplay_status_fallback
            and "城市" in whisplay_status_fallback
            and "头像/刷新" in whisplay_status_current_fallback
            and "不改播放" in whisplay_refresh_fallback
            and "头像渲染" in whisplay_screen_stuck_fallback
            and "头像/刷新" in whisplay_avatar_moving_fallback
            and "不会触发播放" in whisplay_little_avatar_stuck_fallback
            and "失败原因" in hotspot_status_card_fallback
            and "失败原因" in status_card_action_failure_fallback
            and "网络/静音" in whisplay_low_battery_card_fallback
            and "不改播放" in whisplay_playback_status_fallback
            and "歌曲" in screen_city_track_status_fallback
            and "网络/静音" in screen_city_track_status_fallback
            and "不改播放" in whisplay_status_fallback,
            "detail": {
                "statusCard": whisplay_status_fallback,
                "statusCardCurrent": whisplay_status_current_fallback,
                "refresh": whisplay_refresh_fallback,
                "screenStuck": whisplay_screen_stuck_fallback,
                "avatarMoving": whisplay_avatar_moving_fallback,
                "littleAvatarStuck": whisplay_little_avatar_stuck_fallback,
                "hotspotStatusCard": hotspot_status_card_fallback,
                "actionFailureStatusCard": status_card_action_failure_fallback,
                "lowBatteryCard": whisplay_low_battery_card_fallback,
                "playbackStatusCard": whisplay_playback_status_fallback,
                "screenFields": screen_city_track_status_fallback,
            },
        },
        {
            "name": "local fallback explains local control API boundaries",
            "passed": "本地控制 API" in local_control_fallback
            and "局域网" in local_control_fallback
            and "读状态" in local_control_fallback
            and "不暴露公网" in local_control_phone_panel_fallback
            and "本地控制 API" in local_control_phone_web_status_fallback
            and "热点状态" not in local_control_phone_web_status_fallback
            and "不暴露公网" in local_control_public_exposure_fallback
            and "不暴露公网" in local_api_public_fallback
            and "查询不直接播放" in local_api_public_fallback,
            "detail": {
                "control": local_control_fallback,
                "phonePanel": local_control_phone_panel_fallback,
                "phoneWebStatus": local_control_phone_web_status_fallback,
                "publicExposure": local_control_public_exposure_fallback,
                "public": local_api_public_fallback,
            },
        },
        {
            "name": "local fallback explains capability readiness summary",
            "passed": "能力总览" in capability_ready_fallback
            and "云端 DJ" in capability_ready_fallback
            and "TTS" in tts_ready_fallback
            and "ASR 唤醒" in tts_ready_fallback
            and "ready/pending" in capability_pending_fallback
            and "不会触发播放" in capability_pending_fallback,
            "detail": {
                "ready": capability_ready_fallback,
                "pending": capability_pending_fallback,
                "ttsAsr": tts_ready_fallback,
            },
        },
        {
            "name": "local fallback explains callable skills",
            "passed": all(
                "点歌切城" in reply and "状态医生" in reply and "环境隐私" in reply
                for reply in (skill_fallback, skill_actions_fallback, skill_tools_fallback, no_call_skill_status_fallback)
            ),
            "detail": {
                "skill": skill_fallback,
                "actions": skill_actions_fallback,
                "tools": skill_tools_fallback,
                "noCallStatus": no_call_skill_status_fallback,
            },
        },
        {
            "name": "local fallback answers current city questions without switching",
            "passed": all(
                "状态卡" in reply and "不会" in reply and "切歌" in reply
                for reply in (
                    current_city_fallback,
                    current_city_casual_where_fallback,
                    current_city_where_fallback,
                    no_continue_current_city_fallback,
                    no_open_radio_current_city_fallback,
                )
            ),
            "detail": {
                "current": current_city_fallback,
                "casualWhere": current_city_casual_where_fallback,
                "where": current_city_where_fallback,
                "noContinue": no_continue_current_city_fallback,
                "noOpenRadio": no_open_radio_current_city_fallback,
            },
        },
        {
            "name": "local fallback answers current-place followups without switching",
            "passed": all(
                "状态卡" in reply and "不会" in reply and "切歌" in reply
                for reply in (
                    current_city_followup_fallback,
                    current_city_following_fallback,
                    current_sunset_followup_fallback,
                    current_sunset_which_fallback,
                    current_sunset_where_fallback,
                    current_sunset_city_fallback,
                    current_sunset_city_natural_fallback,
                    current_sunset_city_phrase_fallback,
                    current_sunset_city_question_fallback,
                    screen_city_where_fallback,
                    no_speaker_current_city_fallback,
                    no_switch_city_now_place_fallback,
                    current_station_city_order_fallback,
                )
            )
            and no_speaker_current_city_speak is False,
            "detail": {
                "city": current_city_followup_fallback,
                "followingCity": current_city_following_fallback,
                "sunset": current_sunset_followup_fallback,
                "sunsetWhich": current_sunset_which_fallback,
                "sunsetWhere": current_sunset_where_fallback,
                "sunsetCity": current_sunset_city_fallback,
                "sunsetCityNatural": current_sunset_city_natural_fallback,
                "sunsetCityPhrase": current_sunset_city_phrase_fallback,
                "sunsetCityQuestion": current_sunset_city_question_fallback,
                "screenCity": screen_city_where_fallback,
                "noSpeakerCity": no_speaker_current_city_fallback,
                "noSpeakerCitySpeak": no_speaker_current_city_speak,
                "noSwitchCityNowPlace": no_switch_city_now_place_fallback,
                "stationCityOrder": current_station_city_order_fallback,
            },
        },
        {
            "name": "local fallback answers current track questions without switching",
            "passed": "当前播放" in current_track_fallback and "写回屏幕" in current_track_fallback and "切歌" in current_track_fallback,
            "detail": current_track_fallback,
        },
        {
            "name": "local fallback answers terse current-track followups",
            "passed": all(
                "当前播放" in reply and "写回屏幕" in reply and "切歌" in reply
                for reply in (
                    current_track_casual_artist_fallback,
                    current_song_artist_direct_fallback,
                    current_song_artist_plain_fallback,
                    current_title_casual_recall_fallback,
                    current_title_short_fallback,
                    current_title_now_casual_fallback,
                    current_song_city_belongs_fallback,
                    current_song_city_direct_fallback,
                    current_song_where_from_fallback,
                    current_song_plain_from_fallback,
                    current_song_from_city_fallback,
                    current_song_plain_from_city_fallback,
                    current_artist_followup_fallback,
                    current_title_followup_fallback,
                    current_singing_which_fallback,
                    current_singing_which_casual_fallback,
                    current_song_which_fallback,
                    current_track_ringing_fallback,
                    current_ringing_front_fallback,
                    recent_ringing_track_fallback,
                    recent_current_song_fallback,
                    currently_playing_which_fallback,
                    current_who_singing_fallback,
                    current_sound_artist_fallback,
                    current_singing_artist_fallback,
                    current_song_artist_terse_fallback,
                    current_city_song_compound_fallback,
                    current_song_city_casual_fallback,
                    current_station_casual_fallback,
                    current_station_name_fallback,
                    current_track_city_origin_fallback,
                    current_station_artist_fallback,
                    current_station_title_write_fallback,
                    quiet_current_track_city_fallback,
                    quiet_current_track_index_fallback,
                    quiet_current_song_no_voice_fallback,
                    no_resume_current_song_fallback,
                    no_resume_terse_current_song_fallback,
                    no_audio_current_song_fallback,
                    no_previous_current_song_fallback,
                    no_switch_current_artist_fallback,
                    previous_song_recall_fallback,
                    previous_song_direct_title_fallback,
                    previous_song_heard_direct_fallback,
                    previous_rang_artist_fallback,
                    previous_rang_title_fallback,
                    previous_heard_artist_direct_fallback,
                    previous_song_played_back_fallback,
                    previous_song_no_replay_name_fallback,
                    previous_song_no_replay_direct_name_fallback,
                    no_rewind_previous_song_title_fallback,
                    no_replay_previous_song_title_fallback,
                    previous_station_song_title_no_cut_fallback,
                    previous_heard_artist_no_replay_fallback,
                    no_cut_station_song_title_fallback,
                    no_replay_previous_artist_fallback,
                    previous_song_recall_no_play_fallback,
                    previous_song_stop_origin_casual_fallback,
                    previous_song_title_fallback,
                    previous_song_city_origin_terse_fallback,
                    previous_song_artist_fallback,
                    previous_song_from_place_terse_fallback,
                    no_sound_current_title_fallback,
                )
            )
            and quiet_current_track_city_speak is False
            and quiet_current_track_index_speak is False
            and quiet_current_song_no_voice_speak is False
            and no_sound_current_title_speak is False
            and no_rewind_previous_song_title_speak is False
            and no_replay_previous_song_title_speak is False
            and previous_station_song_title_no_cut_speak is False
            and previous_heard_artist_no_replay_speak is False
            and no_cut_station_song_title_speak is False
            and no_replay_previous_artist_speak is False
            and previous_song_recall_no_play_speak is False,
            "detail": {
                "casualArtist": current_track_casual_artist_fallback,
                "directArtist": current_song_artist_direct_fallback,
                "plainArtist": current_song_artist_plain_fallback,
                "casualTitle": current_title_casual_recall_fallback,
                "shortTitle": current_title_short_fallback,
                "nowCasualTitle": current_title_now_casual_fallback,
                "belongs": current_song_city_belongs_fallback,
                "cityDirect": current_song_city_direct_fallback,
                "whereFrom": current_song_where_from_fallback,
                "plainFrom": current_song_plain_from_fallback,
                "fromCity": current_song_from_city_fallback,
                "plainFromCity": current_song_plain_from_city_fallback,
                "artist": current_artist_followup_fallback,
                "title": current_title_followup_fallback,
                "whoSinging": current_who_singing_fallback,
                "soundArtist": current_sound_artist_fallback,
                "singingArtist": current_singing_artist_fallback,
                "songArtistTerse": current_song_artist_terse_fallback,
                "compoundCitySong": current_city_song_compound_fallback,
                "songCityCasual": current_song_city_casual_fallback,
                "stationCasual": current_station_casual_fallback,
                "stationName": current_station_name_fallback,
                "trackCityOrigin": current_track_city_origin_fallback,
                "stationArtist": current_station_artist_fallback,
                "stationTitleWrite": current_station_title_write_fallback,
                "quietCityTrack": quiet_current_track_city_fallback,
                "quietCityTrackSpeak": quiet_current_track_city_speak,
                "quietTrackIndex": quiet_current_track_index_fallback,
                "quietTrackIndexSpeak": quiet_current_track_index_speak,
                "quietCurrentNoVoice": quiet_current_song_no_voice_fallback,
                "quietCurrentNoVoiceSpeak": quiet_current_song_no_voice_speak,
                "noResume": no_resume_current_song_fallback,
                "noResumeTerse": no_resume_terse_current_song_fallback,
                "noAudio": no_audio_current_song_fallback,
                "noPrevious": no_previous_current_song_fallback,
                "noSwitchArtist": no_switch_current_artist_fallback,
                "singingWhich": current_singing_which_fallback,
                "singingWhichCasual": current_singing_which_casual_fallback,
                "which": current_song_which_fallback,
                "ringing": current_track_ringing_fallback,
                "ringingFront": current_ringing_front_fallback,
                "recentCurrent": recent_current_song_fallback,
                "currentlyPlaying": currently_playing_which_fallback,
                "previousRecall": previous_song_recall_fallback,
                "previousDirectTitle": previous_song_direct_title_fallback,
                "previousHeardDirect": previous_song_heard_direct_fallback,
                "previousRangArtist": previous_rang_artist_fallback,
                "previousRangTitle": previous_rang_title_fallback,
                "previousHeardArtistDirect": previous_heard_artist_direct_fallback,
                "previousPlayedBack": previous_song_played_back_fallback,
                "previousNoReplayName": previous_song_no_replay_name_fallback,
                "previousNoReplayDirectName": previous_song_no_replay_direct_name_fallback,
                "noRewindPreviousTitle": no_rewind_previous_song_title_fallback,
                "noRewindPreviousTitleSpeak": no_rewind_previous_song_title_speak,
                "noReplayPreviousTitle": no_replay_previous_song_title_fallback,
                "noReplayPreviousTitleSpeak": no_replay_previous_song_title_speak,
                "previousStationTitleNoCut": previous_station_song_title_no_cut_fallback,
                "previousStationTitleNoCutSpeak": previous_station_song_title_no_cut_speak,
                "previousHeardArtistNoReplay": previous_heard_artist_no_replay_fallback,
                "previousHeardArtistNoReplaySpeak": previous_heard_artist_no_replay_speak,
                "noCutStationSongTitle": no_cut_station_song_title_fallback,
                "noCutStationSongTitleSpeak": no_cut_station_song_title_speak,
                "noReplayPreviousArtist": no_replay_previous_artist_fallback,
                "noReplayPreviousArtistSpeak": no_replay_previous_artist_speak,
                "previousRecallNoPlay": previous_song_recall_no_play_fallback,
                "previousRecallNoPlaySpeak": previous_song_recall_no_play_speak,
                "previousStopOriginCasual": previous_song_stop_origin_casual_fallback,
                "previousTitle": previous_song_title_fallback,
                "previousCityOrigin": previous_song_city_origin_terse_fallback,
                "previousArtist": previous_song_artist_fallback,
                "previousFromPlace": previous_song_from_place_terse_fallback,
                "noSoundCurrentTitle": no_sound_current_title_fallback,
                "noSoundCurrentTitleSpeak": no_sound_current_title_speak,
            },
        },
        {
            "name": "local fallback answers route questions without interrupting playback",
            "passed": "24H 主线" in route_fallback and "下一站" in route_fallback and "不打断播放" in route_fallback,
            "detail": route_fallback,
        },
        {
            "name": "local fallback answers remaining-route followups",
            "passed": all(
                "24H 主线" in reply and "下一站" in reply and "不打断播放" in reply
                for reply in (
                    remaining_stops_fallback,
                    route_later_plan_fallback,
                    route_later_casual_places_fallback,
                    route_later_sunset_chase_fallback,
                    route_later_casual_city_list_fallback,
                    route_later_multi_city_land_fallback,
                    route_pronoun_later_sunset_chase_fallback,
                    route_this_way_sunset_left_fallback,
                    route_next_segment_city_fallback,
                    route_later_city_order_fallback,
                    route_later_sunset_order_fallback,
                    route_line_second_half_order_fallback,
                    route_casual_later_plan_fallback,
                    route_current_segment_fallback,
                    route_station_index_fallback,
                    route_today_pass_places_fallback,
                    route_today_where_passes_fallback,
                    route_casual_pass_places_fallback,
                    route_this_way_pass_places_fallback,
                    route_this_way_pass_cities_fallback,
                    route_tonight_chase_cities_fallback,
                    route_today_sunset_remaining_fallback,
                    route_today_walk_stops_fallback,
                    route_specific_remaining_stops_fallback,
                    no_action_next_route_plan_fallback,
                    no_action_city_route_plan_fallback,
                    no_action_city_remaining_route_fallback,
                    no_action_later_city_list_fallback,
                    no_cut_song_later_cities_fallback,
                    no_cut_next_stop_name_fallback,
                    no_cut_next_stop_where_fallback,
                    no_stop_today_places_fallback,
                    no_action_previous_stop_name_fallback,
                    no_action_previous_stop_where_fallback,
                    previous_city_plain_where_fallback,
                    previous_stop_casual_where_fallback,
                    no_action_named_city_order_fallback,
                    no_action_named_city_eta_fallback,
                    no_action_route_rationale_fallback,
                    no_action_current_station_rationale_fallback,
                    no_action_current_station_rationale_prefix_fallback,
                    route_inverted_station_rationale_fallback,
                    route_trip_current_station_rationale_fallback,
                    no_action_later_rationale_fallback,
                    no_action_next_stop_rationale_fallback,
                    next_city_plain_reason_fallback,
                    no_action_previous_stop_rationale_fallback,
                    colloquial_remaining_stops_fallback,
                    trip_later_city_count_fallback,
                    trip_radio_progress_fallback,
                    later_place_fallback,
                    further_sunset_count_fallback,
                    direct_sunset_count_fallback,
                    tonight_chase_sunset_count_fallback,
                    route_signoff_time_fallback,
                    route_long_left_fallback,
                    route_distance_left_fallback,
                    route_far_left_fallback,
                    route_duration_fallback,
                    route_casual_remaining_places_fallback,
                    route_today_where_next_fallback,
                    route_trip_winding_later_fallback,
                    route_later_land_cities_fallback,
                    route_later_city_fallback,
                    route_later_station_fallback,
                    route_next_stop_name_casual_fallback,
                    route_second_half_fallback,
                    quiet_route_write_chars_fallback,
                    quiet_route_detour_fallback,
                    quiet_next_stop_write_chars_fallback,
                    quiet_route_no_readout_fallback,
                    quiet_route_natural_no_readout_fallback,
                    today_route_end_fallback,
                    today_route_duration_fallback,
                    next_stop_arrival_fallback,
                    compact_next_stop_arrival_fallback,
                    next_sunset_eta_fallback,
                    next_city_eta_fallback,
                )
            ),
            "detail": {
                "remainingStops": remaining_stops_fallback,
                "laterPlan": route_later_plan_fallback,
                "laterCasualPlaces": route_later_casual_places_fallback,
                "laterSunsetChase": route_later_sunset_chase_fallback,
                "laterCasualCityList": route_later_casual_city_list_fallback,
                "laterMultiCityLand": route_later_multi_city_land_fallback,
                "pronounLaterSunsetChase": route_pronoun_later_sunset_chase_fallback,
                "thisWaySunsetLeft": route_this_way_sunset_left_fallback,
                "nextSegmentCity": route_next_segment_city_fallback,
                "laterCityOrder": route_later_city_order_fallback,
                "laterSunsetOrder": route_later_sunset_order_fallback,
                "lineSecondHalfOrder": route_line_second_half_order_fallback,
                "casualLaterPlan": route_casual_later_plan_fallback,
                "currentSegment": route_current_segment_fallback,
                "stationIndex": route_station_index_fallback,
                "todayPassPlaces": route_today_pass_places_fallback,
                "todayWherePasses": route_today_where_passes_fallback,
                "casualPassPlaces": route_casual_pass_places_fallback,
                "thisWayPassPlaces": route_this_way_pass_places_fallback,
                "thisWayPassCities": route_this_way_pass_cities_fallback,
                "tonightChaseCities": route_tonight_chase_cities_fallback,
                "todaySunsetRemaining": route_today_sunset_remaining_fallback,
                "todayWalkStops": route_today_walk_stops_fallback,
                "specificRemainingStops": route_specific_remaining_stops_fallback,
                "noActionNextRoutePlan": no_action_next_route_plan_fallback,
                "noActionCityRoutePlan": no_action_city_route_plan_fallback,
                "noActionCityRemainingRoute": no_action_city_remaining_route_fallback,
                "noActionLaterCityList": no_action_later_city_list_fallback,
                "noCutSongLaterCities": no_cut_song_later_cities_fallback,
                "noActionPreviousStopName": no_action_previous_stop_name_fallback,
                "noActionPreviousStopWhere": no_action_previous_stop_where_fallback,
                "previousCityPlainWhere": previous_city_plain_where_fallback,
                "previousStopCasualWhere": previous_stop_casual_where_fallback,
                "noActionNamedCityOrder": no_action_named_city_order_fallback,
                "noActionNamedCityEta": no_action_named_city_eta_fallback,
                "noActionRouteRationale": no_action_route_rationale_fallback,
                "noActionCurrentStationRationale": no_action_current_station_rationale_fallback,
                "noActionCurrentStationRationalePrefix": no_action_current_station_rationale_prefix_fallback,
                "invertedStationRationale": route_inverted_station_rationale_fallback,
                "tripCurrentStationRationale": route_trip_current_station_rationale_fallback,
                "noActionLaterRationale": no_action_later_rationale_fallback,
                "noActionNextStopRationale": no_action_next_stop_rationale_fallback,
                "nextCityPlainReason": next_city_plain_reason_fallback,
                "noActionPreviousStopRationale": no_action_previous_stop_rationale_fallback,
                "colloquialRemainingStops": colloquial_remaining_stops_fallback,
                "tripLaterCityCount": trip_later_city_count_fallback,
                "tripRadioProgress": trip_radio_progress_fallback,
                "laterPlace": later_place_fallback,
                "furtherSunsets": further_sunset_count_fallback,
                "directSunsets": direct_sunset_count_fallback,
                "tonightChaseSunsets": tonight_chase_sunset_count_fallback,
                "routeSignoffTime": route_signoff_time_fallback,
                "routeLongLeft": route_long_left_fallback,
                "routeDistanceLeft": route_distance_left_fallback,
                "routeFarLeft": route_far_left_fallback,
                "routeDuration": route_duration_fallback,
                "casualRemainingPlaces": route_casual_remaining_places_fallback,
                "todayWhereNext": route_today_where_next_fallback,
                "tripWindingLater": route_trip_winding_later_fallback,
                "laterLandCities": route_later_land_cities_fallback,
                "laterCity": route_later_city_fallback,
                "laterStation": route_later_station_fallback,
                "nextStopNameCasual": route_next_stop_name_casual_fallback,
                "secondHalf": route_second_half_fallback,
                "quietWriteChars": quiet_route_write_chars_fallback,
                "quietDetour": quiet_route_detour_fallback,
                "quietNextStopWriteChars": quiet_next_stop_write_chars_fallback,
                "quietRouteNoReadout": quiet_route_no_readout_fallback,
                "quietRouteNaturalNoReadout": quiet_route_natural_no_readout_fallback,
                "todayRouteEnd": today_route_end_fallback,
                "todayRouteDuration": today_route_duration_fallback,
                "nextStopArrival": next_stop_arrival_fallback,
                "compactNextStopArrival": compact_next_stop_arrival_fallback,
                "nextSunsetEta": next_sunset_eta_fallback,
                "nextCityEta": next_city_eta_fallback,
            },
        },
        {
            "name": "local fallback keeps quiet route no-readout questions text-only",
            "passed": "24H 主线" in quiet_route_no_readout_fallback
            and "不打断播放" in quiet_route_no_readout_fallback
            and "24H 主线" in quiet_route_natural_no_readout_fallback
            and "不打断播放" in quiet_route_natural_no_readout_fallback
            and quiet_route_no_readout_speak is False
            and quiet_route_natural_no_readout_speak is False,
            "detail": {
                "reply": quiet_route_no_readout_fallback,
                "natural": quiet_route_natural_no_readout_fallback,
                "shouldSpeak": quiet_route_no_readout_speak,
                "naturalShouldSpeak": quiet_route_natural_no_readout_speak,
            },
        },
        {
            "name": "local fallback answers next-stop route questions",
            "passed": "24H 主线" in next_stop_fallback
            and "下一站" in next_stop_fallback
            and "24H 主线" in next_stop_where_fallback
            and "下一站" in next_stop_where_fallback,
            "detail": {
                "nextStop": next_stop_fallback,
                "nextStopWhere": next_stop_where_fallback,
            },
        },
        {
            "name": "local fallback answers terse route followups",
            "passed": all(
                "24H 主线" in reply and "下一站" in reply and "不打断播放" in reply
                for reply in (next_stop_followup_fallback, next_city_followup_fallback, previous_stop_followup_fallback)
            ),
            "detail": {
                "nextStop": next_stop_followup_fallback,
                "nextCity": next_city_followup_fallback,
                "previousStop": previous_stop_followup_fallback,
            },
        },
        {
            "name": "local fallback answers song-story questions",
            "passed": (
                all(
                    "当前曲目支线" in reply and "不编细节" in reply
                    for reply in (
                        song_story_fallback,
                        current_song_story_fallback,
                        casual_song_story_fallback,
                        colloquial_song_meaning_fallback,
                        song_city_fit_fallback,
                        song_here_fit_fallback,
                        song_short_here_fit_fallback,
                        song_here_no_skip_fallback,
                        no_play_current_song_reason_fallback,
                        song_plain_city_relation_fallback,
                        song_city_first_relation_fallback,
                        song_current_city_relation_fallback,
                        song_current_sunset_fit_fallback,
                        song_city_fit_why_fallback,
                        city_first_song_fit_why_fallback,
                        song_current_sunset_relation_fallback,
                        song_current_sunset_plain_relation_fallback,
                        song_station_reason_fallback,
                        song_station_selected_fallback,
                        song_station_reason_no_skip_fallback,
                        song_place_reason_fallback,
                        current_station_reason_fallback,
                        previous_song_station_relation_fallback,
                        previous_song_terse_station_relation_fallback,
                        previous_song_colloquial_story_fallback,
                        previous_song_short_story_fallback,
                        previous_song_previous_station_reason_fallback,
                        previous_song_previous_station_fit_fallback,
                        previous_song_previous_station_relation_fallback,
                        previous_song_here_reason_fallback,
                        previous_song_related_fallback,
                        no_replay_previous_song_station_fallback,
                        no_rewind_previous_song_station_fallback,
                        previous_song_more_story_fallback,
                        previous_song_story_no_replay_short_fallback,
                        previous_song_story_no_rewind_short_fallback,
                        previous_station_song_more_story_fallback,
                        no_rewind_previous_song_story_fallback,
                        no_replay_previous_song_origin_fallback,
                        song_origin_short_fallback,
                        song_origin_colloquial_fallback,
                        song_short_pick_reason_fallback,
                        next_song_selected_reason_fallback,
                    )
                )
                and no_replay_previous_song_station_speak is False
                and no_rewind_previous_song_station_speak is False
                and previous_song_more_story_speak is False
                and previous_station_song_more_story_speak is False
                and no_rewind_previous_song_story_speak is False
                and no_replay_previous_song_origin_speak is False
                and song_here_no_skip_speak is False
                and no_play_current_song_reason_speak is False
                and song_city_fit_why_speak is False
                and song_station_reason_no_skip_speak is False
            ),
            "detail": {
                "direct": song_story_fallback,
                "storyRequest": current_song_story_fallback,
                "casualStoryRequest": casual_song_story_fallback,
                "colloquialMeaning": colloquial_song_meaning_fallback,
                "cityFit": song_city_fit_fallback,
                "cityFitWhy": song_city_fit_why_fallback,
                "cityFirstFitWhy": city_first_song_fit_why_fallback,
                "cityFitWhySpeak": song_city_fit_why_speak,
                "hereFit": song_here_fit_fallback,
                "shortHereFit": song_short_here_fit_fallback,
                "hereNoSkip": song_here_no_skip_fallback,
                "hereNoSkipSpeak": song_here_no_skip_speak,
                "noPlayCurrentReason": no_play_current_song_reason_fallback,
                "noPlayCurrentReasonSpeak": no_play_current_song_reason_speak,
                "plainCityRelation": song_plain_city_relation_fallback,
                "cityFirstRelation": song_city_first_relation_fallback,
                "currentCityRelation": song_current_city_relation_fallback,
                "currentSunsetFit": song_current_sunset_fit_fallback,
                "currentSunsetRelation": song_current_sunset_relation_fallback,
                "currentSunsetPlainRelation": song_current_sunset_plain_relation_fallback,
                "stationReason": song_station_reason_fallback,
                "stationSelected": song_station_selected_fallback,
                "stationReasonNoSkip": song_station_reason_no_skip_fallback,
                "stationReasonNoSkipSpeak": song_station_reason_no_skip_speak,
                "placeReason": song_place_reason_fallback,
                "currentStationReason": current_station_reason_fallback,
                "previousStationRelation": previous_song_station_relation_fallback,
                "previousTerseStationRelation": previous_song_terse_station_relation_fallback,
                "previousColloquialStory": previous_song_colloquial_story_fallback,
                "previousShortStory": previous_song_short_story_fallback,
                "previousStationReason": previous_song_previous_station_reason_fallback,
                "previousStationFit": previous_song_previous_station_fit_fallback,
                "previousStationPlainRelation": previous_song_previous_station_relation_fallback,
                "previousHereReason": previous_song_here_reason_fallback,
                "previousRelated": previous_song_related_fallback,
                "noReplayPreviousStationRelation": no_replay_previous_song_station_fallback,
                "noReplayPreviousStationSpeak": no_replay_previous_song_station_speak,
                "noRewindPreviousStationFit": no_rewind_previous_song_station_fallback,
                "noRewindPreviousStationSpeak": no_rewind_previous_song_station_speak,
                "previousMoreStory": previous_song_more_story_fallback,
                "previousNoReplayShort": previous_song_story_no_replay_short_fallback,
                "previousNoRewindShort": previous_song_story_no_rewind_short_fallback,
                "previousMoreStorySpeak": previous_song_more_story_speak,
                "previousStationMoreStory": previous_station_song_more_story_fallback,
                "previousStationMoreStorySpeak": previous_station_song_more_story_speak,
                "noRewindPreviousStory": no_rewind_previous_song_story_fallback,
                "noRewindPreviousStorySpeak": no_rewind_previous_song_story_speak,
                "noReplayPreviousOrigin": no_replay_previous_song_origin_fallback,
                "noReplayPreviousOriginSpeak": no_replay_previous_song_origin_speak,
                "shortOrigin": song_origin_short_fallback,
                "colloquialOrigin": song_origin_colloquial_fallback,
                "shortPickReason": song_short_pick_reason_fallback,
                "nextSongSelectedReason": next_song_selected_reason_fallback,
            },
        },
        {
            "name": "local fallback answers song-city relation questions",
            "passed": "城市关系" in song_relation_fallback
            and "写回屏幕" in song_relation_fallback
            and "城市关系" in terse_song_relation_fallback,
            "detail": {
                "relation": song_relation_fallback,
                "terseRelation": terse_song_relation_fallback,
            },
        },
        {
            "name": "local fallback answers next and previous city-story questions",
            "passed": "下一站故事" in next_city_story_fallback
            and "不切城" in next_city_story_fallback
            and "下一站故事" in next_city_story_plain_fallback
            and "上一站故事" in previous_city_story_fallback
            and "不回切" in previous_city_story_fallback
            and "下一站故事" in no_jump_next_city_story_fallback
            and "不切城" in no_jump_next_city_story_fallback
            and "下一站故事" in no_cut_next_city_story_fallback
            and "不切城" in no_cut_next_city_story_fallback
            and "下一站故事" in next_city_story_no_skip_fallback
            and "不切城" in next_city_story_no_skip_fallback
            and "上一站故事" in no_jump_previous_city_story_fallback
            and "不回切" in no_jump_previous_city_story_fallback
            and "下一站故事" in quiet_next_city_story_fallback
            and "下一站故事" in quiet_next_city_story_no_voice_fallback
            and next_city_story_speak is False
            and quiet_next_city_story_speak is False
            and quiet_next_city_story_no_voice_speak is False,
            "detail": {
                "next": next_city_story_fallback,
                "nextPlain": next_city_story_plain_fallback,
                "previous": previous_city_story_fallback,
                "noJumpNext": no_jump_next_city_story_fallback,
                "noCutNext": no_cut_next_city_story_fallback,
                "nextNoSkip": next_city_story_no_skip_fallback,
                "noJumpPrevious": no_jump_previous_city_story_fallback,
                "quietNext": quiet_next_city_story_fallback,
                "quietNextNoVoice": quiet_next_city_story_no_voice_fallback,
                "speaks": {
                    "next": next_city_story_speak,
                    "quietNext": quiet_next_city_story_speak,
                    "quietNextNoVoice": quiet_next_city_story_no_voice_speak,
                },
            },
        },
        {
            "name": "local fallback answers current city-story questions",
            "passed": all(
                "当前城市支线" in reply and "主线状态兜底" in reply
                for reply in (
                    city_story_fallback,
                    city_story_this_city_fallback,
                    city_story_this_town_fallback,
                    city_story_current_city_fallback,
                    city_story_this_place_fallback,
                    city_story_reason_fallback,
                    city_story_origin_fallback,
                    no_play_current_city_story_fallback,
                    current_stop_story_casual_fallback,
                    current_sunset_story_fallback,
                    no_cut_current_city_story_fallback,
                    city_story_station_origin_fallback,
                    city_story_route_reason_fallback,
                    city_story_current_route_fallback,
                    city_story_current_order_fallback,
                )
            )
            and no_play_current_city_story_speak is False
            and no_cut_current_city_story_speak is False,
            "detail": {
                "story": city_story_fallback,
                "thisCity": city_story_this_city_fallback,
                "thisTown": city_story_this_town_fallback,
                "currentCity": city_story_current_city_fallback,
                "thisPlace": city_story_this_place_fallback,
                "reason": city_story_reason_fallback,
                "origin": city_story_origin_fallback,
                "noPlayCurrent": no_play_current_city_story_fallback,
                "noPlayCurrentSpeak": no_play_current_city_story_speak,
                "currentStopStoryCasual": current_stop_story_casual_fallback,
                "currentSunsetStory": current_sunset_story_fallback,
                "noCutCurrent": no_cut_current_city_story_fallback,
                "noCutCurrentSpeak": no_cut_current_city_story_speak,
                "stationOrigin": city_story_station_origin_fallback,
                "routeReason": city_story_route_reason_fallback,
                "currentRouteReason": city_story_current_route_fallback,
                "currentOrderReason": city_story_current_order_fallback,
            },
        },
        {
            "name": "local fallback answers named city-track questions",
            "passed": "城市歌单" in city_tracks_fallback and "可播歌曲" in city_tracks_fallback,
            "detail": city_tracks_fallback,
        },
        {
            "name": "local fallback answers city-track recommendation phrasing",
            "passed": "城市歌单" in recommend_city_tracks_fallback and "不会直接乱播" in recommend_city_tracks_fallback,
            "detail": recommend_city_tracks_fallback,
        },
        {
            "name": "local fallback answers future-track questions",
            "passed": all(
                "后续曲目支线" in reply and "不会直接乱播" in reply
                for reply in (future_tracks_fallback, later_specific_song_fallback)
            ),
            "detail": {
                "futureTracks": future_tracks_fallback,
                "laterSpecificSong": later_specific_song_fallback,
            },
        },
        {
            "name": "local fallback routes casual future-playlist status questions",
            "passed": all(
                "歌单问题" in reply and "不会直接乱播" in reply
                for reply in (
                    future_playlist_order_short_fallback,
                    future_playlist_arrange_short_fallback,
                    future_playlist_next_order_short_fallback,
                    next_song_order_reason_fallback,
                    future_playlist_good_listening_fallback,
                    future_playlist_listenable_fallback,
                    next_city_playlist_good_no_skip_fallback,
                    next_city_playlist_content_no_skip_fallback,
                )
            ),
            "detail": {
                "futureOrderShort": future_playlist_order_short_fallback,
                "futureArrangeShort": future_playlist_arrange_short_fallback,
                "futureNextOrderShort": future_playlist_next_order_short_fallback,
                "nextSongOrderReason": next_song_order_reason_fallback,
                "futureGoodListening": future_playlist_good_listening_fallback,
                "futureListenable": future_playlist_listenable_fallback,
                "nextCityGoodNoSkip": next_city_playlist_good_no_skip_fallback,
                "nextCityContentNoSkip": next_city_playlist_content_no_skip_fallback,
            },
        },
        {
            "name": "local fallback answers current playlist followups",
            "passed": not no_cut_next_song_station_speak
            and not no_jump_next_song_station_fit_speak
            and not guarded_later_song_transition_speak
            and not no_cut_next_city_playlist_reason_speak
            and not no_cut_next_city_playlist_selected_speak
            and not previous_city_playlist_reason_speak
            and not quiet_previous_city_playlist_reason_speak
            and not previous_city_playlist_more_speak
            and not previous_station_more_songs_speak
            and current_stop_available_playable_speak is False
            and all(
                "城市歌单" in reply and "可播歌曲" in reply and "不会直接乱播" in reply
                for reply in (
                    current_stop_more_songs_fallback,
                    current_stop_more_music_fallback,
                    current_station_playlist_show_fallback,
                    current_station_playlist_name_fallback,
                    current_city_more_listening_casual_fallback,
                    current_station_remaining_songs_casual_fallback,
                    current_stop_available_playable_fallback,
                    show_playlist_fallback,
                    today_playlist_look_fallback,
                    today_playlist_glance_fallback,
                    playlist_next_track_fallback,
                    playlist_upcoming_fallback,
                    current_sunset_playlist_fallback,
                    current_sunset_available_fallback,
                    current_sunset_song_count_fallback,
                    current_playlist_remaining_fallback,
                    current_city_remaining_songs_fallback,
                    here_remaining_listening_fallback,
                    soon_song_order_fallback,
                    next_song_arrival_fallback,
                    next_song_advance_fallback,
                    next_song_place_fallback,
                    next_song_city_fallback,
                    next_song_station_relation_fallback,
                    next_song_station_fit_fallback,
                    later_song_artist_fallback,
                    later_song_no_stop_fallback,
                    later_song_casual_no_stop_fallback,
                    later_song_count_fallback,
                    no_cut_next_song_fallback,
                    no_change_next_artist_fallback,
                    no_switch_next_artist_fallback,
                    no_cut_next_song_station_fallback,
                    no_jump_next_song_station_fit_fallback,
                    guarded_later_song_transition_fallback,
                    next_city_playlist_reason_fallback,
                    next_city_playlist_fit_fallback,
                    no_cut_next_city_playlist_reason_fallback,
                    no_cut_next_city_playlist_selected_fallback,
                    next_city_playlist_selected_casual_fallback,
                    previous_city_playlist_reason_fallback,
                    previous_city_playlist_casual_reason_fallback,
                    quiet_previous_city_playlist_reason_fallback,
                    previous_city_playlist_more_fallback,
                    previous_station_more_songs_fallback,
                    previous_station_tracklist_fallback,
                    no_jump_next_city_playlist_fallback,
                    no_jump_next_station_playlist_fallback,
                    no_jump_previous_city_playlist_fallback,
                    no_play_playlist_count_fallback,
                    no_play_today_playlist_fallback,
                    no_switch_remaining_count_fallback,
                    no_switch_upcoming_playlist_fallback,
                    no_play_upcoming_playlist_fallback,
                    no_skip_next_city_song_fallback,
                    current_track_later_exists_fallback,
                    future_more_listen_fallback,
                    current_city_other_songs_fallback,
                    current_city_available_songs_fallback,
                    current_city_fit_song_count_fallback,
                    later_city_playlist_glance_fallback,
                    no_play_show_current_station_songs_fallback,
                    next_song_list_only_fallback,
                )
            ),
            "detail": {
                "stopMoreSongs": current_stop_more_songs_fallback,
                "stopMoreMusic": current_stop_more_music_fallback,
                "stationPlaylistShow": current_station_playlist_show_fallback,
                "stationPlaylistName": current_station_playlist_name_fallback,
                "cityMoreListeningCasual": current_city_more_listening_casual_fallback,
                "stationRemainingSongsCasual": current_station_remaining_songs_casual_fallback,
                "stopAvailablePlayable": current_stop_available_playable_fallback,
                "stopAvailablePlayableSpeak": current_stop_available_playable_speak,
                "showPlaylist": show_playlist_fallback,
                "todayPlaylistLook": today_playlist_look_fallback,
                "todayPlaylistGlance": today_playlist_glance_fallback,
                "playlistNextTrack": playlist_next_track_fallback,
                "playlistUpcoming": playlist_upcoming_fallback,
                "sunsetPlaylist": current_sunset_playlist_fallback,
                "sunsetAvailable": current_sunset_available_fallback,
                "sunsetSongCount": current_sunset_song_count_fallback,
                "currentPlaylistRemaining": current_playlist_remaining_fallback,
                "cityRemainingSongs": current_city_remaining_songs_fallback,
                "hereRemainingListening": here_remaining_listening_fallback,
                "soonSongOrder": soon_song_order_fallback,
                "nextSongArrival": next_song_arrival_fallback,
                "nextSongAdvance": next_song_advance_fallback,
                "nextSongPlace": next_song_place_fallback,
                "nextSongCity": next_song_city_fallback,
                "nextSongStationRelation": next_song_station_relation_fallback,
                "nextSongStationFit": next_song_station_fit_fallback,
                "laterSongArtist": later_song_artist_fallback,
                "laterSongNoStop": later_song_no_stop_fallback,
                "laterSongCasualNoStop": later_song_casual_no_stop_fallback,
                "laterSongCount": later_song_count_fallback,
                "noCutNextSong": no_cut_next_song_fallback,
                "noChangeNextArtist": no_change_next_artist_fallback,
                "noSwitchNextArtist": no_switch_next_artist_fallback,
                "noCutNextSongStation": no_cut_next_song_station_fallback,
                "noCutNextSongStationSpeak": no_cut_next_song_station_speak,
                "noJumpNextSongStationFit": no_jump_next_song_station_fit_fallback,
                "noJumpNextSongStationFitSpeak": no_jump_next_song_station_fit_speak,
                "nextCityPlaylistReason": next_city_playlist_reason_fallback,
                "guardedLaterSongTransition": guarded_later_song_transition_fallback,
                "guardedLaterSongTransitionSpeak": guarded_later_song_transition_speak,
                "nextCityPlaylistFit": next_city_playlist_fit_fallback,
                "noCutNextCityPlaylistReason": no_cut_next_city_playlist_reason_fallback,
                "noCutNextCityPlaylistReasonSpeak": no_cut_next_city_playlist_reason_speak,
                "noCutNextCityPlaylistSelected": no_cut_next_city_playlist_selected_fallback,
                "noCutNextCityPlaylistSelectedSpeak": no_cut_next_city_playlist_selected_speak,
                "nextCityPlaylistSelectedCasual": next_city_playlist_selected_casual_fallback,
                "previousCityPlaylistReason": previous_city_playlist_reason_fallback,
                "previousCityPlaylistReasonSpeak": previous_city_playlist_reason_speak,
                "previousCityPlaylistCasualReason": previous_city_playlist_casual_reason_fallback,
                "quietPreviousCityPlaylistReason": quiet_previous_city_playlist_reason_fallback,
                "quietPreviousCityPlaylistReasonSpeak": quiet_previous_city_playlist_reason_speak,
                "previousCityPlaylistMore": previous_city_playlist_more_fallback,
                "previousCityPlaylistMoreSpeak": previous_city_playlist_more_speak,
                "previousStationMoreSongs": previous_station_more_songs_fallback,
                "previousStationMoreSongsSpeak": previous_station_more_songs_speak,
                "previousStationTracklist": previous_station_tracklist_fallback,
                "noJumpNextCityPlaylist": no_jump_next_city_playlist_fallback,
                "noJumpPreviousCityPlaylist": no_jump_previous_city_playlist_fallback,
                "noPlayPlaylistCount": no_play_playlist_count_fallback,
                "noPlayTodayPlaylist": no_play_today_playlist_fallback,
                "noSwitchUpcomingPlaylist": no_switch_upcoming_playlist_fallback,
                "noSwitchRemainingCount": no_switch_remaining_count_fallback,
                "noSkipNextCitySong": no_skip_next_city_song_fallback,
                "trackLaterExists": current_track_later_exists_fallback,
                "futureMoreListen": future_more_listen_fallback,
                "cityOtherSongs": current_city_other_songs_fallback,
                "cityAvailableSongs": current_city_available_songs_fallback,
                "cityFitSongCount": current_city_fit_song_count_fallback,
                "laterCityPlaylistGlance": later_city_playlist_glance_fallback,
                "noPlayShowCurrentStationSongs": no_play_show_current_station_songs_fallback,
                "nextSongListOnly": next_song_list_only_fallback,
            },
        },
        {
            "name": "local fallback answers DJ branch return questions",
            "passed": "歌单和故事支线" in dj_branch_return_fallback
            and "24H Radio 主线状态" in dj_branch_return_fallback
            and "不打断播放" in dj_branch_interrupt_fallback
            and "动作路由" in dj_branch_interrupt_fallback
            and "24H Radio 主线状态" in dj_branch_direct_fallback
            and "不打断播放" in dj_branch_cn_direct_fallback
            and "动作路由" in dj_branch_radio_mainline_fallback
            and "24H Radio 主线状态" in dj_branch_question_mainline_fallback
            and "24H Radio 主线状态" in dj_branch_dialog_mainline_fallback
            and "24H Radio 主线状态" in dj_branch_keep_playing_fallback
            and "24H Radio 主线状态" in dj_branch_no_stuck_fallback
            and "24H Radio 主线状态" in dj_branch_voice_steal_fallback
            and "24H Radio 主线状态" in dj_branch_route_stop_song_fallback
            and "24H Radio 主线状态" in dj_branch_chat_stuck_fallback
            and "24H Radio 主线状态" in dj_branch_dialog_only_fallback
            and dj_branch_keep_playing_speak is False
            and dj_branch_no_stuck_speak is False
            and dj_branch_voice_steal_speak is False
            and dj_branch_route_stop_song_speak is False
            and dj_branch_chat_stuck_speak is False
            and dj_branch_dialog_only_speak is False
            and "24H Radio 主线状态" in playlist_no_cutaway_fallback
            and "24H Radio 主线状态" in route_no_cutaway_fallback
            and "24H Radio 主线状态" in route_no_pause_fallback
            and "24H Radio 主线状态" in next_stop_no_cutaway_fallback,
            "detail": {
                "return": dj_branch_return_fallback,
                "interrupt": dj_branch_interrupt_fallback,
                "direct": dj_branch_direct_fallback,
                "spoken_direct": dj_branch_cn_direct_fallback,
                "radio_mainline": dj_branch_radio_mainline_fallback,
                "question_mainline": dj_branch_question_mainline_fallback,
                "dialog_mainline": dj_branch_dialog_mainline_fallback,
                "keep_playing": dj_branch_keep_playing_fallback,
                "no_stuck": dj_branch_no_stuck_fallback,
                "voice_steal": dj_branch_voice_steal_fallback,
                "route_stop_song": dj_branch_route_stop_song_fallback,
                "chat_stuck": dj_branch_chat_stuck_fallback,
                "dialog_only": dj_branch_dialog_only_fallback,
                "speaks": {
                    "keep_playing": dj_branch_keep_playing_speak,
                    "no_stuck": dj_branch_no_stuck_speak,
                    "voice_steal": dj_branch_voice_steal_speak,
                    "route_stop_song": dj_branch_route_stop_song_speak,
                    "chat_stuck": dj_branch_chat_stuck_speak,
                    "dialog_only": dj_branch_dialog_only_speak,
                },
                "playlist_no_cutaway": playlist_no_cutaway_fallback,
                "route_no_cutaway": route_no_cutaway_fallback,
                "route_no_pause": route_no_pause_fallback,
                "next_stop_no_cutaway": next_stop_no_cutaway_fallback,
            },
        },
        {
            "name": "local fallback answers playback continuity questions without action",
            "passed": all(
                "只写回屏幕" in reply and "不会" in reply and "乱播" in reply and "切城" in reply
                for reply in (
                    playback_pause_continuity_fallback,
                    playback_no_execute_question_fallback,
                    playback_resume_continuity_fallback,
                    *playback_state_fallbacks.values(),
                )
            )
            and all(speak is False for speak in playback_state_speaks.values()),
            "detail": {
                "pause": playback_pause_continuity_fallback,
                "guardedPause": playback_no_execute_question_fallback,
                "resume": playback_resume_continuity_fallback,
                "state": playback_state_fallbacks,
                "stateSpeaks": playback_state_speaks,
            },
        },
        {
            "name": "local fallback explains natural playback controls",
            "passed": all("播放控制" in reply and "Pi 控制队列" in reply for reply in playback_control_fallbacks.values())
            and all(chat_agent.should_speak(phrase) is False for phrase in playback_control_fallbacks),
            "detail": playback_control_fallbacks,
        },
        {
            "name": "local fallback answers Frost dialog branch questions",
            "passed": "Frost 对话" in frost_dialog_fallback
            and "Frost 对话" in frost_inline_dialog_reply_fallback
            and "用户消息" in frost_message_persistence_fallback
            and "用户消息" in frost_message_retained_fallback
            and "用户消息" in frost_sent_to_frost_retained_fallback
            and "用户消息" in frost_phrase_persistence_fallback
            and "用户消息" in frost_sent_message_casual_retained_fallback
            and "用户消息" in frost_message_swallowed_after_send_fallback
            and "用户消息" in frost_message_short_swallow_fallback
            and "用户消息" in frost_my_message_sent_retained_fallback
            and "用户消息" in frost_recent_message_visible_fallback
            and "用户消息" in frost_reply_swallow_fallback
            and "用户消息" in frost_reply_short_cover_fallback
            and "用户消息" in frost_message_cover_fallback
            and "用户消息" in frost_dialog_cover_fallback
            and "回主线状态" in frost_mainline_fallback
            and "24H Radio 主线" in frost_mainline_fallback
            and "回主线状态" in frost_dialog_24h_mainline_fallback
            and "24H Radio 主线" in frost_dialog_24h_mainline_fallback
            and "24H Radio 主线状态" in dj_branch_chat_mainline_present_fallback
            and "24H Radio 主线状态" in dj_branch_dj_continue_fallback
            and "24H Radio 主线状态" in bare_mainline_present_fallback
            and "回主线状态" in frost_dialog_no_stuck_fallback
            and "24H Radio 主线" in frost_dialog_no_stuck_fallback
            and "24H Radio 主线" in chat_no_interrupt_fallback
            and "24H Radio 主线" in chat_casual_no_mainline_steal_fallback
            and "24H Radio 主线" in chat_return_after_fallback
            and "24H Radio 主线" in ask_no_skip_fallback
            and "24H Radio 主线" in ask_no_stop_mainline_fallback
            and "24H Radio 主线" in question_no_stop_radio_fallback
            and "24H Radio 主线" in chat_no_surprise_music_fallback
            and "24H Radio 主线" in story_no_cut_song_fallback
            and "24H Radio 主线" in next_stop_no_cut_past_fallback
            and "24H Radio 主线" in chat_no_auto_next_fallback
            and "24H Radio 主线" in playlist_no_auto_city_fallback
            and "24H Radio 主线" in story_no_auto_next_fallback
            and "24H Radio 主线" in answer_no_auto_city_fallback
            and "24H Radio 主线" in playlist_no_pause_fallback
            and "24H Radio 主线" in frost_branch_no_interrupt_fallback,
            "detail": {
                "dialog": frost_dialog_fallback,
                "inlineDialogReply": frost_inline_dialog_reply_fallback,
                "persistence": frost_message_persistence_fallback,
                "retained": frost_message_retained_fallback,
                "sentToFrostRetained": frost_sent_to_frost_retained_fallback,
                "phrasePersistence": frost_phrase_persistence_fallback,
                "casualRetained": frost_sent_message_casual_retained_fallback,
                "afterSendSwallow": frost_message_swallowed_after_send_fallback,
                "sentRetained": frost_my_message_sent_retained_fallback,
                "recentVisible": frost_recent_message_visible_fallback,
                "swallow": frost_reply_swallow_fallback,
                "cover": frost_message_cover_fallback,
                "dialogCover": frost_dialog_cover_fallback,
                "mainline": frost_mainline_fallback,
                "mainline_24h": frost_dialog_24h_mainline_fallback,
                "chatMainlinePresent": dj_branch_chat_mainline_present_fallback,
                "djContinue": dj_branch_dj_continue_fallback,
                "bareMainlinePresent": bare_mainline_present_fallback,
                "no_stuck": frost_dialog_no_stuck_fallback,
                "chat_no_interrupt": chat_no_interrupt_fallback,
                "chat_casual_no_mainline_steal": chat_casual_no_mainline_steal_fallback,
                "chat_return_after": chat_return_after_fallback,
                "ask_no_skip": ask_no_skip_fallback,
                "ask_no_stop_mainline": ask_no_stop_mainline_fallback,
                "question_no_stop_radio": question_no_stop_radio_fallback,
                "chat_no_surprise_music": chat_no_surprise_music_fallback,
                "story_no_cut_song": story_no_cut_song_fallback,
                "next_stop_no_cut_past": next_stop_no_cut_past_fallback,
                "chat_no_auto_next": chat_no_auto_next_fallback,
                "playlist_no_auto_city": playlist_no_auto_city_fallback,
                "story_no_auto_next": story_no_auto_next_fallback,
                "answer_no_auto_city": answer_no_auto_city_fallback,
                "playlist_no_pause": playlist_no_pause_fallback,
                "branch_no_interrupt": frost_branch_no_interrupt_fallback,
            },
        },
        {
            "name": "local fallback explains Frost Pi TTS decision",
            "passed": "Frost 回复" in frost_tts_decision_fallback
            and "/api/pi-tts" in frost_tts_decision_fallback
            and "低电量" in frost_missing_tts_fallback
            and "技能失败" in pi_tts_trigger_fallback
            and "技能失败" in spaced_pi_tts_trigger_fallback
            and "普通聊天不朗读" in pi_tts_trigger_fallback
            and "不打断主线" in pi_tts_trigger_fallback
            and all(
                "普通聊天不朗读" in reply and "/api/pi-tts" in reply
                for reply in (
                    ordinary_chat_pi_tts_fallback,
                    ordinary_chat_spaced_pi_tts_fallback,
                    ordinary_question_spaced_pi_tts_fallback,
                    generic_reply_pi_tts_fallback,
                    thanks_pi_tts_fallback,
                    importance_screen_policy_fallback,
                    current_city_voice_broadcast_fallback,
                    spaced_pi_tts_trigger_fallback,
                    important_words_readout_fallback,
                    ordinary_chat_speaker_fallback,
                    ordinary_question_speaker_fallback,
                    quiet_chat_voice_fallback,
                    question_tts_trigger_fallback,
                    playlist_readout_policy_fallback,
                    ordinary_playlist_screen_policy_fallback,
                    ordinary_next_stop_tts_policy_fallback,
                    ordinary_current_track_screen_policy_fallback,
                    ordinary_current_city_tts_policy_fallback,
                    ordinary_song_title_readout_policy_fallback,
                    current_playing_speaker_policy_fallback,
                    branch_readout_policy_fallback,
                    tool_failure_important_fallback,
                    important_reply_definition_fallback,
                    low_battery_pi_tts_fallback,
                    night_road_speaker_policy_fallback,
                    quiet_low_battery_pi_tts_fallback,
                    quiet_night_road_api_tts_fallback,
                    screen_or_readout_policy_fallback,
                    readout_vs_screen_policy_fallback,
                    typing_vs_broadcast_policy_fallback,
                    unimportant_reply_pi_tts_fallback,
                    unimportant_message_dialog_fallback,
                    tts_decision_no_object_fallback,
                    tts_when_really_speak_fallback,
                    importance_decision_policy_fallback,
                    terse_importance_policy_fallback,
                    route_importance_policy_fallback,
                    story_tts_policy_fallback,
                    weather_voice_policy_fallback,
                    greeting_readout_policy_fallback,
                )
            )
            and "Frost 默认只写屏" in bystander_important_reply_fallback
            and "/api/pi-tts" in bystander_important_reply_fallback
            and "Frost 默认只写屏" in bystander_important_type_fallback
            and "/api/pi-tts" in bystander_important_type_fallback
            and "Frost 默认只写屏" in bystander_low_battery_mute_fallback
            and "尊重静音" in bystander_low_battery_mute_fallback
            and "普通聊天不朗读" in tool_failure_external_audio_fallback
            and "/api/pi-tts" in tool_failure_external_audio_fallback
            and ordinary_chat_pi_tts_speak is False
            and ordinary_chat_spaced_pi_tts_speak is False
            and ordinary_question_spaced_pi_tts_speak is False
            and generic_reply_pi_tts_speak is False
            and thanks_pi_tts_speak is False
            and importance_screen_policy_speak is False
            and current_city_voice_broadcast_speak is False
            and ordinary_chat_speaker_speak is False
            and ordinary_question_speaker_speak is False
            and quiet_chat_voice_speak is False
            and question_tts_trigger_speak is False
            and playlist_readout_policy_speak is False
            and ordinary_playlist_screen_policy_speak is False
            and ordinary_next_stop_tts_policy_speak is False
            and ordinary_current_track_screen_policy_speak is False
            and ordinary_current_city_tts_policy_speak is False
            and ordinary_song_title_readout_policy_speak is False
            and current_playing_speaker_policy_speak is False
            and branch_readout_policy_speak is False
            and tool_failure_important_speak is False
            and important_reply_definition_speak is False
            and low_battery_pi_tts_speak is False
            and night_road_speaker_policy_speak is False
            and quiet_low_battery_pi_tts_speak is False
            and quiet_night_road_api_tts_speak is False
            and screen_or_readout_policy_speak is False
            and readout_vs_screen_policy_speak is False
            and typing_vs_broadcast_policy_speak is False
            and unimportant_reply_pi_tts_speak is False
            and unimportant_message_dialog_speak is False
            and bystander_important_reply_speak is False
            and bystander_important_type_speak is False
            and bystander_low_battery_mute_speak is False
            and tts_decision_no_object_speak is False
            and tts_when_really_speak_speak is False
            and tool_failure_external_audio_speak is False
            and importance_decision_policy_speak is False
            and terse_importance_policy_speak is False
            and route_importance_policy_speak is False
            and story_tts_policy_speak is False
            and weather_voice_policy_speak is False
            and greeting_readout_policy_speak is False,
            "detail": {
                "ttsDecision": frost_tts_decision_fallback,
                "missingTts": frost_missing_tts_fallback,
                "piTts": pi_tts_trigger_fallback,
                "spacedPiTts": spaced_pi_tts_trigger_fallback,
                "importantWordsReadout": important_words_readout_fallback,
                "ordinaryChatPiTts": ordinary_chat_pi_tts_fallback,
                "ordinaryChatSpacedPiTts": ordinary_chat_spaced_pi_tts_fallback,
                "ordinaryQuestionSpacedPiTts": ordinary_question_spaced_pi_tts_fallback,
                "genericReplyPiTts": generic_reply_pi_tts_fallback,
                "thanksPiTts": thanks_pi_tts_fallback,
                "importanceScreen": importance_screen_policy_fallback,
                "currentCityVoiceBroadcast": current_city_voice_broadcast_fallback,
                "ordinaryChatSpeaker": ordinary_chat_speaker_fallback,
                "ordinaryQuestionSpeaker": ordinary_question_speaker_fallback,
                "quietChatVoice": quiet_chat_voice_fallback,
                "questionTtsTrigger": question_tts_trigger_fallback,
                "playlistReadout": playlist_readout_policy_fallback,
                "playlistScreenOnly": ordinary_playlist_screen_policy_fallback,
                "nextStopTts": ordinary_next_stop_tts_policy_fallback,
                "currentTrackScreenOnly": ordinary_current_track_screen_policy_fallback,
                "currentCityTts": ordinary_current_city_tts_policy_fallback,
                "songTitleReadout": ordinary_song_title_readout_policy_fallback,
                "currentPlayingSpeaker": current_playing_speaker_policy_fallback,
                "branchReadout": branch_readout_policy_fallback,
                "toolFailureImportant": tool_failure_important_fallback,
                "importantDefinition": important_reply_definition_fallback,
                "lowBatteryPiTts": low_battery_pi_tts_fallback,
                "nightRoadSpeaker": night_road_speaker_policy_fallback,
                "quietLowBatteryPiTts": quiet_low_battery_pi_tts_fallback,
                "quietNightRoadApiTts": quiet_night_road_api_tts_fallback,
                "readoutVsScreen": readout_vs_screen_policy_fallback,
                "typingVsBroadcast": typing_vs_broadcast_policy_fallback,
                "unimportantReplyPiTts": unimportant_reply_pi_tts_fallback,
                "unimportantMessageDialog": unimportant_message_dialog_fallback,
                "bystanderImportantReply": bystander_important_reply_fallback,
                "bystanderImportantType": bystander_important_type_fallback,
                "bystanderLowBatteryMute": bystander_low_battery_mute_fallback,
                "ttsDecisionNoObject": tts_decision_no_object_fallback,
                "ttsWhenReallySpeak": tts_when_really_speak_fallback,
                "toolFailureExternalAudio": tool_failure_external_audio_fallback,
                "importanceDecision": importance_decision_policy_fallback,
                "terseImportance": terse_importance_policy_fallback,
                "routeImportance": route_importance_policy_fallback,
                "storyTts": story_tts_policy_fallback,
                "weatherVoice": weather_voice_policy_fallback,
                "greetingReadout": greeting_readout_policy_fallback,
                "speakPolicy": {
                    "ordinaryChatPiTts": ordinary_chat_pi_tts_speak,
                    "ordinaryChatSpacedPiTts": ordinary_chat_spaced_pi_tts_speak,
                    "ordinaryQuestionSpacedPiTts": ordinary_question_spaced_pi_tts_speak,
                    "genericReplyPiTts": generic_reply_pi_tts_speak,
                    "thanksPiTts": thanks_pi_tts_speak,
                    "importanceScreen": importance_screen_policy_speak,
                    "currentCityVoiceBroadcast": current_city_voice_broadcast_speak,
                    "ordinaryChatSpeaker": ordinary_chat_speaker_speak,
                    "ordinaryQuestionSpeaker": ordinary_question_speaker_speak,
                    "quietChatVoice": quiet_chat_voice_speak,
                    "questionTtsTrigger": question_tts_trigger_speak,
                    "playlistReadout": playlist_readout_policy_speak,
                    "playlistScreenOnly": ordinary_playlist_screen_policy_speak,
                    "nextStopTts": ordinary_next_stop_tts_policy_speak,
                    "currentTrackScreenOnly": ordinary_current_track_screen_policy_speak,
                    "currentCityTts": ordinary_current_city_tts_policy_speak,
                    "songTitleReadout": ordinary_song_title_readout_policy_speak,
                    "currentPlayingSpeaker": current_playing_speaker_policy_speak,
                    "branchReadout": branch_readout_policy_speak,
                    "toolFailureImportant": tool_failure_important_speak,
                    "importantDefinition": important_reply_definition_speak,
                    "lowBatteryPiTts": low_battery_pi_tts_speak,
                    "nightRoadSpeaker": night_road_speaker_policy_speak,
                    "quietLowBatteryPiTts": quiet_low_battery_pi_tts_speak,
                    "quietNightRoadApiTts": quiet_night_road_api_tts_speak,
                    "readoutVsScreen": readout_vs_screen_policy_speak,
                    "typingVsBroadcast": typing_vs_broadcast_policy_speak,
                    "unimportantReplyPiTts": unimportant_reply_pi_tts_speak,
                    "unimportantMessageDialog": unimportant_message_dialog_speak,
                    "bystanderImportantReply": bystander_important_reply_speak,
                    "bystanderImportantType": bystander_important_type_speak,
                    "bystanderLowBatteryMute": bystander_low_battery_mute_speak,
                    "ttsDecisionNoObject": tts_decision_no_object_speak,
                    "ttsWhenReallySpeak": tts_when_really_speak_speak,
                    "toolFailureExternalAudio": tool_failure_external_audio_speak,
                    "importanceDecision": importance_decision_policy_speak,
                    "terseImportance": terse_importance_policy_speak,
                    "routeImportance": route_importance_policy_speak,
                    "storyTts": story_tts_policy_speak,
                    "weatherVoice": weather_voice_policy_speak,
                    "greetingReadout": greeting_readout_policy_speak,
                },
            },
        },
        {
            "name": "local fallback answers action status writeback questions",
            "passed": "准备执行" in action_status_fallback
            and "调用技能" in action_status_fallback
            and "失败原因" in action_failure_status_fallback
            and "不重复下发" in action_progress_fallback
            and "不重复下发" in action_current_result_fallback
            and "不重复下发" in duplicate_command_status_fallback
            and all(
                "不重复下发" in reply
                for reply in (
                    action_executed_fallback,
                    previous_operation_summary_fallback,
                    previous_action_executed_fallback,
                    previous_action_plain_success_fallback,
                    previous_run_fallback,
                    previous_skill_success_fallback,
                    previous_action_skill_used_fallback,
                    previous_step_tool_called_fallback,
                    tool_stuck_state_retained_fallback,
                    before_status_fallback,
                    tool_done_writeback_fallback,
                    before_preparing_fallback,
                    first_write_status_then_execute_fallback,
                    prewrite_preparing_fallback,
                    postwrite_result_fallback,
                    tool_done_complete_fallback,
                    failure_reason_status_card_fallback,
                    last_action_failure_visible_fallback,
                    no_repeat_last_action_fallback,
                    no_retry_previous_step_fallback,
                    no_retry_previous_skill_fallback,
                    no_repeat_previous_skill_status_fallback,
                    no_retry_previous_skill_status_card_fallback,
                    no_repeat_previous_skill_screen_fallback,
                    previous_tool_hung_fallback,
                    previous_wrong_tool_fallback,
                    previous_action_did_what_colloquial_fallback,
                    previous_action_what_did_you_do_fallback,
                    previous_action_did_what_terse_fallback,
                    previous_done_colloquial_fallback,
                    previous_action_that_time_done_fallback,
                    previous_thing_done_casual_fallback,
                    previous_row_done_casual_fallback,
                    previous_time_success_casual_fallback,
                    previous_action_stuck_casual_fallback,
                    previous_tool_terse_called_fallback,
                    previous_skill_direct_called_fallback,
                    previous_result_screen_casual_fallback,
                    backend_action_done_casual_fallback,
                    current_action_stuck_fallback,
                    action_still_running_fallback,
                    previous_stuck_step_fallback,
                    previous_step_progress_fallback,
                    previous_step_if_failure_reason_fallback,
                    previous_result_screen_fallback,
                    previous_action_casual_success_fallback,
                    previous_step_direct_done_fallback,
                    previous_step_result_still_visible_fallback,
                    previous_command_sent_fallback,
                    repeat_pi_dispatch_fallback,
                    previous_sent_to_pi_fallback,
                    previous_command_sent_to_pi_fallback,
                    previous_command_really_sent_to_pi_fallback,
                    action_transmitted_to_device_fallback,
                    device_received_previous_fallback,
                    request_sent_over_fallback,
                    no_execute_previous_sent_fallback,
                    no_resend_previous_received_fallback,
                    dont_resend_to_pi_fallback,
                    duplicate_sent_once_fallback,
                    duplicate_dispatch_plain_fallback,
                    skill_writeback_result_fallback,
                    tool_finish_writeback_fallback,
                    midrun_tool_status_fallback,
                    tool_midrun_disconnect_visible_fallback,
                    bare_midrun_disconnect_state_fallback,
                    tool_pre_run_activity_fallback,
                    tool_finished_result_fallback,
                    song_action_failure_reason_fallback,
                )
            )
            and "失败原因" in previous_failure_reason_fallback
            and "失败原因" in previous_action_failure_reason_fallback,
            "detail": {
                "status": action_status_fallback,
                "failure": action_failure_status_fallback,
                "progress": action_progress_fallback,
                "currentResult": action_current_result_fallback,
                "duplicate": duplicate_command_status_fallback,
                "executed": action_executed_fallback,
                "operationSummary": previous_operation_summary_fallback,
                "previousAction": previous_action_executed_fallback,
                "previousPlainSuccess": previous_action_plain_success_fallback,
                "previousRun": previous_run_fallback,
                "previousSkill": previous_skill_success_fallback,
                "previousSkillUsed": previous_action_skill_used_fallback,
                "previousToolCalled": previous_step_tool_called_fallback,
                "previousFailureReason": previous_failure_reason_fallback,
                "toolStuckStateRetained": tool_stuck_state_retained_fallback,
                "previousActionFailureReason": previous_action_failure_reason_fallback,
                "beforeStatus": before_status_fallback,
                "toolDoneWriteback": tool_done_writeback_fallback,
                "beforePreparing": before_preparing_fallback,
                "firstWriteStatusThenExecute": first_write_status_then_execute_fallback,
                "prewritePreparing": prewrite_preparing_fallback,
                "postwriteResult": postwrite_result_fallback,
                "toolDoneComplete": tool_done_complete_fallback,
                "failureReasonStatusCard": failure_reason_status_card_fallback,
                "lastActionFailureVisible": last_action_failure_visible_fallback,
                "noRepeat": no_repeat_last_action_fallback,
                "noRetry": no_retry_previous_step_fallback,
                "noRetryPreviousSkill": no_retry_previous_skill_fallback,
                "noRepeatPreviousSkillStatus": no_repeat_previous_skill_status_fallback,
                "noRetryPreviousSkillStatusCard": no_retry_previous_skill_status_card_fallback,
                "noRepeatPreviousSkillScreen": no_repeat_previous_skill_screen_fallback,
                "previousToolHung": previous_tool_hung_fallback,
                "previousWrongTool": previous_wrong_tool_fallback,
                "previousActionDidWhatColloquial": previous_action_did_what_colloquial_fallback,
                "previousActionWhatDidYouDo": previous_action_what_did_you_do_fallback,
                "previousActionDidWhatTerse": previous_action_did_what_terse_fallback,
                "previousDoneColloquial": previous_done_colloquial_fallback,
                "previousThatTimeDone": previous_action_that_time_done_fallback,
                "previousThingDoneCasual": previous_thing_done_casual_fallback,
                "previousRowDoneCasual": previous_row_done_casual_fallback,
                "previousTimeSuccessCasual": previous_time_success_casual_fallback,
                "previousActionStuckCasual": previous_action_stuck_casual_fallback,
                "previousToolTerseCalled": previous_tool_terse_called_fallback,
                "previousSkillDirectCalled": previous_skill_direct_called_fallback,
                "previousResultScreenCasual": previous_result_screen_casual_fallback,
                "backendActionDoneCasual": backend_action_done_casual_fallback,
                "currentActionStuck": current_action_stuck_fallback,
                "actionStillRunning": action_still_running_fallback,
                "previousStuckStep": previous_stuck_step_fallback,
                "previousStepProgress": previous_step_progress_fallback,
                "previousStepIfFailureReason": previous_step_if_failure_reason_fallback,
                "previousResultScreen": previous_result_screen_fallback,
                "previousActionCasualSuccess": previous_action_casual_success_fallback,
                "previousStepResultStillVisible": previous_step_result_still_visible_fallback,
                "previousCommandSent": previous_command_sent_fallback,
                "repeatPiDispatch": repeat_pi_dispatch_fallback,
                "previousSentToPi": previous_sent_to_pi_fallback,
                "previousCommandSentToPi": previous_command_sent_to_pi_fallback,
                "actionTransmittedToDevice": action_transmitted_to_device_fallback,
                "deviceReceivedPrevious": device_received_previous_fallback,
                "requestSentOver": request_sent_over_fallback,
                "noExecutePreviousSent": no_execute_previous_sent_fallback,
                "noResendPreviousReceived": no_resend_previous_received_fallback,
                "dontResendToPi": dont_resend_to_pi_fallback,
                "duplicateSentOnce": duplicate_sent_once_fallback,
                "skillWritebackResult": skill_writeback_result_fallback,
                "toolFinishWriteback": tool_finish_writeback_fallback,
                "midrunToolStatus": midrun_tool_status_fallback,
                "toolMidrunDisconnectVisible": tool_midrun_disconnect_visible_fallback,
                "bareMidrunDisconnectState": bare_midrun_disconnect_state_fallback,
                "toolPreRunActivity": tool_pre_run_activity_fallback,
                "toolFinishedResult": tool_finished_result_fallback,
                "songActionFailureReason": song_action_failure_reason_fallback,
            },
        },
        {
            "name": "local fallback answers skill router confidence questions",
            "passed": "技能路由" in action_router_fallback
            and "点歌" in action_router_fallback
            and "低置信度" in previous_route_play_or_chat_fallback
            and "低置信度" in judge_skill_before_action_fallback
            and "状态医生" in low_confidence_router_fallback
            and "低置信度" in low_confidence_router_fallback
            and "低置信度" in recognition_uncertain_no_click_fallback
            and "低置信度" in uncertain_router_fallback
            and "低置信度" in uncertain_router_direct_fallback
            and "不会乱播" in vague_command_router_fallback
            and "低置信度" in vague_no_action_fallback
            and "不会乱播" in vague_no_direct_play_fallback
            and "不会乱播" in missed_router_fallback
            and "没听完整" in hearing_incomplete_router_fallback
            and "不会按半句乱执行" in partial_direct_router_fallback
            and "低置信度" in unclear_heard_fallback
            and "低置信度" in low_confidence_dont_move_fallback
            and "低置信度" in sentence_skill_needed_fallback
            and "低置信度" in sentence_action_trigger_fallback
            and "低置信度" in which_action_call_fallback
            and "低置信度" in no_real_song_router_fallback
            and all(
                "低置信度" in reply and "不下发" in reply
                for reply in (
                    no_tool_call_dispatch_router_fallback,
                    no_skill_run_action_router_fallback,
                    no_dispatch_open_radio_router_fallback,
                    no_call_skill_which_skill_fallback,
                    no_dispatch_close_radio_router_fallback,
                    no_pause_question_router_fallback,
                    no_mute_question_router_fallback,
                    status_query_no_tool_call_fallback,
                    no_song_skill_route_fallback,
                    hypothetical_play_action_route_fallback,
                    direct_pi_dispatch_router_fallback,
                    direct_action_router_fallback,
                    direct_pi_short_router_fallback,
                    ordinary_chat_as_action_fallback,
                    status_query_real_action_fallback,
                    planned_execute_sentence_fallback,
                    sentence_execute_how_fallback,
                    route_play_or_chat_sentence_fallback,
                    command_misroute_fallback,
                )
            )
            and all(
                "低置信度" in reply and "不会乱播" in reply
                for reply in (
                    ambiguous_speech_direct_fallback,
                    unclear_hearing_direct_play_fallback,
                    recognition_wrong_direct_song_fallback,
                    not_understood_direct_play_fallback,
                    unclear_phrase_direct_song_fallback,
                    misheard_phrase_no_execute_fallback,
                    partial_heard_ask_first_fallback,
                    incomplete_direct_play_guard_fallback,
                    unfinished_no_dispatch_fallback,
                    ask_before_action_fallback,
                    ask_before_song_fallback,
                    ask_clear_before_play_fallback,
                    too_vague_no_random_play_fallback,
                    misheard_no_dispatch_fallback,
                    uncertain_misplay_fallback,
                    unclear_no_action_fallback,
                    incomplete_exact_no_action_fallback,
                    vague_no_dispatch_fallback,
                    unclear_no_hotspot_fallback,
                    unclear_no_skip_fallback,
                    inaccurate_no_execute_fallback,
                    no_confidence_no_hotspot_fallback,
                    misheard_no_hotspot_fallback,
                    unclear_no_radio_fallback,
                    not_understood_screen_only_fallback,
                    low_confidence_no_pi_fallback,
                    uncertain_no_pi_fallback,
                    ordinary_chat_as_song_fallback,
                    chat_no_skill_fallback,
                    asr_wrong_ask_first_fallback,
                    misheard_song_ask_first_fallback,
                    loud_background_mishear_fallback,
                )
            ),
            "detail": {
                "router": action_router_fallback,
                "previousRoutePlayOrChat": previous_route_play_or_chat_fallback,
                "judgeSkillBeforeAction": judge_skill_before_action_fallback,
                "lowConfidence": low_confidence_router_fallback,
                "uncertain": uncertain_router_fallback,
                "uncertainDirect": uncertain_router_direct_fallback,
                "vague": vague_command_router_fallback,
                "vagueNoAction": vague_no_action_fallback,
                "vagueNoDirectPlay": vague_no_direct_play_fallback,
                "missed": missed_router_fallback,
                "hearingIncomplete": hearing_incomplete_router_fallback,
                "partialDirect": partial_direct_router_fallback,
                "lowConfidenceDontMove": low_confidence_dont_move_fallback,
                "sentenceSkillNeeded": sentence_skill_needed_fallback,
                "sentenceActionTrigger": sentence_action_trigger_fallback,
                "whichActionCall": which_action_call_fallback,
                "noRealSongRouter": no_real_song_router_fallback,
                "noToolCallDispatchRouter": no_tool_call_dispatch_router_fallback,
                "noSkillRunActionRouter": no_skill_run_action_router_fallback,
                "statusQueryNoToolCall": status_query_no_tool_call_fallback,
                "noSongSkillRoute": no_song_skill_route_fallback,
                "hypotheticalPlayActionRoute": hypothetical_play_action_route_fallback,
                "directPiDispatchRouter": direct_pi_dispatch_router_fallback,
                "directActionRouter": direct_action_router_fallback,
                "directPiShortRouter": direct_pi_short_router_fallback,
                "ordinaryChatAsAction": ordinary_chat_as_action_fallback,
                "statusQueryRealAction": status_query_real_action_fallback,
                "plannedExecuteSentence": planned_execute_sentence_fallback,
                "sentenceExecuteHow": sentence_execute_how_fallback,
                "routePlayOrChatSentence": route_play_or_chat_sentence_fallback,
                "commandMisroute": command_misroute_fallback,
                "ambiguousSpeech": ambiguous_speech_direct_fallback,
                "unclearDirectPlay": unclear_hearing_direct_play_fallback,
                "recognitionWrongDirectSong": recognition_wrong_direct_song_fallback,
                "notUnderstoodDirectPlay": not_understood_direct_play_fallback,
                "unclearPhraseDirectSong": unclear_phrase_direct_song_fallback,
                "misheardPhraseNoExecute": misheard_phrase_no_execute_fallback,
                "partialHeardAskFirst": partial_heard_ask_first_fallback,
                "incompleteDirectPlayGuard": incomplete_direct_play_guard_fallback,
                "unfinishedNoDispatch": unfinished_no_dispatch_fallback,
                "askBeforeAction": ask_before_action_fallback,
                "askBeforeSong": ask_before_song_fallback,
                "askClearBeforePlay": ask_clear_before_play_fallback,
                "tooVagueNoRandomPlay": too_vague_no_random_play_fallback,
                "misheardNoDispatch": misheard_no_dispatch_fallback,
                "uncertainMisplay": uncertain_misplay_fallback,
                "unclearNoAction": unclear_no_action_fallback,
                "vagueNoDispatch": vague_no_dispatch_fallback,
                "ordinaryChatAsSong": ordinary_chat_as_song_fallback,
                "chatNoSkill": chat_no_skill_fallback,
                "asrWrongAskFirst": asr_wrong_ask_first_fallback,
                "misheardSongAskFirst": misheard_song_ask_first_fallback,
                "loudBackgroundMishear": loud_background_mishear_fallback,
            },
        },
        {
            "name": "local fallback answers natural-language understanding questions",
            "passed": all(
                "自然口语" in reply and "不必背关键词" in reply and "请你重说" in reply
                for reply in (
                    natural_language_fallback,
                    no_keyword_language_fallback,
                    human_language_fallback,
                    casual_natural_language_fallback,
                )
            ),
            "detail": {
                "natural": natural_language_fallback,
                "noKeyword": no_keyword_language_fallback,
                "human": human_language_fallback,
                "casual": casual_natural_language_fallback,
            },
        },
        {
            "name": "local fallback answers context memory boundary questions",
            "passed": "上一句" in memory_boundary_fallback
            and "上一句" in context_ttl_fallback
            and "上一动作" in context_continue_fallback
            and "上一句" in previous_chat_context_fallback
            and "上一句" in current_round_context_fallback
            and "上一句" in recent_sentence_continue_fallback
            and "不长期记住身份、位置或偏好" in casual_current_round_mood_memory_fallback
            and "上一句" in casual_previous_context_fallback
            and "上一句" in previous_sentence_loss_fallback
            and "当前城市/歌曲" in current_conversation_only_fallback
            and "当前城市/歌曲" in current_dialog_no_cloud_memory_fallback
            and "不长期记住身份、位置或偏好" in long_term_preference_no_save_fallback
            and "上一动作" in location_memory_fallback
            and "不长期记住身份、位置或偏好" in location_direct_memory_fallback
            and "当前城市/歌曲" in mood_memory_fallback
            and "不长期记住身份、位置或偏好" in memory_boundary_fallback
            and "不长期记住身份、位置或偏好" in preference_memory_fallback
            and "当前城市/歌曲" in just_said_preference_fallback
            and "不长期记住身份、位置或偏好" in preference_continue_memory_fallback
            and "不长期记住身份、位置或偏好" in preference_long_term_memory_fallback
            and "不长期记住身份、位置或偏好" in preference_next_time_memory_fallback
            and "不长期记住身份、位置或偏好" in mood_long_term_memory_fallback
            and "不长期记住身份、位置或偏好" in future_no_preference_memory_fallback
            and "当前城市/歌曲" in current_dialog_preference_memory_fallback
            and "不长期记住身份、位置或偏好" in music_preference_saved_fallback
            and "不长期记住身份、位置或偏好" in music_preference_device_storage_fallback
            and "不会拿去训练" in preference_training_fallback
            and "不长期记住身份、位置或偏好" in preference_next_round_phrase_fallback
            and "当前城市/歌曲" in current_dialog_plain_memory_fallback
            and "不长期记住身份、位置或偏好" in current_round_use_memory_fallback
            and "不长期记住身份、位置或偏好" in current_round_keep_memory_fallback
            and "不长期记住身份、位置或偏好" in temporary_listen_memory_fallback
            and "不长期记住身份、位置或偏好" in temporary_only_memory_fallback
            and "不长期记住身份、位置或偏好" in tonight_playlist_memory_fallback
            and "不长期记住身份、位置或偏好" in tonight_forget_mood_memory_fallback
            and "不长期记住身份、位置或偏好" in current_round_now_preference_memory_fallback
            and "不长期记住身份、位置或偏好" in current_round_tonight_preference_memory_fallback
            and "不长期记住身份、位置或偏好" in tonight_after_forget_preference_memory_fallback
            and "不长期记住身份、位置或偏好" in just_said_mood_tonight_memory_fallback
            and "不长期记住身份、位置或偏好" in current_mood_no_long_term_memory_fallback
            and "不长期记住身份、位置或偏好" in tomorrow_forget_preference_memory_fallback
            and "不长期记住身份、位置或偏好" in today_preference_tomorrow_forget_fallback
            and "不长期记住身份、位置或偏好" in tomorrow_boundary_memory_fallback
            and "不长期记住身份、位置或偏好" in utterance_next_time_memory_fallback
            and "当前城市/歌曲" in message_current_round_memory_fallback
            and "当前城市/歌曲" in message_current_round_plain_memory_fallback
            and "不长期记住身份、位置或偏好" in utterance_future_memory_fallback
            and "不长期记住身份、位置或偏好" in quiet_song_preference_saved_fallback
            and "不长期记住身份、位置或偏好" in persistent_song_memory_fallback
            and "不长期记住身份、位置或偏好" in future_song_memory_fallback
            and "不长期记住身份、位置或偏好" in next_time_mood_memory_fallback
            and "不长期记住身份、位置或偏好" in no_long_term_seaside_memory_fallback
            and "不会拿去训练" in playlist_preference_cloud_fallback
            and "语音隐私" in outdoor_route_location_memory_fallback
            and "路线" in outdoor_route_location_memory_fallback
            and "不会触发播放" in outdoor_route_location_memory_fallback
            and "语音隐私" in friend_company_memory_fallback
            and "同行关系" in friend_company_memory_fallback
            and "不会触发播放" in friend_company_memory_fallback
            and "语音隐私" in coworker_company_memory_fallback
            and "同行关系" in coworker_company_memory_fallback
            and "不会触发播放" in coworker_company_memory_fallback
            and "调试日志" in spoken_line_log_privacy_fallback
            and "不会触发播放" in spoken_line_log_privacy_fallback
            and "调试日志" in route_log_privacy_fallback
            and "路线" in route_log_privacy_fallback
            and "语音隐私" in going_home_saved_privacy_fallback
            and "不会触发播放" in going_home_saved_privacy_fallback
            and "调试日志" in going_home_log_privacy_fallback
            and "不会触发播放" in going_home_log_privacy_fallback
            and "调试日志" in friend_log_privacy_fallback
            and "同行关系" in friend_log_privacy_fallback
            and "调试日志" in destination_log_written_fallback
            and "语音隐私" in friend_walk_record_fallback
            and "同行关系" in friend_walk_record_fallback
            and preference_memory_speak is False
            and just_said_preference_speak is False
            and previous_sentence_loss_speak is False
            and preference_continue_memory_speak is False
            and preference_long_term_memory_speak is False
            and preference_next_time_memory_speak is False
            and mood_long_term_memory_speak is False
            and future_no_preference_memory_speak is False
            and current_dialog_preference_memory_speak is False
            and current_dialog_no_cloud_memory_speak is False
            and current_round_use_memory_speak is False
            and current_round_keep_memory_speak is False
            and temporary_listen_memory_speak is False
            and temporary_only_memory_speak is False
            and tonight_playlist_memory_speak is False
            and tonight_forget_mood_memory_speak is False
            and current_round_now_preference_memory_speak is False
            and current_round_tonight_preference_memory_speak is False
            and tonight_after_forget_preference_memory_speak is False
            and just_said_mood_tonight_memory_speak is False
            and current_mood_no_long_term_memory_speak is False
            and tomorrow_forget_preference_memory_speak is False
            and today_preference_tomorrow_forget_speak is False
            and tomorrow_boundary_memory_speak is False
            and utterance_next_time_memory_speak is False
            and message_current_round_memory_speak is False
            and message_current_round_plain_memory_speak is False
            and utterance_future_memory_speak is False
            and preference_training_speak is False
            and preference_next_round_phrase_speak is False
            and persistent_song_memory_speak is False
            and future_song_memory_speak is False
            and next_time_mood_memory_speak is False
            and no_long_term_seaside_memory_speak is False
            and playlist_preference_cloud_speak is False
            and outdoor_route_location_memory_speak is False
            and friend_company_memory_speak is False
            and coworker_company_memory_speak is False
            and destination_log_written_speak is False
            and friend_walk_record_speak is False
            and spoken_line_log_privacy_speak is False
            and route_log_privacy_speak is False
            and going_home_saved_privacy_speak is False
            and going_home_log_privacy_speak is False
            and friend_log_privacy_speak is False,
            "detail": {
                "memory": memory_boundary_fallback,
                "contextTtl": context_ttl_fallback,
                "contextContinue": context_continue_fallback,
                "previousChatContext": previous_chat_context_fallback,
                "currentRoundContext": current_round_context_fallback,
                "recentSentenceContinue": recent_sentence_continue_fallback,
                "casualCurrentRoundMood": casual_current_round_mood_memory_fallback,
                "casualPreviousContext": casual_previous_context_fallback,
                "previousSentenceLoss": previous_sentence_loss_fallback,
                "currentConversationOnly": current_conversation_only_fallback,
                "longTermPreferenceNoSave": long_term_preference_no_save_fallback,
                "location": location_memory_fallback,
                "directLocation": location_direct_memory_fallback,
                "mood": mood_memory_fallback,
                "preference": preference_memory_fallback,
                "justSaidPreference": just_said_preference_fallback,
                "preferenceContinue": preference_continue_memory_fallback,
                "preferenceLongTerm": preference_long_term_memory_fallback,
                "preferenceNextTime": preference_next_time_memory_fallback,
                "moodLongTerm": mood_long_term_memory_fallback,
                "futureNoPreference": future_no_preference_memory_fallback,
                "currentDialogPreference": current_dialog_preference_memory_fallback,
                "musicPreferenceSaved": music_preference_saved_fallback,
                "quietSongPreferenceSaved": quiet_song_preference_saved_fallback,
                "persistentSong": persistent_song_memory_fallback,
                "futureSong": future_song_memory_fallback,
                "utteranceNextTime": utterance_next_time_memory_fallback,
                "tonightForgetMood": tonight_forget_mood_memory_fallback,
                "currentRoundNowPreference": current_round_now_preference_memory_fallback,
                "currentRoundTonightPreference": current_round_tonight_preference_memory_fallback,
                "tonightAfterForgetPreference": tonight_after_forget_preference_memory_fallback,
                "justSaidMoodTonight": just_said_mood_tonight_memory_fallback,
                "currentMoodNoLongTerm": current_mood_no_long_term_memory_fallback,
                "tomorrowForgetPreference": tomorrow_forget_preference_memory_fallback,
                "todayPreferenceTomorrowForget": today_preference_tomorrow_forget_fallback,
                "messageCurrentRound": message_current_round_memory_fallback,
                "messageCurrentRoundPlain": message_current_round_plain_memory_fallback,
                "utteranceFuture": utterance_future_memory_fallback,
                "nextTimeMood": next_time_mood_memory_fallback,
                "noLongTermSeaside": no_long_term_seaside_memory_fallback,
                "playlistPreferenceCloud": playlist_preference_cloud_fallback,
                "outdoorRouteLocation": outdoor_route_location_memory_fallback,
                "friendCompany": friend_company_memory_fallback,
                "coworkerCompany": coworker_company_memory_fallback,
                "spokenLineLog": spoken_line_log_privacy_fallback,
                "routeLog": route_log_privacy_fallback,
                "goingHomeSaved": going_home_saved_privacy_fallback,
                "goingHomeLog": going_home_log_privacy_fallback,
                "friendLog": friend_log_privacy_fallback,
                "destinationLogWritten": destination_log_written_fallback,
                "friendWalkRecord": friend_walk_record_fallback,
                "speaks": {
                    "preference": preference_memory_speak,
                    "justSaidPreference": just_said_preference_speak,
                    "previousSentenceLoss": previous_sentence_loss_speak,
                    "preferenceContinue": preference_continue_memory_speak,
                    "preferenceLongTerm": preference_long_term_memory_speak,
                    "preferenceNextTime": preference_next_time_memory_speak,
                    "moodLongTerm": mood_long_term_memory_speak,
                    "futureNoPreference": future_no_preference_memory_speak,
                    "currentDialogPreference": current_dialog_preference_memory_speak,
                    "persistentSong": persistent_song_memory_speak,
                    "futureSong": future_song_memory_speak,
                    "utteranceNextTime": utterance_next_time_memory_speak,
                    "tonightForgetMood": tonight_forget_mood_memory_speak,
                    "currentRoundNowPreference": current_round_now_preference_memory_speak,
                    "currentRoundTonightPreference": current_round_tonight_preference_memory_speak,
                    "tonightAfterForgetPreference": tonight_after_forget_preference_memory_speak,
                    "justSaidMoodTonight": just_said_mood_tonight_memory_speak,
                    "currentMoodNoLongTerm": current_mood_no_long_term_memory_speak,
                    "tomorrowForgetPreference": tomorrow_forget_preference_memory_speak,
                    "todayPreferenceTomorrowForget": today_preference_tomorrow_forget_speak,
                    "messageCurrentRound": message_current_round_memory_speak,
                    "messageCurrentRoundPlain": message_current_round_plain_memory_speak,
                    "utteranceFuture": utterance_future_memory_speak,
                    "nextTimeMood": next_time_mood_memory_speak,
                    "noLongTermSeaside": no_long_term_seaside_memory_speak,
                    "playlistPreferenceCloud": playlist_preference_cloud_speak,
                    "outdoorRouteLocation": outdoor_route_location_memory_speak,
                    "friendCompany": friend_company_memory_speak,
                    "coworkerCompany": coworker_company_memory_speak,
                    "destinationLogWritten": destination_log_written_speak,
                    "friendWalkRecord": friend_walk_record_speak,
                    "spokenLineLog": spoken_line_log_privacy_speak,
                    "routeLog": route_log_privacy_speak,
                    "goingHomeSaved": going_home_saved_privacy_speak,
                    "goingHomeLog": going_home_log_privacy_speak,
                    "friendLog": friend_log_privacy_speak,
                },
            },
        },
        {
            "name": "local fallback explains important TTS policy",
            "passed": "低电量" in tts_policy_fallback
            and "户外求助" in tts_policy_fallback
            and "只写屏" in tts_policy_fallback
            and "技能失败" in tool_failure_tts_policy_fallback
            and "低电量" in low_battery_tts_policy_fallback
            and "户外" in night_road_tts_policy_fallback,
            "detail": {
                "base": tts_policy_fallback,
                "toolFailure": tool_failure_tts_policy_fallback,
                "lowBattery": low_battery_tts_policy_fallback,
                "nightRoad": night_road_tts_policy_fallback,
            },
        },
        {
            "name": "local fallback explains external audio policy quietly",
            "passed": "低电量" in external_audio_policy_fallback
            and "不朗读" in external_audio_policy_fallback
            and "只写屏" in external_audio_policy_fallback
            and "只写屏" in sudden_ring_policy_fallback
            and "只写屏" in outdoor_speaker_policy_fallback
            and "只写屏" in no_earbud_ring_policy_fallback
            and "只写屏" in nearby_no_sudden_speak_fallback
            and "不朗读" in earbud_readout_fallback
            and "不朗读" in no_earbud_readout_fallback
            and "只写屏" in earbud_connected_readout_fallback
            and sudden_ring_speak is False
            and outdoor_speaker_speak is False
            and no_earbud_ring_speak is False
            and nearby_no_sudden_speak is False,
            "detail": {
                "external": external_audio_policy_fallback,
                "suddenRing": sudden_ring_policy_fallback,
                "outdoorSpeaker": outdoor_speaker_policy_fallback,
                "noEarbudRing": no_earbud_ring_policy_fallback,
                "nearbyNoSuddenSpeak": nearby_no_sudden_speak_fallback,
                "earbud": earbud_readout_fallback,
                "noEarbud": no_earbud_readout_fallback,
                "connectedEarbud": earbud_connected_readout_fallback,
            },
        },
        {
            "name": "local fallback answers audio-mode status questions",
            "passed": "声音模式" in audio_mode_fallback
            and "问状态不改模式" in audio_mode_fallback
            and "声音模式" in quiet_mode_status_fallback
            and "声音模式" in no_voice_reason_fallback
            and no_voice_reason_speak is False
            and "解除静音" in audio_release_fallback
            and "声音模式" in audio_external_fallback,
            "detail": audio_mode_fallback + " / " + quiet_mode_status_fallback + " / " + no_voice_reason_fallback + " / " + audio_release_fallback + " / " + audio_external_fallback,
        },
        {
            "name": "local fallback explains mute guard protection",
            "passed": "静音守卫" in mute_guard_fallback
            and "静音守卫" in outdoor_no_external_audio_fallback
            and "soft_mute" in soft_mute_fallback
            and "播放器音量" in soft_mute_fallback
            and "重启" in restart_mute_fallback
            and "不会绕过保护突然外放" in restart_mute_fallback,
            "detail": {
                "guard": mute_guard_fallback,
                "outdoorNoExternalAudio": outdoor_no_external_audio_fallback,
                "softMute": soft_mute_fallback,
                "restart": restart_mute_fallback,
            },
        },
        {
            "name": "local fallback answers voice-doctor status questions",
            "passed": "语音医生" in voice_doctor_fallback
            and "麦克风" in voice_doctor_fallback
            and "唤醒窗口" in wake_issue_fallback
            and "语音医生" in wake_name_no_response_fallback
            and "不会触发播放" in voice_heard_me_fallback
            and all(
                "语音医生" in reply and "ASR" in reply and "不会触发播放" in reply
                for reply in noisy_voice_status_fallbacks.values()
            ),
            "detail": voice_doctor_fallback
            + " / "
            + wake_issue_fallback
            + " / "
            + wake_name_no_response_fallback
            + " / "
            + voice_heard_me_fallback
            + " / "
            + json.dumps(noisy_voice_status_fallbacks, ensure_ascii=False),
        },
        {
            "name": "local fallback explains wake word guide questions",
            "passed": "弗洛斯特" in wake_word_guide_fallback
            and "小福" in wake_name_guide_fallback
            and "日落电台" in wake_nickname_guide_fallback
            and "弗洛斯特" in wake_casual_nickname_fallback
            and "一口气说完整需求" in wake_word_guide_fallback
            and "请你重说" in wake_name_guide_fallback,
            "detail": {
                "how": wake_word_guide_fallback,
                "name": wake_name_guide_fallback,
                "nickname": wake_nickname_guide_fallback,
                "casualNickname": wake_casual_nickname_fallback,
            },
        },
        {
            "name": "local fallback explains wake-window partial utterance guardrail",
            "passed": "一小段完整语音" in wake_window_fallback
            and "写屏请你重说" in partial_utterance_fallback
            and "不会按半句乱执行" in partial_utterance_fallback
            and "不会按半句乱执行" in half_heard_wrong_press_fallback
            and "不会按半句乱执行" in paused_half_utterance_fallback
            and "不会按半句乱执行" in wait_until_done_fallback
            and "不会按半句乱执行" in incomplete_no_action_fallback
            and "写屏请你重说" in asr_confidence_screen_fallback,
            "detail": {
                "wakeWindow": wake_window_fallback,
                "partial": partial_utterance_fallback,
                "halfHeard": half_heard_wrong_press_fallback,
                "pausedHalf": paused_half_utterance_fallback,
                "waitUntilDone": wait_until_done_fallback,
                "incompleteNoAction": incomplete_no_action_fallback,
                "asrConfidence": asr_confidence_screen_fallback,
            },
        },
        {
            "name": "local fallback explains wake-source guardrail",
            "passed": all(
                "唤醒守卫" in reply
                and "不下命令" in reply
                and "不连热点" in reply
                and "不播放" in reply
                for reply in (
                    wake_source_guard_fallback,
                    wake_no_name_guard_fallback,
                    wake_partial_no_dispatch_fallback,
                    partial_pause_no_execute_fallback,
                    half_sentence_not_command_fallback,
                    bystander_call_no_move_fallback,
                    *quoted_source_fallbacks.values(),
                )
            )
            and bystander_call_no_move_speak is False
            and partial_pause_no_execute_speak is False
            and half_sentence_not_command_speak is False
            and all(speak is False for speak in quoted_source_speaks.values()),
            "detail": {
                "bystander": wake_source_guard_fallback,
                "noName": wake_no_name_guard_fallback,
                "partial": wake_partial_no_dispatch_fallback,
                "partialPauseNoExecute": partial_pause_no_execute_fallback,
                "halfSentenceNotCommand": half_sentence_not_command_fallback,
                "bystanderCallNoMove": bystander_call_no_move_fallback,
                "bystanderCallNoMoveSpeak": bystander_call_no_move_speak,
                "partialPauseNoExecuteSpeak": partial_pause_no_execute_speak,
                "halfSentenceNotCommandSpeak": half_sentence_not_command_speak,
                "quotedSource": quoted_source_fallbacks,
                "quotedSourceSpeaks": quoted_source_speaks,
            },
        },
        {
            "name": "local fallback explains skill failure guardrail",
            "passed": "不会乱点" in failure_guardrail_fallback
            and "屏幕" in failure_guardrail_fallback
            and "兜底" in failure_guardrail_fallback
            and "不会乱点" in repeat_failure_guardrail_fallback
            and "不会乱点" in skill_not_rerun_failure_fallback
            and "乱播" in play_request_no_replay_failure_fallback
            and "屏幕" in pi_delivery_failure_screen_fallback
            and "安静兜底" in previous_step_no_continue_fallback
            and "不会乱点" in tool_hung_no_random_action_fallback
            and skill_not_rerun_failure_speak is False
            and play_request_no_replay_failure_speak is False
            and pi_delivery_failure_screen_speak is False
            and previous_step_no_continue_speak is False
            and tool_hung_no_random_action_speak is False
            and "无限重试" in tool_repeat_guardrail_fallback
            and "无限重试" in tool_timeout_repeat_guardrail_fallback
            and "无限重试" in infinite_retry_guardrail_fallback
            and "安全重试" in failure_retry_again_fallback
            and "无限重试" in previous_auto_retry_guardrail_fallback
            and "无限重试" in previous_request_retry_guardrail_fallback
            and "技能失败" in skill_failure_reason_fallback
            and "技能失败" in route_failure_reason_fallback
            and "屏幕" in pi_dispatch_failure_screen_fallback
            and "安静兜底" in playback_command_failure_quiet_fallback
            and "屏幕" in failure_reason_screen_fallback
            and "不会乱点" in skill_ran_bad_guardrail_fallback
            and "不会乱点" in broken_skill_no_retry_fallback
            and broken_skill_no_retry_speak is False
            and "技能失败" in screen_only_failure_fallback
            and "低置信度" in misunderstood_no_execute_fallback,
            "detail": {
                "base": failure_guardrail_fallback,
                "repeatFailure": repeat_failure_guardrail_fallback,
                "skillNotRerunFailure": skill_not_rerun_failure_fallback,
                "playRequestNoReplayFailure": play_request_no_replay_failure_fallback,
                "piDeliveryFailureScreen": pi_delivery_failure_screen_fallback,
                "previousStepNoContinue": previous_step_no_continue_fallback,
                "toolHungNoRandomAction": tool_hung_no_random_action_fallback,
                "actionFailureSpeaks": {
                    "skillNotRerunFailure": skill_not_rerun_failure_speak,
                    "playRequestNoReplayFailure": play_request_no_replay_failure_speak,
                    "piDeliveryFailureScreen": pi_delivery_failure_screen_speak,
                    "previousStepNoContinue": previous_step_no_continue_speak,
                    "toolHungNoRandomAction": tool_hung_no_random_action_speak,
                },
                "toolRepeat": tool_repeat_guardrail_fallback,
                "toolTimeoutRepeat": tool_timeout_repeat_guardrail_fallback,
                "infiniteRetry": infinite_retry_guardrail_fallback,
                "failureRetryAgain": failure_retry_again_fallback,
                "previousAutoRetry": previous_auto_retry_guardrail_fallback,
                "skillFailureReason": skill_failure_reason_fallback,
                "routeFailureReason": route_failure_reason_fallback,
                "piDispatchFailureScreen": pi_dispatch_failure_screen_fallback,
                "playbackCommandFailureQuiet": playback_command_failure_quiet_fallback,
                "failureReasonScreen": failure_reason_screen_fallback,
                "skillRanBad": skill_ran_bad_guardrail_fallback,
                "brokenSkillNoRetry": broken_skill_no_retry_fallback,
                "brokenSkillNoRetrySpeak": broken_skill_no_retry_speak,
                "screenOnly": screen_only_failure_fallback,
                "misunderstood": misunderstood_no_execute_fallback,
            },
        },
        {
            "name": "local fallback explains safe retry guardrail",
            "passed": "安全重试" in retry_guardrail_fallback and "无限重试" in retry_guardrail_fallback,
            "detail": retry_guardrail_fallback,
        },
        {
            "name": "local fallback explains broken tool guardrail",
            "passed": "不会乱点" in broken_tool_fallback and "屏幕" in broken_tool_fallback and "兜底" in broken_tool_fallback,
            "detail": broken_tool_fallback,
        },
        {
            "name": "local fallback explains unavailable skill guardrail",
            "passed": "不会乱点" in unavailable_skill_fallback
            and "安全重试" in unavailable_skill_fallback
            and "不会乱点" in missing_plugin_guardrail_fallback
            and "不会乱点" in missing_tool_guardrail_fallback
            and "安全重试" in missing_action_guardrail_fallback
            and "不会乱点" in missing_ability_guardrail_fallback
            and "不会乱点" in unknown_skill_guardrail_fallback
            and "不会乱点" in missing_tool_install_guardrail_fallback
            and "不会乱点" in plugin_no_call_guardrail_fallback
            and "安全重试" in missing_credential_guardrail_fallback
            and "不会乱点" in unavailable_model_guardrail_fallback
            and "安静兜底" in missing_permission_guardrail_fallback
            and missing_tool_install_guardrail_speak is False
            and plugin_no_call_guardrail_speak is False
            and missing_credential_guardrail_speak is False
            and unavailable_model_guardrail_speak is False
            and missing_permission_guardrail_speak is False,
            "detail": {
                "unavailableSkill": unavailable_skill_fallback,
                "missingPlugin": missing_plugin_guardrail_fallback,
                "missingTool": missing_tool_guardrail_fallback,
                "missingAction": missing_action_guardrail_fallback,
                "missingAbility": missing_ability_guardrail_fallback,
                "unknownSkill": unknown_skill_guardrail_fallback,
                "missingToolInstall": missing_tool_install_guardrail_fallback,
                "pluginNoCall": plugin_no_call_guardrail_fallback,
                "missingCredential": missing_credential_guardrail_fallback,
                "unavailableModel": unavailable_model_guardrail_fallback,
                "missingPermission": missing_permission_guardrail_fallback,
                "speaks": {
                    "missingToolInstall": missing_tool_install_guardrail_speak,
                    "pluginNoCall": plugin_no_call_guardrail_speak,
                    "missingCredential": missing_credential_guardrail_speak,
                    "unavailableModel": unavailable_model_guardrail_speak,
                    "missingPermission": missing_permission_guardrail_speak,
                },
            },
        },
        {
            "name": "fallback can be disabled by runtime flag",
            "passed": disabled is False,
        },
        {
            "name": "pi command daemon displays otherwise unhandled casual speech quietly",
            "passed": daemon_spoken == [] and any(state.get("label") == "DJ" for state in published),
            "detail": daemon_spoken,
        },
        {
            "name": "literary playlist requests rank quiet local candidates",
            "passed": bool(literary_candidates) and literary_candidates[0].get("id") == "soft-night-1",
            "detail": [track.get("id") for track in literary_candidates],
        },
        {
            "name": "sleep playlist requests rank quiet local candidates",
            "passed": bool(sleep_candidates) and sleep_candidates[0].get("id") == "soft-night-1",
            "detail": [track.get("id") for track in sleep_candidates],
        },
        {
            "name": "hurt playlist requests rank quiet local candidates",
            "passed": bool(hurt_candidates) and hurt_candidates[0].get("id") == "soft-night-1",
            "detail": [track.get("id") for track in hurt_candidates],
        },
        {
            "name": "anxious playlist requests rank quiet local candidates",
            "passed": bool(anxious_candidates) and anxious_candidates[0].get("id") == "soft-night-1",
            "detail": [track.get("id") for track in anxious_candidates],
        },
        {
            "name": "rain playlist requests rank rain local candidates",
            "passed": bool(rain_candidates) and rain_candidates[0].get("id") == "rain-1",
            "detail": [track.get("id") for track in rain_candidates],
        },
        {
            "name": "rain voice request is treated as open playlist",
            "passed": rain_phrase_is_playlist is True,
        },
        {
            "name": "plain rain statement stays conversational",
            "passed": rain_statement_is_playlist is False,
        },
        {
            "name": "volume description is not treated as open playlist",
            "passed": volume_phrase_is_playlist is False,
        },
        {
            "name": "focus playlist requests rank work-friendly local candidates",
            "passed": bool(focus_candidates) and focus_candidates[0].get("id") == "focus-1",
            "detail": [track.get("id") for track in focus_candidates],
        },
        {
            "name": "driving playlist requests rank road local candidates",
            "passed": bool(road_candidates) and road_candidates[0].get("id") == "road-1",
            "detail": [track.get("id") for track in road_candidates],
        },
        {
            "name": "way-home stable playlist requests rank road local candidates",
            "passed": bool(way_home_candidates) and way_home_candidates[0].get("id") == "road-1",
            "detail": [track.get("id") for track in way_home_candidates],
        },
        {
            "name": "lakeside walking requests rank water/open-air candidates",
            "passed": bool(lake_candidates) and lake_candidates[0].get("id") == "lake-1",
            "detail": [track.get("id") for track in lake_candidates],
        },
        {
            "name": "walking quiet playlist requests rank calm local candidates",
            "passed": bool(walking_quiet_candidates) and walking_quiet_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in walking_quiet_candidates],
        },
        {
            "name": "sea-sunset pick-songs request ranks water/open-air candidates",
            "passed": bool(sea_sunset_candidates) and sea_sunset_candidates[0].get("id") == "lake-1",
            "detail": [track.get("id") for track in sea_sunset_candidates],
        },
        {
            "name": "quiet non-noisy requests rank calm local candidates",
            "passed": bool(quiet_candidates) and quiet_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in quiet_candidates],
        },
        {
            "name": "come-a-quiet-song requests rank calm local candidates",
            "passed": bool(quiet_song_candidates) and quiet_song_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in quiet_song_candidates],
        },
        {
            "name": "not-too-loud song requests rank calm local candidates",
            "passed": bool(tired_quiet_candidates) and tired_quiet_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in tired_quiet_candidates],
        },
        {
            "name": "bare quiet song requests rank calm local candidates",
            "passed": bool(bare_quiet_song_candidates) and bare_quiet_song_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in bare_quiet_song_candidates],
        },
        {
            "name": "spoken quiet play requests rank calm local candidates",
            "passed": bool(spoken_quiet_play_candidates) and spoken_quiet_play_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in spoken_quiet_play_candidates],
        },
        {
            "name": "switch-to-quiet song requests rank calm local candidates",
            "passed": bool(switch_quiet_song_candidates) and switch_quiet_song_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in switch_quiet_song_candidates],
        },
        {
            "name": "switch-to-not-too-loud song requests rank calm local candidates",
            "passed": bool(switch_not_too_loud_candidates) and switch_not_too_loud_candidates[0].get("id") in {"focus-1", "soft-night-1"},
            "detail": [track.get("id") for track in switch_not_too_loud_candidates],
        },
        {
            "name": "switch-to-rain song requests rank rain local candidates",
            "passed": bool(switch_rain_song_candidates) and switch_rain_song_candidates[0].get("id") == "rain-1",
            "detail": [track.get("id") for track in switch_rain_song_candidates],
        },
        {
            "name": "switch-to-way-home song requests rank road local candidates",
            "passed": bool(switch_way_home_song_candidates) and switch_way_home_song_candidates[0].get("id") == "road-1",
            "detail": [track.get("id") for track in switch_way_home_song_candidates],
        },
        {
            "name": "switch-to-focus song requests rank work-friendly local candidates",
            "passed": bool(switch_focus_song_candidates) and switch_focus_song_candidates[0].get("id") == "focus-1",
            "detail": [track.get("id") for track in switch_focus_song_candidates],
        },
        {
            "name": "bare switch playlist requests rank matching local candidates",
            "passed": bool(switch_focus_bare_candidates)
            and switch_focus_bare_candidates[0].get("id") == "focus-1"
            and bool(switch_commute_bare_candidates)
            and switch_commute_bare_candidates[0].get("id") == "road-1"
            and bool(switch_lakeside_bare_candidates)
            and switch_lakeside_bare_candidates[0].get("id") == "lake-1",
            "detail": {
                "focus": [track.get("id") for track in switch_focus_bare_candidates],
                "commute": [track.get("id") for track in switch_commute_bare_candidates],
                "lakeside": [track.get("id") for track in switch_lakeside_bare_candidates],
            },
        },
        {
            "name": "lakeside voice request is treated as open playlist",
            "passed": lake_phrase_is_playlist is True,
        },
        {
            "name": "way-home music request is treated as open playlist",
            "passed": way_home_phrase_is_playlist is True,
        },
        {
            "name": "plain anxious way-home statement stays conversational",
            "passed": way_home_safety_is_playlist is False,
        },
        {
            "name": "walking quiet music request is treated as open playlist",
            "passed": walking_quiet_phrase_is_playlist is True,
        },
        {
            "name": "come-a-quiet-song request is treated as open playlist",
            "passed": quiet_song_phrase_is_playlist is True,
        },
        {
            "name": "not-too-loud song request is treated as open playlist",
            "passed": tired_quiet_phrase_is_playlist is True,
        },
        {
            "name": "bare quiet song request is treated as open playlist",
            "passed": bare_quiet_song_phrase_is_playlist is True,
        },
        {
            "name": "spoken quiet play request is treated as open playlist",
            "passed": spoken_quiet_play_phrase_is_playlist is True,
        },
        {
            "name": "switch-to-quiet song request is treated as open playlist",
            "passed": switch_quiet_song_phrase_is_playlist is True and switch_quiet_song_is_qualified_playlist is True,
        },
        {
            "name": "switch-to-not-too-loud song request is treated as open playlist",
            "passed": switch_not_too_loud_phrase_is_playlist is True and switch_not_too_loud_is_qualified_playlist is True,
        },
        {
            "name": "switch-to-scene song requests are treated as qualified open playlists",
            "passed": switch_rain_song_phrase_is_playlist is True
            and switch_way_home_song_phrase_is_playlist is True
            and switch_focus_song_phrase_is_playlist is True
            and switch_rain_song_is_qualified_playlist is True
            and switch_way_home_song_is_qualified_playlist is True
            and switch_focus_song_is_qualified_playlist is True,
        },
        {
            "name": "bare switch playlist requests are treated as qualified open playlists",
            "passed": switch_focus_bare_phrase_is_playlist is True
            and switch_commute_bare_phrase_is_playlist is True
            and switch_lakeside_bare_phrase_is_playlist is True
            and switch_focus_bare_is_qualified_playlist is True
            and switch_commute_bare_is_qualified_playlist is True
            and switch_lakeside_bare_is_qualified_playlist is True,
        },
        {
            "name": "plain change-song request stays generic skip",
            "passed": plain_change_song_phrase_is_playlist is False
            and plain_change_song_is_qualified_playlist is False
            and plain_switch_song_phrase_is_playlist is False
            and plain_switch_one_song_phrase_is_playlist is False
            and plain_switch_song_is_qualified_playlist is False
            and plain_switch_one_song_is_qualified_playlist is False,
        },
        {
            "name": "quiet volume-only request is not treated as open playlist",
            "passed": quiet_volume_only_is_playlist is False,
        },
        {
            "name": "plain commute/coding statements stay conversational",
            "passed": commute_traffic_statement_is_playlist is False and coding_do_not_bother_is_playlist is False,
        },
        {
            "name": "sea-sunset pick-songs request is treated as open playlist",
            "passed": sea_sunset_phrase_is_playlist is True,
        },
        {
            "name": "plain lakeside statement stays conversational",
            "passed": lake_statement_is_playlist is False,
        },
        {
            "name": "plain outside walking statement stays conversational",
            "passed": outside_walk_statement_is_playlist is False,
        },
        {
            "name": "local fallback answers compact voice safety followups",
            "passed": all(
                "语音医生" in noisy_voice_status_fallbacks[phrase]
                for phrase in ("刚刚我说的你听见了吗", "刚刚那句话你听清了吗")
            )
            and "不会按半句乱执行" in half_sentence_action_guard_fallback
            and "不下发" in direct_pi_send_router_fallback
            and "技能失败" in missing_skill_casual_fallback
            and "安静兜底" in missing_skill_casual_fallback
            and missing_skill_casual_speak is False
            and "写回屏幕" in previous_action_screen_writeback_fallback
            and "当前 SSID" in current_home_network_still_fallback
            and "密码只在私密配置" in hotspot_secret_screen_fallback
            and "密码只在私密配置" in hotspot_secret_screen_direct_fallback
            and "密码只在私密配置" in wifi_secret_hidden_fallback
            and hotspot_secret_screen_speak is False
            and hotspot_secret_screen_direct_speak is False
            and wifi_secret_hidden_speak is False
            and "不长期记住" in walking_companion_memory_fallback
            and walking_companion_memory_speak is False
            and "语音隐私" in current_sentence_log_privacy_fallback
            and current_sentence_log_privacy_speak is False
            and "只在屏幕上" in crowded_screen_reply_fallback
            and crowded_screen_reply_speak is False
            and all(
                "路线问题" in fallback and "不打断播放" in fallback
                for fallback in (
                    route_screen_write_fallback,
                    route_screen_city_fallback,
                    route_no_jump_station_fallback,
                )
            )
            and "歌单问题" in playlist_screen_only_fallback
            and "默认只写屏" in important_crowded_text_fallback
            and "本地控制 API" in phone_web_current_song_fallback
            and "外部声音" in tv_wake_cancel_fallback,
            "detail": {
                "voice": noisy_voice_status_fallbacks,
                "halfSentence": half_sentence_action_guard_fallback,
                "directPi": direct_pi_send_router_fallback,
                "missingSkill": missing_skill_casual_fallback,
                "previousActionWriteback": previous_action_screen_writeback_fallback,
                "homeWifiStill": current_home_network_still_fallback,
                "hotspotSecretScreen": hotspot_secret_screen_fallback,
                "hotspotSecretScreenDirect": hotspot_secret_screen_direct_fallback,
                "wifiSecretHidden": wifi_secret_hidden_fallback,
                "walkingCompanion": walking_companion_memory_fallback,
                "logPrivacy": current_sentence_log_privacy_fallback,
                "screenReply": crowded_screen_reply_fallback,
                "routeScreenWrite": route_screen_write_fallback,
                "routeScreenCity": route_screen_city_fallback,
                "routeNoJump": route_no_jump_station_fallback,
                "playlistScreenOnly": playlist_screen_only_fallback,
                "importantCrowdedText": important_crowded_text_fallback,
                "phoneWebCurrentSong": phone_web_current_song_fallback,
                "tvWakeCancel": tv_wake_cancel_fallback,
            },
        },
    ]

    ok = all(case["passed"] for case in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
