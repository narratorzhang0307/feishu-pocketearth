// 读书整理 agent · 共享类型（解耦：lib/book 自成一体，镜像 lib/movie）。
// 架构见 读书 Agent/00-架构总纲.md。核心：BookTags（内容标签）⟂ GeoTarget（钉点）两条正交输出。

export type BookInputKind = 'text' | 'image' | 'manual';
export interface BookInput {
  kind: BookInputKind;
  text?: string;
  imageDataUrl?: string;
  manual?: { title: string; author?: string; place?: string; rating?: number };
}

export interface BookTags {
  author: string;
  translator: string;            // 译者（无/原文则空）
  genre: string;                 // 类型（小说/非虚构/诗歌/历史…）
  movement: string;              // 流派/文学运动（魔幻现实主义/意识流/垮掉的一代…，无则空）
  plot: string;                  // 一句话剧情/主题
  userRating: number;            // 我的评分 0-5
}

export type GeoKind = 'story' | 'author' | 'country';   // 故事地 > 作者地 > 国家
export interface GeoTarget {
  kind: GeoKind;
  place: string;
  lng: number; lat: number;
  confidence: number;
}

export type BookSource = 'catalog' | 'llm' | 'manual' | 'mixed';

export interface BookDraft {
  id: string;
  title: string;
  year: number | null;
  country: string;               // 作者国籍
  tags: BookTags;
  geo: GeoTarget | null;
  needPlace: boolean;
  source: BookSource;
  confidence: number;
  needsConfirm: boolean;
  reason: string;
  date: string;                  // 读完日期 YYYY-MM-DD
}

export type BookPhase =
  | '解析输入' | '书封认书' | '查本地书库' | '云脑补全标签' | '定位故事地/作者地' | '校验' | '完成';
export type OnBookPhase = (phase: BookPhase, detail?: string) => void;

export const STAR = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)));
export function bookKey(title: string, author?: string): string {
  const norm = (s: string) => (s || '').replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '').toLowerCase();
  return 'bk:' + norm(title) + (author ? '@' + norm(author) : '');
}
