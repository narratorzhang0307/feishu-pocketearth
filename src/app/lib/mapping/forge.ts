import {
  DATA_PACK_PROTOCOL,
  DATA_PACK_RUNTIME_VERSION,
  type DataPackManifest,
  type MappingPackRecord,
} from '../dataPack';

export type ForgeCarrierRoute = 'structure' | 'ocr';
export type ForgeVisualRoute = 'guji' | 'guji-modern' | 'rubbing' | 'general';

export interface ForgeVisualClassification {
  material?: unknown;
  textDomain?: unknown;
}

export interface ForgeGazetteerPlace {
  city: string;
  names: string[];
  lat?: number;
  lng?: number;
  status?: string;
  sourceTitle?: string;
  sourceRef?: string;
  evidenceText?: string;
}

export interface ForgeOcrBlock {
  id: string;
  text: string;
  polygon: [number, number, number, number, number, number, number, number];
  readingOrder: number;
  tileIndex: number;
  pass: 'primary' | 'verification';
}

export interface ForgeQualityGate {
  status: 'pass' | 'review' | 'fail';
  reasons: string[];
  visibleChars: number;
  nonemptyBlocks: number;
  tileCount: number;
  disagreement?: number;
}

export interface ForgePageEvidence {
  page: number;
  pipelineVersion?: string;
  route: ForgeCarrierRoute;
  text: string;
  visualRoute?: ForgeVisualRoute;
  adapter?: string;
  source?: 'pdf-text-layer' | 'edge-vision' | 'epub-text' | 'plain-text';
  sourceRef?: string;
  sourceSha256?: string;
  renderedSha256?: string;
  reviewImage?: string;
  baseModel?: string;
  promptVersion?: string;
  blocks?: ForgeOcrBlock[];
  preprocess?: Array<{ operation: string; parameters: Record<string, string | number | boolean> }>;
  qualityGate?: ForgeQualityGate;
  humanReview?: { reviewedAt?: string; originalText: string; editedText: string; reason?: string };
}

export interface ForgePlaceCandidate {
  id: string;
  name: string;
  page: number;
  context: string;
  relation: 'scene' | 'mentioned' | 'route' | 'subject';
  confirmed: boolean;
  status: 'extant' | 'rebuilt' | 'memory-only';
  lat?: number;
  lng?: number;
  geocodeName?: string;
  resolutionSource?: 'local-gazetteer' | 'qwen-search' | 'osm' | 'manual';
  cloudResolution?: { modernQuery: string; rationale: string; sourceUrls: string[]; model?: string };
}

export interface ForgeBookMeta {
  city: string;
  title: string;
  author: string;
  era: string;
  purpose: string;
  preferences: string;
}

export interface MappingDataPackBundle extends DataPackManifest {
  records: MappingPackRecord[];
}

export function visibleCharacters(value: string): string {
  return value.replace(/[\s\u200b-\u200f\u202a-\u202e]/g, '');
}

export function routePdfPage(text: string, itemCount: number): ForgeCarrierRoute {
  const visible = visibleCharacters(text);
  if (visible.length < 24 || itemCount < 2) return 'ocr';
  const meaningful = [...visible].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  return meaningful / Math.max(visible.length, 1) >= 0.55 ? 'structure' : 'ocr';
}

export function adapterForVisualRoute(route: ForgeVisualRoute): string {
  if (route === 'guji') return 'guji-vision';
  if (route === 'rubbing') return 'rubbing-vision';
  return 'general-ocr-vision';
}

export function resolveVisualRoute(value: ForgeVisualClassification): ForgeVisualRoute {
  if (value.material === 'rubbing') return 'rubbing';
  if (value.material === 'guji') return 'guji';
  if (value.textDomain === 'ancient-book') return 'guji-modern';
  return 'general';
}

