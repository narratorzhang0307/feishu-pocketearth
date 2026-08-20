import type { AgentTool, AgentManifest, GeoStrategy } from '../agent/manifest';

/** Every installable agent must name the spatial object it produces. */
export type SpaceObjectKind = 'sighting' | 'place' | 'route' | 'event' | 'media' | 'knowledge' | 'exhibition';
export const SPACE_OBJECT_LABEL: Record<SpaceObjectKind, string> = {
  sighting: '观测点',
  place: '地点',
  route: '路线',
  event: '事件',
  media: '媒介落点',
  knowledge: '知识版次',
  exhibition: '展览记忆',
};

/** Human-readable data scopes, separate from the executable tool allowlist. */
export type DataScope = 'location' | 'photos' | 'audio' | 'network' | 'clipboard' | 'public-sources';
export const SCOPE_LABEL: Record<DataScope, string> = {
  location: '位置',
  photos: '相册',
  audio: '音频',
  network: '联网',
  clipboard: '剪贴板',
  'public-sources': '公开来源',
};

export type Runtime = 'edge' | 'cloud' | 'hybrid';
export const RUNTIME_LABEL: Record<Runtime, string> = { edge: '端侧', cloud: '云端', hybrid: '端+云' };

/** Model technology is declared as a capability boundary, never as an identity credential. */
export type ModelPlane = 'qwen-mnn' | 'qwen-cloud' | 'qwen-hybrid' | 'local-only';
export const MODEL_PLANE_LABEL: Record<ModelPlane, string> = {
  'qwen-mnn': 'Qwen + MNN',
  'qwen-cloud': 'Qwen 云端',
  'qwen-hybrid': 'Qwen 端云混合',
  'local-only': '本地规则',
};

export interface SpaceAgent {
  id: string;
  name: string;
  tagline: string;
  publisher: string;
  emoji: string;
  color: string;
  spaceObject: SpaceObjectKind;
  permissions: { scopes: DataScope[]; tools: AgentTool[] };
  runtime: Runtime;
  modelPlane: ModelPlane;
  group: 'installed' | 'featured';
  reviewed: boolean;
  runTarget?: string;
}

const GEO_BY_OBJECT: Record<SpaceObjectKind, GeoStrategy[]> = {
  sighting: ['visited'],
  place: ['origin', 'story'],
  route: ['visited'],
  event: ['story'],
  media: ['story', 'made'],
  knowledge: ['manual'],
  exhibition: ['visited', 'story'],
};

/** Install only a declarative manifest; no remote code or generated JavaScript is loaded. */
export function toManifest(agent: SpaceAgent): Partial<AgentManifest> {
  return {
    name: agent.name.slice(0, 20),
    emoji: agent.emoji,
    domain: SPACE_OBJECT_LABEL[agent.spaceObject].slice(0, 12),
    desc: agent.tagline.slice(0, 40),
    keywords: [agent.name, SPACE_OBJECT_LABEL[agent.spaceObject]].map((item) => item.slice(0, 12)),
    geoStrategy: GEO_BY_OBJECT[agent.spaceObject],
    tagFields: ['类型', '位置'],
    tools: agent.permissions.tools,
    cardStyle: 'generic',
    color: agent.color,
    persona: '空间 agent · 把对象钉回个人地球',
  };
}
