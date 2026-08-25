import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { qwenImage } from '../lib/skills/qwenImage';
import { getSplatObjectUrl } from '../lib/exhibition/splatStore';
import { hasRenderableSplat } from '../lib/exhibition/splatState';
import { isMeshFormat } from './Viewer3D';
import { removeTripMarks, type TripView } from '../lib/travel';
import { removeUserMark } from '../data/userMarks';
import { relatedForDetail, type RelatedItem, type RelatedTag } from '../lib/marks/related';

// 地球标记点击后的详情弹层：按类型渲染（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市）。
// 详情数据由 MyMapTab 点击时从查找表(mapMarkers / userMarks)取出后传入。

export interface MarkerDetailData {
  kind: 'photo' | 'movie' | 'book' | 'mapping' | 'travel' | 'music' | 'council' | 'exhibition' | 'museum' | 'custom';
  markId?: string;          // 用户落点 id（travel 足迹 / 看展展品等可撤销内容用）
  // 通用
  title?: string;
  // photo
  full?: string; thumb?: string; city?: string; artist?: string;
  // movie
  original?: string; director?: string; country?: string; year?: number | null; rating?: number | null; date?: string; synopsis?: string; type?: string;
  cast?: string[]; genre?: string; movement?: string; geoKind?: string;   // 电影 agent 补全的多维标签 + 落点精度
  // book
  author?: string; place?: string; note?: string; translator?: string;
  // mapping（书籍 / 资料内容落地球证据）
  mappingTitle?: string; era?: string; page?: number; quote?: string; status?: string; relation?: string; sourceRef?: string; sourceUrls?: string[]; packName?: string;
  // travel
  tag?: string; tripId?: string; trip?: TripView;
  // council（议事裁决）
  verdict?: string; confidence?: number; ruleEstablished?: string;
  // custom（用户自建 agent 的落点 · 通用渲染）
  agentName?: string; emoji?: string; domain?: string; color?: string; tags?: Record<string, string>;
  // exhibition（看展搭子 · 展品）
  museum?: string; dynasty?: string; eraStart?: number | null; material?: string[]; category?: string; culture?: string; findspot?: string; dimensions?: string; aliases?: string[]; qwenConfidence?: number; qwenContributions?: string[]; qwenContributionSummary?: string; labelZh?: string; curatorNote?: string; timelineNote?: string; curatorNoteEn?: string; culturalBridgeNote?: string; splatUrl?: string; splatStatus?: string; splatId?: string; splatFormat?: string; splatCaptureQualityWarn?: string;
  photos?: string[];        // 展品照（≤6 张缩略 dataURL）：与 3D 并列的双媒体位，谁存在谁显示
  exhibitionName?: string;  // 特展名（如「中国古代通史陈列」）
  // museum（地球博物馆 · 场馆点位信息卡）
  venueType?: 'museum' | 'gallery'; blurb?: string; url?: string; customVenue?: boolean;
  visitedCount?: number; lastVisit?: string; visitedItems?: { id: string; name: string; visitDate: string }[];
  // 星球照片署名（Unsplash 合规）
  authorName?: string; authorLink?: string; photoLink?: string;
  // 相关记忆（记忆会相遇）：点击处的坐标/时间/自身 id——缺省时该节自动少一路信号或整节不出现
  lat?: number; lng?: number; createdAt?: string; selfId?: string;
}

const UTM = 'utm_source=pocket_earth&utm_medium=referral';

const withUtm = (u?: string) => (u ? u + (u.includes('?') ? '&' : '?') + UTM : '');

const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.opacity = '0'; };
const stars = (r?: number | null) => {
  const n = Math.max(0, Math.min(5, r || 0));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};
