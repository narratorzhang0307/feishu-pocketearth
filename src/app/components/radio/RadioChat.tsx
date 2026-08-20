// 电台对话区 —— 音乐界面与播客界面共用：方块 frost 头像 + 打字机气泡 + 输入框。
// 像素风（黑底 + #00ff88），与项目地图标记 / 播放条一致。状态由父级持有透传，本组件只呈现 + 自动滚动。
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export type ChatMsg = { role: 'dj' | 'user'; text: string; auto?: boolean }; // auto：开场白/解说（播客对话框里不显示）

// 方块 frost 头像（呼应地图绿色标记）
export function FrostAvatar() {
  return (
    <div className="w-7 h-7 shrink-0 bg-black flex items-center justify-center border-2 border-[#00ff88]/60 shadow-[1px_1px_0_#00ff88]">
      <div className="w-2.5 h-2.5 bg-[#00ff88]" />
    </div>
  );
}

// 打字机：逐字蹦出（中文 ~45ms/字）。进度存 ref，只有文本真变了才从头开始。
// progress 有值（0..1）= 字幕跟随声音（按声音进度逐字、单调不回退）；undefined = 自走（固定速度）。
function Typewriter({ text, speed = 45, onTick, progress }: { text: string; speed?: number; onTick?: () => void; progress?: number }) {
  const [, force] = useState(0);
  const countRef = useRef(0);
  const textRef = useRef<string | null>(null);
  useEffect(() => {
    if (textRef.current !== text) { textRef.current = text; countRef.current = 0; force((x) => x + 1); }
    if (!text) return;
    if (typeof progress === 'number') {
      const target = Math.min(text.length, Math.floor(progress * text.length));
      if (target !== countRef.current) { countRef.current = target; force((x) => x + 1); onTick?.(); }
      return;
    }
    const id = setInterval(() => {
      if (countRef.current >= text.length) { clearInterval(id); return; }
      countRef.current += 1;
      force((x) => x + 1);
      onTick?.();
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, progress]);
  const n = Math.min(countRef.current, text.length);
  return (<>{text.slice(0, n)}{n < text.length && <span className="text-[#00ff88] animate-pulse">▌</span>}</>);
}

interface RadioChatProps {
  chat: ChatMsg[];
  chatInput: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  className?: string;
  busy?: boolean;   // 云端 Qwen 往返中：显示「FROST 正在想…」，免全屏电台里静止数秒像卡死
  // 字幕跟随：某条 frost 气泡正被声音播报时，把它的打字进度交给声音驱动
  voiceSync?: { text: string; progress: number } | null;
}

export function RadioChat({ chat, chatInput, onInputChange, onSend, className = '', voiceSync, busy }: RadioChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const followToBottom = () => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  useEffect(() => { stickRef.current = true; chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-2.5 py-2 pr-1">
        {chat.map((m, i) => m.role === 'dj' ? (
          <div key={i} className="flex gap-2 items-start">
            <FrostAvatar />
            <div className="flex-1 min-w-0">
              <div className="font-pixel text-[7px] tracking-[0.2em] text-[#00ff88]/70 uppercase mb-1">FROST</div>
              <div className="bg-white/[0.05] border border-[#00ff88]/20 px-2.5 py-1.5">
                <div className="text-[11px] leading-relaxed text-white/90 whitespace-pre-wrap"><Typewriter text={m.text} progress={voiceSync && voiceSync.text === m.text ? voiceSync.progress : undefined} onTick={followToBottom} /></div>
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="flex gap-2 items-start justify-end">
            <div className="flex flex-col items-end max-w-[72%]">
              <div className="bg-[#00ff88]/15 border border-[#00ff88]/25 px-2.5 py-1.5">
                <div className="text-[11px] leading-relaxed text-white/90">{m.text}</div>
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 items-start">
            <FrostAvatar />
            <span className="text-[11px] text-[#00ff88]/60 animate-pulse self-center">FROST 正在想…</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="flex gap-2 items-center w-full shrink-0" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input type="text" enterKeyHint="send" autoComplete="off" value={chatInput} onChange={(e) => onInputChange(e.target.value)} placeholder="对 frost 说点什么…" className="flex-1 h-9 bg-white/[0.06] border border-[#00ff88]/25 text-[11px] tracking-wide placeholder:opacity-30 text-white px-3 outline-none focus:bg-white/[0.1] focus:border-[#00ff88]/50 transition-colors min-w-0" />
        <button type="submit" disabled={!chatInput.trim()} className="w-9 h-9 flex items-center justify-center bg-[#00ff88] text-black border-2 border-[#00ff88] active:scale-95 transition-transform shrink-0 disabled:opacity-30" aria-label="send"><ArrowUp size={14} strokeWidth={3} /></button>
      </form>
    </div>
  );
}
