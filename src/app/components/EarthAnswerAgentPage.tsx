import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Dices, Globe2, History, LockKeyhole } from 'lucide-react';
import earthAnswersPayload from '../../../hardware/frost-edge-google/raspi/earth_answers_365.json';

interface EarthAnswer {
  quote: string;
  author: string;
  source: string;
  book: string;
  date: string;
  theme: string;
}
interface Props {
  onBack: () => void;
}

const ANSWERS = earthAnswersPayload as EarthAnswer[];
const REVEAL_STORAGE_KEY = 'pe.earth-answer.revealed.v1';
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayStamp(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function monthDay(value: Date) {
  return dayStamp(value).slice(5);
}

function addDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

function readRevealedDates() {
  try {
    const payload = JSON.parse(localStorage.getItem(REVEAL_STORAGE_KEY) || '[]');
    return new Set<string>(Array.isArray(payload) ? payload.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function findAnswer(value: Date) {
  const key = monthDay(value);
  return ANSWERS.find((item) => item.date === key)
    ?? ANSWERS.find((item) => item.date === '02-28')
    ?? ANSWERS[0];
}

export default function EarthAnswerAgentPage({ onBack }: Props) {
  const [now, setNow] = useState(() => new Date());
  const today = useMemo(() => startOfDay(now), [now]);
  const todayKey = dayStamp(today);
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [revealed, setRevealed] = useState<Set<string>>(readRevealedDates);
  const [rolling, setRolling] = useState(false);
  const revealTimer = useRef<number>();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
  }, []);

  const selectedKey = dayStamp(selected);
  const selectedTime = selected.getTime();
  const todayTime = today.getTime();
  const editionStart = new Date(today.getFullYear(), 0, 1);
  const editionStartTime = editionStart.getTime();
  const future = selectedTime > todayTime;
  const past = selectedTime < todayTime;
  const unlocked = past || revealed.has(selectedKey);
  const answer = findAnswer(selected);
  const editionIndex = Math.max(1, ANSWERS.findIndex((item) => item.date === answer.date) + 1);
  const historyDays = Array.from({ length: 7 }, (_, index) => addDays(today, index - 5));

  const revealToday = () => {
    if (rolling || selectedKey !== todayKey || unlocked) return;
    setRolling(true);
    revealTimer.current = window.setTimeout(() => {
      setRevealed((current) => {
        const next = new Set(current).add(todayKey);
        localStorage.setItem(REVEAL_STORAGE_KEY, JSON.stringify([...next].sort()));
        return next;
      });
      setRolling(false);
    }, 900);
  };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[#EAEAEA] font-sans" data-testid="earth-answer-agent">
      <header className="flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5 shrink-0">
        <button type="button" onClick={onBack} aria-label="返回智能体列表" className="grid h-9 w-9 place-items-center border-2 border-black bg-white shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[11px] tracking-wider">EARTH-ANSWER</div>
          <div className="mt-0.5 text-[9px] text-black/45">地球答案 · 私人行动 Agent</div>
        </div>
        <Globe2 className="h-5 w-5 text-[#007b45]" strokeWidth={2.5} />
      </header>

      <div className="flex items-center justify-between border-b-2 border-black bg-black px-3 py-2 text-[#7CFF6B] shrink-0">
        <span className="font-pixel text-[8px] tracking-wider">365-DAY EDITION</span>
        <span className="font-pixel text-[7px] text-white/60">TOMORROW LOCKED</span>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        <section className="border-[3px] border-black bg-[#f7f2e7]" aria-label={`${answer.date} 地球答案`}>
          <div className="flex items-center justify-between border-b-2 border-black bg-[#121416] px-3 py-2 text-white">
            <span className="font-pixel text-[8px] tracking-[0.16em]">EARTH ANSWER</span>
            <span className="font-pixel text-[7px] text-[#7CFF6B]">{editionIndex}/365</span>
          </div>

          <div className="relative min-h-[430px] overflow-hidden p-4">
            <div className="absolute right-0 top-0 h-full w-2 bg-[#00ff88]" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
              <div className="pt-1">
                <div className="font-pixel text-[8px] tracking-widest text-black/50">{MONTHS[selected.getMonth()]} · {selected.getFullYear()}</div>
                <div className="mt-2 text-[13px] font-bold">{WEEKDAYS[selected.getDay()]}</div>
                <div className="mt-1 inline-flex items-center gap-1 border border-black bg-white px-1.5 py-1 font-pixel text-[7px]">
                  {future ? <LockKeyhole className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                  {future ? '尚未抵达' : past ? '往日可阅' : '今天'}
                </div>
              </div>
              <div className="font-serif text-[104px] leading-[0.82] tracking-[-0.08em] text-black">{selected.getDate()}</div>
            </div>

            {future ? (
              <div className="flex min-h-[255px] flex-col items-center justify-center text-center">
                <div className="grid h-20 w-20 place-items-center border-[3px] border-black bg-white shadow-[4px_4px_0_#2357d9]"><LockKeyhole className="h-8 w-8" strokeWidth={2.5} /></div>
                <h2 className="mt-6 text-[18px] font-bold">答案要等地球转到明天</h2>
                <p className="mt-2 text-[11px] text-black/50">每天 00:00，只揭晓当天这一页。</p>
              </div>
            ) : unlocked ? (
              <div className="flex min-h-[255px] flex-col pt-5">
                <div className="font-pixel text-[8px] tracking-widest text-[#007b45]">TODAY'S ACTION</div>
                <blockquote className="mt-4 font-serif text-[20px] font-semibold leading-[1.75] tracking-[0.02em] text-black">{answer.quote}</blockquote>
                <div className="mt-auto pt-6 text-center">
                  <div className="mx-auto mb-3 h-1 w-16 bg-[#00ff88]" />
                  <div className="text-[13px] font-bold">{answer.author}</div>
                  <div className="mt-1 text-[9px] leading-relaxed text-black/45">{answer.source}</div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[255px] flex-col items-center justify-center text-center">
                <button type="button" onClick={revealToday} disabled={rolling} className="group grid h-24 w-24 place-items-center border-[3px] border-black bg-white disabled:cursor-wait" aria-label="掷骰子揭晓今天的地球答案">
                  <Dices className={`h-10 w-10 ${rolling ? 'animate-spin text-[#2357d9]' : 'group-active:rotate-12'}`} strokeWidth={2.2} />
                </button>
                <h2 className="mt-6 text-[19px] font-bold">{rolling ? '地球正在回答' : '今天的答案尚未揭晓'}</h2>
                <p className="mt-2 text-[11px] text-black/50">{rolling ? '骰子落定后，今天这一页才会出现。' : '点一下骰子，完成今天唯一一次揭晓。'}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 border-t-2 border-black bg-white">
            <button type="button" onClick={() => setSelected((current) => addDays(current, -1))} disabled={selectedTime <= editionStartTime}
              className="flex min-h-11 items-center justify-center gap-1.5 border-r border-black px-2 font-pixel text-[7px] tracking-wide active:bg-[#f7f2e7] disabled:cursor-not-allowed disabled:text-black/25"
              aria-label="查看前一天的地球答案">
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={3} /> PREVIOUS DAY
            </button>
            <button type="button" onClick={() => setSelected((current) => addDays(current, 1))} disabled={selectedTime >= todayTime}
              className="flex min-h-11 items-center justify-center gap-1.5 px-2 font-pixel text-[7px] tracking-wide active:bg-[#f7f2e7] disabled:cursor-not-allowed disabled:text-black/25"
              aria-label="查看后一天的地球答案">
              NEXT DAY <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
          </div>
        </section>

        <section className="border-2 border-black bg-white p-2.5" aria-labelledby="earth-answer-history">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="earth-answer-history" className="inline-flex items-center gap-1.5 font-pixel text-[8px] tracking-widest"><History className="h-3.5 w-3.5" />往日答案</h2>
            {selectedKey !== todayKey && <button type="button" onClick={() => setSelected(today)} className="border border-black bg-[#EAEAEA] px-2 py-1 font-pixel text-[7px] active:translate-y-px">回到今天</button>}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {historyDays.map((date) => {
              const key = dayStamp(date);
              const beforeEdition = date.getTime() < editionStartTime;
              const isFuture = date.getTime() > todayTime;
              const active = key === selectedKey;
              return (
                <button type="button" key={key} disabled={isFuture || beforeEdition} onClick={() => setSelected(date)} aria-pressed={active}
                  aria-label={`${isFuture ? '尚未解锁' : beforeEdition ? '不在本版次' : '查看'} ${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日地球答案`}
                  className={`min-h-14 border-2 border-black px-0.5 py-1 text-center active:translate-y-px disabled:cursor-not-allowed ${active ? 'bg-black text-white' : isFuture || beforeEdition ? 'bg-[#d9d9d9] text-black/35' : 'bg-[#f7f2e7] text-black'}`}>
                  <span className="block font-pixel text-[6px]">{String(date.getMonth() + 1).padStart(2, '0')}</span>
                  <span className="mt-1 block font-serif text-[20px] font-bold leading-none">{date.getDate()}</span>
                  <span className="mt-1 block text-[7px]">{isFuture ? '锁' : key === todayKey ? '今' : '阅'}</span>
                </button>
              );
            })}
          </div>
        </section>

        <p className="px-2 text-center text-[9px] leading-relaxed text-black/45">这不是占卜。Agent 只把经过审阅的哲学原文，变成每天一次、不可提前消费的行动仪式。</p>
      </main>
    </div>
  );
}
