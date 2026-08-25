export type SkillPublisher = {
  name: string;
  role: string;
  avatar: string;
};

export const SKILL_PUBLISHERS: Record<string, SkillPublisher> = {
  'pocket.earth-answer': { name: '鹿小灯', role: '清晨行动员', avatar: '/assets/animal-agent-avatars/animal-001-r01-c01.png' },
  'pocket.music': { name: '熊北北', role: '城市声音员', avatar: '/assets/animal-agent-avatars/animal-001-r01-c02.png' },
  'pocket.books': { name: '鹤桃', role: '书页管理员', avatar: '/assets/animal-agent-avatars/animal-001-r01-c03.png' },
  'pocket.movies': { name: '咕咕', role: '影像放映员', avatar: '/assets/animal-agent-avatars/animal-001-r01-c04.png' },
  'pocket.photos': { name: '蓝尾', role: '照片整理员', avatar: '/assets/animal-agent-avatars/animal-001-r02-c01.png' },
  'pocket.reading-jot': { name: '灰耳', role: '阅读摘录员', avatar: '/assets/animal-agent-avatars/animal-001-r02-c01.png' },
  'pocket.council': { name: '火羽', role: '多视角议事员', avatar: '/assets/animal-agent-avatars/animal-001-r02-c02.png' },
  'pocket.travel': { name: '白耳', role: '散步路线员', avatar: '/assets/animal-agent-avatars/animal-001-r02-c03.png' },
  'pocket.exhibition': { name: '象慢慢', role: '展览档案员', avatar: '/assets/animal-agent-avatars/animal-001-r02-c04.png' },
  'pocket.book-to-earth': { name: '橘尾', role: '旧书寻路员', avatar: '/assets/animal-agent-avatars/animal-001-r03-c01.png' },
  'pocket.rubbing': { name: '斑斑', role: '碑拓修复员', avatar: '/assets/animal-agent-avatars/animal-001-r03-c02.png' },
  'pocket.skills-plaza': { name: '河马格', role: 'Skill 管理员', avatar: '/assets/animal-agent-avatars/animal-001-r03-c03.png' },
};

const AGENT_TO_PUBLISHER: Record<string, string> = {
  'earth-answer-agent': 'pocket.earth-answer',
  'music-agent': 'pocket.music',
  'books-agent': 'pocket.books',
  'movies-agent': 'pocket.movies',
  'photos-agent': 'pocket.photos',
  'jot-agent': 'pocket.reading-jot',
  'council-room': 'pocket.council',
  'travel-skill': 'pocket.travel',
  'exhibition-agent': 'pocket.exhibition',
  'agent-forge': 'pocket.book-to-earth',
  'heritage-restoration': 'pocket.rubbing',
  'agent-plaza': 'pocket.skills-plaza',
};

export const DEFAULT_SKILL_PUBLISHER = SKILL_PUBLISHERS['pocket.skills-plaza'];

export function skillPublisherForManifest(manifestId: string): SkillPublisher {
  return SKILL_PUBLISHERS[manifestId] || DEFAULT_SKILL_PUBLISHER;
}

export function skillPublisherForAgent(agentId: string): SkillPublisher {
  return skillPublisherForManifest(AGENT_TO_PUBLISHER[agentId] || 'pocket.skills-plaza');
}
