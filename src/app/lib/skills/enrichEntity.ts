// 可复用 Skill（app 层）· 结构化补全 / 向云脑要 JSON（enrich）
// 抽出被反复复制的「调云脑拿一段结构化 JSON + 稳健解析」plumbing：
//   · extractJSON —— 容错抽 JSON（容忍 ```json 包裹、前后废话；first{…last}），movie/tagging、engine、
//     research、forge 各自抄过一份，统一到这里。
//   · enrichJSON —— 组装 system+prompt → /api/frost-llm(json) → 带超时 → extractJSON，返回对象或 null。
// 关注点分离：本 skill 管「LLM→JSON」的 How；各 agent 的字段 schema / 系统提示 / 结果映射是领域专属，留在调用方
//   （电影 导演/演员/流派 vs 书 作者/译者 字段不同，强行塞进一个"通用 schema"会是泄漏抽象，故不做）。
// 任何要"让云脑按结构吐数据"的 agent/场景都可复用。app 层 skill（打 /api/frost-llm，与 agent 同层）。
import { withRetry, HttpError, isTransient } from './withRetry';

/** 从 LLM 文本里容错抽出 JSON（容忍代码块包裹与前后废话）。对象优先→数组→整段，取第一个能解析的。失败返回 null。 */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const tryParse = (s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
  // 对象优先（多数调用方要对象）：first{…last}——避免 prose 里的杂散 [ 把贪婪匹配撑大致解析失败；无对象再退数组；再退整段。
  const obj = body.indexOf('{') !== -1 ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : null;
  const arr = body.indexOf('[') !== -1 ? body.slice(body.indexOf('['), body.lastIndexOf(']') + 1) : null;
  return tryParse(obj) ?? tryParse(arr) ?? tryParse(body.trim());
}

export interface EnrichInput { prompt: string; system?: string; timeoutMs?: number; task?: string }

/**
 * 向云脑要一段结构化 JSON（强约束 json + 超时 + 瞬时故障退避重试 + 稳健解析）。失败 → null（调用方走兜底，舱壁）。
 * withRetry 治 Qwen 云端网关偶发抖动/429/5xx（只重试瞬时故障、4xx 不重试）。
 */
export async function enrichJSON<T = Record<string, unknown>>(input: EnrichInput): Promise<T | null> {
  try {
    const data = await withRetry(async () => {
      const r = await fetch('/api/frost-llm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input.prompt, system: input.system, json: true, task: input.task }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 20000),   // 超时即真中断在途 fetch（对齐 travel/mcp.ts；TimeoutError 仍被 isTransient 判瞬时→照常重试）
      });
      if (!r.ok) throw new HttpError(r.status);   // 让 5xx/429 进重试（4xx 由 isTransient 判否、不重试）
      return r.json();
    }, { attempts: 3, retryOn: isTransient });
    return extractJSON<T>(String(data?.text || ''));
  } catch { return null; }   // 重试耗尽/4xx/解析失败 → null，舱壁
}
