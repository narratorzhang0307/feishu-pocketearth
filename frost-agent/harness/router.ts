// Frost Harness · Router（总控）
// 混合路由：① 明确指令由 switch-handler 正则秒回（省钱省延迟）；
// ② 其余交给 LLM 大脑读懂自然语言、判断意图 + 抽城市（泛化，接得住没预料到的问法）；
// ③ 大脑不可用时回退规则路由。Skill 处理器只建议动作 → Validator 校验 → 返回。
import { AgentResult, FrostContext, FrostIntent } from './types';
import { validateActions } from './validator';
import { runSwitchHandler } from '../agents/switch-handler';
import { runGeneral } from '../agents/general';
import { getIntentHandler } from './intentRegistry';
import { llmRoute } from './llmRoute';
import { edgeSafe } from '../edge/contract';
import { recordHealth } from './health';

// 端侧可预分类的意图（switch 需抽城，留给正则秒回 / 云脑，不交端侧）
const EDGE_INTENTS: FrostIntent[] = ['tour', 'open_dj', 'city_culture', 'chitchat', 'general'];

// 端侧 Qwen/MNN 就绪时先粗分意图，省云 token 且用户原话不出端；未加载/没把握再交给云端 Qwen。
const EDGE_FIRST = true;

const TOUR = /(日落|跟着.*走|跟随日落|巡游|环游|哪.*在日落|正在日落)/;
const CULTURE = /(是谁|介绍一下|讲讲|为什么|什么样|历史|文化|背后|这位作家|这座城)/;
const SCENE = /(在读|在看|读到|心情|像.*的|场景|今天|出门|自驾|开车|失眠|异乡|海边|主题电台|歌单|策展|推荐.*歌)/;
const PRIVATE_INPUT = /(身份证|护照|银行卡|手机号|电话号码|家庭住址|精确住址|证件照|人脸照片|病历|医疗记录|私密照片)/;

/** 端侧未就绪时也不得把明显隐私文本静默升级到云端。 */
export function isPrivacySensitiveInput(text: string): boolean { return PRIVATE_INPUT.test(text || ''); }

/** 规则兜底路由（大脑不可用时用）。 */
function routeRegex(t: string): FrostIntent {
  if (TOUR.test(t)) return 'tour';
  if (SCENE.test(t)) return 'open_dj';
  if (CULTURE.test(t)) return 'city_culture';
  return 'general';
}

/** 按意图委派：走意图注册表查处理器；未注册的意图回退 general。city 为 LLM 抽到的城市（switch 用）。 */
async function dispatch(intent: FrostIntent, ctx: FrostContext, city?: string): Promise<AgentResult> {
  const handler = getIntentHandler(intent);
  if (handler) return handler(ctx, { city });
  return runGeneral(ctx);
}

/** Frost 总入口：① 指令秒回 → ② 大脑路由 → ③ 规则兜底；委派 → 校验动作 → 返回。 */
export async function runFrost(ctx: FrostContext): Promise<AgentResult & { intent: FrostIntent }> {
  let intent: FrostIntent;
  let result: AgentResult;
  let routeTrace: string[];

  // ① 明确指令：switch-handler 能匹配就走它（不花大脑）
  const fast = runSwitchHandler(ctx);
  if (fast.data.matched) {
    intent = 'switch';
    result = fast;
    routeTrace = ['Router → 指令手（规则秒回，未动用大脑）'];
  } else {
    // ①bis 端侧意图预分类：Qwen/MNN 粗分挡在云路由前，命中合法意图就秒回、不动云脑。
    // 端侧 classify 走带兜底 + 健康追踪的契约入口(edgeSafe)：永不抛错、失败返回 ''、自动记 edge.classify health
    const edgeIntent = EDGE_FIRST ? await edgeSafe.classify(ctx.userText || '', EDGE_INTENTS as string[]) : '';
    if (edgeIntent && (EDGE_INTENTS as string[]).includes(edgeIntent)) {
      intent = edgeIntent as FrostIntent;
      result = await dispatch(intent, ctx);
      routeTrace = [`Router·端侧预分类 → 意图: ${intent}（端侧挑，未动用云脑）`];
    } else if (isPrivacySensitiveInput(ctx.userText || '')) {
      // 隐私护栏：端侧 Qwen 没处理成功时直接用本地规则，不把原文静默发送给云端。
      intent = routeRegex(ctx.userText || '');
      result = await dispatch(intent, ctx);
      routeTrace = [`Router·隐私保护 → 本地规则意图: ${intent}（端侧未就绪，未上传云端）`];
    } else {
      // ② 云脑路由（端侧未就绪 / 没把握时的长尾）
      const lr = await llmRoute(ctx);
      recordHealth('route.cloud', !!lr, lr ? undefined : '云脑不可用');
      if (lr) {
        intent = lr.intent;
        result = await dispatch(intent, ctx, lr.city);
        routeTrace = [
          `Router·Qwen 云端 → 意图: ${intent}${lr.city ? ' · ' + lr.city : ''}`,
          lr.reason ? `判断: ${lr.reason}` : '已读懂用户意图并委派',
        ];
      } else {
        // ③ 大脑不可用 → 规则兜底
        intent = routeRegex(ctx.userText || '');
        result = await dispatch(intent, ctx);
        routeTrace = [`Router·规则兜底 → 意图: ${intent}（大脑未接入）`];
      }
    }
  }

  // Boundary：只放行合法动作
  const { valid } = validateActions(result.radioActions);
  // 把路由痕迹拼到 Skill 处理器的执行记录前面；只展示可验证事件，不展示隐藏思维过程。
  const trace = [...routeTrace, ...(result.trace || [])];
  return { ...result, radioActions: valid, trace, intent };
}
