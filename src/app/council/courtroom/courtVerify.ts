// 确定性验证器（输出侧「下层面包」）：生成可以是概率性的，但验证必须是确定性的。
// 关键纪律（对抗校验强约束）：courtVerify 自建一份**私有** Validator 注册表，
// 零 import frost-agent/harness/validator.ts、绝不调 registerActionValidator——否则会往 FROST 全局
// validators 注册表注入 court 动作、污染 RADIO 封闭枚举。这里只借鉴它的「注册表 ordered dispatch」思想。
import type { Verdict } from './types';

export interface VerifyCtx {
  evidenceMentions: string[];   // 质证/辩论阶段公开发言全文（用于核验证据引用是否真实出现过）
}
// 违规分级：critical = 触及裁决可信度根基（如疑似杜撰证据），命中即不得入判例库、UI 标红；
// warning = 程序瑕疵（缺推理链/置信越界），降置信但不阻断入库。
export type Severity = 'critical' | 'warning';
export interface Violation { key: string; severity: Severity; msg: string }
type Validator = (v: Verdict, ctx: VerifyCtx) => string[];   // 返回违规说明（空 = 通过）

// 私有注册表（模块内单例，与 FROST 无关）：每条规则带固定 severity
const validators: { key: string; severity: Severity; fn: Validator }[] = [];
function register(key: string, severity: Severity, fn: Validator) { validators.push({ key, severity, fn }); }

const norm = (s: string) => (s || '').replace(/[\s《》「」"'.,。，、]/g, '');

// ① 每条主张必须带证据引用 + 推理链（语法上消灭空口断言）→ 程序瑕疵，warning
register('argHasEvidence', 'warning', (v) => {
  const bad: string[] = [];
  for (const [side, args] of [['正方', v.proArgs], ['反方', v.conArgs]] as const) {
    (args || []).forEach((a, i) => {
      if (!a.evidenceRef || !a.evidenceRef.trim()) bad.push(`${side}第${i + 1}条主张无证据引用`);
      if (!a.reasoning || a.reasoning.trim().length < 4) bad.push(`${side}第${i + 1}条主张无推理链`);
    });
  }
  return bad;
});

// ② 证据引用应在质证/辩论的公开发言里有迹可循。庭长合议会把证据「改写/概括」，故不用前缀整串匹配
//（会把忠实转述误判杜撰、误扣置信），改为 3 字片段任一命中即视为可追溯——只拦真正凭空捏造（零片段重叠）。
// 疑似杜撰证据动摇裁决根基 → critical：命中即不得入判例库、UI 标红。
register('evidenceTraceable', 'critical', (v, ctx) => {
  const corpus = norm(ctx.evidenceMentions.join('｜'));
  if (!corpus) return [];
  const traceable = (ref: string) => {
    if (ref.length < 3) return true;
    for (let i = 0; i + 3 <= ref.length; i++) if (corpus.includes(ref.slice(i, i + 3))) return true;
    return false;
  };
  const bad: string[] = [];
  const check = (side: string, args: typeof v.proArgs) => (args || []).forEach((a, i) => {
    const ref = norm(a.evidenceRef);
    if (ref && ref.length >= 4 && !traceable(ref)) {
      bad.push(`${side}第${i + 1}条证据「${a.evidenceRef}」在庭审中无迹可循，疑似杜撰`);
    }
  });
  check('正方', v.proArgs); check('反方', v.conArgs);
  return bad;
});

// ③ 置信度必须在 [0,1] 且裁断非空（防越级/空裁）→ 程序瑕疵，warning
register('verdictSane', 'warning', (v) => {
  const bad: string[] = [];
  if (!v.verdict || !v.verdict.trim()) bad.push('裁断为空');
  if (!(v.confidence >= 0 && v.confidence <= 1)) bad.push('置信度越界');
  if (!v.issues || !v.issues.length) bad.push('无争点（未经立案直接裁决）');
  return bad;
});

export interface VerifyResult {
  ok: boolean;
  violations: Violation[];      // 全部违规（带分级）
  critical: Violation[];        // 仅 critical（入库门 + UI 标红用）
  messages: string[];           // 全部违规文案（兼容旧的 join 展示）
}
export function verifyVerdict(v: Verdict, ctx: VerifyCtx): VerifyResult {
  const violations: Violation[] = [];
  for (const { key, severity, fn } of validators) {
    try { for (const msg of fn(v, ctx)) violations.push({ key, severity, msg }); }
    catch { /* 单个校验器异常不影响其它 */ }
  }
  const critical = violations.filter((x) => x.severity === 'critical');
  return { ok: violations.length === 0, violations, critical, messages: violations.map((x) => x.msg) };
}