export function parseLooseJson(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').replace(/”(?=\s*[,}\]])/g, '"').replace(/(:\s*)“/g, '$1"').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

export function dedupeOverlapText(parts: string[]): string {
  const lines: string[] = [];
  for (const part of parts) {
    const incoming = part.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    let overlap = 0;
    for (let size = Math.min(lines.length, incoming.length, 12); size > 0; size -= 1) {
      if (lines.slice(-size).every((line, index) => line === incoming[index])) { overlap = size; break; }
    }
    for (const line of incoming.slice(overlap)) if (lines.at(-1) !== line) lines.push(line);
  }
  return lines.join('\n');
}

function normalizedEditDistance(left: string, right: string): number {
  const a = visibleCharacters(left); const b = visibleCharacters(right);
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current.push(Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    previous = current;
  }
  return previous[b.length] / Math.max(a.length, b.length, 1);
}

export function assessOcrCompleteness(primaryText: string, blocks: ForgeOcrBlock[], tileCount: number, verificationText?: string): ForgeQualityGate {
  const visible = visibleCharacters(primaryText);
  const reasons: string[] = [];
  const nonemptyBlocks = blocks.filter((block) => block.pass === 'primary' && visibleCharacters(block.text).length > 0).length;
  if (!visible) reasons.push('empty-output');
  else if (visible.length < Math.max(12, tileCount * 8)) reasons.push('suspiciously-short');
  if (nonemptyBlocks < tileCount) reasons.push('empty-tile');
  const lines = primaryText.split(/\r?\n/).map(visibleCharacters).filter((line) => line.length >= 4);
  if (lines.length >= 4 && (lines.length - new Set(lines).size) / lines.length >= 0.25) reasons.push('repeated-lines');
  const characterCounts = new Map<string, number>();
  for (const char of visible) characterCounts.set(char, (characterCounts.get(char) || 0) + 1);
  if (visible.length >= 32 && Math.max(0, ...characterCounts.values()) / visible.length >= 0.55) reasons.push('degenerate-character-loop');
  let disagreement: number | undefined;
  if (verificationText !== undefined) {
    disagreement = normalizedEditDistance(primaryText, verificationText);
    if (!visibleCharacters(verificationText)) reasons.push('verification-empty');
    else if (disagreement > 0.34) reasons.push('cross-pass-disagreement');
  }
  const fatal = new Set(['empty-output', 'verification-empty', 'repeated-lines', 'degenerate-character-loop']);
  const status = reasons.some((reason) => fatal.has(reason)) || (disagreement ?? 0) > 0.65 ? 'fail' : reasons.length ? 'review' : 'pass';
  return { status, reasons, visibleChars: visible.length, nonemptyBlocks, tileCount, ...(disagreement === undefined ? {} : { disagreement }) };
}

const PLACE_SUFFIX = '桥|塔|楼|街|门|坊|巷|宫|殿|庙|观|阁|堂|院|园|苑|亭|台|寺|庵|山|峰|洞|泉|井|池|潭|溪|涧|河|湖|堤|岸|渡|驿|市|州|府|县|镇|关';

const GENERIC_PLACE_PHRASES = new Set(['湖山', '山水', '故址', '旧址', '原址', '此地', '当地', '远村']);

export function normalizePlaceEntity(value: string): string {
  let name = value
    .normalize('NFKC')
    .replace(/[《》〈〉“”‘’「」『』【】\[\]()（）]/gu, '')
    .replace(/^[，。；、：:\s]+|[，。；、：:\s]+$/gu, '')
    .trim();
  name = name
    .replace(/^(?:徜徉|游赏|游览|漫步|行经|经过|途经|抵达|前往|来到)/u, '')
    .replace(/^[\p{Script=Han}]{1,12}(?:等)?(?:增建|重建|复建|修建|创建|构筑|移建|改建)(?=[\p{Script=Han}·]{2,16}$)/u, '')
    .replace(/^(?:[\p{Script=Han}]{2,6})?[〇零一二三四五六七八九十百千0-9]{1,8}年(?:间)?(?:始)?建(?=[\p{Script=Han}·]{2,16}$)/u, '')
    .replace(/^名(?:为)?(?=[\p{Script=Han}·]{2,16}$)/u, '')
    .replace(/之(?:阴|阳|东|西|南|北)$/u, '')
    .replace(/(?:附近|周边|一带|南侧|北侧|东侧|西侧|内外|旁边)$/u, '')
    .trim();
  if (!/^[\p{Script=Han}·]{2,16}$/u.test(name) || GENERIC_PLACE_PHRASES.has(name)) return '';
  return name;
}

function cleanPlaceCandidate(value: string): string {
  const pieces = value
    .normalize('NFKC')
    .replace(/[《》〈〉“”‘’「」『』【】\[\]()（）]/gu, '')
    .split(/(?:清晨|午前|午后|中午|傍晚|夜间|后来|随后|最后|远处|从|沿|行至|至|往|转往|前往|向|由|在|抵达|经过|路过|回望|进入|离开)/u)
    .filter(Boolean);
  return normalizePlaceEntity((pieces.at(-1) || '').replace(/^(?:本文|原文|路线|顺序|地点|一带)/u, ''));
}

function compactMatchText(value: string): string {
  return value.normalize('NFKC').replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '');
}

