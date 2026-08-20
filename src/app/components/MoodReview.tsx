import { useReducer, useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { getMoodStickers, removeMoodSticker, subscribeMood, MOOD_TONES, type MoodSticker } from '../data/geoStickers';
import { groupMoodsByTimeline, toneDistribution, moodSummary, dayKey } from '../lib/mood/retrospect';

// 心情回望（review-only）—— 从原 mood-agent 抽出的「列表 / 回望」复盘面板，并进 JOT 的「心情」页。
// 只读 + 删除：写心情走 JOT「记一笔」（统一入口），这里专管回看——情绪分布 + 时间线分组，看心情如何累积。
// 纯派生自 geoStickers（与中间地球同一份数据），subscribeMood 增删自动重渲染。

const ACCENT = '#ffd23b';

export default function MoodReview() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeMood(force), []);
  const [view, setView] = useState<'list' | 'retrospect'>('list');

  // 只看「真心情贴」：排除 MyMapTab 种入同一 store 的白色 LOC_SYNC 定位卡（无 tone、variant:'card'），
  // 让空态守卫 / 列表 / 概览计数都与 summary（moodOf 过滤）口径一致——否则新访客一进来会把定位卡当心情贴。
  const stickers = getMoodStickers().filter((s) => s.tone && MOOD_TONES[s.tone]);
  const summary = moodSummary(stickers);   // 仅统计有情绪基调的真心情贴
  const cities = summary.cities;           // 与 summary 同口径（已过滤「此处/随机落点」脏地名），免两处计数漂移
  // 仅当存在「带情绪的真心情贴」才进回望（view 残留 'retrospect' 也回落列表，避免没 Tab 可切回的死角）
  const showRetrospect = view === 'retrospect' && summary.count > 0;
  const dist = showRetrospect ? toneDistribution(stickers) : [];
  const maxTone = dist.reduce((m, b) => Math.max(m, b.count), 0);
  const timeline = showRetrospect ? groupMoodsByTimeline(stickers) : [];

  // 单张心情贴（列表与时间线共用同一份 JSX，避免漂移）
  const renderSticker = (s: MoodSticker) => (
    <div key={s.id} className="relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.55)] px-3 py-2.5" style={{ background: s.color, transform: `rotate(${s.rot * 0.4}deg)` }}>
      <span className="absolute -top-2 left-4 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
      <div className="text-[12px] leading-snug text-black font-medium break-words pr-5">{s.text}</div>
      <div className="font-pixel text-[7px] text-black/55 tracking-wider mt-1.5 flex items-center gap-1">
        {s.tone && <span className="border border-black/40 px-1 py-0.5 text-black/70">{MOOD_TONES[s.tone].label}</span>}
        <span>◍ {s.place} · {dayKey(s.createdAt)}</span>
      </div>
      <button type="button" aria-label="删除这条心情" onClick={() => removeMoodSticker(s.id)} className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-black/40 hover:text-[#d23b3b] active:translate-y-px">
        <X className="w-3.5 h-3.5" strokeWidth={3} />
      </button>
    </div>
  );

  if (stickers.length === 0) {
    return (
      <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
        <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: '#caa400' }} />
        <div className="text-[12px] font-bold mb-1">还没有心情贴</div>
        <div className="text-[11px] text-black/55 leading-snug">去「记一笔」写一句此刻的心情，它会钉到地球、也会在这里累积成情绪足迹。</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 概览条 */}
      <div className="px-3 py-2 border-2 border-black bg-black" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>心情 {stickers.length}</span><span className="opacity-40">|</span>
          <span>落点 {cities} 处</span><span className="opacity-40">|</span>
          <span>{summary.domTone ? `底色 · ${MOOD_TONES[summary.domTone].label}` : '判情绪 · 判地名'}</span>
        </div>
      </div>

      {/* 列表 / 回望 切换（有「带情绪的真心情贴」才显示，与回望空态口径一致） */}
      {summary.count > 0 && (
        <div className="flex border-2 border-black bg-[#EAEAEA] p-1 gap-1">
          {([['list', '列表 ◎'], ['retrospect', '回望 ◍']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 font-pixel text-[9px] py-1.5 tracking-wider ${view === v ? 'bg-black text-[#ffd23b]' : 'text-black/60'}`}>{label}</button>
          ))}
        </div>
      )}

      {/* 列表视图 */}
      {!showRetrospect && (
        <div className="space-y-2.5">
          {stickers.map(renderSticker)}
          <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">心情贴与中间地球同一份 · 缩放不跟跑</div>
        </div>
      )}

      {/* 回望视图：情绪分布卡 + 时间线分组 */}
      {showRetrospect && (
        <div className="space-y-2.5">
          <div className="border-2 border-black bg-white px-3 py-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.55)]">
            <div className="font-pixel text-[11px] tracking-wider">心情足迹 ◍</div>
            <div className="text-[10px] text-black/55 mt-1">总 {summary.count} 条 · {summary.cities} 处落点 · {summary.days} 天</div>
            <div className="mt-2.5 space-y-1">
              {dist.map((b) => (
                <div key={b.tone} className="flex items-center gap-1.5">
                  <span className="font-pixel text-[7px] border border-black/40 px-1 py-0.5 text-black/70 w-5 text-center shrink-0">{b.label}</span>
                  <div className="flex-1 h-2 bg-[#e8e8e8] border border-black/20">
                    <div className="h-full" style={{ width: `${maxTone ? (b.count / maxTone) * 100 : 0}%`, background: b.color }} />
                  </div>
                  <span className="font-pixel text-[7px] text-black/50 w-4 text-right shrink-0">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
          {timeline.map((g) => (
            <div key={g.key}>
              <div className="font-pixel text-[11px] mb-2 mt-3 first:mt-0 tracking-wider">{g.label}</div>
              <div className="space-y-2.5">{g.stickers.map(renderSticker)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
