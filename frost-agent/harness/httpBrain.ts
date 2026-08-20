// Qwen 云脑：把提示 POST 给 /api/frost-llm（阿里云百炼 DashScope，密钥只在服务端）。
// 返回空串（无 key / 出错）时，各 Skill 或内部处理器自动回退到规则 fallback。
import { FrostBrain } from './types';

export const httpBrain: FrostBrain = {
  async complete(prompt: string, opts?: { json?: boolean; task?: string }): Promise<string> {
    try {
      const r = await fetch('/api/frost-llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, json: !!opts?.json, task: opts?.task }),
      });
      if (!r.ok) return '';
      const data = await r.json();
      return typeof data?.text === 'string' ? data.text : '';
    } catch {
      return '';
    }
  },
};