function compactMatchMap(value: string): { text: string; offsets: number[] } {
  const text: string[] = []; const offsets: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const normalized = value[index].normalize('NFKC');
    if (!/[\p{Script=Han}\p{L}\p{N}]/u.test(normalized)) continue;
    text.push(normalized); offsets.push(index);
  }
  return { text: text.join(''), offsets };
}

function ngramCoverage(reference: string, page: string, size = 3): number {
  const grams = new Set<string>();
  for (let index = 0; index <= reference.length - size; index += 1) grams.add(reference.slice(index, index + size));
  if (!grams.size) return 0;
  let matched = 0;
  for (const gram of grams) if (page.includes(gram)) matched += 1;
  return matched / grams.size;
}

function referenceAnchor(reference: string, name: string, page: string): number {
  const nameOffset = reference.indexOf(name);
  if (nameOffset < 0) return 0;
  for (let radius = 0; radius < 36; radius += 1) {
    for (const direction of [-1, 1]) {
      const start = nameOffset + direction * radius;
      if (start < 0 || start + 4 > reference.length) continue;
      const found = page.indexOf(reference.slice(start, start + 4));
      if (found >= 0) return found;
    }
  }
  return 0;
}

export function gazetteerPlaceCandidates(pages: ForgePageEvidence[], places: ForgeGazetteerPlace[], city = '', bookTitle = ''): ForgePlaceCandidate[] {
  const cityKey = city.normalize('NFKC').replace(/\s+/g, '');
  const titleKey = compactMatchText(bookTitle.replace(/[《》]/gu, ''));
  const matches: Array<ForgePlaceCandidate & { offset: number }> = [];
  for (const page of pages) {
    const compactPage = compactMatchMap(page.text);
    for (const place of places) {
      const placeCity = place.city.normalize('NFKC').replace(/\s+/g, '');
      if (cityKey && placeCity && !placeCity.includes(cityKey) && !cityKey.includes(placeCity)) continue;
      for (const rawName of place.names) {
        const name = normalizePlaceEntity(rawName);
        if (!name) continue;
        const compactName = compactMatchText(name);
        const directCompactOffset = compactPage.text.indexOf(compactName);
        const sourceKey = compactMatchText(place.sourceTitle || '');
        const reference = compactMatchText(place.evidenceText || '');
        const sameBookReference = Boolean(
          directCompactOffset < 0
          && titleKey
          && sourceKey
          && (titleKey.includes(sourceKey) || sourceKey.includes(titleKey))
          && reference.includes(compactName)
          && ngramCoverage(reference, compactPage.text) >= 0.34
        );
        if (directCompactOffset < 0 && !sameBookReference) continue;
        const compactOffset = directCompactOffset >= 0 ? directCompactOffset : referenceAnchor(reference, compactName, compactPage.text);
        const offset = compactPage.offsets[Math.min(compactOffset, Math.max(0, compactPage.offsets.length - 1))] || 0;
        const start = Math.max(0, offset - 28);
        const context = page.text.slice(start, offset + name.length + 48).replace(/\s+/g, ' ').trim();
        const status = place.status === 'extant' ? 'extant' : place.status === 'rebuilt' ? 'rebuilt' : 'memory-only';
        matches.push({
          id: '', name, page: page.page, context, relation: 'mentioned', confirmed: false, status,
          ...(Number.isFinite(place.lat) && Number.isFinite(place.lng) ? { lat: place.lat, lng: place.lng } : {}),
          ...(place.sourceTitle ? { geocodeName: `${name}｜${place.sourceTitle}${sameBookReference ? '（参考本校名）' : ''}`, resolutionSource: 'local-gazetteer' as const } : {}),
          offset,
        });
      }
    }
  }
  matches.sort((left, right) => left.page - right.page || left.offset - right.offset || left.name.length - right.name.length);
  const unique = new Map<string, ForgePlaceCandidate & { offset: number }>();
  for (const match of matches) {
    const key = `${match.name}:${match.page}`;
    const current = unique.get(key);
    if (!current || (!Number.isFinite(current.lat) && Number.isFinite(match.lat))) unique.set(key, match);
  }
  return [...unique.values()].map(({ offset: _offset, ...item }, index) => ({ ...item, id: `claim-${index + 1}` })).slice(0, 40);
}

