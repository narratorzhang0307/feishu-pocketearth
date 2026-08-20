// Frost Harness · 可插拔 LLM「大脑」
// stub 仅作为无网/无密钥回退；应用启动时 main.tsx 会注入真实 Qwen httpBrain。
// 调用方检测空串后走确定性 fallback，避免把“云端不可用”伪装成模型结果。
import { FrostBrain } from './types';

export const stubBrain: FrostBrain = {
  async complete(_prompt: string, _opts?: { json?: boolean }): Promise<string> {
    // 占位：返回空串。调用方检测到空串即走自己的规则 fallback。
    return '';
  },
};

let current: FrostBrain = stubBrain;

/** 注入真实大脑（接后端后调用一次）。 */
export function setFrostBrain(brain: FrostBrain): void { current = brain; }

/** 取当前大脑（默认 stub）。 */
export function getFrostBrain(): FrostBrain { return current; }
