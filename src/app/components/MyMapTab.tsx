import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import EarthMap from './EarthMap';
import AmapEarth from './AmapEarth';
import { MAP_PROVIDER } from '../lib/mapProvider';
import { type MarkerBounds, type MarkerKind, KIND_COLOR, markerInBounds, toGeoJSON, MAP_MARKERS, photoById, movieById, bookById, mappingById, museumById, ensureHeavyMarkers } from '../data/mapMarkers';
import { venueVisitStats } from '../lib/exhibition/venues';
import { getUserMarks, getUserMarksByKind, subscribeUserMarks, removeUserMark } from '../data/userMarks';
import { buildTripLines, getTrip } from '../lib/travel';
import { getPlanets, getVisiblePlanets, subscribePlanets, togglePlanet, removePlanet } from '../data/planets';
import { trackDownload } from '../data/themePlanet';
import { getMoodStickers, addMoodSticker, removeMoodSticker, updateMoodStickerPos, commitStickers, subscribeMood, resolveMoodPlace, pickStickerColor, pickRot } from '../data/geoStickers';
import { applyOverride, setOverride, commitOverrides, subscribeOverrides } from '../data/markerOverrides';
import { consumePendingMapFocus, subscribeMapFocus, type MapFocusReq } from '../data/mapFocus';
import { FileText, Plus, X, Play, Pause } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import MapLegend, { type PackLayerStatus } from './MapLegend';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';
import Viewer3D from './Viewer3D';
import { SONG_MARKERS, SONG_MARKER_BY_KEY } from '../data/songMarkers';
import { getDataPackState, isDataPackMapLayerEnabled, subscribeDataPacks, subscribeDataPackMapLayers } from '../lib/dataPack';
import YouTubePlaybackFrame from './music/YouTubePlaybackFrame';
import { canPlayMusicSource, directAudioUrl, musicSourceLabel, youtubeVideoId } from '../lib/music/playback';

// 星球图层数据：把所有「可见星球」的照片摊平成 circle 要素（每点带星球色）
function planetsToGeoJSON() {
  const features = [];
  for (const pl of getVisiblePlanets()) {
    for (const ph of pl.photos) {
      const [lng, lat] = applyOverride(ph.id, ph.lng, ph.lat); // 拖动校正后的落点
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: { id: ph.id, planetId: pl.id, color: pl.color },
      });
    }
  }
  return { type: 'FeatureCollection' as const, features };
}
function planetPhotoById(id: string) {
  for (const pl of getPlanets()) { const ph = pl.photos.find((x) => x.id === id); if (ph) return ph; }
  return null;
}

function viewportMarkerBounds(map: mapboxgl.Map): MarkerBounds {
  const bounds = map.getBounds();
  if (!bounds) return { west: -180, south: -90, east: 180, north: 90 };
  let west = bounds.getWest();
  let east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const lngSpan = east - west;
  const latPad = Math.max(0.2, (north - south) * 0.15);
  if (lngSpan >= 300) return { west: -180, south: Math.max(-90, south - latPad), east: 180, north: Math.min(90, north + latPad) };
  const lngPad = Math.max(0.2, lngSpan * 0.15);
  west -= lngPad;
  east += lngPad;
  if (east - west >= 360) return { west: -180, south: Math.max(-90, south - latPad), east: 180, north: Math.min(90, north + latPad) };
  const normalize = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
  return {
    west: normalize(west),
    south: Math.max(-90, south - latPad),
    east: normalize(east),
    north: Math.min(90, north + latPad),
  };
}

// 合并：静态标记（音乐/照片/电影/书）+ 用户运行时落点（各 agent 写入），实时给地球图层
function buildMarksData(bounds?: MarkerBounds) {
  const base = toGeoJSON(bounds);
  // 静态标记：应用拖动校正后的落点
  const baseFeats = base.features.map((f) => {
    const c = f.geometry.coordinates as [number, number];
    const [lng, lat] = applyOverride(String(f.properties.id), c[0], c[1]);
    return { ...f, geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] } };
  });
  const extra = getUserMarks().flatMap((m) => {
    const [lng, lat] = applyOverride(m.id, m.lng, m.lat);
    if (bounds && !markerInBounds({ lng, lat }, bounds)) return [];
    // Older localStorage payloads may contain agent-specific kinds from builds
    // before the shared map taxonomy was locked. Render those as `custom`
    // instead of asking Mapbox for an icon that can never exist.
    const kind: MarkerKind = Object.prototype.hasOwnProperty.call(KIND_COLOR, m.kind) ? m.kind : 'custom';
    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: { kind, label: m.label || '', id: m.id },
    }];
  });
  return { type: 'FeatureCollection' as const, features: [...baseFeats, ...extra] };
}

// 照片标记（含 thumb/full，已带散开坐标）—— 放大后做缩略预览用
const PHOTO_MARKERS = MAP_MARKERS.filter((m) => m.kind === 'photo');
const PREVIEW_ZOOM = 10.5; // 只有主动放大到街区级才显示 DOM 照片，避免遮挡地图手势
const SONG_ZOOM = PREVIEW_ZOOM;  // 放大到此缩放以上：城市级音乐点散开成 621 首歌的落点卡片
const SONG_CARD_MAX = 80;        // 视口内同时渲染的歌曲点上限