export function fallbackPlaceCandidates(pages: ForgePageEvidence[]): ForgePlaceCandidate[] {
  const seen = new Set<string>(); const out: ForgePlaceCandidate[] = [];
  const push = (page: ForgePageEvidence, rawName: string, index: number, relation: ForgePlaceCandidate['relation']) => {
    const divided = rawName.split(/[与和及]/u).filter(Boolean);
    if (divided.length > 1) {
      let cursor = index;
      for (const part of divided) { push(page, part, cursor, relation); cursor += part.length + 1; }
      return;
    }
    const name = cleanPlaceCandidate(rawName);
    if (!/^[\p{Script=Han}·]{2,16}$/u.test(name) || seen.has(`${name}:${page.page}`)) return;
    seen.add(`${name}:${page.page}`);
    const start = Math.max(0, index - 28); const context = page.text.slice(start, index + rawName.length + 48).replace(/\s+/g, ' ').trim();
    out.push({ id: `claim-${out.length + 1}`, name, page: page.page, context, relation, confirmed: false, status: 'memory-only' });
  };
  for (const page of pages) {
    const suffixExpression = new RegExp(`([\\p{Script=Han}]{1,16}(?:${PLACE_SUFFIX}))`, 'gu');
    for (const match of page.text.matchAll(suffixExpression)) push(page, match[1], match.index ?? 0, 'mentioned');

    // 路线动词也能抓住“平湖秋月”这类没有地点后缀的专名。
    const routeExpression = /(?:从|沿|行至|至|往|转往|前往|向|由|在|抵达|经过|路过|回望)([\p{Script=Han}·]{2,16}?)(?=出发|缓行|行走|停留|显出|一带|附近|南侧|北侧|东侧|西侧|，|。|；|、|与|和|随后|午前|午后|傍晚|$)/gu;
    for (const match of page.text.matchAll(routeExpression)) push(page, match[1], (match.index ?? 0) + match[0].indexOf(match[1]), 'route');

    // 明确列出的路线清单逐项进入候选，但仍不能绕过坐标与人工确认。
    const listExpression = /(?:路线顺序|途经地点|地点清单|地点)(?:为|包括|有)?[:：]([^。；\n]{2,180})/gu;
    for (const match of page.text.matchAll(listExpression)) {
      let cursor = (match.index ?? 0) + match[0].indexOf(match[1]);
      for (const item of match[1].split(/[、，,；;]/u)) {
        push(page, item, cursor, 'route'); cursor += item.length + 1;
      }
    }
    if (out.length >= 40) break;
  }
  return out;
}

