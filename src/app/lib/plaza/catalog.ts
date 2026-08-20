import type { SpaceAgent } from './spaceAgent';

/** Reviewed declarative catalog. Items never contain executable remote code. */
export const SPACE_AGENTS: SpaceAgent[] = [
  {
    id: 'museum-bridge', name: '看展搭子', tagline: '端侧读展签，授权后生成双语策展手记与文化桥', publisher: 'Pocket Earth', emoji: '🏛', color: '#7c5cff',
    spaceObject: 'exhibition', permissions: { scopes: ['photos', 'location', 'network'], tools: ['edge_tag', 'enrich', 'geocode', 'mark_place'] },
    runtime: 'hybrid', modelPlane: 'qwen-hybrid', group: 'featured', reviewed: true, runTarget: 'exhibition-agent',
  },
  {
    id: 'birding-map', name: '观鸟地图', tagline: '拍鸟照本机预分类，确认后钉到观测坐标', publisher: 'Pocket Earth', emoji: '🐦', color: '#2e8b57',
    spaceObject: 'sighting', permissions: { scopes: ['location', 'photos'], tools: ['edge_tag', 'geocode', 'mark_place'] },
    runtime: 'edge', modelPlane: 'qwen-mnn', group: 'featured', reviewed: true,
  },
  {
    id: 'travel-planner', name: '旅行规划', tagline: '按长期口味规划路线，用户确认后才钉地球', publisher: 'Pocket Earth', emoji: '🗺', color: '#3a6ea5',
    spaceObject: 'route', permissions: { scopes: ['location', 'network'], tools: ['enrich', 'geocode', 'mark_place'] },
    runtime: 'edge', modelPlane: 'qwen-mnn', group: 'featured', reviewed: true, runTarget: 'travel-skill',
  },
  {
    id: 'cafe-map', name: '咖啡地图', tagline: '把喝过的咖啡馆钉到它的门牌', publisher: 'Pocket Earth', emoji: '☕', color: '#8a5a2b',
    spaceObject: 'place', permissions: { scopes: ['location'], tools: ['enrich', 'geocode', 'mark_place'] },
    runtime: 'hybrid', modelPlane: 'qwen-hybrid', group: 'featured', reviewed: true,
  },
  {
    id: 'street-art', name: '街头涂鸦', tagline: '端侧整理拍到的涂鸦，确认后钉到这面墙', publisher: '@walls', emoji: '🎨', color: '#c0398a',
    spaceObject: 'sighting', permissions: { scopes: ['location', 'photos'], tools: ['edge_tag', 'geocode', 'mark_place'] },
    runtime: 'edge', modelPlane: 'qwen-mnn', group: 'featured', reviewed: true,
  },
  {
    id: 'music', name: '音乐', tagline: '把音乐钉到歌手出身地或歌曲城市', publisher: 'Pocket Earth', emoji: '🎵', color: '#00c46a',
    spaceObject: 'place', permissions: { scopes: ['network'], tools: ['enrich', 'geocode', 'mark_place'] },
    runtime: 'hybrid', modelPlane: 'qwen-hybrid', group: 'installed', reviewed: true, runTarget: 'music-agent',
  },
  {
    id: 'movies', name: '电影', tagline: '把电影钉到取景地或故事地', publisher: 'Pocket Earth', emoji: '🎬', color: '#e0a02a',
    spaceObject: 'place', permissions: { scopes: ['network'], tools: ['enrich', 'geocode', 'mark_place'] },
    runtime: 'hybrid', modelPlane: 'qwen-hybrid', group: 'installed', reviewed: true, runTarget: 'movies-agent',
  },
  {
    id: 'books', name: '读书', tagline: '把书钉到故事地或作者地', publisher: 'Pocket Earth', emoji: '📖', color: '#b388ff',
    spaceObject: 'place', permissions: { scopes: ['network'], tools: ['enrich', 'geocode', 'mark_place'] },
    runtime: 'hybrid', modelPlane: 'qwen-hybrid', group: 'installed', reviewed: true, runTarget: 'books-agent',
  },
];
