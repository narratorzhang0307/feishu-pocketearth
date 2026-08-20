// Frost Harness · 意图 → 子 agent 处理器注册表（B 第二步：router 注册表化）
// 把 router 里写死的 switch(intent) 换成注册表查找：
// 新增一类意图 = registerIntent(intent, handler) 注册一个处理器，内核 dispatch 不用改。
// 配合 validator 的 registerActionValidator，一起朝「声明式 skill 注册」收口最后一处硬编码。
import { AgentResult, FrostContext } from './types';
import { runSwitchHandler, switchToCity } from '../agents/switch-handler';
import { runTourDirector } from '../agents/tour-director';
import { runOpenDjDirector } from '../agents/open-dj-director';
import { runDeepAnswer } from '../agents/deep-answer';
import { runChitchat } from '../agents/chitchat';
import { runGeneral } from '../agents/general';

/** 意图处理器：拿到上下文（和可选的城市）→ 产出子 agent 结果。 */
export type IntentHandler = (ctx: FrostContext, opts?: { city?: string }) => Promise<AgentResult> | AgentResult;

const handlers: Record<string, IntentHandler> = {};

/** 注册 / 覆盖某意图的处理器（新 skill 接入时调用）。 */
export function registerIntent(intent: string, handler: IntentHandler): void { handlers[intent] = handler; }
export function getIntentHandler(intent: string): IntentHandler | undefined { return handlers[intent]; }

// ——— 内置：电台(radio) 这套 skill 的意图处理器 ———
registerIntent('switch', (ctx, opts) => {
  const byCity = opts?.city ? switchToCity(opts.city) : null;   // LLM 抽到城就直接切
  if (byCity) return byCity;
  const sw = runSwitchHandler(ctx);                              // 否则再试一次正则（next/pause 等）
  return sw.data.matched ? sw : runGeneral(ctx);
});
registerIntent('tour', (ctx) => runTourDirector(ctx.now));
registerIntent('open_dj', (ctx) => runOpenDjDirector(ctx));
registerIntent('city_culture', (ctx) => runDeepAnswer(ctx));
registerIntent('chitchat', (ctx) => runChitchat(ctx));
registerIntent('general', (ctx) => runGeneral(ctx));
