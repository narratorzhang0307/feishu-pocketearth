import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import MusicLibraryView from './MusicLibraryView';
import MusicAgentRunPage from './MusicAgentRunPage';
import { useFrostTaskHandoff } from './FrostTaskHandoffFrame';

// music-agent 容器：顶部两个 tab —— 左「曲库」(全部歌曲条目，可按地域/城市/歌手/流派归类)，
// 右「对话」(原电台 / 音乐 agent 对话框，行为完全保留)。两个 tab 都常驻挂载，切换不丢对话与播放状态。

interface Props { onBack: () => void }
type Tab = 'library' | 'chat';

export default function MusicAgentPage({ onBack }: Props) {
  const handoffObjective = useFrostTaskHandoff()?.objective || '';
  const [tab, setTab] = useState<Tab>(handoffObjective ? 'chat' : 'library');

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] overflow-hidden">
      {/* 顶部：返回 + 标题 + 两 tab */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">MUSIC-SKILL</div>
          </div>
        </div>
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5">
          <button onClick={() => setTab('library')} className={`flex-1 py-1.5 text-[11px] font-bold ${tab === 'library' ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>曲库</button>
          <button onClick={() => setTab('chat')} className={`flex-1 py-1.5 text-[11px] font-bold ${tab === 'chat' ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>对话</button>
        </div>
      </div>

      {/* 两 tab 常驻挂载，靠显隐切换以保留各自状态 */}
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${tab === 'library' ? '' : 'hidden'}`}><MusicLibraryView /></div>
        <div className={`absolute inset-0 ${tab === 'chat' ? '' : 'hidden'}`}><MusicAgentRunPage onBack={onBack} embedded initialInput={handoffObjective} /></div>
      </div>
    </div>
  );
}