export function normalizeModelCandidates(value: unknown, pages: ForgePageEvidence[]): ForgePlaceCandidate[] {
  if (!Array.isArray(value)) return [];
  const pageByNumber = new Map(pages.map((page) => [page.page, page]));
  const seen = new Set<string>(); const out: ForgePlaceCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rawName = typeof row.nameAsWritten === 'string' ? row.nameAsWritten.trim() : typeof row.name === 'string' ? row.name.trim() : '';
    const page = Number(row.page); const evidence = pageByNumber.get(page);
    if (!rawName || !evidence || !evidence.text.includes(rawName)) continue;
    const name = normalizePlaceEntity(rawName);
    if (!name || !evidence.text.includes(name) || seen.has(`${name}:${page}`)) continue;
    seen.add(`${name}:${page}`);
    const relation = ['scene', 'mentioned', 'route', 'subject'].includes(String(row.relation)) ? String(row.relation) as ForgePlaceCandidate['relation'] : 'mentioned';
    const offset = evidence.text.indexOf(name);
    const context = typeof row.context === 'string' && evidence.text.includes(row.context.trim()) ? row.context.trim() : evidence.text.slice(Math.max(0, offset - 24), offset + name.length + 36).replace(/\s+/g, ' ').trim();
    out.push({ id: `claim-${out.length + 1}`, name, page, context, relation, confirmed: false, status: 'memory-only' });
    if (out.length >= 40) break;
  }
  return out;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const char of value.normalize('NFKC').trim().toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(36);
}

export function stableMappingPackId(meta: ForgeBookMeta, sourceSha256: string): string {
  return `user.mapping.${fingerprint(`${meta.title}\0${meta.author}\0${sourceSha256}`)}`;
}

export function buildMappingDataPack(meta: ForgeBookMeta, candidates: ForgePlaceCandidate[], source: { name: string; sha256: string }, generatedAt = new Date().toISOString()): MappingDataPackBundle {
  const confirmed = candidates.filter((item) => item.confirmed && Number.isFinite(item.lat) && Number.isFinite(item.lng));
  const packId = stableMappingPackId(meta, source.sha256);
  const record: MappingPackRecord = {
    id: `mapping:${fingerprint(`${meta.title}\0${source.sha256}`)}`,
    title: meta.title || source.name,
    author: meta.author,
    era: meta.era,
    city: meta.city,
    sourceName: source.name,
    sourceSha256: source.sha256,
    summary: `目的：${meta.purpose || '把内容落到地球'}；偏好：${meta.preferences || '未指定'}。`,
    locations: confirmed.map((item, index) => ({
      id: `place:${fingerprint(`${item.name}\0${item.page}\0${item.context}`)}-${index + 1}`,
      name: item.name,
      status: item.status,
      relation: item.relation,
      page: item.page,
      quote: item.context,
      note: `现代坐标是落图候选，不自动证明历史确址。${item.geocodeName ? `候选：${item.geocodeName}` : ''}${item.cloudResolution?.rationale ? `；Qwen 依据：${item.cloudResolution.rationale}` : ''}`,
      lng: item.lng!, lat: item.lat!,
      confidence: item.resolutionSource === 'manual' ? 0.92 : item.resolutionSource === 'local-gazetteer' ? 0.84 : item.resolutionSource === 'qwen-search' ? 0.76 : 0.7,
      confirmed: true,
      sourceRef: `第 ${item.page} 页`,
      sourceUrls: item.cloudResolution?.sourceUrls || [],
    })),
  };
  return {
    protocol: DATA_PACK_PROTOCOL,
    identity: { id: packId, name: `${record.title} · 内容地图`, version: '1.0.0', author: meta.author || 'Pocket Earth 用户', description: `由 Book-to-Earth Mapping Skill 生成；包含 ${record.locations.length} 个经人工确认的地点。` },
    schema: { name: 'pocket.mapping/v1', version: '1.0.0', record_count: 1 },
    compatibility: { skills: ['pocket.mapping'], runtime_min: DATA_PACK_RUNTIME_VERSION },
    privacy: 'private',
    provenance: { source: source.name, license: 'private-use', generated_at: generatedAt },
    distribution: { mode: 'inline' },
    records: [record],
  };
}
