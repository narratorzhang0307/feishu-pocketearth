// 重返现场（AR 照片）· 共享类型
// 领域定位：地球是远场索引，AR 是近场重访——把照片钉回它被拍下的现实空间。
// 骨架刻意轻（查看/放置形态，非六层 curator）：布局引擎 + 能力分流 + 锚点存取 + 落球。

export type ArMode = 'webxr' | 'pseudo' | 'preview';
export type ArLayoutKind = 'single' | 'cloud';

/** 进 AR 的一张照片素材（dataURL 全端侧，原图零上云） */
export interface ArPhotoSource {
  id: string;            // dHash 或来源 mark id（幂等主键）
  image: string;         // ≤640px JPEG dataURL —— AR 贴图用
  thumb: string;         // ≤160px JPEG dataURL —— 地球钉 / 列表用
  lat?: number;
  lng?: number;          // EXIF GPS（可无）
  city?: string;
  name?: string;
}

/** 放置时刻的本地位姿（会话级参考系，跨会话仅作参考不承诺厘米级重现） */
export interface ArPose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

/** 一次"放进现实"的记录（IndexedDB pe-ar-anchors） */
export interface ArAnchor {
  id: string;                    // 'ar-' + ts36 + rand36
  createdAt: string;             // ISO
  label: string;
  layout: ArLayoutKind;
  mode: ArMode;                  // 放置当时走的模式（webxr/伪AR/预览）
  photos: { id: string; thumb: string; image: string }[];
  geo: { lat: number; lng: number } | null;   // 放置的"大概位置"（EXIF 或放置时定位）
  city: string;
  pose: ArPose | null;
  pinnedMarkId?: string;         // 已钉回地球时的 userMark id（uarp- 前缀）
}

/** 布局引擎产出：一张照片在锚点局部坐标系里的位姿（米制，y 向上） */
export interface ArLayoutItem {
  position: [number, number, number];
  rotationY: number;   // 绕 y 轴朝向（弧度）
  tilt: number;        // 轻微俯仰（弧度）
  scale: number;
}
