// Frost 会话记忆 —— 对应源项目 frost.agent 里的 chat_history 机制（最近 6 轮）。
// 长期跨会话记忆（mem0 + 向量库）后续再挂；当前先把"会话上下文"喂给大脑，
// 让 Frost 不会上一句还在说、下一句就忘。
import { ChatTurn } from './types';

const MAX_TURNS = 6;

/** 把最近对话拼成给大脑的上下文块（空历史返回空串）。 */
export function formatHistory(history?: ChatTurn[]): string {
  if (!history || history.length === 0) return '';
  const recent = history.slice(-MAX_TURNS);
  const lines = recent.map((t) => `${t.role === 'user' ? '用户' : 'Frost'}: ${t.text}`);
  return `# 最近对话（会话记忆）\n${lines.join('\n')}\n`;
}
