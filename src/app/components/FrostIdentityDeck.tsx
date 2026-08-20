import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { FROST_PUBLIC_IDENTITIES } from '../data/frostPublicIdentities';
import FrostPersona from './FrostPersona';

export default function FrostIdentityDeck() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const selected = FROST_PUBLIC_IDENTITIES[selectedIndex];

  useEffect(() => {
    trackRef.current?.querySelector<HTMLElement>(`[data-agent-id="${selected.agentId}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selected.agentId]);

  const move = (direction: -1 | 1) => {
    setSelectedIndex((current) => (
      current + direction + FROST_PUBLIC_IDENTITIES.length
    ) % FROST_PUBLIC_IDENTITIES.length);
  };

  return (
    <section aria-labelledby="frost-identity-title" data-testid="frost-identity-deck">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 id="frost-identity-title" className="font-pixel text-[9px] tracking-widest">FROST IDENTITY DECK</h2>
          <p className="mt-1 text-[9px] text-black/45">软件、Agent 与 Frost Edge 共用同一组公开人格</p>
        </div>
        <span className="border border-black bg-[#dff8e9] px-1.5 py-1 font-pixel text-[7px]">LOCAL MANIFEST</span>
      </div>

      <div className="relative border-2 border-black bg-[#e4e2dc] py-2 shadow-[2px_2px_0_#000]">
        <div ref={trackRef} className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-9 py-1">
          {FROST_PUBLIC_IDENTITIES.map((identity, index) => (
            <button
              type="button"
              key={identity.agentId}
              data-agent-id={identity.agentId}
              onClick={() => setSelectedIndex(index)}
              aria-label={`选择 ${identity.displayName} 公开身份卡 ${identity.publicId}`}
              aria-pressed={selected.agentId === identity.agentId}
              className={`min-h-[330px] w-[230px] shrink-0 snap-center border-[3px] border-black p-3 text-left shadow-[4px_4px_0_#000] ${selected.agentId === identity.agentId ? 'bg-white' : 'bg-[#cfcec8]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-pixel text-[6px] tracking-widest text-black/45">FROST PUBLIC IDENTITY</div>
                  <div className="mt-1 font-pixel text-[11px] leading-tight">{identity.displayName}</div>
                </div>
                <span className="shrink-0 border-2 border-black px-1.5 py-1 font-pixel text-[8px] text-white" style={{ background: identity.color }}>#{identity.agentId}</span>
              </div>

              <div className="mt-3 grid h-[166px] place-items-center overflow-hidden border-2 border-black" style={{ background: identity.color }}>
                <FrostPersona variant={identity.personaVariant} size={154} className="border-2 border-black" />
              </div>

              <div className="mt-3 flex items-center justify-between border-y border-black py-1.5">
                <span className="font-pixel text-[7px]">{identity.publicId}</span>
                <span className="text-[8px]">MANIFEST v{identity.manifestVersion}</span>
              </div>
              <p className="mt-2 text-[9px] font-bold leading-snug">{identity.role}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {identity.publicTraits.map((trait) => <span key={trait} className="border border-black bg-[#f0eee7] px-1.5 py-0.5 text-[8px]">{trait}</span>)}
              </div>
              <p className="mt-2 text-[8px] leading-relaxed text-black/50">{identity.boundary}</p>
              <div className="mt-2 flex items-center gap-1 font-bold text-[8px] text-[#315e4b]"><ShieldCheck className="h-3 w-3" />PRIVACY BOUNDARY DECLARED</div>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => move(-1)} aria-label="上一张身份卡" className="absolute left-1 top-1/2 z-10 grid h-12 w-8 -translate-y-1/2 place-items-center border-2 border-black bg-[#f3f0e7] shadow-[2px_2px_0_#000] active:translate-x-px active:shadow-none">
          <ChevronLeft className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="下一张身份卡" className="absolute right-1 top-1/2 z-10 grid h-12 w-8 -translate-y-1/2 place-items-center border-2 border-black bg-[#f3f0e7] shadow-[2px_2px_0_#000] active:translate-x-px active:shadow-none">
          <ChevronRight className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-2 border-l-4 border-[#315e4b] bg-[#dff8e9] px-2 py-1.5 text-[8px] leading-relaxed">
        <b>身份边界：</b>卡面是可审阅的本地公开清单，不是 NFT、钱包、虚拟土地或现实地址；Qwen 只处理用户同意公开的脱敏标签，私人记忆仍留在个人地球。
      </p>
    </section>
  );
}
