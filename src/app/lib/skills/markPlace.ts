// 可复用 Skill（app 层）· 钉地球 / 落点（mark_place）
// 把「把一个对象钉到地球」的统一机制抽成一个 skill：校验坐标 → 去重(同 id 不重钉) → spreadCoord 抖散 → 写 userMarks。
// 这是 ARCHITECTURE §6.2「统一动作 mark_place」的唯一实现，所有 agent（movie/book/photo-外）+ 主 frost-agent
// + 造物主引擎都 `import { markPlace }` 复用，不再各自抄一遍落点逻辑。
//
// 关注点分离：本 skill 只管「落点 How」（机制）；领域专属的「拼 meta / 喂长期画像 recordSignals / 落本地索引」
// 留在各 agent（Who/What/Where）。依赖倒置：调用方依赖下面的契约（输入/输出类型），换内部实现不影响调用方。
//
// 放 src/app/lib/skills/（app 层）而非 frost-agent/skills/（内核层）——因为它依赖 userMarks / MarkerKind 这些 app 数据，
// 内核不可反向依赖 app。内核层 skill（只依赖 harness）见 frost-agent/skills/（如 curatePlaylist）。
import { addUserMark, getUserMarksByKind, removeUserMark, spreadCoord } from '../../data/userMarks';
import type { MarkerKind } from '../../data/mapMarkers';

export interface MarkPlaceInput {
  kind: MarkerKind;
  prefix: string;                          // userMarks id 前缀，如 'umv-' / 'ubk-' / 'uca-'
  key: string;                             // 对象主键（不含前缀），如归一片名
  label: string;
  geo: { lat: number; lng: number } | null;
  meta?: Record<string, unknown>;          // 全标签（地球详情卡读它）
  amp?: number;                            // 同城抖散幅度（默认 1.4；密集落点用更小如 0.5）
}
export interface MarkPlaceResult { pinned: boolean; reason?: 'needPlace' | 'exists' }

/** 某对象是否已钉（按 prefix+key 主键判，避免重复落点）。 */
export function isPinned(kind: MarkerKind, prefix: string, key: string): boolean {
  const want = prefix + key;
  return getUserMarksByKind(kind).some((m) => m.id === want);
}

/** 钉到地球：无坐标→needPlace（不钉）；已存在→exists（不重钉）；否则抖散后写 userMarks。 */
export function markPlace(input: MarkPlaceInput): MarkPlaceResult {
  if (!input.geo) return { pinned: false, reason: 'needPlace' };
  if (isPinned(input.kind, input.prefix, input.key)) return { pinned: true, reason: 'exists' };
  const id = input.prefix + input.key;
  const [lng, lat] = spreadCoord(id, input.geo.lng, input.geo.lat, input.amp ?? 1.4);
  addUserMark({ id, kind: input.kind, lng, lat, label: input.label, meta: input.meta });
  return { pinned: true };
}

/** 撤销落点。 */
export function unmarkPlace(kind: MarkerKind, prefix: string, key: string): void {
  void kind;
  removeUserMark(prefix + key);
}
