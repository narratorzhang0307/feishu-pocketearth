// 看展搭子 · Qwen 导览词 Skill。
// 作用：把「已识别/已 3D 化的展品」变成一句私人导览 + 一句时间线位置。
// 失败时本地兜底，绝不阻断展品草稿、自有 GPU 重建或钉地球。
import { enrichJSON } from '../skills/enrichEntity';
import { formatInstructions, type Shape } from '../skills/structured';
import type { ArtifactDraft } from './types';
import { hasRenderableSplat } from './splatState';

export interface CuratorNotes {
  curatorNote: string;
  timelineNote: string;
  source: 'qwen' | 'local';
}

export interface CuratorContext {
  has3D?: boolean;
  sourceKind?: string;
}

const CURATOR_SHAPE: Shape = {
  curatorNote: { type: 'string', desc: '一句中文私人导览，28到44字，解释这件展品为什么值得看' },
  timelineNote: { type: 'string', desc: '一句中文时间线位置，18到32字，说明文明/时代/材料或地点关系' },
};

const FIELD_LABEL_RE = /^(?:curatorNote|curatorNoteZh|curator_note_zh|timelineNote|timelineNoteZh|timeline_note_zh|guideZh|guide_zh|timelineZh|timeline_zh|curator\s+(?:note|line)|one\s*line\s*guide|short\s*guide|guide\s*(?:note|text|line|sentence|summary)?|audio\s*guide(?:\s*line)?|voice\s*guide(?:\s*line)?|voice\s*over|narration|caption|personal\s+(?:guide|note)|private\s+(?:guide|note)|tour\s+(?:note|guide|line)|timeline\s*(?:position|placement|label|hint|text|line|context|anchor|summary|era)?|chronology\s*(?:position|context)?|historical\s*context|era\s*context|导览词|私人导览词|私人导览|个人导览词|个人导览|语音导览词?|讲解词|导览语|展品导览|时间线(?:位置|锚点)?|时间轴(?:位置)?|年表(?:位置)?)[：:]\s*/i;
const DASH_FIELD_LABEL_RE = /^(?:curator\s+(?:note|line)|guide\s*(?:note|text|line|sentence|summary)?|one\s*line\s*guide|short\s*guide|audio\s*guide(?:\s*line)?|voice\s*guide(?:\s*line)?|personal\s+(?:guide|note)|private\s+(?:guide|note)|tour\s+(?:note|guide|line)|timeline\s*(?:position|placement|label|hint|text|line|context|anchor|summary|era)?|chronology\s*(?:position|context)?|historical\s*context|era\s*context|guide|timeline|导览词|私人导览词|私人导览|个人导览词|个人导览|语音导览词?|讲解词|导览语|展品导览|时间线(?:位置|锚点)?|时间轴(?:位置)?|年表(?:位置)?)\s*[-–—]\s*/i;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const NOTE_VALUE_KEYS = ['text', 'content', 'value', 'label', 'zh', 'zh_CN', 'zh-CN', 'zhHans', 'zh_hans', 'name', 'title', 'summary', 'note', 'line', 'sentence', 'guide', 'timeline', '文本', '内容', '正文', '中文'];

