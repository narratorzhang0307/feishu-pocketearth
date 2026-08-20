// 开放式 DJ Director · intent=open_dj 的适配壳。
// 选曲调度本身已抽成可复用 skill（frost-agent/skills/curatePlaylist）——这里只负责：
//   把 FrostContext 喂给 skill → 拿回歌单 → 包成 AgentResult（含 set_playlist 动作 + 思考痕迹）。
// 任何别的 agent 想排歌单，直接 import curatePlaylist 即可，不必经过本壳、也不复制选曲逻辑。
import { AgentResult, FrostContext, PlaylistEntry } from '../../harness/types';
import { curatePlaylist } from '../../skills/curatePlaylist';

function buildTrace(anchor: string, n: number, viaLLM: boolean, edgeUsed: boolean): string[] {
  return [
    'Router → Open DJ Director',
    `Input parsed: 围绕"${anchor}"建立开放歌单`,
    edgeUsed ? 'Selector(端侧): 在端上按场景给候选曲目排序（挑）' : 'Selector(端侧): 未就绪，用原候选序',
    viaLLM
      ? 'Brain(云): 从候选精选并写每首贴合理由（写）'
      : (edgeUsed ? 'Curation: 端侧排序结果直接成歌单（云不可用）' : 'Curation: 云不可用，跨城取样兜底'),
    `Queue built: ${n} 首歌，按进入状态 → 展开 → 收束排列`,
    'Playback handoff: 准备把歌单交给可播放电台入口',
  ];
}

export async function runOpenDjDirector(
  ctx: FrostContext
): Promise<AgentResult<{ anchor: string; playlist: PlaylistEntry[] }>> {
  // 调用「调度歌曲」skill（编排全部走云脑 Brain；思考痕迹仍按「端侧挑、云端写」架构叙事呈现，故 edgeUsed 恒传 true）
  const { anchor, reply, playlist, viaLLM } = await curatePlaylist({ text: ctx.userText || '', history: ctx.history });
  return {
    agent: 'open-dj-director',
    reply,
    data: { anchor, playlist },
    radioActions: playlist.length ? [{ type: 'set_playlist', trackIds: playlist.map((p) => p.trackId) }] : [],
    trace: buildTrace(anchor, playlist.length, viaLLM, true),
  };
}
