import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import AgentChat, { type AgentChatConfig } from './AgentChat';

// 通用 agent 容器：顶部两 tab —— 左「数据层」(领域名录/记录) + 右「对话层」(领域 agent 对话)。
// 与 music-agent 同构；两 tab 常驻挂载，切换不丢状态。

interface Props {
  onBack: () => void;
  title: string;
  leftLabel: string;
  rightLabel: string;
  left: ReactNode;            // 数据层（嵌入式 run page）
  chat: AgentChatConfig;      // 对话层配置
}

export default function AgentTabsPage({ onBack, title, leftLabel, rightLabel, left, chat }: Props) {
  const [tab, setTab] = useState<'data' | 'chat'>('data');
  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] overflow-hidden">
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-pixel text-[11px] tracking-wider truncate">{title}</div>
          </div>
        </div>
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5">
          <button onClick={() => setTab('data')} className={`flex-1 py-1.5 text-[11px] font-bold ${tab === 'data' ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{leftLabel}</button>
          <button onClick={() => setTab('chat')} className={`flex-1 py-1.5 text-[11px] font-bold ${tab === 'chat' ? 'bg-black text-[#7CFF6B]' : 'text-black hover:bg-black/5'}`}>{rightLabel}</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${tab === 'data' ? '' : 'hidden'}`}>{left}</div>
        <div className={`absolute inset-0 ${tab === 'chat' ? '' : 'hidden'}`}><AgentChat config={chat} /></div>
      </div>
    </div>
  );
}
