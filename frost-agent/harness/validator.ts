// Frost Harness · Boundary（动作校验器）
// 内部 Skill 处理器只「建议」动作，必须过这道校验才会落地。
// v2：从「硬编码 VALID_TYPES + 写死的 if 分支」改为【按动作类型注册校验器】的注册表，
// ordered dispatch、统一返回 { ok, reason }。以后新增一类对象/动作 = 注册一个校验器，
// 内核 validateActions 不用改（对应 skill-registry 化的第一步）。
import { RADIO_CITIES } from './domain';
import { RadioAction } from './types';

/** 单个动作的校验器：合法返回 {ok:true}，否则给出原因。 */
export type ActionValidator = (action: { type: string; [k: string]: unknown }) => { ok: boolean; reason?: string };

const validators: Record<string, ActionValidator> = {};

/** 注册 / 覆盖某动作类型的校验器（新 skill 接入时调用）。 */
export function registerActionValidator(type: string, fn: ActionValidator): void {
  validators[type] = fn;
}

// ——— 内置：电台(radio) 这套 skill 自带的动作校验器 ———
const ok: ActionValidator = () => ({ ok: true });
registerActionValidator('play', ok);
registerActionValidator('pause', ok);
registerActionValidator('next_track', ok);
registerActionValidator('prev_track', ok);
registerActionValidator('switch_city', (a) => {
  const slug = a.slug as string;
  return RADIO_CITIES.some((c) => c.slug === slug) ? { ok: true } : { ok: false, reason: `资源库无此城市: ${slug}` };
});
registerActionValidator('set_playlist', (a) => {
  const ids = a.trackIds as unknown[] | undefined;
  return ids && ids.length ? { ok: true } : { ok: false, reason: '空歌单' };
});

export interface ValidationResult {
  valid: RadioAction[];
  rejected: { action: RadioAction; reason: string }[];
}

/** 逐个动作走注册表校验；未注册的类型一律拒绝（最小权限）。签名不变，router 无感。 */
export function validateActions(actions: RadioAction[]): ValidationResult {
  const valid: RadioAction[] = [];
  const rejected: { action: RadioAction; reason: string }[] = [];
  for (const a of actions || []) {
    const v = validators[a.type];
    if (!v) { rejected.push({ action: a, reason: '未知动作类型' }); continue; }
    const r = v(a as { type: string; [k: string]: unknown });
    if (r.ok) valid.push(a);
    else rejected.push({ action: a, reason: r.reason || '校验未通过' });
  }
  return { valid, rejected };
}
