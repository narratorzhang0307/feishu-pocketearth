// Qwen-first 云端模型表：与 server/qwen-provider.mjs 的业务路由保持一致。
export type LlmTask = 'council' | 'narrative' | 'route' | 'multilingual' | 'default';

export const TASK_MODEL: Record<LlmTask, string> = {
  council: 'qwen3.5-plus',
  narrative: 'qwen-plus',
  route: 'qwen-flash',
  multilingual: 'qwen-plus',
  default: 'qwen-plus',
};

/** task → 展示用短名（去掉 org 前缀，RunTrace 里更好读）。 */
export function modelLabel(task?: string): string {
  const full = TASK_MODEL[(task as LlmTask) || 'default'] || TASK_MODEL.default;
  return full.includes('/') ? full.split('/').slice(-1)[0] : full;
}
