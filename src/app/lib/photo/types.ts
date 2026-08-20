// 端侧整理照片 agent · 共享类型（解耦：lib/photo 自成一体，不动 FROST 内核）
// 架构见 Photo Agent/00-架构总纲.md。核心：verdict ⟂ pinnable 两条正交输出；类型优先。

// 照片类型（类型先行，决定走哪套价值标准 + 能否钉地球）
export type PhotoType =
  | 'place'        // 实拍·有地点价值（风景/街景/地标）—— 可钉
  | 'life'         // 实拍·人与生活（人物/美食/宠物/活动/日常）—— 可钉
  | 'place_nogps'  // 实拍·无坐标（待补地点）—— 暂不钉
  | 'screenshot'   // 资料·屏内生成（截图/网图/表情包/海报）—— 不钉
  | 'document'     // 资料·拍摄文字（文档/票据/证件/菜单/二维码/手写）—— 不钉
  | 'junk'         // 废片（模糊/欠曝/纯色误拍/重复次优）—— 不钉
  | 'uncertain';   // 不确定（低置信，待人确认）—— 不钉

export type Verdict = 'keep' | 'review' | 'clean';        // 留 / 待定 / 可清理（建议）
export type PinSource = 'exif' | 'user' | 'borrowed';

// 感知层产出的「便宜信号小结论」（原图/canvas 不进这里，跑完即释放）
export interface PhotoFeatures {
  dHash: string;                 // 主键（内容指纹，归一化缩图上算，稳定幂等）
  pHash?: string;                // DCT 感知哈希：仅作相似候选证据，不替代稳定主键
  w: number; h: number;          // 原始尺寸
  capDate: Date | null;          // EXIF 拍摄日期（回退 lastModified）
  hasCameraFields: boolean;      // EXIF 有 Make/Model/曝光 等相机字段 → 强实拍先验
  hasGPS: boolean;
  lat?: number; lng?: number;
  softwareIsScreenshot: boolean; // EXIF Software 含截图工具名
  suspectExif: boolean;          // EXIF 可疑（GPS 在海里/时间在出生前/Make 是截图工具）
  sharpness: number;             // 0-1
  exposure: number;
  colorful: number;
  contrast: number;
  mean: number;                  // 平均亮度
  aspectScreenHit: boolean;      // 宽高比命中常见手机屏幕分辨率表
  isUtilityProb: number;         // 资料概率（像素 + EXIF 多信号投票，0-1）
}

// 推理层产出的单张三件套结果（verdict ⟂ pinnable）
export interface PhotoResult {
  id: string;                    // = dHash 内容指纹（store 去重/记忆主键；同图两份会相同）
  uid: string;                   // 实例唯一 id（= dHash:index）：React key 与单卡纠错用，避免同 dHash 撞 key/串改
  url: string;                   // objectURL（仅本地，绝不上传）
  name: string;
  sourceSize?: number;           // 原文件大小，用于把迁移台账和筛选结果精确对上
  sourceLastModified?: number;
  perceptualHash?: string;       // pHash：与 dHash/时空约束联合使用，不单独触发清理
  date: Date | null;
  w: number; h: number;
  photoType: PhotoType;
  /** @deprecated 兼容旧整理页；新 Photos UI 只展示 technicalQuality。 */
  valueScore: number;
  technicalQuality: number;      // 0-100，仅表示清晰/曝光/色彩/对比等技术可用性
  sharpness?: number;            // 0-1，保留可解释的便宜信号，不保留像素/Canvas
  exposure?: number;             // 0-1，曝光可用性
  colorful?: number;             // 0-1，色彩丰富度
  contrast?: number;             // 0-1，对比度
  meanLuma?: number;             // 0-255，用于区分过曝与欠曝原因
  personalAffinity?: number;     // 0-100，本地偏好模型；样本不足时必须为空
  confidence: number;            // 0-1，本次类型/建议判断置信度
  similarRepresentative?: boolean; // 是否为相似/连拍组的技术代表
  verdict: Verdict;              // 留/待定/可清理 建议
  pinnable: boolean;             // 能否钉地球（实拍 ∧ 真坐标 ∧ 价值达阈 ∧ 簇代表）
  needPlace: boolean;            // 实拍但无坐标 → 待确认地点
  hasGPS: boolean;
  lat?: number; lng?: number;
  pinSource?: PinSource;
  tags: string[];
  dupOf?: string;                // 重复指向保留张
  clusterId?: string;            // 时空簇
  reason: string;                // 审计理由链（为什么这么判）
  reasons: string[];             // 新 UI 的可解释理由；与 reason 保持同源
  userOverride?: 'keep' | 'clean' | 'place' | 'utility';   // 应用了历史用户纠错
  // 内部用，序列化前删
  features?: PhotoFeatures;
}

export interface ScreenOpts {
  fromYM?: number;               // 起始 年*12+月（含）
  toYM?: number;                 // 结束 年*12+月（含）
  maxAnalyze?: number;           // 分析缩图最长边，默认 256
  useModel?: boolean;            // 端侧 CLIP 精筛（仅不确定/钉候选）
  modelTopN?: number;
  /** 系统媒体库已经给出的可信元数据；缩略图通常不再含 EXIF，需在分析前补回。 */
  assetHints?: Record<string, {
    capDate?: Date;
    latitude?: number;
    longitude?: number;
  }>;
}

export type Phase =
  | '读取拍摄日期' | '端侧逐张分析' | '查重聚类' | '加载端侧模型…' | '端侧模型精筛' | '汇总';

export const ym = (d: Date) => d.getFullYear() * 12 + d.getMonth();
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
