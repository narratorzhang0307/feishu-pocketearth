import { useEffect, useState, type ReactNode } from 'react';
import { Workflow, X } from 'lucide-react';
import { clearTaskHandoff, peekTaskHandoff, type FrostTaskHandoff } from '../../../frost-agent/harness/taskHandoff';

interface Props { target: string; children: ReactNode }

/**
 * Frost 与具体 Skill 页之间的可见交接契约。
 * 只展示本机 sessionStorage 中、目标完全匹配的一条任务；读取后即从临时队列移除，
 * 页面内副作用仍由各 Skill 自己的确认门负责。
 */
export default function FrostTaskHandoffFrame({ target, children }: Props) {
  const [handoff, setHandoff] = useState<FrostTaskHandoff | null>(() => peekTaskHandoff(target));
  useEffect(() => { if (handoff) clearTaskHandoff(); }, [handoff]);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {handoff && (
        <aside className="shrink-0 border-b-2 border-black bg-[#e8f5ee] px-3 py-2" aria-label="Frost 任务交接">
          <div className="flex items-start gap-2">
            <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-[#20745a]" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[7px] tracking-wider text-[#145d47]">FROST HANDOFF · 已交给当前 SKILL</div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-black/65">{handoff.objective}</p>
            </div>
            <button type="button" onClick={() => setHandoff(null)} aria-label="关闭 Frost 任务交接" className="grid h-6 w-6 shrink-0 place-items-center border border-black bg-white active:translate-y-px"><X className="h-3 w-3" strokeWidth={2.5} /></button>
          </div>
        </aside>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
