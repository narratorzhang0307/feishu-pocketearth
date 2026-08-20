// 自定义 agent 工厂 · 契约层（声明式 Agent Manifest）+ 安全审查闸。
//
// 解耦铁律（务必保持）：
//   1. 本模块（含整个 lib/agent/）自包含，绝不碰 FROST 内核封闭枚举(FrostIntent/RadioAction/ProfileDomain)，
//      也不碰 lib/{movie,book,photo,...} 任何其它 agent 的内部。
//   2. 只产出受 schema 约束的【声明式 manifest】，由通用引擎(engine.ts)解释执行——
//      绝不生成、绝不执行任何代码（小端侧模型写不对代码、消费 app 红线）。安全性等价于既有 skillForge。
//   3. 落点统一经共享总线 userMarks（kind:'custom'），地球只认识「custom」这一类，永不学习具体自定义 agent。
//
// 下面三张词表是本模块【自己的】封闭枚举，与内核无关，扩展只改这里。

/** 落点策略：决定钉到地球哪里（按优先级取第一个能解析出坐标的）。 */
export const GEO_STRATEGIES = ['origin', 'story', 'made', 'visited', 'country', 'manual'] as const;
export type GeoStrategy = (typeof GEO_STRATEGIES)[number];
export const GEO_LABEL: Record<GeoStrategy, string> = {
  origin: '出身/产地', story: '故事/发生地', made: '制造/创作地', visited: '打卡/到访地', country: '国家', manual: '手动指定',
};

/** 工具白名单：自定义 agent 只能从这几个真实能力里选（最小权限 = 物理边界）。 */
export const ALLOWED_TOOLS = ['enrich', 'geocode', 'edge_tag', 'mark_place'] as const;
export type AgentTool = (typeof ALLOWED_TOOLS)[number];
export const TOOL_LABEL: Record<AgentTool, string> = {
  enrich: '云脑补全信息', geocode: '地名转坐标', edge_tag: '端侧打标', mark_place: '钉到地球',
};

/** 卡片样式：复用已有视觉，不为每个自定义 agent 写新 UI。 */
export const CARD_STYLES = ['ticket', 'plate', 'polaroid', 'generic'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export interface AgentManifest {
  id: string;            // 安装时生成，kebab
  name: string;          // 显示名 ≤20
  emoji: string;         // 单个 emoji 图标
  domain: string;        // 整理对象，如 '咖啡馆' '球鞋' '鸟类'
  desc: string;          // 一句话说明 ≤40
  keywords: string[];    // 触发词 1–8，每个 ≤12
  geoStrategy: GeoStrategy[];   // 落点策略优先级，非空子集
  tagFields: string[];   // 要打的标签字段 1–8，如 ['产地','烘焙度','打卡城市']
  tools: AgentTool[];    // 工具白名单子集（含 mark_place 才能钉）
  cardStyle: CardStyle;
  color: string;         // 落点/卡片主色（#rrggbb）
  persona: string;       // 卡片口吻 ≤40
  createdAt: string;     // ISO
}

export interface ManifestReview { ok: boolean; reasons: string[] }

const HEX = /^#[0-9a-fA-F]{6}$/;
// 安全扫描：任一疑似代码 / 外链 / 模板注入都拒（与 skillForge 同款，声明式不执行代码）。
const DANGER = /<script|<\/|function\s*\(|=>|\beval\b|\brequire\(|\bimport\b|process\.|child_process|\bfetch\(|https?:\/\/|`|\$\{/i;
const ALLOWED_KEYS = ['id', 'name', 'emoji', 'domain', 'desc', 'keywords', 'geoStrategy', 'tagFields', 'tools', 'cardStyle', 'color', 'persona', 'createdAt'];

const isStrArr = (v: unknown, max: number, eachLen: number): v is string[] =>
  Array.isArray(v) && v.length >= 1 && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= eachLen && x.length > 0);

/** 安全审查闸：manifest 必须通过这里才能安装。任何疑点都拒（默认不放行）。 */
export function reviewManifest(m: unknown): ManifestReview {
  const reasons: string[] = [];
  if (!m || typeof m !== 'object') return { ok: false, reasons: ['不是合法的 manifest 对象'] };
  const s = m as Record<string, unknown>;

  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 20) reasons.push('name 缺失或过长（≤20）');
  if (typeof s.domain !== 'string' || !s.domain.trim() || s.domain.length > 12) reasons.push('domain 缺失或过长（≤12）');
  if (typeof s.emoji !== 'string' || !s.emoji.trim() || [...s.emoji].length > 2) reasons.push('emoji 缺失或过长');
  if (typeof s.desc !== 'string' || s.desc.length > 40) reasons.push('desc 过长（≤40）');
  if (typeof s.persona !== 'string' || s.persona.length > 40) reasons.push('persona 过长（≤40）');
  if (!isStrArr(s.keywords, 8, 12)) reasons.push('keywords 需 1–8 个、每个 ≤12');
  if (!isStrArr(s.tagFields, 8, 10)) reasons.push('tagFields 需 1–8 个、每个 ≤10');
  if (typeof s.color !== 'string' || !HEX.test(s.color)) reasons.push('color 需 #rrggbb');
  if (typeof s.cardStyle !== 'string' || !(CARD_STYLES as readonly string[]).includes(s.cardStyle)) reasons.push(`cardStyle 需取：${CARD_STYLES.join(' / ')}`);
  if (!Array.isArray(s.geoStrategy) || !s.geoStrategy.length || !s.geoStrategy.every((g) => (GEO_STRATEGIES as readonly string[]).includes(g as string)))
    reasons.push(`geoStrategy 需为非空子集：${GEO_STRATEGIES.join(' / ')}`);
  if (!Array.isArray(s.tools) || !s.tools.length || !s.tools.every((t) => (ALLOWED_TOOLS as readonly string[]).includes(t as string)))
    reasons.push(`tools 需为白名单子集：${ALLOWED_TOOLS.join(' / ')}`);

  // 字段白名单：多一个未知字段就拒（防夹带）。
  for (const k of Object.keys(s)) if (!ALLOWED_KEYS.includes(k)) reasons.push(`含未知字段「${k}」`);
  // 代码 / 外链扫描。
  if (DANGER.test(JSON.stringify(s))) reasons.push('检测到疑似代码 / 外链，拒绝（manifest 只能是声明式，不执行任何代码）');

  return { ok: reasons.length === 0, reasons };
}
