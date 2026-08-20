// Frost Harness · Provider 兼容层（D）
// 云脑(Brain) 各家模型的请求只在这里拼：单一入口 buildProviderRequest，
// 每家一个 adapter(matches/apply)，first-match-wins。
// 加一家模型 = 加一个 adapter 文件并在下方 registerProvider；删一家 = 删该文件那行。
// 中间件(vite.config 的 frostLlm)只认这个入口，不再内联各家 quirk。

/** 与 provider 无关的归一化请求（中间件构造）。 */
export interface NormalizedRequest {
  messages: { role: string; content: string }[];
  json?: boolean;
  temperature?: number;
  model?: string;   // 可选：覆盖 adapter 默认 Qwen 模型
}

/** 某 provider 的具体 HTTP 请求（中间件据此 fetch）。 */
export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProviderAdapter {
  name: string;
  matches: (provider: string) => boolean;
  apply: (req: NormalizedRequest, key: string) => ProviderRequest;
}

const adapters: ProviderAdapter[] = [];

export function registerProvider(a: ProviderAdapter): void { adapters.push(a); }

/** 按 provider 名取第一个匹配的 adapter 拼请求；无匹配则抛错（中间件兜底返回空串）。 */
export function buildProviderRequest(provider: string, req: NormalizedRequest, key: string): ProviderRequest {
  const a = adapters.find((x) => x.matches(provider));
  if (!a) throw new Error(`provider-compat: 无适配器 for "${provider}"`);
  return a.apply(req, key);
}

// ——— 注册内置 adapter（加新模型在此追加一行 import + register）———
// 决赛版本云模型只注册阿里云百炼 Qwen；旧 Google/GMI 适配器不再进入运行时。
import { dashscopeAdapter } from './dashscope';
registerProvider(dashscopeAdapter);
