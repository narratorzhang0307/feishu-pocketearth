// 展品卡（看展搭子）· Pocket Earth 像素风票根样式，青铜绿主色。
// 一张卡 = 一个 Artifact；右侧撕票区换成「媒体徽章塔」（照片/3D 逐层点亮，见落地方案 §1.1）。
import { MapPin } from 'lucide-react';
import { hasRenderableSplat } from '../lib/exhibition/splatState';

const TEAL = '#5A8F7B';
const AMBER3D = '#C8A24B';

export interface ArtifactCardData {
  id: string;
  nameZh: string;
  nameEn?: string;
  aliases?: string[];
  dynastyLabel?: string;
  eraStart?: number | null;
  material?: string[];
  category?: string;
  culture?: string;
  qwenConfidence?: number;
  qwenContributions?: string[];
  qwenContributionSummary?: string;
  museum?: string;
  place?: string;
  findspot?: string;
  dimensions?: string;
  labelZh?: string;
  curatorNote?: string;
  timelineNote?: string;
  curatorNoteEn?: string;
  culturalBridgeNote?: string;
  rating?: number;
  splatStatus?: string;
  splatUrl?: string;
  splatId?: string;
  splatCaptureQualityWarn?: string;
  format?: string;
  photos?: string[];
  visitDate?: string;
  exhibition?: string;   // 特展名（「中国古代通史陈列」这类观展记忆的一等单位）
  createdAt?: string;    // 钉入时间（文化层「新」印章判据）
}

const stars = (r?: number) => { const n = Math.max(0, Math.min(5, r || 0)); return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); };
const eraText = (y?: number | null) => (y == null ? '' : (y < 0 ? `前${-y}` : `${y}`));
const confidenceText = (n?: number) => (typeof n === 'number' ? `QWEN·${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : '');
const inactiveMediaColor = 'rgba(0,0,0,0.18)';
const splatBadge = (data: ArtifactCardData) => {
  const status = String(data.splatStatus || '').trim().toLowerCase();
  if (status === 'failed') return { label: '◆ 3D失败', color: '#B4533A' };
  if (['capturing', 'uploading', 'reconstructing'].includes(status)) return { label: '◆ 3D重建中', color: AMBER3D };
  if (hasRenderableSplat(data)) return { label: '◆ 3D就绪', color: AMBER3D };
  return { label: '◆ 3D', color: inactiveMediaColor };
};

export default function ArtifactCard({ data, onClick }: { data: ArtifactCardData; onClick?: () => void }) {
  const hasPhoto = (data.photos?.length || 0) > 0;
  const firstAlias = data.aliases?.find(Boolean);
  const confidence = confidenceText(data.qwenConfidence);
  const qwenSummary = (data.qwenContributionSummary || '').trim();
  const timelineNote = (data.timelineNote || '').replace(/^时间线位置[：:]\s*/, '');
  const threeDBadge = splatBadge(data);
  return (
    <button onClick={onClick} className="w-full text-left border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] bg-white relative overflow-hidden active:translate-y-px">
      {/* 顶部青铜绿条 */}
      <div className="flex items-center justify-between px-2.5 py-1" style={{ background: TEAL }}>
        <span className="font-pixel text-[7px] tracking-widest text-white">EXHIBIT · 看展</span>
        <span className="text-[10px] tracking-tight text-white/90">{stars(data.rating)}</span>
      </div>
      <div className="flex">
        <div className="flex-1 min-w-0 px-2.5 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold leading-tight truncate">{data.nameZh || '未命名展品'}</span>
            {data.dynastyLabel && (
              <span className="font-pixel text-[8px] text-white px-1 py-0.5 shrink-0" style={{ background: TEAL }}>
                {data.dynastyLabel}{eraText(data.eraStart) ? ` ${eraText(data.eraStart)}` : ''}
              </span>
            )}
          </div>
          {data.nameEn && <div className="font-pixel text-[7px] text-black/40 truncate mt-0.5">{data.nameEn}</div>}
          <div className="flex flex-wrap gap-1 mt-1">
            {data.category && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">器类·{data.category}</span>}
            {(data.material || []).slice(0, 2).map((m, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{m}</span>)}
            {data.culture && data.culture !== '华夏' && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{data.culture}</span>}
            {firstAlias && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#FFFDF5]">别名·{firstAlias}</span>}
            {confidence && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{confidence}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <MapPin className="w-2.5 h-2.5" strokeWidth={2.5} style={{ color: TEAL }} />
            <span className="font-pixel text-[7px] text-black/50 tracking-wider truncate">钉于 {data.museum || data.place || '—'}</span>
          </div>
          {data.curatorNote && <div className="text-[10px] text-black/60 leading-snug mt-1 truncate">✦ {data.curatorNote}</div>}
          {data.curatorNoteEn && <div className="text-[9px] text-black/45 leading-snug mt-0.5 truncate">EN · {data.curatorNoteEn}</div>}
          {timelineNote && <div className="font-pixel text-[6px] text-black/40 leading-snug mt-0.5 truncate">时间线·{timelineNote}</div>}
          {qwenSummary && <div className="font-pixel text-[6px] text-[#5A8F7B] leading-snug mt-0.5 truncate">QWEN链路 · {qwenSummary}</div>}
        </div>
        {/* 媒体徽章塔（撕票虚线）：照片/3D 逐层点亮 */}
        <div className="w-12 shrink-0 border-l-2 border-dashed border-black/40 flex flex-col items-center justify-center gap-1.5 py-2">
          <span className="font-pixel text-[6px]" style={{ color: hasPhoto ? TEAL : inactiveMediaColor }}>● 照片</span>
          <span className="font-pixel text-[6px]" style={{ color: threeDBadge.color }}>{threeDBadge.label}</span>
        </div>
      </div>
    </button>
  );
}