const qwenConfidenceText = (n?: number) => (typeof n === 'number' ? `Qwen·${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : '');
const timelineText = (s?: string) => (s || '').replace(/^时间线位置[：:]\s*/, '').trim();
const exhibition3DBadge = (status?: string, url?: string, id?: string) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'failed') return { label: '◆ 3D失败', color: '#B4533A', ready: false };
  if (['capturing', 'uploading', 'reconstructing'].includes(normalizedStatus)) return { label: '◆ KIRI中', color: '#C8A24B', ready: false };
  if (hasRenderableSplat({ splatStatus: status, splatUrl: url, splatId: id })) return { label: '◆ 3D 可看', color: '#C8A24B', ready: true };
  return null;
};

// 当前详情卡的结构化标签（与各 pin.ts 写入 meta 的字段一一对应）——喂给相关记忆打分
function detailTags(d: MarkerDetailData): RelatedTag[] {
  const out: RelatedTag[] = [];
  const push = (k: string, v?: string) => { if (v && v.trim()) out.push({ k, v: v.trim() }); };
  push('导演', d.director); push('作者', d.author); push('类型', d.genre); push('流派', d.movement);
  push('国别', d.country); push('文明', d.culture); push('器类', d.category); push('朝代', d.dynasty); push('标签', d.tag);
  for (const m of d.material || []) push('材质', m);
  return out;
}

export default function MarkerDetail({ data, onClose, onRemove, onView3D, onSelectRelated }: { data: MarkerDetailData; onClose: () => void; onRemove?: (id: string) => void; onView3D?: (url: string, format: string) => void; onSelectRelated?: (r: RelatedItem) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);   // ESC 关闭：地图标记详情是全 app 最高频模态，键盘用户也能退出
  // 相关记忆：零模型纯逻辑（地理/时间/标签/文字四路信号），零命中整节不渲染
  const related = useMemo(() => relatedForDetail({
    selfId: data.selfId || data.markId,
    kind: data.kind,
    lat: data.lat, lng: data.lng, createdAt: data.createdAt,
    tags: detailTags(data),
    text: [data.title || data.city || '', (data.note || data.synopsis || data.labelZh || '').slice(0, 120)].join(' '),
  }), [data]);
  // 展品明信片（Qwen Image）：suggest-then-confirm，点了才消耗额度；失败静默。
  const [postcard, setPostcard] = useState('');
  const [genning, setGenning] = useState(false);
  const genPostcard = async () => {
    if (genning) return;
    setGenning(true);
    const mat = (data.material || []).join('');
    const prompt = `${data.title || '文物'}，${data.dynasty || ''}时期，${mat}${data.category || '文物'}，博物馆藏品主题明信片，精致水彩插画，暖色调，柔和光线，无文字，原创风格`;
    const url = await qwenImage(prompt);
    if (!url) { setGenning(false); return; }
    setPostcard(url); setGenning(false);
  };
  // 查看 3D：本地导入的从 IndexedDB 读 blob→objectURL；preset/远程直接用 splatUrl
  const openView3D = async () => {
    if (!onView3D) return;
    const fmt = data.splatFormat || (data.splatUrl ? (data.splatUrl.split('.').pop() || '') : '');   // 导入的用存的 format；preset 从 url 扩展名推
    if (data.splatId) { const u = await getSplatObjectUrl(data.splatId); if (u) { onView3D(u, fmt); return; } }
    if (data.splatUrl) onView3D(data.splatUrl, fmt);
  };
  const exhibitionTimelineNote = data.kind === 'exhibition' ? timelineText(data.timelineNote) : '';
  const exhibitionQwenSummary = data.kind === 'exhibition' ? (data.qwenContributionSummary || '').trim() : '';
  const exhibition3D = data.kind === 'exhibition' ? exhibition3DBadge(data.splatStatus, data.splatUrl, data.splatId) : null;
  const canOpenExhibition3D = !!(exhibition3D?.ready && (data.splatUrl || data.splatId) && onView3D);
  const exhibitionCaptureWarn = data.kind === 'exhibition' ? (data.splatCaptureQualityWarn || '').trim() : '';
  // 展品照点击放大（再点收起）：与 3D 按钮并列的双媒体位
  const [bigPhoto, setBigPhoto] = useState('');
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="w-[300px] max-w-full bg-white border-[3px] border-black shadow-[6px_6px_0_#000] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="关闭" className="absolute -top-3 -right-3 w-7 h-7 bg-black border-2 border-[#7CFF6B] flex items-center justify-center z-10">
          <X className="w-3.5 h-3.5 text-[#7CFF6B]" strokeWidth={3} />
        </button>

        {/* 照片灯箱 */}
        {data.kind === 'photo' && (
          <div className="p-2">
            <div className="w-full aspect-square bg-[#d8d8d6] border border-black overflow-hidden">
              <img src={data.full || data.thumb} onError={onImgErr} alt={data.city} className="w-full h-full object-cover" />
            </div>
            <div className="py-2 text-center">
              <div className="font-pixel text-[9px] tracking-widest">{data.city || '照片'}</div>
              {data.authorName ? (
                <div className="text-[10px] text-black/45 mt-0.5">
                  Photo by <a href={withUtm(data.authorLink)} target="_blank" rel="noopener noreferrer" className="underline">{data.authorName}</a> on <a href={withUtm(data.photoLink)} target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a>
                </div>
              ) : (
                <div className="text-[10px] text-black/45 mt-0.5">● 已钉地球 · LOC_SYNC</div>
              )}
            </div>
          </div>
        )}

        {/* 电影票根 */}
        {data.kind === 'movie' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: '#ffb000' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">ADMIT ONE · 观影票根</span>
              {data.rating != null && <span className="text-[11px] text-black/80">{stars(data.rating)}</span>}
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.title}</div>
              {data.original && data.original !== data.title && <div className="font-pixel text-[8px] text-black/40 mt-1">{data.original}</div>}
              <div className="text-[11px] text-black/60 mt-1.5">{[data.director, data.country, data.year].filter(Boolean).join(' · ')}</div>
              {/* 电影 agent 补全的多维标签 */}
              {(data.genre || data.movement || (data.cast && data.cast.length)) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {data.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{data.genre}</span>}
                  {data.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#fff0d6]">流派·{data.movement}</span>}
                  {(data.cast || []).slice(0, 3).map((c, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{c}</span>)}
                </div>
              )}
              {data.synopsis && <div className="text-[11px] text-black/70 leading-relaxed mt-2 max-h-[160px] overflow-y-auto">{data.synopsis}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#ffb000' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  钉于 {data.geoKind === 'filming' ? '取景地' : data.geoKind === 'story' ? '故事地' : ''}{data.place || data.country || '—'}{data.date ? ` · 观看 ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 藏书票 */}
        {data.kind === 'book' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b-2" style={{ borderColor: '#b388ff' }}>
              <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#7a4dd6' }}>EX LIBRIS · 藏书票</span>
              {data.rating != null && <span className="text-[11px] tracking-tight" style={{ color: '#7a4dd6' }}>{stars(data.rating)}</span>}
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.title}</div>
                {data.year && <span className="font-pixel text-[8px] text-black/35">{data.year}</span>}
              </div>
              <div className="text-[11px] text-black/60 mt-1">{[data.author, data.country].filter(Boolean).join(' · ')}</div>
              {/* 读书 agent 补全的多维标签 */}
              {(data.genre || data.movement || data.translator) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {data.genre && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">类型·{data.genre}</span>}
                  {data.movement && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#f3ecff]">流派·{data.movement}</span>}
                  {data.translator && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EFE9FA]">译·{data.translator}</span>}
                </div>
              )}
              {data.synopsis && <div className="text-[11px] text-black/75 leading-relaxed mt-2 max-h-[160px] overflow-y-auto">{data.synopsis}</div>}
              {!data.synopsis && data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-2 italic">「{data.note}」</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#b388ff' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  钉于 {data.geoKind === 'story' ? '故事地' : data.geoKind === 'author' ? '作者地' : ''}{data.place || '故事之地'}{data.date ? ` · 读于 ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 内容 Mapping：原文证据优先，明确区分现代坐标候选与历史确址。 */}
        {data.kind === 'mapping' && (
          <div>
            <div className="flex items-center justify-between border-b-2 px-2.5 py-1.5" style={{ borderColor: '#8f63d4', background: '#f3ecff' }}>
              <span className="font-pixel text-[7px] tracking-widest" style={{ color: '#6d42bd' }}>EVIDENCE MAP · 内容落地球</span>
              <span className="font-pixel text-[6px] text-black/45">P.{data.page || '—'}</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight">{data.title}</div>
              <div className="mt-1 text-[10px] text-black/55">《{data.mappingTitle || '未题资料'}》{data.author ? ` · ${data.author}` : ''}{data.era ? ` · ${data.era}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="border border-black/30 bg-[#f3ecff] px-1.5 py-0.5 text-[7px]">{data.relation || 'mentioned'}</span>
                <span className="border border-black/30 bg-white px-1.5 py-0.5 text-[7px]">{data.status === 'extant' ? '尚存' : data.status === 'rebuilt' ? '重建' : '待考/记忆地'}</span>
                {typeof data.confidence === 'number' && <span className="border border-black/30 bg-white px-1.5 py-0.5 text-[7px]">坐标置信 {Math.round(data.confidence * 100)}%</span>}
              </div>
              <blockquote className="mt-2 border-l-[3px] pl-2 text-[11px] leading-relaxed text-black/75" style={{ borderColor: '#8f63d4' }}>「{data.quote}」</blockquote>
              {data.note && <p className="mt-2 text-[9px] leading-relaxed text-black/50">{data.note}</p>}
              <div className="mt-2 border-t border-black/15 pt-2 text-[8px] text-black/45">来源：{data.sourceRef || `第 ${data.page || '—'} 页`} · 数据包：{data.packName || '私人内容地图'}</div>
              {!!data.sourceUrls?.length && <div className="mt-1 flex flex-wrap gap-1">{data.sourceUrls.slice(0, 3).map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="border border-black px-1.5 py-0.5 text-[7px] underline">外部核验 {index + 1}</a>)}</div>}
            </div>
          </div>
        )}

        {/* 行程整程卡：同一趟旅程的多个停留点聚合（截图提炼 / 规划完成的整趟） */}
        {data.kind === 'travel' && data.trip && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#ff3b6b' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">JOURNEY · 整趟行程</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.trip.title}</div>
              <div className="text-[11px] text-black/55 mt-1">
                {data.trip.dateStart ? `${data.trip.dateStart}${data.trip.dateEnd && data.trip.dateEnd !== data.trip.dateStart ? `~${data.trip.dateEnd}` : ''} · ` : ''}
                途经 {data.trip.cities.join('、')}
              </div>
              <div className="mt-2 space-y-1 max-h-[180px] overflow-y-auto">
                {data.trip.stops.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-4 h-4 shrink-0 border border-black flex items-center justify-center font-pixel text-[7px]" style={{ background: '#ff3b6b' }}>{i + 1}</span>
                    <span className="font-bold truncate">{s.label}</span>
                    {s.city && s.city !== s.label && <span className="text-black/45 text-[10px] truncate">· {s.city}</span>}
                    {s.date && <span className="text-black/35 text-[9px] ml-auto shrink-0">{s.date}</span>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#ff3b6b' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.trip.stops.length} 个停留 · 已连成轨迹</span>
                </div>
                <button onClick={() => { removeTripMarks(data.trip!.tripId, removeUserMark); onClose(); }}
                  className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除整趟</button>
              </div>
            </div>
          </div>
        )}

        {/* 行程足迹（单点：手动录入一笔 / 旧数据无 tripId） */}
        {data.kind === 'travel' && !data.trip && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#ff3b6b' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">FOOTPRINT · 私人足迹</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.title}</div>
                {data.tag && <span className="font-pixel text-[7px] border border-black/40 px-1 text-black/60">{data.tag}</span>}
              </div>
              <div className="text-[11px] text-black/55 mt-1">{data.city}</div>
              {data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-2">{data.note}</div>}
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#ff3b6b' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.date ? `走过 · ${data.date}` : '已钉地球'}</span>
                </div>
                {data.markId && onRemove && (
                  <button onClick={() => { onRemove(data.markId!); onClose(); }}
                    className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除足迹</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 音乐城市 */}
        {data.kind === 'music' && (
          <div>
            <div className="px-2.5 py-1.5 bg-black"><span className="font-pixel text-[7px] tracking-widest text-[#00ff88]">CITY · 音乐城市</span></div>
            <div className="px-3 py-2.5">
              <div className="text-[16px] font-bold leading-tight">{data.title || data.city}</div>
              {data.artist && <div className="mt-1 text-[11px] text-black/65">{data.artist}</div>}
              {data.genre && <span className="mt-1.5 inline-block border border-black/30 bg-[#eafff3] px-1.5 py-0.5 font-pixel text-[6px]">流派·{data.genre}</span>}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="h-2 w-2 bg-[#00ff88]" />
                <span className="font-pixel text-[7px] tracking-wider text-black/50">钉于 {data.city || data.place || '音乐城市'}</span>
              </div>
            </div>
          </div>
        )}

        {/* 议事裁决（法庭/圆桌的庭审纪要） */}
        {data.kind === 'council' && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: '#caa64a' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">VERDICT · 庭审纪要</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[14px] font-bold leading-tight break-words min-w-0">⚖️ {data.title}</div>
              {data.verdict && <div className="text-[12px] text-black/75 leading-relaxed mt-2">{data.verdict}</div>}
              {data.ruleEstablished && <div className="text-[11px] text-black/60 italic mt-2 border-l-2 pl-2" style={{ borderColor: '#caa64a' }}>裁判要旨：{data.ruleEstablished}</div>}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: '#caa64a' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  {data.place ? `就此地开庭 · ${data.place}` : '议事裁决'}{typeof data.confidence === 'number' ? ` · 置信 ${Math.round(data.confidence * 100)}%` : ''}{data.date ? ` · ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 自建 agent 落点（通用：一个分支覆盖所有用户自造的 agent，地球不认识具体哪个） */}
        {data.kind === 'custom' && (
          <div>
            <div className="px-2.5 py-1.5" style={{ background: data.color || '#ff8a3d' }}>
              <span className="font-pixel text-[7px] tracking-widest text-black">{(data.agentName || '自建 AGENT').toUpperCase()}</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.emoji || '📍'} {data.title}</div>
              {data.note && <div className="text-[12px] text-black/75 leading-relaxed mt-1.5">{data.note}</div>}
              {data.tags && Object.keys(data.tags).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(data.tags).map(([k, v]) => (
                    <span key={k} className="text-[9px] border border-black px-1.5 py-0.5 bg-[#f6f6f6]">{k}：{v}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-2 h-2" style={{ background: data.color || '#ff8a3d' }} />
                <span className="font-pixel text-[7px] text-black/50 tracking-wider">
                  {data.domain ? `${data.domain}` : '自建'}{data.place ? ` · ${data.place}` : ''}{data.date ? ` · ${data.date}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 场馆信息卡（地球博物馆图层）：内建全球种子 + 用户自定义场馆共用一张卡，
            type 只是徽章（博物馆/美术馆不拆家）；观展沉淀（我看过 N 件）实时聚合 */}
        {data.kind === 'museum' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: '#2F6FED' }}>
              <span className="font-pixel text-[7px] tracking-widest text-white">MUSEUM · 地球博物馆</span>
              <span className="font-pixel text-[7px] text-white border border-white/60 px-1 py-0.5">{data.venueType === 'gallery' ? '美术馆' : '博物馆'}{data.customVenue ? ' · 自建' : ''}</span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.title}</div>
              {(data.city || data.country) && <div className="text-[10px] text-black/45 mt-0.5">{[data.city, data.country].filter(Boolean).join(' · ')}</div>}
              {data.blurb && <div className="text-[12px] text-black/75 leading-relaxed mt-1.5">{data.blurb}</div>}
              {(data.visitedCount || 0) > 0 ? (
                <div className="border border-black/20 bg-[#eef2fd] px-2 py-1.5 mt-2">
                  <div className="font-pixel text-[7px] text-black/60 tracking-wider">我在此馆钉了 {data.visitedCount} 件{data.lastVisit ? ` · 最近 ${data.lastVisit}` : ''}</div>
                  <div className="mt-1 space-y-0.5 max-h-[96px] overflow-y-auto">
                    {(data.visitedItems || []).slice(0, 8).map((it) => (
                      <div key={it.id} className="text-[11px] text-black/75 truncate">· {it.name}{it.visitDate ? <span className="text-black/40">　{it.visitDate}</span> : null}</div>
                    ))}
                    {(data.visitedCount || 0) > 8 && <div className="text-[10px] text-black/40">…还有 {(data.visitedCount || 0) - 8} 件</div>}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-black/45 mt-2">还没在这馆钉过展品——去看展搭子记一笔吧</div>
              )}
              <div className="flex gap-1.5 mt-2.5">
                <a href="?agent=exhibition" className="flex-1 text-center font-pixel text-[8px] border-2 border-black py-1.5 active:translate-y-px" style={{ background: '#2F6FED', color: '#fff' }}>✚ 看展搭子记一笔</a>
                {data.url && <a href={data.url} target="_blank" rel="noreferrer" className="text-center font-pixel text-[8px] border-2 border-black px-2 py-1.5 bg-white active:translate-y-px">官网↗</a>}
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#2F6FED' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">{data.customVenue ? '我添加的场馆' : '内建场馆种子'}</span>
                </div>
                {data.customVenue && data.markId && onRemove && (
                  <button onClick={() => { onRemove(data.markId!); onClose(); }}
                    className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 展品卡（看展搭子）：照片 + 展签 + 3D 徽章，钉回展馆坐标 */}
        {data.kind === 'exhibition' && (
          <div>
            <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: '#5A8F7B' }}>
              <span className="font-pixel text-[7px] tracking-widest text-white">EXHIBIT · 看展</span>
              {data.rating != null && <span className="text-[11px] text-white/90">{stars(data.rating)}</span>}
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <div className="text-[15px] font-bold leading-tight break-words min-w-0">{data.title}</div>
                {data.dynasty && <span className="font-pixel text-[8px] text-white px-1 py-0.5 shrink-0" style={{ background: '#5A8F7B' }}>{data.dynasty}</span>}
              </div>
              {data.original && <div className="font-pixel text-[8px] text-black/40 mt-1">{data.original}</div>}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {data.category && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">器类·{data.category}</span>}
                {(data.material || []).map((m, i) => <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">{m}</span>)}
                {data.culture && data.culture !== '华夏' && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{data.culture}</span>}
                {data.aliases?.find(Boolean) && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#FFFDF5]">别名·{data.aliases?.find(Boolean)}</span>}
                {qwenConfidenceText(data.qwenConfidence) && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1]">{qwenConfidenceText(data.qwenConfidence)}</span>}
                {data.findspot && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#EAEAEA]">出土·{data.findspot}</span>}
                {data.exhibitionName && <span className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#fdf3e0]">展·{data.exhibitionName}</span>}
              </div>
              {data.dimensions && <div className="text-[11px] text-black/60 mt-1.5">{data.dimensions}</div>}
              {exhibitionQwenSummary && (
                <div className="font-pixel text-[6px] text-[#5A8F7B] leading-relaxed mt-1.5">
                  阿里云百炼 Qwen · 云端 · {exhibitionQwenSummary}
                </div>
              )}
              {(data.curatorNote || exhibitionTimelineNote || data.curatorNoteEn || data.culturalBridgeNote) && (
                <div className="border border-black/20 bg-[#eef4f1] px-2 py-1.5 mt-2 space-y-1">
                  {data.curatorNote && <div className="text-[11px] text-black/75 leading-relaxed">✦ {data.curatorNote}</div>}
                  {exhibitionTimelineNote && <div className="font-pixel text-[6px] text-black/45 leading-relaxed">时间线·{exhibitionTimelineNote}</div>}
                  {data.curatorNoteEn && <div className="text-[10px] text-black/55 leading-relaxed">EN · {data.curatorNoteEn}</div>}
                  {data.culturalBridgeNote && <div className="text-[10px] text-[#2F6FED] leading-relaxed">文化桥 · {data.culturalBridgeNote}</div>}
                </div>
              )}
              {data.labelZh && <div className="text-[11px] text-black/70 leading-relaxed mt-2 max-h-[120px] overflow-y-auto italic">「{data.labelZh}」</div>}
              {/* 双媒体位：展品照（有则显示，点击放大）+ 3D（有则显示）——各自独立，谁缺谁不占位 */}
              {bigPhoto && <img src={bigPhoto} onError={onImgErr} onClick={() => setBigPhoto('')} alt="展品照" className="w-full border-2 border-black mt-2 cursor-zoom-out" />}
              {(data.photos?.length || 0) > 0 && (
                <div className="flex gap-1 mt-2 overflow-x-auto">
                  {data.photos!.map((p, i) => (
                    <img key={i} src={p} onError={onImgErr} onClick={() => setBigPhoto(bigPhoto === p ? '' : p)} alt=""
                      className={`w-12 h-12 object-cover border-2 shrink-0 cursor-zoom-in ${bigPhoto === p ? 'border-[#5A8F7B]' : 'border-black'}`} />
                  ))}
                </div>
              )}
              {exhibition3D && (
                canOpenExhibition3D
                  ? <button onClick={openView3D} className="mt-2 font-pixel text-[7px] border-2 border-black px-2 py-1 active:translate-y-px" style={{ background: '#C8A24B', color: '#000' }}>◆ 查看 3D · {isMeshFormat(data.splatFormat) ? '模型' : (data.splatId ? '导入' : '高斯泼溅')}</button>
                  : <div className="mt-2 font-pixel text-[7px]" style={{ color: exhibition3D.color }}>{exhibition3D.label}</div>
              )}
              {exhibitionCaptureWarn && (
                <div className="mt-1.5 border border-[#B4533A]/35 bg-[#FFF7ED] px-2 py-1">
                  <div className="font-pixel text-[6px] text-[#B4533A] tracking-wider">采集提醒</div>
                  <div className="text-[10px] text-black/70 leading-relaxed mt-0.5">{exhibitionCaptureWarn}</div>
                </div>
              )}
              {/* 生成专属明信片（Qwen Image）：传播用，点了才消耗额度 */}
              <div className="mt-2">
                {postcard
                  ? <img src={postcard} onError={() => { setPostcard(''); setGenning(false); }} alt="展品明信片" className="w-full border-2 border-black" />
                  : <button onClick={genPostcard} disabled={genning}
                      className="w-full font-pixel text-[8px] border-2 border-black py-1.5 active:translate-y-px disabled:opacity-60 flex items-center justify-center gap-1" style={{ background: '#C8A24B', color: '#000' }}>
                      {genning ? '✦ Qwen Image 出图中…' : '✦ 生成专属明信片'}
                    </button>}
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2" style={{ background: '#5A8F7B' }} />
                  <span className="font-pixel text-[7px] text-black/50 tracking-wider">钉于 {data.museum || data.place || '展馆'}{data.date ? ` · ${data.date}` : ''}</span>
                </div>
                {data.markId && onRemove && (
                  <button onClick={() => { onRemove(data.markId!); onClose(); }}
                    className="font-pixel text-[7px] border border-black px-1.5 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">移除</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 相关记忆（记忆会相遇）：地理/时间/标签/文字四路信号的纯逻辑关联，不显示相似度数字、
            只给人话理由；「看过/读过」与「你记的」措辞区分，防虚假记忆；零命中整节不渲染 */}
        {related.length > 0 && (
          <div className="border-t-2 border-black bg-[#FBFBF6] px-3 py-2">
            <div className="font-pixel text-[7px] tracking-widest text-black/55 mb-1.5">✳ 相关记忆 · MEMORIES MEET</div>
            <div className="space-y-1 max-h-[128px] overflow-y-auto">
              {related.map((r) => {
                const jumpable = !!onSelectRelated && r.kind !== 'mood';
                return (
                  <div key={r.kind + '|' + r.id}
                    onClick={() => { if (jumpable) onSelectRelated!(r); }}
                    className={`flex items-center gap-1.5 min-w-0 ${jumpable ? 'cursor-pointer active:translate-y-px' : ''}`}>
                    <span className="w-2 h-2 shrink-0 border border-black/50" style={{ background: r.color }} />
                    <span className="text-[11px] font-bold truncate">{r.label}</span>
                    {r.origin === 'seen' && <span className="font-pixel text-[6px] shrink-0 border border-black/25 px-1 py-0.5 text-black/45 bg-white">看过/读过</span>}
                    <span className="ml-auto flex gap-1 shrink-0">
                      {r.reasons.slice(0, 2).map((why, i) => (
                        <span key={i} className="font-pixel text-[6px] border border-black/30 px-1 py-0.5 bg-[#eef4f1] text-black/60">{why}</span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
