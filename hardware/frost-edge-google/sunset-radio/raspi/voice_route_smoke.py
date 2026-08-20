#!/usr/bin/env python3
import json

import voice_agent


def main():
    published = []
    queued = []
    voice_agent.REQUIRE_WAKE = True
    voice_agent.armed_until = 0.0
    voice_agent.publish_state = lambda *args, **kwargs: published.append({"args": args, "kwargs": kwargs})
    voice_agent.queue_voice_command = lambda text: queued.append(text) or {"ok": True}

    results = []

    def check(name, text, expected_return, expected_new_queue):
        if "inside wake window" in name and not voice_agent.voice_window_open():
            voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
        before = len(queued)
        result = voice_agent.route_transcript(text)
        new_queue = queued[before:]
        passed = result == expected_return and new_queue == expected_new_queue
        results.append(
            {
                "name": name,
                "passed": passed,
                "text": text,
                "result": result,
                "queued": new_queue,
            }
        )

    def check_window_closed(name):
        results.append({"name": name, "passed": not voice_agent.voice_window_open()})

    check("blocks ordinary command before wake", "播放下洛杉矶的歌曲", "", [])
    check("passes safety command without wake", "安静一下", "安静一下", ["安静一下"])
    check("passes misheard correction without wake", "你听错了", "你听错了", ["你听错了"])
    check("passes cancel-previous without wake", "取消刚才", "取消刚才", ["取消刚才"])
    check("passes tv-source cancel without wake", "刚才那句是电视里的别执行", "刚才那句是电视里的别执行", ["刚才那句是电视里的别执行"])
    check("passes side-tv wake cancel without wake", "旁边电视说弗洛斯特别当命令", "旁边电视说弗洛斯特别当命令", ["旁边电视说弗洛斯特别当命令"])
    check("passes passerby-source cancel without wake", "刚刚那句是路人说的别下发", "刚刚那句是路人说的别下发", ["刚刚那句是路人说的别下发"])
    check("passes bystander-source cancel without wake", "上一句是旁边人说的别当命令", "上一句是旁边人说的别当命令", ["上一句是旁边人说的别当命令"])
    check("passes not-my-voice cancel without wake", "不是我说的别执行", "不是我说的别执行", ["不是我说的别执行"])
    check("passes not-my-voice-hotspot cancel without wake", "上一句不是我说的别连热点", "上一句不是我说的别连热点", ["上一句不是我说的别连热点"])
    check("passes no-open-camera privacy status without wake", "别开摄像头，只问你现在看得到吗", "别开摄像头，只问你现在看得到吗", ["别开摄像头，只问你现在看得到吗"])
    check("passes no-open-camera-road status without wake", "我在路上别开摄像头只看状态", "我在路上别开摄像头只看状态", ["我在路上别开摄像头只看状态"])
    check("passes no-open-microphone privacy status without wake", "不要打开麦克风，只想知道麦克风现在开着吗", "不要打开麦克风，只想知道麦克风现在开着吗", ["不要打开麦克风，只想知道麦克风现在开着吗"])
    check("passes previous-reply retype without wake", "刚才你说的再打一遍", "刚才你说的再打一遍", ["刚才你说的再打一遍"])
    check("passes previous-reply screen repeat without wake", "把刚才那句回复再显示一下", "把刚才那句回复再显示一下", ["把刚才那句回复再显示一下"])
    check("passes previous-reply retained question without wake", "你刚才回我的那句还在屏幕上吗", "你刚才回我的那句还在屏幕上吗", ["你刚才回我的那句还在屏幕上吗"])
    check("passes quiet previous-reply repeat without wake", "别出声把刚才回复重复一遍", "别出声把刚才回复重复一遍", ["别出声把刚才回复重复一遍"])
    check("passes previous-song story without wake", "刚才那首歌讲啥", "刚才那首歌讲啥", ["刚才那首歌讲啥"])
    check("passes guarded short previous-song story without wake", "刚才那首讲什么别重播", "刚才那首讲什么别重播", ["刚才那首讲什么别重播"])
    check("passes guarded terse previous-song meaning without wake", "刚才那歌什么意思别倒回", "刚才那歌什么意思别倒回", ["刚才那歌什么意思别倒回"])
    check("passes previous-song tell-more without wake", "刚才那首歌能再说说吗", "刚才那首歌能再说说吗", ["刚才那首歌能再说说吗"])
    check("passes previous-song station relation without wake", "刚才那首和上一站有什么关系", "刚才那首和上一站有什么关系", ["刚才那首和上一站有什么关系"])
    check("passes current-song-station-placement without wake", "这首歌为什么排在这站", "这首歌为什么排在这站", ["这首歌为什么排在这站"])
    check("passes current-song-station-selection without wake", "这歌为什么选在这站", "这歌为什么选在这站", ["这歌为什么选在这站"])
    check("passes current-song-city-placement without wake", "这首为什么放在这座城", "这首为什么放在这座城", ["这首为什么放在这座城"])
    check("passes current-song-city-fit-why without wake", "这首为什么配这座城市", "这首为什么配这座城市", ["这首为什么配这座城市"])
    check("passes city-first song relation without wake", "这座城跟歌有什么关系", "这座城跟歌有什么关系", ["这座城跟歌有什么关系"])
    check("passes next-station-song-reason without wake", "下一站为啥播这首", "下一站为啥播这首", ["下一站为啥播这首"])
    check("passes previous-station-song-reason without wake", "上一站那首为啥选它", "上一站那首为啥选它", ["上一站那首为啥选它"])
    check("passes next-song-selected-reason without wake", "下一首为什么选它", "下一首为什么选它", ["下一首为什么选它"])
    check("passes next-song-transition-reason without wake", "下一首为什么接这首", "下一首为什么接这首", ["下一首为什么接这首"])
    check(
        "passes guarded upcoming-song-transition-reason without wake",
        "别跳下一首，只问待会儿那首为什么接这里",
        "别跳下一首，只问待会儿那首为什么接这里",
        ["别跳下一首，只问待会儿那首为什么接这里"],
    )
    check("passes current-city origin without wake", "这站什么来历", "这站什么来历", ["这站什么来历"])
    check("passes current-city route reason without wake", "现在这座城为啥在这条路线里", "现在这座城为啥在这条路线里", ["现在这座城为啥在这条路线里"])
    check("passes current-city order reason without wake", "这座城为什么排到现在", "这座城为什么排到现在", ["这座城为什么排到现在"])
    check("passes current-stop story question without wake", "这站有什么故事", "这站有什么故事", ["这站有什么故事"])
    check("passes no-skip next-stop story question without wake", "下一站有啥故事别切过去", "下一站有啥故事别切过去", ["下一站有啥故事别切过去"])
    check("passes today-playlist-look question without wake", "今天歌单能看一下吗", "今天歌单能看一下吗", ["今天歌单能看一下吗"])
    check("passes today-playlist-glance question without wake", "今天的歌单能给我看一眼吗", "今天的歌单能给我看一眼吗", ["今天的歌单能给我看一眼吗"])
    check("passes casual future-playlist order without wake", "后面歌怎么排", "后面歌怎么排", ["后面歌怎么排"])
    check("passes casual future-playlist arrangement without wake", "后面的歌怎么安排", "后面的歌怎么安排", ["后面的歌怎么安排"])
    check("passes next future-playlist order without wake", "接下来歌怎么排", "接下来歌怎么排", ["接下来歌怎么排"])
    check("passes next song order reason without wake", "下一首为什么这么排", "下一首为什么这么排", ["下一首为什么这么排"])
    check("passes casual future-good-listening without wake", "后面还有哪些好听的", "后面还有哪些好听的", ["后面还有哪些好听的"])
    check("passes casual future-listenable without wake", "后面还有哪些能听的", "后面还有哪些能听的", ["后面还有哪些能听的"])
    check("passes no-skip next-stop-good-listening without wake", "下一站有什么好听的别切过去", "下一站有什么好听的别切过去", ["下一站有什么好听的别切过去"])
    check("passes no-skip next-stop-playlist-content without wake", "下一站歌单里有什么别切过去", "下一站歌单里有什么别切过去", ["下一站歌单里有什么别切过去"])
    check("passes no-play-today-playlist question without wake", "不要播放，只想看今天歌单", "不要播放，只想看今天歌单", ["不要播放，只想看今天歌单"])
    check("passes this-moment broadcast-city question without wake", "这会儿播哪座城", "这会儿播哪座城", ["这会儿播哪座城"])
    check("passes this-moment current-song-number question without wake", "这会儿放哪一首", "这会儿放哪一首", ["这会儿放哪一首"])
    check("passes this-moment ringing-song question without wake", "这会儿响的是哪首", "这会儿响的是哪首", ["这会儿响的是哪首"])
    check("passes current-station-city question without wake", "这一站现在是哪座城", "这一站现在是哪座城", ["这一站现在是哪座城"])
    check("passes current-following-city question without wake", "我们现在跟着哪座城走", "我们现在跟着哪座城走", ["我们现在跟着哪座城走"])
    check("passes no-switch-current-place question without wake", "别换城市，只问现在到哪了", "别换城市，只问现在到哪了", ["别换城市，只问现在到哪了"])
    check("passes this-moment current-broadcast-number question without wake", "这会儿播哪一首", "这会儿播哪一首", ["这会儿播哪一首"])
    check("passes current-song-index question without wake", "现在第几首", "现在第几首", ["现在第几首"])
    check("passes current-song-index current-prefix question without wake", "当前第几首", "当前第几首", ["当前第几首"])
    check("passes current-song-index progress question without wake", "现在播到第几首了", "现在播到第几首了", ["现在播到第几首了"])
    check("passes subjectless current-song-index question without wake", "第几首了", "第几首了", ["第几首了"])
    check("passes subjectless arrived-song-index question without wake", "到第几首了", "到第几首了", ["到第几首了"])
    check("passes subjectless playing-song-index question without wake", "播到第几首了", "播到第几首了", ["播到第几首了"])
    check("passes colloquial song meaning without wake", "这歌讲的是啥", "这歌讲的是啥", ["这歌讲的是啥"])
    check("passes city-first song fit reason without wake", "这座城为什么配这首歌", "这座城为什么配这首歌", ["这座城为什么配这首歌"])
    check("passes upcoming-song city without wake", "下首是哪座城的", "下首是哪座城的", ["下首是哪座城的"])
    check("passes upcoming-song artist without wake", "待会儿那首是谁唱的", "待会儿那首是谁唱的", ["待会儿那首是谁唱的"])
    check("passes route sunset count without wake", "这趟还剩几场日落", "这趟还剩几场日落", ["这趟还剩几场日落"])
    check("passes casual later route places without wake", "后面会去哪几个地方", "后面会去哪几个地方", ["后面会去哪几个地方"])
    check("passes casual later sunset chase without wake", "后面还追哪几场日落", "后面还追哪几场日落", ["后面还追哪几场日落"])
    check("passes temporal later sunset chase without wake", "待会还追哪几个日落", "待会还追哪几个日落", ["待会还追哪几个日落"])
    check("passes casual multi-city landing without wake", "等会儿还会落到哪几座城", "等会儿还会落到哪几座城", ["等会儿还会落到哪几座城"])
    check("passes pronoun later sunset chase without wake", "我们后面还追哪些日落", "我们后面还追哪些日落", ["我们后面还追哪些日落"])
    check("passes route sunset remaining count without wake", "这一路日落还剩哪几场", "这一路日落还剩哪几场", ["这一路日落还剩哪几场"])
    check("passes next segment city without wake", "下一段会落在哪座城", "下一段会落在哪座城", ["下一段会落在哪座城"])
    check("passes later city order without wake", "后面城市顺序给我看一下", "后面城市顺序给我看一下", ["后面城市顺序给我看一下"])
    check("passes later sunset order without wake", "之后的日落顺序是什么", "之后的日落顺序是什么", ["之后的日落顺序是什么"])
    check("passes route line second-half order without wake", "这条线后半段怎么排", "这条线后半段怎么排", ["这条线后半段怎么排"])
    check("passes screen-route no-city-switch without wake", "后面路线给我写屏别换城市", "后面路线给我写屏别换城市", ["后面路线给我写屏别换城市"])
    check("passes screen-route remaining cities without wake", "这趟剩下的城市能打在屏幕上吗", "这趟剩下的城市能打在屏幕上吗", ["这趟剩下的城市能打在屏幕上吗"])
    check("passes route question no-jump-station without wake", "我只是问后面怎么走不要跳站", "我只是问后面怎么走不要跳站", ["我只是问后面怎么走不要跳站"])
    check("passes screen-playlist no-playback without wake", "这站歌单发屏幕就行别播放", "这站歌单发屏幕就行别播放", ["这站歌单发屏幕就行别播放"])
    check("passes previous-action skill used without wake", "上一条用的是哪个skill", "上一条用的是哪个skill", ["上一条用的是哪个skill"])
    check("passes previous-step tool called without wake", "上一步调了哪个工具", "上一步调了哪个工具", ["上一步调了哪个工具"])
    check("passes previous-action failure reason without wake", "上一个动作失败原因是什么", "上一个动作失败原因是什么", ["上一个动作失败原因是什么"])
    check("passes previous-tool hung without wake", "刚才那个工具挂了吗", "刚才那个工具挂了吗", ["刚才那个工具挂了吗"])
    check("passes previous-wrong-tool question without wake", "刚才是不是走错工具了", "刚才是不是走错工具了", ["刚才是不是走错工具了"])
    check("passes previous-action did-what colloquial without wake", "刚刚搞了啥来着", "刚刚搞了啥来着", ["刚刚搞了啥来着"])
    check("passes previous-action what-did-you-do casual without wake", "你刚刚干嘛了", "你刚刚干嘛了", ["你刚刚干嘛了"])
    check("passes previous-action did-what terse without wake", "刚才弄了啥", "刚才弄了啥", ["刚才弄了啥"])
    check("passes previous-call-done question without wake", "刚才那次调用走完了吗", "刚才那次调用走完了吗", ["刚才那次调用走完了吗"])
    check("passes previous-tool-state-writeback question without wake", "上次那个工具有没有回写状态", "上次那个工具有没有回写状态", ["上次那个工具有没有回写状态"])
    check("passes previous-call-complete question without wake", "你刚才调用完了吗", "你刚才调用完了吗", ["你刚才调用完了吗"])
    check("passes previous-round-state-writeback question without wake", "上一轮有没有写回状态", "上一轮有没有写回状态", ["上一轮有没有写回状态"])
    check("passes bare-tool-route question without wake", "这个请求会走哪个工具", "这个请求会走哪个工具", ["这个请求会走哪个工具"])
    check("passes previous-step-status-still-screen question without wake", "刚才那步状态还在屏幕上吗", "刚才那步状态还在屏幕上吗", ["刚才那步状态还在屏幕上吗"])
    check("passes previous-step-result-status-card question without wake", "刚刚那步结果还留在状态卡吗", "刚刚那步结果还留在状态卡吗", ["刚刚那步结果还留在状态卡吗"])
    check("passes previous-action-screen-writeback question without wake", "上一条动作有没有写回屏幕", "上一条动作有没有写回屏幕", ["上一条动作有没有写回屏幕"])
    check("passes previous-command-sent-to-pi question without wake", "刚才那条有没有发到树莓派", "刚才那条有没有发到树莓派", ["刚才那条有没有发到树莓派"])
    check("passes no-execute previous-command sent-to-pi question without wake", "先别执行，只是问上一条有没有发到树莓派", "先别执行，只是问上一条有没有发到树莓派", ["先别执行，只是问上一条有没有发到树莓派"])
    check("passes no-resend previous-command received question without wake", "不要重发，只想知道刚才命令有没有收到", "不要重发，只想知道刚才命令有没有收到", ["不要重发，只想知道刚才命令有没有收到"])
    check("passes pause-continuity question without wake", "暂停后能不能接着刚才那首", "暂停后能不能接着刚才那首", ["暂停后能不能接着刚才那首"])
    check("passes guarded pause-continuity question without wake", "别暂停，只问暂停后能不能继续刚才那首", "别暂停，只问暂停后能不能继续刚才那首", ["别暂停，只问暂停后能不能继续刚才那首"])
    check("passes resume-continuity question without wake", "恢复播放会从刚才那首继续吗", "恢复播放会从刚才那首继续吗", ["恢复播放会从刚才那首继续吗"])
    check("passes continue-routing question without wake", "别执行，只问继续播放会不会乱换城市", "别执行，只问继续播放会不会乱换城市", ["别执行，只问继续播放会不会乱换城市"])
    check("passes previous-request-sent-to-device question without wake", "刚才那个请求有没有下发到设备", "刚才那个请求有没有下发到设备", ["刚才那个请求有没有下发到设备"])
    check("passes previous-command-no-duplicate-pi question without wake", "上一条命令会不会重复发给Pi", "上一条命令会不会重复发给Pi", ["上一条命令会不会重复发给Pi"])
    check("passes previous-action-no-duplicate-dispatch question without wake", "刚才那个动作会不会重复下发", "刚才那个动作会不会重复下发", ["刚才那个动作会不会重复下发"])
    check("passes previous-action-error-still-visible question without wake", "上一次动作的报错还看得到吗", "上一次动作的报错还看得到吗", ["上一次动作的报错还看得到吗"])
    check("passes pre-exec-preparing-writeback question without wake", "执行前会不会先写个准备中", "执行前会不会先写个准备中", ["执行前会不会先写个准备中"])
    check("passes first-write-status-then-execute question without wake", "你会先写状态再执行吗", "你会先写状态再执行吗", ["你会先写状态再执行吗"])
    check("passes terse-prewrite-preparing question without wake", "执行前会写准备中吗", "执行前会写准备中吗", ["执行前会写准备中吗"])
    check("passes terse-postwrite-result question without wake", "执行后会回写结果吗", "执行后会回写结果吗", ["执行后会回写结果吗"])
    check("passes post-exec-success-failure-screen question without wake", "执行后有没有显示成功失败", "执行后有没有显示成功失败", ["执行后有没有显示成功失败"])
    check("passes previous-action done colloquial without wake", "刚才到底干成没", "刚才到底干成没", ["刚才到底干成没"])
    check("passes previous-action that-time done without wake", "刚才那下有没有搞定", "刚才那下有没有搞定", ["刚才那下有没有搞定"])
    check("passes infinite-retry guardrail without wake", "你会不会无限重试技能", "你会不会无限重试技能", ["你会不会无限重试技能"])
    check("passes never-mind-last-sentence without wake", "刚才那句算了", "刚才那句算了", ["刚才那句算了"])
    check("passes do-not-execute-previous without wake", "上一条别执行了", "上一条别执行了", ["上一条别执行了"])
    check("passes retract-previous without wake", "撤销上条", "撤销上条", ["撤销上条"])
    check("passes ignore-previous without wake", "刚才那个别管了", "刚才那个别管了", ["刚才那个别管了"])
    check("passes misspoke without wake", "我说错了", "我说错了", ["我说错了"])
    check("passes previous-sentence-hold misspoke without wake", "上一句别动我说错了", "上一句别动我说错了", ["上一句别动我说错了"])
    check("passes previous-sentence-no-action without wake", "刚刚那句不要跑动作", "刚刚那句不要跑动作", ["刚刚那句不要跑动作"])
    check("passes previous-command-no-run without wake", "别按刚才那条命令跑", "别按刚才那条命令跑", ["别按刚才那条命令跑"])
    check("passes urgent low-battery phrase without wake", "只剩5%了", "只剩5%了", ["只剩5%了"])
    check("passes spoken urgent low-battery phrase without wake", "只剩百分之十了", "只剩百分之十了", ["只剩百分之十了"])
    check("passes phone-percent urgent phrase without wake", "手机5%了", "手机5%了", ["手机5%了"])
    check("passes first-person digit-percent urgent phrase without wake", "我手机就剩5%了", "我手机就剩5%了", ["我手机就剩5%了"])
    check("passes spoken five-percent urgent phrase without wake", "手机只剩百分之五了", "手机只剩百分之五了", ["手机只剩百分之五了"])
    check("passes quiet five-power-points question without wake", "只写屏告诉我手机只剩五个点怎么办", "只写屏告诉我手机只剩五个点怎么办", ["只写屏告诉我手机只剩五个点怎么办"])
    check("passes battery-only spoken five-percent urgent phrase without wake", "电量只剩百分之五", "电量只剩百分之五", ["电量只剩百分之五"])
    check("passes colloquial five-power-points urgent phrase without wake", "只剩五个电了", "只剩五个电了", ["只剩五个电了"])
    check("passes battery-percent urgent phrase without wake", "电量3%了", "电量3%了", ["电量3%了"])
    check("passes bare nearly-empty battery phrase without wake", "快没电了", "快没电了", ["快没电了"])
    check("passes bare immediately-empty battery phrase without wake", "马上没电了", "马上没电了", ["马上没电了"])
    check("passes bare nearly-empty battery question without wake", "快没电了怎么办", "快没电了怎么办", ["快没电了怎么办"])
    check("passes phone-nearly-empty phrase without wake", "手机快没电了", "手机快没电了", ["手机快没电了"])
    check("passes natural phone-nearly-empty phrase without wake", "手机要没电了", "手机要没电了", ["手机要没电了"])
    check("passes first-person phone-cannot-last phrase without wake", "我手机快撑不住了", "我手机快撑不住了", ["我手机快撑不住了"])
    check("passes phone-immediately-empty phrase without wake", "手机马上没电了", "手机马上没电了", ["手机马上没电了"])
    check("passes bare-battery-nearly-empty question without wake", "电快没了怎么办", "电快没了怎么办", ["电快没了怎么办"])
    check("passes quiet drained-battery text question without wake", "电快没了只写字告诉我怎么办", "电快没了只写字告诉我怎么办", ["电快没了只写字告诉我怎么办"])
    check("passes first-person phone-empty phrase without wake", "我手机没电了", "我手机没电了", ["我手机没电了"])
    check("passes battery-draining-out phrase without wake", "电快耗光了", "电快耗光了", ["电快耗光了"])
    check("passes battery-bottoming-out phrase without wake", "电量见底了", "电量见底了", ["电量见底了"])
    check("passes battery-urgent phrase without wake", "电量告急了", "电量告急了", ["电量告急了"])
    check("passes battery-alarm phrase without wake", "电量报警了", "电量报警了", ["电量报警了"])
    check("passes battery-redline phrase without wake", "电量红线了", "电量红线了", ["电量红线了"])
    check("passes first-person low-battery phrase without wake", "我电量不多了", "我电量不多了", ["我电量不多了"])
    check("passes phone-red-battery phrase without wake", "手机红电了", "手机红电了", ["手机红电了"])
    check("passes yellow-battery phrase without wake", "电量黄了", "电量黄了", ["电量黄了"])
    check("passes single-digit-battery phrase without wake", "还有个位数电", "还有个位数电", ["还有个位数电"])
    check("passes bare single-digit-battery phrase without wake", "只剩个位数了", "只剩个位数了", ["只剩个位数了"])
    check("passes low-power-mode phrase without wake", "手机低电模式了", "手机低电模式了", ["手机低电模式了"])
    check("passes phone-battery-failing phrase without wake", "手机电池快不行了", "手机电池快不行了", ["手机电池快不行了"])
    check("passes phone-only-little-power phrase without wake", "手机只剩一点电了", "手机只剩一点电了", ["手机只剩一点电了"])
    check("passes phone-only-percent-runtime question without wake", "手机只有10%还能听多久", "手机只有10%还能听多久", ["手机只有10%还能听多久"])
    check("passes no-play bare-percent-runtime question without wake", "先别播歌，告诉我10%电还能听多久", "先别播歌，告诉我10%电还能听多久", ["先别播歌，告诉我10%电还能听多久"])
    check("passes no-reminder low-battery-stop question without wake", "不要提醒，只问低电量会不会自动停播", "不要提醒，只问低电量会不会自动停播", ["不要提醒，只问低电量会不会自动停播"])
    check("passes low-battery auto-stop bare question without wake", "低电量会不会自动停播", "低电量会不会自动停播", ["低电量会不会自动停播"])
    check("passes low-battery continuous-play question without wake", "我电量低你会不会还一直播放", "我电量低你会不会还一直播放", ["我电量低你会不会还一直播放"])
    check("passes power-save no-surprise-playback without wake", "省电的时候别突然放歌", "省电的时候别突然放歌", ["省电的时候别突然放歌"])
    check("passes nearly-empty-auto-stop question without wake", "快到没电了你会不会自动停播", "快到没电了你会不会自动停播", ["快到没电了你会不会自动停播"])
    check("passes phone-spoken-percent-home question without wake", "手机剩百分之八还能到家吗", "手机剩百分之八还能到家吗", ["手机剩百分之八还能到家吗"])
    check("passes first-person-eight-points-home question without wake", "我手机只剩八个点还能回家吗", "我手机只剩八个点还能回家吗", ["我手机只剩八个点还能回家吗"])
    check("passes bare-eight-percent-runtime question without wake", "就8%电还能听多久", "就8%电还能听多久", ["就8%电还能听多久"])
    check("passes low-battery-no-playback phrase without wake", "快没电了先别播歌", "快没电了先别播歌", ["快没电了先别播歌"])
    check("passes low-battery-screen-only phrase without wake", "快没电了只在屏幕上回我", "快没电了只在屏幕上回我", ["快没电了只在屏幕上回我"])
    check("passes numeric battery save-power phrase without wake", "电量只剩3%怎么省电", "电量只剩3%怎么省电", ["电量只剩3%怎么省电"])
    check("passes low-battery continue-listening question without wake", "手机没电还要继续听吗", "手机没电还要继续听吗", ["手机没电还要继续听吗"])
    check("passes phone-three-percent no-playback phrase without wake", "手机剩3%先别播歌", "手机剩3%先别播歌", ["手机剩3%先别播歌"])
    check("passes first-person-nearly-empty-outdoor question without wake", "我快没电了还能带你出去吗", "我快没电了还能带你出去吗", ["我快没电了还能带你出去吗"])
    check("passes battery-low-save-power question without wake", "电量不多要不要省电", "电量不多要不要省电", ["电量不多要不要省电"])
    check("passes little-phone-power-save phrase without wake", "我手机还有一点电要省着用", "我手机还有一点电要省着用", ["我手机还有一点电要省着用"])
    check("passes cannot-last-home phrase without wake", "撑不到家了", "撑不到家了", ["撑不到家了"])
    check("passes phone-power-cannot-last-home phrase without wake", "手机电撑不到家了", "手机电撑不到家了", ["手机电撑不到家了"])
    check("passes phone-almost-shutdown phrase without wake", "手机马上关机了", "手机马上关机了", ["手机马上关机了"])
    check("passes phone-nearly-off phrase without wake", "快关机了", "快关机了", ["快关机了"])
    check("passes battery-sufficiency question without wake", "手机电还够吗", "手机电还够吗", ["手机电还够吗"])
    check("passes battery-amount question without wake", "手机还有多少电", "手机还有多少电", ["手机还有多少电"])
    check("passes battery-runtime question without wake", "手机还能撑多久", "手机还能撑多久", ["手机还能撑多久"])
    check("passes battery-home-runtime question without wake", "电够撑到家吗", "电够撑到家吗", ["电够撑到家吗"])
    check("passes battery-charging question without wake", "要不要充电", "要不要充电", ["要不要充电"])
    check("passes battery-save-power phrase without wake", "省点电", "省点电", ["省点电"])
    check("passes phone-save-power phrase without wake", "省点手机电", "省点手机电", ["省点手机电"])
    check("passes first-person tiny-battery phrase without wake", "我只有一点点电了", "我只有一点点电了", ["我只有一点点电了"])
    check("passes last-bit phone-battery phrase without wake", "手机剩最后一点电了别突然出声", "手机剩最后一点电了别突然出声", ["手机剩最后一点电了别突然出声"])
    check("passes one-mouth battery-home phrase without wake", "只剩一口电了还能陪我到家吗", "只剩一口电了还能陪我到家吗", ["只剩一口电了还能陪我到家吗"])
    check("passes phone-one-bar-power phrase without wake", "手机还有一格电", "手机还有一格电", ["手机还有一格电"])
    check("passes first-person one-bar-power phrase without wake", "我手机一格电了", "我手机一格电了", ["我手机一格电了"])
    check("passes bare one-bar-power phrase without wake", "只有一格电了", "只有一格电了", ["只有一格电了"])
    check("passes quiet one-bar-save-power question without wake", "别出声，我手机只剩一格电，怎么省", "别出声，我手机只剩一格电，怎么省", ["别出声，我手机只剩一格电，怎么省"])
    check("passes phone-two-bar-power phrase without wake", "手机就剩两格了", "手机就剩两格了", ["手机就剩两格了"])
    check("passes phone-three-bar-outdoor power phrase without wake", "手机只有三格电还能带你出门吗", "手机只有三格电还能带你出门吗", ["手机只有三格电还能带你出门吗"])
    check("passes terse following phrase without wake", "有人跟着", "有人跟着", ["有人跟着"])
    check("passes terse tailing phrase without wake", "有人尾随", "有人尾随", ["有人尾随"])
    check("passes walking-behind phrase without wake", "有人跟我走", "有人跟我走", ["有人跟我走"])
    check("passes behind-following phrase without wake", "后面好像有人跟着", "后面好像有人跟着", ["后面好像有人跟着"])
    check("passes passive followed screen-only phrase without wake", "我在路上感觉被跟着只写屏", "我在路上感觉被跟着只写屏", ["我在路上感觉被跟着只写屏"])
    check("passes terse behind-person phrase without wake", "后面好像有人", "后面好像有人", ["后面好像有人"])
    check("passes uneasy-outside phrase without wake", "我有点不安心", "我有点不安心", ["我有点不安心"])
    check("passes short outdoor fear phrase without wake", "路上有点怕", "路上有点怕", ["路上有点怕"])
    check("passes side-safety unease phrase without wake", "旁边好像不太安全", "旁边好像不太安全", ["旁边好像不太安全"])
    check("passes outside-unsafe phrase without wake", "外面有点不安全", "外面有点不安全", ["外面有点不安全"])
    check("passes route-unsafe phrase without wake", "路上不太安全", "路上不太安全", ["路上不太安全"])
    check("passes route-danger phrase without wake", "路上有点危险", "路上有点危险", ["路上有点危险"])
    check("passes route-uneasy phrase without wake", "路上不太安心", "路上不太安心", ["路上不太安心"])
    check("passes lost-outside phrase without wake", "我有点迷路了", "我有点迷路了", ["我有点迷路了"])
    check("passes short-lost phrase without wake", "我迷路了", "我迷路了", ["我迷路了"])
    check("passes cannot-find-way phrase without wake", "找不到路了", "找不到路了", ["找不到路了"])
    check("passes casual-cannot-find-way phrase without wake", "有点找不到路了", "有点找不到路了", ["有点找不到路了"])
    check("passes dont-know-way-back phrase without wake", "我不知道怎么回去了", "我不知道怎么回去了", ["我不知道怎么回去了"])
    check("passes walk-home-with-me phrase without wake", "陪我回家", "陪我回家", ["陪我回家"])
    check("passes walk-back-with-me phrase without wake", "陪我走回去", "陪我走回去", ["陪我走回去"])
    check("passes safer-way-home question without wake", "怎么回家比较安全", "怎么回家比较安全", ["怎么回家比较安全"])
    check("passes no-taxi nearby-safety question without wake", "别打车，只问附近安全吗", "别打车，只问附近安全吗", ["别打车，只问附近安全吗"])
    check("passes almost-home question without wake", "快到家了吗", "快到家了吗", ["快到家了吗"])
    check("passes home-arrival-eta question without wake", "到家还要多久", "到家还要多久", ["到家还要多久"])
    check("passes inverted-home-arrival-eta question without wake", "还有多久到家", "还有多久到家", ["还有多久到家"])
    check("passes go-back-eta question without wake", "回去还要多久", "回去还要多久", ["回去还要多久"])
    check("passes minute-home-eta question without wake", "还有几分钟到家", "还有几分钟到家", ["还有几分钟到家"])
    check("passes long-time-home-eta question without wake", "还要多长时间到家", "还要多长时间到家", ["还要多长时间到家"])
    check("passes remaining-home-eta question without wake", "还差多久到家", "还差多久到家", ["还差多久到家"])
    check("passes terse-home-duration question without wake", "到家要多久", "到家要多久", ["到家要多久"])
    check("passes can-go-home-duration question without wake", "多久能回家", "多久能回家", ["多久能回家"])
    check("passes home-clock-eta question without wake", "几点能到家", "几点能到家", ["几点能到家"])
    check("passes estimated-home-clock question without wake", "预计几点到家", "预计几点到家", ["预计几点到家"])
    check("passes when-go-back question without wake", "什么时候能回去", "什么时候能回去", ["什么时候能回去"])
    check("passes last-train-catch question without wake", "还赶得上末班车吗", "还赶得上末班车吗", ["还赶得上末班车吗"])
    check("passes late-home-question without wake", "回家还来得及吗", "回家还来得及吗", ["回家还来得及吗"])
    check("passes missing-last-train question without wake", "赶不上末班车怎么办", "赶不上末班车怎么办", ["赶不上末班车怎么办"])
    check("passes taxi-request phrase without wake", "我想打车", "我想打车", ["我想打车"])
    check("passes hail-car phrase without wake", "帮我叫个车", "帮我叫个车", ["帮我叫个车"])
    check("passes hail-car-home phrase without wake", "我想叫车回家", "我想叫车回家", ["我想叫车回家"])
    check("passes no-car-available question without wake", "打不到车怎么办", "打不到车怎么办", ["打不到车怎么办"])
    check("passes nearby-taxi-availability question without wake", "附近好打车吗", "附近好打车吗", ["附近好打车吗"])
    check("passes car-hail-availability question without wake", "能不能叫到车", "能不能叫到车", ["能不能叫到车"])
    check("passes late-taxi-availability question without wake", "现在还能打到车吗", "现在还能打到车吗", ["现在还能打到车吗"])
    check("passes ride-hail unavailable question without wake", "网约车叫不到怎么办", "网约车叫不到怎么办", ["网约车叫不到怎么办"])
    check("passes taxi-location question without wake", "出租车在哪", "出租车在哪", ["出租车在哪"])
    check("passes side-unsafe phrase without wake", "这边不太安全", "这边不太安全", ["这边不太安全"])
    check("passes nearby-unsafe phrase without wake", "这附近不太安全", "这附近不太安全", ["这附近不太安全"])
    check("passes safe-place request without wake", "找个安全的地方", "找个安全的地方", ["找个安全的地方"])
    check("passes walk-me-to-subway-station without wake", "陪我走到地铁站", "陪我走到地铁站", ["陪我走到地铁站"])
    check("passes walk-me-to-subway-entrance without wake", "陪我去地铁口", "陪我去地铁口", ["陪我去地铁口"])
    check("passes take-me-to-subway-station without wake", "带我去地铁站", "带我去地铁站", ["带我去地铁站"])
    check("passes take-me-back-to-subway-station without wake", "带我回地铁站", "带我回地铁站", ["带我回地铁站"])
    check("passes subway-station-directions without wake", "地铁站怎么走", "地铁站怎么走", ["地铁站怎么走"])
    check("passes nearby-subway-station-location without wake", "附近地铁站在哪", "附近地铁站在哪", ["附近地铁站在哪"])
    check("passes no-navigation subway-entrance question without wake", "不要导航，只问地铁口在哪里", "不要导航，只问地铁口在哪里", ["不要导航，只问地铁口在哪里"])
    check("passes no-store nearby-convenience question without wake", "不要找店，只问附近有没有便利店", "不要找店，只问附近有没有便利店", ["不要找店，只问附近有没有便利店"])
    check("passes find-subway-station-short without wake", "找个地铁站", "找个地铁站", ["找个地铁站"])
    check("passes subway-station-location without wake", "地铁站在哪", "地铁站在哪", ["地铁站在哪"])
    check("passes too-late-outside phrase without wake", "外面太晚了", "外面太晚了", ["外面太晚了"])
    check("passes late-night-taxi-home phrase without wake", "夜路有点晚了我要打车回家", "夜路有点晚了我要打车回家", ["夜路有点晚了我要打车回家"])
    check("passes late-outside-go-back phrase without wake", "外面有点晚我想回去", "外面有点晚我想回去", ["外面有点晚我想回去"])
    check("passes too-late-go-home phrase without wake", "天太晚了想回家", "天太晚了想回家", ["天太晚了想回家"])
    check("passes uneasy-night-road phrase without wake", "夜路不太放心", "夜路不太放心", ["夜路不太放心"])
    check("passes dark-road phrase without wake", "路太黑了", "路太黑了", ["路太黑了"])
    check("passes dark-night-road phrase without wake", "夜路太黑了", "夜路太黑了", ["夜路太黑了"])
    check("passes dark-sky-go-home phrase without wake", "天黑了想回家", "天黑了想回家", ["天黑了想回家"])
    check("passes dark-road-taxi phrase without wake", "路上太黑了我想打车", "路上太黑了我想打车", ["路上太黑了我想打车"])
    check("passes brighter-road request without wake", "找条亮一点的路", "找条亮一点的路", ["找条亮一点的路"])
    check("passes brighter-road-help request without wake", "帮我找亮一点的路", "帮我找亮一点的路", ["帮我找亮一点的路"])
    check("passes avoid-alley-home request without wake", "避开小巷回家", "避开小巷回家", ["避开小巷回家"])
    check("passes no-alley request without wake", "别走小巷", "别走小巷", ["别走小巷"])
    check("passes busier-road request without wake", "找人多一点的路", "找人多一点的路", ["找人多一点的路"])
    check("passes busier-place request without wake", "找人多一点的地方", "找人多一点的地方", ["找人多一点的地方"])
    check("passes avoid-dark-lane request without wake", "别带我走太黑的小路", "别带我走太黑的小路", ["别带我走太黑的小路"])
    check("blocks casual alley movie without wake", "小巷电影很好看", "", [])
    check("blocks casual brighter-photo without wake", "亮一点的照片不错", "", [])
    check("blocks casual busier-ad without wake", "人多一点的广告不错", "", [])
    check("keeps taxi-art phrase gated before wake", "出租车艺术展", "", [])
    check("passes bus-stop-location without wake", "公交站在哪", "公交站在哪", ["公交站在哪"])
    check("passes convenience-store-location without wake", "便利店在哪", "便利店在哪", ["便利店在哪"])
    check("passes nearby-pharmacy without wake", "附近有药店吗", "附近有药店吗", ["附近有药店吗"])
    check("passes first-aid bandage location without wake", "哪里可以买创可贴", "哪里可以买创可贴", ["哪里可以买创可贴"])
    check("passes nearby first-aid bandage without wake", "附近能买创可贴吗", "附近能买创可贴吗", ["附近能买创可贴吗"])
    check("passes scraped-skin pharmacy request without wake", "我擦破皮了找个药店", "我擦破皮了找个药店", ["我擦破皮了找个药店"])
    check("passes headache pharmacy request without wake", "我有点头疼想找药店", "我有点头疼想找药店", ["我有点头疼想找药店"])
    check("passes stomachache pharmacy request without wake", "肚子疼附近有药店吗", "肚子疼附近有药店吗", ["肚子疼附近有药店吗"])
    check("passes buy-medicine request without wake", "想买点药", "想买点药", ["想买点药"])
    check("passes pharmacy-medicine request without wake", "找个药店买药", "找个药店买药", ["找个药店买药"])
    check("blocks casual pharmacy ad without wake", "药店广告很多", "", [])
    check("blocks casual bandage design without wake", "创可贴设计很好看", "", [])
    check("blocks casual headache article without wake", "今天头疼文章不错", "", [])
    check("passes restroom-location without wake", "洗手间在哪", "洗手间在哪", ["洗手间在哪"])
    check("passes restroom-no-nav question without wake", "只想问附近有没有厕所别导航", "只想问附近有没有厕所别导航", ["只想问附近有没有厕所别导航"])
    check("passes terse-restroom-no-nav question without wake", "附近有厕所吗别导航", "附近有厕所吗别导航", ["附近有厕所吗别导航"])
    check("passes restroom-as-navigation-boundary without wake", "别把附近厕所当导航", "别把附近厕所当导航", ["别把附近厕所当导航"])
    check("passes direct-navigation-policy question without wake", "我说去地铁站你会直接导航吗", "我说去地铁站你会直接导航吗", ["我说去地铁站你会直接导航吗"])
    check("passes outdoor-restroom-need without wake", "出门路上想上厕所怎么办", "出门路上想上厕所怎么办", ["出门路上想上厕所怎么办"])
    check("passes rain-shelter without wake", "找个地方躲雨", "找个地方躲雨", ["找个地方躲雨"])
    check("passes raining-find-shelter without wake", "下雨了找个地方躲一下", "下雨了找个地方躲一下", ["下雨了找个地方躲一下"])
    check("passes raining-what-now without wake", "外面下雨了怎么办", "外面下雨了怎么办", ["外面下雨了怎么办"])
    check("passes no-umbrella without wake", "我没带伞", "我没带伞", ["我没带伞"])
    check("passes buy-umbrella without wake", "哪里可以买伞", "哪里可以买伞", ["哪里可以买伞"])
    check("passes heavy-rain-indoor without wake", "雨太大先找个室内", "雨太大先找个室内", ["雨太大先找个室内"])
    check("passes thirsty phrase without wake", "我有点口渴", "我有点口渴", ["我有点口渴"])
    check("passes thirsty-short phrase without wake", "我渴了", "我渴了", ["我渴了"])
    check("passes buy-water phrase without wake", "想买瓶水", "想买瓶水", ["想买瓶水"])
    check("passes water-location phrase without wake", "哪里可以买水", "哪里可以买水", ["哪里可以买水"])
    check("passes nearby-water phrase without wake", "附近有水买吗", "附近有水买吗", ["附近有水买吗"])
    check("passes hot-indoor-rest phrase without wake", "太热了找个室内歇一下", "太热了找个室内歇一下", ["太热了找个室内歇一下"])
    check("passes heat-what-now phrase without wake", "外面太热了怎么办", "外面太热了怎么办", ["外面太热了怎么办"])
    check("passes heatstroke phrase without wake", "我好像中暑了", "我好像中暑了", ["我好像中暑了"])
    check("passes hydrate-place phrase without wake", "找个地方补水", "找个地方补水", ["找个地方补水"])
    check("passes cold phrase without wake", "我有点冷", "我有点冷", ["我有点冷"])
    check("passes cold-what-now phrase without wake", "外面太冷了怎么办", "外面太冷了怎么办", ["外面太冷了怎么办"])
    check("passes cold-indoor-rest phrase without wake", "太冷了找个室内歇一下", "太冷了找个室内歇一下", ["太冷了找个室内歇一下"])
    check("passes warm-place phrase without wake", "找个暖和地方", "找个暖和地方", ["找个暖和地方"])
    check("passes hot-drink-location phrase without wake", "哪里可以买热饮", "哪里可以买热饮", ["哪里可以买热饮"])
    check("passes nearby-hot-drink phrase without wake", "附近有热饮买吗", "附近有热饮买吗", ["附近有热饮买吗"])
    check("passes hot-water phrase without wake", "想买杯热水", "想买杯热水", ["想买杯热水"])
    check("passes windy-what-now phrase without wake", "风太大了怎么办", "风太大了怎么办", ["风太大了怎么办"])
    check("passes windy-shelter phrase without wake", "外面风好大找个避风地方", "外面风好大找个避风地方", ["外面风好大找个避风地方"])
    check("passes windbreak-place phrase without wake", "找个避风的地方", "找个避风的地方", ["找个避风的地方"])
    check("passes windy-indoor phrase without wake", "风大想找室内", "风大想找室内", ["风大想找室内"])
    check("passes no-wind-place phrase without wake", "找个没风的地方", "找个没风的地方", ["找个没风的地方"])
    check("passes charge-spot without wake", "找个地方充电", "找个地方充电", ["找个地方充电"])
    check("passes casual charge-spot without wake", "找个地方充会电", "找个地方充会电", ["找个地方充会电"])
    check("passes charge-anywhere without wake", "哪里能充电", "哪里能充电", ["哪里能充电"])
    check("passes quiet charge-anywhere without wake", "这附近哪里能充电只显示", "这附近哪里能充电只显示", ["这附近哪里能充电只显示"])
    check("passes quiet powerbank request without wake", "哪里能借充电宝别念出来", "哪里能借充电宝别念出来", ["哪里能借充电宝别念出来"])
    check("passes nearby shared powerbank without wake", "附近有共享充电宝吗", "附近有共享充电宝吗", ["附近有共享充电宝吗"])
    check("passes borrow powerbank without wake", "我想借个充电宝", "我想借个充电宝", ["我想借个充电宝"])
    check("passes urgent-restroom without wake", "尿急了", "尿急了", ["尿急了"])
    check("passes sit-down-request without wake", "我想坐一下", "我想坐一下", ["我想坐一下"])
    check("passes tired-sit-request without wake", "有点累想坐一下", "有点累想坐一下", ["有点累想坐一下"])
    check("passes walking-tired-rest without wake", "走累了想歇一下", "走累了想歇一下", ["走累了想歇一下"])
    check("passes quiet sit-awhile request without wake", "我想找个地方坐会儿只写屏", "我想找个地方坐会儿只写屏", ["我想找个地方坐会儿只写屏"])
    check("passes direct no-audio-recording privacy phrase without wake", "别录音", "别录音", ["别录音"])
    check("passes terse no-cloud-upload privacy phrase without wake", "别传云端", "别传云端", ["别传云端"])
    check("passes no-this-sentence-upload privacy phrase without wake", "这句不要上传", "这句不要上传", ["这句不要上传"])
    check("passes no-location-memory privacy phrase without wake", "别记住我的位置", "别记住我的位置", ["别记住我的位置"])
    check("passes no-identity-memory privacy phrase without wake", "别记住我是谁", "别记住我是谁", ["别记住我是谁"])
    check("passes no-name-memory privacy phrase without wake", "不要记住我的名字", "不要记住我的名字", ["不要记住我的名字"])
    check("passes identity-retention privacy question without wake", "你会记住我的名字吗", "你会记住我的名字吗", ["你会记住我的名字吗"])
    check("passes no-identity-save privacy phrase without wake", "不要保存我的身份", "不要保存我的身份", ["不要保存我的身份"])
    check("passes no-companion-memory privacy phrase without wake", "别记住我和谁在一起", "别记住我和谁在一起", ["别记住我和谁在一起"])
    check("passes walking-companion-memory question without wake", "你会记住我和谁一起走吗", "你会记住我和谁一起走吗", ["你会记住我和谁一起走吗"])
    check("passes coworker-company memory privacy question without wake", "我跟同事同行这件事会保存吗", "我跟同事同行这件事会保存吗", ["我跟同事同行这件事会保存吗"])
    check("passes no-destination-memory privacy phrase without wake", "别把我刚才去哪儿存下来", "别把我刚才去哪儿存下来", ["别把我刚才去哪儿存下来"])
    check("passes reversed-destination-memory privacy phrase without wake", "刚才说的目的地别记了", "刚才说的目的地别记了", ["刚才说的目的地别记了"])
    check("passes destination-retention privacy question without wake", "会不会保存我的目的地", "会不会保存我的目的地", ["会不会保存我的目的地"])
    check("passes destination-cloud privacy question without wake", "目的地会不会传云端", "目的地会不会传云端", ["目的地会不会传云端"])
    check("passes today-destination-retention privacy question without wake", "我今天去哪儿会不会被记住", "我今天去哪儿会不会被记住", ["我今天去哪儿会不会被记住"])
    check("passes no-today-place-retention privacy phrase without wake", "我不想被记住今天去哪儿", "我不想被记住今天去哪儿", ["我不想被记住今天去哪儿"])
    check("passes no-today-place-memory privacy phrase without wake", "不要记住我今天去哪", "不要记住我今天去哪", ["不要记住我今天去哪"])
    check("passes companion-record privacy phrase without wake", "我跟朋友同路这件事不要记录", "我跟朋友同路这件事不要记录", ["我跟朋友同路这件事不要记录"])
    check("passes no-companion-bare-save privacy phrase without wake", "我和朋友在一起这件事别存", "我和朋友在一起这件事别存", ["我和朋友在一起这件事别存"])
    check("passes no-companion-short-memory privacy phrase without wake", "别记我跟谁在一起", "别记我跟谁在一起", ["别记我跟谁在一起"])
    check("passes no-location-upload privacy phrase without wake", "不要上传我的定位", "不要上传我的定位", ["不要上传我的定位"])
    check("passes no-chat-log privacy phrase without wake", "别留聊天记录", "别留聊天记录", ["别留聊天记录"])
    check("passes no-debug-log privacy phrase without wake", "这段别写进日志", "这段别写进日志", ["这段别写进日志"])
    check("passes no-current-sentence-log phrase without wake", "这一句别放进日志", "这一句别放进日志", ["这一句别放进日志"])
    check("passes no-route-debug-log privacy phrase without wake", "不要把我的路线写进日志", "不要把我的路线写进日志", ["不要把我的路线写进日志"])
    check("passes no-destination-debug-log privacy phrase without wake", "别把我去哪儿写进日志", "别把我去哪儿写进日志", ["别把我去哪儿写进日志"])
    check("passes outdoor no-location-log privacy phrase without wake", "出门了不要把定位写日志", "出门了不要把定位写日志", ["出门了不要把定位写日志"])
    check("passes destination-debug-log question without wake", "会不会把目的地写进日志", "会不会把目的地写进日志", ["会不会把目的地写进日志"])
    check("passes previous-segment-no-archive privacy phrase without wake", "刚刚那段别存档", "刚刚那段别存档", ["刚刚那段别存档"])
    check("passes reverse-previous-speech-no-archive privacy phrase without wake", "别留档我刚才说的", "别留档我刚才说的", ["别留档我刚才说的"])
    check("passes error-log-location privacy question without wake", "错误日志会不会有我的位置", "错误日志会不会有我的位置", ["错误日志会不会有我的位置"])
    check("passes recording-active privacy question without wake", "你在录吗", "你在录吗", ["你在录吗"])
    check("passes recent-recording privacy question without wake", "刚才有录音吗", "刚才有录音吗", ["刚才有录音吗"])
    check("passes mic-still-open privacy question without wake", "现在麦还开着吗", "现在麦还开着吗", ["现在麦还开着吗"])
    check("passes terse open-mic privacy question without wake", "开麦了吗", "开麦了吗", ["开麦了吗"])
    check("passes terse close-mic privacy question without wake", "关麦了吗", "关麦了吗", ["关麦了吗"])
    check("passes lens-off privacy question without wake", "镜头关了吗", "镜头关了吗", ["镜头关了吗"])
    check("blocks non-device 麦 phrase without wake", "麦当劳开了吗", "", [])
    check("passes camera-open privacy question without wake", "有没有打开相机", "有没有打开相机", ["有没有打开相机"])
    check("passes speech-retention privacy question without wake", "我说的话会保存吗", "我说的话会保存吗", ["我说的话会保存吗"])
    check("passes cloud-upload-speech privacy question without wake", "会不会把我说的话传到云端", "会不会把我说的话传到云端", ["会不会把我说的话传到云端"])
    check("passes no-voice-storage privacy phrase without wake", "别把我的声音存起来", "别把我的声音存起来", ["别把我的声音存起来"])
    check("passes always-listening privacy question without wake", "你是不是一直在听", "你是不是一直在听", ["你是不是一直在听"])
    check("passes always-on-mic privacy question without wake", "麦克风是不是一直开着", "麦克风是不是一直开着", ["麦克风是不是一直开着"])
    check("passes chat-log-storage privacy question without wake", "会不会存聊天记录", "会不会存聊天记录", ["会不会存聊天记录"])
    check("passes face-recognition privacy question without wake", "会识别人脸吗", "会识别人脸吗", ["会识别人脸吗"])
    check("passes photo-delete privacy question without wake", "拍完会删吗", "拍完会删吗", ["拍完会删吗"])
    check("passes no-training privacy phrase without wake", "别拿我的话训练模型", "别拿我的话训练模型", ["别拿我的话训练模型"])
    check("passes these-words-training privacy question without wake", "我说的这些会不会被拿去训练", "我说的这些会不会被拿去训练", ["我说的这些会不会被拿去训练"])
    check("passes no-identity-recognition privacy phrase without wake", "不要识别我是谁", "不要识别我是谁", ["不要识别我是谁"])
    check("passes no-photo privacy phrase without wake", "别拍我", "别拍我", ["别拍我"])
    check("passes no-video privacy phrase without wake", "别录像", "别录像", ["别录像"])
    check("passes privacy status phrase without wake", "隐私状态", "隐私状态", ["隐私状态"])
    check("passes eavesdrop privacy question without wake", "你会偷听吗", "你会偷听吗", ["你会偷听吗"])
    check("passes microphone-off privacy question without wake", "麦克风关了吗", "麦克风关了吗", ["麦克风关了吗"])
    check("passes camera-off privacy question without wake", "摄像头关着吗", "摄像头关着吗", ["摄像头关着吗"])
    check("passes voice-upload privacy question without wake", "语音会上传吗", "语音会上传吗", ["语音会上传吗"])
    check("passes route-retention privacy question without wake", "会保存我的路线吗", "会保存我的路线吗", ["会保存我的路线吗"])
    check("passes camera-consent-no-open phrase without wake", "没经过我同意别开摄像头", "没经过我同意别开摄像头", ["没经过我同意别开摄像头"])
    check("passes no-button-no-photo phrase without wake", "没有我按按钮别拍照", "没有我按按钮别拍照", ["没有我按按钮别拍照"])
    check("passes no-button-camera-auto question without wake", "没按按钮你会不会自己开摄像头", "没按按钮你会不会自己开摄像头", ["没按按钮你会不会自己开摄像头"])
    check("passes no-orange-key-frame question without wake", "没按橙键会不会自己拍一帧", "没按橙键会不会自己拍一帧", ["没按橙键会不会自己拍一帧"])
    check("passes no-consent-lens phrase without wake", "没有我同意别开镜头", "没有我同意别开镜头", ["没有我同意别开镜头"])
    check("passes no-photo privacy-rule question without wake", "不要拍照，只想知道相机隐私规则", "不要拍照，只想知道相机隐私规则", ["不要拍照，只想知道相机隐私规则"])
    check("passes no-auto-environment-photo phrase without wake", "别自动拍环境", "别自动拍环境", ["别自动拍环境"])
    check("passes ambient-secret-photo question without wake", "环境扫描会不会偷偷拍", "环境扫描会不会偷偷拍", ["环境扫描会不会偷偷拍"])
    check("passes ambient-photo-cloud question without wake", "环境照片会不会上传云端", "环境照片会不会上传云端", ["环境照片会不会上传云端"])
    check("passes camera-frame-retention question without wake", "相机看到的画面会不会留底", "相机看到的画面会不会留底", ["相机看到的画面会不会留底"])
    check("passes ambient-photo-training question without wake", "环境照片会不会拿去训练", "环境照片会不会拿去训练", ["环境照片会不会拿去训练"])
    check("passes ambient-ask-before-scan question without wake", "扫环境前会不会先问我", "扫环境前会不会先问我", ["扫环境前会不会先问我"])
    check("passes ambient-manual-trigger-only phrase without wake", "只在我手动触发时看一下", "只在我手动触发时看一下", ["只在我手动触发时看一下"])
    check("passes manual-glance-only phrase without wake", "只允许我手动触发看一眼可以吗", "只允许我手动触发看一眼可以吗", ["只允许我手动触发看一眼可以吗"])
    check("passes camera-manual-only phrase without wake", "相机只允许手动开一下", "相机只允许手动开一下", ["相机只允许手动开一下"])
    check("passes no-photo-storage phrase without wake", "看到什么别存照片", "看到什么别存照片", ["看到什么别存照片"])
    check("passes no-ambient-photo-cloud phrase without wake", "别把环境照片上传云端", "别把环境照片上传云端", ["别把环境照片上传云端"])
    check("passes ambient-image-delete question without wake", "拍完环境图片会删掉吗", "拍完环境图片会删掉吗", ["拍完环境图片会删掉吗"])
    check("passes bystander-expression-autoplay question without wake", "会不会根据旁边人的表情自动换歌", "会不会根据旁边人的表情自动换歌", ["会不会根据旁边人的表情自动换歌"])
    check("passes ambient-scan continuous-capture question without wake", "环境扫描会一直拍吗", "环境扫描会一直拍吗", ["环境扫描会一直拍吗"])
    check("passes ambient-auto-scan question without wake", "会自动扫描周围吗", "会自动扫描周围吗", ["会自动扫描周围吗"])
    check("passes ambient-auto-tuning question without wake", "环境会自动调音吗", "环境会自动调音吗", ["环境会自动调音吗"])
    check("passes scan-frame-photo-retention question without wake", "扫描此刻会保存照片吗", "扫描此刻会保存照片吗", ["扫描此刻会保存照片吗"])
    check("passes expression-recognition privacy question without wake", "会不会识别我的表情", "会不会识别我的表情", ["会不会识别我的表情"])
    check("passes ambient plate privacy question without wake", "环境扫描会不会识别车牌", "环境扫描会不会识别车牌", ["环境扫描会不会识别车牌"])
    check("passes camera screen-text privacy question without wake", "相机会不会读我屏幕上的文字", "相机会不会读我屏幕上的文字", ["相机会不会读我屏幕上的文字"])
    check("passes id-number scan privacy question without wake", "扫描此刻会不会看身份证号", "扫描此刻会不会看身份证号", ["扫描此刻会不会看身份证号"])
    check("passes qr-code recognition privacy question without wake", "会不会识别二维码", "会不会识别二维码", ["会不会识别二维码"])
    check("passes doorplate memory privacy question without wake", "会不会记住门牌号", "会不会记住门牌号", ["会不会记住门牌号"])
    check("passes plate storage privacy question without wake", "拍到别人的车牌会保存吗", "拍到别人的车牌会保存吗", ["拍到别人的车牌会保存吗"])
    check("passes screen-text cloud privacy question without wake", "会不会把屏幕文字传到云端", "会不会把屏幕文字传到云端", ["会不会把屏幕文字传到云端"])
    check("passes no-qr-recognition privacy phrase without wake", "不要识别二维码", "不要识别二维码", ["不要识别二维码"])
    check("passes no-id-number-read privacy phrase without wake", "别看身份证号", "别看身份证号", ["别看身份证号"])
    check("passes no-doorplate-memory privacy phrase without wake", "别记门牌号", "别记门牌号", ["别记门牌号"])
    check("passes no-plate-storage privacy phrase without wake", "别保存车牌", "别保存车牌", ["别保存车牌"])
    check("passes no-screen-text-read privacy phrase without wake", "别读屏幕文字", "别读屏幕文字", ["别读屏幕文字"])
    check("blocks qr exhibition chatter without wake", "二维码展览很好看", "", [])
    check("blocks plate design chatter without wake", "车牌设计不错", "", [])
    check("blocks doorplate numerology chatter without wake", "门牌号码学很有趣", "", [])
    check("passes ambient-memory-location question without wake", "环境记忆会记住我在哪吗", "环境记忆会记住我在哪吗", ["环境记忆会记住我在哪吗"])
    check("passes preference-memory privacy phrase without wake", "别记我的偏好", "别记我的偏好", ["别记我的偏好"])
    check("passes music-preference-memory privacy phrase without wake", "别记我喜欢什么歌", "别记我喜欢什么歌", ["别记我喜欢什么歌"])
    check("passes preference-retention question without wake", "会保存我的偏好吗", "会保存我的偏好吗", ["会保存我的偏好吗"])
    check("passes next-time-music-preference question without wake", "下次还会记得我喜欢什么歌吗", "下次还会记得我喜欢什么歌吗", ["下次还会记得我喜欢什么歌吗"])
    check("passes skill-list question without wake", "你支持什么技能", "你支持什么技能", ["你支持什么技能"])
    check("passes tool-list question without wake", "你有哪些工具", "你有哪些工具", ["你有哪些工具"])
    check("passes action-capabilities question without wake", "你有哪些动作能力", "你有哪些动作能力", ["你有哪些动作能力"])
    check(
        "passes no-call status-capability question without wake",
        "别调用技能，只问你能不能查状态",
        "别调用技能，只问你能不能查状态",
        ["别调用技能，只问你能不能查状态"],
    )
    check("passes help-me capability question without wake", "你可以帮我做什么", "你可以帮我做什么", ["你可以帮我做什么"])
    check("passes casual what-can-you-do question without wake", "你会干啥", "你会干啥", ["你会干啥"])
    check("passes casual what-do-you-do question without wake", "你会做啥", "你会做啥", ["你会做啥"])
    check("passes natural-language-understanding question without wake", "你能听懂自然语言吗", "你能听懂自然语言吗", ["你能听懂自然语言吗"])
    check("passes no-keyword-understanding question without wake", "不用关键词你能懂吗", "不用关键词你能懂吗", ["不用关键词你能懂吗"])
    check("passes casual-human-language question without wake", "我说人话你能懂吗", "我说人话你能懂吗", ["我说人话你能懂吗"])
    check("passes context-retention question without wake", "上下文会保留多久", "上下文会保留多久", ["上下文会保留多久"])
    check("passes recent-speech-memory question without wake", "你会记住刚才我说的话吗", "你会记住刚才我说的话吗", ["你会记住刚才我说的话吗"])
    check("passes previous-context question without wake", "刚才的上下文还在吗", "刚才的上下文还在吗", ["刚才的上下文还在吗"])
    check("passes casual-previous-context question without wake", "刚才上下文还在吗", "刚才上下文还在吗", ["刚才上下文还在吗"])
    check("passes previous-chat-context question without wake", "上一句我们聊到哪了", "上一句我们聊到哪了", ["上一句我们聊到哪了"])
    check("passes previous-sentence-still-there question without wake", "刚才我说的那句还在吗", "刚才我说的那句还在吗", ["刚才我说的那句还在吗"])
    check("passes previous-sentence-context question without wake", "上一句还在上下文里吗", "上一句还在上下文里吗", ["上一句还在上下文里吗"])
    check("passes continue-recent-sentence question without wake", "你能接着刚才那句话聊吗", "你能接着刚才那句话聊吗", ["你能接着刚才那句话聊吗"])
    check("passes casual-current-round-mood-memory question without wake", "这轮你会记住我刚才说的心情吗", "这轮你会记住我刚才说的心情吗", ["这轮你会记住我刚才说的心情吗"])
    check("passes current-conversation-only question without wake", "这次只记当前对话可以吗", "这次只记当前对话可以吗", ["这次只记当前对话可以吗"])
    check("passes current-dialog-no-cloud-memory guard without wake", "这次只记当前对话别同步云端", "这次只记当前对话别同步云端", ["这次只记当前对话别同步云端"])
    check("passes current-round-use-only memory guard without wake", "刚才说想听慢歌只在本轮用一下", "刚才说想听慢歌只在本轮用一下", ["刚才说想听慢歌只在本轮用一下"])
    check("passes current-round-keep-only memory guard without wake", "我说想听安静一点这事只留这轮", "我说想听安静一点这事只留这轮", ["我说想听安静一点这事只留这轮"])
    check("passes temporary-listen-memory phrase without wake", "临时记一下我现在想听慢一点", "临时记一下我现在想听慢一点", ["临时记一下我现在想听慢一点"])
    check("passes tonight-playlist-memory phrase without wake", "刚说的歌单口味只留到今晚", "刚说的歌单口味只留到今晚", ["刚说的歌单口味只留到今晚"])
    check("passes tonight-mood-forget-memory phrase without wake", "这段心情过了今晚就忘掉", "这段心情过了今晚就忘掉", ["这段心情过了今晚就忘掉"])
    check("passes current-round-now-preference-memory phrase without wake", "这轮只记我现在想听慢歌", "这轮只记我现在想听慢歌", ["这轮只记我现在想听慢歌"])
    check("passes current-round-tonight-preference-memory phrase without wake", "这次只记我今晚想听安静歌", "这次只记我今晚想听安静歌", ["这次只记我今晚想听安静歌"])
    check("passes tonight-after-forget-preference phrase without wake", "今晚过后别记得我喜欢这种歌", "今晚过后别记得我喜欢这种歌", ["今晚过后别记得我喜欢这种歌"])
    check("passes just-said-mood-tonight-memory phrase without wake", "刚说的心情只留到今晚", "刚说的心情只留到今晚", ["刚说的心情只留到今晚"])
    check("passes current-mood-no-long-term-memory phrase without wake", "我现在心情不好这事别长期记", "我现在心情不好这事别长期记", ["我现在心情不好这事别长期记"])
    check("passes tomorrow-forget-preference memory guard without wake", "明天别记得我喜欢海边日落", "明天别记得我喜欢海边日落", ["明天别记得我喜欢海边日落"])
    check("passes today-preference-tomorrow-forget memory guard without wake", "今天喜欢爵士这事明天别记得", "今天喜欢爵士这事明天别记得", ["今天喜欢爵士这事明天别记得"])
    check("passes tomorrow-boundary-memory phrase without wake", "这事别带到明天", "这事别带到明天", ["这事别带到明天"])
    check("passes utterance-next-time-memory phrase without wake", "这句话别带到下次", "这句话别带到下次", ["这句话别带到下次"])
    check("passes message-current-round-memory phrase without wake", "这条消息只留在本轮", "这条消息只留在本轮", ["这条消息只留在本轮"])
    check("passes message-current-round-plain-memory phrase without wake", "这条消息只留本轮可以吗", "这条消息只留本轮可以吗", ["这条消息只留本轮可以吗"])
    check("passes utterance-future-memory phrase without wake", "这段话不要带到以后", "这段话不要带到以后", ["这段话不要带到以后"])
    check("passes no-long-term-music-preference question without wake", "别把我的音乐偏好长期保存", "别把我的音乐偏好长期保存", ["别把我的音乐偏好长期保存"])
    check("passes current-round-context-loss question without wake", "这一轮上下文会不会丢", "这一轮上下文会不会丢", ["这一轮上下文会不会丢"])
    check("passes just-said-memory question without wake", "你记不记得刚刚我说的", "你记不记得刚刚我说的", ["你记不记得刚刚我说的"])
    check("passes current-round-memory question without wake", "这一轮会记住什么", "这一轮会记住什么", ["这一轮会记住什么"])
    check("passes preference-memory question without wake", "你会记住我喜欢爵士吗", "你会记住我喜欢爵士吗", ["你会记住我喜欢爵士吗"])
    check("passes just-said-preference-memory question without wake", "我刚说喜欢不吵的歌你还记得吗", "我刚说喜欢不吵的歌你还记得吗", ["我刚说喜欢不吵的歌你还记得吗"])
    check("passes preference-continue-memory question without wake", "刚才我说喜欢不吵的歌你会接着吗", "刚才我说喜欢不吵的歌你会接着吗", ["刚才我说喜欢不吵的歌你会接着吗"])
    check("passes preference-long-term-memory guard without wake", "别把我刚才说喜欢爵士写进长期记忆", "别把我刚才说喜欢爵士写进长期记忆", ["别把我刚才说喜欢爵士写进长期记忆"])
    check("passes preference-next-time-memory guard without wake", "刚才说的音乐偏好别带到下次", "刚才说的音乐偏好别带到下次", ["刚才说的音乐偏好别带到下次"])
    check("passes preference-next-round-phrase guard without wake", "我刚说想听慢一点这事别带到下一轮", "我刚说想听慢一点这事别带到下一轮", ["我刚说想听慢一点这事别带到下一轮"])
    check("passes preference-training question without wake", "我刚才说的歌单偏好会不会被训练", "我刚才说的歌单偏好会不会被训练", ["我刚才说的歌单偏好会不会被训练"])
    check("passes mood-long-term-memory question without wake", "我刚才心情不好这事会存起来吗", "我刚才心情不好这事会存起来吗", ["我刚才心情不好这事会存起来吗"])
    check("passes future-no-preference-memory guard without wake", "下次不要记得我喜欢这类歌", "下次不要记得我喜欢这类歌", ["下次不要记得我喜欢这类歌"])
    check("passes current-dialog-preference-memory phrase without wake", "只在当前对话里记住我想听慢一点", "只在当前对话里记住我想听慢一点", ["只在当前对话里记住我想听慢一点"])
    check("passes current-dialog-plain-memory phrase without wake", "当前对话记一下我想听慢的可以吗", "当前对话记一下我想听慢的可以吗", ["当前对话记一下我想听慢的可以吗"])
    check("passes music-preference-saved question without wake", "我的音乐偏好会保存吗", "我的音乐偏好会保存吗", ["我的音乐偏好会保存吗"])
    check("passes music-preference-device-storage question without wake", "我的音乐口味会不会存在设备里", "我的音乐口味会不会存在设备里", ["我的音乐口味会不会存在设备里"])
    check("passes just-said-want-quiet-song memory question without wake", "我刚说想听安静的歌你会记得吗", "我刚说播放安静的歌你会记得吗", ["我刚说播放安静的歌你会记得吗"])
    check("passes liked-quiet-song retention question without wake", "我喜欢不吵的歌这件事会保存吗", "我喜欢不吵的歌这件事会保存吗", ["我喜欢不吵的歌这件事会保存吗"])
    check("passes liked-quiet-song-store question without wake", "我喜欢安静的歌这件事会不会存起来", "我喜欢安静的歌这件事会不会存起来", ["我喜欢安静的歌这件事会不会存起来"])
    check("passes persistent-song-memory question without wake", "你会一直记着我喜欢的歌吗", "你会一直记着我喜欢的歌吗", ["你会一直记着我喜欢的歌吗"])
    check("passes future-song-memory question without wake", "下次还记得我爱听海边的歌吗", "下次还记得我爱播放海边的歌吗", ["下次还记得我爱播放海边的歌吗"])
    check("passes continue-last-sentence question without wake", "你能接着上一句聊吗", "你能接着上一句聊吗", ["你能接着上一句聊吗"])
    check("passes direct action-list question without wake", "你会哪些操作", "你会哪些操作", ["你会哪些操作"])
    check("passes casual current-tools question without wake", "你现在能调用啥", "你现在能调用啥", ["你现在能调用啥"])
    check("passes casual usable-skills question without wake", "能用什么技能", "能用什么技能", ["能用什么技能"])
    check("passes terse capability-list without wake", "能力列表", "能力列表", ["能力列表"])
    check("passes terse tool-list without wake", "工具列表", "工具列表", ["工具列表"])
    check("passes terse action-list without wake", "动作列表", "动作列表", ["动作列表"])
    check("passes executable-actions question without wake", "你能执行哪些动作", "你能执行哪些动作", ["你能执行哪些动作"])
    check("passes human-language capability question without wake", "听懂人话吗", "听懂人话吗", ["听懂人话吗"])
    check("passes phone local-control boundary without wake", "手机能控制电台吗", "手机能控制电台吗", ["手机能控制电台吗"])
    check("passes phone webpage status local-control without wake", "手机网页能看电台状态吗", "手机网页能看电台状态吗", ["手机网页能看电台状态吗"])
    check("passes local API public-playback boundary without wake", "本地控制 API 会不会外网直接播放", "本地控制 API 会不会外网直接播放", ["本地控制 API 会不会外网直接播放"])
    check("passes api status availability without wake", "/api/status 能用吗", "/api/status 能用吗", ["/api/status 能用吗"])
    check("passes LAN control safety question without wake", "局域网控制接口安全吗", "局域网控制接口安全吗", ["局域网控制接口安全吗"])
    check("passes phone panel no-random-play question without wake", "手机控制面板会不会乱播", "手机控制面板会不会乱播", ["手机控制面板会不会乱播"])
    check("passes phone web current-song question without wake", "手机网页能看现在第几首吗", "手机网页能看现在第几首吗", ["手机网页能看现在第几首吗"])
    check("passes local panel no-random-press question without wake", "控制面板会不会被外面的人乱按", "控制面板会不会被外面的人乱按", ["控制面板会不会被外面的人乱按"])
    check("passes public-local-control-open question without wake", "外网能直接打开本地控制吗", "外网能直接打开本地控制吗", ["外网能直接打开本地控制吗"])
    check("passes bare-api-playback-status question without wake", "api能看到播放状态吗", "api能看到播放状态吗", ["api能看到播放状态吗"])
    check("passes local-interface-password-boundary without wake", "本地接口会不会泄露热点密码", "本地接口会不会泄露热点密码", ["本地接口会不会泄露热点密码"])
    check("passes lan-panel-pause-boundary without wake", "局域网面板能暂停电台吗", "局域网面板能暂停电台吗", ["局域网面板能暂停电台吗"])
    check("passes wake-word guide question without wake", "怎么叫醒你", "怎么叫醒你", ["怎么叫醒你"])
    check("passes wake-name guide question without wake", "喊你什么能唤醒", "喊你什么能唤醒", ["喊你什么能唤醒"])
    check("passes wake-nickname guide question without wake", "小福能不能唤醒你", "小福能不能唤醒你", ["小福能不能唤醒你"])
    check("passes casual wake-nickname question without wake", "我喊小福可以吗", "我喊小福可以吗", ["我喊小福可以吗"])
    check("passes wakeword-no-response-help without wake", "弗洛斯特没反应怎么办", "弗洛斯特没反应怎么办", ["弗洛斯特没反应怎么办"])
    check("passes ordinary-chat-pi-tts policy without wake", "普通聊天会不会走pi-tts", "普通聊天会不会走pi-tts", ["普通聊天会不会走pi-tts"])
    check("passes ordinary-chat-spaced-pi-tts policy without wake", "普通聊天会不会走 pi tts", "普通聊天会不会走 pi tts", ["普通聊天会不会走 pi tts"])
    check("passes Frost ordinary-chat no-pi-tts policy without wake", "Frost普通聊天别走pi tts可以吗", "Frost普通聊天别走pi tts可以吗", ["Frost普通聊天别走pi tts可以吗"])
    check("passes ordinary-question-spaced-pi-tts policy without wake", "普通问题会不会走 pi tts", "普通问题会不会走 pi tts", ["普通问题会不会走 pi tts"])
    check("passes current-city-voice-broadcast policy without wake", "问当前城市会不会走语音播报", "问当前城市会不会走语音播报", ["问当前城市会不会走语音播报"])
    check("passes current-message-readout-decision question without wake", "这条要念出来吗", "这条要念出来吗", ["这条要念出来吗"])
    check("passes current-message-tts-decision question without wake", "这个会走TTS吗", "这个会走TTS吗", ["这个会走TTS吗"])
    check("passes ordinary-chat-speaker policy without wake", "普通聊天会不会突然用喇叭说出来", "普通聊天会不会突然用喇叭说出来", ["普通聊天会不会突然用喇叭说出来"])
    check("passes low-battery-pi-tts policy without wake", "低电量提醒会不会走pi-tts", "低电量提醒会不会走pi-tts", ["低电量提醒会不会走pi-tts"])
    check("passes night-road-speaker policy without wake", "夜路求助会不会通过喇叭提醒", "夜路求助会不会通过喇叭提醒", ["夜路求助会不会通过喇叭提醒"])
    check("passes question-pi-tts policy without wake", "只是问问题会不会触发TTS", "只是问问题会不会触发TTS", ["只是问问题会不会触发TTS"])
    check("passes playlist-readout policy without wake", "问歌单这种普通回复会朗读吗", "问歌单这种普通回复会朗读吗", ["问歌单这种普通回复会朗读吗"])
    check("passes branch-readout policy without wake", "故事支线普通回复会不会朗读", "故事支线普通回复会不会朗读", ["故事支线普通回复会不会朗读"])
    check("passes important-reply-definition without wake", "什么才算重要回复", "什么才算重要回复", ["什么才算重要回复"])
    check("passes tool-failure-important-reply question without wake", "工具失败是不是重要回复", "工具失败是不是重要回复", ["工具失败是不是重要回复"])
    check("passes user-message-swallow question without wake", "用户消息会不会被吞掉", "用户消息会不会被吞掉", ["用户消息会不会被吞掉"])
    check("passes sent-message-still-there question without wake", "发送后我的消息还在吗", "发送后我的消息还在吗", ["发送后我的消息还在吗"])
    check("passes my-message-sent-still-there question without wake", "我的消息发出去还在吗", "我的消息发出去还在吗", ["我的消息发出去还在吗"])
    check("passes casual-just-sent-message-retained question without wake", "我刚发出去的消息还留着吗", "我刚发出去的消息还留着吗", ["我刚发出去的消息还留着吗"])
    check("passes after-send-message-swallow question without wake", "我发完会不会被你吞掉", "我发完会不会被你吞掉", ["我发完会不会被你吞掉"])
    check("passes short after-send-message-swallow guard without wake", "我发完消息你别吞", "我发完消息你别吞", ["我发完消息你别吞"])
    check("passes recent-message-visible question without wake", "刚才那条消息还能看到吗", "刚才那条消息还能看到吗", ["刚才那条消息还能看到吗"])
    check("passes just-sent-message-cover question without wake", "我刚发的那条会不会被覆盖掉", "我刚发的那条会不会被覆盖掉", ["我刚发的那条会不会被覆盖掉"])
    check("passes dialog-reply-cover-message question without wake", "对话框里的回复会不会覆盖我的消息", "对话框里的回复会不会覆盖我的消息", ["对话框里的回复会不会覆盖我的消息"])
    check("passes short reply-cover-message guard without wake", "你回我时不要盖掉我刚发的那条", "你回我时不要盖掉我刚发的那条", ["你回我时不要盖掉我刚发的那条"])
    check("passes bare-mainline-still-present question without wake", "主线还在吗", "主线还在吗", ["主线还在吗"])
    check("blocks ordinary command after wake guide", "播放下洛杉矶的歌曲", "", [])
    check("passes health-state shortcut without wake", "健康状态", "健康状态", ["健康状态"])
    check("passes system-health question without wake", "系统健康吗", "系统健康吗", ["系统健康吗"])
    check("passes terse self-check without wake", "做个自检", "做个自检", ["做个自检"])
    check("passes departure-preflight without wake", "出发前检查一下", "出发前检查一下", ["出发前检查一下"])
    check("passes portable-check without wake", "便携检查", "便携检查", ["便携检查"])
    check("passes phone-signal-low without wake", "手机信号不好", "手机信号不好", ["手机信号不好"])
    check("passes phone-signal-one-bar without wake", "我手机信号只有一格", "我手机信号只有一格", ["我手机信号只有一格"])
    check("passes last-tool question without wake", "刚才调用了什么技能", "刚才调用了什么技能", ["刚才调用了什么技能"])
    check("passes last-skill-route question without wake", "刚才走的是哪个skill", "刚才走的是哪个skill", ["刚才走的是哪个skill"])
    check("passes last-capability-used question without wake", "你刚用了啥能力", "你刚用了啥能力", ["你刚用了啥能力"])
    check("passes previous-action-tool question without wake", "上一条走了哪个工具", "上一条走了哪个工具", ["上一条走了哪个工具"])
    check("passes previous-action-tool-used-natural question without wake", "刚才那个用到什么工具", "刚才那个用到什么工具", ["刚才那个用到什么工具"])
    check("passes previous-step-capability-used-natural question without wake", "上一步用到哪个能力", "上一步用到哪个能力", ["上一步用到哪个能力"])
    check("passes previous-route-recall-casual question without wake", "上一回路由到哪了", "上一回路由到哪了", ["上一回路由到哪了"])
    check("passes previous-action-result-redisplay question without wake", "刚才动作结果再显示一下", "刚才动作结果再显示一下", ["刚才动作结果再显示一下"])
    check("passes previous-skill-finished-casual question without wake", "刚才那次skill跑成没", "刚才那次skill跑成没", ["刚才那次skill跑成没"])
    check("passes previous-action-result-returned question without wake", "刚刚那个动作结果回来了没", "刚刚那个动作结果回来了没", ["刚刚那个动作结果回来了没"])
    check("passes previous-call-result-writeback question without wake", "刚才那个调用结果写回来了吗", "刚才那个调用结果写回来了吗", ["刚才那个调用结果写回来了吗"])
    check("passes previous-skill-state-writeback question without wake", "上一回skill有没有把状态写回来", "上一回skill有没有把状态写回来", ["上一回skill有没有把状态写回来"])
    check("passes previous-tool-status-card-writeback question without wake", "上个工具结果写状态卡了吗", "上个工具结果写状态卡了吗", ["上个工具结果写状态卡了吗"])
    check("passes terse status-card-writeback question without wake", "状态卡回写了吗", "状态卡回写了吗", ["状态卡回写了吗"])
    check("passes terse result-card-write question without wake", "结果写卡了吗", "结果写卡了吗", ["结果写卡了吗"])
    check("passes status-card previous-long-press failure question without wake", "状态卡能不能告诉我刚才长按有没有失败", "状态卡能不能告诉我刚才长按有没有失败", ["状态卡能不能告诉我刚才长按有没有失败"])
    check("passes previous-long-press-failure-status-card-tail question without wake", "长按那次失败了吗状态卡还能看吗", "长按那次失败了吗状态卡还能看吗", ["长按那次失败了吗状态卡还能看吗"])
    check("passes previous-skill-ran-through question without wake", "刚才那次技能跑完没有", "刚才那次技能跑完没有", ["刚才那次技能跑完没有"])
    check("passes previous-result question without wake", "刚才结果怎么样", "刚才结果怎么样", ["刚才结果怎么样"])
    check("passes previous-success question without wake", "上一条成功了吗", "上一条成功了吗", ["上一条成功了吗"])
    check("passes previous-problem question without wake", "上一条有问题吗", "上一条有问题吗", ["上一条有问题吗"])
    check("passes previous-action-error question without wake", "上个动作有报错吗", "上个动作有报错吗", ["上个动作有报错吗"])
    check("passes previous-thing-done-casual question without wake", "刚才那个弄好了吗", "刚才那个弄好了吗", ["刚才那个弄好了吗"])
    check("passes previous-row-done-casual question without wake", "上一条弄成了吗", "上一条弄成了吗", ["上一条弄成了吗"])
    check("passes previous-time-success-casual question without wake", "刚刚那次成功没", "刚刚那次成功没", ["刚刚那次成功没"])
    check("passes previous-action-stuck-casual question without wake", "上个动作卡住了吗", "上个动作卡住了吗", ["上个动作卡住了吗"])
    check("passes previous-queue-casual question without wake", "刚才那条还在队列里吗", "刚才那条还在队列里吗", ["刚才那条还在队列里吗"])
    check("passes backend-action-done-casual question without wake", "后台动作有没有完成", "后台动作有没有完成", ["后台动作有没有完成"])
    check("passes tool-status-writeback question without wake", "工具调用前后会写状态吗", "工具调用前后会写状态吗", ["工具调用前后会写状态吗"])
    check("passes skill-result-writeback question without wake", "调用skill之后结果会写回屏幕吗", "调用skill之后结果会写回屏幕吗", ["调用skill之后结果会写回屏幕吗"])
    check("passes previous-skill-writeback-result question without wake", "刚才那个skill有没有回写结果", "刚才那个skill有没有回写结果", ["刚才那个skill有没有回写结果"])
    check("passes mid-run-tool-status-retention question without wake", "工具跑到一半卡住会不会把状态留屏幕", "工具跑到一半卡住会不会把状态留屏幕", ["工具跑到一半卡住会不会把状态留屏幕"])
    check("passes bare-mid-run-disconnect-state question without wake", "跑到一半断了状态还在屏幕吗", "跑到一半断了状态还在屏幕吗", ["跑到一半断了状态还在屏幕吗"])
    check("passes stuck-tool-state-retained question without wake", "工具卡住以后状态还在吗", "工具卡住以后状态还在吗", ["工具卡住以后状态还在吗"])
    check("passes tool-preparing-status question without wake", "工具调用前会先显示准备中吗", "工具调用前会先显示准备中吗", ["工具调用前会先显示准备中吗"])
    check("passes tool-complete-status question without wake", "工具调用后会不会显示完成状态", "工具调用后会不会显示完成状态", ["工具调用后会不会显示完成状态"])
    check("passes stuck-step question without wake", "刚才卡在哪一步", "刚才卡在哪一步", ["刚才卡在哪一步"])
    check("passes previous-stuck-step question without wake", "上一条卡在哪一步", "上一条卡在哪一步", ["上一条卡在哪一步"])
    check("passes previous-step-progress question without wake", "刚才那步走到哪了", "刚才那步走到哪了", ["刚才那步走到哪了"])
    check("passes previous-result-screen-retention question without wake", "刚才结果会留在屏幕上吗", "刚才结果会留在屏幕上吗", ["刚才结果会留在屏幕上吗"])
    check("passes previous-result-still-screen question without wake", "刚才那个结果还在屏幕上吗", "刚才那个结果还在屏幕上吗", ["刚才那个结果还在屏幕上吗"])
    check("passes previous-error-still-visible question without wake", "上次报错还看得到吗", "上次报错还看得到吗", ["上次报错还看得到吗"])
    check("passes previous-action-stuck-where question without wake", "刚刚那个动作卡哪了", "刚刚那个动作卡哪了", ["刚刚那个动作卡哪了"])
    check("passes previous-skill-finished question without wake", "上个技能有没有跑完", "上个技能有没有跑完", ["上个技能有没有跑完"])
    check("passes previous-step-wrote-screen question without wake", "刚才那步有写回屏幕吗", "刚才那步有写回屏幕吗", ["刚才那步有写回屏幕吗"])
    check("passes previous-status-card-still-there question without wake", "刚才那个状态卡还在吗", "刚才那个状态卡还在吗", ["刚才那个状态卡还在吗"])
    check("passes previous-action-state-retained question without wake", "上个动作状态还留着吗", "上个动作状态还留着吗", ["上个动作状态还留着吗"])
    check("passes short previous-result question without wake", "上次结果呢", "上次结果呢", ["上次结果呢"])
    check("passes casual previous-result question without wake", "刚刚那个结果呢", "刚刚那个结果呢", ["刚刚那个结果呢"])
    check("passes previous-call-route-where question without wake", "刚才那次路由走哪了", "刚才那次路由走哪了", ["刚才那次路由走哪了"])
    check("passes tool-pre-run-activity question without wake", "跑工具之前会不会告诉我在干嘛", "跑工具之前会不会告诉我在干嘛", ["跑工具之前会不会告诉我在干嘛"])
    check("passes tool-finished-result-retention question without wake", "工具跑完会不会把结果留在屏幕上", "工具跑完会不会把结果留在屏幕上", ["工具跑完会不会把结果留在屏幕上"])
    check("passes song-action-failure-reason question without wake", "点歌动作失败会不会告诉我为什么", "点歌动作失败会不会告诉我为什么", ["点歌动作失败会不会告诉我为什么"])
    check("passes failure-reason-status-card question without wake", "失败原因会不会留在状态卡", "失败原因会不会留在状态卡", ["失败原因会不会留在状态卡"])
    check("passes last-action-failure-visible question without wake", "上次动作的失败原因还能看到吗", "上次动作的失败原因还能看到吗", ["上次动作的失败原因还能看到吗"])
    check("passes action-prep-status question without wake", "动作执行前会不会先写准备状态", "动作执行前会不会先写准备状态", ["动作执行前会不会先写准备状态"])
    check("passes action-success-failure-writeback question without wake", "动作执行后会不会告诉我成功失败", "动作执行后会不会告诉我成功失败", ["动作执行后会不会告诉我成功失败"])
    check("passes status-writeback-loss question without wake", "状态回写会不会丢", "状态回写会不会丢", ["状态回写会不会丢"])
    check("passes call-failure fallback question without wake", "如果调用失败怎么办", "如果调用失败怎么办", ["如果调用失败怎么办"])
    check("passes skill-failure fallback question without wake", "技能失败了会怎么兜底", "技能失败了会怎么兜底", ["技能失败了会怎么兜底"])
    check("passes skill-failure-reply-policy question without wake", "skill失败会怎么回我", "skill失败会怎么回我", ["skill失败会怎么回我"])
    check("passes tool-error guardrail question without wake", "工具报错会不会乱执行", "工具报错会不会乱执行", ["工具报错会不会乱执行"])
    check("passes broken-tool fallback question without wake", "工具坏了怎么办", "工具坏了怎么办", ["工具坏了怎么办"])
    check("passes unavailable-skill fallback question without wake", "skill不可用怎么办", "skill不可用怎么办", ["skill不可用怎么办"])
    check("passes stuck-route guardrail question without wake", "路由跑不动会不会乱执行", "路由跑不动会不会乱执行", ["路由跑不动会不会乱执行"])
    check("passes broken-skill-no-retry phrase without wake", "这个技能跑坏了别给我再点一次", "这个技能跑坏了别给我再点一次", ["这个技能跑坏了别给我再点一次"])
    check(
        "passes missing-skill no-action fallback question without wake",
        "没有这个技能别乱跑，只问会怎么处理",
        "没有这个技能别乱跑，只问会怎么处理",
        ["没有这个技能别乱跑，只问会怎么处理"],
    )
    check(
        "passes missing-tool no-action fallback question without wake",
        "没有这个工具别执行，只问会怎么兜底",
        "没有这个工具别执行，只问会怎么兜底",
        ["没有这个工具别执行，只问会怎么兜底"],
    )
    check(
        "passes missing-plugin no-action fallback question without wake",
        "插件没装别乱点，只问会不会安全兜底",
        "插件没装别乱点，只问会不会安全兜底",
        ["插件没装别乱点，只问会不会安全兜底"],
    )
    check(
        "passes no-plugin-call fallback question without wake",
        "别调用插件，只问插件没装会怎么兜底",
        "别调用插件，只问插件没装会怎么兜底",
        ["别调用插件，只问插件没装会怎么兜底"],
    )
    check(
        "passes missing-tool no-install fallback question without wake",
        "工具缺了别自己装，只问怎么处理",
        "工具缺了别自己装，只问怎么处理",
        ["工具缺了别自己装，只问怎么处理"],
    )
    check(
        "passes missing-credential no-action fallback question without wake",
        "凭证缺了别执行，只问怎么兜底",
        "凭证缺了别执行，只问怎么兜底",
        ["凭证缺了别执行，只问怎么兜底"],
    )
    check(
        "passes unavailable-model no-action fallback question without wake",
        "模型不可用别乱点，只问会怎么兜底",
        "模型不可用别乱点，只问会怎么兜底",
        ["模型不可用别乱点，只问会怎么兜底"],
    )
    check(
        "passes missing-permission no-action fallback question without wake",
        "没有权限别乱跑，只问会怎么兜底",
        "没有权限别乱跑，只问会怎么兜底",
        ["没有权限别乱跑，只问会怎么兜底"],
    )
    check("passes low-confidence no-random-play question without wake", "低置信度会不会乱播", "低置信度会不会乱播", ["低置信度会不会乱播"])
    check("passes low-confidence-dont-move phrase without wake", "路由低置信度先别动可以吗", "路由低置信度先别动可以吗", ["路由低置信度先别动可以吗"])
    check("passes uncertain-recognition-confirm question without wake", "识别不确定会先确认吗", "识别不确定会先确认吗", ["识别不确定会先确认吗"])
    check("passes uncertain-recognition-no-click question without wake", "识别不确定会不会乱点", "识别不确定会不会乱点", ["识别不确定会不会乱点"])
    check("passes inaccurate-recognition-ask-first question without wake", "识别不准会不会先问我", "识别不准会不会先问我", ["识别不准会不会先问我"])
    check("passes wrong-recognition-no-direct-song question without wake", "识别错了会不会直接放歌", "识别错了会不会直接放歌", ["识别错了会不会直接放歌"])
    check("passes not-understood-no-direct-play question without wake", "没听懂会不会直接播", "没听懂会不会直接播", ["没听懂会不会直接播"])
    check("passes asr-wrong-ask-first question without wake", "如果ASR听错了能不能先问我", "如果ASR听错了能不能先问我", ["如果ASR听错了能不能先问我"])
    check("passes ambiguous-speech-no-direct-execute question without wake", "我说得很含糊你会直接执行吗", "我说得很含糊你会直接执行吗", ["我说得很含糊你会直接执行吗"])
    check("passes unclear-hearing-no-direct-play question without wake", "没听清会不会直接播放", "没听清会不会直接播放", ["没听清会不会直接播放"])
    check("passes unclear-hearing-no-random-execute question without wake", "听不清会不会瞎执行", "听不清会不会瞎执行", ["听不清会不会瞎执行"])
    check("passes misheard-no-random-tool-click question without wake", "听错了会不会乱点技能", "听错了会不会乱点技能", ["听错了会不会乱点技能"])
    check("passes no-confidence-hold phrase without wake", "没把握就先别动", "没把握就先别动", ["没把握就先别动"])
    check("passes uncertain-no-execute phrase without wake", "不确定就别执行", "不确定就别执行", ["不确定就别执行"])
    check("passes unclear-ask-first phrase without wake", "听不准就问我一下", "听不准就问我一下", ["听不准就问我一下"])
    check("passes unclear-heard-fallback question without wake", "你没听准会怎么兜底", "你没听准会怎么兜底", ["你没听准会怎么兜底"])
    check("passes unclear-no-hotspot phrase without wake", "听不准就别连热点", "听不准就别连热点", ["听不准就别连热点"])
    check("passes unclear-no-skip phrase without wake", "听不准别切歌", "听不准别切歌", ["听不准别切歌"])
    check("passes inaccurate-no-execute phrase without wake", "识别不准先别执行", "识别不准先别执行", ["识别不准先别执行"])
    check("passes no-confidence-no-hotspot phrase without wake", "没把握别连热点", "没把握别连热点", ["没把握别连热点"])
    check("passes misheard-no-direct-hotspot phrase without wake", "听错了不要直接连手机热点", "听错了不要直接连手机热点", ["听错了不要直接连手机热点"])
    check("passes unclear-no-direct-radio phrase without wake", "没听清别直接打开电台", "没听清别直接打开电台", ["没听清别直接打开电台"])
    check("passes not-understood-screen-only phrase without wake", "没听懂先写屏别动", "没听懂先写屏别动", ["没听懂先写屏别动"])
    check("passes low-confidence-no-pi-dispatch phrase without wake", "低置信度别发给树莓派", "低置信度别发给树莓派", ["低置信度别发给树莓派"])
    check("passes uncertain-no-pi-dispatch phrase without wake", "不确定的命令不要下发给Pi", "不确定的命令不要下发给Pi", ["不确定的命令不要下发给Pi"])
    check("passes uncertain-route-screen-only phrase without wake", "路由不确定就只写屏", "路由不确定就只写屏", ["路由不确定就只写屏"])
    check("passes vague-command-no-direct-execute phrase without wake", "别把模糊命令直接执行", "别把模糊命令直接执行", ["别把模糊命令直接执行"])
    check("passes duplicate-command-status question without wake", "你会不会重复下发命令", "你会不会重复下发命令", ["你会不会重复下发命令"])
    check("passes action-router-explanation question without wake", "这句话会怎么路由", "这句话会怎么路由", ["这句话会怎么路由"])
    check("passes planned-execute-sentence-router question without wake", "你准备怎么执行这句", "你准备怎么执行这句", ["你准备怎么执行这句"])
    check("passes sentence-execute-how-router question without wake", "这句话会怎么执行", "这句话会怎么执行", ["这句话会怎么执行"])
    check("passes play-or-chat-router question without wake", "这句会走点歌还是聊天", "这句会走点歌还是聊天", ["这句会走点歌还是聊天"])
    check("passes command-misroute-guard question without wake", "你会不会把这句话当命令乱跑", "你会不会把这句话当命令乱跑", ["你会不会把这句话当命令乱跑"])
    check("passes direct-pi-send-router question without wake", "这句话会不会直接发给树莓派", "这句话会不会直接发给树莓派", ["这句话会不会直接发给树莓派"])
    check("passes no-action-song-trigger-router question without wake", "只是问下这句会不会触发点歌动作", "只是问下这句会不会触发点歌动作", ["只是问下这句会不会触发点歌动作"])
    check(
        "passes no-real-song action-router question without wake",
        "不要真的点歌，只问点歌会走哪个动作",
        "不要真的点歌，只问点歌会走哪个动作",
        ["不要真的点歌，只问点歌会走哪个动作"],
    )
    check(
        "passes no-tool-call dispatch-router question without wake",
        "不要调用工具，只想知道会不会下发动作",
        "不要调用工具，只想知道会不会下发动作",
        ["不要调用工具，只想知道会不会下发动作"],
    )
    check(
        "passes no-skill-run action-router-entry question without wake",
        "先别跑skill，问一下这个请求会不会进动作路由",
        "先别跑skill，问一下这个请求会不会进动作路由",
        ["先别跑skill，问一下这个请求会不会进动作路由"],
    )
    check(
        "passes status-query-no-tool-call question without wake",
        "我只是问能不能查状态，不要真的调用工具",
        "我只是问能不能查状态，不要真的调用工具",
        ["我只是问能不能查状态，不要真的调用工具"],
    )
    check(
        "passes no-song-skill-route question without wake",
        "别点歌，只问点歌会不会走skill",
        "别点歌，只问点歌会不会走skill",
        ["别点歌，只问点歌会不会走skill"],
    )
    check(
        "passes hypothetical-play-action-route question without wake",
        "不要播歌，只问如果我说播放会不会调用动作",
        "不要播歌，只问如果我说播放会不会调用动作",
        ["不要播歌，只问如果我说播放会不会调用动作"],
    )
    check(
        "passes direct-pi-dispatch-router question without wake",
        "这句话会不会直接下发到树莓派",
        "这句话会不会直接下发到树莓派",
        ["这句话会不会直接下发到树莓派"],
    )
    check("passes action-router-low-confidence-fallback question without wake", "动作路由低置信度怎么办", "动作路由低置信度怎么办", ["动作路由低置信度怎么办"])
    check("passes low-confidence-no-direct-execute question without wake", "低置信度会不会执行", "低置信度会不会执行", ["低置信度会不会执行"])
    check("passes wake-window-half-utterance-no-random-execute question without wake", "唤醒后半句会乱执行吗", "唤醒后半句会乱执行吗", ["唤醒后半句会乱执行吗"])
    check("passes too-fast-incomplete-no-random-execute question without wake", "说太快没说完会不会乱执行", "说太快没说完会不会乱执行", ["说太快没说完会不会乱执行"])
    check("passes partial-heard-no-direct-play question without wake", "只听到半句会不会播放", "只听到半句会不会播放", ["只听到半句会不会播放"])
    check("passes incomplete-speech-no-random-execute question without wake", "没说完整会不会乱执行", "没说完整会不会乱执行", ["没说完整会不会乱执行"])
    check("passes half-sentence-no-direct-play question without wake", "半句话会不会直接播放", "半句话会不会直接播放", ["半句话会不会直接播放"])
    check("passes half-sentence-no-direct-execute question without wake", "半句话会不会直接执行", "半句话会不会直接执行", ["半句话会不会直接执行"])
    check("passes half-sentence-no-random-action question without wake", "半句话会不会乱跑动作", "半句话会不会乱跑动作", ["半句话会不会乱跑动作"])
    check("passes wake-window-wait-for-complete-speech question without wake", "唤醒窗口会等我说完吗", "唤醒窗口会等我说完吗", ["唤醒窗口会等我说完吗"])
    check("passes wait-until-done-before-execute question without wake", "等我说完再执行可以吗", "等我说完再执行可以吗", ["等我说完再执行可以吗"])
    check("passes incomplete-no-action phrase without wake", "没说完整别跑动作", "没说完整别跑动作", ["没说完整别跑动作"])
    check("passes mid-utterance-stop-no-execute guard without wake", "我说到一半停了你别执行", "我说到一半停了你别执行", ["我说到一半停了你别执行"])
    check("passes previous-half-sentence-not-command guard without wake", "刚才那半句别当命令", "刚才那半句别当命令", ["刚才那半句别当命令"])
    check("passes incomplete-speech-no-early-action question without wake", "我话没说完会不会先跑动作", "我话没说完会不会先跑动作", ["我话没说完会不会先跑动作"])
    check("passes first-person-incomplete-no-action phrase without wake", "我说的不完整先别跑动作", "我说的不完整先别跑动作", ["我说的不完整先别跑动作"])
    check("passes incomplete-heard-ask-first question without wake", "没听完整会不会先问我", "没听完整会不会先问我", ["没听完整会不会先问我"])
    check("passes incomplete-speech-repeat-prompt question without wake", "没说完会不会请我重说", "没说完会不会请我重说", ["没说完会不会请我重说"])
    check("passes short-dialog-window-no-mistrigger question without wake", "短暂对话窗口会不会误触发", "短暂对话窗口会不会误触发", ["短暂对话窗口会不会误触发"])
    check("passes no-wake-no-execute guard without wake", "没叫你名字别执行", "没叫你名字别执行", ["没叫你名字别执行"])
    check("passes no-wakeword-no-play guard without wake", "没有唤醒词别播放", "没有唤醒词别播放", ["没有唤醒词别播放"])
    check("passes bystander-chat-no-command guard without wake", "旁边人在聊天别当成命令", "旁边人在聊天别当成命令", ["旁边人在聊天别当成命令"])
    check("passes bystander-calling-no-random-move guard without wake", "旁边人喊你会不会乱动", "旁边人喊你会不会乱动", ["旁边人喊你会不会乱动"])
    check("passes bystander-song-call-no-random-play guard without wake", "旁边人喊你点歌会不会乱播", "旁边人喊你点歌会不会乱播", ["旁边人喊你点歌会不会乱播"])
    check("passes passerby-song-ignore guard without wake", "路人说点歌不要理", "路人说点歌不要理", ["路人说点歌不要理"])
    check("passes background-sound-no-play guard without wake", "背景声音别触发播放", "背景声音别触发播放", ["背景声音别触发播放"])
    check("passes quoted-example-playback guard without wake", "不是命令只是举例播放东京的歌", "不是命令只是举例播放东京的歌", ["不是命令只是举例播放东京的歌"])
    check("passes quoted-example-no-real-play guard without wake", "我只是举例说播放东京别真播", "我只是举例说播放东京别真播", ["我只是举例说播放东京别真播"])
    check("passes other-person-open-radio guard without wake", "别人说打开电台别当我的命令", "别人说打开电台别当我的命令", ["别人说打开电台别当我的命令"])
    check("passes literal-play-words-no-execute guard without wake", "我说播放东京这几个字别执行", "我说播放东京这几个字别执行", ["我说播放东京这几个字别执行"])
    check("passes overheard-continue-no-restore guard without wake", "听到别人说继续播放别恢复", "听到别人说继续播放别恢复", ["听到别人说继续播放别恢复"])
    check("passes hypothetical-restroom-no-nav guard without wake", "如果我说去厕所只是举例别导航", "如果我说去厕所只是举例别导航", ["如果我说去厕所只是举例别导航"])
    check("passes demo-no-command guard without wake", "不要把这句当命令只是演示", "不要把这句当命令只是演示", ["不要把这句当命令只是演示"])
    check("passes friend-wakeword-ignore guard without wake", "朋友在旁边喊小福别理他", "朋友在旁边喊小福别理他", ["朋友在旁边喊小福别理他"])
    check("passes quoted-lyric-no-action guard without wake", "这句话只是引用歌词别触发动作", "这句话只是引用歌词别触发动作", ["这句话只是引用歌词别触发动作"])
    check("passes partial-heard-no-dispatch guard without wake", "如果只听到半截别下发命令", "如果只听到半截别下发命令", ["如果只听到半截别下发命令"])
    check("passes no-wake-no-hotspot guard without wake", "没有叫醒你就不要连热点", "没有叫醒你就不要连热点", ["没有叫醒你就不要连热点"])
    check("blocks half-sentence novel chatter without wake", "半句话小说不错", "", [])
    check("blocks wake-window ad chatter without wake", "唤醒窗口广告不错", "", [])
    check("blocks wake-word ad chatter without wake", "唤醒词广告不错", "", [])
    check("blocks tv-call joke chatter without wake", "电视台喊你很好笑", "", [])
    check("blocks incomplete-speech contest chatter without wake", "没说完整比赛", "", [])
    check("blocks wait-for-meeting chatter without wake", "等我说完再开会", "", [])
    check("blocks tool-call paper chatter without wake", "工具调用论文很好看", "", [])
    check("blocks status-writeback paper chatter without wake", "状态回写论文不错", "", [])
    check("blocks status-card ad chatter without wake", "状态卡广告不错", "", [])
    check("blocks processing-result paper chatter without wake", "处理结果论文不错", "", [])
    check("blocks stuck-step course chatter without wake", "卡在哪一步课程很好看", "", [])
    check("blocks song-action movie chatter without wake", "点歌动作电影很好看", "", [])
    check("blocks context-menu chatter without wake", "这一轮上下文菜单很好用", "", [])
    check("passes unavailable-tool-no-random-click question without wake", "工具不可用会不会乱点", "工具不可用会不会乱点", ["工具不可用会不会乱点"])
    check("passes capability-failure fallback question without wake", "能力没成功有兜底吗", "能力没成功有兜底吗", ["能力没成功有兜底吗"])
    check("passes run-failure fallback question without wake", "没跑通会怎样", "没跑通会怎样", ["没跑通会怎样"])
    check("passes bare-failure-retry question without wake", "失败了会重试吗", "失败了会重试吗", ["失败了会重试吗"])
    check("passes failure-no-infinite-retry phrase without wake", "失败了别一直重试", "失败了别一直重试", ["失败了别一直重试"])
    check("passes skill-no-rerun phrase without wake", "如果技能没跑通别一直试", "如果技能没跑通别一直试", ["如果技能没跑通别一直试"])
    check("passes play-failure-no-auto-replay phrase without wake", "如果点歌失败别自动重播", "如果点歌失败别自动重播", ["如果点歌失败别自动重播"])
    check("passes pi-dispatch-failure-screen-zh question without wake", "下发到树莓派失败会不会留在屏幕", "下发到树莓派失败会不会留在屏幕", ["下发到树莓派失败会不会留在屏幕"])
    check("passes previous-step-no-continue-dispatch phrase without wake", "上一步没成功先别继续下发", "上一步没成功先别继续下发", ["上一步没成功先别继续下发"])
    check("passes hung-tool-no-random-execution question without wake", "工具挂了你会不会乱执行", "工具挂了你会不会乱执行", ["工具挂了你会不会乱执行"])
    check("passes action-failure-no-repeat-click phrase without wake", "动作失败别重复点", "动作失败别重复点", ["动作失败别重复点"])
    check("passes terse failure-fallback question without wake", "失败了咋办", "失败了咋办", ["失败了咋办"])
    check("passes terse misunderstood-fallback question without wake", "没听懂咋办", "没听懂咋办", ["没听懂咋办"])
    check("passes hung-tool-fallback question without wake", "工具挂了会怎样", "工具挂了会怎样", ["工具挂了会怎样"])
    check("passes hung-tool-tts-policy question without wake", "工具挂了会不会朗读", "工具挂了会不会朗读", ["工具挂了会不会朗读"])
    check("passes low-battery-important-readout question without wake", "低电量这种重要回复会念吗", "低电量这种重要回复会念吗", ["低电量这种重要回复会念吗"])
    check("passes night-road-readout-policy question without wake", "夜路提醒要不要读出来", "夜路提醒要不要读出来", ["夜路提醒要不要读出来"])
    check("passes failure-fallback-screen-only question without wake", "失败兜底只写屏可以吗", "失败兜底只写屏可以吗", ["失败兜底只写屏可以吗"])
    check("passes missing-skill-casual-fallback question without wake", "如果没有这个skill会怎样", "如果没有这个skill会怎样", ["如果没有这个skill会怎样"])
    check("passes failed-tool-no-readout phrase without wake", "工具挂了别念出来", "工具挂了别念出来", ["工具挂了别念出来"])
    check("passes failed-skill-no-readout phrase without wake", "技能失败别朗读", "技能失败别朗读", ["技能失败别朗读"])
    check("passes call-failure-type-only phrase without wake", "调用失败只打字", "调用失败只打字", ["调用失败只打字"])
    check("passes call-failure-screen-no-voice phrase without wake", "调用失败先写屏别出声可以吗", "调用失败先写屏别出声可以吗", ["调用失败先写屏别出声可以吗"])
    check("passes failure-reason-screen-view phrase without wake", "失败原因屏幕上看就行", "失败原因屏幕上看就行", ["失败原因屏幕上看就行"])
    check("passes run-failure-no-broadcast phrase without wake", "没跑通也别播报", "没跑通也别播报", ["没跑通也别播报"])
    check("passes previous-failure-no-speech phrase without wake", "刚才失败了先别说话", "刚才失败了先别说话", ["刚才失败了先别说话"])
    check("passes misunderstood-no-direct-execute phrase without wake", "如果没听懂别直接执行", "如果没听懂别直接执行", ["如果没听懂别直接执行"])
    check("passes terse-no-random-play-on-misunderstood phrase without wake", "没懂就别乱播", "没懂就别乱播", ["没懂就别乱播"])
    check("passes error-no-random-click question without wake", "报错了会不会瞎点", "报错了会不会瞎点", ["报错了会不会瞎点"])
    check("passes call-failure-no-random-click question without wake", "调用失败会不会乱点", "调用失败会不会乱点", ["调用失败会不会乱点"])
    check("passes failed-action-no-repeat question without wake", "动作没成功会不会重复执行", "动作没成功会不会重复执行", ["动作没成功会不会重复执行"])
    check("passes skill-failure-infinite-retry question without wake", "技能失败会不会一直重试", "技能失败会不会一直重试", ["技能失败会不会一直重试"])
    check("passes previous-action-timeout-no-repeat-dispatch question without wake", "上个动作超时了会不会反复下发", "上个动作超时了会不会反复下发", ["上个动作超时了会不会反复下发"])
    check("passes tool-timeout-infinite-retry question without wake", "工具超时会不会一直重试", "工具超时会不会一直重试", ["工具超时会不会一直重试"])
    check("passes route-failure-reason question without wake", "路由失败会不会告诉我原因", "路由失败会不会告诉我原因", ["路由失败会不会告诉我原因"])
    check("passes pi-dispatch-failure-screen question without wake", "下发到Pi失败会不会留在屏幕", "下发到Pi失败会不会留在屏幕", ["下发到Pi失败会不会留在屏幕"])
    check("passes playback-command-failure-quiet question without wake", "如果播放命令失败会不会安静待命", "如果播放命令失败会不会安静待命", ["如果播放命令失败会不会安静待命"])
    check("passes previous-auto-retry-many-times question without wake", "上一步没成功会不会自动重试很多次", "上一步没成功会不会自动重试很多次", ["上一步没成功会不会自动重试很多次"])
    check("passes tool-broken-stealth-rerun question without wake", "工具挂了会不会偷偷再跑", "工具挂了会不会偷偷再跑", ["工具挂了会不会偷偷再跑"])
    check("passes failed-action-self-repeat question without wake", "动作失败会不会自己再点一次", "动作失败会不会自己再点一次", ["动作失败会不会自己再点一次"])
    check("passes unavailable-capability-no-random-play question without wake", "如果能力不可用会不会乱播", "如果能力不可用会不会乱播", ["如果能力不可用会不会乱播"])
    check("passes half-heard-direct-execute question without wake", "听半截会不会直接执行", "听半截会不会直接执行", ["听半截会不会直接执行"])
    check("passes misunderstood-fallback question without wake", "没听懂会走兜底吗", "没听懂会走兜底吗", ["没听懂会走兜底吗"])
    check("passes no-random-action question without wake", "你会乱执行吗", "你会乱执行吗", ["你会乱执行吗"])
    check("passes no-random-execution question without wake", "你会不会瞎执行", "你会不会瞎执行", ["你会不会瞎执行"])
    check("passes current-run-through question without wake", "这次跑通了吗", "这次跑通了吗", ["这次跑通了吗"])
    check("passes previous-step-problem question without wake", "上一步出问题了吗", "上一步出问题了吗", ["上一步出问题了吗"])
    check("passes previous-no-problem question without wake", "刚才没问题吧", "刚才没问题吧", ["刚才没问题吧"])
    check("passes previous-command-executed question without wake", "刚才那条执行了吗", "刚才那条执行了吗", ["刚才那条执行了吗"])
    check("passes previous-step-completed question without wake", "上一步完成了吗", "上一步完成了吗", ["上一步完成了吗"])
    check("passes previous-command-went-through question without wake", "上一条走通了吗", "上一条走通了吗", ["上一条走通了吗"])
    check("passes terse-previous-success question without wake", "刚那个成功没", "刚那个成功没", ["刚那个成功没"])
    check("passes previous-understanding question without wake", "你刚才理解成啥了", "你刚才理解成啥了", ["你刚才理解成啥了"])
    check("passes previous-user-intent question without wake", "我刚才让你干嘛", "我刚才让你干嘛", ["我刚才让你干嘛"])
    check("passes terse previous-said question without wake", "你刚说啥", "你刚说啥", ["你刚说啥"])
    check("passes inverted previous-reply question without wake", "刚才你回啥", "刚才你回啥", ["刚才你回啥"])
    check("passes short previous-reply question without wake", "上一句回啥", "上一句回啥", ["上一句回啥"])
    check("passes previous-tool-which question without wake", "刚才用的哪个工具", "刚才用的哪个工具", ["刚才用的哪个工具"])
    check("passes previous-step-did-what question without wake", "你上一步做了什么", "你上一步做了什么", ["你上一步做了什么"])
    check("passes previous-round-result question without wake", "上一轮结果呢", "上一轮结果呢", ["上一轮结果呢"])
    check("passes previous-understood question without wake", "你刚才听懂了吗", "你刚才听懂了吗", ["你刚才听懂了吗"])
    check("passes previous-understood-natural question without wake", "你刚刚听明白了吗", "你刚刚听明白了吗", ["你刚刚听明白了吗"])
    check("passes reversed previous-understood question without wake", "你听懂我刚才说的吗", "你听懂我刚才说的吗", ["你听懂我刚才说的吗"])
    check("passes just-said-understood question without wake", "我刚说的你听懂没", "我刚说的你听懂没", ["我刚说的你听懂没"])
    check("passes previous-recognized question without wake", "刚才识别到了吗", "刚才识别到了吗", ["刚才识别到了吗"])
    check("passes previous-sentence-recognized question without wake", "刚才那句识别了吗", "刚才那句识别了吗", ["刚才那句识别了吗"])
    check("passes just-said-question without wake", "刚刚我说的是啥", "刚刚我说的是啥", ["刚刚我说的是啥"])
    check("passes previous-received question without wake", "你刚刚收到啥", "你刚刚收到啥", ["你刚刚收到啥"])
    check("passes previous-heard-as question without wake", "你上一句听成什么了", "你上一句听成什么了", ["你上一句听成什么了"])
    check("passes short-previous-heard-as question without wake", "你刚听成什么了", "你刚听成什么了", ["你刚听成什么了"])
    check("passes previous-understood-as-what question without wake", "上一句你理解成什么", "上一句你理解成什么", ["上一句你理解成什么"])
    check("passes previous-misheard question without wake", "你刚才是不是把我听错了", "你刚才是不是把我听错了", ["你刚才是不是把我听错了"])
    check("passes repeat-last-reply request without wake", "再讲一遍", "再讲一遍", ["再讲一遍"])
    check("passes casual last-executed question without wake", "你刚才真的执行了吗", "你刚才真的执行了吗", ["你刚才真的执行了吗"])
    check("passes previous-action-executed question without wake", "刚才那个动作执行了吗", "刚才那个动作执行了吗", ["刚才那个动作执行了吗"])
    check("passes previous-run-really question without wake", "上一条有没有真的跑", "上一条有没有真的跑", ["上一条有没有真的跑"])
    check("passes previous-skill-success question without wake", "刚才那个skill成功了吗", "刚才那个skill成功了吗", ["刚才那个skill成功了吗"])
    check("passes previous-failure-reason question without wake", "上一步失败原因是什么", "上一步失败原因是什么", ["上一步失败原因是什么"])
    check("passes failure-retry-again question without wake", "失败之后会不会再试一次", "失败之后会不会再试一次", ["失败之后会不会再试一次"])
    check("passes no-repeat-last-action phrase without wake", "别重复执行刚才那个动作", "别重复执行刚才那个动作", ["别重复执行刚才那个动作"])
    check("passes no-retry-previous-step phrase without wake", "上一步别再重试了", "上一步别再重试了", ["上一步别再重试了"])
    check("passes no-retry-previous-skill phrase without wake", "上个技能别再试了", "上个技能别再试了", ["上个技能别再试了"])
    check("passes no-repeat-previous-skill-status phrase without wake", "别重复调用上一个技能，只看状态", "别重复调用上一个技能，只看状态", ["别重复调用上一个技能，只看状态"])
    check("passes no-retry-previous-skill-status-card phrase without wake", "不要再调刚才那个skill，只看状态卡", "不要再调刚才那个skill，只看状态卡", ["不要再调刚才那个skill，只看状态卡"])
    check("passes no-repeat-previous-skill-screen phrase without wake", "上一个技能别重复调用，只写屏告诉我状态", "上一个技能别重复调用，只写屏告诉我状态", ["上一个技能别重复调用，只写屏告诉我状态"])
    check("passes previous-not-executed question without wake", "刚才怎么还没执行", "刚才怎么还没执行", ["刚才怎么还没执行"])
    check("passes previous-still-queued question without wake", "上一条还在排队吗", "上一条还在排队吗", ["上一条还在排队吗"])
    check("passes previous-queue-item question without wake", "上一条还在队列里吗", "上一条还在队列里吗", ["上一条还在队列里吗"])
    check("passes queue-stuck question without wake", "命令队列卡住了吗", "命令队列卡住了吗", ["命令队列卡住了吗"])
    check("passes previous-request-stuck question without wake", "刚才那个请求卡住了吗", "刚才那个请求卡住了吗", ["刚才那个请求卡住了吗"])
    check("passes short previous-request-stuck question without wake", "上个请求卡住了吗", "上个请求卡住了吗", ["上个请求卡住了吗"])
    check("passes current-queue-items question without wake", "现在队列里还有东西吗", "现在队列里还有东西吗", ["现在队列里还有东西吗"])
    check("passes backend-service status without wake", "后台服务正常吗", "后台服务正常吗", ["后台服务正常吗"])
    check("passes no-restart service-alive status without wake", "先别重启，只想知道服务是不是活着", "先别重启，只想知道服务是不是活着", ["先别重启，只想知道服务是不是活着"])
    check("passes no-restart backend-online status without wake", "不要重启电台，只问后台服务在线吗", "不要重启电台，只问后台服务在线吗", ["不要重启电台，只问后台服务在线吗"])
    check("passes boot-service status without wake", "开机服务正常吗", "开机服务正常吗", ["开机服务正常吗"])
    check("passes boot-service quiet-failure status without wake", "开机服务没起来会安静显示吗", "开机服务没起来会安静显示吗", ["开机服务没起来会安静显示吗"])
    check("passes screen-dark status without wake", "屏幕黑了", "屏幕黑了", ["屏幕黑了"])
    check("passes screen-current-display status without wake", "屏幕现在显示什么", "屏幕现在显示什么", ["屏幕现在显示什么"])
    check("passes no-status-card status without wake", "看不到状态", "看不到状态", ["看不到状态"])
    check("passes status-card-content status without wake", "状态卡写了什么", "状态卡写了什么", ["状态卡写了什么"])
    check("passes avatar-stuck status without wake", "头像不动了", "头像不动了", ["头像不动了"])
    check("passes avatar-current-state status without wake", "头像现在什么状态", "头像现在什么状态", ["头像现在什么状态"])
    check("passes Whisplay-refresh status without wake", "Whisplay刷新了吗", "Whisplay刷新了吗", ["Whisplay刷新了吗"])
    check("passes orange-button status without wake", "橙色按钮正常吗", "橙色按钮正常吗", ["橙色按钮正常吗"])
    check("passes orange-button-long-press meaning without wake", "长按橙色按钮会做什么", "长按橙色按钮会做什么", ["长按橙色按钮会做什么"])
    check("passes orange-key-long-press colloquial meaning without wake", "橙键长按是干嘛的", "橙键长按是干嘛的", ["橙键长按是干嘛的"])
    check("passes orange-key-long-press-pressing variant without wake", "长摁橙色键会干嘛", "长摁橙色键会干嘛", ["长摁橙色键会干嘛"])
    check("passes orange-button-hold-pressing variant without wake", "摁住橙色按钮会干嘛", "摁住橙色按钮会干嘛", ["摁住橙色按钮会干嘛"])
    check("passes orange-button-hotspot long-press question without wake", "按住橙色按钮会不会连热点", "按住橙色按钮会不会连热点", ["按住橙色按钮会不会连热点"])
    check("passes playing-long-press-off question without wake", "播放中长按会关掉吗", "播放中长按会关掉吗", ["播放中长按会关掉吗"])
    check("passes standby-long-press-play question without wake", "待机长按会开歌吗", "待机长按会开歌吗", ["待机长按会开歌吗"])
    check("passes idle-orange-key-long-press-play question without wake", "不播放时长按橙键会开电台吗", "不播放时长按橙键会开电台吗", ["不播放时长按橙键会开电台吗"])
    check("passes playing-orange-key-long-press-off question without wake", "正在播放长按橙键会关吗", "正在播放长按橙键会关吗", ["正在播放长按橙键会关吗"])
    check("passes playing-long-press-standby question without wake", "正在播的时候长按会安静待命吗", "正在播的时候长按会安静待命吗", ["正在播的时候长按会安静待命吗"])
    check("passes standalone long-press toggle question without wake", "长按现在会关掉播放还是开电台", "长按现在会关掉播放还是开电台", ["长按现在会关掉播放还是开电台"])
    check("passes muted long-press current-sunset question without wake", "我在静音时长按是不是会解除静音并播放当前日落", "我在静音时长按是不是会解除静音并播放当前日落", ["我在静音时长按是不是会解除静音并播放当前日落"])
    check("passes playing-hold-orange-key-no-restart question without wake", "播放中按住橙键会不会又重新放歌", "播放中按住橙键会不会又重新放歌", ["播放中按住橙键会不会又重新放歌"])
    check("passes orange-key-hotspot-order long-press question without wake", "长按橙键是不是先找PocketEarth-iPhone再找PocketEarth-Android", "长按橙键是不是先找PocketEarth-iPhone再找PocketEarth-Android", ["长按橙键是不是先找PocketEarth-iPhone再找PocketEarth-Android"])
    check("passes orange-key-mute-guard question without wake", "长按橙色键会不会绕过静音直接外放", "长按橙色键会不会绕过静音直接外放", ["长按橙色键会不会绕过静音直接外放"])
    check("passes long-press-status-card question without wake", "长按后会不会写状态卡", "长按后会不会写状态卡", ["长按后会不会写状态卡"])
    check("passes long-press-screen-result question without wake", "长按后屏幕会显示结果吗", "长按后屏幕会显示结果吗", ["长按后屏幕会显示结果吗"])
    check("passes button-action-writeback question without wake", "按钮动作会写回状态吗", "按钮动作会写回状态吗", ["按钮动作会写回状态吗"])
    check("passes long-press-failure-status-card question without wake", "状态卡能不能告诉我刚才长按有没有失败", "状态卡能不能告诉我刚才长按有没有失败", ["状态卡能不能告诉我刚才长按有没有失败"])
    check("passes long-press-failure-status-card-tail question without wake", "长按那次失败了吗状态卡还能看吗", "长按那次失败了吗状态卡还能看吗", ["长按那次失败了吗状态卡还能看吗"])
    check("passes muted-orange-key-long-press-hotspot question without wake", "静音时长按橙键会先连热点吗", "静音时长按橙键会先连热点吗", ["静音时长按橙键会先连热点吗"])
    check("passes idle-hold-orange-key-phone question without wake", "待机的时候按住橙键会先连手机吗", "待机的时候按住橙键会先连手机吗", ["待机的时候按住橙键会先连手机吗"])
    check("passes no-song-long-press meaning without wake", "没播歌的时候长按橙色键会干嘛", "没播歌的时候长按橙色键会干嘛", ["没播歌的时候长按橙色键会干嘛"])
    check("passes idle-orange-key-press-long-direct-song question without wake", "没播歌的时候橙键按久点会直接放歌吗", "没播歌的时候橙键按久点会直接放歌吗", ["没播歌的时候橙键按久点会直接放歌吗"])
    check("passes playing-hold-orange-key-quiet question without wake", "正在播的时候按住橙键是不是就安静了", "正在播的时候按住橙键是不是就安静了", ["正在播的时候按住橙键是不是就安静了"])
    check("passes playing-long-press-pressing-orange-key quiet question without wake", "播放中长摁橙键会不会安静", "播放中长摁橙键会不会安静", ["播放中长摁橙键会不会安静"])
    check("passes hold-orange-button-no-restart question without wake", "我按住橙色按钮是不是会重新放歌", "我按住橙色按钮是不是会重新放歌", ["我按住橙色按钮是不是会重新放歌"])
    check("passes muted-hold-button-no-noise question without wake", "静音的时候按住按钮会不会直接吵出来", "静音的时候按住按钮会不会直接吵出来", ["静音的时候按住按钮会不会直接吵出来"])
    check("blocks casual orange-button ad chatter without wake", "橙色按钮广告很好看", "", [])
    check("blocks casual long-press keyboard chatter without wake", "长按键盘快捷键很方便", "", [])
    check("blocks casual hotspot ad chatter without wake", "手机热点广告很多", "", [])
    check("passes orange-key-broken status without wake", "橙色键不灵了", "橙色键不灵了", ["橙色键不灵了"])
    check("passes self-check request without wake", "帮我自检一下", "帮我自检一下", ["帮我自检一下"])
    check("passes health-check question without wake", "你现在健康吗", "你现在健康吗", ["你现在健康吗"])
    check("passes battery-doctor shortcut without wake", "电池医生", "电池医生", ["电池医生"])
    check("passes outdoor-preflight request without wake", "出门前帮我检查一下", "出门前帮我检查一下", ["出门前帮我检查一下"])
    check("passes before-outdoor status request without wake", "出门之前看一下状态", "出门之前看一下状态", ["出门之前看一下状态"])
    check("passes casual before-outdoor status request without wake", "出门之前帮我看状态", "出门之前帮我看状态", ["出门之前帮我看状态"])
    check("passes take-outdoor hotspot-power status request without wake", "带出去之前帮我确认热点和电量", "带出去之前帮我确认热点和电量", ["带出去之前帮我确认热点和电量"])
    check("passes take-outdoor question without wake", "我能带你出去吗", "我能带你出去吗", ["我能带你出去吗"])
    check("passes outdoor-stroll request without wake", "我准备出门溜达一下", "我准备出门溜达一下", ["我准备出门溜达一下"])
    check("passes take-dj-out-stroll request without wake", "带你出门溜达", "带你出门溜达", ["带你出门溜达"])
    check("passes ready-to-leave request without wake", "准备走了", "准备走了", ["准备走了"])
    check("passes starting-out request without wake", "我要出发了", "我要出发了", ["我要出发了"])
    check("passes take-dj-departure request without wake", "要带你出发了", "要带你出发了", ["要带你出发了"])
    check("passes time-to-depart request without wake", "该出发了", "该出发了", ["该出发了"])
    check("passes can-depart question without wake", "可以出发了吗", "可以出发了吗", ["可以出发了吗"])
    check("passes group-departure request without wake", "我们出发吧", "我们出发吧", ["我们出发吧"])
    check("passes group-walk request without wake", "咱们走吧", "咱们走吧", ["咱们走吧"])
    check("passes casual leaving request without wake", "要走啦", "要走啦", ["要走啦"])
    check("passes take-dj-walk request without wake", "带你走了", "带你走了", ["带你走了"])
    check("blocks departure prose before wake", "准备出发广告很多", "", [])
    check("passes tts-doctor question without wake", "语音回复正常吗", "语音回复正常吗", ["语音回复正常吗"])
    check("passes read-aloud-status question without wake", "能朗读吗", "能朗读吗", ["能朗读吗"])
    check("passes tts-important-speak question without wake", "什么时候会出声回复", "什么时候会出声回复", ["什么时候会出声回复"])
    check("passes tts-important-read-aloud question without wake", "重要回复会朗读吗", "重要回复会朗读吗", ["重要回复会朗读吗"])
    check("passes casual-chat-readout-policy question without wake", "普通闲聊会不会朗读", "普通闲聊会不会朗读", ["普通闲聊会不会朗读"])
    check("passes unimportant-reply-readout-policy question without wake", "不重要的回复会不会出声", "不重要的回复会不会出声", ["不重要的回复会不会出声"])
    check("passes important-reply-screen-only-near-people question without wake", "旁边有人重要回复会不会只写屏", "旁边有人重要回复会不会只写屏", ["旁边有人重要回复会不会只写屏"])
    check("passes important-reply-judgement question without wake", "你怎么判断回复重不重要", "你怎么判断回复重不重要", ["你怎么判断回复重不重要"])
    check("passes current-reply-important-readout question without wake", "这句重要吗会不会读", "这句重要吗会不会读", ["这句重要吗会不会读"])
    check("passes terse-current-message-readout question without wake", "这条要念出来吗", "这条要念出来吗", ["这条要念出来吗"])
    check("passes terse-current-message-tts question without wake", "这个会走TTS吗", "这个会走TTS吗", ["这个会走TTS吗"])
    check("passes tts-surprise-readout question without wake", "会不会突然念出来", "会不会突然念出来", ["会不会突然念出来"])
    check("passes tts-surprise-ring question without wake", "你会不会突然响起来", "你会不会突然响起来", ["你会不会突然响起来"])
    check("passes tts-voice-route question without wake", "哪些回复会走语音", "哪些回复会走语音", ["哪些回复会走语音"])
    check("passes tts-when-readout question without wake", "什么情况会念出来", "什么情况会念出来", ["什么情况会念出来"])
    check("passes tts-which-replies-read-aloud question without wake", "哪些回复会朗读", "哪些回复会朗读", ["哪些回复会朗读"])
    check("passes earbud-readout question without wake", "戴着耳机可以念吗", "戴着耳机可以念吗", ["戴着耳机可以念吗"])
    check("passes no-earbud-readout question without wake", "没戴耳机能朗读吗", "没戴耳机能朗读吗", ["没戴耳机能朗读吗"])
    check("passes no-earbud-ring question without wake", "我没戴耳机会不会响", "我没戴耳机会不会响", ["我没戴耳机会不会响"])
    check("passes first-person earbud-readout question without wake", "我戴上耳机了你可以说话吗", "我戴上耳机了你可以说话吗", ["我戴上耳机了你可以说话吗"])
    check("passes connected-earbud-readout question without wake", "耳机连着能读出来吗", "耳机连着能读出来吗", ["耳机连着能读出来吗"])
    check("passes tts-low-battery-readout question without wake", "低电量会出声吗", "低电量会出声吗", ["低电量会出声吗"])
    check("passes tts-low-battery-no-pi-tts question without wake", "低电量提醒别走pi-tts", "低电量提醒别走pi-tts", ["低电量提醒别走pi-tts"])
    check("passes tts-night-road-no-api-pi-tts question without wake", "夜路提醒不用/api/pi-tts", "夜路提醒不用/api/pi-tts", ["夜路提醒不用/api/pi-tts"])
    check("passes tts-important-readout question without wake", "重要的时候会不会读出来", "重要的时候会不会读出来", ["重要的时候会不会读出来"])
    check("passes tts-important-words-readout question without wake", "重要的话会不会读出来", "重要的话会不会读出来", ["重要的话会不会读出来"])
    check("passes tts-surprise-speaking question without wake", "会不会自己突然开口", "会不会自己突然开口", ["会不会自己突然开口"])
    check("passes tts-nearby-people-speaking question without wake", "旁边有人会不会出声", "旁边有人会不会出声", ["旁边有人会不会出声"])
    check("passes outdoor-speaker question without wake", "我在外面会不会外放", "我在外面会不会外放", ["我在外面会不会外放"])
    check("passes ordinary-chat-no-readout question without wake", "普通聊天别朗读可以吗", "普通聊天别朗读可以吗", ["普通聊天别朗读可以吗"])
    check("passes Frost ordinary-chat no-pi-tts TTS policy without wake", "Frost普通聊天别走pi tts可以吗", "Frost普通聊天别走pi tts可以吗", ["Frost普通聊天别走pi tts可以吗"])
    check("passes Frost reply TTS decision question without wake", "Frost回复要不要走TTS", "Frost回复要不要走TTS", ["Frost回复要不要走TTS"])
    check("passes Frost dialog reply status without wake", "对话框会回复吗", "对话框会回复吗", ["对话框会回复吗"])
    check("passes Frost message persistence without wake", "用户发送后消息会不会消失", "用户发送后消息会不会消失", ["用户发送后消息会不会消失"])
    check("passes Frost reply retention question without wake", "对话框的回复会保留吗", "对话框的回复会保留吗", ["对话框的回复会保留吗"])
    check("passes Frost sent-message still-there question without wake", "对话框里我发的那条还在吗", "对话框里我发的那条还在吗", ["对话框里我发的那条还在吗"])
    check("passes Frost sent-words-not-lost question without wake", "我发出去的话会不会不见", "我发出去的话会不会不见", ["我发出去的话会不会不见"])
    check("passes Frost short sent-message swallow guard without wake", "我发完消息你别吞", "我发完消息你别吞", ["我发完消息你别吞"])
    check("passes Frost short reply cover guard without wake", "你回我时不要盖掉我刚发的那条", "你回我时不要盖掉我刚发的那条", ["你回我时不要盖掉我刚发的那条"])
    check("passes Frost ordinary-chat TTS policy without wake", "弗洛斯特普通聊天会朗读吗", "弗洛斯特普通聊天会朗读吗", ["弗洛斯特普通聊天会朗读吗"])
    check("passes Frost reply persistence without wake", "对话框回复会不会消失", "对话框回复会不会消失", ["对话框回复会不会消失"])
    check("passes generic reply readout status without wake", "回复会不会朗读", "回复会不会朗读", ["回复会不会朗读"])
    check("passes pi-tts trigger status without wake", "/api/pi-tts 什么时候调用", "/api/pi-tts 什么时候调用", ["/api/pi-tts 什么时候调用"])
    check("passes spaced-pi-tts trigger status without wake", "什么情况会走pi tts", "什么情况会走pi tts", ["什么情况会走pi tts"])
    check("passes screen-or-readout TTS policy without wake", "什么时候只写屏什么时候念出来", "什么时候只写屏什么时候念出来", ["什么时候只写屏什么时候念出来"])
    check("passes readout-vs-screen TTS policy without wake", "哪些回复会读出来哪些只写屏", "哪些回复会读出来哪些只写屏", ["哪些回复会读出来哪些只写屏"])
    check("passes unimportant-reply-pi-tts policy without wake", "不重要的回复会不会走pi tts", "不重要的回复会不会走pi tts", ["不重要的回复会不会走pi tts"])
    check("passes unimportant-dialog-only policy without wake", "不重要的话只留在对话框", "不重要的话只留在对话框", ["不重要的话只留在对话框"])
    check("passes important-crowded-text-only policy without wake", "重要提醒旁边有人也只打字", "重要提醒旁边有人也只打字", ["重要提醒旁边有人也只打字"])
    check("passes bystander-important-text-first policy without wake", "旁边有人重要提醒也先打字", "旁边有人重要提醒也先打字", ["旁边有人重要提醒也先打字"])
    check("passes bystander-important-reply TTS policy without wake", "旁边有人时重要提醒也别念吗", "旁边有人时重要提醒也别念吗", ["旁边有人时重要提醒也别念吗"])
    check("passes terse tts decision policy without wake", "你怎么判断要不要朗读", "你怎么判断要不要朗读", ["你怎么判断要不要朗读"])
    check("passes real-speech timing policy without wake", "什么时候会真的出声", "什么时候会真的出声", ["什么时候会真的出声"])
    check("passes dialog branch return status without wake", "对话支线怎么回到主线", "对话支线怎么回到主线", ["对话支线怎么回到主线"])
    check("passes dialog branch 24H return status without wake", "对话支线能回24小时主线吗", "对话支线能回24小时主线吗", ["对话支线能回24小时主线吗"])
    check("passes playlist story branch return without wake", "问完歌单故事怎么回主线", "问完歌单故事怎么回主线", ["问完歌单故事怎么回主线"])
    check("passes DJ dialog mainline return without wake", "从DJ对话回主线", "从DJ对话回主线", ["从DJ对话回主线"])
    check("passes DJ dialog finished mainline return without wake", "DJ对话讲完会回主线吗", "DJ对话讲完会回主线吗", ["DJ对话讲完会回主线吗"])
    check("passes DJ branch finished 24H continue without wake", "DJ支线结束后会继续24小时电台吗", "DJ支线结束后会继续24小时电台吗", ["DJ支线结束后会继续24小时电台吗"])
    check("passes no-stuck DJ dialog branch without wake", "别卡在DJ对话里", "别卡在DJ对话里", ["别卡在DJ对话里"])
    check("passes mainline-continue-play status without wake", "回主线后会继续播吗", "回主线后会继续播吗", ["回主线后会继续播吗"])
    check("passes dialog branch no-stuck request without wake", "别停在对话支线", "别停在对话支线", ["别停在对话支线"])
    check("passes mainline continue request without wake", "回到主线继续播", "回到主线继续播", ["回到主线继续播"])
    check("passes 24-hour radio return without wake", "回到24小时电台", "回到24小时电台", ["回到24小时电台"])
    check("passes spoken 24-hour radio return without wake", "回到二十四小时电台", "回到二十四小时电台", ["回到二十四小时电台"])
    check("passes sunset-radio mainline return without wake", "回到日落电台主线", "回到日落电台主线", ["回到日落电台主线"])
    check("passes ordinary-chat no-interrupt status without wake", "普通聊天会打断电台吗", "普通聊天会打断电台吗", ["普通聊天会打断电台吗"])
    check("passes casual-chat-no-mainline-steal status without wake", "普通闲聊别抢24小时主线", "普通闲聊别抢24小时主线", ["普通闲聊别抢24小时主线"])
    check("passes chat-mainline-still-on status without wake", "聊天的时候主线还在吗", "聊天的时候主线还在吗", ["聊天的时候主线还在吗"])
    check("passes chat-finished-mainline-still-on status without wake", "聊完之后主线还在吗", "聊完之后主线还在吗", ["聊完之后主线还在吗"])
    check("passes ask-only-no-skip status without wake", "我只是问问题不要切歌", "我只是问问题不要切歌", ["我只是问问题不要切歌"])
    check("passes route-view-no-skip status without wake", "我只是想看路线别切歌", "我只是想看路线别切歌", ["我只是想看路线别切歌"])
    check("passes story-branch-no-mainline-cut status without wake", "问故事会不会切走主线", "问故事会不会切走主线", ["问故事会不会切走主线"])
    check("passes ordinary-chat no-surprise-music status without wake", "普通聊天会不会突然开音乐", "普通聊天会不会突然开音乐", ["普通聊天会不会突然开音乐"])
    check("passes no-surprise self-start playback status without wake", "我问一下你会不会自己突然开始播放", "我问一下你会不会自己突然开始播放", ["我问一下你会不会自己突然开始播放"])
    check("passes no-surprise start-song guard without wake", "别突然开始播歌好吗", "别突然开始播歌好吗", ["别突然开始播歌好吗"])
    check("passes song-story no-cut-song status without wake", "问这首歌故事会不会切歌", "问这首歌故事会不会切歌", ["问这首歌故事会不会切歌"])
    check("passes ask-next-stop no-cut-past status without wake", "我只是问下一站别切过去", "我只是问下一站别切过去", ["我只是问下一站别切过去"])
    check("passes chat no-auto-next status without wake", "聊天的时候你会不会自己切到下一站", "聊天的时候你会不会自己切到下一站", ["聊天的时候你会不会自己切到下一站"])
    check("passes playlist no-auto-city status without wake", "问歌单会不会自己换城", "问歌单会不会自己换城", ["问歌单会不会自己换城"])
    check("passes story no-auto-next status without wake", "讲故事会不会自动跳下一站", "讲故事会不会自动跳下一站", ["讲故事会不会自动跳下一站"])
    check("passes answer no-auto-city status without wake", "你会不会一边回答一边切城", "你会不会一边回答一边切城", ["你会不会一边回答一边切城"])
    check("passes ordinary-chat no-auto-other-city status without wake", "普通聊天会不会自己换到别的城市", "普通聊天会不会自己换到别的城市", ["普通聊天会不会自己换到别的城市"])
    check("passes playlist-status-no-stop question without wake", "看歌单会不会停播", "看歌单会不会停播", ["看歌单会不会停播"])
    check("passes future-playlist-no-skip status without wake", "问一下后面歌单别换歌", "问一下后面歌单别换歌", ["问一下后面歌单别换歌"])
    check("passes answer-no-surprise-play status without wake", "你回答问题会不会突然播歌", "你回答问题会不会突然播歌", ["你回答问题会不会突然播歌"])
    check("passes dialog-branch-no-mainline-steal status without wake", "对话支线会不会抢主线", "对话支线会不会抢主线", ["对话支线会不会抢主线"])
    check("passes Frost-branch-no-interrupt status without wake", "弗洛斯特支线会不会打断播放", "弗洛斯特支线会不会打断播放", ["弗洛斯特支线会不会打断播放"])
    check_window_closed("Frost branch status question does not arm wake window")
    check("blocks ordinary mainline chatter without wake", "主线任务报告很好看", "", [])
    check("blocks ordinary 24-hour ad chatter without wake", "24小时便利店广告不错", "", [])
    check("passes tts-speaker-suitable question without wake", "现在适合外放吗", "现在适合外放吗", ["现在适合外放吗"])
    check("passes last-spoken question without wake", "我刚才说啥", "我刚才说啥", ["我刚才说啥"])
    check("passes previous-instruction question without wake", "上一条指令是什么", "上一条指令是什么", ["上一条指令是什么"])
    check("passes hotspot status question without wake", "热点连上了吗", "热点连上了吗", ["热点连上了吗"])
    check("passes current-wifi question without wake", "现在连的是哪个Wi-Fi", "现在连的是哪个Wi-Fi", ["现在连的是哪个Wi-Fi"])
    check("passes current-wifi-mounted question without wake", "现在挂在哪个WiFi", "现在挂在哪个WiFi", ["现在挂在哪个WiFi"])
    check("passes current-network-card-route question without wake", "现在走哪张网", "现在走哪张网", ["现在走哪张网"])
    check("passes current-network-card-use question without wake", "你现在用哪张网", "你现在用哪张网", ["你现在用哪张网"])
    check("passes network-presence question without wake", "现在有没有网", "现在有没有网", ["现在有没有网"])
    check("passes terse current-network-presence question without wake", "现在有网吗", "现在有网吗", ["现在有网吗"])
    check("passes natural offline phrase without wake", "没网了", "没网了", ["没网了"])
    check("passes alive network question without wake", "网还活着吗", "网还活着吗", ["网还活着吗"])
    check("passes offline-status question without wake", "现在是不是离线了", "现在是不是离线了", ["现在是不是离线了"])
    check("passes outdoor-hotspot-ready question without wake", "出门热点准备好了吗", "出门热点准备好了吗", ["出门热点准备好了吗"])
    check("passes outdoor no-network recovery question without wake", "出门没网时怎么连回来", "出门没网时怎么连回来", ["出门没网时怎么连回来"])
    check("passes no-network playback-safety question without wake", "没有网还会播放吗", "没有网还会播放吗", ["没有网还会播放吗"])
    check("passes no-network random-play guard without wake", "没网了会不会乱播", "没网了会不会乱播", ["没网了会不会乱播"])
    check("passes natural not-connected question without wake", "现在是不是没联网", "现在是不是没联网", ["现在是不是没联网"])
    check("passes natural no-network question without wake", "现在是不是没网", "现在是不是没网", ["现在是不是没网"])
    check("passes network-broken-help question without wake", "网络断了怎么办", "网络断了怎么办", ["网络断了怎么办"])
    check("passes casual network-hung question without wake", "网是不是挂了", "网是不是挂了", ["网是不是挂了"])
    check("passes device-dropped-line question without wake", "你是不是掉线了", "你是不是掉线了", ["你是不是掉线了"])
    check("passes can-still-use-internet question without wake", "还能不能上网", "还能不能上网", ["还能不能上网"])
    check("passes network-stability question without wake", "网络现在稳吗", "网络现在稳吗", ["网络现在稳吗"])
    check("passes wifi-health question without wake", "WiFi现在好吗", "WiFi现在好吗", ["WiFi现在好吗"])
    check("passes apple-hotspot-missing-vivo question without wake", "苹果热点不见了会不会再试vivo", "苹果热点不见了会不会再试vivo", ["苹果热点不见了会不会再试vivo"])
    check("passes still-home-network question without wake", "现在还是家里网吗", "现在还是家里网吗", ["现在还是家里网吗"])
    check("passes reversed home-wifi-still-connected question without wake", "家里wifi还连着吗", "家里wifi还连着吗", ["家里wifi还连着吗"])
    check("passes current-home-network-attached question without wake", "现在是不是连着家里网", "现在是不是连着家里网", ["现在是不是连着家里网"])
    check("passes reversed current-wifi-name question without wake", "Wi-Fi现在是哪一个", "Wi-Fi现在是哪一个", ["Wi-Fi现在是哪一个"])
    check("passes hotspot-secret-log question without wake", "热点密码会不会写进日志", "热点密码会不会写进日志", ["热点密码会不会写进日志"])
    check("passes hotspot-secret-local-config-git question without wake", "热点密码只在本地配置吗，不要写git", "热点密码只在本地配置吗，不要写git", ["热点密码只在本地配置吗，不要写git"])
    check("passes hotspot-secret-spoken question without wake", "手机热点密码会不会被你念出来", "手机热点密码会不会被你念出来", ["手机热点密码会不会被你念出来"])
    check("passes hotspot-secret-screen question without wake", "热点密码会不会显示在屏幕上", "热点密码会不会显示在屏幕上", ["热点密码会不会显示在屏幕上"])
    check("passes status-card-hotspot-secret question without wake", "状态卡会不会露出我的热点密码", "状态卡会不会露出我的热点密码", ["状态卡会不会露出我的热点密码"])
    check("passes password-never-screen phrase without wake", "密码别出现在屏幕上", "密码别出现在屏幕上", ["密码别出现在屏幕上"])
    check("passes wifi-password-hidden phrase without wake", "WiFi密码别显示出来", "WiFi密码别显示出来", ["WiFi密码别显示出来"])
    check("passes hotspot-secret-not-spoken question without wake", "要是vivo也没找到别把密码写出来", "要是vivo也没找到别把密码写出来", ["要是vivo也没找到别把密码写出来"])
    check("passes hotspot-stability question without wake", "热点现在稳吗", "热点现在稳吗", ["热点现在稳吗"])
    check("passes current-phone-hotspot question without wake", "现在用的是手机热点吗", "现在用的是手机热点吗", ["现在用的是手机热点吗"])
    check("passes phone-connected question without wake", "手机连上了吗", "手机连上了吗", ["手机连上了吗"])
    check("passes my-phone-connected question without wake", "连上我手机了吗", "连上我手机了吗", ["连上我手机了吗"])
    check("passes iphone-connected question without wake", "连上iPhone了吗", "连上iPhone了吗", ["连上iPhone了吗"])
    check("passes vivo-connected question without wake", "PocketEarth-Android连上了吗", "PocketEarth-Android连上了吗", ["PocketEarth-Android连上了吗"])
    check("passes my-hotspot-route question without wake", "有没有走我的热点", "有没有走我的热点", ["有没有走我的热点"])
    check("passes my-phone-cellular-cutover question without wake", "有没有切到我手机流量", "有没有切到我手机流量", ["有没有切到我手机流量"])
    check("passes casual my-cellular-tether question without wake", "现在还蹭着我的流量吗", "现在还蹭着我的流量吗", ["现在还蹭着我的流量吗"])
    check("passes casual current-tether-owner question without wake", "现在蹭的是谁的网", "现在蹭的是谁的网", ["现在蹭的是谁的网"])
    check(
        "passes guarded current-tether-owner question without wake",
        "别连接手机，只问现在蹭的是谁的网",
        "别连接手机，只问现在蹭的是谁的网",
        ["别连接手机，只问现在蹭的是谁的网"],
    )
    check("passes casual phone-network-route question without wake", "还走着我手机网吗", "还走着我手机网吗", ["还走着我手机网吗"])
    check("passes casual personal-hotspot-in-use question without wake", "是不是还用着我的个人热点", "是不是还用着我的个人热点", ["是不是还用着我的个人热点"])
    check("passes casual still-attached-phone question without wake", "是不是还连着我的手机", "是不是还连着我的手机", ["是不是还连着我的手机"])
    check("passes casual current-phone-attached question without wake", "现在是不是还连着我的手机", "现在是不是还连着我的手机", ["现在是不是还连着我的手机"])
    check("passes terse phone-attached question without wake", "还连着我的手机吗", "还连着我的手机吗", ["还连着我的手机吗"])
    check("passes vivo-or-iphone route question without wake", "连的是vivo还是苹果", "连的是vivo还是苹果", ["连的是vivo还是苹果"])
    check("passes current-vivo-or-iphone route question without wake", "现在连的是vivo还是苹果", "现在连的是vivo还是苹果", ["现在连的是vivo还是苹果"])
    check("passes outdoor-hotspot-priority question without wake", "出门时会先连哪个热点", "出门时会先连哪个热点", ["出门时会先连哪个热点"])
    check("passes hotspot-priority question without wake", "热点优先级是什么", "热点优先级是什么", ["热点优先级是什么"])
    check("passes phone-hotspot-first-priority question without wake", "手机热点现在排第一吗", "手机热点现在排第一吗", ["手机热点现在排第一吗"])
    check("passes iphone-first-priority question without wake", "PocketEarth-iPhone是不是排第一", "PocketEarth-iPhone是不是排第一", ["PocketEarth-iPhone是不是排第一"])
    check("passes vivo-second-priority question without wake", "PocketEarth-Android排第二吗", "PocketEarth-Android排第二吗", ["PocketEarth-Android排第二吗"])
    check("passes iphone-to-vivo failover question without wake", "iPhone连不上会不会试vivo", "iPhone连不上会不会试vivo", ["iPhone连不上会不会试vivo"])
    check("passes named-iphone-to-vivo failover question without wake", "PocketEarth-iPhone没找到会不会找vivo", "PocketEarth-iPhone没找到会不会找vivo", ["PocketEarth-iPhone没找到会不会找vivo"])
    check("passes missing-primary-hotspot policy question without wake", "出门时找不到PocketEarth-iPhone会怎么处理", "出门时找不到PocketEarth-iPhone会怎么处理", ["出门时找不到PocketEarth-iPhone会怎么处理"])
    check("passes apple-hotspot-to-vivo failover question without wake", "苹果热点没找到会不会再找PocketEarth-Android", "苹果热点没找到会不会再找PocketEarth-Android", ["苹果热点没找到会不会再找PocketEarth-Android"])
    check("passes apple-then-vivo priority question without wake", "先找苹果再找vivo对吗", "先找苹果再找vivo对吗", ["先找苹果再找vivo对吗"])
    check("passes vivo-to-home-wifi fallback question without wake", "vivo也没找到会不会回家里Wi-Fi", "vivo也没找到会不会回家里Wi-Fi", ["vivo也没找到会不会回家里Wi-Fi"])
    check("passes missing-vivo-hotspot policy question without wake", "PocketEarth-Android没找到会怎么兜底", "PocketEarth-Android没找到会怎么兜底", ["PocketEarth-Android没找到会怎么兜底"])
    check("passes guarded vivo-to-home-wifi status question without wake", "vivo也别连，只想知道会不会回家里Wi-Fi", "vivo也别连，只想知道会不会回家里Wi-Fi", ["vivo也别连，只想知道会不会回家里Wi-Fi"])
    check("passes home-network-still question without wake", "现在还在家里网吗", "现在还在家里网吗", ["现在还在家里网吗"])
    check("passes home-wifi-cutover question without wake", "有没有从家庭Wi-Fi切出来", "有没有从家庭Wi-Fi切出来", ["有没有从家庭Wi-Fi切出来"])
    check("passes terse home-or-hotspot question without wake", "家里网还是手机热点", "家里网还是手机热点", ["家里网还是手机热点"])
    check("passes hotspot-home-wifi-fallback question without wake", "连不上手机会回家里Wi-Fi吗", "连不上手机会回家里Wi-Fi吗", ["连不上手机会回家里Wi-Fi吗"])
    check("passes vivo-hotspot-priority question without wake", "vivo热点排第几", "vivo热点排第几", ["vivo热点排第几"])
    check("passes both-hotspots-missing fallback question without wake", "两个热点都找不到会回家里Wi-Fi吗", "两个热点都找不到会回家里Wi-Fi吗", ["两个热点都找不到会回家里Wi-Fi吗"])
    check("passes vivo-failure fallback question without wake", "vivo也连不上会不会卡住", "vivo也连不上会不会卡住", ["vivo也连不上会不会卡住"])
    check("passes outdoor-hotspot-failure fallback question without wake", "出门热点失败会不会回落家里网", "出门热点失败会不会回落家里网", ["出门热点失败会不会回落家里网"])
    check("passes hotspot-secret-git question without wake", "热点密码会不会写进git", "热点密码会不会写进git", ["热点密码会不会写进git"])
    check("passes wifi-repeat-switch question without wake", "Wi-Fi失败后会不会重复切换", "Wi-Fi失败后会不会重复切换", ["Wi-Fi失败后会不会重复切换"])
    check("passes guarded hotspot-repeat-switch question without wake", "不要修网络，只问会不会在两个热点之间反复切", "不要修网络，只问会不会在两个热点之间反复切", ["不要修网络，只问会不会在两个热点之间反复切"])
    check("passes guarded current-ssid question without wake", "先别修网络，告诉我当前SSID是什么", "先别修网络，告诉我当前SSID是什么", ["先别修网络，告诉我当前SSID是什么"])
    check("blocks hotspot failover prose before wake", "先找苹果再找vivo广告很多", "", [])
    check(
        "passes hotspot-misfire question without wake",
        "手机只剩一格信号，会不会乱连热点",
        "手机只剩一格信号，会不会乱连热点",
        ["手机只剩一格信号，会不会乱连热点"],
    )
    check(
        "passes low-signal hotspot-advice question without wake",
        "手机信号只有一格，还要不要连热点",
        "手机信号只有一格，还要不要连热点",
        ["手机信号只有一格，还要不要连热点"],
    )
    check(
        "passes guarded outdoor-hotspot advice without wake",
        "手机信号太差，别连热点，只想知道还能不能出门",
        "手机信号太差，别连热点，只想知道还能不能出门",
        ["手机信号太差，别连热点，只想知道还能不能出门"],
    )
    check(
        "passes low-power guarded hotspot advice without wake",
        "带你出去但手机快没电，别连热点，只说建议",
        "带你出去但手机快没电，别连热点，只说建议",
        ["带你出去但手机快没电，别连热点，只说建议"],
    )
    check("passes hotspot repair action without wake", "Wi-Fi掉了帮我连回热点", "Wi-Fi掉了帮我连回热点", ["Wi-Fi掉了帮我连回热点"])
    check("passes phone-hotspot-ready action without wake", "我手机热点开好了", "我手机热点开好了", ["我手机热点开好了"])
    check("passes personal-hotspot-switch action without wake", "帮我切到个人热点", "帮我切到个人热点", ["帮我切到个人热点"])
    check("passes vivo-hotspot-switch action without wake", "切到vivo热点", "切到vivo热点", ["切到vivo热点"])
    check("passes terse-hotspot-ready action without wake", "热点好了", "热点好了", ["热点好了"])
    check("passes negative hotspot action guard without wake", "别连我的热点", "别连我的热点", ["别连我的热点"])
    check("passes negative phone-hotspot guard without wake", "不要连手机热点", "不要连手机热点", ["不要连手机热点"])
    check("passes negative vivo-hotspot guard without wake", "别切到vivo热点", "别切到vivo热点", ["别切到vivo热点"])
    check(
        "passes guarded hotspot-status question without wake",
        "别连接热点，我只是问热点连上了吗",
        "别连接热点，我只是问热点连上了吗",
        ["别连接热点，我只是问热点连上了吗"],
    )
    check(
        "passes guarded phone-hotspot status question without wake",
        "别去连我手机，问一下热点状态",
        "别去连我手机，问一下热点状态",
        ["别去连我手机，问一下热点状态"],
    )
    check(
        "passes guarded vivo-priority question without wake",
        "不要切到vivo热点，只想知道vivo排第几",
        "不要切到vivo热点，只想知道vivo排第几",
        ["不要切到vivo热点，只想知道vivo排第几"],
    )
    check(
        "passes guarded current-wifi question without wake",
        "别连手机热点，问一下现在用的是哪个Wi-Fi",
        "别连手机热点，问一下现在用的是哪个Wi-Fi",
        ["别连手机热点，问一下现在用的是哪个Wi-Fi"],
    )
    check("passes current-hotspot-choice question without wake", "现在用的是哪个热点", "现在用的是哪个热点", ["现在用的是哪个热点"])
    check("passes both-hotspots-missing question without wake", "两个热点都找不到怎么办", "两个热点都找不到怎么办", ["两个热点都找不到怎么办"])
    check("blocks casual hotspot exhibit before wake", "热点艺术展", "", [])
    check("blocks home-network-class prose before wake", "家里网课很好看", "", [])
    check("blocks wifi-current-novel prose before wake", "Wi-Fi现在是什么小说", "", [])
    check("passes bedtime slow playlist request without wake", "睡前来点慢的", "睡前来点慢的", ["睡前来点慢的"])
    check("passes pressure-soft playlist request without wake", "压力有点大来点柔和的", "压力有点大来点柔和的", ["压力有点大来点柔和的"])
    check("passes focus-friendly playlist request without wake", "工作时来点不抢注意力的", "工作时来点不抢注意力的", ["工作时来点不抢注意力的"])
    check("passes current-song question without wake", "这首歌叫什么", "这首歌叫什么", ["这首歌叫什么"])
    check("passes now-playing question without wake", "现在放的是啥", "现在放的是啥", ["现在放的是啥"])
    check("passes casual current-song-name question without wake", "这首什么名字", "这首什么名字", ["这首什么名字"])
    check("passes current-this-song-artist question without wake", "现在这个歌谁唱的", "现在这个歌谁唱的", ["现在这个歌谁唱的"])
    check("passes current singing artist without wake", "这会儿谁在唱", "这会儿谁在唱", ["这会儿谁在唱"])
    check("passes current singing title without wake", "这会儿唱的是哪首啊", "这会儿唱的是哪首啊", ["这会儿唱的是哪首啊"])
    check("passes sound artist question without wake", "这声音是谁唱的", "这声音是谁唱的", ["这声音是谁唱的"])
    check("passes current-this-song-origin question without wake", "现在这个歌是哪儿来的", "现在这个歌是哪儿来的", ["现在这个歌是哪儿来的"])
    check("passes current-this-song-from-where question without wake", "现在这个歌从哪儿来", "现在这个歌从哪儿来", ["现在这个歌从哪儿来"])
    check("passes current-this-song-from-source question without wake", "现在这个歌来自哪里", "现在这个歌来自哪里", ["现在这个歌来自哪里"])
    check("passes current-this-song-where-from question without wake", "现在这个歌是哪里的", "现在这个歌是哪里的", ["现在这个歌是哪里的"])
    check("passes current-this-track-city-origin question without wake", "现在这首是哪座城来的", "现在这首是哪座城来的", ["现在这首是哪座城来的"])
    check("passes current-track-city-origin question without wake", "现在这首是哪座城市的歌", "现在这首是哪座城市的歌", ["现在这首是哪座城市的歌"])
    check("passes natural currently-playing which-song question without wake", "现在播的是哪首", "现在播的是哪首", ["现在播的是哪首"])
    check("passes terse current-song-title question without wake", "这首叫什么", "这首叫什么", ["这首叫什么"])
    check("passes casual recent-playing question without wake", "刚刚在播什么歌", "刚刚在播什么歌", ["刚刚在播什么歌"])
    check("passes quiet current-song-no-voice question without wake", "别出声告诉我现在播什么", "别出声告诉我现在播什么", ["别出声告诉我现在播什么"])
    check("passes current-listening-origin question without wake", "这会儿在听哪儿的歌", "这会儿在播放哪儿的歌", ["这会儿在播放哪儿的歌"])
    check("passes casual-current-song-artist question without wake", "这歌谁唱的", "这歌谁唱的", ["这歌谁唱的"])
    check("passes casual-current-title-recall question without wake", "这首什么歌来着", "这首什么歌来着", ["这首什么歌来着"])
    check("passes current-song-city-belongs question without wake", "这首歌属于哪座城", "这首歌属于哪座城", ["这首歌属于哪座城"])
    check("passes casual current-song-city-belongs question without wake", "这歌属于哪座城", "这歌属于哪座城", ["这歌属于哪座城"])
    check("passes current-song-locality check without wake", "这歌是不是这座城的", "这歌是不是这座城的", ["这歌是不是这座城的"])
    check("passes current-song-place-fit question without wake", "这首适合这个地方吗", "这首适合这个地方吗", ["这首适合这个地方吗"])
    check("passes place-first song-fit rationale without wake", "为什么这个城市用这首歌", "为什么这个城市用这首歌", ["为什么这个城市用这首歌"])
    check(
        "passes negative current-song query without wake",
        "别切歌，我只是问现在播什么歌",
        "别切歌，我只是问现在播什么歌",
        ["别切歌，我只是问现在播什么歌"],
    )
    check(
        "passes negative current-artist query without wake",
        "不要换歌，只想知道这首谁唱的",
        "不要换歌，只想知道这首谁唱的",
        ["不要换歌，只想知道这首谁唱的"],
    )
    check(
        "passes no-resume current-song query without wake",
        "别恢复播放，我只是问现在是哪首歌",
        "别恢复播放，我只是问现在是哪首歌",
        ["别恢复播放，我只是问现在是哪首歌"],
    )
    check(
        "passes terse no-resume current-song query without wake",
        "不要恢复播放，只问现在这首歌",
        "不要恢复播放，只问现在这首歌",
        ["不要恢复播放，只问现在这首歌"],
    )
    check(
        "passes no-audio current-song query without wake",
        "别开声音，只告诉我现在是什么歌",
        "别开声音，只告诉我现在是什么歌",
        ["别开声音，只告诉我现在是什么歌"],
    )
    check(
        "passes no-sound-current-title question without wake",
        "别开声音只告诉我这首叫什么",
        "别开声音只告诉我这首叫什么",
        ["别开声音只告诉我这首叫什么"],
    )
    check(
        "passes previous-track-no-replay-direct-title without wake",
        "刚才那首别重播只告诉我名字",
        "刚才那首别重播只告诉我名字",
        ["刚才那首别重播只告诉我名字"],
    )
    check(
        "passes no-previous current-song query without wake",
        "不要回上一首，只想知道刚才那首是什么",
        "不要回上一首，只想知道刚才那首是什么",
        ["不要回上一首，只想知道刚才那首是什么"],
    )
    check("passes lyric-meaning question without wake", "歌词什么意思", "歌词什么意思", ["歌词什么意思"])
    check("passes casual lyric-meaning question without wake", "歌词讲啥", "歌词讲啥", ["歌词讲啥"])
    check("passes lyric-story question without wake", "讲讲歌词", "讲讲歌词", ["讲讲歌词"])
    check("passes chorus-meaning question without wake", "副歌什么意思", "副歌什么意思", ["副歌什么意思"])
    check("passes casual chorus-meaning question without wake", "副歌讲啥", "副歌讲啥", ["副歌讲啥"])
    check("passes lyric-line-meaning question without wake", "这句歌词什么意思", "这句歌词什么意思", ["这句歌词什么意思"])
    check("passes casual lyric-line-meaning question without wake", "这句词讲啥", "这句词讲啥", ["这句词讲啥"])
    check("passes lyric-fragment-meaning question without wake", "这段词在讲什么", "这段词在讲什么", ["这段词在讲什么"])
    check("passes casual lyric-fragment-meaning question without wake", "这段词讲啥", "这段词讲啥", ["这段词讲啥"])
    check("passes casual sung-meaning question without wake", "这个歌唱的什么", "这个歌唱的什么", ["这个歌唱的什么"])
    check("passes spoken-meaning question without wake", "这首歌说的是什么", "这首歌说的是什么", ["这首歌说的是什么"])
    check("passes current-song-lyricist question without wake", "这首谁填词", "这首谁填词", ["这首谁填词"])
    check("blocks current-lyric chatter without wake", "现在这个歌词很好", "", [])
    check("blocks non-command listening chatter without wake", "现在听小说挺舒服", "", [])
    check("blocks title-recall contest chatter without wake", "这首什么歌来着比赛", "", [])
    check("blocks song-city-belongs novel chatter without wake", "这首歌属于哪座城小说", "", [])
    check("blocks casual song-city-belongs novel chatter without wake", "这歌属于哪座城小说", "", [])
    check("passes terse current-artist followup without wake", "谁唱的", "谁唱的", ["谁唱的"])
    check("passes recalled current-artist followup without wake", "谁唱的来着", "谁唱的来着", ["谁唱的来着"])
    check("passes recalled current-owner followup without wake", "谁的歌来着", "谁的歌来着", ["谁的歌来着"])
    check("passes terse current-title followup without wake", "歌名呢", "歌名呢", ["歌名呢"])
    check("passes casual current-artist followup without wake", "这谁唱的", "这谁唱的", ["这谁唱的"])
    check("passes casual current-owner followup without wake", "这是谁的歌", "这是谁的歌", ["这是谁的歌"])
    check("passes short current-owner followup without wake", "这首是谁的歌", "这首是谁的歌", ["这首是谁的歌"])
    check("passes casual song-owner followup without wake", "这歌是谁的", "这歌是谁的", ["这歌是谁的"])
    check("passes demonstrative current-origin followup without wake", "这是哪儿的歌", "这是哪儿的歌", ["这是哪儿的歌"])
    check("passes short current-origin followup without wake", "这首哪儿的歌", "这首哪儿的歌", ["这首哪儿的歌"])
    check("passes current-artist question without wake", "现在这首谁唱的", "现在这首谁唱的", ["现在这首谁唱的"])
    check("passes this-moment current-song question without wake", "这会儿是哪首歌", "这会儿是哪首歌", ["这会儿是哪首歌"])
    check("passes currently-playing-which-song question without wake", "正在播哪首歌", "正在播哪首歌", ["正在播哪首歌"])
    check("passes current-station-casual-which-stop without wake", "这会儿是哪一站来着", "这会儿是哪一站来着", ["这会儿是哪一站来着"])
    check("passes current-station-name question without wake", "当前这站叫什么名字", "当前这站叫什么名字", ["当前这站叫什么名字"])
    check("passes previous-track casual-recall question without wake", "刚才那首什么来着", "刚才那首什么来着", ["刚才那首什么来着"])
    check("passes previous-track terse-title question without wake", "上一首叫啥", "上一首叫啥", ["上一首叫啥"])
    check("passes previous-track-stop-origin-casual without wake", "刚才那首归哪站来着", "刚才那首归哪站来着", ["刚才那首归哪站来着"])
    check("passes previous-track-city-origin-terse without wake", "上一首是哪座城的", "上一首是哪座城的", ["上一首是哪座城的"])
    check("passes previous-track-from-place-terse without wake", "前面那首来自哪里", "前面那首来自哪里", ["前面那首来自哪里"])
    check("passes previous-rang artist question without wake", "刚才响起来的是谁唱的", "刚才响起来的是谁唱的", ["刚才响起来的是谁唱的"])
    check("passes previous-rang title question without wake", "刚刚响起来的是哪首歌", "刚刚响起来的是哪首歌", ["刚刚响起来的是哪首歌"])
    check("passes previous-heard artist question without wake", "刚才听到的是谁唱的", "刚才听到的是谁唱的", ["刚才听到的是谁唱的"])
    check(
        "passes negative previous-track query without wake",
        "别回上一首，我只是问上一首是什么",
        "别回上一首，我只是问上一首是什么",
        ["别回上一首，我只是问上一首是什么"],
    )
    check(
        "passes short negative previous-track query without wake",
        "先别倒回去，我问上个啥",
        "先别倒回去，我问上个啥",
        ["先别倒回去，我问上个啥"],
    )
    check("passes previous-track earlier-artist question without wake", "前面那首谁唱的", "前面那首谁唱的", ["前面那首谁唱的"])
    check("passes current-song-casual-origin question without wake", "这首歌哪儿来的", "这首歌哪儿来的", ["这首歌哪儿来的"])
    check(
        "passes current-song-origin-city question without wake",
        "这首歌来自哪座城市",
        "这首歌来自哪座城市",
        ["这首歌来自哪座城市"],
    )
    check(
        "passes plain current-song city origin without wake",
        "这首从哪座城市来的",
        "这首从哪座城市来的",
        ["这首从哪座城市来的"],
    )
    check(
        "passes current-song-city-relation-short question without wake",
        "这首歌跟这座城有什么关系",
        "这首歌跟这座城有什么关系",
        ["这首歌跟这座城有什么关系"],
    )
    check(
        "passes current-song-here-fit question without wake",
        "这歌为什么适合这里",
        "这歌为什么适合这里",
        ["这歌为什么适合这里"],
    )
    check(
        "passes casual current-stop song-fit question without wake",
        "这歌为啥适合这一站",
        "这歌为啥适合这一站",
        ["这歌为啥适合这一站"],
    )
    check(
        "passes song-city-feeling question without wake",
        "这歌有这座城的感觉吗",
        "这歌有这座城的感觉吗",
        ["这歌有这座城的感觉吗"],
    )
    check(
        "passes song-city-vibe-fit question without wake",
        "这歌和这座城对味吗",
        "这歌和这座城对味吗",
        ["这歌和这座城对味吗"],
    )
    check(
        "passes current-station-song-reason question without wake",
        "现在这站为什么选它",
        "现在这站为什么选它",
        ["现在这站为什么选它"],
    )
    check(
        "passes current-song sunset relation question without wake",
        "这首歌和这场日落有什么关系",
        "这首歌和这场日落有什么关系",
        ["这首歌和这场日落有什么关系"],
    )
    check(
        "passes current-song sunset-fit question without wake",
        "这歌适合现在这场日落吗",
        "这歌适合现在这场日落吗",
        ["这歌适合现在这场日落吗"],
    )
    check(
        "passes current-song current-sunset relation question without wake",
        "这首跟当前日落有啥联系",
        "这首跟当前日落有啥联系",
        ["这首跟当前日落有啥联系"],
    )
    check(
        "passes current-song current-sunset-fit question without wake",
        "这歌配当前日落吗",
        "这歌配当前日落吗",
        ["这歌配当前日落吗"],
    )
    check(
        "passes previous-song previous-stop relation question without wake",
        "刚才那首跟上一站有关系吗",
        "刚才那首跟上一站有关系吗",
        ["刚才那首跟上一站有关系吗"],
    )
    check("passes current-song stop-origin question without wake", "这首归哪一站", "这首归哪一站", ["这首归哪一站"])
    check("passes terse next-song question without wake", "下首呢", "下首呢", ["下首呢"])
    check("passes bare next-song question without wake", "下一个呢", "下一个呢", ["下一个呢"])
    check("passes bare next-song-what question without wake", "下一个是什么", "下一个是什么", ["下一个是什么"])
    check("passes bare next-song-short question without wake", "下一个啥", "下一个啥", ["下一个啥"])
    check(
        "passes negative next-song query without wake",
        "别切歌，我只是问下一首是什么",
        "别切歌，我只是问下一首是什么",
        ["别切歌，我只是问下一首是什么"],
    )
    check(
        "passes negative next-song-artist query without wake",
        "不要换歌，只想知道下一首谁唱的",
        "不要换歌，只想知道下一首谁唱的",
        ["不要换歌，只想知道下一首谁唱的"],
    )
    check(
        "passes no-cut next-song station relation without wake",
        "不要切到下一首，只问下一首和下一站有什么关系",
        "不要切到下一首，只问下一首和下一站有什么关系",
        ["不要切到下一首，只问下一首和下一站有什么关系"],
    )
    check(
        "passes next-song station relation without wake",
        "下一首和下一站有什么关系",
        "下一首和下一站有什么关系",
        ["下一首和下一站有什么关系"],
    )
    check(
        "passes next-city playlist reason without wake",
        "下一站歌单为什么这样排",
        "下一站歌单为什么这样排",
        ["下一站歌单为什么这样排"],
    )
    check(
        "passes next-city song fit reason without wake",
        "下个城市这些歌为什么适合那里",
        "下个城市这些歌为什么适合那里",
        ["下个城市这些歌为什么适合那里"],
    )
    check("passes next-song-arrival question without wake", "下一首啥时候来", "下一首啥时候来", ["下一首啥时候来"])
    check("passes terse next-song-place-origin question without wake", "下首是哪儿的", "下首是哪儿的", ["下首是哪儿的"])
    check("passes terse next-song-from-place question without wake", "下首从哪儿来", "下首从哪儿来", ["下首从哪儿来"])
    check("passes terse next-song-from-where question without wake", "下首来自哪里", "下首来自哪里", ["下首来自哪里"])
    check("passes terse next-song-place-source question without wake", "下首是什么地方来的", "下首是什么地方来的", ["下首是什么地方来的"])
    check("passes later-song-count question without wake", "待会儿还有几首", "待会儿还有几首", ["待会儿还有几首"])
    check("passes later-that-song-arrival question without wake", "待会儿那首什么时候到", "待会儿那首什么时候到", ["待会儿那首什么时候到"])
    check("passes casual-later-that-song-arrival question without wake", "待会那首啥时候来", "待会那首啥时候来", ["待会那首啥时候来"])
    check("passes future-that-song-artist question without wake", "后面那首是谁唱的", "后面那首是谁唱的", ["后面那首是谁唱的"])
    check("passes future-that-song-origin question without wake", "后面那首是哪儿的", "后面那首是哪儿的", ["后面那首是哪儿的"])
    check("passes later-that-song-from-place question without wake", "后面那首从哪儿来", "后面那首从哪儿来", ["后面那首从哪儿来"])
    check("passes later-that-song-place-source question without wake", "后面那首是什么地方来的", "后面那首是什么地方来的", ["后面那首是什么地方来的"])
    check("passes later-that-song-source question without wake", "待会那首从哪儿来", "待会那首从哪儿来", ["待会那首从哪儿来"])
    check("passes pending-that-song-place-source question without wake", "待会那首是什么地方来的", "待会那首是什么地方来的", ["待会那首是什么地方来的"])
    check("passes later-specific-song question without wake", "等会儿会放哪首歌", "等会儿会放哪首歌", ["等会儿会放哪首歌"])
    check("passes later-city-broadcast question without wake", "等会儿会播哪座城", "等会儿会播哪座城", ["等会儿会播哪座城"])
    check("passes next-song-origin question without wake", "接下来那首是哪儿的", "接下来那首是哪儿的", ["接下来那首是哪儿的"])
    check("passes casual playlist-anything question without wake", "歌单还有啥", "歌单还有啥", ["歌单还有啥"])
    check("passes casual playlist-count question without wake", "歌单还有几首", "歌单还有几首", ["歌单还有几首"])
    check("passes direct remaining-song-count question without wake", "还剩多少首歌", "还剩多少首歌", ["还剩多少首歌"])
    check("passes direct more-song-count question without wake", "还有几首歌", "还有几首歌", ["还有几首歌"])
    check("blocks ambiguous remaining-count chatter without wake", "还有几首", "", [])
    check("passes current-city question without wake", "现在在哪座城市", "现在在哪座城市", ["现在在哪座城市"])
    check("passes short current-city question without wake", "现在在哪座城", "现在在哪座城", ["现在在哪座城"])
    check("passes casual-current-city-where question without wake", "现在这座城是哪儿", "现在这座城是哪儿", ["现在这座城是哪儿"])
    check("blocks casual-current-city contest chatter without wake", "现在这座城是哪儿比赛", "", [])
    check("passes explicit current-city where question without wake", "当前城市是哪里", "当前城市是哪里", ["当前城市是哪里"])
    check(
        "passes no-continue current-city query without wake",
        "不要继续播放，只想知道当前城市",
        "不要继续播放，只想知道当前城市",
        ["不要继续播放，只想知道当前城市"],
    )
    check(
        "passes no-open-radio current-city query without wake",
        "不要打开电台，只想知道现在是哪座城",
        "不要打开电台，只想知道现在是哪座城",
        ["不要打开电台，只想知道现在是哪座城"],
    )
    check("passes where-are-we question without wake", "咱们到哪儿了", "咱们到哪儿了", ["咱们到哪儿了"])
    check("passes current-stop-index no-verb question without wake", "现在第几站", "现在第几站", ["现在第几站"])
    check("passes current-stop-index current-prefix question without wake", "当前第几站", "当前第几站", ["当前第几站"])
    check("passes current-stop-name explicit question without wake", "现在站名是什么", "现在站名是什么", ["现在站名是什么"])
    check("passes current-city-name explicit question without wake", "现在城市名字是什么", "现在城市名字是什么", ["现在城市名字是什么"])
    check("passes current-stop-this-name question without wake", "这站名字是什么", "这站名字是什么", ["这站名字是什么"])
    check("passes subjectless current-stop-index question without wake", "第几站了", "第几站了", ["第几站了"])
    check("passes subjectless walking-stop-index question without wake", "走到第几站了", "走到第几站了", ["走到第几站了"])
    check("passes subjectless arrived-stop-index question without wake", "到第几站了", "到第几站了", ["到第几站了"])
    check("passes trip-arrived-stop-index question without wake", "这趟到第几站了", "这趟到第几站了", ["这趟到第几站了"])
    check("passes here-city question without wake", "这里是哪座城市", "这里是哪座城市", ["这里是哪座城市"])
    check("passes sunset-arrival current-place question without wake", "追到哪场日落了", "追到哪场日落了", ["追到哪场日落了"])
    check("passes current-sunset-which question without wake", "现在追的是哪场日落", "现在追的是哪场日落", ["现在追的是哪场日落"])
    check("passes current-sunset-turn question without wake", "这会儿轮到哪场日落", "这会儿轮到哪场日落", ["这会儿轮到哪场日落"])
    check("passes sunset-landing current-city question without wake", "现在落在哪座城", "现在落在哪座城", ["现在落在哪座城"])
    check("passes we-current-sunset-city question without wake", "咱们现在落在哪座城", "咱们现在落在哪座城", ["咱们现在落在哪座城"])
    check("passes current-sunset-city question without wake", "这场日落是哪座城", "这场日落是哪座城", ["这场日落是哪座城"])
    check("passes natural current-sunset-city question without wake", "这是哪个城市的日落", "这是哪个城市的日落", ["这是哪个城市的日落"])
    check("passes current-world-side question without wake", "现在在地球哪边", "现在在地球哪边", ["现在在地球哪边"])
    check("passes route-plan question without wake", "今天电台怎么走", "今天电台怎么走", ["今天电台怎么走"])
    check("passes route-later-plan question without wake", "后面路线怎么安排", "后面路线怎么安排", ["后面路线怎么安排"])
    check("passes route-pass-places question without wake", "今天还会经过哪些地方", "今天还会经过哪些地方", ["今天还会经过哪些地方"])
    check("passes route-where-pass question without wake", "今天这趟会经过哪里", "今天这趟会经过哪里", ["今天这趟会经过哪里"])
    check("passes route-later-station question without wake", "待会儿到哪站", "待会儿到哪站", ["待会儿到哪站"])
    check("passes route-next-stop-name question without wake", "下一站叫什么来着", "下一站叫什么来着", ["下一站叫什么来着"])
    check("passes route-this-way-pass-cities question without wake", "这一路还要经过哪些城市", "这一路还要经过哪些城市", ["这一路还要经过哪些城市"])
    check("passes route-duration question without wake", "这趟还要走多久", "这趟还要走多久", ["这趟还要走多久"])
    check("passes route-end-eta question without wake", "今天这趟还有多久结束", "今天这趟还有多久结束", ["今天这趟还有多久结束"])
    check("passes route-rationale question without wake", "这趟为什么这么安排", "这趟为什么这么安排", ["这趟为什么这么安排"])
    check("passes today-route-rationale question without wake", "今天为什么这么走", "今天为什么这么走", ["今天为什么这么走"])
    check("passes named route-rationale question without wake", "为什么今天先去东京", "为什么今天先去东京", ["为什么今天先去东京"])
    check("passes current-city route-rationale question without wake", "为什么今天是这座城", "为什么今天是这座城", ["为什么今天是这座城"])
    check("passes natural current-city rationale without wake", "为什么是这座城市", "为什么是这座城市", ["为什么是这座城市"])
    check("passes current-stop route-position rationale without wake", "这站为什么排在这里", "这站为什么排在这里", ["这站为什么排在这里"])
    check("passes current-stop here-rationale without wake", "现在这站为什么在这儿", "现在这站为什么在这儿", ["现在这站为什么在这儿"])
    check("passes current-stop identity-rationale without wake", "这一站为什么是这里", "这一站为什么是这里", ["这一站为什么是这里"])
    check("passes current named-city arrival rationale without wake", "为什么现在到东京", "为什么现在到东京", ["为什么现在到东京"])
    check("passes named-city route-position rationale without wake", "为什么东京排在这里", "为什么东京排在这里", ["为什么东京排在这里"])
    check("passes front-loaded named-city route rationale without wake", "这趟为什么把东京放前面", "这趟为什么把东京放前面", ["这趟为什么把东京放前面"])
    check("passes named route-presence question without wake", "今天会去东京吗", "今天会去东京吗", ["今天会去东京吗"])
    check("passes named route-passby question without wake", "后面会路过东京吗", "后面会路过东京吗", ["后面会路过东京吗"])
    check("passes named route-membership question without wake", "东京在今天路线里吗", "东京在今天路线里吗", ["东京在今天路线里吗"])
    check("passes named route-whether question without wake", "今天会不会去东京", "今天会不会去东京", ["今天会不会去东京"])
    check("passes named route-whether-passby question without wake", "后面会不会路过东京啊", "后面会不会路过东京啊", ["后面会不会路过东京啊"])
    check("passes named route-has-city question without wake", "这趟有没有东京", "这趟有没有东京", ["这趟有没有东京"])
    check("passes route-has-city question without wake", "路线里有没有东京", "路线里有没有东京", ["路线里有没有东京"])
    check("passes named route-trip-passby question without wake", "这趟会经过东京吗", "这趟会经过东京吗", ["这趟会经过东京吗"])
    check("passes named route-today-passby question without wake", "今天会不会路过东京", "今天会不会路过东京", ["今天会不会路过东京"])
    check("passes named route-later-presence question without wake", "后面有没有东京", "后面有没有东京", ["后面有没有东京"])
    check("passes named route-later-still-presence question without wake", "后面是不是还有东京", "后面是不是还有东京", ["后面是不是还有东京"])
    check("passes next-city named question without wake", "下个城市是不是东京", "下个城市是不是东京", ["下个城市是不是东京"])
    check("passes named city eta question without wake", "东京什么时候到", "东京什么时候到", ["东京什么时候到"])
    check("passes named city remaining-time question without wake", "还有多久到东京", "还有多久到东京", ["还有多久到东京"])
    check("passes named city route-order question without wake", "东京排第几站", "东京排第几站", ["东京排第几站"])
    check("passes named sunset chase question without wake", "这趟还追不追东京的日落", "这趟还追不追东京的日落", ["这趟还追不追东京的日落"])
    check("passes subjectless next-sunset-place question without wake", "下一场在哪儿", "下一场在哪儿", ["下一场在哪儿"])
    check("passes named-city recommendation question without wake", "东京适合什么歌", "东京适合什么歌", ["东京适合什么歌"])
    check("passes named-city matching-songs question without wake", "东京配什么歌", "东京配什么歌", ["东京配什么歌"])
    check("passes named-city suggested-songs question without wake", "东京推荐什么歌", "东京推荐什么歌", ["东京推荐什么歌"])
    check("passes named-city recommend-several-songs question without wake", "推荐几首东京的歌", "推荐几首东京的歌", ["推荐几首东京的歌"])
    check("passes named-city quiet-songs request without wake", "东京来几首安静的歌", "东京来几首安静的歌", ["东京来几首安静的歌"])
    check(
        "passes negative named-city songs query without wake",
        "别放东京了，我只是问东京有哪些歌",
        "别放东京了，我只是问东京有哪些歌",
        ["别放东京了，我只是问东京有哪些歌"],
    )
    check(
        "passes negative named-city songs query with go guard without wake",
        "不要去东京，只想知道东京有什么歌",
        "不要去东京，只想知道东京有什么歌",
        ["不要去东京，只想知道东京有什么歌"],
    )
    check(
        "passes negative named-city story query without wake",
        "别放东京了，我只是问东京有什么故事",
        "别放东京了，我只是问东京有什么故事",
        ["别放东京了，我只是问东京有什么故事"],
    )
    check(
        "passes negative named-city story query with go guard without wake",
        "不要去东京，只想知道东京什么来头",
        "不要去东京，只想知道东京什么来头",
        ["不要去东京，只想知道东京什么来头"],
    )
    check("passes next-stop-arrival-time question without wake", "什么时候到下一站", "什么时候到下一站", ["什么时候到下一站"])
    check("passes next-sunset-eta question without wake", "下个日落还有多久", "下个日落还有多久", ["下个日落还有多久"])
    check("passes next-city-eta-inverted question without wake", "还有多久到下个城市", "还有多久到下个城市", ["还有多久到下个城市"])
    check("passes remaining-cities question without wake", "后面还有哪些城市", "后面还有哪些城市", ["后面还有哪些城市"])
    check("passes route remaining-city-count question without wake", "这趟还剩几座城", "这趟还剩几座城", ["这趟还剩几座城"])
    check("passes route-path remaining-city-count question without wake", "这一路还剩几座城", "这一路还剩几座城", ["这一路还剩几座城"])
    check("passes later remaining-cities terse question without wake", "后面还剩哪些城", "后面还剩哪些城", ["后面还剩哪些城"])
    check("passes next pass-by city-count question without wake", "接下来还路过哪几座城", "接下来还路过哪几座城", ["接下来还路过哪几座城"])
    check("passes colloquial remaining-stops question without wake", "后面几站有哪些", "后面几站有哪些", ["后面几站有哪些"])
    check("passes terse-remaining-stops question without wake", "还剩几站", "还剩几站", ["还剩几站"])
    check("passes specific-remaining-stops question without wake", "剩下还有哪几站", "剩下还有哪几站", ["剩下还有哪几站"])
    check("passes later-place question without wake", "等会儿去哪儿", "等会儿去哪儿", ["等会儿去哪儿"])
    check("passes later-city question without wake", "等会儿会到哪座城", "等会儿会到哪座城", ["等会儿会到哪座城"])
    check("passes trip-winding-later question without wake", "这趟电台后面还绕哪儿", "这趟电台后面还绕哪儿", ["这趟电台后面还绕哪儿"])
    check("passes later-land-cities question without wake", "后面还会落到哪几座城", "后面还会落到哪几座城", ["后面还会落到哪几座城"])
    check("passes second-half-route question without wake", "后半程还去哪儿", "后半程还去哪儿", ["后半程还去哪儿"])
    check("passes today terse route-place question without wake", "今天还去哪儿", "今天还去哪儿", ["今天还去哪儿"])
    check("passes later-route-plan question without wake", "等会儿路线怎么走", "等会儿路线怎么走", ["等会儿路线怎么走"])
    check("passes after-place question without wake", "之后去哪儿", "之后去哪儿", ["之后去哪儿"])
    check("passes further-sunset-count route question without wake", "再往后还有几场日落", "再往后还有几场日落", ["再往后还有几场日落"])
    check("passes later-sunset-count route question without wake", "后面还有几个日落", "后面还有几个日落", ["后面还有几个日落"])
    check(
        "passes next-sunset-count route question without wake",
        "接下来还有几个日落",
        "接下来还有几个日落",
        ["接下来还有几个日落"],
    )
    check(
        "passes later-remaining-sunset-count route question without wake",
        "后面还剩多少个日落",
        "后面还剩多少个日落",
        ["后面还剩多少个日落"],
    )
    check("passes next-stop question without wake", "下一站是哪", "下一站是哪", ["下一站是哪"])
    check("passes terse next-stop followup without wake", "下一站呢", "下一站呢", ["下一站呢"])
    check("passes terse next-city followup without wake", "下一个城市呢", "下一个城市呢", ["下一个城市呢"])
    check("passes terse previous-stop followup without wake", "上站呢", "上站呢", ["上站呢"])
    check("passes next-stop story question without wake", "下一站有什么故事", "下一站有什么故事", ["下一站有什么故事"])
    check("passes previous-stop story question without wake", "上一站有什么故事", "上一站有什么故事", ["上一站有什么故事"])
    check(
        "passes negative next-stop songs question without wake",
        "别去下一站，我只是问下一站有什么歌",
        "别去下一站，我只是问下一站有什么歌",
        ["别去下一站，我只是问下一站有什么歌"],
    )
    check(
        "passes negative next-city songs question without wake",
        "不要跳到下个城市，只想知道下个城市放啥",
        "不要跳到下个城市，只想知道下个城市放啥",
        ["不要跳到下个城市，只想知道下个城市放啥"],
    )
    check("passes negative next-city action without wake", "别去下一站", "别去下一站", ["别去下一站"])
    check("passes negative previous-city action without wake", "别回上一站", "别回上一站", ["别回上一站"])
    check("passes negative next-city switch action without wake", "不要换到下个城市", "不要换到下个城市", ["不要换到下个城市"])
    check(
        "passes negative next-stop story question without wake",
        "别去下一站，我只是问下一站有什么故事",
        "别去下一站，我只是问下一站有什么故事",
        ["别去下一站，我只是问下一站有什么故事"],
    )
    check(
        "passes negative next-city story question without wake",
        "不要跳到下个城市，只想知道下个城市什么来头",
        "不要跳到下个城市，只想知道下个城市什么来头",
        ["不要跳到下个城市，只想知道下个城市什么来头"],
    )
    check(
        "passes negative next-stop route-plan question without wake",
        "不要切到下一站，只问后面路线怎么走",
        "不要切到下一站，只问后面路线怎么走",
        ["不要切到下一站，只问后面路线怎么走"],
    )
    check(
        "passes negative next-city route-plan question without wake",
        "别跳到下个城市，只问路线后面怎么安排",
        "别跳到下个城市，只问路线后面怎么安排",
        ["别跳到下个城市，只问路线后面怎么安排"],
    )
    check(
        "passes negative switch-city remaining-route question without wake",
        "别切城，只问今天电台还剩几站",
        "别切城，只问今天电台还剩几站",
        ["别切城，只问今天电台还剩几站"],
    )
    check(
        "passes negative previous-stop name question without wake",
        "不要回上一站，只问上一站叫什么",
        "不要回上一站，只问上一站叫什么",
        ["不要回上一站，只问上一站叫什么"],
    )
    check(
        "passes negative previous-stop where question without wake",
        "别切城，只问刚才那站是哪",
        "别切城，只问刚才那站是哪",
        ["别切城，只问刚才那站是哪"],
    )
    check(
        "passes negative named-city order question without wake",
        "别放东京，只问东京排第几站",
        "别放东京，只问东京排第几站",
        ["别放东京，只问东京排第几站"],
    )
    check(
        "passes negative named-city eta question without wake",
        "不要去东京，只想知道东京什么时候到",
        "不要去东京，只想知道东京什么时候到",
        ["不要去东京，只想知道东京什么时候到"],
    )
    check(
        "passes quiet detour route question without wake",
        "只写屏告诉我这趟后面还绕哪几座城",
        "只写屏告诉我这趟后面还绕哪几座城",
        ["只写屏告诉我这趟后面还绕哪几座城"],
    )
    check(
        "passes negative route-rationale question without wake",
        "别停主线，问一下这趟为什么这么排",
        "别停主线，问一下这趟为什么这么排",
        ["别停主线，问一下这趟为什么这么排"],
    )
    check(
        "passes negative next-stop question without wake",
        "我只是想看看下一站，别跳过去",
        "我只是想看看下一站，别跳过去",
        ["我只是想看看下一站，别跳过去"],
    )
    check(
        "passes negative next-city question without wake",
        "我只是问下个城市，不要切过去",
        "我只是问下个城市，不要切过去",
        ["我只是问下个城市，不要切过去"],
    )
    check(
        "passes negative previous-stop question without wake",
        "只是问上一站别跳回去",
        "只是问上一站别跳回去",
        ["只是问上一站别跳回去"],
    )
    check(
        "passes negative previous-stop songs question without wake",
        "别回上一站，我只是问上一站有什么歌",
        "别回上一站，我只是问上一站有什么歌",
        ["别回上一站，我只是问上一站有什么歌"],
    )
    check(
        "passes negative previous-city songs question without wake",
        "不要跳回上个城市，只想知道上个城市放啥",
        "不要跳回上个城市，只想知道上个城市放啥",
        ["不要跳回上个城市，只想知道上个城市放啥"],
    )
    check(
        "passes negative previous-stop story question without wake",
        "别回上一站，我只是问上一站有什么故事",
        "别回上一站，我只是问上一站有什么故事",
        ["别回上一站，我只是问上一站有什么故事"],
    )
    check(
        "passes negative previous-city story question without wake",
        "不要跳回上个城市，只想知道上个城市什么来头",
        "不要跳回上个城市，只想知道上个城市什么来头",
        ["不要跳回上个城市，只想知道上个城市什么来头"],
    )
    check("passes next-stop-eta question without wake", "下一站还有多久", "下一站还有多久", ["下一站还有多久"])
    check("passes target-first next-stop-arrival question without wake", "下一站什么时候到", "下一站什么时候到", ["下一站什么时候到"])
    check("passes target-first short-next-stop-arrival question without wake", "下站什么时候到", "下站什么时候到", ["下站什么时候到"])
    check("passes compact short-next-stop-arrival question without wake", "下站多久到", "下站多久到", ["下站多久到"])
    check("passes next-stop-playlist-preview question without wake", "下一站会放什么", "下一站会放什么", ["下一站会放什么"])
    check("passes here-songs question without wake", "这里有什么歌", "这里有什么歌", ["这里有什么歌"])
    check("passes show-playlist request without wake", "给我看看歌单", "给我看看歌单", ["给我看看歌单"])
    check("passes current-station-playlist-show request without wake", "这站歌单给我看看", "这站歌单给我看看", ["这站歌单给我看看"])
    check("passes current-station-playlist-name question without wake", "现在这站的歌单是什么", "现在这站的歌单是什么", ["现在这站的歌单是什么"])
    check("passes playlist-next-track question without wake", "歌单里下一首是什么", "歌单里下一首是什么", ["歌单里下一首是什么"])
    check("passes playlist-upcoming question without wake", "这条歌单接下来有什么", "这条歌单接下来有什么", ["这条歌单接下来有什么"])
    check("passes current-playlist remaining-count without wake", "现在歌单还剩多少首", "现在歌单还剩多少首", ["现在歌单还剩多少首"])
    check("passes current-city-more-listening-casual without wake", "这座城还有啥能听", "这座城还有啥能听", ["这座城还有啥能听"])
    check("passes current-station-remaining-songs-casual without wake", "这站剩哪些歌", "这站剩哪些歌", ["这站剩哪些歌"])
    check("passes current-stop-more-songs question without wake", "这站还能听啥", "这站还能听啥", ["这站还能听啥"])
    check("passes current-stop-more-specific-songs question without wake", "这站还能听什么歌", "这站还能听什么歌", ["这站还能听什么歌"])
    check("passes current-stop-which-songs question without wake", "这站还有哪些歌", "这站还有哪些歌", ["这站还有哪些歌"])
    check("passes current-stop-remaining-which-songs question without wake", "这站还剩哪些歌", "这站还剩哪些歌", ["这站还剩哪些歌"])
    check("passes current-stop-playable-which-songs question without wake", "这站还能播哪些歌", "这站还能播哪些歌", ["这站还能播哪些歌"])
    check("passes current-stop-playable-generic question without wake", "这站还有什么能播", "这站还有什么能播", ["这站还有什么能播"])
    check("passes current-city-which-songs question without wake", "这座城还有哪些歌", "这座城还有哪些歌", ["这座城还有哪些歌"])
    check("passes current-city-remaining-what-songs question without wake", "这座城还剩什么歌", "这座城还剩什么歌", ["这座城还剩什么歌"])
    check("passes current-city-more-songs question without wake", "这座城还能放啥", "这座城还能放啥", ["这座城还能放啥"])
    check("passes current-sunset more-songs question without wake", "这场日落还有什么歌", "这场日落还有什么歌", ["这场日落还有什么歌"])
    check("passes soon-song-order question without wake", "等会儿歌怎么排", "等会儿歌怎么排", ["等会儿歌怎么排"])
    check("passes playlist-backhalf slang order question without wake", "歌单后面咋排的", "歌单后面咋排的", ["歌单后面咋排的"])
    check("passes next-playlist-route question without wake", "接下来歌单怎么走", "接下来歌单怎么走", ["接下来歌单怎么走"])
    check("passes today-song-order question without wake", "今天歌怎么排的", "今天歌怎么排的", ["今天歌怎么排的"])
    check("passes today-playlist-order question without wake", "今天歌单怎么排", "今天歌单怎么排", ["今天歌单怎么排"])
    check("passes soon-more-songs question without wake", "等下还有啥歌", "等下还有啥歌", ["等下还有啥歌"])
    check("passes current-song story request without wake", "讲讲这首歌的故事", "讲讲这首歌的故事", ["讲讲这首歌的故事"])
    check("passes no-replay previous-song station relation without wake", "不要重播刚才那首，只问它和上一站有什么关系", "不要重播刚才那首，只问它和上一站有什么关系", ["不要重播刚才那首，只问它和上一站有什么关系"])
    check("passes current-sunset playlist question without wake", "当前日落歌单里有什么", "当前日落歌单里有什么", ["当前日落歌单里有什么"])
    check("passes current-sunset available-listening question without wake", "这场日落还能听啥", "这场日落还能听啥", ["这场日落还能听啥"])
    check("passes current-sunset song-count question without wake", "这场日落还有几首歌", "这场日落还有几首歌", ["这场日落还有几首歌"])
    check("passes current-city remaining-song-count question without wake", "这个城市还剩几首", "这个城市还剩几首", ["这个城市还剩几首"])
    check("passes here remaining-listening-count question without wake", "这里还能听几首", "这里还能听几首", ["这里还能听几首"])
    check("passes later-songs question without wake", "后面还有什么歌", "后面还有什么歌", ["后面还有什么歌"])
    check("passes after-songs question without wake", "之后还有什么曲子", "之后还有什么曲子", ["之后还有什么曲子"])
    check("passes later-song-count question without wake", "待会还剩几首", "待会还剩几首", ["待会还剩几首"])
    check("passes city-story question without wake", "讲讲这座城市", "讲讲这座城市", ["讲讲这座城市"])
    check("passes current-city-story-now question without wake", "讲讲现在这座城", "讲讲现在这座城", ["讲讲现在这座城"])
    check("passes current-stop-story-casual question without wake", "讲讲这站的故事", "讲讲这站的故事", ["讲讲这站的故事"])
    check("passes current-sunset-story question without wake", "这场日落有什么故事", "这场日落有什么故事", ["这场日落有什么故事"])
    check("passes no-cut-current-city-story question without wake", "别切城只讲讲当前这座城", "别切城只讲讲当前这座城", ["别切城只讲讲当前这座城"])
    check("passes demonstrative-city-story question without wake", "这个城市有什么故事", "这个城市有什么故事", ["这个城市有什么故事"])
    check("passes no-play current-city-story question without wake", "不要开始播放，只问这个城市有什么来头", "不要开始播放，只问这个城市有什么来头", ["不要开始播放，只问这个城市有什么来头"])
    check("passes demonstrative-place-story question without wake", "讲讲这个地方", "讲讲这个地方", ["讲讲这个地方"])
    check("passes casual-city-story question without wake", "这城有啥故事", "这城有啥故事", ["这城有啥故事"])
    check("passes city-background question without wake", "这里什么来头", "这里什么来头", ["这里什么来头"])
    check("passes current-sunset story question without wake", "讲讲这场日落", "讲讲这场日落", ["讲讲这场日落"])
    check("passes current-city-sunset-radio-reason question without wake", "这座城为什么在日落电台里", "这座城为什么在日落电台里", ["这座城为什么在日落电台里"])
    check("blocks current-city-radio-reason ad chatter without wake", "这座城为什么在日落电台里广告", "", [])
    check("passes current-sunset origin question without wake", "这场日落什么来头", "这场日落什么来头", ["这场日落什么来头"])
    check("passes current-sunset casual story question without wake", "当前日落有啥故事", "当前日落有啥故事", ["当前日落有啥故事"])
    check("passes current-sunset feeling question without wake", "这场日落是什么感觉", "这场日落是什么感觉", ["这场日落是什么感觉"])
    check("passes no-sound status question without wake", "为什么没声音", "为什么没声音", ["为什么没声音"])
    check("passes no-voice-reason status question without wake", "为什么你不出声", "为什么你不出声", ["为什么你不出声"])
    check("passes sound-off status question without wake", "声音关了吗", "声音关了吗", ["声音关了吗"])
    check("passes audio-mode status question without wake", "现在是什么声音模式", "现在是什么声音模式", ["现在是什么声音模式"])
    check("passes quiet-mode status question without wake", "现在是安静模式吗", "现在是安静模式吗", ["现在是安静模式吗"])
    check("passes current-playing-state question without wake", "现在有没有在播放", "现在有没有在播放", ["现在有没有在播放"])
    check("passes still-playing-state question without wake", "现在是不是还在播", "现在是不是还在播", ["现在是不是还在播"])
    check("passes radio-open-state question without wake", "电台现在开着吗", "电台现在开着吗", ["电台现在开着吗"])
    check("passes music-stopped-state question without wake", "音乐是不是停了", "音乐是不是停了", ["音乐是不是停了"])
    check("passes pause-or-play-state question without wake", "现在是暂停还是播放", "现在是暂停还是播放", ["现在是暂停还是播放"])
    check("passes current-sound-state question without wake", "现在有声音吗", "现在有声音吗", ["现在有声音吗"])
    check("passes guarded-current-sound-state question without wake", "别开声音只问现在有没有声音", "别开声音只问现在有没有声音", ["别开声音只问现在有没有声音"])
    check("passes guarded-playing-state question without wake", "别播放只问现在是不是在播", "别播放只问现在是不是在播", ["别播放只问现在是不是在播"])
    check("passes guarded-paused-state question without wake", "别恢复只问现在暂停了吗", "别恢复只问现在暂停了吗", ["别恢复只问现在暂停了吗"])
    check("passes standby-state question without wake", "是不是还在安静待命", "是不是还在安静待命", ["是不是还在安静待命"])
    check("passes player-alive-state question without wake", "播放器现在活着吗", "播放器现在活着吗", ["播放器现在活着吗"])
    check("passes can-speak status question without wake", "你能不能出声", "你能不能出声", ["你能不能出声"])
    check("passes voice-heard status question without wake", "你听得到我吗", "你听得到我吗", ["你听得到我吗"])
    check("passes casual did-you-hear status question without wake", "你听见了吗", "你听见了吗", ["你听见了吗"])
    check("passes terse can-hear status question without wake", "听得见吗", "听得见吗", ["听得见吗"])
    check("passes speaking-heard status question without wake", "我说话你能听见吗", "我说话你能听见吗", ["我说话你能听见吗"])
    check("passes understand-me status question without wake", "你能听懂我吗", "你能听懂我吗", ["你能听懂我吗"])
    check("passes current-understand-me status question without wake", "现在能听懂我吗", "现在能听懂我吗", ["现在能听懂我吗"])
    check("passes my-voice-clear status question without wake", "我声音清楚吗", "我声音清楚吗", ["我声音清楚吗"])
    check("passes too-quiet voice status question without wake", "我声音太小你听得见吗", "我声音太小你听得见吗", ["我声音太小你听得见吗"])
    check("passes far-away voice status question without wake", "我离远一点你还能听见吗", "我离远一点你还能听见吗", ["我离远一点你还能听见吗"])
    check("passes noisy-place voice status question without wake", "环境太吵你还听得清吗", "环境太吵你还听得清吗", ["环境太吵你还听得清吗"])
    check("passes windy voice status question without wake", "风声很大你能听清吗", "风声很大你能听清吗", ["风声很大你能听清吗"])
    check("passes missed-sentence voice status question without wake", "我刚才那句是不是没收进去", "我刚才那句是不是没收进去", ["我刚才那句是不是没收进去"])
    check("passes missed-voice voice status question without wake", "你刚才是不是没收到我的声音", "你刚才是不是没收到我的声音", ["你刚才是不是没收到我的声音"])
    check("passes previous-heard-me status question without wake", "刚刚我说的你听见了吗", "刚刚我说的你听见了吗", ["刚刚我说的你听见了吗"])
    check("passes previous-clear status question without wake", "刚刚那句话你听清了吗", "刚刚那句话你听清了吗", ["刚刚那句话你听清了吗"])
    check("blocks casual voice-topic chatter without wake", "声音太小的电影台词", "", [])
    check("passes short-mic-sound status question without wake", "麦有声音吗", "麦有声音吗", ["麦有声音吗"])
    check("passes handset-broken status question without wake", "话筒是不是坏了", "话筒是不是坏了", ["话筒是不是坏了"])
    check("passes no-response voice status question without wake", "你怎么没反应", "你怎么没反应", ["你怎么没反应"])
    check("passes microphone-normal status question without wake", "麦克风正常吗", "麦克风正常吗", ["麦克风正常吗"])
    check("passes Chinese pause command without wake", "把音乐暂停一下", "暂停音乐", ["暂停音乐"])
    check("normalizes casual stop-song command without wake", "把歌停了", "暂停音乐", ["暂停音乐"])
    check("normalizes casual stop-music command without wake", "先把音乐停一下", "暂停音乐", ["暂停音乐"])
    check("normalizes casual no-more-song command without wake", "别放歌了", "暂停音乐", ["暂停音乐"])
    check("normalizes casual no-more-broadcast command without wake", "先别播了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-more-output-song command without wake", "先别出歌了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-more-output-music command without wake", "先别出音乐了", "暂停音乐", ["暂停音乐"])
    check("normalizes hold-radio-no-play command without wake", "先把电台按住别播", "暂停音乐", ["暂停音乐"])
    check("normalizes defer-playback command without wake", "等一下再放", "暂停音乐", ["暂停音乐"])
    check("blocks defer-vacation-news chatter without wake", "等一下再放假新闻", "", [])
    check("normalizes casual no-more-singing command without wake", "先别唱了", "暂停音乐", ["暂停音乐"])
    check("normalizes casual pause-and-rest singing command without wake", "先别唱了歇会儿", "暂停音乐", ["暂停音乐"])
    check("normalizes casual pause-and-rest play command without wake", "先别放了歇一会儿", "暂停音乐", ["暂停音乐"])
    check("normalizes no-more-singing command without wake", "不要唱了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-continue-singing command without wake", "别继续唱了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-follow-up-broadcast command without wake", "别接着播了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-follow-up-play command without wake", "别接着放了", "暂停音乐", ["暂停音乐"])
    check("normalizes no-resume-stream command without wake", "先别续播", "暂停音乐", ["暂停音乐"])
    check("normalizes pause-music-reversed command without wake", "暂停一下音乐", "暂停音乐", ["暂停音乐"])
    check("normalizes direct no-broadcast command without wake", "不要播了", "暂停音乐", ["暂停音乐"])
    check("normalizes stop-a-while command without wake", "先停会儿", "暂停音乐", ["暂停音乐"])
    check("normalizes casual music-stop-first command without wake", "音乐先停一下", "暂停音乐", ["暂停音乐"])
    check("normalizes casual music-off-first command without wake", "音乐先关掉我想安静", "暂停音乐", ["暂停音乐"])
    check("normalizes casual sound-off-first command without wake", "声音先关一下", "暂停音乐", ["暂停音乐"])
    check("normalizes casual radio-off-with-quiet-intent without wake", "电台先关掉我想静静", "暂停音乐", ["暂停音乐"])
    check("normalizes casual radio-off-first command without wake", "电台先关一会儿", "暂停音乐", ["暂停音乐"])
    check("normalizes casual turn-sound-off command without wake", "先把声音关一下", "暂停音乐", ["暂停音乐"])
    check("normalizes quiet-radio-a-bit command without wake", "先把电台静一静", "暂停音乐", ["暂停音乐"])
    check("normalizes collect-sound command without wake", "声音先收住", "暂停音乐", ["暂停音乐"])
    check("normalizes quiet-radio-command without wake", "电台先安静一下", "暂停音乐", ["暂停音乐"])
    check("normalizes stop-then-no-broadcast command without wake", "先停一下别播了", "暂停音乐", ["暂停音乐"])
    check("normalizes verb-first sound-off command without wake", "先关一会儿声音", "暂停音乐", ["暂停音乐"])
    check("normalizes do-not-ring command without wake", "先别响了", "暂停音乐", ["暂停音乐"])
    check("blocks music-comeback phrase without wake", "音乐回来吧", "", [])
    check("blocks sound-comeback phrase without wake", "声音回来吧", "", [])
    check("blocks reconnect-music phrase without wake", "音乐接回来", "", [])
    check("blocks open-voice phrase without wake", "开声吧", "", [])
    check("blocks generic-continue phrase without wake", "可以继续了", "", [])
    check("blocks previous-track-continue phrase without wake", "刚才那首继续", "", [])
    check("passes Chinese close-song command without wake", "关闭歌曲", "关闭歌曲", ["关闭歌曲"])
    check("passes Chinese close-music command without wake", "关掉音乐", "关掉音乐", ["关掉音乐"])
    check("normalizes natural stop-radio command without wake", "别播了", "暂停音乐", ["暂停音乐"])
    check("passes close-radio command without wake", "关掉电台", "关掉电台", ["关掉电台"])
    check("passes stop-music command without wake", "停下音乐", "停下音乐", ["停下音乐"])
    check("passes Chinese stop-song command without wake", "停歌", "停歌", ["停歌"])
    check("passes no-speaking safety command without wake", "别说话", "别说话", ["别说话"])
    check("passes natural no-talking safety command without wake", "不用说话", "不用说话", ["不用说话"])
    check("passes casual no-speaking safety command without wake", "先不要讲话", "先不要讲话", ["先不要讲话"])
    check("passes no-open-mouth safety command without wake", "别开口说话", "别开口说话", ["别开口说话"])
    check("passes no-sound-emission safety command without wake", "别发出声音", "别发出声音", ["别发出声音"])
    check("passes no-disturb-others safety command without wake", "别打扰别人", "别打扰别人", ["别打扰别人"])
    check("passes text-only safety command without wake", "文字回我就行", "文字回我就行", ["文字回我就行"])
    check("passes terse text-only safety command without wake", "只回文字", "只回文字", ["只回文字"])
    check("passes screen-type safety command without wake", "打在屏幕上", "打在屏幕上", ["打在屏幕上"])
    check("passes compact screen-type safety command without wake", "打屏幕上", "打屏幕上", ["打屏幕上"])
    check("passes screen-type-reverse safety command without wake", "屏幕打出来", "屏幕打出来", ["屏幕打出来"])
    check("passes screen-type-with-preposition safety command without wake", "在屏幕打出来", "在屏幕打出来", ["在屏幕打出来"])
    check("passes display-type-reverse safety command without wake", "显示屏打出来", "显示屏打出来", ["显示屏打出来"])
    check("passes casual display-only safety command without wake", "显示一下就好", "显示一下就好", ["显示一下就好"])
    check("passes screen-display-only safety command without wake", "显示在屏幕上就行", "显示在屏幕上就行", ["显示在屏幕上就行"])
    check("passes screen-display-a-bit safety command without wake", "屏幕上显示一下", "屏幕上显示一下", ["屏幕上显示一下"])
    check("passes short text-only safety command without wake", "文字就行", "文字就行", ["文字就行"])
    check("passes casual text-only-no-talking safety command without wake", "文字就好别说话", "文字就好别说话", ["文字就好别说话"])
    check("passes text-mode safety command without wake", "文字模式", "文字模式", ["文字模式"])
    check("passes post-text safety command without wake", "发文字就行", "发文字就行", ["发文字就行"])
    check("passes terse typing-only safety command without wake", "只打字", "只打字", ["只打字"])
    check("passes typing-only safety command without wake", "打字就行", "打字就行", ["打字就行"])
    check("passes typing-mode safety command without wake", "打字模式", "打字模式", ["打字模式"])
    check("passes typing-tell safety command without wake", "打字告诉我", "打字告诉我", ["打字告诉我"])
    check("passes typing-to-me safety command without wake", "打字给我就好", "打字给我就好", ["打字给我就好"])
    check("passes quiet-text-reply safety command without wake", "默默回我", "默默回我", ["默默回我"])
    check("passes quiet-tell-me safety command without wake", "默默告诉我", "默默告诉我", ["默默告诉我"])
    check("passes whisper-text-reply safety command without wake", "悄悄回我", "悄悄回我", ["悄悄回我"])
    check("passes whisper-tell-me safety command without wake", "悄悄告诉我", "悄悄告诉我", ["悄悄告诉我"])
    check("passes soft-tell-me safety command without wake", "小声告诉我", "小声告诉我", ["小声告诉我"])
    check("passes gentle-tell-me safety command without wake", "轻声告诉我", "轻声告诉我", ["轻声告诉我"])
    check("passes whisper-type-to-me safety command without wake", "悄悄打字给我", "悄悄打字给我", ["悄悄打字给我"])
    check("passes whisper-display safety command without wake", "悄悄显示一下", "悄悄显示一下", ["悄悄显示一下"])
    check("passes quiet-reply safety command without wake", "安静一点回复", "安静一点回复", ["安静一点回复"])
    check("passes casual quiet-reply safety command without wake", "安静回我一下", "安静回我一下", ["安静回我一下"])
    check("passes quiet-alone safety command without wake", "我想静静", "我想静静", ["我想静静"])
    check("passes outdoor-too-loud safety command without wake", "我在户外别播太响", "我在户外别播太响", ["我在户外别播太响"])
    check("passes public-no-surprise-song safety command without wake", "旁边有人别突然播歌", "旁边有人别突然播歌", ["旁边有人别突然播歌"])
    check("passes public-no-surprise-speaking safety command without wake", "现在旁边有人别突然说话", "现在旁边有人别突然说话", ["现在旁边有人别突然说话"])
    check("passes crowded-screen-reply safety command without wake", "周围有人，回答就打在屏幕上", "周围有人，回答就打在屏幕上", ["周围有人，回答就打在屏幕上"])
    check("passes let-me-stay-quiet safety command without wake", "让我静静", "让我静静", ["让我静静"])
    check("passes silent-answer safety command without wake", "静音回答我", "静音回答我", ["静音回答我"])
    check("passes silent-text-reply safety command without wake", "静音文字回复", "静音文字回复", ["静音文字回复"])
    check("passes screen-only safety command without wake", "只在屏幕上回我", "只在屏幕上回我", ["只在屏幕上回我"])
    check("passes view-text-only safety command without wake", "只看文字", "只看文字", ["只看文字"])
    check("passes view-screen-only safety command without wake", "只看屏幕", "只看屏幕", ["只看屏幕"])
    check("passes screen-tell-me safety command without wake", "屏幕上告诉我", "屏幕上告诉我", ["屏幕上告诉我"])
    check("passes casual screen-tell safety command without wake", "屏幕告诉我就行", "屏幕告诉我就行", ["屏幕告诉我就行"])
    check("passes direct screen-reply safety command without wake", "屏幕回复我", "屏幕回复我", ["屏幕回复我"])
    check("passes casual screen-say safety command without wake", "屏幕上说就行", "屏幕上说就行", ["屏幕上说就行"])
    check("passes screen-write safety command without wake", "屏幕上写一下就好", "屏幕上写一下就好", ["屏幕上写一下就好"])
    check("passes compact screen-write safety command without wake", "屏幕写一下就好", "屏幕写一下就好", ["屏幕写一下就好"])
    check("passes screen-post safety command without wake", "发屏幕上就好", "发屏幕上就好", ["发屏幕上就好"])
    check("passes display-screen safety command without wake", "显示屏上就行", "显示屏上就行", ["显示屏上就行"])
    check("passes display-only safety command without wake", "只显示别说", "只显示别说", ["只显示别说"])
    check("passes display-current-song-no-talk without wake", "只显示一下现在播什么，不要说话", "只显示一下现在播什么，不要说话", ["只显示一下现在播什么，不要说话"])
    check("passes reply-no-voice safety command without wake", "回复别出声", "回复别出声", ["回复别出声"])
    check("passes reply-me-no-voice safety command without wake", "回我别出声", "回我别出声", ["回我别出声"])
    check("passes people-nearby-no-voice safety command without wake", "旁边有人别出声", "旁边有人别出声", ["旁边有人别出声"])
    check("passes people-nearby-text-reply safety command without wake", "旁边有人文字回我", "旁边有人文字回我", ["旁边有人文字回我"])
    check("passes boss-nearby-no-talking safety command without wake", "老板在旁边别说话", "老板在旁边别说话", ["老板在旁边别说话"])
    check("passes meeting-no-voice safety command without wake", "我在开会别出声", "我在开会别出声", ["我在开会别出声"])
    check("passes boss-nearby-typing safety command without wake", "老板在旁边打字回", "老板在旁边打字回", ["老板在旁边打字回"])
    check("passes no-voice-broadcast safety command without wake", "别语音播报", "别语音播报", ["别语音播报"])
    check("passes screen-light-only safety command without wake", "屏幕亮一下就行", "屏幕亮一下就行", ["屏幕亮一下就行"])
    check("passes screen-light-no-speak safety command without wake", "只亮屏别说话", "只亮屏别说话", ["只亮屏别说话"])
    check("passes screen-light-reply safety command without wake", "只亮屏回复", "只亮屏回复", ["只亮屏回复"])
    check("passes no-voice-reply safety command without wake", "别用语音回", "别用语音回", ["别用语音回"])
    check("passes no-sound-answer safety command without wake", "别用声音回答", "别用声音回答", ["别用声音回答"])
    check("passes no-voice-output safety command without wake", "别出语音", "别出语音", ["别出语音"])
    check("passes no-use-voice-reply safety command without wake", "不要用语音回", "不要用语音回", ["不要用语音回"])
    check("passes no-voice-output-buyao safety command without wake", "不要出语音", "不要出语音", ["不要出语音"])
    check("passes no-voice-reply-buyao safety command without wake", "不要语音回", "不要语音回", ["不要语音回"])
    check("passes current-song quiet suffix without wake", "现在播什么歌别出声", "现在播什么歌别出声", ["现在播什么歌别出声"])
    check("passes city-story quiet suffix without wake", "这座城有啥故事别出声", "这座城有啥故事别出声", ["这座城有啥故事别出声"])
    check("passes route quiet suffix without wake", "这趟路线是什么别出声", "这趟路线是什么别出声", ["这趟路线是什么别出声"])
    check("passes battery quiet suffix without wake", "电量还够吗别出声", "电量还够吗别出声", ["电量还够吗别出声"])
    check("passes network quiet suffix without wake", "现在走哪张网别出声", "现在走哪张网别出声", ["现在走哪张网别出声"])
    check("passes hotspot-connect quiet suffix without wake", "帮我连接手机热点别出声", "帮我连接手机热点别出声", ["帮我连接手机热点别出声"])
    check("passes dropped-wifi quiet suffix without wake", "Wi-Fi掉了帮我连回热点别念出来", "Wi-Fi掉了帮我连回热点别念出来", ["Wi-Fi掉了帮我连回热点别念出来"])
    check("passes hotspot-ready quiet suffix without wake", "手机热点开好了不要播报", "手机热点开好了不要播报", ["手机热点开好了不要播报"])
    check("passes vivo-hotspot quiet suffix without wake", "切到vivo热点别出声", "切到vivo热点别出声", ["切到vivo热点别出声"])
    check("passes no-need-voice-reply safety command without wake", "不用语音回", "不用语音回", ["不用语音回"])
    check("passes no-need-voice-output safety command without wake", "不用出语音", "不用出语音", ["不用出语音"])
    check("passes no-voice-response safety command without wake", "不要语音回复", "不要语音回复", ["不要语音回复"])
    check("passes no-voice-answer safety command without wake", "不要语音回答", "不要语音回答", ["不要语音回答"])
    check("passes text-say safety command without wake", "用文字说", "用文字说", ["用文字说"])
    check("passes no-reading safety command without wake", "不要朗读", "不要朗读", ["不要朗读"])
    check("passes no-need-reading safety command without wake", "不用朗读", "不用朗读", ["不用朗读"])
    check("passes do-not-read-to-me safety command without wake", "别念给我听", "别念给我听", ["别念给我听"])
    check("passes do-not-read-out-nian safety command without wake", "别念出来", "别念出来", ["别念出来"])
    check("passes no-read-out-nian safety command without wake", "不要念出来", "不要念出来", ["不要念出来"])
    check("passes no-need-read-out-nian safety command without wake", "不用念出来", "不用念出来", ["不用念出来"])
    check("passes do-not-read-out safety command without wake", "别读出来", "别读出来", ["别读出来"])
    check("passes no-read-out safety command without wake", "不要读出来", "不要读出来", ["不要读出来"])
    check("passes no-need-read-out safety command without wake", "不用读出来", "不用读出来", ["不用读出来"])
    check("passes do-not-read-my-words safety command without wake", "别把我的话念出来", "别把我的话念出来", ["别把我的话念出来"])
    check("passes do-not-read-what-i-said safety command without wake", "不要把我说的话读出来", "不要把我说的话读出来", ["不要把我说的话读出来"])
    check("passes do-not-read-previous-to-others safety command without wake", "上条别读给别人听", "上条别读给别人听", ["上条别读给别人听"])
    check("passes do-not-say-out safety command without wake", "别讲出来", "别讲出来", ["别讲出来"])
    check("passes no-say-out safety command without wake", "不要讲出来", "不要讲出来", ["不要讲出来"])
    check("passes no-need-say-out safety command without wake", "不用讲出来", "不用讲出来", ["不用讲出来"])
    check("passes no-broadcast safety command without wake", "别播报", "别播报", ["别播报"])
    check("passes no-audio-play-out safety command without wake", "别播出来", "别播出来", ["别播出来"])
    check("passes no-audio-put-out safety command without wake", "不要放出来", "不要放出来", ["不要放出来"])
    check("passes do-not-read-aloud safety command without wake", "别读出声", "别读出声", ["别读出声"])
    check("passes no-say-aloud safety command without wake", "不要说出声", "不要说出声", ["不要说出声"])
    check("passes no-need-say-aloud safety command without wake", "不用说出声", "不用说出声", ["不用说出声"])
    check("passes nearby no-read safety command without wake", "旁边有人别读", "旁边有人别读", ["旁边有人别读"])
    check("passes coworker no-say safety command without wake", "同事在旁边别说", "同事在旁边别说", ["同事在旁边别说"])
    check("passes crowded-nearby no-say-out safety command without wake", "旁边人多别说出来", "旁边人多别说出来", ["旁边人多别说出来"])
    check("passes crowd no-say-out safety command without wake", "人多别说出来", "人多别说出来", ["人多别说出来"])
    check("passes crowded-surrounding no-say-out safety command without wake", "周围人多别说出来", "周围人多别说出来", ["周围人多别说出来"])
    check("passes crowded-nearby typing-only safety command without wake", "旁边人多只打字", "旁边人多只打字", ["旁边人多只打字"])
    check("passes quiet-playlist-public question without wake", "旁边有人问歌单只写字", "旁边有人问歌单只写字", ["旁边有人问歌单只写字"])
    check("passes quiet-route-public natural question without wake", "旁边有人，问一下这趟怎么走别念出来", "旁边有人，问一下这趟怎么走别念出来", ["旁边有人，问一下这趟怎么走别念出来"])
    check("passes quiet-song-story-no-earbuds question without wake", "没戴耳机问这首歌讲什么只写字", "没戴耳机问这首歌讲什么只写字", ["没戴耳机问这首歌讲什么只写字"])
    check("passes public-bus no-voice safety command without wake", "我在公交上别出声", "我在公交上别出声", ["我在公交上别出声"])
    check("passes elevator no-talk safety command without wake", "电梯里别说话", "电梯里别说话", ["电梯里别说话"])
    check("passes taxi no-talk safety command without wake", "出租车上别说话", "出租车上别说话", ["出租车上别说话"])
    check("passes subway no-voice safety command without wake", "地铁里别出声", "地铁里别出声", ["地铁里别出声"])
    check("passes office no-voice safety command without wake", "办公室别出声", "办公室别出声", ["办公室别出声"])
    check("passes classroom no-talk safety command without wake", "课堂上别说话", "课堂上别说话", ["课堂上别说话"])
    check("passes crowded no-noise safety command without wake", "人多别吵", "人多别吵", ["人多别吵"])
    check("passes nearby no-hear-pronoun safety command without wake", "旁边有人别让他听见", "旁边有人别让他听见", ["旁边有人别让他听见"])
    check("passes boss-nearby no-hear-pronoun safety command without wake", "老板在旁边别让他听见", "老板在旁边别让他听见", ["老板在旁边别让他听见"])
    check("passes no-autoplay safety command without wake", "不要自动播放", "不要自动播放", ["不要自动播放"])
    check("passes no-surprise-play safety command without wake", "别突然放歌", "别突然放歌", ["别突然放歌"])
    check("passes quiet-screen-reply safety command without wake", "安静在屏幕上回我", "安静在屏幕上回我", ["安静在屏幕上回我"])
    check("passes no-voice safety command without wake", "别出声", "别出声", ["别出声"])
    check("passes inconvenient-to-speak safety command without wake", "现在不方便出声", "现在不方便出声", ["现在不方便出声"])
    check("passes no-speaker safety command without wake", "别外放", "别外放", ["别外放"])
    check("passes no-speaker-device safety command without wake", "别从喇叭放出来", "别从喇叭放出来", ["别从喇叭放出来"])
    check("passes no-speaker-box safety command without wake", "不要从音箱里放出来", "不要从音箱里放出来", ["不要从音箱里放出来"])
    check("passes no-speaker-driver safety command without wake", "别用扬声器", "别用扬声器", ["别用扬声器"])
    check("passes no-speaker-speech safety command without wake", "别在扬声器里说", "别在扬声器里说", ["别在扬声器里说"])
    check("passes no-speaker-through-speech safety command without wake", "不要通过扬声器说话", "不要通过扬声器说话", ["不要通过扬声器说话"])
    check("passes no-speaker-current-city question without wake", "别通过音箱回答我现在在哪座城市", "别通过音箱回答我现在在哪座城市", ["别通过音箱回答我现在在哪座城市"])
    check("passes no-speakerphone-speech safety command without wake", "别用外放说话", "别用外放说话", ["别用外放说话"])
    check("passes hush safety command without wake", "别吭声", "别吭声", ["别吭声"])
    check("passes quiet-hush safety command without wake", "别吱声", "别吱声", ["别吱声"])
    check("passes short no-ring safety command without wake", "别响", "别响", ["别响"])
    check("passes subway no-ring safety command without wake", "我在地铁上别响", "我在地铁上别响", ["我在地铁上别响"])
    check("passes library no-ring safety command without wake", "图书馆别响", "图书馆别响", ["图书馆别响"])
    check("passes shush safety command without wake", "嘘", "嘘", ["嘘"])
    check("passes shush-a-bit safety command without wake", "嘘一下", "嘘一下", ["嘘一下"])
    check("passes english shush safety command without wake", "shh", "shh", ["shh"])
    check("passes hard no-audio safety command without wake", "不要出声", "不要出声", ["不要出声"])
    check("passes noisy-room safety command without wake", "太吵了先别响", "太吵了先别响", ["太吵了先别响"])
    check("passes casual do-not-bother safety command without wake", "别吵我了", "别吵我了", ["别吵我了"])
    check("passes casual no-noise safety command without wake", "不要吵了", "不要吵了", ["不要吵了"])
    check("passes sleeping-child no-ring safety command without wake", "孩子刚睡着不要响", "孩子刚睡着不要响", ["孩子刚睡着不要响"])
    check("passes do-not-wake-baby safety command without wake", "别吵醒宝宝", "别吵醒宝宝", ["别吵醒宝宝"])
    check("passes terse private-nearby safety command without wake", "别让旁边听到", "别让旁边听到", ["别让旁边听到"])
    check("passes private nearby-listener safety command without wake", "别让旁边人听见", "别让旁边人听见", ["别让旁边人听见"])
    check("passes private side-listener safety command without wake", "别让身边的人听到", "别让身边的人听到", ["别让身边的人听到"])
    check("passes private passerby-listener safety command without wake", "别让路人听见", "别让路人听见", ["别让路人听见"])
    check("passes nearby-person no-voice safety command without wake", "附近有人别出声", "附近有人别出声", ["附近有人别出声"])
    check("passes private meeting safety command without wake", "我在开会，别让人听到", "我在开会，别让人听到", ["我在开会，别让人听到"])
    check("passes private coworker safety command without wake", "别让同事听见", "别让同事听见", ["别让同事听见"])
    check("passes private driver safety command without wake", "别让司机听到", "别让司机听到", ["别让司机听到"])
    check("passes private passenger safety command without wake", "不要让乘客听见", "不要让乘客听见", ["不要让乘客听见"])
    check("passes private clerk safety command without wake", "别让店员听见", "别让店员听见", ["别让店员听见"])
    check("passes private waiter safety command without wake", "不要让服务员听到", "不要让服务员听到", ["不要让服务员听到"])
    check("passes private tablemate safety command without wake", "别让同桌听见", "别让同桌听见", ["别让同桌听见"])
    check("passes private backseat safety command without wake", "别让后排听到", "别让后排听到", ["别让后排听到"])
    check("passes private neighbor safety command without wake", "别让邻居听见", "别让邻居听见", ["别让邻居听见"])
    check("normalizes repeated stop misrecognition without wake", "该 这 歌曲 停 停止", "暂停音乐", ["暂停音乐"])
    check("normalizes noisy pause misrecognition without wake", "赞成 一下 把 音乐 暂停 一下", "暂停音乐", ["暂停音乐"])
    check("safety command does not unlock follow-up", "播放下柏林的音乐", "", [])
    check("accepts wake word", "弗洛斯特", "弗洛斯特", ["弗洛斯特"])
    check("accepts spaced wake word", "弗 洛 斯 特", "弗 洛 斯 特", ["弗 洛 斯 特"])
    check("accepts luo/ro wake homophone", "弗罗斯特", "弗罗斯特", ["弗罗斯特"])
    check("accepts fu-luo wake homophone", "福洛斯特", "福洛斯特", ["福洛斯特"])
    check("accepts dropped-si wake homophone", "弗洛特", "弗洛特", ["弗洛特"])
    check("accepts common homophone wake", "佛罗思特", "佛罗思特", ["佛罗思特"])
    check("accepts silk-sound homophone wake", "弗洛丝特", "弗洛丝特", ["弗洛丝特"])
    check("accepts de-suffix wake homophone", "弗洛斯得", "弗洛斯得", ["弗洛斯得"])
    check("accepts small de-suffix wake homophone", "小弗洛斯的", "小弗洛斯的", ["小弗洛斯的"])
    check("accepts full de-suffix wake homophone", "弗洛斯特得", "弗洛斯特得", ["弗洛斯特得"])
    check("accepts small full de-suffix wake homophone", "小弗洛斯特的", "小弗洛斯特的", ["小弗洛斯特的"])
    check("accepts wake word with spoken particle", "弗洛斯特啊", "弗洛斯特啊", ["弗洛斯特啊"])
    check("accepts product wake with spoken particle", "日落电台呀", "日落电台呀", ["日落电台呀"])
    check("accepts Chinese hey wake word", "嘿弗洛斯特", "嘿弗洛斯特", ["嘿弗洛斯特"])
    check("accepts Chinese hi wake word", "嗨弗洛斯特", "嗨弗洛斯特", ["嗨弗洛斯特"])
    check("accepts Chinese hey-you wake word", "喂弗洛斯特", "喂弗洛斯特", ["喂弗洛斯特"])
    check("accepts full nickname wake word", "小弗洛斯特", "小弗洛斯特", ["小弗洛斯特"])
    check("accepts nickname homophone wake", "小佛", "小佛", ["小佛"])
    check("accepts short fu nickname wake", "小福", "小福", ["小福"])
    check("accepts spoken Chinese DJ wake", "音乐迪杰", "音乐迪杰", ["音乐迪杰"])
    check("accepts sunset-DJ wake alias", "日落DJ 播放下东京的歌曲", "日落DJ 播放下东京的歌曲", ["日落DJ 播放下东京的歌曲"])
    check("accepts spoken sunset-DJ wake alias", "日落迪杰 播放下东京的歌曲", "日落迪杰 播放下东京的歌曲", ["日落迪杰 播放下东京的歌曲"])
    check("accepts product-name wake", "日落电台", "日落电台", ["日落电台"])
    check("accepts reversed product-name wake alias", "落日电台 播放下东京的歌曲", "落日电台 播放下东京的歌曲", ["落日电台 播放下东京的歌曲"])
    check("accepts command inside wake window", "播放下柏林的音乐", "播放下柏林的音乐", ["播放下柏林的音乐"])
    check("accepts both-hotspots-missing fallback question inside wake window", "两个热点都找不到会回家里Wi-Fi吗", "两个热点都找不到会回家里Wi-Fi吗", ["两个热点都找不到会回家里Wi-Fi吗"])
    check("accepts vivo-failure fallback question inside wake window", "vivo也连不上会不会卡住", "vivo也连不上会不会卡住", ["vivo也连不上会不会卡住"])
    check("accepts outdoor-hotspot-failure fallback question inside wake window", "出门热点失败会不会回落家里网", "出门热点失败会不会回落家里网", ["出门热点失败会不会回落家里网"])
    check("accepts hotspot-secret-git question inside wake window", "热点密码会不会写进git", "热点密码会不会写进git", ["热点密码会不会写进git"])
    check("accepts password-never-screen phrase inside wake window", "密码别出现在屏幕上", "密码别出现在屏幕上", ["密码别出现在屏幕上"])
    check("accepts wifi-password-hidden phrase inside wake window", "WiFi密码别显示出来", "WiFi密码别显示出来", ["WiFi密码别显示出来"])
    check("accepts wifi-repeat-switch question inside wake window", "Wi-Fi失败后会不会重复切换", "Wi-Fi失败后会不会重复切换", ["Wi-Fi失败后会不会重复切换"])
    check("accepts ambient plate privacy question inside wake window", "环境扫描会不会识别车牌", "环境扫描会不会识别车牌", ["环境扫描会不会识别车牌"])
    check("accepts qr-code recognition privacy question inside wake window", "会不会识别二维码", "会不会识别二维码", ["会不会识别二维码"])
    check("accepts screen-text cloud privacy question inside wake window", "会不会把屏幕文字传到云端", "会不会把屏幕文字传到云端", ["会不会把屏幕文字传到云端"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural next-city phrase inside wake window", "换个地方", "换个地方", ["换个地方"])
    check("accepts natural next-place phrase inside wake window", "去别处", "去别处", ["去别处"])
    check("accepts natural previous-place phrase inside wake window", "回上个地方", "回上个地方", ["回上个地方"])
    check("normalizes natural skip-this-track phrase inside wake window", "这首先跳过吧", "这首跳过", ["这首跳过"])
    check("normalizes natural do-not-play-this-track phrase inside wake window", "别播这首了", "这首跳过", ["这首跳过"])
    check("normalizes reversed do-not-play-this-track phrase inside wake window", "这首别播了", "这首跳过", ["这首跳过"])
    check("normalizes cut-current-track phrase inside wake window", "把这首切掉", "这首跳过", ["这首跳过"])
    check("normalizes terse cut-track phrase inside wake window", "切歌", "这首跳过", ["这首跳过"])
    check("normalizes casual change-track phrase inside wake window", "换个歌", "这首跳过", ["这首跳过"])
    check("normalizes casual skip-one-track phrase inside wake window", "跳一首", "这首跳过", ["这首跳过"])
    check("accepts natural previous-this-track phrase inside wake window", "回刚才那首", "回刚才那首", ["回刚才那首"])
    check("accepts natural replay phrase inside wake window", "再听一遍", "再听一遍", ["再听一遍"])
    check("accepts natural restart phrase inside wake window", "从头来", "从头来", ["从头来"])
    check("accepts natural volume-down phrase inside wake window", "声音小一点", "声音小一点", ["声音小一点"])
    check("accepts natural too-loud phrase inside wake window", "声音太大了", "声音太大了", ["声音太大了"])
    check("accepts natural quieter phrase inside wake window", "小点声", "小点声", ["小点声"])
    check("accepts colloquial quieter phrase inside wake window", "小点儿声", "小点儿声", ["小点儿声"])
    check("accepts casual quieter phrase inside wake window", "小声点", "小声点", ["小声点"])
    check("accepts casual too-loud phrase inside wake window", "别那么响", "别那么响", ["别那么响"])
    check("accepts casual too-loud voice phrase inside wake window", "不要那么大声", "不要那么大声", ["不要那么大声"])
    check("accepts quiet-reply volume phrase inside wake window", "小声回复我", "小声回复我", ["小声回复我"])
    check("accepts natural volume-down tune phrase inside wake window", "声音调低点", "声音调低点", ["声音调低点"])
    check("accepts natural volume-down level phrase inside wake window", "音量调低点", "音量调低点", ["音量调低点"])
    check("accepts natural volume-down short phrase inside wake window", "调小一点", "调小一点", ["调小一点"])
    check("accepts soft-voice volume-down phrase inside wake window", "轻声一点", "轻声一点", ["轻声一点"])
    check("accepts low-voice volume-down phrase inside wake window", "低声一点", "低声一点", ["低声一点"])
    check("accepts softer-sound volume-down phrase inside wake window", "声音轻一点", "声音轻一点", ["声音轻一点"])
    check("accepts press-lower volume-down phrase inside wake window", "声音压低一点", "声音压低一点", ["声音压低一点"])
    check("accepts casual smaller-sound phrase inside wake window", "小一点声", "小一点声", ["小一点声"])
    check("accepts natural volume-up phrase inside wake window", "大声一点", "大声一点", ["大声一点"])
    check("accepts casual louder phrase inside wake window", "大声点", "大声点", ["大声点"])
    check("accepts colloquial louder phrase inside wake window", "大点儿声", "大点儿声", ["大点儿声"])
    check("accepts natural too-soft phrase inside wake window", "声音太小了", "声音太小了", ["声音太小了"])
    check("accepts natural louder phrase inside wake window", "听不清", "听不清", ["听不清"])
    check("accepts natural volume-up tune phrase inside wake window", "声音调高点", "声音调高点", ["声音调高点"])
    check("accepts natural volume-up level phrase inside wake window", "音量调高点", "音量调高点", ["音量调高点"])
    check("accepts natural volume-up short phrase inside wake window", "调大一点", "调大一点", ["调大一点"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural title question inside wake window", "这首歌叫什么", "这首歌叫什么", ["这首歌叫什么"])
    check("accepts casual title question inside wake window", "这歌叫啥", "这歌叫啥", ["这歌叫啥"])
    check("accepts casual song-name question inside wake window", "这歌什么名字", "这歌什么名字", ["这歌什么名字"])
    check("accepts short song-name question inside wake window", "这首啥名字", "这首啥名字", ["这首啥名字"])
    check("accepts natural song-name question inside wake window", "这首歌啥名字", "这首歌啥名字", ["这首歌啥名字"])
    check("accepts direct song-title question inside wake window", "歌名是什么", "歌名是什么", ["歌名是什么"])
    check("accepts current song-title natural question inside wake window", "现在歌叫什么名字", "现在歌叫什么名字", ["现在歌叫什么名字"])
    check("accepts this-is-song question inside wake window", "这是什么歌", "这是什么歌", ["这是什么歌"])
    check("accepts casual this-is-song question inside wake window", "这是啥歌", "这是啥歌", ["这是啥歌"])
    check("accepts song-city-origin question inside wake window", "这首歌是哪座城市的", "这首歌是哪座城市的", ["这首歌是哪座城市的"])
    check("accepts terse song-city-origin question inside wake window", "这是哪座城的歌", "这是哪座城的歌", ["这是哪座城的歌"])
    check("accepts terse song-stop-origin question inside wake window", "这是哪站的歌", "这是哪站的歌", ["这是哪站的歌"])
    check("accepts terse song-place-origin question inside wake window", "这歌是哪儿的", "这歌是哪儿的", ["这歌是哪儿的"])
    check("accepts song-from-place-origin question inside wake window", "这首歌来自哪里", "这首歌来自哪里", ["这首歌来自哪里"])
    check("accepts casual song-from-place-origin question inside wake window", "这歌从哪儿来", "这歌从哪儿来", ["这歌从哪儿来"])
    check("accepts terse song-what-place-origin question inside wake window", "这歌什么地方的", "这歌什么地方的", ["这歌什么地方的"])
    check("accepts casual song-city-origin question inside wake window", "这歌属于哪个城市", "这歌属于哪个城市", ["这歌属于哪个城市"])
    check("accepts song-stop-origin question inside wake window", "这首歌对应哪一站", "这首歌对应哪一站", ["这首歌对应哪一站"])
    check("accepts demonstrative song-stop-origin question inside wake window", "这一首是哪站的歌", "这一首是哪站的歌", ["这一首是哪站的歌"])
    check("accepts just-played-song question inside wake window", "刚刚放的是啥歌", "刚刚放的是啥歌", ["刚刚放的是啥歌"])
    check("accepts terse just-played-broadcast question inside wake window", "刚播啥", "刚播啥", ["刚播啥"])
    check("accepts terse just-played-put-on question inside wake window", "刚放啥", "刚放啥", ["刚放啥"])
    check("accepts previous-track title question inside wake window", "上一首是什么", "上一首是什么", ["上一首是什么"])
    check("accepts terse previous-track query inside wake window", "上一首呢", "上一首呢", ["上一首呢"])
    check("accepts terse short-previous-track query inside wake window", "上首呢", "上首呢", ["上首呢"])
    check("accepts bare previous-track query inside wake window", "上一个呢", "上一个呢", ["上一个呢"])
    check("accepts bare previous-track-what query inside wake window", "上一个是什么", "上一个是什么", ["上一个是什么"])
    check("accepts bare previous-track-short query inside wake window", "上一个啥", "上一个啥", ["上一个啥"])
    check("accepts shorter previous-track query inside wake window", "上个呢", "上个呢", ["上个呢"])
    check("accepts shorter previous-track-what query inside wake window", "上个是什么", "上个是什么", ["上个是什么"])
    check("accepts shorter previous-track-short query inside wake window", "上个啥", "上个啥", ["上个啥"])
    check(
        "accepts negative previous-track query inside wake window",
        "别回上一首，我只是问上一首是什么",
        "别回上一首，我只是问上一首是什么",
        ["别回上一首，我只是问上一首是什么"],
    )
    check(
        "accepts short negative previous-track query inside wake window",
        "先别倒回去，我问上个啥",
        "先别倒回去，我问上个啥",
        ["先别倒回去，我问上个啥"],
    )
    check("accepts earlier previous-track query inside wake window", "前一个呢", "前一个呢", ["前一个呢"])
    check("accepts earlier previous-track-what query inside wake window", "前一个是什么", "前一个是什么", ["前一个是什么"])
    check("accepts earlier previous-track-short query inside wake window", "前一个啥", "前一个啥", ["前一个啥"])
    check("accepts previous-track casual title question inside wake window", "刚才那首歌叫什么", "刚才那首歌叫什么", ["刚才那首歌叫什么"])
    check("accepts previous-track casual-song title question inside wake window", "刚才那歌叫什么", "刚才那歌叫什么", ["刚才那歌叫什么"])
    check("accepts previous-track just-broadcast-which-song question inside wake window", "刚才播的是哪首歌", "刚才播的是哪首歌", ["刚才播的是哪首歌"])
    check("accepts previous-track just-put-on-which-song question inside wake window", "刚才放的是哪首歌", "刚才放的是哪首歌", ["刚才放的是哪首歌"])
    check("accepts previous-track just-listened-which-song question inside wake window", "刚才听的是哪首歌", "刚才听的是哪首歌", ["刚才听的是哪首歌"])
    check("accepts previous-rang artist question inside wake window", "刚才响起来的是谁唱的", "刚才响起来的是谁唱的", ["刚才响起来的是谁唱的"])
    check("accepts previous-rang title question inside wake window", "刚刚响起来的是哪首歌", "刚刚响起来的是哪首歌", ["刚刚响起来的是哪首歌"])
    check("accepts previous-heard artist question inside wake window", "刚才听到的是谁唱的", "刚才听到的是谁唱的", ["刚才听到的是谁唱的"])
    check("accepts previous-track earlier-title question inside wake window", "前面那首歌叫什么", "前面那首歌叫什么", ["前面那首歌叫什么"])
    check("accepts previous-track previous-one-title question inside wake window", "上一个歌叫什么", "上一个歌叫什么", ["上一个歌叫什么"])
    check("accepts previous-track artist question inside wake window", "上一首谁唱的", "上一首谁唱的", ["上一首谁唱的"])
    check("accepts previous-track city-origin question inside wake window", "上一首是哪座城市的", "上一首是哪座城市的", ["上一首是哪座城市的"])
    check("accepts previous-track casual place-origin question inside wake window", "刚才那首是哪儿的", "刚才那首是哪儿的", ["刚才那首是哪儿的"])
    check("accepts previous-track from-place-origin question inside wake window", "刚才那首来自哪里", "刚才那首来自哪里", ["刚才那首来自哪里"])
    check("accepts previous-track from-where-origin question inside wake window", "刚才那歌从哪儿来", "刚才那歌从哪儿来", ["刚才那歌从哪儿来"])
    check("accepts previous-track broadcasted from-place-origin question inside wake window", "刚才播的那首来自哪里", "刚才播的那首来自哪里", ["刚才播的那首来自哪里"])
    check("accepts previous-track listened from-where-origin question inside wake window", "刚才听的那歌从哪儿来", "刚才听的那歌从哪儿来", ["刚才听的那歌从哪儿来"])
    check("accepts previous-track earlier place-origin question inside wake window", "前面那首是哪里的", "前面那首是哪里的", ["前面那首是哪里的"])
    check("accepts previous-track just-played place-origin question inside wake window", "刚刚那歌是哪个地方的", "刚刚那歌是哪个地方的", ["刚刚那歌是哪个地方的"])
    check("accepts casual now-playing question inside wake window", "现在放的是啥", "现在放的是啥", ["现在放的是啥"])
    check("accepts casual currently-playing question inside wake window", "现在播什么", "现在播什么", ["现在播什么"])
    check("accepts natural currently-playing which-song question inside wake window", "现在播的是哪首", "现在播的是哪首", ["现在播的是哪首"])
    check("accepts terse current-song-title question inside wake window", "这首叫什么", "这首叫什么", ["这首叫什么"])
    check("accepts casual recent-playing question inside wake window", "刚刚在播什么歌", "刚刚在播什么歌", ["刚刚在播什么歌"])
    check("accepts quiet current-song-no-voice question inside wake window", "别出声告诉我现在播什么", "别出声告诉我现在播什么", ["别出声告诉我现在播什么"])
    check(
        "accepts negative current-song query inside wake window",
        "别切歌，我只是问现在播什么歌",
        "别切歌，我只是问现在播什么歌",
        ["别切歌，我只是问现在播什么歌"],
    )
    check("accepts natural current-song question inside wake window", "现在听的是哪首歌", "现在听的是哪首歌", ["现在听的是哪首歌"])
    check("accepts casual current-song question inside wake window", "现在听什么歌", "现在听什么歌", ["现在听什么歌"])
    check("accepts current-this-song-origin inside wake window", "现在这个歌是哪儿来的", "现在这个歌是哪儿来的", ["现在这个歌是哪儿来的"])
    check("accepts current-this-song-source inside wake window", "现在这个歌来自哪里", "现在这个歌来自哪里", ["现在这个歌来自哪里"])
    check("accepts current-listening-origin inside wake window", "这会儿在听哪儿的歌", "这会儿在播放哪儿的歌", ["这会儿在播放哪儿的歌"])
    check("accepts casual current-singing question inside wake window", "现在唱的是啥", "现在唱的是啥", ["现在唱的是啥"])
    check("accepts this-moment current-song question inside wake window", "这会儿放的是啥歌", "这会儿放的是啥歌", ["这会儿放的是啥歌"])
    check("accepts present-is-song question inside wake window", "现在是什么歌", "现在是什么歌", ["现在是什么歌"])
    check("accepts this-moment-is-song question inside wake window", "这会儿是什么歌", "这会儿是什么歌", ["这会儿是什么歌"])
    check("accepts moment-is-song question inside wake window", "此刻是啥歌", "此刻是啥歌", ["此刻是啥歌"])
    check("accepts this-moment current-broadcast question inside wake window", "这会儿播的啥", "这会儿播的啥", ["这会儿播的啥"])
    check("accepts this-moment current-song-number question inside wake window", "这会儿放哪一首", "这会儿放哪一首", ["这会儿放哪一首"])
    check("accepts this-moment current-broadcast-number question inside wake window", "这会儿播哪一首", "这会儿播哪一首", ["这会儿播哪一首"])
    check("accepts current-song-index question inside wake window", "现在第几首", "现在第几首", ["现在第几首"])
    check("accepts current-song-index progress question inside wake window", "现在播到第几首了", "现在播到第几首了", ["现在播到第几首了"])
    check("accepts subjectless current-song-index question inside wake window", "第几首了", "第几首了", ["第几首了"])
    check("accepts subjectless arrived-song-index question inside wake window", "到第几首了", "到第几首了", ["到第几首了"])
    check("accepts subjectless playing-song-index question inside wake window", "播到第几首了", "播到第几首了", ["播到第几首了"])
    check("accepts current-singing-song question inside wake window", "现在唱什么歌", "现在唱什么歌", ["现在唱什么歌"])
    check("accepts currently-singing-song question inside wake window", "正在唱什么歌", "正在唱什么歌", ["正在唱什么歌"])
    check("accepts demonstrative-current-song question inside wake window", "这一首是什么歌", "这一首是什么歌", ["这一首是什么歌"])
    check("accepts playback-position question inside wake window", "播到哪了", "播到哪了", ["播到哪了"])
    check("accepts natural song-origin question inside wake window", "这首歌什么来头", "这首歌什么来头", ["这首歌什么来头"])
    check("accepts casual talk-about-this-song question inside wake window", "说说这首歌", "说说这首歌", ["说说这首歌"])
    check("accepts casual chat-about-this-song question inside wake window", "聊聊这首歌", "聊聊这首歌", ["聊聊这首歌"])
    check("accepts reverse talk-about-this-song question inside wake window", "这首说说", "这首说说", ["这首说说"])
    check("accepts terse talk-about-this-song question inside wake window", "这歌讲讲", "这歌讲讲", ["这歌讲讲"])
    check("accepts reverse introduce-this-song question inside wake window", "这曲介绍一下", "这曲介绍一下", ["这曲介绍一下"])
    check("accepts casual song-origin question inside wake window", "这歌什么来历", "这歌什么来历", ["这歌什么来历"])
    check("accepts natural why-this-song question inside wake window", "为什么放这首", "为什么放这首", ["为什么放这首"])
    check("accepts casual why-this-song question inside wake window", "为啥放这首", "为啥放这首", ["为啥放这首"])
    check("accepts reverse casual why-this-song question inside wake window", "这首为啥播", "这首为啥播", ["这首为啥播"])
    check("accepts chosen-this-song question inside wake window", "这首怎么选的", "这首怎么选的", ["这首怎么选的"])
    check("accepts this-song-chosen question inside wake window", "怎么选的这首", "怎么选的这首", ["怎么选的这首"])
    check("accepts song-city-relation question inside wake window", "这首歌和这座城市有什么关系", "这首歌和这座城市有什么关系", ["这首歌和这座城市有什么关系"])
    check("accepts casual song-here-relation question inside wake window", "这首和这里有什么关系", "这首和这里有什么关系", ["这首和这里有什么关系"])
    check("accepts named-city song relation question inside wake window", "这首歌跟东京有什么关系", "这首歌跟东京有什么关系", ["这首歌跟东京有什么关系"])
    check("accepts current-city song relation question inside wake window", "这首歌和当前城市有什么关系", "这首歌和当前城市有什么关系", ["这首歌和当前城市有什么关系"])
    check("accepts no-rewind previous-song station fit inside wake window", "别回放上一首，只想知道它为什么适合上一站", "别回放上一首，只想知道它为什么适合上一站", ["别回放上一首，只想知道它为什么适合上一站"])
    check("accepts casual song-here-related question inside wake window", "这歌和这里有关吗", "这歌和这里有关吗", ["这歌和这里有关吗"])
    check("accepts song-this-city-related question inside wake window", "这首歌跟这个城市有关吗", "这首歌跟这个城市有关吗", ["这首歌跟这个城市有关吗"])
    check("accepts song-named-city-fit question inside wake window", "这首歌适合东京吗", "这首歌适合东京吗", ["这首歌适合东京吗"])
    check("accepts casual song-here-fit question inside wake window", "这歌配这里吗", "这歌配这里吗", ["这歌配这里吗"])
    check("accepts song-named-city-placement question inside wake window", "这首歌放在东京合适吗", "这首歌放在东京合适吗", ["这首歌放在东京合适吗"])
    check("accepts casual song-named-city-match question inside wake window", "这歌搭东京吗", "这歌搭东京吗", ["这歌搭东京吗"])
    check("accepts song-named-city-fit-choice question inside wake window", "这首歌适不适合东京", "这首歌适不适合东京", ["这首歌适不适合东京"])
    check("accepts casual song-here-fit-choice question inside wake window", "这歌合不合适这里", "这歌合不合适这里", ["这歌合不合适这里"])
    check("accepts casual current-stop song-fit question inside wake window", "这歌为啥适合这一站", "这歌为啥适合这一站", ["这歌为啥适合这一站"])
    check("accepts current-song-city-fit-why inside wake window", "这首为什么配这座城市", "这首为什么配这座城市", ["这首为什么配这座城市"])
    check("accepts song-city-lookalike question inside wake window", "这首歌像不像这座城", "这首歌像不像这座城", ["这首歌像不像这座城"])
    check("accepts song-city-flavor question inside wake window", "这首歌有没有这个城市的味道", "这首歌有没有这个城市的味道", ["这首歌有没有这个城市的味道"])
    check("accepts song-city-vibe-fit question inside wake window", "这歌和这座城对味吗", "这歌和这座城对味吗", ["这歌和这座城对味吗"])
    check("accepts song-here-rightness question inside wake window", "这首放这里对味吗", "这首放这里对味吗", ["这首放这里对味吗"])
    check("accepts song-place-link question inside wake window", "这歌跟这个地方有什么联系", "这歌跟这个地方有什么联系", ["这歌跟这个地方有什么联系"])
    check("accepts previous-song previous-stop relation question inside wake window", "刚才那首跟上一站有关系吗", "刚才那首跟上一站有关系吗", ["刚才那首跟上一站有关系吗"])
    check("accepts current-song stop-origin question inside wake window", "这首归哪一站", "这首归哪一站", ["这首归哪一站"])
    check("accepts song-writer question inside wake window", "这首歌谁写的", "这首歌谁写的", ["这首歌谁写的"])
    check("accepts song-composer question inside wake window", "这首谁作曲", "这首谁作曲", ["这首谁作曲"])
    check("accepts song-lyricist question inside wake window", "这首谁填词", "这首谁填词", ["这首谁填词"])
    check("accepts this-composer question inside wake window", "这是谁作曲的", "这是谁作曲的", ["这是谁作曲的"])
    check("accepts song-meaning question inside wake window", "这首歌讲什么", "这首歌讲什么", ["这首歌讲什么"])
    check("accepts song-meaning-casual question inside wake window", "这歌讲的什么", "这歌讲的什么", ["这歌讲的什么"])
    check("accepts song-expression question inside wake window", "这首歌想表达什么", "这首歌想表达什么", ["这首歌想表达什么"])
    check("accepts casual song-expression question inside wake window", "这歌想表达什么", "这歌想表达什么", ["这歌想表达什么"])
    check("accepts song-meaning-short question inside wake window", "这歌什么意思", "这歌什么意思", ["这歌什么意思"])
    check("accepts song-singing-meaning question inside wake window", "这首歌在唱啥", "这首歌在唱啥", ["这首歌在唱啥"])
    check("accepts this-song-theme question inside wake window", "这歌主题是啥", "这歌主题是啥", ["这歌主题是啥"])
    check("accepts casual song-writing-meaning question inside wake window", "这歌写的什么", "这歌写的什么", ["这歌写的什么"])
    check("accepts lyric-meaning question inside wake window", "歌词什么意思", "歌词什么意思", ["歌词什么意思"])
    check("accepts casual lyric-meaning question inside wake window", "歌词讲啥", "歌词讲啥", ["歌词讲啥"])
    check("accepts lyric-story question inside wake window", "讲讲歌词", "讲讲歌词", ["讲讲歌词"])
    check("accepts chorus-meaning question inside wake window", "副歌什么意思", "副歌什么意思", ["副歌什么意思"])
    check("accepts casual chorus-meaning question inside wake window", "副歌讲啥", "副歌讲啥", ["副歌讲啥"])
    check("accepts lyric-line-meaning question inside wake window", "这句歌词什么意思", "这句歌词什么意思", ["这句歌词什么意思"])
    check("accepts casual lyric-line-meaning question inside wake window", "这句词讲啥", "这句词讲啥", ["这句词讲啥"])
    check("accepts lyric-fragment-meaning question inside wake window", "这段词在讲什么", "这段词在讲什么", ["这段词在讲什么"])
    check("accepts casual lyric-fragment-meaning question inside wake window", "这段词讲啥", "这段词讲啥", ["这段词讲啥"])
    check("accepts casual sung-meaning question inside wake window", "这个歌唱的什么", "这个歌唱的什么", ["这个歌唱的什么"])
    check("accepts spoken-meaning question inside wake window", "这首歌说的是什么", "这首歌说的是什么", ["这首歌说的是什么"])
    check("accepts natural artist question inside wake window", "谁唱的", "谁唱的", ["谁唱的"])
    check("accepts recalled artist question inside wake window", "谁唱的来着", "谁唱的来着", ["谁唱的来着"])
    check("accepts recalled owner question inside wake window", "谁的歌来着", "谁的歌来着", ["谁的歌来着"])
    check("accepts casual who-sings-this question inside wake window", "这是谁唱的", "这是谁唱的", ["这是谁唱的"])
    check("accepts casual whose-song question inside wake window", "这是谁的歌", "这是谁的歌", ["这是谁的歌"])
    check("accepts short current-owner question inside wake window", "这首是谁的歌", "这首是谁的歌", ["这首是谁的歌"])
    check("accepts terse whose-song question inside wake window", "这谁的歌", "这谁的歌", ["这谁的歌"])
    check("accepts demonstrative current-origin question inside wake window", "这是哪儿的歌", "这是哪儿的歌", ["这是哪儿的歌"])
    check("accepts short current-origin question inside wake window", "这首哪儿的歌", "这首哪儿的歌", ["这首哪儿的歌"])
    check("accepts short current-artist question inside wake window", "这首谁唱的", "这首谁唱的", ["这首谁唱的"])
    check("accepts shorter current-artist question inside wake window", "这歌谁唱的", "这歌谁唱的", ["这歌谁唱的"])
    check("accepts casual current-artist question inside wake window", "现在这首谁唱的", "现在这首谁唱的", ["现在这首谁唱的"])
    check(
        "accepts negative current-artist query inside wake window",
        "不要换歌，只想知道这首谁唱的",
        "不要换歌，只想知道这首谁唱的",
        ["不要换歌，只想知道这首谁唱的"],
    )
    check("accepts casual current-song-artist question inside wake window", "现在这歌谁唱的", "现在这歌谁唱的", ["现在这歌谁唱的"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural current-city question inside wake window", "现在在哪座城市", "现在在哪座城市", ["现在在哪座城市"])
    check("accepts casual where-here question inside wake window", "现在在哪儿", "现在在哪儿", ["现在在哪儿"])
    check("accepts natural current-place question inside wake window", "我们在哪", "我们在哪", ["我们在哪"])
    check("accepts natural where-are-we-now question inside wake window", "咱们到哪儿了", "咱们到哪儿了", ["咱们到哪儿了"])
    check("accepts short where-are-we-now question inside wake window", "咱到哪了", "咱到哪了", ["咱到哪了"])
    check("accepts casual where-now question inside wake window", "现在到哪了", "现在到哪了", ["现在到哪了"])
    check("accepts current-stop-with-presently question inside wake window", "目前到哪一站了", "目前到哪一站了", ["目前到哪一站了"])
    check("accepts current-place-with-presently question inside wake window", "目前走到哪了", "目前走到哪了", ["目前走到哪了"])
    check("accepts walking-current-stop question inside wake window", "走到哪一站了", "走到哪一站了", ["走到哪一站了"])
    check("accepts terse walking-current-stop question inside wake window", "走到哪站了", "走到哪站了", ["走到哪站了"])
    check("accepts current-city-with-presently question inside wake window", "目前在哪座城市", "目前在哪座城市", ["目前在哪座城市"])
    check("accepts this-moment arrived-where question inside wake window", "这会儿到哪儿了", "这会儿到哪儿了", ["这会儿到哪儿了"])
    check("accepts this-moment where-here question inside wake window", "这会儿在哪儿", "这会儿在哪儿", ["这会儿在哪儿"])
    check("accepts this-moment broadcast-city question inside wake window", "这会儿播哪座城", "这会儿播哪座城", ["这会儿播哪座城"])
    check("accepts sunset-arrival current-place question inside wake window", "追到哪场日落了", "追到哪场日落了", ["追到哪场日落了"])
    check("accepts current-sunset-turn question inside wake window", "这会儿轮到哪场日落", "这会儿轮到哪场日落", ["这会儿轮到哪场日落"])
    check("accepts sunset-landing current-city question inside wake window", "现在落在哪座城", "现在落在哪座城", ["现在落在哪座城"])
    check("accepts current-sunset-city question inside wake window", "这场日落是哪座城", "这场日落是哪座城", ["这场日落是哪座城"])
    check("accepts natural current-sunset-city question inside wake window", "这是哪个城市的日落", "这是哪个城市的日落", ["这是哪个城市的日落"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts terse where-arrived question inside wake window", "到哪了", "到哪了", ["到哪了"])
    check("accepts casual where-arrived-er question inside wake window", "到哪儿啦", "到哪儿啦", ["到哪儿啦"])
    check("accepts casual where-arrived-here question inside wake window", "到哪里啦", "到哪里啦", ["到哪里啦"])
    check("accepts casual current-place-no-verb question inside wake window", "现在什么地方", "现在什么地方", ["现在什么地方"])
    check("accepts arrival-city question inside wake window", "到哪个城市了", "到哪个城市了", ["到哪个城市了"])
    check("accepts current-stop-index question inside wake window", "现在是第几站了", "现在是第几站了", ["现在是第几站了"])
    check("accepts walking-current-stop-index question inside wake window", "咱们走到第几站了", "咱们走到第几站了", ["咱们走到第几站了"])
    check("accepts subjectless current-stop-index question inside wake window", "第几站了", "第几站了", ["第几站了"])
    check("accepts subjectless walking-stop-index question inside wake window", "走到第几站了", "走到第几站了", ["走到第几站了"])
    check("accepts subjectless arrived-stop-index question inside wake window", "到第几站了", "到第几站了", ["到第几站了"])
    check("accepts trip-arrived-stop-index question inside wake window", "这趟到第几站了", "这趟到第几站了", ["这趟到第几站了"])
    check("accepts current-stop-which question inside wake window", "咱们是哪站", "咱们是哪站", ["咱们是哪站"])
    check("accepts current-stop-short question inside wake window", "这站是哪儿", "这站是哪儿", ["这站是哪儿"])
    check("accepts current-stop-name question inside wake window", "这站叫什么", "这站叫什么", ["这站叫什么"])
    check("accepts casual current-stop-name question inside wake window", "这站叫啥", "这站叫啥", ["这站叫啥"])
    check("accepts explicit current-stop-name question inside wake window", "这站名字叫什么", "这站名字叫什么", ["这站名字叫什么"])
    check("accepts current-stop-name explicit question inside wake window", "现在站名是什么", "现在站名是什么", ["现在站名是什么"])
    check("accepts current-city-name explicit question inside wake window", "现在城市名字是什么", "现在城市名字是什么", ["现在城市名字是什么"])
    check("accepts first-person current-stop question inside wake window", "我们这是哪站", "我们这是哪站", ["我们这是哪站"])
    check("accepts terse current-stop question inside wake window", "这是哪站", "这是哪站", ["这是哪站"])
    check("accepts current-city-name question inside wake window", "这座城市叫什么", "这座城市叫什么", ["这座城市叫什么"])
    check("accepts explicit current-city-name question inside wake window", "这座城市叫什么名字", "这座城市叫什么名字", ["这座城市叫什么名字"])
    check("accepts casual current-city-name question inside wake window", "现在这座城叫啥", "现在这座城叫啥", ["现在这座城叫啥"])
    check("accepts natural here-city question inside wake window", "这里是哪座城市", "这里是哪座城市", ["这里是哪座城市"])
    check("accepts casual here-name question inside wake window", "这里叫啥", "这里叫啥", ["这里叫啥"])
    check("accepts casual place-name question inside wake window", "这地方叫什么", "这地方叫什么", ["这地方叫什么"])
    check("accepts short this-place question inside wake window", "这儿是哪", "这儿是哪", ["这儿是哪"])
    check("accepts short here-place question inside wake window", "这里是哪", "这里是哪", ["这里是哪"])
    check("accepts short here-location question inside wake window", "这里是哪儿", "这里是哪儿", ["这里是哪儿"])
    check("accepts casual place-location question inside wake window", "这地方是哪儿", "这地方是哪儿", ["这地方是哪儿"])
    check("accepts natural current-city story question inside wake window", "讲讲这座城市", "讲讲这座城市", ["讲讲这座城市"])
    check("accepts current-city-story-now question inside wake window", "讲讲现在这座城", "讲讲现在这座城", ["讲讲现在这座城"])
    check("accepts demonstrative-city story question inside wake window", "这个城市有什么故事", "这个城市有什么故事", ["这个城市有什么故事"])
    check("accepts demonstrative-place story question inside wake window", "讲讲这个地方", "讲讲这个地方", ["讲讲这个地方"])
    check("accepts natural here-story question inside wake window", "讲讲这里", "讲讲这里", ["讲讲这里"])
    check("accepts natural current-stop story question inside wake window", "讲讲这一站", "讲讲这一站", ["讲讲这一站"])
    check("accepts terse current-stop story question inside wake window", "这站讲讲", "这站讲讲", ["这站讲讲"])
    check("accepts natural current-sunset story question inside wake window", "讲讲这场日落", "讲讲这场日落", ["讲讲这场日落"])
    check("accepts current-stop-origin question inside wake window", "这站什么来头", "这站什么来头", ["这站什么来头"])
    check("accepts natural here-feeling question inside wake window", "这里什么感觉", "这里什么感觉", ["这里什么感觉"])
    check("accepts natural here-origin question inside wake window", "这里有什么来头", "这里有什么来头", ["这里有什么来头"])
    check("accepts casual place-origin question inside wake window", "这地方什么来头", "这地方什么来头", ["这地方什么来头"])
    check("accepts terse city-origin question inside wake window", "这城什么来头", "这城什么来头", ["这城什么来头"])
    check("accepts casual city-story question inside wake window", "这座城有啥故事", "这座城有啥故事", ["这座城有啥故事"])
    check("accepts current-stop meaning question inside wake window", "这一站讲什么", "这一站讲什么", ["这一站讲什么"])
    check("accepts natural current-city songs question inside wake window", "这里有哪些歌", "这里有哪些歌", ["这里有哪些歌"])
    check("accepts casual place-songs question inside wake window", "这地方有什么歌", "这地方有什么歌", ["这地方有什么歌"])
    check("accepts terse city-songs question inside wake window", "这城有啥歌", "这城有啥歌", ["这城有啥歌"])
    check("accepts casual current-stop more-songs question inside wake window", "这站还能听啥", "这站还能听啥", ["这站还能听啥"])
    check("accepts casual current-stop available-listening question inside wake window", "这站还有啥听的", "这站还有啥听的", ["这站还有啥听的"])
    check("accepts current-stop-which-songs question inside wake window", "这站还有哪些歌", "这站还有哪些歌", ["这站还有哪些歌"])
    check("accepts current-stop-remaining-which-songs question inside wake window", "这站还剩哪些歌", "这站还剩哪些歌", ["这站还剩哪些歌"])
    check("accepts current-stop-playable-which-songs question inside wake window", "这站还能播哪些歌", "这站还能播哪些歌", ["这站还能播哪些歌"])
    check("accepts current-stop-playable-generic question inside wake window", "这站还有什么能播", "这站还有什么能播", ["这站还有什么能播"])
    check("accepts current-city-which-songs question inside wake window", "这座城还有哪些歌", "这座城还有哪些歌", ["这座城还有哪些歌"])
    check("accepts current-city-remaining-what-songs question inside wake window", "这座城还剩什么歌", "这座城还剩什么歌", ["这座城还剩什么歌"])
    check("accepts casual current-city more-songs question inside wake window", "这座城还能放啥", "这座城还能放啥", ["这座城还能放啥"])
    check("accepts current-sunset more-songs question inside wake window", "这场日落还有什么歌", "这场日落还有什么歌", ["这场日落还有什么歌"])
    check("accepts current-sunset playlist question inside wake window", "当前日落歌单里有什么", "当前日落歌单里有什么", ["当前日落歌单里有什么"])
    check("accepts current-sunset available-listening question inside wake window", "这场日落还能听啥", "这场日落还能听啥", ["这场日落还能听啥"])
    check("accepts current-sunset song-count question inside wake window", "这场日落还有几首歌", "这场日落还有几首歌", ["这场日落还有几首歌"])
    check("accepts natural current-stop playlist question inside wake window", "这站歌单里有什么", "这站歌单里有什么", ["这站歌单里有什么"])
    check("accepts current-stop song-count question inside wake window", "这站还有几首歌", "这站还有几首歌", ["这站还有几首歌"])
    check("accepts current-stop remaining-song-count question inside wake window", "这一站还剩几首", "这一站还剩几首", ["这一站还剩几首"])
    check("accepts here song-count question inside wake window", "这里还有几首歌", "这里还有几首歌", ["这里还有几首歌"])
    check("accepts current-city remaining-song-count question inside wake window", "这个城市还剩几首", "这个城市还剩几首", ["这个城市还剩几首"])
    check("accepts here remaining-listening-count question inside wake window", "这里还能听几首", "这里还能听几首", ["这里还能听几首"])
    check("accepts natural current-playlist question inside wake window", "现在歌单里有什么", "现在歌单里有什么", ["现在歌单里有什么"])
    check("accepts current-playlist remaining-count question inside wake window", "现在歌单还剩多少首", "现在歌单还剩多少首", ["现在歌单还剩多少首"])
    check("accepts future playlist-order question inside wake window", "后面歌单怎么排", "后面歌单怎么排", ["后面歌单怎么排"])
    check("accepts playlist-backhalf slang order question inside wake window", "歌单后面咋排的", "歌单后面咋排的", ["歌单后面咋排的"])
    check("accepts soon-song-order question inside wake window", "等会儿歌怎么排", "等会儿歌怎么排", ["等会儿歌怎么排"])
    check("accepts next-playlist-route question inside wake window", "接下来歌单怎么走", "接下来歌单怎么走", ["接下来歌单怎么走"])
    check("accepts today-song-order question inside wake window", "今天歌怎么排的", "今天歌怎么排的", ["今天歌怎么排的"])
    check("accepts soon-more-songs question inside wake window", "等下还有啥歌", "等下还有啥歌", ["等下还有啥歌"])
    check("accepts next-track query inside wake window", "下一首是什么", "下一首是什么", ["下一首是什么"])
    check("accepts next-track future query inside wake window", "下一首会放什么", "下一首会放什么", ["下一首会放什么"])
    check("accepts next-track play query inside wake window", "下一首播什么", "下一首播什么", ["下一首播什么"])
    check("accepts next-track artist query inside wake window", "下一首谁唱的", "下一首谁唱的", ["下一首谁唱的"])
    check("accepts next-track owner query inside wake window", "下一首是谁的歌", "下一首是谁的歌", ["下一首是谁的歌"])
    check("accepts next-track city-origin query inside wake window", "下一首是哪座城市的", "下一首是哪座城市的", ["下一首是哪座城市的"])
    check("accepts next-track place-origin query inside wake window", "下一首是哪儿的", "下一首是哪儿的", ["下一首是哪儿的"])
    check("accepts next-track from-place-origin query inside wake window", "下一首来自哪里", "下一首来自哪里", ["下一首来自哪里"])
    check("accepts next-track from-where-origin query inside wake window", "下一首从哪儿来", "下一首从哪儿来", ["下一首从哪儿来"])
    check("accepts terse next-track from-where-origin query inside wake window", "下首从哪儿来", "下首从哪儿来", ["下首从哪儿来"])
    check("accepts terse next-track place-source query inside wake window", "下首是什么地方来的", "下首是什么地方来的", ["下首是什么地方来的"])
    check("accepts upcoming-track place-origin query inside wake window", "接下来那首是哪儿的", "接下来那首是哪儿的", ["接下来那首是哪儿的"])
    check("accepts terse next-track query inside wake window", "下一首呢", "下一首呢", ["下一首呢"])
    check("accepts terse short-next-track query inside wake window", "下首呢", "下首呢", ["下首呢"])
    check("accepts bare next-track query inside wake window", "下一个呢", "下一个呢", ["下一个呢"])
    check("accepts bare next-track-what query inside wake window", "下一个是什么", "下一个是什么", ["下一个是什么"])
    check("accepts bare next-track-short query inside wake window", "下一个啥", "下一个啥", ["下一个啥"])
    check(
        "accepts negative next-track query inside wake window",
        "别切歌，我只是问下一首是什么",
        "别切歌，我只是问下一首是什么",
        ["别切歌，我只是问下一首是什么"],
    )
    check(
        "accepts negative next-track-artist query inside wake window",
        "不要换歌，只想知道下一首谁唱的",
        "不要换歌，只想知道下一首谁唱的",
        ["不要换歌，只想知道下一首谁唱的"],
    )
    check(
        "accepts no-jump next-track station fit inside wake window",
        "别跳歌，只想知道下一首为什么适合下一站",
        "别跳歌，只想知道下一首为什么适合下一站",
        ["别跳歌，只想知道下一首为什么适合下一站"],
    )
    check(
        "accepts no-cut next-city playlist reason inside wake window",
        "先别切城，想知道下一站歌单为什么这么安排",
        "先别切城，想知道下一站歌单为什么这么安排",
        ["先别切城，想知道下一站歌单为什么这么安排"],
    )
    check("accepts natural later-songs question inside wake window", "后面还有什么歌", "后面还有什么歌", ["后面还有什么歌"])
    check("accepts natural after-songs question inside wake window", "之后还有什么曲子", "之后还有什么曲子", ["之后还有什么曲子"])
    check("accepts natural upcoming-songs question inside wake window", "接下来还有哪些歌", "接下来还有哪些歌", ["接下来还有哪些歌"])
    check("accepts natural upcoming-song-count question inside wake window", "接下来还剩几首", "接下来还剩几首", ["接下来还剩几首"])
    check("accepts casual later-play question inside wake window", "等下放啥", "等下放啥", ["等下放啥"])
    check("accepts casual soon-song question inside wake window", "待会儿放什么歌", "待会儿放什么歌", ["待会儿放什么歌"])
    check("accepts later-specific-song question inside wake window", "等会儿会放哪首歌", "等会儿会放哪首歌", ["等会儿会放哪首歌"])
    check("accepts casual soon-play question inside wake window", "待会播啥", "待会播啥", ["待会播啥"])
    check("accepts casual soon-more-songs question inside wake window", "待会还有啥歌", "待会还有啥歌", ["待会还有啥歌"])
    check("accepts casual soon-count question inside wake window", "待会还剩几首", "待会还剩几首", ["待会还剩几首"])
    check("accepts today-more-songs question inside wake window", "今天还有啥歌", "今天还有啥歌", ["今天还有啥歌"])
    check("accepts tonight-more-songs question inside wake window", "今晚还有什么歌", "今晚还有什么歌", ["今晚还有什么歌"])
    check("accepts natural remaining-playlist question inside wake window", "歌单还剩什么", "歌单还剩什么", ["歌单还剩什么"])
    check("accepts casual playlist-anything question inside wake window", "歌单还有啥", "歌单还有啥", ["歌单还有啥"])
    check("accepts today-playlist-look question inside wake window", "今天歌单能看一下吗", "今天歌单能看一下吗", ["今天歌单能看一下吗"])
    check("accepts casual remaining-playlist-anything question inside wake window", "歌单还剩啥", "歌单还剩啥", ["歌单还剩啥"])
    check("accepts casual tracks-anything question inside wake window", "曲目还有啥", "曲目还有啥", ["曲目还有啥"])
    check("accepts remaining-playlist-count question inside wake window", "歌单还剩几首", "歌单还剩几首", ["歌单还剩几首"])
    check("accepts casual playlist-count question inside wake window", "歌单还有几首", "歌单还有几首", ["歌单还有几首"])
    check("accepts direct remaining-song-count question inside wake window", "还剩多少首歌", "还剩多少首歌", ["还剩多少首歌"])
    check("accepts direct more-song-count question inside wake window", "还有多少首歌", "还有多少首歌", ["还有多少首歌"])
    check("accepts natural current-stop good-songs question inside wake window", "这一站有什么好听的", "这一站有什么好听的", ["这一站有什么好听的"])
    check("accepts natural named-city songs question inside wake window", "东京有哪些歌", "东京有哪些歌", ["东京有哪些歌"])
    check("accepts named-city recommendation question inside wake window", "东京适合什么歌", "东京适合什么歌", ["东京适合什么歌"])
    check("accepts named-city matching-songs question inside wake window", "东京配什么歌", "东京配什么歌", ["东京配什么歌"])
    check("accepts named-city suggested-songs question inside wake window", "东京推荐什么歌", "东京推荐什么歌", ["东京推荐什么歌"])
    check("accepts named-city recommend-several-songs question inside wake window", "推荐几首东京的歌", "推荐几首东京的歌", ["推荐几首东京的歌"])
    check("accepts named-city quiet-songs request inside wake window", "东京来几首安静的歌", "东京来几首安静的歌", ["东京来几首安静的歌"])
    check(
        "accepts negative named-city songs query inside wake window",
        "别放东京了，我只是问东京有哪些歌",
        "别放东京了，我只是问东京有哪些歌",
        ["别放东京了，我只是问东京有哪些歌"],
    )
    check(
        "accepts negative named-city songs query with go guard inside wake window",
        "不要去东京，只想知道东京有什么歌",
        "不要去东京，只想知道东京有什么歌",
        ["不要去东京，只想知道东京有什么歌"],
    )
    check(
        "accepts negative named-city story query inside wake window",
        "别放东京了，我只是问东京有什么故事",
        "别放东京了，我只是问东京有什么故事",
        ["别放东京了，我只是问东京有什么故事"],
    )
    check(
        "accepts negative named-city story query with go guard inside wake window",
        "不要去东京，只想知道东京什么来头",
        "不要去东京，只想知道东京什么来头",
        ["不要去东京，只想知道东京什么来头"],
    )
    check("accepts natural next-stop songs question inside wake window", "下一站有什么歌", "下一站有什么歌", ["下一站有什么歌"])
    check("accepts long next-city songs question inside wake window", "下一个城市有什么歌", "下一个城市有什么歌", ["下一个城市有什么歌"])
    check("accepts shorter bare next-track query inside wake window", "下个呢", "下个呢", ["下个呢"])
    check("accepts shorter bare next-track-what query inside wake window", "下个是什么", "下个是什么", ["下个是什么"])
    check("accepts shorter bare next-track-short query inside wake window", "下个啥", "下个啥", ["下个啥"])
    check("accepts short next-stop play question inside wake window", "下站放啥", "下站放啥", ["下站放啥"])
    check("accepts short next-city play question inside wake window", "下个城市放啥", "下个城市放啥", ["下个城市放啥"])
    check("accepts natural previous-stop songs question inside wake window", "上一站有什么歌", "上一站有什么歌", ["上一站有什么歌"])
    check("accepts long previous-city songs question inside wake window", "上一个城市有什么歌", "上一个城市有什么歌", ["上一个城市有什么歌"])
    check("accepts short previous-stop play question inside wake window", "上站放啥", "上站放啥", ["上站放啥"])
    check("accepts short previous-city play question inside wake window", "前一个城市放啥", "前一个城市放啥", ["前一个城市放啥"])
    check("accepts natural next-stop question inside wake window", "下一站是哪", "下一站是哪", ["下一站是哪"])
    check("accepts casual next-stop-name question inside wake window", "下一站叫什么来着", "下一站叫什么来着", ["下一站叫什么来着"])
    check("accepts terse next-stop question inside wake window", "下一站呢", "下一站呢", ["下一站呢"])
    check("accepts short next-stop question inside wake window", "下站是哪", "下站是哪", ["下站是哪"])
    check("accepts terse short-next-stop question inside wake window", "下站呢", "下站呢", ["下站呢"])
    check("accepts short next-city question inside wake window", "下个城市是哪", "下个城市是哪", ["下个城市是哪"])
    check("accepts long next-city question inside wake window", "下一个城市是哪", "下一个城市是哪", ["下一个城市是哪"])
    check(
        "accepts negative next-stop songs question inside wake window",
        "别去下一站，我只是问下一站有什么歌",
        "别去下一站，我只是问下一站有什么歌",
        ["别去下一站，我只是问下一站有什么歌"],
    )
    check(
        "accepts negative next-city songs question inside wake window",
        "不要跳到下个城市，只想知道下个城市放啥",
        "不要跳到下个城市，只想知道下个城市放啥",
        ["不要跳到下个城市，只想知道下个城市放啥"],
    )
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts negative next-city action inside wake window", "别去下一站", "别去下一站", ["别去下一站"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts negative previous-city action inside wake window", "别回上一站", "别回上一站", ["别回上一站"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts negative next-city switch action inside wake window", "不要换到下个城市", "不要换到下个城市", ["不要换到下个城市"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check(
        "accepts next-stop story question inside wake window",
        "下一站有什么故事",
        "下一站有什么故事",
        ["下一站有什么故事"],
    )
    check(
        "accepts negative next-stop story question inside wake window",
        "别去下一站，我只是问下一站有什么故事",
        "别去下一站，我只是问下一站有什么故事",
        ["别去下一站，我只是问下一站有什么故事"],
    )
    check(
        "accepts negative next-city story question inside wake window",
        "不要跳到下个城市，只想知道下个城市什么来头",
        "不要跳到下个城市，只想知道下个城市什么来头",
        ["不要跳到下个城市，只想知道下个城市什么来头"],
    )
    check(
        "accepts negative next-stop question inside wake window",
        "我只是想看看下一站，别跳过去",
        "我只是想看看下一站，别跳过去",
        ["我只是想看看下一站，别跳过去"],
    )
    check(
        "accepts negative next-city question inside wake window",
        "我只是问下个城市，不要切过去",
        "我只是问下个城市，不要切过去",
        ["我只是问下个城市，不要切过去"],
    )
    check("accepts later-next-place question inside wake window", "等会儿去哪儿", "等会儿去哪儿", ["等会儿去哪儿"])
    check("accepts short-soon-next-place question inside wake window", "等下去哪儿", "等下去哪儿", ["等下去哪儿"])
    check("accepts casual-later-next-place question inside wake window", "待会去哪", "待会去哪", ["待会去哪"])
    check("accepts soon-next-place question inside wake window", "一会儿去哪", "一会儿去哪", ["一会儿去哪"])
    check("accepts after-next-place question inside wake window", "之后去哪儿", "之后去哪儿", ["之后去哪儿"])
    check("accepts next-segment-place question inside wake window", "下一段去哪儿", "下一段去哪儿", ["下一段去哪儿"])
    check("accepts then-next-place question inside wake window", "然后去哪", "然后去哪", ["然后去哪"])
    check("accepts further-next-place question inside wake window", "再往后去哪", "再往后去哪", ["再往后去哪"])
    check("accepts further-arrival-place question inside wake window", "再往后会到哪", "再往后会到哪", ["再往后会到哪"])
    check("accepts natural next-stop eta question inside wake window", "下一站还有多久", "下一站还有多久", ["下一站还有多久"])
    check("accepts casual next-stop eta question inside wake window", "多久到下一站", "多久到下一站", ["多久到下一站"])
    check("accepts compact short-next-stop-arrival question inside wake window", "下站多久到", "下站多久到", ["下站多久到"])
    check("accepts target-first next-stop-arrival question inside wake window", "下一站什么时候到", "下一站什么时候到", ["下一站什么时候到"])
    check("accepts target-first next-city eta question inside wake window", "下个城市还有多久", "下个城市还有多久", ["下个城市还有多久"])
    check("accepts long target-first next-city eta question inside wake window", "下一个城市还有多久", "下一个城市还有多久", ["下一个城市还有多久"])
    check("accepts nearly-next-stop question inside wake window", "快到下一站了吗", "快到下一站了吗", ["快到下一站了吗"])
    check("accepts minute-style next-stop eta question inside wake window", "还有几分钟到下一站", "还有几分钟到下一站", ["还有几分钟到下一站"])
    check("accepts natural previous-stop question inside wake window", "上一站是哪", "上一站是哪", ["上一站是哪"])
    check("accepts terse previous-stop question inside wake window", "上一站呢", "上一站呢", ["上一站呢"])
    check("accepts terse short-previous-stop question inside wake window", "上站呢", "上站呢", ["上站呢"])
    check("accepts long previous-city question inside wake window", "上一个城市是哪", "上一个城市是哪", ["上一个城市是哪"])
    check(
        "accepts negative previous-stop question inside wake window",
        "只是问上一站别跳回去",
        "只是问上一站别跳回去",
        ["只是问上一站别跳回去"],
    )
    check(
        "accepts negative previous-stop songs question inside wake window",
        "别回上一站，我只是问上一站有什么歌",
        "别回上一站，我只是问上一站有什么歌",
        ["别回上一站，我只是问上一站有什么歌"],
    )
    check(
        "accepts negative previous-city songs question inside wake window",
        "不要跳回上个城市，只想知道上个城市放啥",
        "不要跳回上个城市，只想知道上个城市放啥",
        ["不要跳回上个城市，只想知道上个城市放啥"],
    )
    check(
        "accepts previous-stop story question inside wake window",
        "上一站有什么故事",
        "上一站有什么故事",
        ["上一站有什么故事"],
    )
    check(
        "accepts negative previous-stop story question inside wake window",
        "别回上一站，我只是问上一站有什么故事",
        "别回上一站，我只是问上一站有什么故事",
        ["别回上一站，我只是问上一站有什么故事"],
    )
    check(
        "accepts negative previous-city story question inside wake window",
        "不要跳回上个城市，只想知道上个城市什么来头",
        "不要跳回上个城市，只想知道上个城市什么来头",
        ["不要跳回上个城市，只想知道上个城市什么来头"],
    )
    check("accepts former-city question inside wake window", "前一个城市是哪", "前一个城市是哪", ["前一个城市是哪"])
    check("accepts casual previous-stop question inside wake window", "刚才那站是哪", "刚才那站是哪", ["刚才那站是哪"])
    check("accepts terse casual previous-stop question inside wake window", "刚才那站呢", "刚才那站呢", ["刚才那站呢"])
    check("accepts casual previous-city-pointing question inside wake window", "刚才那个城市是哪", "刚才那个城市是哪", ["刚才那个城市是哪"])
    check("accepts return-to-previous-stop phrase inside wake window", "回到刚才那站", "回到刚才那站", ["回到刚才那站"])
    check("accepts casual previous-place question inside wake window", "之前在哪", "之前在哪", ["之前在哪"])
    check("accepts casual previous-city question inside wake window", "刚才在哪个城市", "刚才在哪个城市", ["刚才在哪个城市"])
    check("accepts natural route-places question inside wake window", "后面还有哪些地方", "后面还有哪些地方", ["后面还有哪些地方"])
    check("accepts casual remaining-sunsets route question inside wake window", "后面还有哪几个日落", "后面还有哪几个日落", ["后面还有哪几个日落"])
    check("accepts casual next-sunsets route question inside wake window", "接下来还有哪些日落", "接下来还有哪些日落", ["接下来还有哪些日落"])
    check("accepts casual chasing-sunsets route question inside wake window", "今天还追哪些日落", "今天还追哪些日落", ["今天还追哪些日落"])
    check("accepts temporal chasing-sunsets route question inside wake window", "待会还追哪几个日落", "待会还追哪几个日落", ["待会还追哪几个日落"])
    check("accepts tonight route-cities question inside wake window", "今晚会经过哪些城市", "今晚会经过哪些城市", ["今晚会经过哪些城市"])
    check("accepts today route-cities question inside wake window", "今天会去哪些城市", "今天会去哪些城市", ["今天会去哪些城市"])
    check("accepts today-where-next route question inside wake window", "今天还会去哪", "今天还会去哪", ["今天还会去哪"])
    check("accepts today-pass-places route question inside wake window", "今天还会经过哪些地方", "今天还会经过哪些地方", ["今天还会经过哪些地方"])
    check("accepts today-where-pass route question inside wake window", "今天这趟会经过哪里", "今天这趟会经过哪里", ["今天这趟会经过哪里"])
    check("accepts casual radio-route question inside wake window", "今天电台怎么走", "今天电台怎么走", ["今天电台怎么走"])
    check("accepts subjectless route-where question inside wake window", "还会去哪儿", "还会去哪儿", ["还会去哪儿"])
    check("accepts casual later-route-where question inside wake window", "后面还去哪", "后面还去哪", ["后面还去哪"])
    check("accepts casual next-route-walk question inside wake window", "接下来还走哪儿", "接下来还走哪儿", ["接下来还走哪儿"])
    check("accepts casual later-route-passby question inside wake window", "后面还经过哪里", "后面还经过哪里", ["后面还经过哪里"])
    check("accepts later-route-station question inside wake window", "待会儿到哪站", "待会儿到哪站", ["待会儿到哪站"])
    check("accepts route-this-way-pass-cities question inside wake window", "这一路还要经过哪些城市", "这一路还要经过哪些城市", ["这一路还要经过哪些城市"])
    check("accepts casual route-arrangement-zha question inside wake window", "路线咋安排", "路线咋安排", ["路线咋安排"])
    check("accepts casual remaining-route-passby question inside wake window", "剩下还经过哪里", "剩下还经过哪里", ["剩下还经过哪里"])
    check("accepts casual further-remaining-stations question inside wake window", "再往后还有哪几站", "再往后还有哪几站", ["再往后还有哪几站"])
    check("accepts casual further-sunset-count route question inside wake window", "再往后还有几场日落", "再往后还有几场日落", ["再往后还有几场日落"])
    check("accepts later-sunset-count route question inside wake window", "后面还有几个日落", "后面还有几个日落", ["后面还有几个日落"])
    check(
        "accepts next-sunset-count route question inside wake window",
        "接下来还有几个日落",
        "接下来还有几个日落",
        ["接下来还有几个日落"],
    )
    check(
        "accepts later-remaining-sunset-count route question inside wake window",
        "后面还剩多少个日落",
        "后面还剩多少个日落",
        ["后面还剩多少个日落"],
    )
    check("accepts today remaining-sunset-count route question inside wake window", "今天还剩多少日落", "今天还剩多少日落", ["今天还剩多少日落"])
    check("accepts trip remaining-sunset-count route question inside wake window", "这趟还剩多少日落", "这趟还剩多少日落", ["这趟还剩多少日落"])
    check("accepts direct trip-route-name question inside wake window", "这趟路线是什么", "这趟路线是什么", ["这趟路线是什么"])
    check("accepts direct radio-route-name question inside wake window", "电台路线是什么", "电台路线是什么", ["电台路线是什么"])
    check("accepts casual trip-route question inside wake window", "这趟怎么走", "这趟怎么走", ["这趟怎么走"])
    check("accepts casual route-arrangement question inside wake window", "今天这趟电台怎么安排", "今天这趟电台怎么安排", ["今天这趟电台怎么安排"])
    check("accepts casual later-route question inside wake window", "这趟电台后面去哪", "这趟电台后面去哪", ["这趟电台后面去哪"])
    check("accepts trip-duration route question inside wake window", "这趟还有多久", "这趟还有多久", ["这趟还有多久"])
    check("accepts radio-ending route question inside wake window", "今天电台什么时候结束", "今天电台什么时候结束", ["今天电台什么时候结束"])
    check("accepts later-duration route question inside wake window", "后面还要多久", "后面还要多久", ["后面还要多久"])
    check("accepts route-rationale question inside wake window", "这趟为什么这么安排", "这趟为什么这么安排", ["这趟为什么这么安排"])
    check("accepts named route-rationale question inside wake window", "为什么接下来去东京", "为什么接下来去东京", ["为什么接下来去东京"])
    check(
        "accepts guarded next-stop rationale question inside wake window",
        "别切到下一站，只问下一站为什么去那里",
        "别切到下一站，只问下一站为什么去那里",
        ["别切到下一站，只问下一站为什么去那里"],
    )
    check("accepts current-stop route-position rationale inside wake window", "现在这站为什么在这儿", "现在这站为什么在这儿", ["现在这站为什么在这儿"])
    check("accepts named-city route-position rationale inside wake window", "东京为什么排这里", "东京为什么排这里", ["东京为什么排这里"])
    check("accepts named route-presence question inside wake window", "今天会去东京吗", "今天会去东京吗", ["今天会去东京吗"])
    check("accepts named route-passby question inside wake window", "后面会路过东京吗", "后面会路过东京吗", ["后面会路过东京吗"])
    check("accepts named route-membership question inside wake window", "东京在今天路线里吗", "东京在今天路线里吗", ["东京在今天路线里吗"])
    check("accepts named route-whether question inside wake window", "今天会不会去东京", "今天会不会去东京", ["今天会不会去东京"])
    check("accepts named route-whether-passby question inside wake window", "后面会不会路过东京啊", "后面会不会路过东京啊", ["后面会不会路过东京啊"])
    check("accepts named route-has-city question inside wake window", "这趟有没有东京", "这趟有没有东京", ["这趟有没有东京"])
    check("accepts route-has-city question inside wake window", "路线里有没有东京", "路线里有没有东京", ["路线里有没有东京"])
    check("accepts named route-trip-passby question inside wake window", "这趟会经过东京吗", "这趟会经过东京吗", ["这趟会经过东京吗"])
    check("accepts named route-today-passby question inside wake window", "今天会不会路过东京", "今天会不会路过东京", ["今天会不会路过东京"])
    check("accepts named route-later-presence question inside wake window", "后面有没有东京", "后面有没有东京", ["后面有没有东京"])
    check("accepts named route-later-still-presence question inside wake window", "后面是不是还有东京", "后面是不是还有东京", ["后面是不是还有东京"])
    check("accepts next-city named question inside wake window", "下个城市是不是东京", "下个城市是不是东京", ["下个城市是不是东京"])
    check("accepts named city eta question inside wake window", "东京什么时候到", "东京什么时候到", ["东京什么时候到"])
    check("accepts named city remaining-time question inside wake window", "还有多久到东京", "还有多久到东京", ["还有多久到东京"])
    check("accepts named city route-order question inside wake window", "东京排第几站", "东京排第几站", ["东京排第几站"])
    check("accepts named sunset chase question inside wake window", "这趟还追不追东京的日落", "这趟还追不追东京的日落", ["这趟还追不追东京的日落"])
    check("accepts subjectless next-sunset-place question inside wake window", "下一场在哪儿", "下一场在哪儿", ["下一场在哪儿"])
    check("accepts casual later-route-city question inside wake window", "后面还有啥城市", "后面还有啥城市", ["后面还有啥城市"])
    check("accepts casual followup-route-city question inside wake window", "后续还有啥城市", "后续还有啥城市", ["后续还有啥城市"])
    check("accepts subjectless remaining-route-city question inside wake window", "剩下啥城市", "剩下啥城市", ["剩下啥城市"])
    check("accepts subjectless remaining-city-count question inside wake window", "剩下几座城市", "剩下几座城市", ["剩下几座城市"])
    check("accepts trip-later-city-count question inside wake window", "这趟后面还有几座城", "这趟后面还有几座城", ["这趟后面还有几座城"])
    check("accepts casual later-city-list question inside wake window", "待会儿还有哪几座城", "待会儿还有哪几座城", ["待会儿还有哪几座城"])
    check("accepts subjectless remaining-place-count question inside wake window", "剩下还有几个地方", "剩下还有几个地方", ["剩下还有几个地方"])
    check("accepts casual later-route-plan question inside wake window", "后面怎么走", "后面怎么走", ["后面怎么走"])
    check("accepts casual later-route-plan-with-route-word inside wake window", "后面路线怎么安排", "后面路线怎么安排", ["后面路线怎么安排"])
    check("accepts casual later-route-zha question inside wake window", "后面咋走", "后面咋走", ["后面咋走"])
    check("accepts casual next-route-zha question inside wake window", "接下来咋走", "接下来咋走", ["接下来咋走"])
    check("accepts casual next-route-arrangement question inside wake window", "接下来怎么安排", "接下来怎么安排", ["接下来怎么安排"])
    check("accepts casual later-route-zha-arrangement question inside wake window", "后面咋安排", "后面咋安排", ["后面咋安排"])
    check("accepts casual later-place question inside wake window", "后面还有什么地方", "后面还有什么地方", ["后面还有什么地方"])
    check("accepts pass-by route question inside wake window", "这趟还会路过哪儿", "这趟还会路过哪儿", ["这趟还会路过哪儿"])
    check("accepts next-pass-by route question inside wake window", "接下来路过哪儿", "接下来路过哪儿", ["接下来路过哪儿"])
    check("accepts later-pass-by route question inside wake window", "后面路过哪里", "后面路过哪里", ["后面路过哪里"])
    check("accepts remaining-where route question inside wake window", "剩下会去哪儿", "剩下会去哪儿", ["剩下会去哪儿"])
    check("accepts remaining-stops route question inside wake window", "这趟还有几站", "这趟还有几站", ["这趟还有几站"])
    check("accepts casual remaining-stops route question inside wake window", "这趟还剩几站", "这趟还剩几站", ["这趟还剩几站"])
    check("accepts route remaining-places casual question inside wake window", "这趟剩下啥地方", "这趟剩下啥地方", ["这趟剩下啥地方"])
    check("accepts subjectless remaining-stops route question inside wake window", "还剩几站", "还剩几站", ["还剩几站"])
    check("accepts subjectless remaining-stops-count route question inside wake window", "剩下多少站", "剩下多少站", ["剩下多少站"])
    check("accepts remaining-which-stations route question inside wake window", "剩下还有哪些站", "剩下还有哪些站", ["剩下还有哪些站"])
    check("accepts remaining-which-stations-specific route question inside wake window", "剩下还有哪几站", "剩下还有哪几站", ["剩下还有哪几站"])
    check("accepts remaining-which-stations-with-remainder route question inside wake window", "余下还有哪些站", "余下还有哪些站", ["余下还有哪些站"])
    check("accepts later-which-stations route question inside wake window", "后面还有哪些站", "后面还有哪些站", ["后面还有哪些站"])
    check("accepts remaining-cities route question inside wake window", "这趟还剩几个城市", "这趟还剩几个城市", ["这趟还剩几个城市"])
    check("accepts remaining-city-count route question inside wake window", "这趟还剩几座城", "这趟还剩几座城", ["这趟还剩几座城"])
    check("accepts route-path remaining-city-count question inside wake window", "这一路还剩几座城", "这一路还剩几座城", ["这一路还剩几座城"])
    check("accepts remaining-which-cities route question inside wake window", "这趟还剩哪些城市", "这趟还剩哪些城市", ["这趟还剩哪些城市"])
    check("accepts later remaining-cities terse question inside wake window", "后面还剩哪些城", "后面还剩哪些城", ["后面还剩哪些城"])
    check("accepts next-pass-by city-count route question inside wake window", "接下来还路过哪几座城", "接下来还路过哪几座城", ["接下来还路过哪几座城"])
    check("accepts today-remaining-stations route question inside wake window", "今天还剩哪些站", "今天还剩哪些站", ["今天还剩哪些站"])
    check("accepts radio-later-remaining-stations route question inside wake window", "电台后面还剩哪些站", "电台后面还剩哪些站", ["电台后面还剩哪些站"])
    check("accepts natural 24h program request inside wake window", "帮我安排一档24小时音乐电台", "帮我安排一档24小时音乐电台", ["帮我安排一档24小时音乐电台"])
    check("accepts daylong sunset radio request inside wake window", "规划一整天的日落电台", "规划一整天的日落电台", ["规划一整天的日落电台"])
    check("accepts natural open playlist request inside wake window", "帮我挑几首海边日落的歌", "帮我挑几首海边日落的歌", ["帮我挑几首海边日落的歌"])
    check("accepts natural way-home playlist request inside wake window", "回家路上来点稳的歌", "回家路上来点稳的歌", ["回家路上来点稳的歌"])
    check("accepts casual later-songs question inside wake window", "等会儿还有什么歌", "等会儿还有什么歌", ["等会儿还有什么歌"])
    check("accepts commute-stable playlist request inside wake window", "通勤路上来点稳的歌", "通勤路上来点稳的歌", ["通勤路上来点稳的歌"])
    check("accepts rainy playlist request inside wake window", "雨天来点歌", "雨天来点歌", ["雨天来点歌"])
    check("accepts natural walking quiet playlist request inside wake window", "外面散步来点不吵的歌", "外面散步来点不吵的歌", ["外面散步来点不吵的歌"])
    check("accepts bedtime slow playlist request inside wake window", "睡前来点慢的", "睡前来点慢的", ["睡前来点慢的"])
    check("accepts pressure-soft playlist request inside wake window", "压力有点大来点柔和的", "压力有点大来点柔和的", ["压力有点大来点柔和的"])
    check("accepts focus-friendly playlist request inside wake window", "工作时来点不抢注意力的", "工作时来点不抢注意力的", ["工作时来点不抢注意力的"])
    check("accepts quiet come-a-song request inside wake window", "我想安静一点来首不吵的歌", "我想安静一点播放不吵的歌", ["我想安静一点播放不吵的歌"])
    check("accepts not-too-loud song request inside wake window", "我有点累别太吵的歌", "我有点累别太吵的歌", ["我有点累别太吵的歌"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("normalizes bare quiet song request inside wake window", "来首不吵的", "播放不吵的", ["播放不吵的"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("normalizes bare not-too-loud song request inside wake window", "来首别太吵的", "播放别太吵的", ["播放别太吵的"])
    check("accepts natural privacy no-spy question inside wake window", "你会偷拍吗", "你会偷拍吗", ["你会偷拍吗"])
    check("accepts natural audio privacy no-eavesdrop question inside wake window", "你会偷听吗", "你会偷听吗", ["你会偷听吗"])
    check("accepts colloquial no-stealth-record privacy question inside wake window", "你会不会偷录", "你会不会偷录", ["你会不会偷录"])
    check("accepts colloquial no-stealth-watch privacy question inside wake window", "你会不会偷看", "你会不会偷看", ["你会不会偷看"])
    check("accepts direct no-stealth-record privacy phrase inside wake window", "别偷录", "别偷录", ["别偷录"])
    check("accepts direct no-stealth-watch privacy phrase inside wake window", "别偷看", "别偷看", ["别偷看"])
    check("accepts direct no-stealth-photo privacy phrase inside wake window", "别偷拍", "别偷拍", ["别偷拍"])
    check("accepts terse recording-now privacy question inside wake window", "你在录吗", "你在录吗", ["你在录吗"])
    check("accepts terse shooting-now privacy question inside wake window", "你在拍吗", "你在拍吗", ["你在拍吗"])
    check("accepts terse recorded privacy question inside wake window", "你录了吗", "你录了吗", ["你录了吗"])
    check("accepts terse shot privacy question inside wake window", "你拍了吗", "你拍了吗", ["你拍了吗"])
    check("accepts direct recorded-me privacy question inside wake window", "你有没有录我", "你有没有录我", ["你有没有录我"])
    check("accepts direct shot-me privacy question inside wake window", "你有没有拍我", "你有没有拍我", ["你有没有拍我"])
    check("accepts previous audio-record privacy question inside wake window", "刚才有录音吗", "刚才有录音吗", ["刚才有录音吗"])
    check("accepts previous photo privacy question inside wake window", "刚才拍照了吗", "刚才拍照了吗", ["刚才拍照了吗"])
    check("accepts always-listening privacy question inside wake window", "你是不是一直在听", "你是不是一直在听", ["你是不是一直在听"])
    check("accepts always-watching privacy question inside wake window", "你是不是一直在看", "你是不是一直在看", ["你是不是一直在看"])
    check("accepts colloquial always-recording privacy question inside wake window", "会不会一直录", "会不会一直录", ["会不会一直录"])
    check("accepts colloquial always-shooting privacy question inside wake window", "会不会一直拍", "会不会一直拍", ["会不会一直拍"])
    check("accepts microphone-off privacy question inside wake window", "麦克风关了吗", "麦克风关了吗", ["麦克风关了吗"])
    check("accepts camera-off privacy question inside wake window", "摄像头关着吗", "摄像头关着吗", ["摄像头关着吗"])
    check("accepts microphone-on privacy question inside wake window", "麦克风开着吗", "麦克风开着吗", ["麦克风开着吗"])
    check("accepts short open-mic privacy question inside wake window", "你一直开着麦吗", "你一直开着麦吗", ["你一直开着麦吗"])
    check("accepts short mic-still-on privacy question inside wake window", "现在麦还开着吗", "现在麦还开着吗", ["现在麦还开着吗"])
    check("accepts short mic-off privacy question inside wake window", "麦关了吗", "麦关了吗", ["麦关了吗"])
    check("accepts camera-on privacy question inside wake window", "摄像头开着吗", "摄像头开着吗", ["摄像头开着吗"])
    check("accepts reverse camera-open privacy question inside wake window", "你现在有没有开摄像头", "你现在有没有开摄像头", ["你现在有没有开摄像头"])
    check("accepts reverse microphone-open privacy question inside wake window", "你现在有没有开麦克风", "你现在有没有开麦克风", ["你现在有没有开麦克风"])
    check("accepts reverse camera-open-short privacy question inside wake window", "有没有打开相机", "有没有打开相机", ["有没有打开相机"])
    check("accepts reverse microphone-open-short privacy question inside wake window", "有没有打开麦克风", "有没有打开麦克风", ["有没有打开麦克风"])
    check("accepts natural microphone recording privacy question inside wake window", "麦克风会一直录音吗", "麦克风会一直录音吗", ["麦克风会一直录音吗"])
    check("accepts casual record-down privacy question inside wake window", "你会不会录下来", "你会不会录下来", ["你会不会录下来"])
    check("accepts audio-retention privacy question inside wake window", "录音会保存吗", "录音会保存吗", ["录音会保存吗"])
    check("accepts spoken-words-retention privacy question inside wake window", "我说的话会保存吗", "我说的话会保存吗", ["我说的话会保存吗"])
    check("accepts voice-upload privacy question inside wake window", "我的语音会上传吗", "我的语音会上传吗", ["我的语音会上传吗"])
    check("accepts subjectless voice-cloud privacy question inside wake window", "会不会把我的语音传云端", "会不会把我的语音传云端", ["会不会把我的语音传云端"])
    check("accepts voice-save privacy question inside wake window", "你会保存我的声音吗", "你会保存我的声音吗", ["你会保存我的声音吗"])
    check("accepts voice-store privacy question inside wake window", "你会把我的声音存起来吗", "你会把我的声音存起来吗", ["你会把我的声音存起来吗"])
    check("accepts casual voice-store privacy question inside wake window", "你会不会存我的声音", "你会不会存我的声音", ["你会不会存我的声音"])
    check("accepts chat-log-store privacy question inside wake window", "会不会存聊天记录", "会不会存聊天记录", ["会不会存聊天记录"])
    check("accepts this-segment-upload privacy question inside wake window", "这段会不会上传", "这段会不会上传", ["这段会不会上传"])
    check("accepts no-voice-cloud-upload privacy phrase inside wake window", "别把声音传到云端", "别把声音传到云端", ["别把声音传到云端"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts terse no-cloud-upload privacy phrase inside wake window", "别传云端", "别传云端", ["别传云端"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-cloud-upload privacy phrase inside wake window", "不要传到云端", "不要传到云端", ["不要传到云端"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-this-sentence-upload privacy phrase inside wake window", "这句不要上传", "这句不要上传", ["这句不要上传"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts this-sentence-save privacy question inside wake window", "这段话会保存吗", "这段话会保存吗", ["这段话会保存吗"])
    check("accepts voice-share privacy question inside wake window", "你会把我的声音发给别人吗", "你会把我的声音发给别人吗", ["你会把我的声音发给别人吗"])
    check("accepts chat-log-share privacy question inside wake window", "会不会把聊天记录发给别人", "会不会把聊天记录发给别人", ["会不会把聊天记录发给别人"])
    check("accepts no-this-segment-share privacy phrase inside wake window", "别把这段话发给别人", "别把这段话发给别人", ["别把这段话发给别人"])
    check("accepts server-upload privacy question inside wake window", "会不会传到服务器", "会不会传到服务器", ["会不会传到服务器"])
    check("accepts no-server-upload privacy phrase inside wake window", "别传到服务器", "别传到服务器", ["别传到服务器"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-cloud-sync privacy phrase inside wake window", "不要同步到云端", "不要同步到云端", ["不要同步到云端"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts model-training privacy question inside wake window", "你会拿我的声音训练模型吗", "你会拿我的声音训练模型吗", ["你会拿我的声音训练模型吗"])
    check("accepts no-model-training privacy phrase inside wake window", "别拿我的话训练模型", "别拿我的话训练模型", ["别拿我的话训练模型"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts this-segment-training privacy question inside wake window", "这段会拿去训练吗", "这段会拿去训练吗", ["这段会拿去训练吗"])
    check("accepts no-spoken-words-memory privacy phrase inside wake window", "别记住我说的话", "别记住我说的话", ["别记住我说的话"])
    check("accepts no-just-said-words-memory phrase inside wake window", "别记我刚才的话", "别记我刚才的话", ["别记我刚才的话"])
    check("accepts no-location-memory privacy phrase inside wake window", "别记住我的位置", "别记住我的位置", ["别记住我的位置"])
    check("accepts no-identity-memory privacy phrase inside wake window", "别记住我是谁", "别记住我是谁", ["别记住我是谁"])
    check("accepts no-name-memory privacy phrase inside wake window", "不要记住我的名字", "不要记住我的名字", ["不要记住我的名字"])
    check("accepts identity-retention privacy question inside wake window", "你会记住我的名字吗", "你会记住我的名字吗", ["你会记住我的名字吗"])
    check("accepts no-identity-save privacy phrase inside wake window", "不要保存我的身份", "不要保存我的身份", ["不要保存我的身份"])
    check("accepts no-companion-memory privacy phrase inside wake window", "别记住我和谁在一起", "别记住我和谁在一起", ["别记住我和谁在一起"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-location-memory-inverted privacy phrase inside wake window", "别把我的位置记下来", "别把我的位置记下来", ["别把我的位置记下来"])
    check("accepts location-retention privacy question inside wake window", "会保存我的位置吗", "会保存我的位置吗", ["会保存我的位置吗"])
    check("accepts no-location-upload privacy phrase inside wake window", "不要上传我的定位", "不要上传我的定位", ["不要上传我的定位"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-route-memory privacy phrase inside wake window", "别记我的路线", "别记我的路线", ["别记我的路线"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts outdoor route-location memory privacy phrase inside wake window", "出门了别记我的路线和位置", "出门了别记我的路线和位置", ["出门了别记我的路线和位置"])
    check("accepts friend-company memory privacy question inside wake window", "我现在和朋友在一起这件事你会一直记住吗", "我现在和朋友在一起这件事你会一直记住吗", ["我现在和朋友在一起这件事你会一直记住吗"])
    check("accepts coworker-company memory privacy question inside wake window", "我跟同事同行这件事会保存吗", "我跟同事同行这件事会保存吗", ["我跟同事同行这件事会保存吗"])
    check("accepts preference-long-term-memory guard inside wake window", "别把我刚才说喜欢爵士写进长期记忆", "别把我刚才说喜欢爵士写进长期记忆", ["别把我刚才说喜欢爵士写进长期记忆"])
    check("accepts mood-long-term-memory question inside wake window", "我刚才心情不好这事会存起来吗", "我刚才心情不好这事会存起来吗", ["我刚才心情不好这事会存起来吗"])
    check("accepts current-dialog-preference-memory phrase inside wake window", "只在当前对话里记住我想听慢一点", "只在当前对话里记住我想听慢一点", ["只在当前对话里记住我想听慢一点"])
    check("accepts temporary-listen-memory phrase inside wake window", "临时记一下我现在想听慢一点", "临时记一下我现在想听慢一点", ["临时记一下我现在想听慢一点"])
    check("accepts tonight-playlist-memory phrase inside wake window", "刚说的歌单口味只留到今晚", "刚说的歌单口味只留到今晚", ["刚说的歌单口味只留到今晚"])
    check("accepts tonight-mood-forget-memory phrase inside wake window", "这段心情过了今晚就忘掉", "这段心情过了今晚就忘掉", ["这段心情过了今晚就忘掉"])
    check("accepts current-round-now-preference-memory phrase inside wake window", "这轮只记我现在想听慢歌", "这轮只记我现在想听慢歌", ["这轮只记我现在想听慢歌"])
    check("accepts current-round-tonight-preference-memory phrase inside wake window", "这次只记我今晚想听安静歌", "这次只记我今晚想听安静歌", ["这次只记我今晚想听安静歌"])
    check("accepts tonight-after-forget-preference phrase inside wake window", "今晚过后别记得我喜欢这种歌", "今晚过后别记得我喜欢这种歌", ["今晚过后别记得我喜欢这种歌"])
    check("accepts just-said-mood-tonight-memory phrase inside wake window", "刚说的心情只留到今晚", "刚说的心情只留到今晚", ["刚说的心情只留到今晚"])
    check("accepts current-mood-no-long-term-memory phrase inside wake window", "我现在心情不好这事别长期记", "我现在心情不好这事别长期记", ["我现在心情不好这事别长期记"])
    check("accepts tomorrow-forget-preference memory guard inside wake window", "明天别记得我喜欢海边日落", "明天别记得我喜欢海边日落", ["明天别记得我喜欢海边日落"])
    check("accepts today-preference-tomorrow-forget memory guard inside wake window", "今天喜欢爵士这事明天别记得", "今天喜欢爵士这事明天别记得", ["今天喜欢爵士这事明天别记得"])
    check("accepts utterance-next-time-memory phrase inside wake window", "这句话别带到下次", "这句话别带到下次", ["这句话别带到下次"])
    check("accepts message-current-round-plain-memory phrase inside wake window", "这条消息只留本轮可以吗", "这条消息只留本轮可以吗", ["这条消息只留本轮可以吗"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-itinerary-save privacy phrase inside wake window", "不要保存我的行程", "不要保存我的行程", ["不要保存我的行程"])
    check("accepts route-retention privacy question inside wake window", "会保存我的路线吗", "会保存我的路线吗", ["会保存我的路线吗"])
    check("accepts no-tracking privacy phrase inside wake window", "别跟踪我", "别跟踪我", ["别跟踪我"])
    check("accepts no-trail-tracking privacy phrase inside wake window", "不要追踪我的轨迹", "不要追踪我的轨迹", ["不要追踪我的轨迹"])
    check("accepts tracking privacy question inside wake window", "会跟踪我吗", "会跟踪我吗", ["会跟踪我吗"])
    check("accepts no-this-sentence-memory privacy phrase inside wake window", "这句别记了", "这句别记了", ["这句别记了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-bare-memory privacy phrase inside wake window", "别记下来", "别记下来", ["别记下来"])
    check("accepts no-bare-memory-polite privacy phrase inside wake window", "不要记下来", "不要记下来", ["不要记下来"])
    check("accepts no-previous-sentence-memory privacy phrase inside wake window", "刚才那句别记", "刚才那句别记", ["刚才那句别记"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-this-segment-store privacy phrase inside wake window", "这段别存", "这段别存", ["这段别存"])
    check("accepts no-this-sentence-store privacy phrase inside wake window", "别存这句话", "别存这句话", ["别存这句话"])
    check("accepts no-short-sentence-store privacy phrase inside wake window", "不要存这句", "不要存这句", ["不要存这句"])
    check("accepts no-previous-sentence-save privacy phrase inside wake window", "刚才那句不要保存", "刚才那句不要保存", ["刚才那句不要保存"])
    check("accepts no-just-said-save privacy phrase inside wake window", "别保存我刚说的", "别保存我刚说的", ["别保存我刚说的"])
    check("accepts no-just-now-segment-store privacy phrase inside wake window", "刚刚那段别存", "刚刚那段别存", ["刚刚那段别存"])
    check("accepts no-this-thing-save privacy phrase inside wake window", "别保存这个", "别保存这个", ["别保存这个"])
    check("accepts no-this-record-log privacy phrase inside wake window", "别留这条记录", "别留这条记录", ["别留这条记录"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-chat-log privacy phrase inside wake window", "别留聊天记录", "别留聊天记录", ["别留聊天记录"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-debug-log privacy phrase inside wake window", "刚才那句不要进日志", "刚才那句不要进日志", ["刚才那句不要进日志"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-log-english privacy phrase inside wake window", "这句话别写到log里", "这句话别写到log里", ["这句话别写到log里"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-archive privacy phrase inside wake window", "别存档", "别存档", ["别存档"])
    check("accepts direct no-audio-recording privacy phrase inside wake window", "别录音", "别录音", ["别录音"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual no-recording privacy phrase inside wake window", "别录了", "别录了", ["别录了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts direct no-always-listening privacy phrase inside wake window", "不要一直听我", "不要一直听我", ["不要一直听我"])
    check("accepts direct no-open-mic privacy phrase inside wake window", "别开麦", "别开麦", ["别开麦"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts direct no-monitoring privacy phrase inside wake window", "不要监听我", "不要监听我", ["不要监听我"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural camera auto-on question inside wake window", "相机会自动开吗", "相机会自动开吗", ["相机会自动开吗"])
    check("accepts camera-secret-auto-open privacy question inside wake window", "相机会不会偷偷开", "相机会不会偷偷开", ["相机会不会偷偷开"])
    check("accepts can-see-me privacy question inside wake window", "你现在看得到我吗", "你现在看得到我吗", ["你现在看得到我吗"])
    check("accepts natural face-recognition privacy question inside wake window", "会识别人脸吗", "会识别人脸吗", ["会识别人脸吗"])
    check("accepts identity-recognition privacy question inside wake window", "你会认出我是谁吗", "你会认出我是谁吗", ["你会认出我是谁吗"])
    check("accepts no-identity-recognition privacy phrase inside wake window", "不要识别我是谁", "不要识别我是谁", ["不要识别我是谁"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts identity-judgement privacy question inside wake window", "会判断我是谁吗", "会判断我是谁吗", ["会判断我是谁吗"])
    check("accepts photo-capture privacy question inside wake window", "会不会拍下来", "会不会拍下来", ["会不会拍下来"])
    check("accepts photo-retention privacy question inside wake window", "照片会保存吗", "照片会保存吗", ["照片会保存吗"])
    check("accepts photo-delete-after-capture privacy question inside wake window", "拍完会删吗", "拍完会删吗", ["拍完会删吗"])
    check("accepts photo-delete-retention privacy question inside wake window", "照片会删掉吗", "照片会删掉吗", ["照片会删掉吗"])
    check("accepts photo-delete-after-analysis privacy question inside wake window", "分析后会删图吗", "分析后会删图吗", ["分析后会删图吗"])
    check("accepts direct no-photo privacy phrase inside wake window", "别拍我", "别拍我", ["别拍我"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual no-photo privacy phrase inside wake window", "别拍了", "别拍了", ["别拍了"])
    check("accepts direct no-camera-watch privacy phrase inside wake window", "不要看我", "不要看我", ["不要看我"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts direct no-recording privacy phrase inside wake window", "别录像", "别录像", ["别录像"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural current-wifi question inside wake window", "现在连的是哪个Wi-Fi", "现在连的是哪个Wi-Fi", ["现在连的是哪个Wi-Fi"])
    check("accepts current-wifi-mounted question inside wake window", "现在挂在哪个WiFi", "现在挂在哪个WiFi", ["现在挂在哪个WiFi"])
    check("accepts terse current-wifi-name question inside wake window", "当前WiFi叫什么", "当前WiFi叫什么", ["当前WiFi叫什么"])
    check("accepts casual wifi-which question inside wake window", "Wi-Fi连的哪个", "Wi-Fi连的哪个", ["Wi-Fi连的哪个"])
    check("accepts current-wifi-use question inside wake window", "现在用哪个Wi-Fi", "现在用哪个Wi-Fi", ["现在用哪个Wi-Fi"])
    check("accepts current-network-route question inside wake window", "走的是哪个网络", "走的是哪个网络", ["走的是哪个网络"])
    check("accepts current-network-card-route question inside wake window", "现在走哪张网", "现在走哪张网", ["现在走哪张网"])
    check("accepts current-network-card-use question inside wake window", "你现在用哪张网", "你现在用哪张网", ["你现在用哪张网"])
    check("accepts outdoor-hotspot-ready question inside wake window", "出门热点准备好了吗", "出门热点准备好了吗", ["出门热点准备好了吗"])
    check("accepts casual network-route question inside wake window", "网络走哪儿", "网络走哪儿", ["网络走哪儿"])
    check("accepts home-wifi-still question inside wake window", "还在家里Wi-Fi上吗", "还在家里Wi-Fi上吗", ["还在家里Wi-Fi上吗"])
    check("accepts reversed home-wifi-still-connected question inside wake window", "家里wifi还连着吗", "家里wifi还连着吗", ["家里wifi还连着吗"])
    check("accepts current-home-network-attached question inside wake window", "现在是不是连着家里网", "现在是不是连着家里网", ["现在是不是连着家里网"])
    check("accepts reversed current-wifi-name question inside wake window", "Wi-Fi现在是哪一个", "Wi-Fi现在是哪一个", ["Wi-Fi现在是哪一个"])
    check("accepts current-home-wifi question inside wake window", "现在用的还是家里Wi-Fi吗", "现在用的还是家里Wi-Fi吗", ["现在用的还是家里Wi-Fi吗"])
    check("accepts home-or-phone-hotspot status question inside wake window", "现在连的是家里网还是手机热点", "现在连的是家里网还是手机热点", ["现在连的是家里网还是手机热点"])
    check("accepts home-or-cellular-route status question inside wake window", "现在走家里网还是手机流量", "现在走家里网还是手机流量", ["现在走家里网还是手机流量"])
    check("accepts home-wifi-cutaway question inside wake window", "有没有从家里wifi切出来", "有没有从家里wifi切出来", ["有没有从家里wifi切出来"])
    check("accepts current-phone-hotspot-mounted question inside wake window", "现在是不是挂着我手机热点", "现在是不是挂着我手机热点", ["现在是不是挂着我手机热点"])
    check("accepts iphone-hotspot-mounted question inside wake window", "iPhone热点现在挂上没", "iPhone热点现在挂上没", ["iPhone热点现在挂上没"])
    check("accepts phone-hotspot connected question inside wake window", "连上我手机了吗", "连上我手机了吗", ["连上我手机了吗"])
    check("accepts bare phone-hotspot connected question inside wake window", "连我的手机了吗", "连我的手机了吗", ["连我的手机了吗"])
    check("accepts short phone-connected question inside wake window", "现在连上手机没", "现在连上手机没", ["现在连上手机没"])
    check("accepts no-not-phone-connected question inside wake window", "现在连没连我手机", "现在连没连我手机", ["现在连没连我手机"])
    check("accepts direct no-not-phone-connected question inside wake window", "你连没连我手机", "你连没连我手机", ["你连没连我手机"])
    check("accepts iphone-connected question inside wake window", "连上iPhone了吗", "连上iPhone了吗", ["连上iPhone了吗"])
    check("accepts my-iphone-connected question inside wake window", "我的iPhone连上了吗", "我的iPhone连上了吗", ["我的iPhone连上了吗"])
    check("accepts apple-phone-connected question inside wake window", "苹果手机连上了吗", "苹果手机连上了吗", ["苹果手机连上了吗"])
    check("accepts plain-vivo-attached question inside wake window", "现在接的是vivo吗", "现在接的是vivo吗", ["现在接的是vivo吗"])
    check("accepts vivo-connected-to question inside wake window", "连到PocketEarth-Android了吗", "连到PocketEarth-Android了吗", ["连到PocketEarth-Android了吗"])
    check("accepts vivo-connected-status question inside wake window", "PocketEarth-Android连上了吗", "PocketEarth-Android连上了吗", ["PocketEarth-Android连上了吗"])
    check("accepts reverse phone-connected question inside wake window", "手机连上了吗", "手机连上了吗", ["手机连上了吗"])
    check("accepts phone-attached question inside wake window", "现在接上手机了吗", "现在接上手机了吗", ["现在接上手机了吗"])
    check("accepts phone-still-attached question inside wake window", "现在是不是连着手机", "现在是不是连着手机", ["现在是不是连着手机"])
    check("accepts casual phone-tether question inside wake window", "你现在蹭的是我手机吗", "你现在蹭的是我手机吗", ["你现在蹭的是我手机吗"])
    check("accepts casual phone-network-tether question inside wake window", "现在蹭我手机网吗", "现在蹭我手机网吗", ["现在蹭我手机网吗"])
    check("accepts explicit phone-network-tether question inside wake window", "现在是不是蹭我手机网", "现在是不是蹭我手机网", ["现在是不是蹭我手机网"])
    check("accepts my-network-tether question inside wake window", "你蹭上我的网了吗", "你蹭上我的网了吗", ["你蹭上我的网了吗"])
    check("accepts explicit my-hotspot route question inside wake window", "有没有走我的热点", "有没有走我的热点", ["有没有走我的热点"])
    check("accepts casual my-cellular-tether question inside wake window", "现在还蹭着我的流量吗", "现在还蹭着我的流量吗", ["现在还蹭着我的流量吗"])
    check("accepts casual phone-network-route question inside wake window", "还走着我手机网吗", "还走着我手机网吗", ["还走着我手机网吗"])
    check("accepts casual personal-hotspot-in-use question inside wake window", "是不是还用着我的个人热点", "是不是还用着我的个人热点", ["是不是还用着我的个人热点"])
    check("accepts current-my-hotspot-route question inside wake window", "现在是不是走的我手机热点", "现在是不是走的我手机热点", ["现在是不是走的我手机热点"])
    check("accepts my-hotspot-in-use question inside wake window", "有没有用上我的热点", "有没有用上我的热点", ["有没有用上我的热点"])
    check("accepts casual hotspot status question inside wake window", "帮我看看热点连上没", "帮我看看热点连上没", ["帮我看看热点连上没"])
    check("accepts current-phone-hotspot question inside wake window", "现在用的是手机热点吗", "现在用的是手机热点吗", ["现在用的是手机热点吗"])
    check("accepts named-phone-hotspot status question inside wake window", "现在连的是PocketEarth-iPhone吗", "现在连的是PocketEarth-iPhone吗", ["现在连的是PocketEarth-iPhone吗"])
    check("accepts iphone-to-vivo failover question inside wake window", "iPhone连不上会不会试vivo", "iPhone连不上会不会试vivo", ["iPhone连不上会不会试vivo"])
    check("accepts named-iphone-to-vivo failover question inside wake window", "PocketEarth-iPhone没找到会不会找vivo", "PocketEarth-iPhone没找到会不会找vivo", ["PocketEarth-iPhone没找到会不会找vivo"])
    check("accepts apple-hotspot-to-vivo failover question inside wake window", "苹果热点没找到会不会再找PocketEarth-Android", "苹果热点没找到会不会再找PocketEarth-Android", ["苹果热点没找到会不会再找PocketEarth-Android"])
    check("accepts apple-then-vivo priority question inside wake window", "先找苹果再找vivo对吗", "先找苹果再找vivo对吗", ["先找苹果再找vivo对吗"])
    check("accepts vivo-to-home-wifi fallback question inside wake window", "vivo也没找到会不会回家里Wi-Fi", "vivo也没找到会不会回家里Wi-Fi", ["vivo也没找到会不会回家里Wi-Fi"])
    check("accepts phone-cellular-status question inside wake window", "用上手机流量了吗", "用上手机流量了吗", ["用上手机流量了吗"])
    check("accepts no-not-phone-network question inside wake window", "你用没用上我手机网", "你用没用上我手机网", ["你用没用上我手机网"])
    check("accepts phone-cellular-connected question inside wake window", "连上手机流量没", "连上手机流量没", ["连上手机流量没"])
    check("accepts phone-cellular-route question inside wake window", "现在走手机流量吗", "现在走手机流量吗", ["现在走手机流量吗"])
    check("accepts cellular-connected question inside wake window", "流量连上了吗", "流量连上了吗", ["流量连上了吗"])
    check("accepts my-phone-cellular-cutover question inside wake window", "有没有切到我手机流量", "有没有切到我手机流量", ["有没有切到我手机流量"])
    check("accepts my-cellular-cutover question inside wake window", "有没有切到我的流量", "有没有切到我的流量", ["有没有切到我的流量"])
    check("accepts wifi-dropped status question inside wake window", "Wi-Fi是不是掉了", "Wi-Fi是不是掉了", ["Wi-Fi是不是掉了"])
    check("accepts wireless-broken status question inside wake window", "无线是不是断了", "无线是不是断了", ["无线是不是断了"])
    check("accepts cellular-reachable question inside wake window", "手机流量通了吗", "手机流量通了吗", ["手机流量通了吗"])
    check("accepts casual cellular-reachable question inside wake window", "流量是不是通了", "流量是不是通了", ["流量是不是通了"])
    check("accepts network-reachable question inside wake window", "网络通了吗", "网络通了吗", ["网络通了吗"])
    check("accepts internet-reachable question inside wake window", "联网通了吗", "联网通了吗", ["联网通了吗"])
    check("accepts connected-to-internet question inside wake window", "连上网了吗", "连上网了吗", ["连上网了吗"])
    check("accepts network-still-reachable question inside wake window", "网还通吗", "网还通吗", ["网还通吗"])
    check("accepts has-internet question inside wake window", "有没有联网", "有没有联网", ["有没有联网"])
    check("accepts network-recovered question inside wake window", "网络恢复了吗", "网络恢复了吗", ["网络恢复了吗"])
    check("accepts natural online question inside wake window", "你能上网吗", "你能上网吗", ["你能上网吗"])
    check("accepts current online question inside wake window", "现在还在线吗", "现在还在线吗", ["现在还在线吗"])
    check("accepts bare online question inside wake window", "是不是在线", "是不是在线", ["是不是在线"])
    check("accepts alive network question inside wake window", "网还活着吗", "网还活着吗", ["网还活着吗"])
    check("accepts natural connected-network question inside wake window", "现在联网了吗", "现在联网了吗", ["现在联网了吗"])
    check("accepts natural network-presence question inside wake window", "现在有没有网", "现在有没有网", ["现在有没有网"])
    check("accepts natural network-stability question inside wake window", "网络现在稳吗", "网络现在稳吗", ["网络现在稳吗"])
    check("accepts casual network-quality question inside wake window", "现在网咋样", "现在网咋样", ["现在网咋样"])
    check("accepts casual network-condition question inside wake window", "网络怎么样", "网络怎么样", ["网络怎么样"])
    check("accepts terse network-still-stable question inside wake window", "网还稳吗", "网还稳吗", ["网还稳吗"])
    check("accepts terse network-presence question inside wake window", "还有网吗", "还有网吗", ["还有网吗"])
    check("accepts terse network-alive question inside wake window", "网还在吗", "网还在吗", ["网还在吗"])
    check("accepts terse network-broken question inside wake window", "网断了吗", "网断了吗", ["网断了吗"])
    check("accepts natural network-broken question inside wake window", "网络是不是断了", "网络是不是断了", ["网络是不是断了"])
    check("accepts offline-status question inside wake window", "是不是离线了", "是不是离线了", ["是不是离线了"])
    check("accepts network-dropped-line question inside wake window", "网络掉线了吗", "网络掉线了吗", ["网络掉线了吗"])
    check("accepts casual network-hung question inside wake window", "网是不是挂了", "网是不是挂了", ["网是不是挂了"])
    check("accepts casual network-broken-device question inside wake window", "网坏了吗", "网坏了吗", ["网坏了吗"])
    check("accepts natural not-connected question inside wake window", "现在是不是没联网", "现在是不是没联网", ["现在是不是没联网"])
    check("accepts natural device-dropped-line question inside wake window", "你是不是掉线了", "你是不是掉线了", ["你是不是掉线了"])
    check("accepts casual can-still-use-internet question inside wake window", "还能不能上网", "还能不能上网", ["还能不能上网"])
    check("accepts natural offline phrase inside wake window", "没网了", "没网了", ["没网了"])
    check("accepts outdoor no-network recovery question inside wake window", "出门没网时怎么连回来", "出门没网时怎么连回来", ["出门没网时怎么连回来"])
    check("accepts no-network playback-safety question inside wake window", "没有网还会播放吗", "没有网还会播放吗", ["没有网还会播放吗"])
    check("accepts no-network random-play guard inside wake window", "没网了会不会乱播", "没网了会不会乱播", ["没网了会不会乱播"])
    check("accepts dropped-wifi repair phrase inside wake window", "Wi-Fi掉了帮我连回热点", "Wi-Fi掉了帮我连回热点", ["Wi-Fi掉了帮我连回热点"])
    check("accepts unstable-network repair phrase inside wake window", "网络不稳帮我修一下", "网络不稳帮我修一下", ["网络不稳帮我修一下"])
    check(
        "accepts hotspot-misfire question inside wake window",
        "手机只剩一格信号，会不会乱连热点",
        "手机只剩一格信号，会不会乱连热点",
        ["手机只剩一格信号，会不会乱连热点"],
    )
    check(
        "accepts low-signal hotspot-advice question inside wake window",
        "手机信号只有一格，还要不要连热点",
        "手机信号只有一格，还要不要连热点",
        ["手机信号只有一格，还要不要连热点"],
    )
    check(
        "accepts guarded outdoor-hotspot advice inside wake window",
        "手机信号太差，别连热点，只想知道还能不能出门",
        "手机信号太差，别连热点，只想知道还能不能出门",
        ["手机信号太差，别连热点，只想知道还能不能出门"],
    )
    check(
        "accepts low-power guarded hotspot advice inside wake window",
        "带你出去但手机快没电，别连热点，只说建议",
        "带你出去但手机快没电，别连热点，只说建议",
        ["带你出去但手机快没电，别连热点，只说建议"],
    )
    check(
        "accepts missing-primary-hotspot policy question inside wake window",
        "出门时找不到PocketEarth-iPhone会怎么处理",
        "出门时找不到PocketEarth-iPhone会怎么处理",
        ["出门时找不到PocketEarth-iPhone会怎么处理"],
    )
    check(
        "accepts missing-vivo-hotspot policy question inside wake window",
        "PocketEarth-Android没找到会怎么兜底",
        "PocketEarth-Android没找到会怎么兜底",
        ["PocketEarth-Android没找到会怎么兜底"],
    )
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts runtime maintenance phrase inside wake window", "帮我维护一下", "帮我维护一下", ["帮我维护一下"])
    check("accepts cache cleanup phrase inside wake window", "清理一下缓存", "清理一下缓存", ["清理一下缓存"])
    check("accepts restore-state maintenance phrase inside wake window", "帮我恢复一下状态", "帮我恢复一下状态", ["帮我恢复一下状态"])
    check("accepts tidy-runtime maintenance phrase inside wake window", "后台收拾一下", "后台收拾一下", ["后台收拾一下"])
    check("accepts self-repair maintenance phrase inside wake window", "你自己修复一下", "你自己修复一下", ["你自己修复一下"])
    check("accepts natural phone-hotspot switch phrase inside wake window", "帮我换到手机热点", "帮我换到手机热点", ["帮我换到手机热点"])
    check("accepts natural phone-hotspot cutover phrase inside wake window", "切去手机热点", "切去手机热点", ["切去手机热点"])
    check("accepts phone-hotspot-ready phrase inside wake window", "我手机热点开好了", "我手机热点开好了", ["我手机热点开好了"])
    check("accepts hotspot-opened phrase inside wake window", "热点已经打开了", "热点已经打开了", ["热点已经打开了"])
    check("accepts phone-hotspot-open phrase inside wake window", "手机热点开了", "手机热点开了", ["手机热点开了"])
    check("accepts phone-cellular-ready phrase inside wake window", "手机流量开了", "手机流量开了", ["手机流量开了"])
    check("accepts phone-cellular-ready-done phrase inside wake window", "手机流量开好了", "手机流量开好了", ["手机流量开好了"])
    check("accepts phone-network-ready phrase inside wake window", "手机网络开好了", "手机网络开好了", ["手机网络开好了"])
    check("accepts terse cellular-ready phrase inside wake window", "流量开好了", "流量开好了", ["流量开好了"])
    check("accepts personal-hotspot-opened phrase inside wake window", "我打开个人热点了", "我打开个人热点了", ["我打开个人热点了"])
    check("accepts casual my-hotspot-ready phrase inside wake window", "我的热点好了", "我的热点好了", ["我的热点好了"])
    check("accepts casual hotspot-prepared phrase inside wake window", "我把热点弄好了", "我把热点弄好了", ["我把热点弄好了"])
    check("accepts natural hotspot-prepared phrase inside wake window", "我弄好热点了", "我弄好热点了", ["我弄好热点了"])
    check("accepts iphone-hotspot-connect phrase inside wake window", "连一下iPhone热点", "连一下iPhone热点", ["连一下iPhone热点"])
    check("accepts named-iphone-hotspot-connect phrase inside wake window", "帮我连PocketEarth-iPhone", "帮我连PocketEarth-iPhone", ["帮我连PocketEarth-iPhone"])
    check("accepts named-vivo-hotspot-connect phrase inside wake window", "帮我连PocketEarth-Android", "帮我连PocketEarth-Android", ["帮我连PocketEarth-Android"])
    check("accepts vivo-hotspot-cutover phrase inside wake window", "切到vivo热点", "切到vivo热点", ["切到vivo热点"])
    check("accepts vivo-hotspot-switch phrase inside wake window", "换到vivo热点", "换到vivo热点", ["换到vivo热点"])
    check("accepts apple-phone-hotspot-connect phrase inside wake window", "用苹果手机热点", "用苹果手机热点", ["用苹果手机热点"])
    check("accepts phone-cellular-use phrase inside wake window", "用我手机流量", "用我手机流量", ["用我手机流量"])
    check("accepts negative hotspot action guard inside wake window", "别连我的热点", "别连我的热点", ["别连我的热点"])
    check("accepts negative phone-hotspot guard inside wake window", "不要连手机热点", "不要连手机热点", ["不要连手机热点"])
    check("accepts negative vivo-hotspot guard inside wake window", "别切到vivo热点", "别切到vivo热点", ["别切到vivo热点"])
    check(
        "accepts guarded hotspot-status question inside wake window",
        "别连接热点，我只是问热点连上了吗",
        "别连接热点，我只是问热点连上了吗",
        ["别连接热点，我只是问热点连上了吗"],
    )
    check(
        "accepts guarded vivo-priority question inside wake window",
        "不要切到vivo热点，只想知道vivo排第几",
        "不要切到vivo热点，只想知道vivo排第几",
        ["不要切到vivo热点，只想知道vivo排第几"],
    )
    check(
        "accepts guarded current-wifi question inside wake window",
        "别连手机热点，问一下现在用的是哪个Wi-Fi",
        "别连手机热点，问一下现在用的是哪个Wi-Fi",
        ["别连手机热点，问一下现在用的是哪个Wi-Fi"],
    )
    check("accepts my-cellular-use phrase inside wake window", "用我的流量吧", "用我的流量吧", ["用我的流量吧"])
    check("accepts my-cellular-route phrase inside wake window", "走我的流量", "走我的流量", ["走我的流量"])
    check("accepts personal-hotspot-route phrase inside wake window", "走我的个人热点", "走我的个人热点", ["走我的个人热点"])
    check("accepts phone-network-switch phrase inside wake window", "换我手机网络", "换我手机网络", ["换我手机网络"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts repeat-last reply phrase inside wake window", "再说一遍", "再说一遍", ["再说一遍"])
    check("accepts casual what-did-you-say phrase inside wake window", "你刚说啥", "你刚说啥", ["你刚说啥"])
    check("accepts casual just-said phrase inside wake window", "你刚刚说啥", "你刚刚说啥", ["你刚刚说啥"])
    check("accepts casual what-did-you-reply phrase inside wake window", "你刚才回我啥", "你刚才回我啥", ["你刚才回我啥"])
    check("accepts casual just-replied phrase inside wake window", "你刚刚回我啥", "你刚刚回我啥", ["你刚刚回我啥"])
    check("accepts terse just-replied phrase inside wake window", "你刚回我啥", "你刚回我啥", ["你刚回我啥"])
    check("accepts inverted just-replied phrase inside wake window", "刚才你回啥", "刚才你回啥", ["刚才你回啥"])
    check("accepts terse reply-what phrase inside wake window", "刚回复了什么", "刚回复了什么", ["刚回复了什么"])
    check("accepts previous-replied phrase inside wake window", "上一句你回我啥", "上一句你回我啥", ["上一句你回我啥"])
    check("accepts short previous-replied phrase inside wake window", "上一句回啥", "上一句回啥", ["上一句回啥"])
    check("accepts previous-reply phrase inside wake window", "你上一句说什么", "你上一句说什么", ["你上一句说什么"])
    check("accepts last-action skill phrase inside wake window", "刚才调用了什么技能", "刚才调用了什么技能", ["刚才调用了什么技能"])
    check("accepts natural last-action phrase inside wake window", "你刚才做了什么", "你刚才做了什么", ["你刚才做了什么"])
    check("accepts casual last-action phrase inside wake window", "刚才干啥了", "刚才干啥了", ["刚才干啥了"])
    check("accepts terse just-action phrase inside wake window", "你刚干啥了", "你刚干啥了", ["你刚干啥了"])
    check("accepts casual just-action did-what phrase inside wake window", "刚刚搞了啥来着", "刚刚搞了啥来着", ["刚刚搞了啥来着"])
    check("accepts casual what-did-you-do phrase inside wake window", "你刚刚干嘛了", "你刚刚干嘛了", ["你刚刚干嘛了"])
    check("accepts terse previous-action did-what phrase inside wake window", "刚才弄了啥", "刚才弄了啥", ["刚才弄了啥"])
    check("accepts executed-action phrase inside wake window", "执行了什么动作", "执行了什么动作", ["执行了什么动作"])
    check("accepts last-capability phrase inside wake window", "用了哪个能力", "用了哪个能力", ["用了哪个能力"])
    check("accepts last-tool phrase inside wake window", "你用了什么工具", "你用了什么工具", ["你用了什么工具"])
    check("accepts casual previous-tool phrase inside wake window", "刚才用的什么工具", "刚才用的什么工具", ["刚才用的什么工具"])
    check("accepts casual previous-skill-call phrase inside wake window", "刚才调了哪个skill", "刚才调了哪个skill", ["刚才调了哪个skill"])
    check("accepts casual previous-tool-call phrase inside wake window", "你刚才调了啥工具", "你刚才调了啥工具", ["你刚才调了啥工具"])
    check("accepts terse previous-tool-call phrase inside wake window", "刚才你到底调了啥", "刚才你到底调了啥", ["刚才你到底调了啥"])
    check("accepts casual previous-skill-route phrase inside wake window", "刚才走的是哪个skill", "刚才走的是哪个skill", ["刚才走的是哪个skill"])
    check("accepts terse previous-tool phrase inside wake window", "刚用啥工具", "刚用啥工具", ["刚用啥工具"])
    check("accepts terse previous-capability phrase inside wake window", "你刚用了啥能力", "你刚用了啥能力", ["你刚用了啥能力"])
    check("accepts last-route-tool phrase inside wake window", "上一条走了哪个工具", "上一条走了哪个工具", ["上一条走了哪个工具"])
    check("accepts short previous-route-tool phrase inside wake window", "上条走了哪个工具", "上条走了哪个工具", ["上条走了哪个工具"])
    check("accepts short previous-used-tool phrase inside wake window", "上条用了什么工具", "上条用了什么工具", ["上条用了什么工具"])
    check("accepts previous-action-tool-used-natural phrase inside wake window", "刚才那个用到什么工具", "刚才那个用到什么工具", ["刚才那个用到什么工具"])
    check("accepts previous-step-capability-used-natural phrase inside wake window", "上一步用到哪个能力", "上一步用到哪个能力", ["上一步用到哪个能力"])
    check("accepts short previous-route destination phrase inside wake window", "上条路由到哪了", "上条路由到哪了", ["上条路由到哪了"])
    check("accepts previous-route destination phrase inside wake window", "上一条路由到哪里了", "上一条路由到哪里了", ["上一条路由到哪里了"])
    check("accepts previous-step route destination phrase inside wake window", "上一步路由到哪了", "上一步路由到哪了", ["上一步路由到哪了"])
    check("accepts casual previous-route destination phrase inside wake window", "上一回路由到哪了", "上一回路由到哪了", ["上一回路由到哪了"])
    check("accepts current-route destination phrase inside wake window", "这次路由到哪了", "这次路由到哪了", ["这次路由到哪了"])
    check("accepts last-result phrase inside wake window", "刚才结果怎么样", "刚才结果怎么样", ["刚才结果怎么样"])
    check("accepts previous-result phrase inside wake window", "上一条结果怎么样", "上一条结果怎么样", ["上一条结果怎么样"])
    check("accepts short previous-result phrase inside wake window", "上条结果怎么样", "上条结果怎么样", ["上条结果怎么样"])
    check("accepts previous-step result phrase inside wake window", "上一步结果呢", "上一步结果呢", ["上一步结果呢"])
    check("accepts previous-time result phrase inside wake window", "上次结果呢", "上次结果呢", ["上次结果呢"])
    check("accepts just-now casual result phrase inside wake window", "刚刚那个结果呢", "刚刚那个结果呢", ["刚刚那个结果呢"])
    check("accepts casual previous-item result phrase inside wake window", "刚才那条有结果吗", "刚才那条有结果吗", ["刚才那条有结果吗"])
    check("accepts previous-command status phrase inside wake window", "上一条怎么样", "上一条怎么样", ["上一条怎么样"])
    check("accepts short previous-command status phrase inside wake window", "上条怎么样", "上条怎么样", ["上条怎么样"])
    check("accepts previous-round status phrase inside wake window", "上一轮怎么样", "上一轮怎么样", ["上一轮怎么样"])
    check("accepts previous-request-long status phrase inside wake window", "上一个请求怎么样", "上一个请求怎么样", ["上一个请求怎么样"])
    check("accepts casual previous-item status phrase inside wake window", "刚才那条怎么样", "刚才那条怎么样", ["刚才那条怎么样"])
    check("accepts casual previous-thing status phrase inside wake window", "刚才那个怎么样", "刚才那个怎么样", ["刚才那个怎么样"])
    check("accepts just-now previous-thing status phrase inside wake window", "刚刚那个怎么样", "刚刚那个怎么样", ["刚刚那个怎么样"])
    check("accepts casual previous-step status phrase inside wake window", "刚才那步怎么样", "刚才那步怎么样", ["刚才那步怎么样"])
    check("accepts just-now previous-step status phrase inside wake window", "刚刚那步怎么样", "刚刚那步怎么样", ["刚刚那步怎么样"])
    check("accepts casual previous-item done phrase inside wake window", "刚才那条跑完了吗", "刚才那条跑完了吗", ["刚才那条跑完了吗"])
    check("accepts terse previous-item done phrase inside wake window", "刚那条跑完没", "刚那条跑完没", ["刚那条跑完没"])
    check("accepts last-action success phrase inside wake window", "刚才成功了吗", "刚才成功了吗", ["刚才成功了吗"])
    check("accepts casual last-action done phrase inside wake window", "刚才搞定了吗", "刚才搞定了吗", ["刚才搞定了吗"])
    check("accepts previous-step success phrase inside wake window", "上一步成功了吗", "上一步成功了吗", ["上一步成功了吗"])
    check("accepts previous-step accomplished phrase inside wake window", "上一步办成了吗", "上一步办成了吗", ["上一步办成了吗"])
    check("accepts previous-step done phrase inside wake window", "上一步搞定了吗", "上一步搞定了吗", ["上一步搞定了吗"])
    check("accepts terse previous-item success phrase inside wake window", "刚那个成功没", "刚那个成功没", ["刚那个成功没"])
    check("accepts last-action smooth phrase inside wake window", "刚才顺利吗", "刚才顺利吗", ["刚才顺利吗"])
    check("accepts previous-step smooth phrase inside wake window", "上一步顺利吗", "上一步顺利吗", ["上一步顺利吗"])
    check("accepts previous-command problem phrase inside wake window", "上一条有问题吗", "上一条有问题吗", ["上一条有问题吗"])
    check("accepts previous-step problem phrase inside wake window", "上一步出问题了吗", "上一步出问题了吗", ["上一步出问题了吗"])
    check("accepts last-action no-problem phrase inside wake window", "刚才没问题吧", "刚才没问题吧", ["刚才没问题吧"])
    check("accepts previous-action-error phrase inside wake window", "上个动作有报错吗", "上个动作有报错吗", ["上个动作有报错吗"])
    check("accepts previous-thing-done-casual phrase inside wake window", "刚才那个弄好了吗", "刚才那个弄好了吗", ["刚才那个弄好了吗"])
    check("accepts previous-row-done-casual phrase inside wake window", "上一条弄成了吗", "上一条弄成了吗", ["上一条弄成了吗"])
    check("accepts previous-time-success-casual phrase inside wake window", "刚刚那次成功没", "刚刚那次成功没", ["刚刚那次成功没"])
    check("accepts previous-action-stuck-casual phrase inside wake window", "上个动作卡住了吗", "上个动作卡住了吗", ["上个动作卡住了吗"])
    check("accepts previous-queue-casual phrase inside wake window", "刚才那条还在队列里吗", "刚才那条还在队列里吗", ["刚才那条还在队列里吗"])
    check("accepts previous-result-screen-casual phrase inside wake window", "刚刚那个结果写屏了吗", "刚刚那个结果写屏了吗", ["刚刚那个结果写屏了吗"])
    check("accepts backend-action-done-casual phrase inside wake window", "后台动作有没有完成", "后台动作有没有完成", ["后台动作有没有完成"])
    check("accepts current-action-ran-through phrase inside wake window", "这次跑通了吗", "这次跑通了吗", ["这次跑通了吗"])
    check("accepts just-now-error phrase inside wake window", "刚刚有报错吗", "刚刚有报错吗", ["刚刚有报错吗"])
    check("accepts previous-request-status phrase inside wake window", "上个请求怎么样", "上个请求怎么样", ["上个请求怎么样"])
    check("accepts previous-command success phrase inside wake window", "上一条执行成功了吗", "上一条执行成功了吗", ["上一条执行成功了吗"])
    check("accepts short previous-command success phrase inside wake window", "上条成功了吗", "上条成功了吗", ["上条成功了吗"])
    check("accepts last-action failure phrase inside wake window", "刚才失败了吗", "刚才失败了吗", ["刚才失败了吗"])
    check("accepts previous-command failure phrase inside wake window", "上一条失败了吗", "上一条失败了吗", ["上一条失败了吗"])
    check("accepts short previous-command failure phrase inside wake window", "上条失败了吗", "上条失败了吗", ["上条失败了吗"])
    check("accepts short previous-command not-success phrase inside wake window", "上条没成功吗", "上条没成功吗", ["上条没成功吗"])
    check("accepts natural help-me capability phrase inside wake window", "你可以帮我做什么", "你可以帮我做什么", ["你可以帮我做什么"])
    check("accepts natural ability-talents phrase inside wake window", "你有什么本领", "你有什么本领", ["你有什么本领"])
    check("accepts natural ability-skills phrase inside wake window", "你有哪些本事", "你有哪些本事", ["你有哪些本事"])
    check("accepts natural tool-list phrase inside wake window", "你有哪些工具", "你有哪些工具", ["你有哪些工具"])
    check("accepts mixed-language skill-list phrase inside wake window", "你有哪些skill", "你有哪些skill", ["你有哪些skill"])
    check("accepts casual tool-call list phrase inside wake window", "你能调哪些工具", "你能调哪些工具", ["你能调哪些工具"])
    check("accepts capability-list phrase inside wake window", "你都有哪些能力", "你都有哪些能力", ["你都有哪些能力"])
    check("accepts supported-skills phrase inside wake window", "你支持什么技能", "你支持什么技能", ["你支持什么技能"])
    check("accepts callable-what phrase inside wake window", "现在能调用什么", "现在能调用什么", ["现在能调用什么"])
    check("accepts casual callable-what phrase inside wake window", "你现在能调用啥", "你现在能调用啥", ["你现在能调用啥"])
    check("accepts tool-calling phrase inside wake window", "会调用哪些工具", "会调用哪些工具", ["会调用哪些工具"])
    check("accepts casual usable-skills phrase inside wake window", "能用什么技能", "能用什么技能", ["能用什么技能"])
    check("accepts action-calling phrase inside wake window", "你可以调用哪些动作", "你可以调用哪些动作", ["你可以调用哪些动作"])
    check("accepts executable-actions phrase inside wake window", "你能执行哪些动作", "你能执行哪些动作", ["你能执行哪些动作"])
    check("accepts terse action-list phrase inside wake window", "动作列表", "动作列表", ["动作列表"])
    check("accepts action-capabilities phrase inside wake window", "你有哪些动作能力", "你有哪些动作能力", ["你有哪些动作能力"])
    check("accepts operation-capabilities phrase inside wake window", "你会做哪些操作", "你会做哪些操作", ["你会做哪些操作"])
    check("accepts terse operation-capabilities phrase inside wake window", "你会哪些操作", "你会哪些操作", ["你会哪些操作"])
    check("accepts operable-things capability phrase inside wake window", "你能操作哪些东西", "你能操作哪些东西", ["你能操作哪些东西"])
    check("accepts controllable-things capability phrase inside wake window", "你能控制哪些东西", "你能控制哪些东西", ["你能控制哪些东西"])
    check("accepts casual what-can-you-do phrase inside wake window", "现在能干啥", "现在能干啥", ["现在能干啥"])
    check("accepts casual can-do-something phrase inside wake window", "你能干点啥", "你能干点啥", ["你能干点啥"])
    check("accepts casual can-do-short phrase inside wake window", "你能做点啥", "你能做点啥", ["你能做点啥"])
    check("accepts casual what-do-you-do phrase inside wake window", "你会做啥", "你会做啥", ["你会做啥"])
    check("accepts casual exact what-can-you-do phrase inside wake window", "你会干啥", "你会干啥", ["你会干啥"])
    check("accepts natural what-can-you-do-list phrase inside wake window", "你能做哪些事", "你能做哪些事", ["你能做哪些事"])
    check("accepts casual help-me-do-something phrase inside wake window", "你能帮我做点啥", "你能帮我做点啥", ["你能帮我做点啥"])
    check("accepts natural help-me-ways phrase inside wake window", "你能帮我哪些忙", "你能帮我哪些忙", ["你能帮我哪些忙"])
    check("accepts casual what-do-you-do phrase inside wake window", "你会干嘛", "你会干嘛", ["你会干嘛"])
    check("accepts casual what-all-can-you-do phrase inside wake window", "你都会什么", "你都会什么", ["你都会什么"])
    check("accepts casual all-capabilities phrase inside wake window", "你都能干什么", "你都能干什么", ["你都能干什么"])
    check("accepts casual function-list phrase inside wake window", "有什么功能", "有什么功能", ["有什么功能"])
    check("accepts casual what-else-can-you-do phrase inside wake window", "你会些什么", "你会些什么", ["你会些什么"])
    check("accepts casual can-you-help phrase inside wake window", "你能帮上什么忙", "你能帮上什么忙", ["你能帮上什么忙"])
    check("accepts casual help-me-do phrase inside wake window", "你能帮我干啥", "你能帮我干啥", ["你能帮我干啥"])
    check("accepts casual help-me-do-something phrase inside wake window", "你能帮我干点什么", "你能帮我干点什么", ["你能帮我干点什么"])
    check("accepts last-heard phrase inside wake window", "你刚才听到什么", "你刚才听到什么", ["你刚才听到什么"])
    check("accepts last-heard clarity phrase inside wake window", "你刚才听清了吗", "你刚才听清了吗", ["你刚才听清了吗"])
    check("accepts direct last-heard clarity phrase inside wake window", "你听清我刚才说的吗", "你听清我刚才说的吗", ["你听清我刚才说的吗"])
    check("accepts previous-understood phrase inside wake window", "你刚才听懂了吗", "你刚才听懂了吗", ["你刚才听懂了吗"])
    check("accepts previous-understood-natural phrase inside wake window", "你刚刚听明白了吗", "你刚刚听明白了吗", ["你刚刚听明白了吗"])
    check("accepts just-said-understood phrase inside wake window", "我刚说的你听懂没", "我刚说的你听懂没", ["我刚说的你听懂没"])
    check("accepts just-said-question phrase inside wake window", "刚刚我说的是啥", "刚刚我说的是啥", ["刚刚我说的是啥"])
    check("accepts previous-received phrase inside wake window", "你刚刚收到啥", "你刚刚收到啥", ["你刚刚收到啥"])
    check("accepts previous-heard-as phrase inside wake window", "你上一句听成什么了", "你上一句听成什么了", ["你上一句听成什么了"])
    check("accepts short previous-heard-as phrase inside wake window", "你刚听成什么了", "你刚听成什么了", ["你刚听成什么了"])
    check("accepts understood-as phrase inside wake window", "你刚才理解成啥了", "你刚才理解成啥了", ["你刚才理解成啥了"])
    check("accepts previous-understood-as-what phrase inside wake window", "上一句你理解成什么", "上一句你理解成什么", ["上一句你理解成什么"])
    check("accepts previous-understood-as phrase inside wake window", "上一句你明白成啥了", "上一句你明白成啥了", ["上一句你明白成啥了"])
    check("accepts previous-misheard question inside wake window", "你刚才是不是把我听错了", "你刚才是不是把我听错了", ["你刚才是不是把我听错了"])
    check("accepts natural last-spoken phrase inside wake window", "我刚才说啥", "我刚才说啥", ["我刚才说啥"])
    check("accepts casual last-spoken phrase inside wake window", "我刚说啥", "我刚说啥", ["我刚说啥"])
    check("accepts natural what-did-i-ask phrase inside wake window", "我刚才让你干嘛", "我刚才让你干嘛", ["我刚才让你干嘛"])
    check("accepts previous-command ask phrase inside wake window", "上一条我让你做啥", "上一条我让你做啥", ["上一条我让你做啥"])
    check("accepts short previous-command ask phrase inside wake window", "上条我让你干嘛", "上条我让你干嘛", ["上条我让你干嘛"])
    check("accepts previous-instruction phrase inside wake window", "上一条指令是什么", "上一条指令是什么", ["上一条指令是什么"])
    check("accepts previous-sentence phrase inside wake window", "上句话是什么", "上句话是什么", ["上句话是什么"])
    check("accepts just-said sentence phrase inside wake window", "刚刚那句是什么", "刚刚那句是什么", ["刚刚那句是什么"])
    check("accepts voice correction phrase inside wake window", "你听错了", "你听错了", ["你听错了"])
    check("accepts natural you-misheard-me phrase inside wake window", "你是不是听错我了", "你是不是听错我了", ["你是不是听错我了"])
    check("accepts natural misunderstood-me phrase inside wake window", "你理解错了", "你理解错了", ["你理解错了"])
    check("accepts casual did-not-get-my-meaning phrase inside wake window", "你没懂我意思", "你没懂我意思", ["你没懂我意思"])
    check("accepts natural you-misunderstood-me phrase inside wake window", "你误会我了", "你误会我了", ["你误会我了"])
    check("accepts natural did-not-understand-my-meaning phrase inside wake window", "你没明白我的意思", "你没明白我的意思", ["你没明白我的意思"])
    check("accepts terse not-my-meaning phrase inside wake window", "不是我意思", "不是我意思", ["不是我意思"])
    check("accepts meaning-correction phrase inside wake window", "不是刚才那个意思", "不是刚才那个意思", ["不是刚才那个意思"])
    check("accepts natural never-mind-last phrase inside wake window", "刚才那句算了", "刚才那句算了", ["刚才那句算了"])
    check("accepts casual cancel-previous phrase inside wake window", "上一条别执行了", "上一条别执行了", ["上一条别执行了"])
    check("accepts short cancel-previous phrase inside wake window", "上条别执行了", "上条别执行了", ["上条别执行了"])
    check("accepts short retract-previous phrase inside wake window", "撤销上条", "撤销上条", ["撤销上条"])
    check("accepts reverse retract-last-sentence phrase inside wake window", "刚才那句撤销", "刚才那句撤销", ["刚才那句撤销"])
    check("accepts casual do-not-execute-last phrase inside wake window", "不要执行刚才那句", "不要执行刚才那句", ["不要执行刚才那句"])
    check("accepts ignore-last-sentence phrase inside wake window", "忽略刚才那句", "忽略刚才那句", ["忽略刚才那句"])
    check("accepts do-not-listen-last-sentence phrase inside wake window", "不要听刚才那句", "不要听刚才那句", ["不要听刚才那句"])
    check("accepts reverse do-not-execute-previous phrase inside wake window", "别执行上一条了", "别执行上一条了", ["别执行上一条了"])
    check("accepts casual ignore-previous-thing phrase inside wake window", "刚才那个别管了", "刚才那个别管了", ["刚才那个别管了"])
    check("accepts just-now ignore-previous-thing phrase inside wake window", "刚刚那个别管了", "刚刚那个别管了", ["刚刚那个别管了"])
    check("accepts reverse ignore-previous-thing phrase inside wake window", "别管刚才那个了", "别管刚才那个了", ["别管刚才那个了"])
    check("accepts short reverse ignore-previous-thing phrase inside wake window", "别管上个了", "别管上个了", ["别管上个了"])
    check("accepts casual sentence-nevermind phrase inside wake window", "那句算了", "那句算了", ["那句算了"])
    check("accepts casual retract-previous phrase inside wake window", "撤回上一条", "撤回上一条", ["撤回上一条"])
    check("accepts casual pretend-unsaid phrase inside wake window", "刚才那句当我没说", "刚才那句当我没说", ["刚才那句当我没说"])
    check("accepts previous-request-void phrase inside wake window", "上个请求作废", "上个请求作废", ["上个请求作废"])
    check("accepts casual do-not-run-last phrase inside wake window", "刚才那条别跑了", "刚才那条别跑了", ["刚才那条别跑了"])
    check("accepts previous-sentence-hold misspoke phrase inside wake window", "上一句别动我说错了", "上一句别动我说错了", ["上一句别动我说错了"])
    check("accepts previous-sentence-no-action phrase inside wake window", "刚刚那句不要跑动作", "刚刚那句不要跑动作", ["刚刚那句不要跑动作"])
    check("accepts previous-command-no-run phrase inside wake window", "别按刚才那条命令跑", "别按刚才那条命令跑", ["别按刚才那条命令跑"])
    check("accepts natural i-misspoke phrase inside wake window", "我刚才说错了", "我刚才说错了", ["我刚才说错了"])
    check("accepts short i-misspoke phrase inside wake window", "我说错了", "我说错了", ["我说错了"])
    check("accepts audio-status phrase inside wake window", "为什么没声音", "为什么没声音", ["为什么没声音"])
    check("accepts audio-mode phrase inside wake window", "现在是什么声音模式", "现在是什么声音模式", ["现在是什么声音模式"])
    check("accepts can-speak-status phrase inside wake window", "你能不能出声", "你能不能出声", ["你能不能出声"])
    check("accepts sound-off-status phrase inside wake window", "声音关了吗", "声音关了吗", ["声音关了吗"])
    check("accepts mute-mode-status phrase inside wake window", "现在是静音模式吗", "现在是静音模式吗", ["现在是静音模式吗"])
    check("accepts mute-or-speak status phrase inside wake window", "现在是静音还是能出声", "现在是静音还是能出声", ["现在是静音还是能出声"])
    check("accepts can-talk-status question inside wake window", "现在可以讲话吗", "现在可以讲话吗", ["现在可以讲话吗"])
    check("accepts can-speak-yet status question inside wake window", "可以说话了吗", "可以说话了吗", ["可以说话了吗"])
    check("accepts convenient-speak status question inside wake window", "现在方便说话吗", "现在方便说话吗", ["现在方便说话吗"])
    check("accepts convenient-speaker status question inside wake window", "方不方便外放", "方不方便外放", ["方不方便外放"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts queue-doctor phrase inside wake window", "命令队列卡住了吗", "命令队列卡住了吗", ["命令队列卡住了吗"])
    check("accepts current-queue-items phrase inside wake window", "现在队列里还有东西吗", "现在队列里还有东西吗", ["现在队列里还有东西吗"])
    check("accepts natural stuck-queue phrase inside wake window", "你是不是卡住了", "你是不是卡住了", ["你是不是卡住了"])
    check("accepts natural not-executed queue phrase inside wake window", "刚才怎么还没执行", "刚才怎么还没执行", ["刚才怎么还没执行"])
    check("accepts previous-request-stuck phrase inside wake window", "刚才那个请求卡住了吗", "刚才那个请求卡住了吗", ["刚才那个请求卡住了吗"])
    check("accepts previous-command queued phrase inside wake window", "上一条还在排队吗", "上一条还在排队吗", ["上一条还在排队吗"])
    check("accepts short previous-command no-response phrase inside wake window", "上条没反应", "上条没反应", ["上条没反应"])
    check("accepts previous-item no-movement phrase inside wake window", "刚才那条没动静", "刚才那条没动静", ["刚才那条没动静"])
    check("accepts casual still-not-moving queue phrase inside wake window", "怎么还不动", "怎么还不动", ["怎么还不动"])
    check("accepts service-doctor phrase inside wake window", "后台服务正常吗", "后台服务正常吗", ["后台服务正常吗"])
    check("accepts casual backend-health phrase inside wake window", "后台还正常吗", "后台还正常吗", ["后台还正常吗"])
    check("accepts service-hung phrase inside wake window", "服务是不是挂了", "服务是不是挂了", ["服务是不是挂了"])
    check("accepts process-alive phrase inside wake window", "进程还活着吗", "进程还活着吗", ["进程还活着吗"])
    check("accepts tts-doctor phrase inside wake window", "语音回复正常吗", "语音回复正常吗", ["语音回复正常吗"])
    check("accepts can-read-aloud tts phrase inside wake window", "能朗读吗", "能朗读吗", ["能朗读吗"])
    check("accepts read-out tts phrase inside wake window", "你能念出来吗", "你能念出来吗", ["你能念出来吗"])
    check("accepts broadcast-reply tts phrase inside wake window", "能播报回复吗", "能播报回复吗", ["能播报回复吗"])
    check("accepts deploy-doctor phrase inside wake window", "部署正常吗", "部署正常吗", ["部署正常吗"])
    check("accepts deploy-problem phrase inside wake window", "部署有没有问题", "部署有没有问题", ["部署有没有问题"])
    check("accepts update-success phrase inside wake window", "更新成功了吗", "更新成功了吗", ["更新成功了吗"])
    check("accepts code-complete phrase inside wake window", "代码是不是完整", "代码是不是完整", ["代码是不是完整"])
    check("accepts boot-doctor phrase inside wake window", "开机服务正常吗", "开机服务正常吗", ["开机服务正常吗"])
    check("accepts startup-problem phrase inside wake window", "开机有没有问题", "开机有没有问题", ["开机有没有问题"])
    check("accepts services-started-after-boot phrase inside wake window", "开机后都起来了吗", "开机后都起来了吗", ["开机后都起来了吗"])
    check("accepts auto-start-after-reboot phrase inside wake window", "重启后会自动起来吗", "重启后会自动起来吗", ["重启后会自动起来吗"])
    check("accepts natural screen-dark phrase inside wake window", "屏幕黑了", "屏幕黑了", ["屏幕黑了"])
    check("accepts natural status-card invisible phrase inside wake window", "看不到状态", "看不到状态", ["看不到状态"])
    check("accepts natural avatar-stuck phrase inside wake window", "头像不动了", "头像不动了", ["头像不动了"])
    check("accepts battery-sufficiency phrase inside wake window", "电量还够吗", "电量还够吗", ["电量还够吗"])
    check("accepts battery-runtime phrase inside wake window", "还能撑多久", "还能撑多久", ["还能撑多久"])
    check("accepts battery-charging phrase inside wake window", "要不要充电", "要不要充电", ["要不要充电"])
    check("accepts first-person low-phone-power phrase inside wake window", "我手机快没电了", "我手机快没电了", ["我手机快没电了"])
    check("accepts natural phone-nearly-empty phrase inside wake window", "手机要没电了", "手机要没电了", ["手机要没电了"])
    check("accepts phone-power-nearly-gone phrase inside wake window", "手机电快没了", "手机电快没了", ["手机电快没了"])
    check("accepts phone-nearly-off phrase inside wake window", "手机快关机了", "手机快关机了", ["手机快关机了"])
    check("accepts phone-almost-shutdown phrase inside wake window", "手机马上关机了", "手机马上关机了", ["手机马上关机了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts phone-cannot-last phrase inside wake window", "手机撑不住了", "手机撑不住了", ["手机撑不住了"])
    check("accepts battery-draining-out phrase inside wake window", "电快耗光了", "电快耗光了", ["电快耗光了"])
    check("accepts phone-has-percent-low-power phrase inside wake window", "手机还有10%电", "手机还有10%电", ["手机还有10%电"])
    check("accepts battery-has-spoken-percent phrase inside wake window", "电量还有百分之十", "电量还有百分之十", ["电量还有百分之十"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts phone-has-one-bar-power phrase inside wake window", "手机还有一格电", "手机还有一格电", ["手机还有一格电"])
    check("accepts terse first-person one-bar-power phrase inside wake window", "我手机一格电了", "我手机一格电了", ["我手机一格电了"])
    check("accepts bare only-one-bar-power phrase inside wake window", "只有一格电了", "只有一格电了", ["只有一格电了"])
    check("accepts bare just-one-bar-power phrase inside wake window", "就一格电了", "就一格电了", ["就一格电了"])
    check("accepts bare has-one-bar-power phrase inside wake window", "还有一格电", "还有一格电", ["还有一格电"])
    check("accepts terse spoken-five-percent-power phrase inside wake window", "手机百分之五了", "手机百分之五了", ["手机百分之五了"])
    check("accepts terse digit-five-percent-power phrase inside wake window", "手机5%了", "手机5%了", ["手机5%了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts colloquial phone-five-points power phrase inside wake window", "手机剩五个点了", "手机剩五个点了", ["手机剩五个点了"])
    check("accepts bare digit-points power phrase inside wake window", "就剩5个点电了", "就剩5个点电了", ["就剩5个点电了"])
    check("accepts phone-ten-power-points phrase inside wake window", "我手机剩10个电了", "我手机剩10个电了", ["我手机剩10个电了"])
    check("accepts battery-ten-power-points phrase inside wake window", "电量就剩10个电了", "电量就剩10个电了", ["电量就剩10个电了"])
    check("accepts phone-only-ten-power-points phrase inside wake window", "手机只有10个电了", "手机只有10个电了", ["手机只有10个电了"])
    check("accepts phone-percent-low-power phrase inside wake window", "手机剩10%了", "手机剩10%了", ["手机剩10%了"])
    check("accepts spoken-phone-percent-low-power phrase inside wake window", "手机还剩百分之十了", "手机还剩百分之十了", ["手机还剩百分之十了"])
    check("accepts first-person spoken-percent-power phrase inside wake window", "我只剩百分之十电了", "我只剩百分之十电了", ["我只剩百分之十电了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts first-person digit-percent-power phrase inside wake window", "我只有10%电了", "我只有10%电了", ["我只有10%电了"])
    check("accepts bare spoken-percent-power phrase inside wake window", "只剩百分之十电了", "只剩百分之十电了", ["只剩百分之十电了"])
    check("accepts terse battery-percent phrase inside wake window", "电量3%了", "电量3%了", ["电量3%了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts phone-bar-low-power phrase inside wake window", "手机就剩两格电了", "手机就剩两格电了", ["手机就剩两格电了"])
    check("accepts short phone-bar-low-power phrase inside wake window", "手机就剩两格了", "手机就剩两格了", ["手机就剩两格了"])
    check("accepts phone-one-bar-no-power phrase inside wake window", "手机只剩一格了", "手机只剩一格了", ["手机只剩一格了"])
    check("accepts natural low-phone-power phrase inside wake window", "手机电不多了", "手机电不多了", ["手机电不多了"])
    check("accepts phone-power-not-enough phrase inside wake window", "手机电不够了", "手机电不够了", ["手机电不够了"])
    check("accepts phone-red-battery phrase inside wake window", "手机红电了", "手机红电了", ["手机红电了"])
    check("accepts phone-yellowing-battery phrase inside wake window", "手机快黄了", "手机快黄了", ["手机快黄了"])
    check("accepts yellow-battery phrase inside wake window", "电量黄了", "电量黄了", ["电量黄了"])
    check("accepts single-digit-battery phrase inside wake window", "还有个位数电", "还有个位数电", ["还有个位数电"])
    check("accepts bare single-digit-battery phrase inside wake window", "只剩个位数了", "只剩个位数了", ["只剩个位数了"])
    check("accepts low-power-mode phrase inside wake window", "手机低电模式了", "手机低电模式了", ["手机低电模式了"])
    check("accepts phone-power-enough question inside wake window", "手机电还够吗", "手机电还够吗", ["手机电还够吗"])
    check("accepts phone-power-amount question inside wake window", "手机还有多少电", "手机还有多少电", ["手机还有多少电"])
    check("accepts phone-power-left question inside wake window", "手机还剩多少电", "手机还剩多少电", ["手机还剩多少电"])
    check("accepts first-person phone-power-left question inside wake window", "我手机还剩多少电", "我手机还剩多少电", ["我手机还剩多少电"])
    check("accepts phone-can-still-last question inside wake window", "手机还能撑吗", "手机还能撑吗", ["手机还能撑吗"])
    check("accepts phone-runtime-left question inside wake window", "手机还能撑多久", "手机还能撑多久", ["手机还能撑多久"])
    check("accepts phone-can-hold question inside wake window", "手机撑得住吗", "手机撑得住吗", ["手机撑得住吗"])
    check("accepts poor phone signal phrase inside wake window", "我手机信号不好", "我手机信号不好", ["我手机信号不好"])
    check("accepts no phone signal phrase inside wake window", "手机没信号了", "手机没信号了", ["手机没信号了"])
    check("accepts poor phone network phrase inside wake window", "我手机网络太差", "我手机网络太差", ["我手机网络太差"])
    check("accepts shaky phone network phrase inside wake window", "手机网络不太行", "手机网络不太行", ["手机网络不太行"])
    check("accepts one-bar signal phrase inside wake window", "信号一格了", "信号一格了", ["信号一格了"])
    check("accepts phone-signal-one-bar phrase inside wake window", "我手机信号只有一格", "我手机信号只有一格", ["我手机信号只有一格"])
    check("accepts first-person power-not-enough phrase inside wake window", "我电不够了", "我电不够了", ["我电不够了"])
    check("accepts first-person power-enough question inside wake window", "我电还够吗", "我电还够吗", ["我电还够吗"])
    check("accepts battery-enough-way-home phrase inside wake window", "电够不够撑到回家", "电够不够撑到回家", ["电够不够撑到回家"])
    check("accepts terse enough-home phrase inside wake window", "电够不够回家", "电够不够回家", ["电够不够回家"])
    check("accepts battery-enough-home phrase inside wake window", "电够撑到家吗", "电够撑到家吗", ["电够撑到家吗"])
    check("accepts battery-enough-back phrase inside wake window", "电够回去吗", "电够回去吗", ["电够回去吗"])
    check("accepts can-phone-last-home phrase inside wake window", "手机撑不撑得到家", "手机撑不撑得到家", ["手机撑不撑得到家"])
    check("accepts phone-battery-last-home phrase inside wake window", "手机电量撑得回家吗", "手机电量撑得回家吗", ["手机电量撑得回家吗"])
    check("accepts can-last-way-home phrase inside wake window", "还能撑到回家吗", "还能撑到回家吗", ["还能撑到回家吗"])
    check("accepts can-last-back phrase inside wake window", "还能撑回去吗", "还能撑回去吗", ["还能撑回去吗"])
    check("accepts cannot-last-home phrase inside wake window", "撑不到家了", "撑不到家了", ["撑不到家了"])
    check("accepts phone-power-cannot-last-home phrase inside wake window", "手机电撑不到家了", "手机电撑不到家了", ["手机电撑不到家了"])
    check("accepts battery-failing phrase inside wake window", "手机电池快不行了", "手机电池快不行了", ["手机电池快不行了"])
    check("accepts little-phone-power-left phrase inside wake window", "手机只剩一点电了", "手机只剩一点电了", ["手机只剩一点电了"])
    check("accepts power-saving portable phrase inside wake window", "省电一点", "省电一点", ["省电一点"])
    check("accepts casual power-saving portable phrase inside wake window", "省点电", "省点电", ["省点电"])
    check("accepts phone-power-saving portable phrase inside wake window", "省点手机电", "省点手机电", ["省点手机电"])
    check("accepts use-power-carefully phrase inside wake window", "省着点用电", "省着点用电", ["省着点用电"])
    check("accepts casual use-power-carefully phrase inside wake window", "省着点用吧", "省着点用吧", ["省着点用吧"])
    check("accepts low-battery-bottoming phrase inside wake window", "电量快见底了", "电量快见底了", ["电量快见底了"])
    check("accepts terse low-battery-bottoming phrase inside wake window", "电量见底了", "电量见底了", ["电量见底了"])
    check("accepts low-battery-alert phrase inside wake window", "电量告急了", "电量告急了", ["电量告急了"])
    check("accepts low-battery-alarm phrase inside wake window", "电量报警了", "电量报警了", ["电量报警了"])
    check("accepts low-battery-redline phrase inside wake window", "电量红线了", "电量红线了", ["电量红线了"])
    check("accepts terse nearly-off phrase inside wake window", "快关机了", "快关机了", ["快关机了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts first-person low-battery-amount phrase inside wake window", "我电量不多了", "我电量不多了", ["我电量不多了"])
    check("accepts first-person tiny-battery phrase inside wake window", "我只有一点点电了", "我只有一点点电了", ["我只有一点点电了"])
    check("accepts last-bit phone-battery phrase inside wake window", "手机剩最后一点电了别突然出声", "手机剩最后一点电了别突然出声", ["手机剩最后一点电了别突然出声"])
    check("accepts one-mouth battery-home phrase inside wake window", "只剩一口电了还能陪我到家吗", "只剩一口电了还能陪我到家吗", ["只剩一口电了还能陪我到家吗"])
    check("accepts battery-bottoming phrase inside wake window", "电快见底了", "电快见底了", ["电快见底了"])
    check("accepts do-not-drain-power phrase inside wake window", "别太耗电", "别太耗电", ["别太耗电"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural too-late-outside phrase inside wake window", "外面太晚了", "外面太晚了", ["外面太晚了"])
    check("accepts casual late-outside phrase inside wake window", "外面有点晚", "外面有点晚", ["外面有点晚"])
    check("accepts going-home intent phrase inside wake window", "我要回家了", "我要回家了", ["我要回家了"])
    check("accepts casual going-back intent phrase inside wake window", "我想回去了", "我想回去了", ["我想回去了"])
    check("accepts outdoor unease phrase inside wake window", "路上有点害怕", "路上有点害怕", ["路上有点害怕"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts dangerous-route phrase inside wake window", "路上有点危险", "路上有点危险", ["路上有点危险"])
    check("accepts following-safety phrase inside wake window", "感觉有人跟着我", "感觉有人跟着我", ["感觉有人跟着我"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts walking-behind phrase inside wake window", "有人跟我走", "有人跟我走", ["有人跟我走"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts behind-following phrase inside wake window", "后面好像有人跟着", "后面好像有人跟着", ["后面好像有人跟着"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts behind-walking phrase inside wake window", "后面有人跟我走", "后面有人跟我走", ["后面有人跟我走"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts terse behind-person phrase inside wake window", "后面好像有人", "后面好像有人", ["后面好像有人"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts tailing-safety phrase inside wake window", "好像有人尾随我", "好像有人尾随我", ["好像有人尾随我"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts short outdoor fear phrase inside wake window", "我有点怕", "我有点怕", ["我有点怕"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts uneasy-outside phrase inside wake window", "我有点不安心", "我有点不安心", ["我有点不安心"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts short route fear phrase inside wake window", "路上有点怕", "路上有点怕", ["路上有点怕"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts natural worried-way-home phrase inside wake window", "回家路上有点慌", "回家路上有点慌", ["回家路上有点慌"])
    check("accepts lost-outside phrase inside wake window", "我有点迷路了", "我有点迷路了", ["我有点迷路了"])
    check("accepts cannot-find-way phrase inside wake window", "找不到路了", "找不到路了", ["找不到路了"])
    check("accepts walk-me-home phrase inside wake window", "陪我回家", "陪我回家", ["陪我回家"])
    check("accepts natural walk-me-back phrase inside wake window", "陪我走回去", "陪我走回去", ["陪我走回去"])
    check("accepts walk-with-me-a-bit phrase inside wake window", "陪我走一段", "陪我走一段", ["陪我走一段"])
    check("accepts walk-me-to-subway phrase inside wake window", "陪我走到地铁口", "陪我走到地铁口", ["陪我走到地铁口"])
    check("accepts walk-me-to-subway-entrance phrase inside wake window", "陪我去地铁口", "陪我去地铁口", ["陪我去地铁口"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts way-home question inside wake window", "回家怎么走", "回家怎么走", ["回家怎么走"])
    check("accepts safer way-home question inside wake window", "怎么回家比较安全", "怎么回家比较安全", ["怎么回家比较安全"])
    check("accepts take-me-home phrase inside wake window", "带我回家", "带我回家", ["带我回家"])
    check("accepts send-me-back phrase inside wake window", "送我回去", "送我回去", ["送我回去"])
    check("accepts take-me-back phrase inside wake window", "带我回去", "带我回去", ["带我回去"])
    check("accepts almost-home question inside wake window", "快到家了吗", "快到家了吗", ["快到家了吗"])
    check("accepts take-me-to-subway phrase inside wake window", "带我去地铁站", "带我去地铁站", ["带我去地铁站"])
    check("accepts take-me-back-to-subway phrase inside wake window", "带我回地铁站", "带我回地铁站", ["带我回地铁站"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts take-me-to-convenience-store phrase inside wake window", "带我去便利店", "带我去便利店", ["带我去便利店"])
    check("accepts surroundings-safety phrase inside wake window", "周围安全吗", "周围安全吗", ["周围安全吗"])
    check("accepts nearby-safety phrase inside wake window", "这附近安全吗", "这附近安全吗", ["这附近安全吗"])
    check("accepts side-safety unease phrase inside wake window", "旁边好像不太安全", "旁边好像不太安全", ["旁边好像不太安全"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts route-safety phrase inside wake window", "这条路安全吗", "这条路安全吗", ["这条路安全吗"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts taxi-request phrase inside wake window", "我想打车", "我想打车", ["我想打车"])
    check("accepts safe-place request inside wake window", "找个安全的地方", "找个安全的地方", ["找个安全的地方"])
    check("accepts brighter-road request inside wake window", "找条亮一点的路", "找条亮一点的路", ["找条亮一点的路"])
    check("accepts brighter-road-help request inside wake window", "帮我找亮一点的路", "帮我找亮一点的路", ["帮我找亮一点的路"])
    check("accepts avoid-alley-home request inside wake window", "避开小巷回家", "避开小巷回家", ["避开小巷回家"])
    check("accepts no-alley request inside wake window", "别走小巷", "别走小巷", ["别走小巷"])
    check("accepts busier-road request inside wake window", "找人多一点的路", "找人多一点的路", ["找人多一点的路"])
    check("accepts busier-place request inside wake window", "找人多一点的地方", "找人多一点的地方", ["找人多一点的地方"])
    check("accepts avoid-dark-lane request inside wake window", "别带我走太黑的小路", "别带我走太黑的小路", ["别带我走太黑的小路"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts rain-shelter phrase inside wake window", "找个地方躲雨", "找个地方躲雨", ["找个地方躲雨"])
    check("accepts raining-shelter phrase inside wake window", "下雨了找个地方躲躲", "下雨了找个地方躲躲", ["下雨了找个地方躲躲"])
    check("accepts raining-find-shelter inside wake window", "下雨了找个地方躲一下", "下雨了找个地方躲一下", ["下雨了找个地方躲一下"])
    check("accepts raining-what-now inside wake window", "外面下雨了怎么办", "外面下雨了怎么办", ["外面下雨了怎么办"])
    check("accepts no-umbrella inside wake window", "我没带伞", "我没带伞", ["我没带伞"])
    check("accepts buy-umbrella inside wake window", "哪里可以买伞", "哪里可以买伞", ["哪里可以买伞"])
    check("accepts heavy-rain-indoor inside wake window", "雨太大先找个室内", "雨太大先找个室内", ["雨太大先找个室内"])
    check("accepts thirsty phrase inside wake window", "我有点口渴", "我有点口渴", ["我有点口渴"])
    check("accepts thirsty-short phrase inside wake window", "我渴了", "我渴了", ["我渴了"])
    check("accepts buy-water phrase inside wake window", "想买瓶水", "想买瓶水", ["想买瓶水"])
    check("accepts water-location phrase inside wake window", "哪里可以买水", "哪里可以买水", ["哪里可以买水"])
    check("accepts nearby-water phrase inside wake window", "附近有水买吗", "附近有水买吗", ["附近有水买吗"])
    check("accepts hot-indoor-rest phrase inside wake window", "太热了找个室内歇一下", "太热了找个室内歇一下", ["太热了找个室内歇一下"])
    check("accepts heat-what-now phrase inside wake window", "外面太热了怎么办", "外面太热了怎么办", ["外面太热了怎么办"])
    check("accepts heatstroke phrase inside wake window", "我好像中暑了", "我好像中暑了", ["我好像中暑了"])
    check("accepts hydrate-place phrase inside wake window", "找个地方补水", "找个地方补水", ["找个地方补水"])
    check("accepts cold phrase inside wake window", "我有点冷", "我有点冷", ["我有点冷"])
    check("accepts cold-what-now phrase inside wake window", "外面太冷了怎么办", "外面太冷了怎么办", ["外面太冷了怎么办"])
    check("accepts cold-indoor-rest phrase inside wake window", "太冷了找个室内歇一下", "太冷了找个室内歇一下", ["太冷了找个室内歇一下"])
    check("accepts warm-place phrase inside wake window", "找个暖和地方", "找个暖和地方", ["找个暖和地方"])
    check("accepts hot-drink-location phrase inside wake window", "哪里可以买热饮", "哪里可以买热饮", ["哪里可以买热饮"])
    check("accepts nearby-hot-drink phrase inside wake window", "附近有热饮买吗", "附近有热饮买吗", ["附近有热饮买吗"])
    check("accepts hot-water phrase inside wake window", "想买杯热水", "想买杯热水", ["想买杯热水"])
    check("accepts windy-what-now phrase inside wake window", "风太大了怎么办", "风太大了怎么办", ["风太大了怎么办"])
    check("accepts windy-shelter phrase inside wake window", "外面风好大找个避风地方", "外面风好大找个避风地方", ["外面风好大找个避风地方"])
    check("accepts windbreak-place phrase inside wake window", "找个避风的地方", "找个避风的地方", ["找个避风的地方"])
    check("accepts windy-indoor phrase inside wake window", "风大想找室内", "风大想找室内", ["风大想找室内"])
    check("accepts no-wind-place phrase inside wake window", "找个没风的地方", "找个没风的地方", ["找个没风的地方"])
    check("accepts nearby-transit phrase inside wake window", "最近有地铁口吗", "最近有地铁口吗", ["最近有地铁口吗"])
    check("accepts find-subway-station phrase inside wake window", "我想找地铁站", "我想找地铁站", ["我想找地铁站"])
    check("accepts subway-station-directions inside wake window", "地铁站怎么走", "地铁站怎么走", ["地铁站怎么走"])
    check("accepts nearby-subway-station-location inside wake window", "附近地铁站在哪", "附近地铁站在哪", ["附近地铁站在哪"])
    check("accepts short-find-subway-station inside wake window", "找个地铁站", "找个地铁站", ["找个地铁站"])
    check("accepts subway-station location phrase inside wake window", "地铁站在哪", "地铁站在哪", ["地铁站在哪"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts find-bus-stop phrase inside wake window", "我想找公交站", "我想找公交站", ["我想找公交站"])
    check("accepts bus-stop location phrase inside wake window", "公交站在哪", "公交站在哪", ["公交站在哪"])
    check("accepts bus-station alias location phrase inside wake window", "巴士站在哪", "巴士站在哪", ["巴士站在哪"])
    check("accepts nearby convenience-store phrase inside wake window", "附近有便利店吗", "附近有便利店吗", ["附近有便利店吗"])
    check("accepts natural convenience-store-anywhere phrase inside wake window", "哪里有便利店", "哪里有便利店", ["哪里有便利店"])
    check("accepts convenience-store location phrase inside wake window", "便利店在哪", "便利店在哪", ["便利店在哪"])
    check("accepts nearby pharmacy phrase inside wake window", "附近有药店吗", "附近有药店吗", ["附近有药店吗"])
    check("accepts pharmacy location phrase inside wake window", "药店在哪", "药店在哪", ["药店在哪"])
    check("accepts first-aid bandage location inside wake window", "哪里可以买创可贴", "哪里可以买创可贴", ["哪里可以买创可贴"])
    check("accepts nearby first-aid bandage inside wake window", "附近能买创可贴吗", "附近能买创可贴吗", ["附近能买创可贴吗"])
    check("accepts scraped-skin pharmacy request inside wake window", "我擦破皮了找个药店", "我擦破皮了找个药店", ["我擦破皮了找个药店"])
    check("accepts headache pharmacy request inside wake window", "我有点头疼想找药店", "我有点头疼想找药店", ["我有点头疼想找药店"])
    check("accepts stomachache pharmacy request inside wake window", "肚子疼附近有药店吗", "肚子疼附近有药店吗", ["肚子疼附近有药店吗"])
    check("accepts buy-medicine request inside wake window", "想买点药", "想买点药", ["想买点药"])
    check("accepts pharmacy-medicine request inside wake window", "找个药店买药", "找个药店买药", ["找个药店买药"])
    check("accepts restroom-need phrase inside wake window", "洗手间在哪", "洗手间在哪", ["洗手间在哪"])
    check("accepts restroom-no-nav question inside wake window", "只想问附近有没有厕所别导航", "只想问附近有没有厕所别导航", ["只想问附近有没有厕所别导航"])
    check("accepts direct-navigation-policy question inside wake window", "我说去地铁站你会直接导航吗", "我说去地铁站你会直接导航吗", ["我说去地铁站你会直接导航吗"])
    check("accepts outdoor-restroom-need inside wake window", "出门路上想上厕所怎么办", "出门路上想上厕所怎么办", ["出门路上想上厕所怎么办"])
    check("accepts casual restroom-location phrase inside wake window", "厕所在哪儿", "厕所在哪儿", ["厕所在哪儿"])
    check("accepts natural restroom-anywhere phrase inside wake window", "哪里有厕所", "哪里有厕所", ["哪里有厕所"])
    check("accepts natural restroom-need phrase inside wake window", "我想上厕所", "我想上厕所", ["我想上厕所"])
    check("accepts restroom-directions phrase inside wake window", "厕所怎么走", "厕所怎么走", ["厕所怎么走"])
    check("accepts take-me-to-restroom phrase inside wake window", "带我去厕所", "带我去厕所", ["带我去厕所"])
    check("accepts washroom-need phrase inside wake window", "我想去洗手间", "我想去洗手间", ["我想去洗手间"])
    check("accepts subjectless restroom-need phrase inside wake window", "想上厕所", "想上厕所", ["想上厕所"])
    check("accepts urgent restroom-need phrase inside wake window", "要上厕所", "要上厕所", ["要上厕所"])
    check("accepts urgent pee phrase inside wake window", "尿急了", "尿急了", ["尿急了"])
    check("accepts casual pee phrase inside wake window", "想尿尿", "想尿尿", ["想尿尿"])
    check("accepts charge-spot phrase inside wake window", "找个地方充电", "找个地方充电", ["找个地方充电"])
    check("accepts casual charge-spot phrase inside wake window", "找个地方充会电", "找个地方充会电", ["找个地方充会电"])
    check("accepts nearby casual charge-spot phrase inside wake window", "附近有没有地方充会电", "附近有没有地方充会电", ["附近有没有地方充会电"])
    check("accepts natural charge-anywhere phrase inside wake window", "哪里能充电", "哪里能充电", ["哪里能充电"])
    check("accepts subjectless charge-need phrase inside wake window", "想充电", "想充电", ["想充电"])
    check("accepts urgent charge-need phrase inside wake window", "得充电了", "得充电了", ["得充电了"])
    check("accepts charge-place-location phrase inside wake window", "充电的地方在哪", "充电的地方在哪", ["充电的地方在哪"])
    check("accepts nearby shared powerbank inside wake window", "附近有共享充电宝吗", "附近有共享充电宝吗", ["附近有共享充电宝吗"])
    check("accepts borrow powerbank inside wake window", "我想借个充电宝", "我想借个充电宝", ["我想借个充电宝"])
    check("accepts sit-down phrase inside wake window", "我想坐一下", "我想坐一下", ["我想坐一下"])
    check("accepts sit-awhile phrase inside wake window", "我想找个地方坐会儿", "我想找个地方坐会儿", ["我想找个地方坐会儿"])
    check("accepts rest-awhile phrase inside wake window", "找个地方歇会儿", "找个地方歇会儿", ["找个地方歇会儿"])
    check("accepts tired-sit-down phrase inside wake window", "有点累想坐一下", "有点累想坐一下", ["有点累想坐一下"])
    check("accepts rest-break phrase inside wake window", "走累了找地方休息", "走累了找地方休息", ["走累了找地方休息"])
    check("accepts walking-tired-rest phrase inside wake window", "走累了想歇一下", "走累了想歇一下", ["走累了想歇一下"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts before-going-out-check phrase inside wake window", "出去前检查一下", "出去前检查一下", ["出去前检查一下"])
    check("accepts before-outdoor-status phrase inside wake window", "出门之前看一下状态", "出门之前看一下状态", ["出门之前看一下状态"])
    check("accepts can-take-you-out phrase inside wake window", "我能带你出去吗", "我能带你出去吗", ["我能带你出去吗"])
    check("accepts fit-to-carry-out phrase inside wake window", "你适合带出门吗", "你适合带出门吗", ["你适合带出门吗"])
    check("accepts going-out-walk phrase inside wake window", "我想出去走走", "我想出去走走", ["我想出去走走"])
    check("accepts take-you-out-walk phrase inside wake window", "带你出去走一圈", "带你出去走一圈", ["带你出去走一圈"])
    check("accepts outdoor-stroll phrase inside wake window", "我准备出门溜达一下", "我准备出门溜达一下", ["我准备出门溜达一下"])
    check("accepts take-dj-out-stroll phrase inside wake window", "带你出门溜达", "带你出门溜达", ["带你出门溜达"])
    check("accepts casual outdoor-stroll phrase inside wake window", "出去溜达一圈", "出去溜达一圈", ["出去溜达一圈"])
    check("accepts ready-to-leave phrase inside wake window", "准备走了", "准备走了", ["准备走了"])
    check("accepts starting-out phrase inside wake window", "我要出发了", "我要出发了", ["我要出发了"])
    check("accepts take-dj-departure phrase inside wake window", "要带你出发了", "要带你出发了", ["要带你出发了"])
    check("accepts time-to-depart phrase inside wake window", "该出发了", "该出发了", ["该出发了"])
    check("accepts can-depart phrase inside wake window", "可以出发了吗", "可以出发了吗", ["可以出发了吗"])
    check("accepts group-departure phrase inside wake window", "我们出发吧", "我们出发吧", ["我们出发吧"])
    check("accepts group-walk phrase inside wake window", "咱们走吧", "咱们走吧", ["咱们走吧"])
    check("accepts casual leaving phrase inside wake window", "要走啦", "要走啦", ["要走啦"])
    check("accepts take-dj-walk phrase inside wake window", "带你走了", "带你走了", ["带你走了"])
    check("accepts casual did-you-hear phrase inside wake window", "你听见了吗", "你听见了吗", ["你听见了吗"])
    check("accepts speaking-heard phrase inside wake window", "你听到我说话了吗", "你听到我说话了吗", ["你听到我说话了吗"])
    check("accepts inverted speaking-heard phrase inside wake window", "我说话你能听见吗", "我说话你能听见吗", ["我说话你能听见吗"])
    check("accepts colloquial talking-heard phrase inside wake window", "我讲话你听得到吗", "我讲话你听得到吗", ["我讲话你听得到吗"])
    check("accepts clear-heard voice doctor phrase inside wake window", "你听得清我吗", "你听得清我吗", ["你听得清我吗"])
    check("accepts speech-clear voice doctor phrase inside wake window", "我说话清楚吗", "我说话清楚吗", ["我说话清楚吗"])
    check("accepts cannot-hear-me voice doctor phrase inside wake window", "你听不到我吗", "你听不到我吗", ["你听不到我吗"])
    check("accepts cannot-hear-me-clear voice doctor phrase inside wake window", "你是不是听不清我", "你是不是听不清我", ["你是不是听不清我"])
    check("accepts my-voice-clear voice doctor phrase inside wake window", "我声音清楚吗", "我声音清楚吗", ["我声音清楚吗"])
    check("accepts local-voice-normal voice doctor phrase inside wake window", "我这边声音正常吗", "我这边声音正常吗", ["我这边声音正常吗"])
    check("accepts too-quiet voice doctor phrase inside wake window", "我声音太小你听得见吗", "我声音太小你听得见吗", ["我声音太小你听得见吗"])
    check("accepts far-away voice doctor phrase inside wake window", "我离远一点你还能听见吗", "我离远一点你还能听见吗", ["我离远一点你还能听见吗"])
    check("accepts noisy-place voice doctor phrase inside wake window", "环境太吵你还听得清吗", "环境太吵你还听得清吗", ["环境太吵你还听得清吗"])
    check("accepts windy voice doctor phrase inside wake window", "风声很大你能听清吗", "风声很大你能听清吗", ["风声很大你能听清吗"])
    check("accepts missed-sentence voice doctor phrase inside wake window", "我刚才那句是不是没收进去", "我刚才那句是不是没收进去", ["我刚才那句是不是没收进去"])
    check("accepts missed-voice voice doctor phrase inside wake window", "你刚才是不是没收到我的声音", "你刚才是不是没收到我的声音", ["你刚才是不是没收到我的声音"])
    check("accepts handset-broken phrase inside wake window", "话筒是不是坏了", "话筒是不是坏了", ["话筒是不是坏了"])
    check("accepts short-mic-sound voice doctor phrase inside wake window", "麦有声音吗", "麦有声音吗", ["麦有声音吗"])
    check("accepts receiver-hears-my-voice phrase inside wake window", "你收得到我的声音吗", "你收得到我的声音吗", ["你收得到我的声音吗"])
    check("accepts can-receive-my-voice phrase inside wake window", "能收到我声音吗", "能收到我声音吗", ["能收到我声音吗"])
    check("accepts understand-me voice doctor phrase inside wake window", "你能听懂我吗", "你能听懂我吗", ["你能听懂我吗"])
    check("accepts no-response voice doctor phrase inside wake window", "你怎么没反应", "你怎么没反应", ["你怎么没反应"])
    check("accepts wake-no-response voice doctor phrase inside wake window", "叫你没反应", "叫你没反应", ["叫你没反应"])
    check("accepts did-not-hear-me voice doctor phrase inside wake window", "你是不是没听见我", "你是不是没听见我", ["你是不是没听见我"])
    check("accepts self-check-yourself phrase inside wake window", "你自己检查一下", "你自己检查一下", ["你自己检查一下"])
    check("accepts health-check phrase inside wake window", "体检一下", "体检一下", ["体检一下"])
    check("accepts natural agent-health phrase inside wake window", "你现在健康吗", "你现在健康吗", ["你现在健康吗"])
    check("accepts natural health-check phrase inside wake window", "帮我做个健康检查", "帮我做个健康检查", ["帮我做个健康检查"])
    check("accepts natural troubleshoot phrase inside wake window", "帮我排查一下", "帮我排查一下", ["帮我排查一下"])
    check("accepts natural broken-status phrase inside wake window", "哪里坏了", "哪里坏了", ["哪里坏了"])
    check("accepts natural self-inspect phrase inside wake window", "你能不能自己看一下", "你能不能自己看一下", ["你能不能自己看一下"])
    check("accepts natural orange-button health phrase inside wake window", "橙色按钮正常吗", "橙色按钮正常吗", ["橙色按钮正常吗"])
    check("accepts terse orange-key health phrase inside wake window", "橙键正常吗", "橙键正常吗", ["橙键正常吗"])
    check("accepts natural long-press question inside wake window", "长按橙色按钮会做什么", "长按橙色按钮会做什么", ["长按橙色按钮会做什么"])
    check("accepts terse orange-key long-press question inside wake window", "长按橙键会怎样", "长按橙键会怎样", ["长按橙键会怎样"])
    check("accepts pressing-orange-key long-press question inside wake window", "长摁橙色键会干嘛", "长摁橙色键会干嘛", ["长摁橙色键会干嘛"])
    check("accepts standalone long-press toggle question inside wake window", "长按现在会关掉播放还是开电台", "长按现在会关掉播放还是开电台", ["长按现在会关掉播放还是开电台"])
    check("accepts muted long-press current-sunset question inside wake window", "我在静音时长按是不是会解除静音并播放当前日落", "我在静音时长按是不是会解除静音并播放当前日落", ["我在静音时长按是不是会解除静音并播放当前日落"])
    check("accepts long-press-status-card question inside wake window", "长按后会不会写状态卡", "长按后会不会写状态卡", ["长按后会不会写状态卡"])
    check("accepts long-press-screen-result question inside wake window", "长按后屏幕会显示结果吗", "长按后屏幕会显示结果吗", ["长按后屏幕会显示结果吗"])
    check("accepts button-action-writeback question inside wake window", "按钮动作会写回状态吗", "按钮动作会写回状态吗", ["按钮动作会写回状态吗"])
    check("accepts terse status-card-writeback question inside wake window", "状态卡回写了吗", "状态卡回写了吗", ["状态卡回写了吗"])
    check("accepts terse result-card-write question inside wake window", "结果写卡了吗", "结果写卡了吗", ["结果写卡了吗"])
    check("accepts long-press-failure-status-card question inside wake window", "状态卡能不能告诉我刚才长按有没有失败", "状态卡能不能告诉我刚才长按有没有失败", ["状态卡能不能告诉我刚才长按有没有失败"])
    check("accepts long-press-failure-status-card-tail question inside wake window", "长按那次失败了吗状态卡还能看吗", "长按那次失败了吗状态卡还能看吗", ["长按那次失败了吗状态卡还能看吗"])
    check("accepts idle-orange-key-press-long-direct-song question inside wake window", "没播歌的时候橙键按久点会直接放歌吗", "没播歌的时候橙键按久点会直接放歌吗", ["没播歌的时候橙键按久点会直接放歌吗"])
    check("accepts hold-orange-key long-press question inside wake window", "按住橙键会怎样", "按住橙键会怎样", ["按住橙键会怎样"])
    check("accepts pressing-orange-button hold question inside wake window", "摁住橙色按钮会干嘛", "摁住橙色按钮会干嘛", ["摁住橙色按钮会干嘛"])
    check("accepts natural button-no-response phrase inside wake window", "按钮没反应", "按钮没反应", ["按钮没反应"])
    check("accepts natural long-press-no-response phrase inside wake window", "长按没反应", "长按没反应", ["长按没反应"])
    check("accepts natural orange-button-flaky phrase inside wake window", "橙色键不灵了", "橙色键不灵了", ["橙色键不灵了"])
    check("accepts terse orange-key-flaky phrase inside wake window", "橙键不灵了", "橙键不灵了", ["橙键不灵了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("normalizes local ASR play-city misrecognition", "把 我 放下 东京 的 歌曲", "播放东京的歌曲", ["播放东京的歌曲"])
    check("normalizes helper play-city misrecognition", "帮 我 放下 柏林 的 歌曲", "播放柏林的歌曲", ["播放柏林的歌曲"])
    check("normalizes casual one-song city request", "给我来一首东京的歌", "播放东京的歌", ["播放东京的歌"])
    check("normalizes casual play-city request", "给我放东京的歌", "播放东京的歌", ["播放东京的歌"])
    check("normalizes casual play-some city request", "放点巴黎的音乐", "播放巴黎的音乐", ["播放巴黎的音乐"])
    check("normalizes casual some-city song request", "来点东京的歌", "播放东京的歌", ["播放东京的歌"])
    check("normalizes colloquial get-some city request", "给我整点东京的歌", "播放东京的歌", ["播放东京的歌"])
    check("normalizes colloquial arrange-some city request", "安排点柏林的歌", "播放柏林的歌", ["播放柏林的歌"])
    check("normalizes colloquial get-one city request", "搞一首巴黎的音乐", "播放巴黎的音乐", ["播放巴黎的音乐"])
    check("normalizes colloquial arrange-one city request", "给我安排一首柏林的歌", "播放柏林的歌", ["播放柏林的歌"])
    check("keeps negative play-city request out of city normalization", "别放东京了", "别放东京了", ["别放东京了"])
    check("keeps negative arrange-city request out of city normalization", "别安排一首东京的歌", "别安排一首东京的歌", ["别安排一首东京的歌"])
    check("normalizes casual listen-city request", "听一下柏林的音乐", "播放柏林的音乐", ["播放柏林的音乐"])
    check("normalizes xia-a-dao city misrecognition", "下 啊 到 东京 的 歌曲", "播放东京的歌曲", ["播放东京的歌曲"])
    check("normalizes tianxia-dao city misrecognition", "天下 到 东京 的 歌曲", "播放东京的歌曲", ["播放东京的歌曲"])
    check("normalizes qiexia-dao city misrecognition", "切下 到 东京 的 歌曲", "播放东京的歌曲", ["播放东京的歌曲"])
    check("normalizes dang-wo city misrecognition", "当 我 放下 东京 的 歌曲", "播放东京的歌曲", ["播放东京的歌曲"])
    check("normalizes unlock misrecognition inside wake window", "解除 进入", "打开电台声音", ["打开电台声音"])
    check("normalizes cancel-mute phrase inside wake window", "取消静音", "打开电台声音", ["打开电台声音"])
    check("normalizes external-speaker phrase inside wake window", "恢复外放", "打开电台声音", ["打开电台声音"])
    check("normalizes bring-sound-back phrase inside wake window", "把声音开回来", "打开电台声音", ["打开电台声音"])
    check("normalizes keep-sounding phrase inside wake window", "继续响", "打开电台声音", ["打开电台声音"])
    check("normalizes not-closed phrase inside wake window", "别关着了", "打开电台声音", ["打开电台声音"])
    check("normalizes open-sound misrecognition inside wake window", "欢迎 打开 了", "打开电台声音", ["打开电台声音"])
    check("normalizes natural start-radio request inside wake window", "开始 放歌", "继续播放音乐", ["继续播放音乐"])
    check("normalizes natural resume-music request inside wake window", "继续播放音乐", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse resume-broadcast request inside wake window", "继续播吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse resume-singing request inside wake window", "继续唱吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse resume-play request inside wake window", "继续放吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse follow-up broadcast request inside wake window", "接着播吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse follow-up singing request inside wake window", "接着唱吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes casual resume-singing permission inside wake window", "可以接着唱了", "继续播放音乐", ["继续播放音乐"])
    check("normalizes terse follow-up play request inside wake window", "接着放吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes casual continue-listening request inside wake window", "接着听吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes continue-previous-song request inside wake window", "接着刚才的歌", "继续播放音乐", ["继续播放音乐"])
    check("normalizes continue-that-song request inside wake window", "继续刚才那首", "继续播放音乐", ["继续播放音乐"])
    check("normalizes continue-just-now-song request inside wake window", "接着刚刚那首", "继续播放音乐", ["继续播放音乐"])
    check("normalizes continue-previous-music request inside wake window", "接着刚才的音乐", "继续播放音乐", ["继续播放音乐"])
    check("normalizes music-comeback request inside wake window", "音乐回来吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes sound-comeback request inside wake window", "声音回来吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes music-reconnect request inside wake window", "音乐接回来", "继续播放音乐", ["继续播放音乐"])
    check("normalizes song-comeback request inside wake window", "歌回来吧", "继续播放音乐", ["继续播放音乐"])
    check("normalizes restore-previous-radio request inside wake window", "恢复刚才的电台", "继续播放音乐", ["继续播放音乐"])
    check("normalizes continue-previous-zhige request inside wake window", "继续刚才那支歌", "继续播放音乐", ["继续播放音乐"])
    check("normalizes previous-track-continue request inside wake window", "刚才那首继续", "继续播放音乐", ["继续播放音乐"])
    check("normalizes previous-track-followup request inside wake window", "刚刚那首接着放", "继续播放音乐", ["继续播放音乐"])
    check("normalizes just-now-track-continue-play inside wake window", "刚刚那首继续放", "继续播放音乐", ["继续播放音乐"])
    check("normalizes reconnect-previous-track request inside wake window", "接上刚才那首", "继续播放音乐", ["继续播放音乐"])
    check("normalizes reconnect-previous-track-tail request inside wake window", "刚才那首接回来", "继续播放音乐", ["继续播放音乐"])
    check("normalizes radio-continue-up request inside wake window", "电台继续起来", "继续播放音乐", ["继续播放音乐"])
    check("normalizes generic-continue request inside wake window", "可以继续了", "继续播放音乐", ["继续播放音乐"])
    check("normalizes reopen-music request inside wake window", "再开音乐", "继续播放音乐", ["继续播放音乐"])
    check("normalizes reopen-radio-a-bit request inside wake window", "再开一下电台", "继续播放音乐", ["继续播放音乐"])
    check("normalizes open-voice request inside wake window", "开声吧", "打开电台声音", ["打开电台声音"])
    check("normalizes reopen-voice request inside wake window", "重新开声", "打开电台声音", ["打开电台声音"])
    for name, phrase in [
        ("keeps pause-continuity question inside wake window", "暂停后能不能接着刚才那首"),
        ("keeps guarded pause-continuity question inside wake window", "别暂停，只问暂停后能不能继续刚才那首"),
        ("keeps resume-continuity question inside wake window", "恢复播放会从刚才那首继续吗"),
        ("keeps continue-routing question inside wake window", "别执行，只问继续播放会不会乱换城市"),
    ]:
        voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
        check(name, phrase, phrase, [phrase])
    for name, phrase in [
        ("keeps negative next-track request inside wake window", "不要下一首"),
        ("keeps negative cut-next request inside wake window", "别切下一首"),
        ("keeps negative resume request inside wake window", "别继续播放"),
        ("keeps negative restore request inside wake window", "不要恢复播放"),
        ("keeps negative previous-radio restore inside wake window", "别恢复刚才的电台"),
        ("keeps negative previous-track reconnect inside wake window", "别接上刚才那首"),
        ("keeps negative radio-sound request inside wake window", "先别打开电台声音"),
    ]:
        voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
        check(name, phrase, phrase, [phrase])
    check("keeps natural city play request as a city command", "开始播放东京的歌曲", "开始播放东京的歌曲", ["开始播放东京的歌曲"])
    check("keeps dialog-only unmute phrase for command layer", "你可以说话了", "你可以说话了", ["你可以说话了"])
    check("keeps can-speak phrase for command layer", "可以出声了", "可以出声了", ["可以出声了"])
    check("keeps can-talk phrase for command layer", "可以讲话了", "可以讲话了", ["可以讲话了"])
    check("keeps start-talking phrase for command layer", "开口说话", "开口说话", ["开口说话"])
    check("keeps speak-now phrase for command layer", "你说吧", "你说吧", ["你说吧"])
    check("accepts muted-status phrase inside wake window", "你是不是静音了", "你是不是静音了", ["你是不是静音了"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual no-more-song phrase inside wake window", "别放歌了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual no-more-broadcast phrase inside wake window", "先别播了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-more-output-song phrase inside wake window", "先别出歌了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-more-output-music phrase inside wake window", "先别出音乐了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts hold-radio-no-play phrase inside wake window", "先把电台按住别播", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts defer-playback phrase inside wake window", "等下再放", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual no-more-singing phrase inside wake window", "先别唱了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-more-singing phrase inside wake window", "不要唱了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-continue-singing phrase inside wake window", "别继续唱了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-follow-up-broadcast phrase inside wake window", "别接着播了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts no-resume-stream phrase inside wake window", "先别续播", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts direct no-broadcast phrase inside wake window", "不要播了", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts stop-a-while phrase inside wake window", "先停会儿", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual music-stop-first phrase inside wake window", "音乐先停一下", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts collect-sound phrase inside wake window", "声音先收住", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts quiet-radio phrase inside wake window", "电台先安静一下", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual sound-off-first phrase inside wake window", "声音先关一下", "暂停音乐", ["暂停音乐"])
    voice_agent.armed_until = voice_agent.time.monotonic() + voice_agent.WAKE_WINDOW_SEC
    check("accepts casual radio-off-first phrase inside wake window", "电台先关一会儿", "暂停音乐", ["暂停音乐"])

    voice_agent.armed_until = 0.0
    check("accepts inline wake command", "弗洛斯特 播放下洛杉矶的歌曲", "弗洛斯特 播放下洛杉矶的歌曲", ["弗洛斯特 播放下洛杉矶的歌曲"])
    check("accepts dropped-si inline wake command", "弗洛特 播放下东京的歌曲", "弗洛特 播放下东京的歌曲", ["弗洛特 播放下东京的歌曲"])
    check("accepts silk-sound inline wake command", "弗洛丝特 播放下东京的歌曲", "弗洛丝特 播放下东京的歌曲", ["弗洛丝特 播放下东京的歌曲"])
    check("accepts inserted-shi inline wake command", "弗洛是特 播放下东京的歌曲", "弗洛是特 播放下东京的歌曲", ["弗洛是特 播放下东京的歌曲"])
    check("accepts Chinese hey inline wake command", "嘿弗洛斯特 播放下东京的歌曲", "嘿弗洛斯特 播放下东京的歌曲", ["嘿弗洛斯特 播放下东京的歌曲"])
    check("accepts Chinese hey-you inline wake command", "喂弗洛斯特 现在放的是啥", "喂弗洛斯特 现在放的是啥", ["喂弗洛斯特 现在放的是啥"])
    check("accepts hey-short-fu nickname inline wake command", "嘿小福 播放下东京的歌曲", "嘿小福 播放下东京的歌曲", ["嘿小福 播放下东京的歌曲"])
    check("accepts full nickname inline wake command", "小弗洛斯特 放点巴黎的音乐", "小弗洛斯特 播放巴黎的音乐", ["小弗洛斯特 播放巴黎的音乐"])
    check("accepts fu nickname inline wake command", "小福洛特 放点巴黎的音乐", "小福洛特 播放巴黎的音乐", ["小福洛特 播放巴黎的音乐"])
    check("accepts Chinese DJ inline wake command", "音乐迪杰 播放下东京的歌曲", "音乐迪杰 播放下东京的歌曲", ["音乐迪杰 播放下东京的歌曲"])
    check("accepts product-name inline wake command", "日落电台 播放下东京的歌曲", "日落电台 播放下东京的歌曲", ["日落电台 播放下东京的歌曲"])
    check("preserves inline wake while normalizing tail", "弗洛斯特 打开声音", "弗洛斯特 打开电台声音", ["弗洛斯特 打开电台声音"])
    check("preserves inline wake while normalizing natural radio tail", "弗洛斯特 开始放歌", "弗洛斯特 继续播放音乐", ["弗洛斯特 继续播放音乐"])
    check("preserves inline wake while normalizing music-comeback tail", "弗洛斯特 音乐回来吧", "弗洛斯特 继续播放音乐", ["弗洛斯特 继续播放音乐"])
    check(
        "preserves inline wake while keeping negative radio-sound tail",
        "弗洛斯特 先别打开电台声音",
        "弗洛斯特 先别打开电台声音",
        ["弗洛斯特 先别打开电台声音"],
    )

    forbidden_labels = {"Standby", "Heard", "Voice command", "Listening", "ASR", "ASR error", "Voice offline"}
    labels = [item["args"][0] for item in published if item.get("args")]
    messages = [item["args"][1] for item in published if len(item.get("args", ())) > 1]
    standby_messages = [message for message in messages if "安静待命" in str(message)]
    results.append(
        {
            "name": "voice state labels stay user-facing Chinese",
            "passed": not any(label in forbidden_labels for label in labels),
            "labels": labels,
        }
    )
    results.append(
        {
            "name": "voice standby prompt uses Chinese wake names",
            "passed": not any("Frost" in str(message) for message in standby_messages),
            "messages": standby_messages[:3],
        }
    )
    results.append(
        {
            "name": "cloud ASR prompt anchors wake names and natural commands",
            "passed": all(
                phrase in voice_agent.ASR_PROMPT
                for phrase in [
                    "弗洛斯特",
                    "弗罗斯特",
                    "福洛斯特",
                    "嘿弗洛斯特",
                    "嗨弗洛斯特",
                    "喂弗洛斯特",
                    "佛洛斯特",
                    "小弗洛斯特",
                    "小福洛特",
                    "弗洛特",
                    "小福",
                    "音乐迪杰",
                    "音乐DJ",
                    "日落电台",
                    "没叫你名字别执行",
                    "背景声音别触发播放",
                    "旁边人喊你会不会乱动",
                    "如果只听到半截别下发命令",
                    "等我说完再执行可以吗",
                    "没说完整别跑动作",
                    "我说到一半停了你别执行",
                    "刚才那半句别当命令",
                    "刚才那句是电视里的别执行",
                    "上一句不是我说的别连热点",
                    "没经过我同意别开摄像头",
                    "没有我按按钮别拍照",
                    "没按按钮你会不会自己开摄像头",
                    "没有我同意别开镜头",
                    "别自动拍环境",
                    "环境扫描会不会偷偷拍",
                    "环境照片会不会上传云端",
                    "只允许我手动触发看一眼可以吗",
                    "别把环境照片上传云端",
                    "会不会根据旁边人的表情自动换歌",
                    "给我来一首东京的歌",
                    "给我放东京的歌",
                    "听一下柏林的音乐",
                    "别放歌了",
                    "先别出歌了",
                    "先别出音乐了",
                    "先把电台按住别播",
                    "等一下再放",
                    "等下再放",
                    "音乐回来吧",
                    "恢复刚才的电台",
                    "刚才那首继续",
                    "不要唱了",
                    "别继续唱了",
                    "不要播了",
                    "先停会儿",
                    "音乐先停一下",
                    "这首先跳过吧",
                    "切歌",
                    "换个歌",
                    "跳一首",
                    "别播这首了",
                    "这首别播了",
                    "把这首切掉",
                    "再说一遍",
                    "你刚说啥",
                    "你刚刚说啥",
                    "你刚才回我啥",
                    "你刚刚回我啥",
                    "你刚回我啥",
                    "刚才你回啥",
                    "刚回复了什么",
                    "上一句你回我啥",
                    "上一句回啥",
                    "你上一句说什么",
                    "刚才调用了什么技能",
                    "刚才干啥了",
                    "你用了什么工具",
                    "刚才用的什么工具",
                    "刚才调了哪个skill",
                    "你刚才调了啥工具",
                    "刚才你到底调了啥",
                    "刚才走的是哪个skill",
                    "刚才那个用到什么工具",
                    "上一步用到哪个能力",
                    "上一条走了哪个工具",
                    "上条走了哪个工具",
                    "上条用了什么工具",
                    "上条路由到哪了",
                    "上一条路由到哪里了",
                    "上一步路由到哪了",
                    "上一回路由到哪了",
                    "刚才结果怎么样",
                    "上次结果呢",
                    "刚刚那个结果呢",
                    "刚才卡在哪一步",
                    "上一条卡在哪一步",
                    "刚才那步走到哪了",
                    "刚才结果会留在屏幕上吗",
                    "跑工具之前会不会告诉我在干嘛",
                    "工具跑完会不会把结果留在屏幕上",
                    "点歌动作失败会不会告诉我为什么",
                    "上一条结果怎么样",
                    "上条结果怎么样",
                    "上一条怎么样",
                    "上条怎么样",
                    "上一轮怎么样",
                    "上一个请求怎么样",
                    "刚才那个怎么样",
                    "刚刚那个怎么样",
                    "刚才那步怎么样",
                    "刚刚那步怎么样",
                    "上个动作有报错吗",
                    "上个请求怎么样",
                    "上条成功了吗",
                    "刚才搞定了吗",
                    "刚才失败了吗",
                    "上一条失败了吗",
                    "上条失败了吗",
                    "上条没成功吗",
                    "你刚才真的执行了吗",
                    "刚才那个动作执行了吗",
                    "上一条有没有真的跑",
                    "刚才那个skill成功了吗",
                    "上一步失败原因是什么",
                    "失败之后会不会再试一次",
                    "别重复执行刚才那个动作",
                    "上一步别再重试了",
                    "你刚才听懂了吗",
                    "你刚刚听明白了吗",
                    "我刚说的你听懂没",
                    "刚刚我说的是啥",
                    "你刚刚收到啥",
                    "你上一句听成什么了",
                    "你刚才听到什么",
                    "你刚才听清了吗",
                    "我刚才说啥",
                    "我刚说啥",
                    "我刚才让你干嘛",
                    "上一条我让你做啥",
                    "上条我让你干嘛",
                    "上一条指令是什么",
                    "上句话是什么",
                    "刚刚那句是什么",
                    "你听错了",
                    "不是刚才那个意思",
                    "取消刚才",
                    "刚才那句算了",
                    "上一条别执行了",
                    "上条别执行了",
                    "撤销上条",
                    "刚才那句撤销",
                    "不要执行刚才那句",
                    "忽略刚才那句",
                    "不要听刚才那句",
                    "别执行上一条了",
                    "刚才那个别管了",
                    "刚刚那个别管了",
                    "别管刚才那个了",
                    "别管上个了",
                    "那句算了",
                    "撤回上一条",
                    "刚才那句当我没说",
                    "上个请求作废",
                    "刚才那条别跑了",
                    "我刚才说错了",
                    "我说错了",
                    "为什么没声音",
                    "你是不是静音了",
                    "现在是什么声音模式",
                    "你能不能出声",
                    "声音关了吗",
                    "现在是静音模式吗",
                    "现在是静音还是能出声",
                    "你现在能说话吗",
                    "现在可以讲话吗",
                    "可以说话了吗",
                    "现在方便说话吗",
                    "方不方便外放",
                    "可以出声了",
                    "可以讲话了",
                    "开口说话",
                    "你说吧",
                    "命令队列卡住了吗",
                    "现在队列里还有东西吗",
                    "你是不是卡住了",
                    "刚才怎么还没执行",
                    "刚才那个请求卡住了吗",
                    "上一条还在排队吗",
                    "上条没反应",
                    "刚才那条没动静",
                    "怎么还不动",
                    "后台服务正常吗",
                    "语音回复正常吗",
                    "部署正常吗",
                    "开机服务正常吗",
                    "屏幕黑了",
                    "看不到状态",
                    "头像不动了",
                    "橙色按钮正常吗",
                    "橙键正常吗",
                    "长按橙色按钮会做什么",
                    "长按橙键会怎样",
                    "长摁橙色键会干嘛",
                    "摁住橙色按钮会干嘛",
                    "按住橙键会怎样",
                    "待机的时候按住橙键会先连手机吗",
                    "没播歌的时候长按橙色键会干嘛",
                    "没播歌的时候橙键按久点会直接放歌吗",
                    "正在播的时候按住橙键是不是就安静了",
                    "播放中长摁橙键会不会安静",
                    "长按后会不会写状态卡",
                    "长按后屏幕会显示结果吗",
                    "按钮动作会写回状态吗",
                    "我按住橙色按钮是不是会重新放歌",
                    "静音的时候按住按钮会不会直接吵出来",
                    "按钮没反应",
                    "长按没反应",
                    "橙色键不灵了",
                    "橙键不灵了",
                    "不要自动播放",
                    "别突然放歌",
                    "安静在屏幕上回我",
                    "只回文字",
                    "打在屏幕上",
                    "打屏幕上",
                    "显示一下就好",
                    "屏幕上写一下就好",
                    "屏幕写一下就好",
                    "现在不方便出声",
                    "回复别出声",
                    "回我别出声",
                    "别外放",
                    "别在扬声器里说",
                    "不要通过扬声器说话",
                    "别用外放说话",
                    "屏幕亮一下就行",
                    "只亮屏别说话",
                    "屏幕上说就行",
                    "悄悄回我",
                    "悄悄打字给我",
                    "悄悄显示一下",
                    "屏幕回复我",
                    "别用语音回",
                    "不要语音回复",
                    "别语音播报",
                    "别读出声",
                    "不要说出声",
                    "旁边有人别读",
                    "同事在旁边别说",
                    "旁边有人别让他听见",
                    "老板在旁边别让他听见",
                    "别吭声",
                    "别吱声",
                    "别吵我了",
                    "先不要讲话",
                    "不要吵了",
                    "小声点",
                    "声音调低点",
                    "音量调低点",
                    "调小一点",
                    "轻声一点",
                    "低声一点",
                    "声音轻一点",
                    "声音压低一点",
                    "小一点声",
                    "声音太小了",
                    "大声点",
                    "声音调高点",
                    "音量调高点",
                    "调大一点",
                    "这首歌叫什么",
                    "这歌叫啥",
                    "别开声音只告诉我这首叫什么",
                    "这歌什么名字",
                    "这首啥名字",
                    "这首歌啥名字",
                    "歌名是什么",
                    "现在歌叫什么名字",
                    "这是什么歌",
                    "这是啥歌",
                    "这会儿放哪一首",
                    "这会儿播哪一首",
                    "这会儿是哪一站来着",
                    "当前这站叫什么名字",
                    "这首歌是哪座城市的",
                    "现在这首是哪座城市的歌",
                    "这是哪座城的歌",
                    "这是哪站的歌",
                    "这歌是哪儿的",
                    "这首歌来自哪里",
                    "这歌从哪儿来",
                    "这歌什么地方的",
                    "这歌属于哪个城市",
                    "这首歌对应哪一站",
                    "这一首是哪站的歌",
                    "刚才那首是哪儿的",
                    "刚才那首来自哪里",
                    "刚才那首归哪站来着",
                    "刚才那歌从哪儿来",
                    "刚才那首别重播只告诉我名字",
                    "刚才播的那首来自哪里",
                    "刚才听的那歌从哪儿来",
                    "刚才响起来的是谁唱的",
                    "刚刚响起来的是哪首歌",
                    "刚才听到的是谁唱的",
                    "前面那首是哪里的",
                    "前面那首来自哪里",
                    "上一首是哪座城的",
                    "刚刚那歌是哪个地方的",
                    "现在听什么歌",
                    "现在唱的是啥",
                    "这会儿放的是啥歌",
                    "现在是什么歌",
                    "这会儿是什么歌",
                    "此刻是啥歌",
                    "这会儿播的啥",
                    "现在唱什么歌",
                    "正在唱什么歌",
                    "这一首是什么歌",
                    "这是谁唱的",
                    "这是谁的歌",
                    "这首是谁的歌",
                    "这谁的歌",
                    "谁唱的来着",
                    "谁的歌来着",
                    "这是哪儿的歌",
                    "这首哪儿的歌",
                    "这首谁唱的",
                    "这歌谁唱的",
                    "现在这歌谁唱的",
                    "这首歌什么来头",
                    "说说这首歌",
                    "聊聊这首歌",
                    "这首说说",
                    "这歌讲讲",
                    "这曲介绍一下",
                    "这歌什么来历",
                    "为什么放这首",
                    "为啥放这首",
                    "这首为啥播",
                    "这首怎么选的",
                    "怎么选的这首",
                    "这首歌和这座城市有什么关系",
                    "这首和这里有什么关系",
                    "这首歌跟东京有什么关系",
                    "这首歌和当前城市有什么关系",
                    "这歌和这里有关吗",
                    "这首歌跟这个城市有关吗",
                    "这首歌适合东京吗",
                    "这歌配这里吗",
                    "这首为什么配这座城市",
                    "这首歌放在东京合适吗",
                    "这歌搭东京吗",
                    "这首歌适不适合东京",
                    "这歌合不合适这里",
                    "这歌跟这个地方有什么联系",
                    "刚才那首跟上一站有关系吗",
                    "这首歌谁写的",
                    "这首谁作曲",
                    "这是谁作曲的",
                    "这首歌讲什么",
                    "这歌讲的什么",
                    "这首歌想表达什么",
                    "这歌什么意思",
                    "这首歌在唱啥",
                    "现在在哪座城市",
                    "现在在哪儿",
                    "我们在哪",
                    "咱们到哪儿了",
                    "咱到哪了",
                    "现在到哪了",
                    "走到哪一站了",
                    "走到哪站了",
                    "这会儿到哪儿了",
                    "这会儿在哪儿",
                    "这会儿播哪座城",
                    "追到哪场日落了",
                    "现在落在哪座城",
                    "这场日落是哪座城",
                    "到哪儿啦",
                    "到哪里啦",
                    "这里是哪座城市",
                    "第几站了",
                    "走到第几站了",
                    "到第几站了",
                    "这趟到第几站了",
                    "这站叫啥",
                    "这里叫啥",
                    "这座城市叫什么名字",
                    "这地方叫什么",
                    "我们这是哪站",
                    "这儿是哪",
                    "这里是哪",
                    "讲讲这座城市",
                    "这个城市有什么故事",
                    "讲讲这个地方",
                    "讲讲这里",
                    "讲讲这一站",
                    "这站讲讲",
                    "讲讲这场日落",
                    "讲讲这站的故事",
                    "这场日落有什么故事",
                    "别切城只讲讲当前这座城",
                    "这场日落什么来头",
                    "当前日落有啥故事",
                    "这场日落是什么感觉",
                    "这站什么来头",
                    "这里什么感觉",
                    "这里有什么来头",
                    "这城什么来头",
                    "这座城有啥故事",
                    "这里有哪些歌",
                    "这城有啥歌",
                    "这座城还有啥能听",
                    "这站还能听啥",
                    "这站剩哪些歌",
                    "这站歌单给我看看",
                    "现在这站的歌单是什么",
                    "这站还有哪些歌",
                    "这站还剩哪些歌",
                    "这站还能播哪些歌",
                    "这站还有什么能播",
                    "这座城还有哪些歌",
                    "这座城还剩什么歌",
                    "这座城还能放啥",
                    "这场日落还有什么歌",
                    "当前日落歌单里有什么",
                    "这场日落还能听啥",
                    "这场日落还有几首歌",
                    "这站歌单里有什么",
                    "这站还有几首歌",
                    "这一站还剩几首",
                    "这里还有几首歌",
                    "现在歌单里有什么",
                    "现在歌单还剩多少首",
                    "后面还有什么歌",
                    "接下来还有哪些歌",
                    "等会儿还有什么歌",
                    "等下还有啥歌",
                    "等下放啥",
                    "待会儿放什么歌",
                    "待会播啥",
                    "待会还有啥歌",
                    "待会还剩几首",
                    "下一首是哪座城市的",
                    "下一首是哪儿的",
                    "下一首来自哪里",
                    "下一首从哪儿来",
                    "接下来那首是哪儿的",
                    "歌单还剩什么",
                    "歌单还有啥",
                    "歌单还剩啥",
                    "曲目还有啥",
                    "歌单还剩几首",
                    "歌单还有几首",
                    "还剩多少首歌",
                    "还有多少首歌",
                    "这一站有什么好听的",
                    "东京有哪些歌",
                    "下一站有什么歌",
                    "下站放啥",
                    "下个城市放啥",
                    "上一站有什么歌",
                    "上站放啥",
                    "前一个城市放啥",
                    "下一站是哪",
                    "下站是哪",
                    "下个城市是哪",
                    "下一站还有多久",
                    "多久到下一站",
                    "下站多久到",
                    "待会去哪",
                    "等会儿会到哪座城",
                    "等下去哪儿",
                    "一会儿去哪",
                    "然后去哪",
                    "再往后去哪",
                    "再往后会到哪",
                    "下个城市还有多久",
                    "快到下一站了吗",
                    "还有几分钟到下一站",
                    "上一站是哪",
                    "刚才那站是哪",
                    "回到刚才那站",
                    "之前在哪",
                    "刚才在哪个城市",
                    "后面还有哪些地方",
                    "后面还有啥城市",
                    "后续还有啥城市",
                    "剩下啥城市",
                    "剩下几座城市",
                    "这趟后面还有几座城",
                    "这趟电台后面还绕哪儿",
                    "后面还会落到哪几座城",
                    "后半程还去哪儿",
                    "今晚会经过哪些城市",
                    "今天会去哪些城市",
                    "今天还会去哪",
                    "今天还会经过哪些地方",
                    "今天电台怎么走",
                    "后面还有哪几个日落",
                    "接下来还有哪些日落",
                    "今天还追哪些日落",
                    "还会去哪儿",
                    "后面还去哪",
                    "接下来还走哪儿",
                    "后面还经过哪里",
                    "路线咋安排",
                    "后面路线怎么安排",
                    "剩下还经过哪里",
                    "再往后还有哪几站",
                    "剩下还有哪几站",
                    "这趟怎么走",
                    "今天这趟电台怎么安排",
                    "这趟电台后面去哪",
                    "后面怎么走",
                    "后面咋走",
                    "接下来咋走",
                    "后面咋安排",
                    "接下来怎么安排",
                    "后面还有什么地方",
                    "这趟还会路过哪儿",
                    "接下来路过哪儿",
                    "后面路过哪里",
                    "这趟还有几站",
                    "这趟还剩几站",
                    "这趟剩下啥地方",
                    "还剩几站",
                    "剩下多少站",
                    "这趟还剩哪些城市",
                    "今天还剩哪些站",
                    "电台后面还剩哪些站",
                    "帮我安排一档24小时音乐电台",
                    "规划一整天的日落电台",
                    "帮我挑几首海边日落的歌",
                    "回家路上来点稳的歌",
                    "通勤路上来点稳的歌",
                    "雨天来点歌",
                    "外面散步来点不吵的歌",
                    "我想安静一点来首不吵的歌",
                    "我有点累别太吵的歌",
                    "来首不吵的",
                    "来首别太吵的",
                    "散步的时候来点稳一点的音乐",
                    "你会偷拍吗",
                    "你会偷听吗",
                    "你会不会偷录",
                    "你会不会偷看",
                    "别偷录",
                    "别偷看",
                    "别偷拍",
                    "你在录吗",
                    "你在拍吗",
                    "你录了吗",
                    "你拍了吗",
                    "你有没有录我",
                    "你有没有拍我",
                    "刚才有录音吗",
                    "刚才拍照了吗",
                    "你现在有没有开摄像头",
                    "你现在有没有开麦克风",
                    "你一直开着麦吗",
                    "现在麦还开着吗",
                    "麦关了吗",
                    "有没有打开相机",
                    "有没有打开麦克风",
                    "麦克风会一直录音吗",
                    "会不会一直录",
                    "你会不会录下来",
                    "录音会保存吗",
                    "我说的话会保存吗",
                    "我的语音会上传吗",
                    "会不会把我的语音传云端",
                    "你会保存我的声音吗",
                    "你会把我的声音存起来吗",
                    "你会不会存我的声音",
                    "会不会存聊天记录",
                    "这段会不会上传",
                    "别把声音传到云端",
                    "别传云端",
                    "不要传到云端",
                    "这句不要上传",
                    "这段话会保存吗",
                    "你会把我的声音发给别人吗",
                    "会不会把聊天记录发给别人",
                    "别把这段话发给别人",
                    "会不会传到服务器",
                    "别传到服务器",
                    "不要同步到云端",
                    "你会拿我的声音训练模型吗",
                    "别拿我的话训练模型",
                    "这段会拿去训练吗",
                    "别记住我说的话",
                    "别记我刚才的话",
                    "别记住我的位置",
                    "别把我的位置记下来",
                    "会保存我的位置吗",
                    "不要上传我的定位",
                    "别记我的路线",
                    "不要保存我的行程",
                    "会保存我的路线吗",
                    "别跟踪我",
                    "不要追踪我的轨迹",
                    "会跟踪我吗",
                    "这句别记了",
                    "别记下来",
                    "不要记下来",
                    "刚才那句别记",
                    "这段别存",
                    "别存这句话",
                    "不要存这句",
                    "刚才那句不要保存",
                    "别保存这个",
                    "别留这条记录",
                    "别留聊天记录",
                    "别存档",
                    "别录音",
                    "别录了",
                    "不要一直听我",
                    "别开麦",
                    "不要监听我",
                    "相机会自动开吗",
                    "相机会不会偷偷开",
                    "你现在看得到我吗",
                    "会识别人脸吗",
                    "你会认出我是谁吗",
                    "不要识别我是谁",
                    "会判断我是谁吗",
                    "会不会拍下来",
                    "会不会一直拍",
                    "别拍我",
                    "别拍了",
                    "不要看我",
                    "别录像",
                    "现在连的是哪个Wi-Fi",
                    "现在用哪个Wi-Fi",
                    "走的是哪个网络",
                    "还在家里Wi-Fi上吗",
                    "家里wifi还连着吗",
                    "现在是不是连着家里网",
                    "Wi-Fi现在是哪一个",
                    "现在用的还是家里Wi-Fi吗",
                    "现在连的是家里网还是手机热点",
                    "现在走家里网还是手机流量",
                    "有没有从家里wifi切出来",
                    "连上我手机了吗",
                    "现在连上手机没",
                    "现在连没连我手机",
                    "你连没连我手机",
                    "连上iPhone了吗",
                    "我的iPhone连上了吗",
                    "苹果手机连上了吗",
                    "PocketEarth-Android连上了吗",
                    "iPhone连不上会不会试vivo",
                    "PocketEarth-iPhone没找到会不会找vivo",
                    "苹果热点没找到会不会再找PocketEarth-Android",
                    "苹果热点不见了会不会再试vivo",
                    "先找苹果再找vivo对吗",
                    "vivo也没找到会不会回家里Wi-Fi",
                    "vivo也连不上会不会卡住",
                    "两个热点都找不到会回家里Wi-Fi吗",
                    "出门热点失败会不会回落家里网",
                    "Wi-Fi失败后会不会重复切换",
                    "热点密码会不会写进git",
                    "热点密码会不会写进日志",
                    "密码别出现在屏幕上",
                    "WiFi密码别显示出来",
                    "手机连上了吗",
                    "现在接上手机了吗",
                    "现在是不是连着手机",
                    "你现在蹭的是我手机吗",
                    "现在蹭我手机网吗",
                    "现在是不是蹭我手机网",
                    "有没有走我的热点",
                    "现在是不是走的我手机热点",
                    "有没有用上我的热点",
                    "帮我看看热点连上没",
                    "现在用的是手机热点吗",
                    "用上手机流量了吗",
                    "你用没用上我手机网",
                    "有没有切到我手机流量",
                    "有没有切到我的流量",
                    "你能上网吗",
                    "还有网吗",
                    "网还在吗",
                    "网还活着吗",
                    "网断了吗",
                    "网络是不是断了",
                    "是不是离线了",
                    "网络掉线了吗",
                    "网是不是挂了",
                    "网坏了吗",
                    "现在是不是没联网",
                    "你是不是掉线了",
                    "还能不能上网",
                    "没网了",
                    "网络通了吗",
                    "联网通了吗",
                    "连上网了吗",
                    "网还通吗",
                    "有没有联网",
                    "网络恢复了吗",
                    "现在网咋样",
                    "现在网络咋样",
                    "网怎么样",
                    "网络怎么样",
                    "网还稳吗",
                    "Wi-Fi掉了帮我连回热点",
                    "网络不稳帮我修一下",
                    "帮我维护一下",
                    "清理一下缓存",
                    "帮我恢复一下状态",
                    "后台收拾一下",
                    "你自己修复一下",
                    "我手机热点开好了",
                    "热点已经打开了",
                    "手机热点开了",
                    "手机流量开了",
                    "手机流量开好了",
                    "手机网络开好了",
                    "流量开好了",
                    "我打开个人热点了",
                    "我的热点好了",
                    "我把热点弄好了",
                    "我弄好热点了",
                    "连一下iPhone热点",
                    "帮我连PocketEarth-iPhone",
                    "帮我连PocketEarth-Android",
                    "切到vivo热点",
                    "换到vivo热点",
                    "用苹果手机热点",
                    "用我手机流量",
                    "换我手机网络",
                    "文字回我就行",
                    "只回文字",
                    "打在屏幕上",
                    "打屏幕上",
                    "显示一下就好",
                    "屏幕上写一下就好",
                    "屏幕写一下就好",
                    "打字就行",
                    "默默回我",
                    "悄悄打字给我",
                    "悄悄显示一下",
                    "屏幕告诉我就行",
                    "只在屏幕上回我",
                    "回复别出声",
                    "回我别出声",
                    "别语音播报",
                    "别读出来",
                    "别读出声",
                    "不要说出声",
                    "旁边有人别读",
                    "同事在旁边别说",
                    "旁边有人别让他听见",
                    "老板在旁边别让他听见",
                    "别讲出来",
                    "不要讲出来",
                    "不用讲出来",
                    "出门前帮我检查一下",
                    "准备走了",
                    "我要出发了",
                    "要带你出发了",
                    "我们要上路了",
                    "准备离家了",
                    "该出发了",
                    "可以出发了吗",
                    "我们出发吧",
                    "咱们走吧",
                    "要走啦",
                    "带你走了",
                    "你听得到我吗",
                    "你听见了吗",
                    "你听到我说话了吗",
                    "我说话你能听见吗",
                    "我讲话你听得到吗",
                    "你听得清我吗",
                    "我说话清楚吗",
                    "你听不到我吗",
                    "你是不是听不清我",
                    "我声音清楚吗",
                    "我这边声音正常吗",
                    "我声音太小你听得见吗",
                    "我离远一点你还能听见吗",
                    "环境太吵你还听得清吗",
                    "风声很大你能听清吗",
                    "我刚才那句是不是没收进去",
                    "你刚才是不是没收到我的声音",
                    "话筒是不是坏了",
                    "麦有声音吗",
                    "你收得到我的声音吗",
                    "能收到我声音吗",
                    "你能听懂我吗",
                    "你怎么没反应",
                    "叫你没反应",
                    "你是不是没听见我",
                    "麦克风正常吗",
                    "你能调用什么技能",
                    "你有什么本领",
                    "你刚才做了什么",
                    "刚才干啥了",
                    "执行了什么动作",
                    "用了哪个能力",
                    "你用了什么工具",
                    "刚才用的什么工具",
                    "刚才调了哪个skill",
                    "你刚才调了啥工具",
                    "刚才走的是哪个skill",
                    "刚才那个用到什么工具",
                    "上一步用到哪个能力",
                    "上一条走了哪个工具",
                    "上条路由到哪了",
                    "上一条路由到哪里了",
                    "上一步路由到哪了",
                    "上一回路由到哪了",
                    "刚才结果怎么样",
                    "上次结果呢",
                    "刚刚那个结果呢",
                    "刚才卡在哪一步",
                    "上一条卡在哪一步",
                    "刚才那步走到哪了",
                    "刚才结果会留在屏幕上吗",
                    "跑工具之前会不会告诉我在干嘛",
                    "工具跑完会不会把结果留在屏幕上",
                    "点歌动作失败会不会告诉我为什么",
                    "上一条结果怎么样",
                    "刚才成功了吗",
                    "刚才搞定了吗",
                    "上个动作有报错吗",
                    "刚才那个弄好了吗",
                    "上一条弄成了吗",
                    "刚刚那次成功没",
                    "上个动作卡住了吗",
                    "上个动作状态还留着吗",
                    "刚才那条还在队列里吗",
                    "刚刚那个结果写屏了吗",
                    "后台动作有没有完成",
                    "上个请求怎么样",
                    "上一个请求怎么样",
                    "上一步办成了吗",
                    "上一步搞定了吗",
                    "上一条执行成功了吗",
                    "失败了咋办",
                    "工具超时会不会一直重试",
                    "路由失败会不会告诉我原因",
                    "如果技能没跑通别一直试",
                    "如果点歌失败别自动重播",
                    "下发到树莓派失败会不会留在屏幕",
                    "上一步没成功先别继续下发",
                    "工具挂了你会不会乱执行",
                    "下发到Pi失败会不会留在屏幕",
                    "如果播放命令失败会不会安静待命",
                    "上一步没成功会不会自动重试很多次",
                    "没听懂咋办",
                    "工具挂了会怎样",
                    "你会不会瞎执行",
                    "上条没反应",
                    "刚才那条没动静",
                    "怎么还不动",
                    "你有哪些工具",
                    "你有哪些skill",
                    "你能调哪些工具",
                    "你都有哪些能力",
                    "你支持什么技能",
                    "现在能调用什么",
                    "你现在能调用啥",
                    "会调用哪些工具",
                    "你可以调用哪些动作",
                    "你有哪些动作能力",
                    "你会做哪些操作",
                    "你会哪些操作",
                    "你能操作哪些东西",
                    "你能控制哪些东西",
                    "上下文会保留多久",
                    "刚才的上下文还在吗",
                    "刚才上下文还在吗",
                    "上一句我们聊到哪了",
                    "你会记住刚才我说的话吗",
                    "你能接着上一句聊吗",
                    "你能接着刚才那句话聊吗",
                    "这一轮会记住什么",
                    "这轮你会记住我刚才说的心情吗",
                    "这次只记当前对话可以吗",
                    "我的音乐偏好会保存吗",
                    "别把我的音乐偏好长期保存",
                    "刚才我说喜欢不吵的歌你会接着吗",
                    "别把我刚才说喜欢爵士写进长期记忆",
                    "刚才说的音乐偏好别带到下次",
                    "我刚才心情不好这事会存起来吗",
                    "下次不要记得我喜欢这类歌",
                    "只在当前对话里记住我想听慢一点",
                    "临时记一下我现在想听慢一点",
                    "刚说的歌单口味只留到今晚",
                    "这段心情过了今晚就忘掉",
                    "明天别记得我喜欢海边日落",
                    "今天喜欢爵士这事明天别记得",
                    "这事别带到明天",
                    "这句话别带到下次",
                    "这条消息只留在本轮",
                    "这条消息只留本轮可以吗",
                    "这段话不要带到以后",
                    "我喜欢安静的歌这件事会不会存起来",
                    "你能干点啥",
                    "你会干啥",
                    "你会做啥",
                    "你能帮我做点啥",
                    "你能帮我干点什么",
                    "你会干嘛",
                    "你都能干什么",
                    "你会些什么",
                    "你有什么本领",
                    "你能帮上什么忙",
                    "你能帮我干啥",
                    "帮我自检一下",
                    "你自己检查一下",
                    "体检一下",
                    "你现在健康吗",
                    "帮我做个健康检查",
                    "帮我排查一下",
                    "哪里坏了",
                    "你能不能自己看一下",
                    "手机快没电了",
                    "只剩5%了",
                    "只剩百分之十了",
                    "就剩五个点了",
                    "手机快关机了",
                    "手机撑不住了",
                    "电快耗光了",
                    "手机红电了",
                    "电量黄了",
                    "还有个位数电",
                    "只剩个位数了",
                    "手机低电模式了",
                    "手机剩五个点了",
                    "就剩5个点电了",
                    "手机电不多了",
                    "手机电不够了",
                    "手机电还够吗",
                    "手机还有多少电",
                    "手机还剩多少电",
                    "我手机还剩多少电",
                    "手机还能撑吗",
                    "手机还能撑多久",
                    "手机撑得住吗",
                    "我手机信号不好",
                    "手机没信号了",
                    "我手机网络太差",
                    "手机网络不太行",
                    "信号一格了",
                    "我手机信号只有一格",
                    "我电不够了",
                    "我电还够吗",
                    "电够不够撑到回家",
                    "电够不够回家",
                    "电够撑到家吗",
                    "电够回去吗",
                    "手机撑不撑得到家",
                    "手机电量撑得回家吗",
                    "还能撑到回家吗",
                    "还能撑回去吗",
                    "手机电池快不行了",
                    "手机只剩一点电了",
                    "手机只剩百分之五了",
                    "手机电量只有百分之五",
                    "我手机就剩5%了",
                    "只剩五个电了",
                    "我只剩五个点电了",
                    "我只剩百分之十电了",
                    "我只有10%电了",
                    "只剩百分之十电了",
                    "省电一点",
                    "省点电",
                    "省着点用电",
                    "别太耗电",
                    "电量还够吗",
                    "还能撑多久",
                    "要不要充电",
                    "夜路有点晚了我要打车回家",
                    "外面太晚了",
                    "外面有点晚",
                    "外面有点不安全",
                    "我要回家了",
                    "我想回去了",
                    "路上有点害怕",
                    "路上有点危险",
                    "路上不太安全",
                    "路上不太安心",
                    "感觉有人跟着我",
                    "后面好像有人跟着",
                    "后面好像有人",
                    "有人跟着",
                    "有人尾随",
                    "好像有人尾随我",
                    "旁边好像不太安全",
                    "这边不太安全",
                    "回家路上有点慌",
                    "陪我回家",
                    "陪我走回去",
                    "陪我走一段",
                    "陪我走到地铁口",
                    "陪我走到地铁站",
                    "回家怎么走",
                    "怎么回家比较安全",
                    "带我回家",
                    "送我回去",
                    "带我回去",
                    "快到家了吗",
                    "带我去地铁站",
                    "带我去便利店",
                    "周围安全吗",
                    "这附近安全吗",
                    "这条路安全吗",
                    "找个安全的地方",
                    "找条亮一点的路",
                    "帮我找亮一点的路",
                    "找人多一点的路",
                    "找人多一点的地方",
                    "避开小巷回家",
                    "别走小巷",
                    "别带我走太黑的小路",
                    "我想打车",
                    "找个地方躲雨",
                    "下雨了找个地方躲一下",
                    "外面下雨了怎么办",
                    "我没带伞",
                    "哪里可以买伞",
                    "雨太大先找个室内",
                    "我有点口渴",
                    "我渴了",
                    "想买瓶水",
                    "哪里可以买水",
                    "附近有水买吗",
                    "太热了找个室内歇一下",
                    "外面太热了怎么办",
                    "我好像中暑了",
                    "找个地方补水",
                    "我有点冷",
                    "外面太冷了怎么办",
                    "太冷了找个室内歇一下",
                    "找个暖和地方",
                    "哪里可以买热饮",
                    "附近有热饮买吗",
                    "想买杯热水",
                    "风太大了怎么办",
                    "外面风好大找个避风地方",
                    "找个避风的地方",
                    "风大想找室内",
                    "找个没风的地方",
                    "最近有地铁口吗",
                    "我想找地铁站",
                    "地铁站在哪",
                    "我想找公交站",
                    "公交站在哪",
                    "巴士站在哪",
                    "哪里有便利店",
                    "便利店在哪",
                    "附近有药店吗",
                    "药店在哪",
                    "哪里可以买创可贴",
                    "附近能买创可贴吗",
                    "我擦破皮了找个药店",
                    "我有点头疼想找药店",
                    "肚子疼附近有药店吗",
                    "想买点药",
                    "找个药店买药",
                    "洗手间在哪",
                    "厕所在哪儿",
                    "哪里有厕所",
                    "我想上厕所",
                    "厕所怎么走",
                    "带我去厕所",
                    "我想去洗手间",
                    "找个地方充电",
                    "哪里能充电",
                    "附近有共享充电宝吗",
                    "我想借个充电宝",
                    "我想坐一下",
                    "我想找个地方坐会儿",
                    "找个地方歇会儿",
                    "有点累想坐一下",
                    "走累了找地方休息",
                    "走累了想歇一下",
                    "电池医生",
                    "屏幕医生",
                    "按钮医生",
                    "静音医生",
                    "刚才那条有没有发到树莓派",
                    "上一条命令会不会重复发给Pi",
                    "执行前会不会先写个准备中",
                ]
            ),
            "prompt": voice_agent.ASR_PROMPT,
        }
    )
    results.append(
        {
            "name": "cloud ASR prompt anchors low-confidence action guards",
            "passed": all(
                phrase in voice_agent.ASR_PROMPT
                for phrase in [
                    "听不准就别连热点",
                    "识别不准先别执行",
                    "识别不确定会不会乱点",
                    "你没听准会怎么兜底",
                    "听错了不要直接连手机热点",
                    "低置信度别发给树莓派",
                    "不确定的命令不要下发给Pi",
                ]
            ),
            "prompt": voice_agent.ASR_PROMPT,
        }
    )
    results.append(
        {
            "name": "cloud ASR prompt anchors Frost dialog status phrases",
            "passed": all(
                phrase in voice_agent.ASR_PROMPT
                for phrase in [
                    "我发出去的话会不会不见",
                    "我的消息发出去还在吗",
                    "我刚发出去的消息还留着吗",
                    "我发完会不会被你吞掉",
                    "我发完消息你别吞",
                    "你回我时不要盖掉我刚发的那条",
                    "刚才那条消息还能看到吗",
                    "普通闲聊别抢24小时主线",
                    "什么情况会走pi tts",
                    "哪些回复会读出来哪些只写屏",
                    "不重要的回复会不会走pi tts",
                    "不重要的话只留在对话框",
                    "旁边有人时重要提醒也别念吗",
                    "旁边有人重要提醒也先打字",
                    "你怎么判断要不要朗读",
                    "什么时候会真的出声",
                    "重要的话会不会读出来",
                    "主线还在吗",
                    "聊完之后主线还在吗",
                    "DJ支线结束后会继续24小时电台吗",
                ]
            ),
            "prompt": voice_agent.ASR_PROMPT,
        }
    )

    ok = all(item["passed"] for item in results)
    print(json.dumps({"ok": ok, "results": results, "queued": queued, "publishedCount": len(published)}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
