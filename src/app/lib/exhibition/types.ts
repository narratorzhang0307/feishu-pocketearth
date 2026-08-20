// 看展整理 Skill · 共享类型（解耦：lib/exhibition 自成一体，不动 FROST 内核）。
// 核心：ArtifactTags（展品内容字段）⟂ GeoTarget（钉点=展馆坐标）两条正交输出。
// 展品 = 新的空间对象，钉回展馆经纬度（=「我在哪看的展」），与 movie「取景地」同构。
// 展签/3D 是展品的子资产（原图/视频只进端侧或云端管线，绝不进持久结构）。

// 三种输入：一句话 / 拍展签或展品照 / 手填
export type ExhibitionInputKind = 'text' | 'image' | 'manual';
export interface ExhibitionInput {
  kind: ExhibitionInputKind;
  text?: string;                 // 'text'：用户原话（含展品名，可能含评分）
  imageDataUrl?: string;         // 'image'：展签/展品照 dataURL（原图不出端，仅端侧 vision）
  allowCloud?: boolean;          // 'image' 端侧读不出时，是否允许上云 Qwen 视觉识别（用户显式确认后为 true）
  manual?: { nameZh: string; museum?: string; dynasty?: string; rating?: number };
}

// 展签（中英并存）；imageDataUrl 端侧读完即弃，绝不进这个持久结构（对齐 visionRead 铁律）
export interface Label {
  lang: 'zh' | 'en' | string;
  rawText: string;               // OCR 原文（脱敏后）
  ocrEngine: 'edge-vision' | 'qwen-vision' | 'manual' | 'gmi-vision'; // gmi-vision 仅用于读取旧本地记录
}

// 3D 高斯泼溅资产（增强层 L4，非唯一入口；阶段 A 预留字段，先支持 preset 展示）
export interface Splat3D {
  status: 'not_requested' | 'capturing' | 'needs_more_photos' | 'ready_to_build' | 'queued' | 'uploading' | 'processing' | 'reconstructing' | 'quality_review' | 'ready' | 'failed';
  sourceKind: 'video' | 'multi-image' | 'multi-image-2_5d' | 'preset' | 'local';   // local=用户手动导入的 .ply/.splat
  splatUrl?: string;             // 远程/preset 直链（本地导入时为临时 objectURL，会话内有效）
  splatId?: string;              // 本地导入的 IndexedDB key（持久；刷新后从 IDB 重建 objectURL）
  format?: string;               // ply/splat/ksplat/glb
  engine: 'qwen-colmap-gsplat' | 'gmi-colmap-gsplat' | 'museum-vision-local' | 'rgb-2_5d-baseline' | 'museum-matting-2_5d' | 'local' | 'preset'; // gmi-* 仅为旧记录兼容
  captureQualityWarn?: string;   // '隔玻璃/单面/过暗' 兜底提示
  taskId?: string;               // 云端重建任务 id（轮询用）
  captureId?: string;            // 端侧 IndexedDB 原图任务；用户确认上传前不出端
  assetSha256?: string;          // 云端成品哈希；ready 时必须存在
}

// 2.5D 是稳定默认层；full3d 只能是并行增强，失败或未就绪时不得覆盖 quick2_5d。
export interface ExhibitRepresentations {
  quick2_5d: Splat3D;
  full3d?: Splat3D;
}

// 展品内容多维字段（补全子 agent 产出；myRating 来自用户）
export interface ArtifactTags {
  nameEn: string;                // 英文名
  aliases?: string[];            // Qwen 识别/补全出的别名，用于审计与展示
  dynastyKey: string;            // 受控枚举键（查 dynastyEra 表得年份；不存自由文本，防排序碎片化）
  dynastyLabel: string;          // 显示名 '唐'
  material: string[];            // 材质（青铜/陶/银…）
  category: string;              // 器类受控词表项（横向对比强关联键）
  culture: string;              // 文明泳道键（华夏/古埃及/两河…）
  findspot: string;              // 出土地（二级信息，非主钉点）
  dimensions: string;            // 尺寸描述（通高 33.5 厘米）
  myRating: number;              // 我的评分（0-5 星）
  qwenConfidence?: number;       // Qwen 结构化补全置信度（0-1），仅作展示/审计
  curatorNote?: string;          // Qwen/本地导览词：一句话解释为什么值得看
  timelineNote?: string;         // Qwen/本地时间线位置：这件展品在个人文明时间线中的位置
}

// 钉点目标（地理子 agent 产出）：展馆 > 出土地 > 城市兜底
export type GeoKind = 'venue' | 'findspot' | 'city';
export interface GeoTarget {
  kind: GeoKind;
  place: string;                 // 落点地名（展馆 / 出土地 / 城市）
  lng: number; lat: number;
  confidence: number;            // 0-1
}

export type ExhibitionSource = 'label-ocr' | 'llm' | 'manual' | 'mixed';

// 解析+补全后的一张「展品卡草稿」（suggest，未钉；用户确认才落地）
export interface ArtifactDraft {
  id: string;                    // 归一展品名派生的稳定主键
  nameZh: string;
  museum: string;                // 展馆名（钉点来源）
  exhibition: string;            // 展览名（可空）
  eraStart: number | null;       // 公元数值，负=BCE（查 dynastyEra 表得，不让云脑吐）
  eraEnd: number | null;
  tags: ArtifactTags;
  labels: Label[];
  splat: Splat3D | null;         // 旧版单资产兼容入口；有 representations 时地图仍优先 quick2_5d
  representations?: ExhibitRepresentations;
  photos: string[];              // 照片 dataUrl（按 shotAt 时间线排序）
  geo: GeoTarget | null;         // null = 没解析出坐标（needPlace）
  needPlace: boolean;            // 有展品无坐标，待用户手选展馆/城市
  source: ExhibitionSource;      // 这张草稿主要来自哪（审计）
  confidence: number;            // 0-1 综合置信
  needsConfirm: boolean;         // 低置信/纯手填/无坐标 → 强制用户确认
  reason: string;                // 审计理由链
  visitDate: string;             // 看展日期 YYYY-MM-DD（默认今天）
}

export type ExhibitionPhase =
  | '解析输入' | '展签认字' | '查朝代表' | '云脑补全展品' | '定位展馆' | '校验' | '完成';

// 阶段进度回调
export type OnExhibitionPhase = (phase: ExhibitionPhase, detail?: string) => void;

export const STAR = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));

// 归一化展品名为稳定主键：去《》空格标点、转小写，拼展馆（同名不同馆区分）
export function artifactKey(nameZh: string, museum?: string): string {
  const t = (nameZh || '').replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '').toLowerCase();
  return 'art:' + t + (museum ? '@' + museum.replace(/\s/g, '') : '');
}
