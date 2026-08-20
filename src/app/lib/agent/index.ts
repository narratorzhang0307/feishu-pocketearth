// 自定义 agent 工厂 · 公共出口（meta-agent：一个能造 agent 的 agent）。
// 完全解耦的独立模块：不碰 FROST 内核封闭枚举、不碰其它 agent；只产/跑【声明式 manifest】，
// 落点经共享 userMarks(kind:'custom')。详见各层文件头。
export type { AgentManifest, GeoStrategy, AgentTool, CardStyle, ManifestReview } from './manifest';
export {
  GEO_STRATEGIES, GEO_LABEL, ALLOWED_TOOLS, TOOL_LABEL, CARD_STYLES, reviewManifest,
} from './manifest';
export { proposeManifest } from './forge';
export {
  getCustomAgents, getCustomAgent, subscribeCustomAgents, installAgent, removeCustomAgent,
} from './registry';
export { runCustomAgent, runCustomAgentFromImage, type CustomDraft, type CustomGeo } from './engine';
export { confirmPin, alreadyPinned, unpin } from './pin';
// 多步自主研究流水线（「建图」挡）：规划→模型知识候选→反思→待核验落点草稿
export {
  populateMap, confirmMapRecords, loadProgress, clearProgress, geoStrategyLabel,
  type MapRecord, type MapDraft, type OnResearchPhase,
} from './research';
