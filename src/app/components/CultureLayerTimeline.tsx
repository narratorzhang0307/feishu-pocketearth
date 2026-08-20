// 文化层叠压时间轴（看展搭子）· 学博物馆笔记的「考古文化层」思想：旧的在底、新的叠压在上（与常规时间轴相反）。
// 纯前端确定性排序：按 eraStart 降序（新在上），层间 margin-top:-3px 制造剖面叠压感，越古老越暗。
import { useState } from 'react';
import type { ArtifactCardData } from './ArtifactCard';
import { hasRenderableSplat } from '../lib/exhibition/splatState';

interface Layer { key: string; label: string; eraStart: number; items: ArtifactCardData[] }

const eraText = (y: number) => (y >= 9999 ? '未定年代' : y < 0 ? `前 ${-y}` : `${y}`);
const qwenConfidenceText = (n?: number) => (typeof n === 'number' ? `QWEN·${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : '');

// 「新」印章判据：钉入 7 天内（学博物馆笔记的新入藏红印——回看时一眼认出这次刚收的）
const isNew = (createdAt?: string) => {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return !Number.isNaN(t) && Date.now() - t < 7 * 24 * 3600e3;
};

export default function CultureLayerTimeline({ items, onPick }: { items: ArtifactCardData[]; onPick?: (d: ArtifactCardData) => void }) {
  const [failed, setFailed] = useState<Set<string>>(new Set());   // 缩略图坏图 → 回退名字占位，不留破图
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());   // 层折叠：藏品多了按朝代收起来翻
  // 按朝代分层，eraStart 作层序键
  const byLayer = new Map<string, Layer>();
  for (const it of items) {
    const label = it.dynastyLabel || '未定年代';
    const era = it.eraStart ?? 9999;   // 未定年代排最上（视作最新）
    const g = byLayer.get(label) || { key: label, label, eraStart: era, items: [] };
    g.items.push(it);
    byLayer.set(label, g);
  }
  // 新在上（eraStart 大在前）、旧在下（小在后）→ 文化层：越往下越古老
  const layers = [...byLayer.values()].sort((a, b) => b.eraStart - a.eraStart);

  if (!layers.length) {
    return <div className="text-center text-[10px] text-black/40 py-10 font-pixel tracking-wide">还没有钉展品 · 拍张展签开始集邮</div>;
  }

  return (
    <div>
      <div className="font-pixel text-[7px] text-black/45 px-1 pb-2 leading-relaxed">↑ 越往上越新 · 越往下越古老（考古文化层：旧的在底、新的叠压在上）</div>
      <div>
        {layers.map((L, i) => {
          // 越古老越暗（eraStart 越小越暗）
          const depth = Math.min(1, Math.max(0, (2000 - L.eraStart) / 4200));
          const shade = `hsl(158 24% ${Math.round(56 - depth * 30)}%)`;
          const folded = collapsed.has(L.key);
          const newCount = L.items.filter((it) => isNew(it.createdAt)).length;
          return (
            <div key={L.key} className="border-2 border-black bg-white" style={{ marginTop: i === 0 ? 0 : -3 }}>
              <button onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(L.key)) n.delete(L.key); else n.add(L.key); return n; })}
                className="w-full flex items-center justify-between px-2.5 py-1.5 active:translate-y-px" style={{ background: shade }}>
                <span className="font-pixel text-[9px] text-white tracking-wide">{folded ? '▸' : '▾'} {L.label} · {eraText(L.eraStart)}</span>
                <span className="font-pixel text-[7px] text-white/85 flex items-center gap-1">
                  共 {L.items.length} 件
                  {newCount > 0 && <span className="bg-[#d23b3b] text-white px-1 py-0.5">新 {newCount}</span>}
                </span>
              </button>
              {!folded && (
              <div className="flex gap-1.5 overflow-x-auto px-2 py-2">
                {L.items.map((it) => {
                  const has3D = hasRenderableSplat(it);
                  const timelineNote = (it.timelineNote || '').replace(/^时间线位置[：:]\s*/, '');
                  const qwenConfidence = qwenConfidenceText(it.qwenConfidence);
                  const qwenSummary = (it.qwenContributionSummary || '').trim();
                  return (
                    <button key={it.id} onClick={() => onPick?.(it)} className="shrink-0 w-16 active:translate-y-px">
                      <div className="w-14 h-14 mx-auto border border-black bg-[#EAEAEA] flex items-center justify-center relative overflow-hidden">
                        {it.photos?.[0] && !failed.has(it.id)
                          ? <img src={it.photos[0]} alt="" onError={() => setFailed((s) => new Set(s).add(it.id))} className="w-full h-full object-cover" />
                          : <span className="font-pixel text-[6px] text-black/40 px-0.5 text-center leading-tight">{(it.nameZh || '展品').slice(0, 6)}</span>}
                        {isNew(it.createdAt) && <span className="absolute top-0 left-0 bg-[#d23b3b] text-white font-pixel text-[5px] px-0.5 leading-tight">新</span>}
                        {has3D && <span className="absolute bottom-0 right-0.5 text-[9px] leading-none" style={{ color: '#C8A24B' }}>◆</span>}
                      </div>
                      <div className="font-pixel text-[6px] text-black/60 truncate mt-0.5 text-center">{it.nameZh || '展品'}</div>
                      {qwenConfidence && <div className="font-pixel text-[5px] text-[#5A8F7B] truncate text-center leading-tight">{qwenConfidence}</div>}
                      {qwenSummary && <div className="font-pixel text-[5px] text-[#5A8F7B] truncate text-center leading-tight">QWEN·{qwenSummary}</div>}
                      {timelineNote && <div className="font-pixel text-[5px] text-black/35 truncate text-center leading-tight">{timelineNote}</div>}
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
