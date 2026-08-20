import { getEdgeRuntimeStatus, httpEdge, restoreHeritageImage } from '../../../../frost-agent/edge/httpEdge';
import type { EdgeResponse } from '../../../../frost-agent/edge/types';

export type RubbingGate = 'passed' | 'manual-review' | 'failed';

export interface RubbingCandidate {
  source: 'qwen-base' | 'rubbing-lora';
  text: string;
  valid: boolean;
  reasons: string[];
}

export interface RubbingResult {
  backend: 'mnn';
  base: RubbingCandidate;
  lora: RubbingCandidate;
  gate: RubbingGate;
  selected: string;
  reason: string;
}

const clean = (value: string): string => value
  .replace(/```(?:text)?/gi, '')
  .replace(/```/g, '')
  .replace(/^\s*(?:转录|识读结果|文字)[:：]\s*/u, '')
  .trim();

const comparable = (value: string): string => clean(value).normalize('NFKC').replace(/[\s，。！？、；：“”‘’（）《》【】\[\].,:;!?-]/gu, '');

function repetitionDetected(value: string): boolean {
  const text = comparable(value);
  if (/(.{2,10})\1{3,}/u.test(text)) return true;
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  return text.length >= 12 && Math.max(0, ...counts.values()) / text.length > 0.48;
}

export function assessRubbingCandidate(source: RubbingCandidate['source'], raw: string): RubbingCandidate {
  const text = clean(raw);
  const compact = comparable(text);
  const reasons: string[] = [];
  if (compact.length < 2) reasons.push('可读字符不足');
  if (text.length > 1200) reasons.push('输出异常过长');
  if (repetitionDetected(text)) reasons.push('检测到复读');
  if (/无法(?:识别|辨认)|看不清|抱歉|as an ai|i cannot/iu.test(text)) reasons.push('模型未给出转录');
  if (!/[\u3400-\u9fff□]/u.test(text)) reasons.push('未检测到碑拓文字');
  return { source, text, valid: reasons.length === 0, reasons };
}

function bigramSimilarity(left: string, right: string): number {
  const a = comparable(left); const b = comparable(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value: string) => new Set(Array.from({ length: Math.max(1, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const x = grams(a); const y = grams(b); let common = 0;
  x.forEach((item) => { if (y.has(item)) common += 1; });
  return common / Math.max(x.size, y.size, 1);
}

export function gateRubbingCandidates(baseRaw: string, loraRaw: string): Omit<RubbingResult, 'backend'> {
  const base = assessRubbingCandidate('qwen-base', baseRaw);
  const lora = assessRubbingCandidate('rubbing-lora', loraRaw);
  if (!base.valid && !lora.valid) return { base, lora, gate: 'failed', selected: '', reason: 'Base 与 LoRA 都未通过输出门禁，请重拍或手工录入。' };
  if (base.valid && !lora.valid) return { base, lora, gate: 'passed', selected: base.text, reason: `LoRA ${lora.reasons.join('、')}，采用 Base。` };
  if (!base.valid && lora.valid) return { base, lora, gate: 'passed', selected: lora.text, reason: `Base ${base.reasons.join('、')}，采用 LoRA。` };
  const similarity = bigramSimilarity(base.text, lora.text);
  if (similarity >= 0.82) return { base, lora, gate: 'passed', selected: lora.text, reason: `双候选一致度 ${Math.round(similarity * 100)}%，采用碑拓 LoRA 转录。` };
  return { base, lora, gate: 'manual-review', selected: '', reason: `Base 与 LoRA 一致度仅 ${Math.round(similarity * 100)}%，禁止自动覆盖，请人工选择或校订。` };
}

const PROMPT = '逐字转录这张碑刻或拓片。保持可见行序，不总结、不翻译、不补字；不能确认的单字写作□。只输出原始转录。';

export async function runRubbingOcr(image: string): Promise<RubbingResult> {
  const status = await getEdgeRuntimeStatus();
  if (status.backend !== 'mnn' || !status.runtime?.visionReady) throw new Error('Qwen3-VL MNN 端侧视觉基座尚未就绪');
  if (!status.runtime.adapters?.['rubbing-vision']?.installed) throw new Error('rubbing-vision-lora 尚未安装；不会用共享 Base 冒充碑拓 Skill');
  const baseText = await httpEdge.vision(image, PROMPT, { detail: 'ocr', maxTokens: 768 });
  const loraText = await httpEdge.vision(image, PROMPT, { adapter: 'rubbing-vision', detail: 'ocr', maxTokens: 768 });
  return { backend: 'mnn', ...gateRubbingCandidates(baseText, loraText) };
}

export async function runHeritageRestoration(image: string, mask: string): Promise<EdgeResponse> {
  const response = await restoreHeritageImage(image, mask);
  if (response.backend !== 'mnn' || !response.image) throw new Error(response.error || '文化遗产修复模型尚未就绪');
  if (response.stats?.unmaskedMaxDelta !== 0) throw new Error('修复结果改动了遮罩外像素，Quality Gate 已拒绝');
  return response;
}
