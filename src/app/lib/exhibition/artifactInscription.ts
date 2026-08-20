import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { visionRead } from '../skills/visionRead';

export const ARTIFACT_INSCRIPTION_ADAPTER = 'rubbing-vision' as const;

export type ArtifactInscriptionSource = 'agreement' | 'rubbing-lora' | 'base-fallback' | 'comparison-review' | 'manual';

export interface ArtifactInscriptionResult {
  rawText: string;
  baseCandidate: string;
  loraCandidate: string;
  normalizedText?: string;
  modernText?: string;
  confidence: number;
  source: ArtifactInscriptionSource;
  needsConfirmation: boolean;
  gateReason?: string;
  languageGateReason?: string;
  semanticSource?: 'qwen' | 'raw-fallback';
  adapter: typeof ARTIFACT_INSCRIPTION_ADAPTER;
}

export const ARTIFACT_INSCRIPTION_PROMPT = [
  '逐字转录图中器物表面的古代中文铭文，按真实阅读顺序输出。',
  '不可辨识处写 □；不得根据常识补字，不得加断句或解释。',
  '只输出转录结果，不要标题、Markdown 或其他说明。',
].join('\n');

function compact(value: string): string {
  return (value || '')
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^(?:转录|铭文|识读结果)[:：]\s*/u, '')
    .replace(/\s+/g, '')
    .trim();
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current.push(Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      ));
    }
    previous = current;
  }
  return previous[right.length];
}

export function inscriptionCandidateIssue(raw: string): string {
  const text = compact(raw);
  if (!text) return '未读出铭文';
  if (text.length < 2) return '转录过短';
  if (text.length > 180) return '转录过长';
  if (/(?:□\s*){12,}/u.test(raw)) return '占位符连续塌缩';
  if (/(.)\1{5,}/u.test(text)) return '单字重复塌缩';
  if (/摩崖石刻|图片展示页|时\s*分\s*秒|根据图片|the image/i.test(raw)) return '偏离逐字转录任务';
  return '';
}

export function inscriptionAgreement(leftRaw: string, rightRaw: string): number {
  const left = compact(leftRaw);
  const right = compact(rightRaw);
  const size = Math.max(left.length, right.length);
  return size ? Math.max(0, 1 - editDistance(left, right) / size) : 0;
}

export function chooseArtifactInscriptionCandidate(baseRaw: string, loraRaw: string): ArtifactInscriptionResult {
  const baseCandidate = compact(baseRaw);
  const loraCandidate = compact(loraRaw);
  const baseIssue = inscriptionCandidateIssue(baseRaw);
  const loraIssue = inscriptionCandidateIssue(loraRaw);
  const agreement = inscriptionAgreement(baseRaw, loraRaw);
  const common = { baseCandidate, loraCandidate, adapter: ARTIFACT_INSCRIPTION_ADAPTER };

  if (!loraIssue && baseIssue) {
    return { ...common, rawText: loraCandidate, confidence: 0.66, source: 'rubbing-lora', needsConfirmation: false, gateReason: `Base 回退：${baseIssue}` };
  }
  if (loraIssue && !baseIssue) {
    return { ...common, rawText: baseCandidate, confidence: 0.58, source: 'base-fallback', needsConfirmation: false, gateReason: `LoRA 回退：${loraIssue}` };
  }
  if (!loraIssue && !baseIssue && agreement >= 0.78) {
    return { ...common, rawText: loraCandidate, confidence: Math.min(0.9, 0.62 + agreement * 0.28), source: 'agreement', needsConfirmation: false, gateReason: `Base/LoRA 一致度 ${Math.round(agreement * 100)}%` };
  }
  if (!loraIssue && !baseIssue) {
    return {
      ...common,
      rawText: loraCandidate,
      confidence: 0.42,
      source: 'comparison-review',
      needsConfirmation: true,
      gateReason: `Base/LoRA 仅 ${Math.round(agreement * 100)}% 一致，禁止自动断句`,
    };
  }
  return {
    ...common,
    rawText: '',
    confidence: 0,
    source: 'manual',
    needsConfirmation: true,
    gateReason: `Base：${baseIssue || '不可用'}；LoRA：${loraIssue || '不可用'}`,
  };
}

function parseLooseJson(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

function textWithoutPunctuation(value: string): string {
  return value.replace(/[\s\p{P}\p{S}]/gu, '');
}

export function languagePassPreservesOriginal(rawText: string, punctuated: string): boolean {
  return compact(rawText) === textWithoutPunctuation(punctuated);
}

export async function explainConfirmedArtifactInscription(rawText: string): Promise<{
  normalizedText: string;
  modernText: string;
  languageGateReason?: string;
  semanticSource: 'qwen' | 'raw-fallback';
}> {
  const confirmedText = compact(rawText);
  if (!confirmedText) throw new Error('确认的器物铭文不能为空');
  const raw = await edgeSafe.chat([
    '以下是用户已确认的器物铭文转录。你只能断句和今译，不得改动原字，不得把 □ 或候选字改成确定字。',
    'modernText 必须用白话解释文字在器物上的意义，不能只做繁简转换或照抄。',
    '示例：子孫永寶用 → {"punctuated":"子孫永寶用。","modernText":"这是器物吉语，祝愿子孙后代永久珍藏使用。"}',
    '只输出纯 JSON：{"punctuated":"保留原字的断句版","modernText":"简洁今译；不确定处明说"}',
    `转录：${confirmedText}`,
  ].join('\n'), { json: true, system: '你是谨慎的金石文献整理助手。' });
  const parsed = parseLooseJson(raw);
  const punctuated = typeof parsed?.punctuated === 'string' ? parsed.punctuated.trim() : '';
  const modernText = typeof parsed?.modernText === 'string' ? parsed.modernText.trim() : '';
  if (!punctuated || !languagePassPreservesOriginal(confirmedText, punctuated)) {
    return {
      normalizedText: confirmedText,
      modernText: '',
      languageGateReason: '原字守恒校验未通过：已拦截 Qwen 改字/缺字与今译',
      semanticSource: 'raw-fallback',
    };
  }
  if (!modernText || textWithoutPunctuation(modernText) === confirmedText || textWithoutPunctuation(modernText).length <= confirmedText.length + 2) {
    return {
      normalizedText: punctuated,
      modernText: '',
      languageGateReason: '语义质量校验未通过：Qwen 仅照抄原文，未冒充为今译',
      semanticSource: 'raw-fallback',
    };
  }
  return {
    normalizedText: punctuated,
    modernText,
    semanticSource: 'qwen',
  };
}

/**
 * A separately photographed, tightly framed inscription detail -> Base/LoRA A/B -> gate -> Qwen language pass.
 * Overview reconstruction frames must never be sent here automatically.
 */
export async function runArtifactInscriptionPipeline(imageDataUrl: string): Promise<ArtifactInscriptionResult> {
  const options = { max: 1200, redact: false, timeoutMs: 125000, detail: 'ocr' as const, maxTokens: 160 };
  const baseRaw = await visionRead(imageDataUrl, ARTIFACT_INSCRIPTION_PROMPT, options);
  const loraRaw = await visionRead(imageDataUrl, ARTIFACT_INSCRIPTION_PROMPT, { ...options, adapter: ARTIFACT_INSCRIPTION_ADAPTER });
  const result = chooseArtifactInscriptionCandidate(baseRaw, loraRaw);
  if (result.needsConfirmation || !result.rawText) return result;
  const language = await explainConfirmedArtifactInscription(result.rawText);
  return { ...result, ...language };
}
