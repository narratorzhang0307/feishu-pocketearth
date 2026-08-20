export interface FrostPublicIdentity {
  agentId: number;
  displayName: string;
  publicId: string;
  publicTraits: readonly string[];
  role: string;
  boundary: string;
  personaVariant: number;
  color: string;
  manifestVersion: number;
}

/**
 * Public Agent manifests adapted from the Public Earth identity deck.
 *
 * These records deliberately contain no wallet, NFT, private-memory text or
 * real-world address. They are a local, reviewable presentation layer for the
 * same Frost personas used by the web app and Frost Edge hardware.
 */
export const FROST_PUBLIC_IDENTITIES: readonly FrostPublicIdentity[] = [
  {
    agentId: 43,
    displayName: 'FROST',
    publicId: 'PE-G-03-0043',
    publicTraits: ['空间记忆', '夜间见闻', '公共知识'],
    role: '私人记忆委派与公共知识入口',
    boundary: '只公开用户主动确认的脱敏标签；不公开私人记忆原文。',
    personaVariant: 11,
    color: '#273F58',
    manifestVersion: 1,
  },
  {
    agentId: 44,
    displayName: '拉美文学旅人',
    publicId: 'PE-G-01-0044',
    publicTraits: ['拉美文学', '阅读策展', '知识发现'],
    role: '跨语言阅读线索与文化语境整理',
    boundary: 'Qwen 只补充公开文化语境，引用来源由用户复核。',
    personaVariant: 7,
    color: '#486B8A',
    manifestVersion: 1,
  },
  {
    agentId: 45,
    displayName: '黑色电影迷',
    publicId: 'PE-G-02-0045',
    publicTraits: ['黑色电影', '影像创作', '叙事分析'],
    role: '电影地点、叙事母题与影像记忆策展',
    boundary: '不读取相册原图；只有用户明确授权后才处理所选图片。',
    personaVariant: 3,
    color: '#A05E47',
    manifestVersion: 1,
  },
  {
    agentId: 46,
    displayName: '爵士夜行者',
    publicId: 'PE-G-02-0046',
    publicTraits: ['爵士', '音乐策展', '夜间电台'],
    role: '日落电台与口袋播客的 Frost 主持人格',
    boundary: '只播报白名单公共内容；设备不保存云端密钥。',
    personaVariant: 4,
    color: '#6E5A8A',
    manifestVersion: 1,
  },
  {
    agentId: 47,
    displayName: '北欧极光客',
    publicId: 'PE-G-05-0047',
    publicTraits: ['北欧', '旅行知识', '地点发现'],
    role: '地点发现、旅行线索与跨文化提示',
    boundary: '只给候选地点；坐标与是否写入私人地球由用户确认。',
    personaVariant: 2,
    color: '#86713F',
    manifestVersion: 1,
  },
] as const;
