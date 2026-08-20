// 电影整理 agent · 共享类型（解耦：lib/movie 自成一体，不动 FROST 内核）
// 架构见 电影 Agent/00-架构总纲.md。核心：MovieTags（内容标签）⟂ GeoTarget（钉点）两条正交输出。

// 三种输入：一句话 / 截图 / 手填
export type MovieInputKind = 'text' | 'image' | 'manual';
export interface MovieInput {
  kind: MovieInputKind;
  text?: string;                 // 'text'：用户原话（含片名，可能含评分）
  imageDataUrl?: string;         // 'image'：截图 dataURL（原图不出端，仅端侧 vision）
  manual?: { title: string; country?: string; year?: number | null; rating?: number };
}

// 内容多维标签（补全子 agent 产出；userRating 来自用户）
export interface MovieTags {
  director: string;
  cast: string[];                // 主演
  genre: string;                 // 类型（剧情/科幻/爱情…）
  movement: string;              // 流派/运动（新浪潮/作者电影/黑色电影…，无则空）
  plot: string;                  // 一句话剧情
  userRating: number;            // 我的评分（0-5 星）
}

// 钉点目标（地理子 agent 产出）：取景地 > 故事地 > 国家兜底
export type GeoKind = 'filming' | 'story' | 'country';
export interface GeoTarget {
  kind: GeoKind;
  place: string;                 // 落点地名（取景城市 / 故事城市 / 国家代表城市）
  lng: number; lat: number;
  confidence: number;            // 0-1
}

export type MovieSource = 'catalog' | 'llm' | 'manual' | 'mixed';

// 解析+补全后的一张「电影票根草稿」（suggest，未钉；用户确认才落地）
export interface MovieDraft {
  id: string;                    // 归一片名派生的稳定主键
  title: string;
  original: string;              // 原名（无则空）
  year: number | null;
  country: string;
  douban: number | null;         // 豆瓣公开评分 0-10（本地库有则带）
  tags: MovieTags;
  geo: GeoTarget | null;         // null = 没解析出坐标（needPlace）
  needPlace: boolean;            // 实片但无坐标，待用户手选国家
  source: MovieSource;           // 这张草稿主要来自哪（审计）
  confidence: number;            // 0-1 综合置信
  needsConfirm: boolean;         // 低置信/纯手填 → 强制用户确认
  reason: string;                // 审计理由链
  date: string;                  // 观看日期 YYYY-MM-DD（默认今天）
}

export type MoviePhase =
  | '解析输入' | '截图认片' | '查本地片库' | '云脑补全标签' | '定位取景地/故事地' | '校验' | '完成';

// 阶段进度回调
export type OnMoviePhase = (phase: MoviePhase, detail?: string) => void;

export const STAR = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));
// 归一化片名为稳定主键：去《》空格标点、转小写，拼年份（同名不同年区分）
export function movieKey(title: string, year?: number | null): string {
  const t = (title || '').replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '').toLowerCase();
  return 'mv:' + t + (year ? '@' + year : '');
}
