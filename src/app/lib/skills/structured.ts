// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· structured —— schema 驱动「提示生成 + 运行时校验」（借鉴 langchain output-parsers）
// ────────────────────────────────────────────────────────────────────────────
// langchain 把「让 LLM 吐结构化数据」拆成四个正交关注点。这里借两个最高性价比的，用最朴素的 schema 实现：
//   · formatInstructions(schema) —— schema【确定性派生】成提示词约束，收敛各 agent 手写的「请返回 JSON…」。
// 不引 zod 全家桶、不搬 langchain 的 parser 类层级——对手搓 harness 是过度工程。
// ════════════════════════════════════════════════════════════════════════════

export interface FieldShape { type: 'string' | 'number' | 'string[]' | 'boolean'; desc?: string; required?: boolean }
export type Shape = Record<string, FieldShape>;

/** schema → 提示词约束（确定性派生 + langchain 那段「别加围栏/别加废话」戒律的精简中文版）。 */
export function formatInstructions(s: Shape): string {
  const fields = Object.entries(s)
    .map(([k, v]) => `  "${k}": ${v.type}${v.required ? '（必填）' : ''}${v.desc ? `  // ${v.desc}` : ''}`)
    .join('\n');
  return `只返回一个 JSON 对象，不要 markdown 围栏、不要任何前后说明文字。字段：\n{\n${fields}\n}`;
}