const stripDisplayNoise = (s: string, stripFieldLabel = false) => {
  const text = s
    .replace(/^```(?:json|md|markdown|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\s*(?:[-*•]\s+|\d+[.)、]\s*)/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[#>\s]+/, '')
    .replace(/[*_]+/g, '');
  return stripFieldLabel
    ? text.replace(FIELD_LABEL_RE, '').replace(DASH_FIELD_LABEL_RE, '')
    : text;
};

const noteCandidates = (value: unknown, depth = 0): string[] => {
  if (depth > 4) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => noteCandidates(item, depth + 1));
  if (!isRecord(value)) return [];
  return NOTE_VALUE_KEYS.flatMap((key) => noteCandidates(value[key], depth + 1));
};

const cleanCandidate = (text: string, max: number, stripFieldLabel = false) => {
  const normalized = stripDisplayNoise(text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[「」"']/g, '')
    .replace(/\s+/g, ' ')
    .trim(), stripFieldLabel)
    .trim();
  return normalized.slice(0, max);
};

const clean = (s: unknown, max: number, stripFieldLabel = false) =>
  cleanCandidate(noteCandidates(s)[0] || '', max, stripFieldLabel);

const PLACEHOLDER_NOTE_RE = /^(?:n\/?a|none|null|unknown|not\s+available|not\s+provided|cannot\s+determine|unable\s+to\s+determine|no\s+data|暂无|无|未知|不详|未提供|无法判断|无法确定|信息不足|无可用信息|没有足够信息)[。.!！\s]*$/i;

const cleanMeaningful = (s: unknown, max: number, stripFieldLabel = true) => {
  for (const text of noteCandidates(s)) {
    const note = cleanCandidate(text, max, stripFieldLabel);
    if (note && !PLACEHOLDER_NOTE_RE.test(note)) return note;
  }
  return '';
};

const CHINESE_CURATOR_NOTE_KEYS = ['导览词', '私人导览词', '私人导览', '个人导览词', '个人导览', '语音导览词', '语音导览', '讲解词', '导览语', '展品导览'];
const CHINESE_TIMELINE_NOTE_KEYS = ['时间线位置', '时间线锚点', '时间线', '时间轴位置', '时间轴', '年表位置', '年表'];
const CURATOR_NOTE_KEYS = ['curatorNote', 'curator_note', 'curatorNoteZh', 'curator_note_zh', 'curatorLine', 'curator_line', 'curatorLineZh', 'curator_line_zh', 'guideNote', 'guide_note', 'guideNoteZh', 'guide_note_zh', 'guideText', 'guide_text', 'guideTextZh', 'guide_text_zh', 'guideLine', 'guide_line', 'guideLineZh', 'guide_line_zh', 'guideSentence', 'guide_sentence', 'guideSentenceZh', 'guide_sentence_zh', 'guideSummary', 'guide_summary', 'guideSummaryZh', 'guide_summary_zh', 'oneLineGuide', 'one_line_guide', 'oneLineGuideZh', 'one_line_guide_zh', 'shortGuide', 'short_guide', 'shortGuideZh', 'short_guide_zh', 'guide', 'guideZh', 'guide_zh', 'audioGuide', 'audio_guide', 'audioGuideZh', 'audio_guide_zh', 'audioGuideLine', 'audio_guide_line', 'audioGuideLineZh', 'audio_guide_line_zh', 'voiceGuide', 'voice_guide', 'voiceGuideZh', 'voice_guide_zh', 'voiceGuideLine', 'voice_guide_line', 'voiceGuideLineZh', 'voice_guide_line_zh', 'voiceover', 'voiceOver', 'voice_over', 'voiceoverZh', 'voiceOverZh', 'voice_over_zh', 'narration', 'narrationZh', 'narration_zh', 'caption', 'captionZh', 'caption_zh', 'personalGuide', 'personal_guide', 'personalGuideZh', 'personal_guide_zh', 'personalNote', 'personal_note', 'personalNoteZh', 'personal_note_zh', 'privateGuide', 'private_guide', 'privateGuideZh', 'private_guide_zh', 'privateNote', 'private_note', 'privateNoteZh', 'private_note_zh', 'tourNote', 'tour_note', 'tourNoteZh', 'tour_note_zh', 'tourGuide', 'tour_guide', 'tourGuideZh', 'tour_guide_zh', 'tourGuideLine', 'tour_guide_line', 'tourGuideLineZh', 'tour_guide_line_zh', 'tourLine', 'tour_line', 'tourLineZh', 'tour_line_zh', ...CHINESE_CURATOR_NOTE_KEYS];
const TIMELINE_NOTE_KEYS = ['timelineNote', 'timeline_note', 'timelineNoteZh', 'timeline_note_zh', 'timelinePosition', 'timeline_position', 'timelinePositionZh', 'timeline_position_zh', 'timelinePlacement', 'timeline_placement', 'timelinePlacementZh', 'timeline_placement_zh', 'timelineLabel', 'timeline_label', 'timelineLabelZh', 'timeline_label_zh', 'timelineHint', 'timeline_hint', 'timelineHintZh', 'timeline_hint_zh', 'timelineAnchor', 'timeline_anchor', 'timelineAnchorZh', 'timeline_anchor_zh', 'timelineSummary', 'timeline_summary', 'timelineSummaryZh', 'timeline_summary_zh', 'timelineEra', 'timeline_era', 'timelineEraZh', 'timeline_era_zh', 'timeline', 'timelineZh', 'timeline_zh', 'timelineText', 'timeline_text', 'timelineTextZh', 'timeline_text_zh', 'timelineLine', 'timeline_line', 'timelineLineZh', 'timeline_line_zh', 'timelineContext', 'timeline_context', 'timelineContextZh', 'timeline_context_zh', 'chronology', 'chronologyZh', 'chronology_zh', 'chronologyPosition', 'chronology_position', 'chronologyPositionZh', 'chronology_position_zh', 'chronologyContext', 'chronology_context', 'chronologyContextZh', 'chronology_context_zh', 'historicalContext', 'historical_context', 'historicalContextZh', 'historical_context_zh', 'eraContext', 'era_context', 'eraContextZh', 'era_context_zh', ...CHINESE_TIMELINE_NOTE_KEYS];
const CURATOR_CONTENT_KEYS = [...CURATOR_NOTE_KEYS, ...TIMELINE_NOTE_KEYS];
const CURATOR_WRAPPER_KEYS = ['data', 'result', 'results', 'note', 'notes', 'curator', 'curation', 'card', 'guideCard', 'guide_card', 'tourCard', 'tour_card', 'curatorCard', 'curator_card', 'exhibitCard', 'exhibit_card', 'artifactCard', 'artifact_card', 'threeDCard', 'three_d_card', '3dCard', 'modelCard', 'model_card', 'splatCard', 'splat_card', 'items', 'choices', 'candidates', 'candidate', 'message', 'content', 'parts', 'part', 'output_text', 'outputText', 'output_markdown', 'outputMarkdown', 'input_markdown', 'inputMarkdown', 'markdown', 'output', 'text', 'response', 'tool_calls', 'toolCalls', 'toolCall', 'tool_call', 'function', 'functionCall', 'function_call', 'arguments', 'args', 'parameters', 'params', 'parsed'];
const STRUCTURED_CONTENT_BLOCK_TYPES = ['json', 'output_json', 'input_json', 'json_object'];
const STRUCTURED_CONTENT_BLOCK_KEYS = ['json', 'parsed', 'data', 'object', 'value', 'content', 'text'];
const contentBlockType = (value: unknown) =>
  (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

const hasCuratorContent = (obj: Record<string, unknown>) => CURATOR_CONTENT_KEYS
  .some((key) => !!cleanMeaningful(obj[key], 56));
const hasAnyNoteValue = (obj: Record<string, unknown>, keys: string[]) => keys
  .some((key) => !!cleanMeaningful(obj[key], 56));
const isCompleteCuratorPayload = (obj: Record<string, unknown>) =>
  hasAnyNoteValue(obj, CURATOR_NOTE_KEYS) && hasAnyNoteValue(obj, TIMELINE_NOTE_KEYS);
const mergeCuratorPayload = (base: Record<string, unknown> | null, next: Record<string, unknown>) => {
  const merged = { ...(base || {}) };
  for (const key of CURATOR_CONTENT_KEYS) {
    if (!cleanMeaningful(merged[key], 56) && cleanMeaningful(next[key], 56)) merged[key] = next[key];
  }
  return hasCuratorContent(merged) ? merged : null;
};

const PLAIN_CURATOR_NOTE_RE = /(?:^|\n)\s*(?:[-*•]\s*)?(?:curatorNote|curator_note|curatorNoteZh|curator_note_zh|curatorLine|curator_line|curatorLineZh|curator_line_zh|guideNote|guide_note|guideNoteZh|guide_note_zh|guideText|guide_text|guideTextZh|guide_text_zh|guideLine|guide_line|guideLineZh|guide_line_zh|guideSentence|guide_sentence|guideSentenceZh|guide_sentence_zh|guideSummary|guide_summary|guideSummaryZh|guide_summary_zh|oneLineGuide|one_line_guide|oneLineGuideZh|one_line_guide_zh|shortGuide|short_guide|shortGuideZh|short_guide_zh|guideZh|guide_zh|audioGuide|audio_guide|audioGuideZh|audio_guide_zh|audioGuideLine|audio_guide_line|audioGuideLineZh|audio_guide_line_zh|voiceGuide|voice_guide|voiceGuideZh|voice_guide_zh|voiceGuideLine|voice_guide_line|voiceGuideLineZh|voice_guide_line_zh|voiceover|voiceOver|voice_over|voiceoverZh|voiceOverZh|voice_over_zh|narration|narrationZh|narration_zh|caption|captionZh|caption_zh|personalGuide|personal_guide|personalGuideZh|personal_guide_zh|personalNote|personal_note|personalNoteZh|personal_note_zh|privateGuide|private_guide|privateGuideZh|private_guide_zh|privateNote|private_note|privateNoteZh|private_note_zh|tourNote|tour_note|tourNoteZh|tour_note_zh|tourGuide|tour_guide|tourGuideZh|tour_guide_zh|tourGuideLine|tour_guide_line|tourGuideLineZh|tour_guide_line_zh|tourLine|tour_line|tourLineZh|tour_line_zh|curator\s+(?:note|line)|one\s*line\s*guide|short\s*guide|guide\s+(?:note|text|line|sentence|summary)|audio\s*guide(?:\s*line)?|voice\s*guide(?:\s*line)?|voice\s*over|personal\s+(?:guide|note)|private\s+(?:guide|note)|tour\s+(?:note|guide|line)|guide|导览词|私人导览词|私人导览|个人导览词|个人导览|语音导览词?|讲解词|导览语|展品导览)[：:]\s*([^\n]+)/i;
const PLAIN_TIMELINE_NOTE_RE = /(?:^|\n)\s*(?:[-*•]\s*)?(?:timelineNote|timeline_note|timelineNoteZh|timeline_note_zh|timelinePosition|timeline_position|timelinePositionZh|timeline_position_zh|timelinePlacement|timeline_placement|timelinePlacementZh|timeline_placement_zh|timelineLabel|timeline_label|timelineLabelZh|timeline_label_zh|timelineHint|timeline_hint|timelineHintZh|timeline_hint_zh|timelineAnchor|timeline_anchor|timelineAnchorZh|timeline_anchor_zh|timelineSummary|timeline_summary|timelineSummaryZh|timeline_summary_zh|timelineEra|timeline_era|timelineEraZh|timeline_era_zh|timelineZh|timeline_zh|timelineText|timeline_text|timelineTextZh|timeline_text_zh|timelineLine|timeline_line|timelineLineZh|timeline_line_zh|timelineContext|timeline_context|timelineContextZh|timeline_context_zh|chronology|chronologyZh|chronology_zh|chronologyPosition|chronology_position|chronologyPositionZh|chronology_position_zh|chronologyContext|chronology_context|chronologyContextZh|chronology_context_zh|historicalContext|historical_context|historicalContextZh|historical_context_zh|eraContext|era_context|eraContextZh|era_context_zh|timeline\s+(?:position|placement|label|hint|text|line|context|anchor|summary|era)|chronology\s*(?:position|context)?|historical\s*context|era\s*context|timeline|时间线(?:位置|锚点)?|时间轴(?:位置)?|年表(?:位置)?)[：:]\s*([^\n]+)/i;
const PLAIN_CURATOR_NOTE_DASH_RE = /(?:^|\n)\s*(?:[-*•]\s*)?(?:curator\s+(?:note|line)|one\s*line\s*guide|short\s*guide|guide\s*(?:note|text|line|sentence|summary)?|audio\s*guide(?:\s*line)?|voice\s*guide(?:\s*line)?|personal\s+(?:guide|note)|private\s+(?:guide|note)|tour\s+(?:note|guide|line)|guide|导览词|私人导览词|私人导览|个人导览词|个人导览|语音导览词?|讲解词|导览语|展品导览)\s*[-–—]\s*([^\n]+)/i;
const PLAIN_TIMELINE_NOTE_DASH_RE = /(?:^|\n)\s*(?:[-*•]\s*)?(?:timeline\s*(?:position|placement|label|hint|text|line|context|anchor|summary|era)?|chronology\s*(?:position|context)?|historical\s*context|era\s*context|timeline|时间线(?:位置|锚点)?|时间轴(?:位置)?|年表(?:位置)?)\s*[-–—]\s*([^\n]+)/i;
const MARKDOWN_TABLE_SEPARATOR_RE = /^:?-{2,}:?$/;

function parsePlainFieldPayload(text: string): Record<string, unknown> | null {
  const curatorNote = cleanMeaningful(text.match(PLAIN_CURATOR_NOTE_RE)?.[1] || text.match(PLAIN_CURATOR_NOTE_DASH_RE)?.[1], 56, false);
  const timelineNote = cleanMeaningful(text.match(PLAIN_TIMELINE_NOTE_RE)?.[1] || text.match(PLAIN_TIMELINE_NOTE_DASH_RE)?.[1], 44, false);
  return curatorNote || timelineNote ? { curatorNote, timelineNote } : null;
}

function markdownTableCells(line: string): string[] {
  if (!line.includes('|')) return [];
  let cells = line.split('|').map((cell) => stripDisplayNoise(cell.trim()).trim());
  if (cells[0] === '') cells = cells.slice(1);
  if (cells[cells.length - 1] === '') cells = cells.slice(0, -1);
  if (cells.length < 2) return [];
  if (cells.every((cell) => MARKDOWN_TABLE_SEPARATOR_RE.test(cell.replace(/\s+/g, '')))) return [];
  return cells;
}

function parseMarkdownTablePayload(text: string): Record<string, unknown> | null {
  let merged: Record<string, unknown> | null = null;
  for (const line of text.split('\n')) {
    const cells = markdownTableCells(line);
    if (!cells.length) continue;
    const field = cells[0];
    const value = cells.slice(1).join(' | ');
    const hit = parsePlainFieldPayload(`${field}：${value}`);
    if (!hit) continue;
    merged = mergeCuratorPayload(merged, hit);
    if (merged && isCompleteCuratorPayload(merged)) return merged;
  }
  return merged;
}

function parsePlainTextPayload(value: string): Record<string, unknown> | null {
  const text = value
    .trim()
    .replace(/^```(?:md|markdown|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const tablePayload = parseMarkdownTablePayload(text);
  const plainPayload = parsePlainFieldPayload(text);
  if (!tablePayload) return plainPayload;
  if (!plainPayload) return tablePayload;
  return mergeCuratorPayload(tablePayload, plainPayload) || tablePayload || plainPayload;
}

function parseJsonStringPayload(value: string): unknown | null {
  const text = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [text];
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  for (const candidate of [...new Set(candidates)]) {
    if (!/^[{[]/.test(candidate)) continue;
    try {
      return JSON.parse(candidate);
    } catch { /* try next candidate */ }
  }
  return null;
}

function unwrapCuratorPayload(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 10) return null;
  if (typeof value === 'string') {
    const parsed = parseJsonStringPayload(value);
    if (parsed != null) return unwrapCuratorPayload(parsed, depth + 1);
    return parsePlainTextPayload(value);
  }
  if (Array.isArray(value)) {
    let merged: Record<string, unknown> | null = null;
    for (const item of value) {
      const hit = unwrapCuratorPayload(item, depth + 1);
      if (!hit) continue;
      if (isCompleteCuratorPayload(hit)) return hit;
      merged = mergeCuratorPayload(merged, hit);
    }
    return merged;
  }
  if (!isRecord(value)) return null;
  const type = contentBlockType(value.type);
  if (STRUCTURED_CONTENT_BLOCK_TYPES.includes(type)) {
    for (const key of STRUCTURED_CONTENT_BLOCK_KEYS) {
      if (!(key in value)) continue;
      const hit = unwrapCuratorPayload(value[key], depth + 1);
      if (hit) return hit;
    }
  }
  if (hasCuratorContent(value)) return value;
  let merged: Record<string, unknown> | null = null;
  for (const key of CURATOR_WRAPPER_KEYS) {
    const hit = unwrapCuratorPayload(value[key], depth + 1);
    if (!hit) continue;
    merged = mergeCuratorPayload(merged, hit);
    if (merged && isCompleteCuratorPayload(merged)) return merged;
  }
  return merged;
}

const pickMeaningfulNote = (obj: Record<string, unknown> | null, keys: string[], max: number) => {
  for (const key of keys) {
    const note = cleanMeaningful(obj?.[key], max);
    if (note) return note;
  }
  return '';
};

const normalizeTimelineNote = (s: unknown) => {
  const raw = cleanMeaningful(s, 44, true);
  if (!raw) return '';
  const note = cleanMeaningful(raw.replace(/^时间线位置(?:[：:]|\s*[-–—])\s*/, ''), 44);
  return note ? clean(`时间线位置：${note}`, 44) : '';
};

const pickTimelineNote = (obj: Record<string, unknown> | null, keys: string[]) => {
  for (const key of keys) {
    const note = normalizeTimelineNote(obj?.[key]);
    if (note) return note;
  }
  return '';
};

const yearText = (y: number | null) => {
  if (y == null) return '';
  return y < 0 ? `约公元前${Math.abs(y)}年` : `约公元${y}年`;
};

function localCuratorNotes(draft: ArtifactDraft, ctx: CuratorContext = {}): CuratorNotes {
  const material = draft.tags.material[0] || '';
  const category = draft.tags.category || '展品';
  const era = draft.tags.dynastyLabel || draft.tags.culture || '';
  const threeD = ctx.has3D ? '，现在也能旋转看它的立体轮廓' : '';
  const curatorNote = clean(`${draft.nameZh || '这件展品'}把${era ? `${era}的` : ''}${material}${category}留在眼前${threeD}。`, 52)
    || '这件展品适合慢慢看轮廓、材料和时代留下的痕迹。';
  const timelineBase = [draft.tags.culture, draft.tags.dynastyLabel, yearText(draft.eraStart)].filter(Boolean).join(' · ');
  const timelineNote = clean(timelineBase ? `时间线位置：${timelineBase}` : `时间线位置：钉在${draft.museum || draft.geo?.place || '这座展馆'}的个人展览记忆里`, 42);
  return { curatorNote, timelineNote, source: 'local' };
}

export async function createCuratorNotes(draft: ArtifactDraft, ctx: CuratorContext = {}): Promise<CuratorNotes> {
  const has3D = ctx.has3D === true || hasRenderableSplat(draft.splat);
  const sourceKind = has3D ? (ctx.sourceKind || draft.splat?.sourceKind || '') : '';
  const fallback = localCuratorNotes(draft, { ...ctx, has3D, sourceKind });
  const system = '你是 上街去 的博物馆私人导览员。'
    + '根据展品结构化字段，给用户一张展品卡写短导览。'
    + '不要编造未给出的事实；不确定就用材料、时代、展馆和观看方式表达。'
    + '如果 has3D=true，要自然提到它可以被旋转观看，但不要夸大模型精度。'
    + formatInstructions(CURATOR_SHAPE);
  const prompt = [
    `展品：${draft.nameZh || '(未知)'}`,
    `英文名：${draft.tags.nameEn || ''}`,
    `时代：${draft.tags.dynastyLabel || ''}`,
    `文明：${draft.tags.culture || ''}`,
    `材质：${draft.tags.material.join('、')}`,
    `器类：${draft.tags.category || ''}`,
    `出土地：${draft.tags.findspot || ''}`,
    `尺寸：${draft.tags.dimensions || ''}`,
    `展馆：${draft.museum || draft.geo?.place || ''}`,
    `has3D：${has3D ? 'true' : 'false'}`,
    `3D来源：${sourceKind}`,
    '请输出 JSON。',
  ].join('\n');

  let obj: Record<string, unknown> | null = null;
  try {
    // 导览词走百炼 Qwen 叙事任务档；输出异常时 payload 解包+本地兜底双保险。
    obj = await enrichJSON<Record<string, unknown>>({ prompt, system, task: 'exhibition-narrative', timeoutMs: 30000 });
  } catch {
    return fallback;
  }
  const payload = unwrapCuratorPayload(obj);
  const curatorNote = pickMeaningfulNote(payload, CURATOR_NOTE_KEYS, 56);
  const timelineNote = pickTimelineNote(payload, TIMELINE_NOTE_KEYS);
  if (!curatorNote && !timelineNote) return fallback;
  return {
    curatorNote: curatorNote || fallback.curatorNote,
    timelineNote: timelineNote || fallback.timelineNote,
    source: 'qwen',
  };
}