// 点击标记 → 取详情（用户落点优先，其次静态查找表）
function resolveDetail(id: string, kind: MarkerKind, label: string): MarkerDetailData | null {
  const um = getUserMarks().find((m) => m.id === id);
  if (um) {
    const meta = (um.meta || {}) as Record<string, unknown>;
    if (kind === 'movie') return { kind, title: um.label, original: String(meta.original || ''), director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number, rating: meta.rating as number, date: String(meta.date || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), cast: Array.isArray(meta.cast) ? (meta.cast as string[]) : [], place: String(meta.place || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'book') return { kind, title: um.label, author: String(meta.author || ''), place: String(meta.place || ''), year: meta.year as number, note: String(meta.note || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), translator: String(meta.translator || ''), country: String(meta.country || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'travel') {
      const tripId = String(meta.tripId || '');
      const trip = tripId ? getTrip(tripId) : null;
      return { kind, markId: um.id, title: um.label, city: String(meta.city || ''), tag: String(meta.tag || ''), note: String(meta.note || ''), date: String(meta.date || ''), tripId: tripId || undefined, trip: trip && trip.stops.length > 1 ? trip : undefined };
    }
    if (kind === 'photo') return { kind, full: String(meta.full || ''), thumb: String(meta.thumb || ''), city: String(meta.city || um.label || '') };
    if (kind === 'council') return { kind, title: um.label, verdict: String(meta.verdict || ''), confidence: meta.confidence as number, ruleEstablished: String(meta.ruleEstablished || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    // custom：用户自建 agent 的落点。通用渲染——meta 里带 agent 身份 + 标签，地球不认识具体哪个 agent。
    if (kind === 'custom') return { kind, title: um.label, agentName: String(meta.agentName || ''), emoji: String(meta.emoji || '📍'), domain: String(meta.domain || ''), color: String(meta.color || '#ff8a3d'), tags: (meta.tags && typeof meta.tags === 'object') ? (meta.tags as Record<string, string>) : {}, note: String(meta.note || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    if (kind === 'exhibition') return { kind, markId: um.id, title: um.label, original: String(meta.nameEn || ''), aliases: Array.isArray(meta.aliases) ? (meta.aliases as string[]) : [], qwenConfidence: typeof meta.qwenConfidence === 'number' ? meta.qwenConfidence : (typeof meta.gmiConfidence === 'number' ? meta.gmiConfidence : undefined), qwenContributions: Array.isArray(meta.qwenContributions) ? (meta.qwenContributions as string[]) : (Array.isArray(meta.gmiContributions) ? (meta.gmiContributions as string[]) : []), qwenContributionSummary: String(meta.qwenContributionSummary || meta.gmiContributionSummary || ''), museum: String(meta.museum || ''), exhibitionName: String(meta.exhibition || ''), dynasty: String(meta.dynastyLabel || ''), eraStart: typeof meta.eraStart === 'number' ? meta.eraStart : null, material: Array.isArray(meta.material) ? (meta.material as string[]) : [], category: String(meta.category || ''), culture: String(meta.culture || ''), findspot: String(meta.findspot || ''), dimensions: String(meta.dimensions || ''), labelZh: String(meta.labelZh || ''), curatorNote: String(meta.curatorNote || ''), timelineNote: String(meta.timelineNote || ''), curatorNoteEn: String(meta.curatorNoteEn || ''), culturalBridgeNote: String(meta.culturalBridgeNote || ''), splatUrl: String(meta.splatUrl || ''), splatStatus: String(meta.splatStatus || ''), splatId: String(meta.splatId || ''), splatFormat: String(meta.splatFormat || ''), splatCaptureQualityWarn: String(meta.splatCaptureQualityWarn || ''), photos: Array.isArray(meta.photos) ? (meta.photos as string[]) : [], rating: meta.rating as number, place: String(meta.place || ''), date: String(meta.visitDate || '') };
    // museum：用户自定义场馆（地球博物馆图层）。观展沉淀实时聚合，卡片常看常新。
    if (kind === 'museum') {
      const name = String(meta.name || um.label || '');
      const stats = venueVisitStats(name);
      return { kind, markId: um.id, title: name, city: String(meta.city || ''), country: String(meta.country || ''), venueType: meta.type === 'gallery' ? 'gallery' : 'museum', blurb: String(meta.blurb || ''), customVenue: true, visitedCount: stats.count, lastVisit: stats.lastVisit || undefined, visitedItems: stats.items };
    }
    return { kind: 'music', title: um.label, city: String(meta.city || '') };
  }
  if (kind === 'photo') { const p = photoById.get(id); return p ? { kind, full: p.full, thumb: p.thumb, city: (p.city || '').split(',')[0], authorName: p.author, authorLink: p.authorLink, photoLink: p.photoLink } : null; }
  if (kind === 'movie') { const m = movieById.get(id); return m ? { kind, title: m.title, original: m.original, director: m.director, country: m.country, year: m.year, rating: m.rating, date: m.date, synopsis: m.synopsis } : null; }
  if (kind === 'book') { const b = bookById.get(id); return b ? { kind, title: b.title, author: b.author, country: b.country, place: b.country, year: b.year, synopsis: b.synopsis, date: b.date, rating: b.rating } : null; }
  if (kind === 'mapping') {
    const point = mappingById.get(id); if (!point) return null;
    const { record, location, packName } = point;
    return { kind, title: location.name, mappingTitle: record.title, author: record.author, city: record.city, era: record.era, page: location.page, quote: location.quote, note: location.note, status: location.status, relation: location.relation, confidence: location.confidence, sourceRef: location.sourceRef, sourceUrls: location.sourceUrls, packName };
  }
  if (kind === 'music') return { kind, title: label, city: label };
  if (kind === 'museum') {
    const s = museumById.get(id);
    if (!s) return null;
    const stats = venueVisitStats(s.name);
    return { kind, title: s.name, city: s.city, country: s.country, venueType: s.type, blurb: s.blurb, url: s.url, visitedCount: stats.count, lastVisit: stats.lastVisit || undefined, visitedItems: stats.items };
  }
  return null;
}

function focusKind(domain: MapFocusReq['domain']): MarkerKind {
  if (domain === 'books') return 'book';
  if (domain === 'movies') return 'movie';
  if (domain === 'music') return 'music';
  if (domain === 'photos') return 'photo';
  return 'custom';
}

function fallbackFocusDetail(target: MapFocusReq, kind: MarkerKind): MarkerDetailData {
  const title = target.label || '知识点';
  if (kind === 'book') return { kind, title, place: '' };
  if (kind === 'movie') return { kind, title, country: '' };
  if (kind === 'photo') return { kind, full: '', thumb: '', city: title };
  if (kind === 'music') return { kind, title, city: '' };
  return { kind: 'custom', title, agentName: '', emoji: '📍', domain: '', tags: {}, note: '', place: '' };
}

// 优先使用票据页随跳转带来的详情快照；静态/用户索引只负责补充缺失字段。
// 飞书刚确认的记录可能尚未被 mapMarkers 索引，此处不能再退化成只有标题的空卡。
function detailForFocus(target: MapFocusReq, kind: MarkerKind): MarkerDetailData {
  const resolved = target.recordId
    ? resolveDetail(target.recordId, kind, target.label || '')
    : null;
  const fallback = resolved || fallbackFocusDetail(target, kind);
  return {
    ...fallback,
    ...(target.detail || {}),
    kind,
    title: target.detail?.title || fallback.title || target.label || '知识点',
  };
}

interface MyMapTabProps {
  onViewInAR?: () => void;
  feishuMode?: boolean;
  onOpenSkill?: (target: string) => void;
}

const FeishuEarthPanel = lazy(() => import('../feishu/FeishuEarthPanel'));
let feishuPanelAutoOpened = false;

// 默认从区域尺度进入地图。街道级西湖演示层已移除，地图保持可拖动、可缩放。
const WEST_LAKE_CENTER: [number, number] = [120.140, 30.246];
const INITIAL_ZOOM = 3.2;

// 球面两点中心角（度）：地球缩小时用于隐藏转到背面的点
function centralAngleDeg(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const cosc =
    Math.sin(lat1 * r) * Math.sin(lat2 * r) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return Math.acos(Math.max(-1, Math.min(1, cosc))) / r;
}

export default function MyMapTab(_props: MyMapTabProps) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [focusTarget, setFocusTarget] = useState<MapFocusReq | null>(null);
  const [packLayerVersion, refreshPackLayers] = useReducer((value) => value + 1, 0);
  const musicPackMapped = isDataPackMapLayerEnabled('music');
  useEffect(() => {
    const unsubscribeLayers = subscribeDataPackMapLayers(refreshPackLayers);
    const unsubscribePacks = subscribeDataPacks(refreshPackLayers);
    return () => { unsubscribeLayers(); unsubscribePacks(); };
  }, []);
  // 地图标记图层：哪些类型可见（左下角图例开关切换）
  const [visibleKinds, setVisibleKinds] = useState<Set<MarkerKind>>(() => new Set<MarkerKind>(['music', 'photo', 'movie', 'book', 'mapping', 'travel', 'council', 'exhibition', 'museum', 'custom']));
  // 电影/书标记懒加载完成后翻转，触发统计与图层重算
  const [markersReady, setMarkersReady] = useState(false);
  const packLayerStates: Partial<Record<MarkerKind, PackLayerStatus>> = {
    music: !getDataPackState('music').active ? 'unloaded' : musicPackMapped ? 'mapped' : 'ready',
    movie: !getDataPackState('movies').active ? 'unloaded' : isDataPackMapLayerEnabled('movies') ? 'mapped' : 'ready',
    book: !getDataPackState('books').active ? 'unloaded' : isDataPackMapLayerEnabled('books') ? 'mapped' : 'ready',
    mapping: !getDataPackState('mapping').active ? 'unloaded' : isDataPackMapLayerEnabled('mapping') ? 'mapped' : 'ready',
  };
  // 状态条实时统计：当前可见图层的标记数 + 去重城市数（随左下角图层开关 / 懒加载补点变化）
  const visibleMarkers = useMemo(() => MAP_MARKERS.filter((m) => visibleKinds.has(m.kind)), [visibleKinds, markersReady, packLayerVersion]);
  const cityCount = useMemo(
    () => new Set(visibleMarkers.filter((m) => m.kind === 'music' || m.kind === 'photo').map((m) => (m.label || '').split(',')[0].trim()).filter(Boolean)).size,
    [visibleMarkers],
  );
  const toggleKind = (k: MarkerKind) =>
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  // 纯平移时 zoom 不变，需要强制重渲染来更新投影位置
  const [, tick] = useReducer((x) => x + 1, 0);
  // 心情贴：左上角加号 → 写心情 → 端侧判经纬度 → 钉到地图
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodText, setMoodText] = useState('');
  const [moodBusy, setMoodBusy] = useState(false);
  const [moodStyle, setMoodStyle] = useState<'color' | 'card'>('color'); // 「+」可产出两种便贴：彩色 / 白卡片
  const requestedFeishuPanel = _props.feishuMode === true && (
    new URLSearchParams(location.search).get('feishuPanel') === '1' || new URLSearchParams(location.search).has('taskId')
  );
  const [feishuOpen, setFeishuOpen] = useState(() => requestedFeishuPanel && !feishuPanelAutoOpened);
  useEffect(() => {
    if (requestedFeishuPanel) feishuPanelAutoOpened = true;
  }, [requestedFeishuPanel]);
  // 点击标记后的详情弹层
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);
  const [view3D, setView3D] = useState<{ url: string; format: string } | null>(null);   // 地球点开展品 → 全屏 3D（mesh/高斯泼溅由 Viewer3D 按 format 分发）
  // 歌曲落点卡片三态：折叠点 →(点击)展开卡片(songSel) →(点击播放)就地迷你播放器(songPlaying)
  const [songSel, setSongSel] = useState<string | null>(null);
  const [songDetail, setSongDetail] = useState(false);
  const [songPlaying, setSongPlaying] = useState<string | null>(null);
  const [songPaused, setSongPaused] = useState(false);
  const [songProg, setSongProg] = useState(0);
  const [songSourceError, setSongSourceError] = useState<string | null>(null);
  const songAudioRef = useRef<HTMLAudioElement>(null);
  // 切歌：地图卡片与音乐 Skill 共用同一来源规则，不会用无关示例音频代替失效原曲。
  useEffect(() => {
    const a = songAudioRef.current;
    if (!a) return;
    if (!songPlaying) { a.pause(); a.removeAttribute('src'); a.load(); setSongProg(0); setSongSourceError(null); return; }
    const sm = SONG_MARKER_BY_KEY.get(songPlaying);
    if (!sm) return;
    const directUrl = directAudioUrl(sm.playback);
    setSongSourceError(null);
    a.pause();
    a.removeAttribute('src');
    if (!directUrl) {
      a.load();
      if (!youtubeVideoId(sm.playback)) {
        setSongSourceError('音源不可用');
        setSongPaused(true);
      }
      return;
    }
    a.src = directUrl;
    a.load();
    const fail = () => {
      setSongSourceError('原曲音源暂不可用');
      setSongPaused(true);
    };
    a.play().catch(fail);
    a.addEventListener('error', fail);
    const t = window.setTimeout(() => { if (a.readyState < 2) fail(); }, 7000);
    return () => { window.clearTimeout(t); a.removeEventListener('error', fail); };
  }, [songPlaying]);
  useEffect(() => {   // 暂停/播放切换
    const a = songAudioRef.current;
    if (!a || !songPlaying) return;
    const sm = SONG_MARKER_BY_KEY.get(songPlaying);
    if (youtubeVideoId(sm?.playback)) { a.pause(); return; }
    if (songPaused) a.pause();
    else a.play().catch(() => { setSongSourceError('原曲音源暂不可用'); setSongPaused(true); });
  }, [songPaused, songPlaying]);
  useEffect(() => {   // 关掉「音乐」图层时停播 + 收起
    if (!visibleKinds.has('music') || !musicPackMapped) { setSongPlaying(null); setSongSel(null); }
  }, [visibleKinds, musicPackMapped]);

  // 刷新 mapbox 两个源（拖动落点后让底层方块/圆点跟到新位置；不在拖动每帧调用，避免大量要素重建卡顿）
  const refreshMapSources = () => {
    if (!map) return;
    const ms = map.getSource('marks') as mapboxgl.GeoJSONSource | undefined;
    if (ms) ms.setData(buildMarksData(viewportMarkerBounds(map)) as never);
    const ps = map.getSource('planets') as mapboxgl.GeoJSONSource | undefined;
    if (ps) ps.setData(planetsToGeoJSON() as never);
    const ls = map.getSource('tripLines') as mapboxgl.GeoJSONSource | undefined;
    if (ls) ls.setData(buildTripLines() as never);
  };

  // 通用 DOM 拖动：便贴与照片拍立得共用。记录被拖 id、「光标↔锚点」初始偏移、update/commit 回调。
  // 拖动中只走 update（更新内存 + 重渲染重投影），松手才 commit 落盘并刷新底层源。
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean; update: (id: string, lat: number, lng: number) => void; commit: () => void } | null>(null);
  const suppressClick = useRef(false); // 拖动过则吞掉随后那次 click（避免误开详情/灯箱）
  const beginDrag = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }, update: (id: string, lat: number, lng: number) => void, commit: () => void) => {
    if (!map) return;
    e.stopPropagation();
    suppressClick.current = false;
    const r = map.getContainer().getBoundingClientRect();
    dragRef.current = { id, ox: e.clientX - r.left - anchor.x, oy: e.clientY - r.top - anchor.y, moved: false, update, commit };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !map) return;
    d.moved = true;
    const r = map.getContainer().getBoundingClientRect();
    const ll = map.unproject([e.clientX - r.left - d.ox, e.clientY - r.top - d.oy]);
    d.update(d.id, ll.lat, ll.lng);
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d.moved) { d.commit(); refreshMapSources(); suppressClick.current = true; }
    dragRef.current = null;
  };
  // 便贴拖动入口（update 用经纬度顺序 lat,lng → 心情贴存储）
  const stickerDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, updateMoodStickerPos, commitStickers);
  // 照片拖动入口（update 转成覆盖存储的 lng,lat 顺序）
  const photoDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, (pid, lat, lng) => setOverride(pid, lng, lat), commitOverrides);

  // 清除旧版飞书演示种入的 LOC_SYNC 白卡。这些不是用户数据，不再出现于真实地图。
  useEffect(() => {
    getMoodStickers()
      .filter((sticker) => /^seed-[1-6]$/.test(sticker.id))
      .forEach((sticker) => removeMoodSticker(sticker.id));
  }, []);

  // 地图就绪后，懒加载电影/书标记（含 douban 大 JSON），补进 marks 源 + 刷新统计。
  // 不拖慢首屏地图渲染；详情查找表（movieById/bookById）也在此填好，点开标记即可拿到简介。
  // 竞态安全：若懒加载先于 marks 源建立而 resolve，则等地图 idle 后再刷新。
  useEffect(() => {
    if (!map) return;
    let alive = true;
    ensureHeavyMarkers()
      .then(() => {
        if (!alive) return;
        setMarkersReady(true);
        if (map.getSource('marks')) refreshMapSources();
        else map.once('idle', () => { if (alive) refreshMapSources(); });
      })
      .catch(() => { if (alive) setMarkersReady(true); });   // 懒加载失败也认定「已就绪」：宁可少几百点，也不让统计条带永久省略号
    return () => { alive = false; };
  }, [map]);

  // 记一笔等入口钉完后，自动飞到落点并放大到便签展开可见（zoom≥6.5）。挂载时消费挂起的焦点请求 + 订阅后续实时请求。
  useEffect(() => {
    if (!map) return;
    let alive = true;
    // 轮询等 style 加载完再 flyTo：切回 earth tab 重新挂载的新 map 初始 styleLoaded=false，
    // once('idle') 在重渲染/重建过程中不可靠（实测不触发）；轮询确保 style 就绪后必然飞过去。
    const fly = (c: MapFocusReq) => {
      let tries = 0;
      const tick = () => {
        if (!alive) return;
        if (map.isStyleLoaded()) {
          // 可观测的验收标记：不显示在 UI 中，供自动化验证“哪张票让地图飞到了哪里”。
          const container = map.getContainer();
          container.dataset.focusDomain = c.domain || '';
          container.dataset.focusRecord = c.recordId || '';
          container.dataset.focusLabel = c.label || '';
          container.dataset.focusLng = String(c.lng);
          container.dataset.focusLat = String(c.lat);
          setFocusTarget(c);
          map.stop();
          // 使用票据指定的尺度，允许从街道级正确缩回国家/城市级。
          map.flyTo({ center: [c.lng, c.lat], zoom: c.zoom, duration: 1200, essential: true });
        }
        else if (tries++ < 50) setTimeout(tick, 100);
      };
      tick();
    };
    const pend = consumePendingMapFocus();
    if (pend) fly(pend);
    const unsub = subscribeMapFocus(fly);
    return () => { alive = false; unsub(); };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onMove = () => {
      setZoom(map.getZoom());
      const center = map.getCenter();
      const container = map.getContainer();
      container.dataset.centerLng = center.lng.toFixed(6);
      container.dataset.centerLat = center.lat.toFixed(6);
      container.dataset.zoom = map.getZoom().toFixed(3);
      tick();
    };
    const onMoveEnd = () => {
      const source = map.getSource('marks') as mapboxgl.GeoJSONSource | undefined;
      if (source) source.setData(buildMarksData(viewportMarkerBounds(map)) as never);
    };
    map.on('move', onMove);
    map.on('zoom', onMove);
    map.on('moveend', onMoveEnd);
    onMove();
    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
      map.off('moveend', onMoveEnd);
    };
  }, [map]);

  // mapbox 原生标记图层：贴地 / 背面遮挡 / 重叠碰撞都交给 mapbox（symbol 图层 + 方块图标）
  useEffect(() => {
    if (!map) return;
    const setup = () => {
      if (map.getSource('marks')) return;
      (Object.entries(KIND_COLOR) as [MarkerKind, string][]).forEach(([k, color]) => {
        const id = 'sq-' + k;
        if (map.hasImage(id)) return;
        const px = 2;                            // 2x 画布更清晰
        const total = k === 'movie' ? 11 : 18;   // 恢复原来的尺寸
        const off = k === 'movie' ? 2 : 4;        // 原来每边 movie 3 / 其它 6，粗边框缩小三分之一 → 2 / 4
        const sw = total * px;
        const bw = off * px;
        const cv = document.createElement('canvas');
        cv.width = sw; cv.height = sw;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sw, sw);
        ctx.fillStyle = color; ctx.fillRect(bw, bw, sw - bw * 2, sw - bw * 2);
        map.addImage(id, ctx.getImageData(0, 0, sw, sw), { pixelRatio: px });
      });
      // 行程连线层（在标记层之下）：同 tripId 的落点按 seq 连成虚线轨迹
      map.addSource('tripLines', { type: 'geojson', data: buildTripLines() as never });
      map.addLayer({
        id: 'trip-line-layer',
        type: 'line',
        source: 'tripLines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff3b6b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 8, 2.5, 13, 4],
          'line-opacity': 0.7,
          'line-dasharray': [2, 1.5],
        },
      } as never);
      map.addSource('marks', {
        type: 'geojson',
        data: buildMarksData(viewportMarkerBounds(map)) as never,
      });
      map.addLayer({
        id: 'mark-layer',
        type: 'symbol',
        source: 'marks',
        layout: {
          'icon-image': ['concat', 'sq-', ['get', 'kind']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.28, 4, 0.42, 7, 0.7, 11, 1],
          'icon-allow-overlap': false,
          'text-field': ['case', ['==', ['get', 'kind'], 'music'], ['get', 'label'], ''],
          'text-font': ['Arial Unicode MS Regular'],
          'text-size': 9,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#00ff88', 'text-halo-color': '#000', 'text-halo-width': 1.2 },
      } as never);
      // 星球图层：圆点（区别于基础类的方块），颜色按星球取自要素属性，允许重叠
      if (!map.getSource('planets')) {
        map.addSource('planets', { type: 'geojson', data: planetsToGeoJSON() as never });
        map.addLayer({
          id: 'planet-layer',
          type: 'circle',
          source: 'planets',
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 6, 5, 13, 9],
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#000',
            'circle-opacity': 0.95,
          },
        } as never);
      }
    };
    if (map.isStyleLoaded()) setup();
    else map.once('style.load', setup);
  }, [map]);

  // 图层开关：按可见类型过滤 mapbox 标记图层
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('mark-layer')) return;
      // 放大到街区(≥SONG_ZOOM)时，城市级音乐点交给歌曲落点卡片接管，从 symbol 层排除 music
      const kinds = [...visibleKinds].filter((k) => !(k === 'music' && zoom >= SONG_ZOOM));
      map.setFilter('mark-layer', ['in', ['get', 'kind'], ['literal', kinds]] as never);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [map, visibleKinds, zoom >= SONG_ZOOM]);

  // tab1 ⇄ tab2 联动：各 agent 写入用户落点后，实时刷新地球图层数据
  useEffect(() => {
    if (!map) return;
    const refresh = () => {
      const src = map.getSource('marks') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(buildMarksData(viewportMarkerBounds(map)) as never);
      const ls = map.getSource('tripLines') as mapboxgl.GeoJSONSource | undefined;
      if (ls) ls.setData(buildTripLines() as never);
    };
    return subscribeUserMarks(refresh);
  }, [map]);

  // 星球图层联动：建立 / 开关 / 删除星球后刷新图层 + 重渲染（图例 / 预览）
  useEffect(() => {
    if (!map) return;
    const refresh = () => {
      const src = map.getSource('planets') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(planetsToGeoJSON() as never);
      tick();
    };
    return subscribePlanets(refresh);
  }, [map]);

  // 心情贴变化 → 重渲染（DOM 叠层，钉地理坐标）
  useEffect(() => subscribeMood(() => tick()), []);
  // 位置覆盖变化（拖动校对落点）→ 重渲染：DOM 照片即时重投影；底层方块/圆点在松手时由 refreshMapSources 刷新
  useEffect(() => subscribeOverrides(() => tick()), []);

  // 点击标记 → 弹出详情；悬停变手型；按下拖动 → 校正落点（音乐/书/电影/行程方块 + 星球圆点）
  useEffect(() => {
    if (!map) return;
    // 拖动过则吞掉随后那次 click（避免误开详情）；每次 mousedown 重置，纯点击不受影响
    let suppressMark = false;
    let suppressPlanet = false;
    let dragging = false; // 拖动中：抑制 enter/leave 改光标

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (suppressMark) { suppressMark = false; return; }
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const id = String(f.properties.id);
      const d = resolveDetail(id, f.properties.kind as MarkerKind, String(f.properties.label || ''));
      if (!d) return;
      // 附上坐标/时间/自身 id → 详情卡底部「相关记忆」的地理/时间两路信号（缺了也能跑，只是少一路）
      const g = (f.geometry as GeoJSON.Point | undefined)?.coordinates;
      const um = getUserMarks().find((m) => m.id === id);
      setSelected({ ...d, selfId: id, lng: um?.lng ?? (g ? Number(g[0]) : undefined), lat: um?.lat ?? (g ? Number(g[1]) : undefined), createdAt: um?.createdAt });
    };
    const onPlanetClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (suppressPlanet) { suppressPlanet = false; return; }
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const ph = planetPhotoById(String(f.properties.id));
      if (!ph) return;
      setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link });
      trackDownload(ph.downloadLocation); // 看大图触发 Unsplash 合规埋点
    };
    const enter = () => { if (!dragging) map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { if (!dragging) map.getCanvas().style.cursor = ''; };

    // mapbox 原生特征拖动工厂：按下捕获要素 id → 拖动更新覆盖并 rAF 刷新源 → 松手落盘
    const writeSource = (sourceId: string, buildData: () => unknown) => {
      const s = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (s) s.setData(buildData() as never);
    };
    const makeDrag = (sourceId: string, buildData: () => unknown, onDownReset: () => void, onMovedSet: () => void) => {
      let id: string | null = null;
      let moved = false;
      let raf = 0;
      let ll: mapboxgl.LngLat | null = null;
      const apply = () => {
        raf = 0;
        if (!id || !ll) return;
        setOverride(id, ll.lng, ll.lat);
        writeSource(sourceId, buildData);
      };
      const move = (e: mapboxgl.MapMouseEvent) => {
        if (!id) return;
        moved = true;
        ll = e.lngLat;
        if (!raf) raf = requestAnimationFrame(apply); // rAF 节流，避免每帧重建大量要素
      };
      // 松手挂在 window：拖到 DOM 叠层 / 窗口外松手也能收尾（否则点会「黏」在光标上、监听泄漏）
      const up = () => {
        map.off('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        dragging = false;
        map.getCanvas().style.cursor = '';
        if (id && moved && ll) {          // 冲刷最后一帧，确保松手处落点写入并落盘（修 rAF 丢帧）
          setOverride(id, ll.lng, ll.lat);
          writeSource(sourceId, buildData);
          commitOverrides();
          onMovedSet();
        }
        id = null; ll = null;
      };
      const down = (e: mapboxgl.MapLayerMouseEvent) => {
        const f = e.features && e.features[0];
        if (!f || !f.properties) return;
        e.preventDefault(); // 阻止地图平移，改为拖动这个点
        onDownReset();
        id = String(f.properties.id);
        moved = false;
        ll = null;
        dragging = true;
        map.getCanvas().style.cursor = 'grabbing';
        map.on('mousemove', move);
        window.addEventListener('mouseup', up, { once: true });
      };
      return down;
    };
    const buildVisibleMarks = () => buildMarksData(viewportMarkerBounds(map));
    const onMarkDown = makeDrag('marks', buildVisibleMarks, () => { suppressMark = false; }, () => { suppressMark = true; });
    const onPlanetDown = makeDrag('planets', planetsToGeoJSON, () => { suppressPlanet = false; }, () => { suppressPlanet = true; });

    const bind = () => {
      if (map.getLayer('mark-layer')) {
        map.on('click', 'mark-layer', onClick);
        map.on('mousedown', 'mark-layer', onMarkDown);
        map.on('mouseenter', 'mark-layer', enter);
        map.on('mouseleave', 'mark-layer', leave);
      }
      if (map.getLayer('planet-layer')) {
        map.on('click', 'planet-layer', onPlanetClick);
        map.on('mousedown', 'planet-layer', onPlanetDown);
        map.on('mouseenter', 'planet-layer', enter);
        map.on('mouseleave', 'planet-layer', leave);
      }
    };
    if (map.isStyleLoaded() && map.getLayer('mark-layer')) bind();
    else map.once('idle', bind);
    return () => {
      map.off('click', 'mark-layer', onClick);
      map.off('mousedown', 'mark-layer', onMarkDown);
      map.off('mouseenter', 'mark-layer', enter);
      map.off('mouseleave', 'mark-layer', leave);
      map.off('click', 'planet-layer', onPlanetClick);
      map.off('mousedown', 'planet-layer', onPlanetDown);
      map.off('mouseenter', 'planet-layer', enter);
      map.off('mouseleave', 'planet-layer', leave);
    };
  }, [map]);

  const mapCenter: [number, number] = map
    ? [map.getCenter().lng, map.getCenter().lat]
    : WEST_LAKE_CENTER;

  // 贴心情：端侧从文字判地名 → 经纬度（判不出用当前地图中心）→ 钉下并飞过去
  const submitMood = async () => {
    const t = moodText.trim();
    if (!t || moodBusy) return;
    setMoodBusy(true);
    const center: [number, number] = map ? [map.getCenter().lng, map.getCenter().lat] : WEST_LAKE_CENTER;
    const { place, lng, lat } = await resolveMoodPlace(t, center);
    const id = 'mood-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);   // 加随机尾，免同毫秒撞 id（两条写入路径共用 store）→ React key 重复 / removeMoodSticker 误删两条
    const d = new Date();
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    addMoodSticker({
      id, lat, lng, text: t, place, rot: pickRot(id),
      variant: moodStyle,
      color: moodStyle === 'card' ? '#ffffff' : pickStickerColor(t),
      date: moodStyle === 'card' ? date : undefined,
    });
    setMoodText(''); setMoodOpen(false); setMoodBusy(false);
    if (map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 3.2) });
  };

  return (
    <div className="flex flex-col h-full bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Top Bar Status */}
      <div className="relative flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA]">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>

      {/* Header Area */}
      <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-white px-4 py-4">
        <div className="min-w-0">
          <h1 className="mb-2 font-pixel text-xl uppercase tracking-wider">MY MAP</h1>
          <p className="text-xs font-medium tracking-wide text-black/70">
            城市属于我们<br />
            <span className="mt-1 block font-pixel text-[9px] text-black/70">The city, filling with your poems.</span>
          </p>
        </div>
        {_props.feishuMode && (
          <button
            type="button"
            onClick={() => setFeishuOpen(true)}
            className="flex h-[54px] w-[128px] shrink-0 items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-3 text-black shadow-[3px_3px_0_#000] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#000]"
            title="打开飞书知识协作入口"
            aria-label="打开飞书知识协作入口"
          >
            <FileText className="h-5 w-5" strokeWidth={3} />
            <span className="flex flex-col items-start leading-none">
              <span className="font-pixel text-[11px]">飞书</span>
              <span className="mt-1 text-[8px] font-black tracking-wide">知识协作入口</span>
            </span>
          </button>
        )}
      </div>

      {/* Stat Strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88]">
        <div className="font-pixel text-[9px] flex justify-center items-center gap-3 tracking-widest">
          <span>MARKERS: {visibleMarkers.length}{markersReady ? '' : '…'}</span>
          <span className="opacity-50">·</span>
          <span>CITIES: {cityCount}</span>
        </div>
      </div>

      {/* Map Canvas Hero */}
      <div className="relative flex-1 bg-[#cfd8d1] border-b-2 border-black overflow-hidden touch-none" data-testid="earth-map-hero">
        {/* Earth globe base layer：默认 Mapbox globe；.env 里 VITE_MAP_PROVIDER=amap 时切高德底图。
            高德版是独立实现（自渲染落点），故不接 mapbox 专用的 onReady 叠加层；回退只需删掉该 env。 */}
        {MAP_PROVIDER === 'amap' ? (
          <AmapEarth className="z-0" center={WEST_LAKE_CENTER} zoom={INITIAL_ZOOM} />
        ) : (
          <EarthMap className="z-0" center={WEST_LAKE_CENTER} zoom={INITIAL_ZOOM} onReady={setMap} />
        )}

        {/* 旧版的西湖网格、斜线、LOC_SYNC 卡片和演示照片已移除。 */}

        {/* 票据定位点沿用原版小方块；点击可查看书籍 / 电影 / 音乐 / 照片详情。 */}
        {map && focusTarget && (() => {
          const point = map.project([focusTarget.lng, focusTarget.lat]);
          const kind = focusKind(focusTarget.domain);
          const detail = detailForFocus(focusTarget, kind);
          return (
            <div
              className="absolute z-[17] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${point.x}px`, top: `${point.y}px` }}
              data-testid="map-focus-target"
            >
              <button
                type="button"
                aria-label={`打开${focusTarget.label || '知识点'}详情`}
                onClick={() => setSelected(detail)}
                className="block h-3.5 w-3.5 border-2 border-black active:scale-90"
                style={{ backgroundColor: KIND_COLOR[kind] || '#00ff88' }}
              />
              <div className="pointer-events-none absolute left-1/2 top-5 max-w-[190px] -translate-x-1/2 whitespace-nowrap border border-black bg-white px-1.5 py-0.5 text-[9px] font-black shadow-[1px_1px_0_#000]">
                已定位 · {focusTarget.label || '知识点'}
              </div>
            </div>
          );
        })()}

        {/* 标记点由 mapbox symbol 图层原生渲染；点击弹详情见上方 useEffect */}

        {/* 放大后照片缩略预览（DOM 叠层，仅渲染视口内、可见、有图的照片，点开看大图） */}
        {map && zoom >= PREVIEW_ZOOM && visibleKinds.has('photo') && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          const phash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
          // 拍立得照片贴：白边 + 紫钉（星球用星球色钉）+ 方形/竖版随机 + 黑白，触碰变彩色
          // 拍立得照片贴：可鼠标拖动重新摆放（解耦校对落点）；未拖动则点击看大图
          const polaroid = (key: string, oid: string, lng: number, lat: number, thumb: string, h: number, pin: string, onClick: () => void) => {
            const [olng, olat] = applyOverride(oid, lng, lat); // 拖动校正后的落点
            const pt = map.project([olng, olat]);
            const tall = h % 2 === 0; const rot = (h % 7) - 3;
            return (
              <button key={key}
                aria-label="查看照片大图"
                onPointerDown={(e) => photoDragStart(e, oid, pt)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onClick(); }}
                className="absolute z-[15] bg-white p-1 pb-2.5 border border-black/50 shadow-[2px_3px_6px_rgba(0,0,0,0.4)] active:scale-95 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: '58px', transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-black" style={{ background: pin }} />
                <div className={`w-full ${tall ? 'aspect-[3/4]' : 'aspect-square'} overflow-hidden bg-[#d8d8d6]`}>
                  <img src={thumb} alt="" className="w-full h-full object-cover grayscale hover:grayscale-0 active:grayscale-0 transition-all duration-500" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
              </button>
            );
          };
          for (const m of PHOTO_MARKERS) {
            if (!m.thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('pv-' + m.id, m.id, m.lng, m.lat, m.thumb, phash(m.id), '#ff00ff',
              () => setSelected({ kind: 'photo', full: m.full, thumb: m.thumb, city: (m.label || '').split(',')[0], authorName: m.author, authorLink: m.authorLink, photoLink: m.photoLink })));
            if (out.length >= 70) break;
          }
          // 用户自己钉的照片（照片整理 agent 写入 userMarks）：青钉拍立得，点开看缩略大图
          for (const m of getUserMarksByKind('photo')) {
            const meta = (m.meta || {}) as Record<string, unknown>;
            const thumb = String(meta.thumb || '');
            if (!thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('um-' + m.id, m.id, m.lng, m.lat, thumb, phash(m.id), '#00e5ff',
              () => setSelected({ kind: 'photo', full: String(meta.full || thumb), thumb, city: String(meta.city || m.label || '我的照片') })));
            if (out.length >= 130) break;
          }
          for (const pl of getVisiblePlanets()) {
            for (const ph of pl.photos) {
              const [plng, plat] = applyOverride(ph.id, ph.lng, ph.lat);
              if (!b || !b.contains([plng, plat])) continue;
              out.push(polaroid('pp-' + ph.id, ph.id, ph.lng, ph.lat, ph.thumb, phash(ph.id), pl.color,
                () => { setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link }); trackDownload(ph.downloadLocation); }));
              if (out.length >= 130) break;
            }
            if (out.length >= 130) break;
          }
          return out;
        })()}

        {/* 音乐落点：放大到街区，城市级音乐点散开成 621 首歌的卡片（点击展开介绍 → 再点就地变迷你播放器） */}
        {map && zoom >= SONG_ZOOM && visibleKinds.has('music') && musicPackMapped && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          for (const sm of SONG_MARKERS) {
            if (!b || !b.contains([sm.lng, sm.lat])) continue;
            const pt = map.project([sm.lng, sm.lat]);
            const left = `${pt.x}px`; const top = `${pt.y}px`;
            if (songPlaying === sm.key) {
              out.push(
                <div key={sm.key} className="absolute z-[20] -translate-x-1/2 -translate-y-full" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
                  <div className="w-[212px] bg-black text-[#7CFF6B] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] p-2">
                    {youtubeVideoId(sm.playback) && <YouTubePlaybackFrame playback={sm.playback} playing={!songPaused} title={sm.title} className="mb-2 h-28 w-full border border-[#7CFF6B]/40" />}
                    <div className="flex items-center gap-2">
                      <img src={sm.cover} alt="" className="w-10 h-10 object-cover border border-[#7CFF6B]/40 shrink-0" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate text-white">{sm.title}</div>
                        <div className={`text-[9px] truncate ${songSourceError ? 'text-[#ff8a76]' : 'text-[#7CFF6B]/70'}`}>{songSourceError || `${sm.artist} · ${musicSourceLabel(sm.playback)}`}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setSongPaused((p) => !p); }} className="w-7 h-7 border border-[#7CFF6B]/50 flex items-center justify-center shrink-0 active:scale-95" aria-label={songPaused ? '播放' : '暂停'}>
                        {songPaused ? <Play size={13} fill="currentColor" strokeWidth={0} className="ml-0.5" /> : <Pause size={13} fill="currentColor" strokeWidth={0} />}
                      </button>
                    </div>
                    {!youtubeVideoId(sm.playback) && <div className="mt-2 h-1 bg-[#7CFF6B]/20"><div className="h-full bg-[#7CFF6B]" style={{ width: `${Math.round(songProg * 100)}%` }} /></div>}
                    <button onClick={(e) => { e.stopPropagation(); setSongPlaying(null); }} className="mt-1.5 w-full font-pixel text-[8px] tracking-widest text-[#7CFF6B]/60 hover:text-[#7CFF6B] py-0.5">收起 ▾</button>
                  </div>
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black rotate-45 mx-auto -mt-[7px]" />
                </div>
              );
            } else if (songSel === sm.key) {
              out.push(
                <div key={sm.key} className="absolute z-[19] -translate-x-1/2 -translate-y-full" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
                  <div className="w-[212px] bg-[#FFFCF2] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.85)] p-2">
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <span className="font-pixel text-[7px] tracking-widest text-[#0a8] truncate">◍ {sm.cityNameZh} · {sm.anchorLabel}</span>
                      <button onClick={(e) => { e.stopPropagation(); setSongSel(null); }} className="text-black/40 hover:text-[#d23b3b] shrink-0" aria-label="收起卡片"><X className="w-3 h-3" strokeWidth={3} /></button>
                    </div>
                    <div className="text-[12px] font-bold leading-snug break-words">《{sm.title}》</div>
                    <div className="text-[10px] text-black/55 mb-1">{sm.artist} · {sm.duration}</div>
                    <div className={`text-[10px] text-black/75 leading-snug ${songDetail ? 'max-h-[160px] overflow-y-auto' : 'line-clamp-5'}`}>{songDetail ? sm.detail : sm.summary}</div>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={(e) => { e.stopPropagation(); setSongDetail((v) => !v); }} className="flex-1 border border-black bg-white text-[9px] py-1 active:translate-y-px">{songDetail ? '收起' : '完整介绍'}</button>
                      <button onClick={(e) => { e.stopPropagation(); setSongPlaying(sm.key); setSongPaused(false); setSongDetail(false); }} disabled={!canPlayMusicSource(sm.playback)} className="flex-1 flex items-center justify-center gap-1 border border-black bg-[#00ff88] text-black text-[9px] font-bold py-1 active:translate-y-px disabled:opacity-35"><Play size={11} fill="currentColor" strokeWidth={0} /> {canPlayMusicSource(sm.playback) ? '播放原曲' : '无可用音源'}</button>
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 bg-[#00ff88] border border-black rotate-45 mx-auto -mt-[7px]" />
                </div>
              );
            } else {
              out.push(
                <button key={sm.key} aria-label={`${sm.title} · ${sm.cityNameZh}`} onClick={(e) => { e.stopPropagation(); setSongSel(sm.key); setSongDetail(false); }}
                  className="absolute z-[16] w-2.5 h-2.5 bg-[#00ff88] border border-black shadow-[1px_1px_0_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 hover:scale-150 transition-transform cursor-pointer"
                  style={{ left, top }} />
              );
            }
            if (out.length >= SONG_CARD_MAX) break;
          }
          return out;
        })()}

        {/* 心情贴：缩小时收成小图钉（和标记点一样钉在地球，不浮动），放大才展开成卡片 */}
        {map && getMoodStickers().map((s) => {
          if (zoom < 5 && centralAngleDeg(mapCenter, [s.lng, s.lat]) > 78) return null;
          const pt = map.project([s.lng, s.lat]);
          if (zoom < 6.5) {
            // 小图钉：居中锚定在落点（与方块标记同机制），尺寸随缩放走，地球尺度下和方块点一样小
            const sz = Math.max(6, Math.min(13, Math.round(2 + zoom * 1.7)));
            return (
              <button
                key={s.id}
                title={s.text}
                aria-label={`心情：${s.text}`}
                onClick={() => map.flyTo({ center: [s.lng, s.lat], zoom: 8 })}
                className="absolute z-[18] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black shadow-[1px_1px_0_rgba(0,0,0,0.4)] pointer-events-auto active:scale-90"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${sz}px`, height: `${sz}px`, background: (s.variant === 'card' || !s.color) ? '#ff00ff' : s.color }}
              />
            );
          }
          // 放大后：展开成卡片，鼠标可拖动重新摆放（白卡片 / 彩色两种风格）
          const isCard = s.variant === 'card';
          return (
            <div
              key={s.id}
              className="absolute z-[18] -translate-x-1/2 -translate-y-full group pointer-events-auto cursor-grab active:cursor-grabbing select-none touch-none"
              style={{ left: `${pt.x}px`, top: `${pt.y}px` }}
              onPointerDown={(e) => stickerDragStart(e, s.id, pt)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
            >
              <div
                className={`relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.6)] px-2 py-1.5 max-w-[160px] ${isCard ? 'bg-white' : ''}`}
                style={{ ...(isCard ? {} : { background: s.color }), transform: `rotate(${s.rot}deg)` }}
              >
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
                {isCard ? (
                  <>
                    <div className="font-pixel text-[6px] text-black/60 mb-1 tracking-widest">{s.date} • LOC_SYNC</div>
                    <div className="text-[11px] font-bold leading-none text-black break-words">{s.text}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] leading-snug text-black font-medium break-words">{s.text}</div>
                    <div className="font-pixel text-[6px] text-black/55 tracking-wider mt-1">◍ {s.place} · 心情贴</div>
                  </>
                )}
                <button
                  aria-label="删除这条心情"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeMoodSticker(s.id)}
                  className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-black border border-black text-white flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={3} />
                </button>
              </div>
              <div className="w-px h-2 bg-black/50 mx-auto" />
            </div>
          );
        })}

        {/* 左上角：贴一条心情 */}
        <div className="absolute top-3 left-3 z-20 pointer-events-auto">
          {moodOpen ? (
            <div className="bg-white border-2 border-black shadow-[2px_2px_0_#000] p-2 w-[210px]">
              <div className="font-pixel text-[7px] tracking-widest mb-1.5 text-black/55">此刻的心情 · MOOD</div>
              {/* 风格切换：彩色心情贴 / 白色 LOC_SYNC 卡片 */}
              <div className="flex gap-1.5 mb-1.5">
                <button onClick={() => setMoodStyle('color')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'color' ? 'bg-[#ffe08a] font-bold' : 'bg-white text-black/55'}`}>彩色</button>
                <button onClick={() => setMoodStyle('card')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'card' ? 'bg-black text-white font-bold' : 'bg-white text-black/55'}`}>白卡片</button>
              </div>
              <textarea value={moodText} onChange={(e) => setMoodText(e.target.value)} rows={2} placeholder="留下此刻的心情（可带地名）…" className="w-full border-2 border-black px-2 py-1 text-[11px] bg-[#EAEAEA] focus:outline-none resize-none" />
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => { setMoodOpen(false); setMoodText(''); }} className="flex-1 border-2 border-black bg-white text-[10px] py-1 active:translate-y-px">取消</button>
                <button onClick={submitMood} disabled={moodBusy || !moodText.trim()} className="flex-1 border-2 border-black bg-[#ffe08a] text-[10px] font-bold py-1 active:translate-y-px disabled:opacity-40">{moodBusy ? '识别中…' : '钉下 ◍'}</button>
              </div>
              <div className="font-pixel text-[6px] text-black/40 mt-1 leading-snug">端侧判地名 → 钉地理坐标，缩放不跟跑</div>
            </div>
          ) : (
            <button onClick={() => setMoodOpen(true)} title="贴一条心情" className="w-10 h-10 bg-[#ffe08a] border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center active:translate-y-px">
              <Plus className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* 左下角图例 + 图层开关（基础各类方块 + 用户星球圆点，可开闭）*/}
        <MapLegend
          visibleKinds={visibleKinds}
          onToggle={toggleKind}
          packLayerStates={packLayerStates}
          planets={getPlanets()}
          onTogglePlanet={togglePlanet}
          onRemovePlanet={removePlanet}
        />
      </div>

      {_props.feishuMode && feishuOpen && (
        <Suspense fallback={null}>
          <FeishuEarthPanel
            onClose={() => setFeishuOpen(false)}
            onOpenSkill={(target) => _props.onOpenSkill?.(target)}
            onPinned={(location) => {
              refreshMapSources();
              setVisibleKinds((current) => new Set([...current, 'custom']));
              if (map && location) map.flyTo({ center: [location.longitude, location.latitude], zoom: Math.max(map.getZoom(), 5.5) });
            }}
          />
        </Suspense>
      )}

      {/* 标记详情弹层（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市） */}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} onRemove={(id) => { removeUserMark(id); refreshMapSources(); }} onView3D={(url, format) => setView3D({ url, format })}
          onSelectRelated={(r) => {
            // 相关记忆 → 顺藤摸瓜：打开那条记忆的详情并飞过去（mood 贴不在 resolveDetail 体系里，related 层已禁跳）
            const d = resolveDetail(r.id, r.kind as MarkerKind, r.label);
            if (d) setSelected({ ...d, selfId: r.id, lat: r.lat, lng: r.lng, createdAt: r.createdAt });
            if (map && Number.isFinite(r.lat) && Number.isFinite(r.lng)) map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 3.2) });
          }} />}
      </AnimatePresence>
      {/* 地球点开展品 → 全屏 3D viewer（mesh/高斯泼溅按 format 分发，懒加载）。此前只有看展运行页有，地球主入口漏了、3D 按钮整条断链 */}
      {view3D && (
        <div className="fixed inset-0 z-[140] bg-black flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 shrink-0" style={{ borderColor: '#C8A24B' }}>
            <span className="font-pixel text-[9px]" style={{ color: '#C8A24B' }}>◆ 3D 展品 · 拖动旋转</span>
            <button onClick={() => setView3D(null)} className="w-7 h-7 bg-black border-2 flex items-center justify-center" style={{ borderColor: '#C8A24B' }}>
              <X className="w-4 h-4" style={{ color: '#C8A24B' }} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Viewer3D url={view3D.url} format={view3D.format} onError={() => setView3D(null)} />
          </div>
        </div>
      )}
      {/* 歌曲落点迷你播放器共用的单个音频元素（一次只播一首） */}
      <audio ref={songAudioRef} onTimeUpdate={(e) => { const a = e.currentTarget; setSongProg(a.duration ? a.currentTime / a.duration : 0); }} onEnded={() => { setSongPaused(true); setSongProg(1); }} />
    </div>
  );
}
