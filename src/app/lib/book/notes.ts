// 协作·子 agent：读书笔记结构化。不管用户丢进来什么（散记 / 摘抄 / 感想 / 书页截图），
// 都整理成结构化读书笔记（主题 / 金句摘抄 / 感想 / 人物 / 关联 / 小结）。
// 云脑 JSON 为主，舱壁兜底：云脑不可用也至少把原文留住、按行粗分。端侧持久化（localStorage 发布订阅）。
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { enrichJSON } from '../skills/enrichEntity';
import { redactText } from '../skills/visionRead';

export interface StructuredNote {
  id: string;
  bookTitle: string;        // 关联书名（提取，可空）
  bookKey?: string;         // 关联藏书票主键（从某本书发起整理时带上）
  themes: string[];         // 主题
  quotes: string[];         // 金句 / 原文摘抄
  insights: string[];       // 读者感想 / 评论
  characters: string[];     // 人物
  links: string[];          // 关联（其他书 / 概念 / 作者）
  summary: string;          // 一段小结
  raw: string;              // 原始输入（忠实保留）
  source: 'text' | 'image';
  createdAt: string;
}

export type NotePhase = '读取输入' | '笔记认字' | '结构化整理' | '完成';
export type OnNotePhase = (p: NotePhase) => void;

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const arr = (x: unknown) => Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, 12) : (typeof x === 'string' && x ? x.split(/[\n;；]/).map((s) => s.trim()).filter(Boolean).slice(0, 12) : []);

let _seq = 0;
// 跨会话唯一：时间戳 + 自增 + 随机尾（刷新后 _seq 归零，仅靠 Date.now 同毫秒并发存笔记会撞 id → React key 重复/误删）
function noteId(): string { _seq += 1; return 'note-' + Date.now() + '-' + _seq + '-' + Math.random().toString(36).slice(2, 7); }

// 书页/手写截图 → 文本（端侧 OCR，原图不出端）
async function ocrNote(imageDataUrl: string): Promise<string> {
  try { return redactText((await edgeSafe.vision(imageDataUrl, '提取这张图里的所有文字（书页或手写笔记），原样输出文本，不要解释。')) || '').trim(); }   // 过脱敏收口：OCR 原文可能含身份证/手机号/卡号，redact 后才能上云(enrichJSON)+持久化，补回 visionRead「唯一收口」不变式
  catch { return ''; }
}

// 云脑不可用时的本地兜底：把原文按行粗分（含引号/「」的当摘抄，其余当感想），至少不丢东西
function localFallback(raw: string): { quotes: string[]; insights: string[] } {
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const quotes: string[] = [], insights: string[] = [];
  for (const l of lines) {
    // 只把带中文引号/书名号的行当摘抄。半角撇号(don't/it's)、破折号/项目符号起头的速记是读者感想，
    // 不能误判成「原文摘抄」（否则把用户自己的话伪装成原文）。云脑路径才精细区分，这里宁可多归感想。
    if (/[「」『』“”《》]/.test(l)) quotes.push(l);
    else insights.push(l);
  }
  return { quotes: quotes.slice(0, 12), insights: insights.slice(0, 12) };
}

export interface NoteInput { kind: 'text' | 'image'; text?: string; imageDataUrl?: string; bookTitle?: string; bookKey?: string }

export async function structureNotes(input: NoteInput, onPhase?: OnNotePhase): Promise<StructuredNote | null> {
  const ph: OnNotePhase = onPhase || (() => {});
  ph(input.kind === 'image' ? '笔记认字' : '读取输入');
  let raw = (input.text || '').trim();
  let source: 'text' | 'image' = 'text';
  if (input.kind === 'image' && input.imageDataUrl) { source = 'image'; raw = await ocrNote(input.imageDataUrl); }
  if (!raw) return null;

  ph('结构化整理');
  let obj: Record<string, unknown> | null = null;
  const system = '你是读书笔记整理助手。把用户给的任意零散文字整理成结构化读书笔记，只输出一个 JSON 对象，不要解释或代码块标记。'
    + '字段：bookTitle(关联书名,不确定空字符串)、themes(主题,字符串数组)、quotes(原文金句/摘抄,字符串数组,务必用原文)、'
    + 'insights(读者自己的感想/评论,字符串数组)、characters(出现的人物,字符串数组)、links(关联的其他书/概念/作者,字符串数组)、'
    + 'summary(一段小结,不超过60字)。要求：忠实原文、不要编造原文没有的内容；区分「摘抄」(原文)与「感想」(读者观点)。';
  const prompt = (input.bookTitle ? `这是关于《${input.bookTitle}》的笔记。\n` : '') + '原始笔记：\n' + raw.slice(0, 4000) + '\n请输出 JSON。';
  // 云脑要结构化 JSON 走 enrichEntity skill（超时 + withRetry 瞬时退避重试 + 稳健解析）；失败 → null，下面走 localFallback 舱壁不丢原文。
  obj = await enrichJSON<Record<string, unknown>>({ prompt, system });

  const fb = obj ? null : localFallback(raw);
  const note: StructuredNote = {
    id: noteId(),
    bookTitle: input.bookTitle || str(obj?.bookTitle),
    bookKey: input.bookKey,
    themes: arr(obj?.themes),
    quotes: obj ? arr(obj.quotes) : fb!.quotes,
    insights: obj ? arr(obj.insights) : fb!.insights,
    characters: arr(obj?.characters),
    links: arr(obj?.links),
    summary: str(obj?.summary) || raw.replace(/\s+/g, ' ').slice(0, 60),
    raw, source, createdAt: new Date().toISOString(),
  };
  ph('完成');
  return note;
}

// ── 端侧笔记库（localStorage 发布订阅）──
const KEY = 'pe.bookNotes.v1';
const subs = new Set<() => void>();
let notes: StructuredNote[] = load();
// 规整：旧版/坏 schema（缺数组字段）若裸渲染会 `n.quotes.length` 抛错，无 ErrorBoundary 会整页白屏 → 入口补齐
function normalizeNote(n: Record<string, unknown>): StructuredNote {
  const aa = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
  const ss = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    id: ss(n.id) || noteId(), bookTitle: ss(n.bookTitle), bookKey: typeof n.bookKey === 'string' ? n.bookKey : undefined,
    themes: aa(n.themes), quotes: aa(n.quotes), insights: aa(n.insights), characters: aa(n.characters), links: aa(n.links),
    summary: ss(n.summary), raw: ss(n.raw), source: n.source === 'image' ? 'image' : 'text', createdAt: ss(n.createdAt),
  };
}
function load(): StructuredNote[] {
  try { if (typeof localStorage !== 'undefined') { const r = localStorage.getItem(KEY); if (r) { const p = JSON.parse(r); return Array.isArray(p) ? p.map((x) => normalizeNote(x || {})) : []; } } } catch { /* */ }
  return [];
}
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(notes.slice(0, 200))); } catch { /* */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getNotes(): StructuredNote[] { return notes; }
export function getNotesForBook(title: string): StructuredNote[] {
  const t = (title || '').replace(/\s/g, '');
  return notes.filter((n) => (n.bookTitle || '').replace(/\s/g, '') === t && !!t);
}
export function addNote(n: StructuredNote): void { notes = [n, ...notes]; persist(); emit(); }
export function removeNote(id: string): void { notes = notes.filter((n) => n.id !== id); persist(); emit(); }
export function subscribeNotes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
