import { useReducer, useState, useEffect, useRef } from 'react';
import { ChevronLeft, Plane, MapPin, Sparkles, Check, PenLine, Camera, Cpu, Database, ShieldCheck } from 'lucide-react';
import {
  DESTINATIONS, PREFERENCES, runPlan, confirmTrip, pinManualStop, runArchive, confirmArchive,
  MODE_LABEL, MODE_COLOR, TRIP_MODES, getTravelStats, weatherLine, rainAdvice,
  flightLink, trainLink, hotelLink, addDays, cityCode, seatSummary, trainsViaMcp, flightRefViaMcp,
  type Pref, type TripPlan, type TripMode, type TripArchive, type TrainRow, type FlightRef,
} from '../lib/travel';
import { getUserMarksByKind, subscribeUserMarks } from '../data/userMarks';
import RunTrace from './RunTrace';
import TravelPlaceBrief from './TravelPlaceBrief';
import { startAgentRun } from '../lib/observe/bus';
import {
  getTravelPlannerRuntimeStatus,
  type TravelPlannerRuntimeStatus,
} from '../../../frost-agent/edge/httpQwenEdge';
import { useFrostTaskHandoff } from './FrostTaskHandoffFrame';

// travel-agent 运行页 —— 行程 agent（薄 UI，业务逻辑在 src/app/lib/travel/*）。
// B 线（规划）：选目的地+喜好 → 三级排序（云脑按你跨域口味挑 / 端侧真后端 / 本地兜底）→ 逐日行程 → 钉星球。
//   隐私：画像只走云脑那一级；端侧只按旅行偏好，画像不出端。
// A 线（存档·P0 手动版）：车票截图自动识别属 P1（端侧 OCR+脱敏），P0 先手填一笔已走过的行程钉点。
// 和攻略 App 的区别：走过的地方沉淀成中间地球上的私人足迹。

interface Props { onBack: () => void }
const ROSE = '#ff3b6b';
const today = () => new Date().toISOString().slice(0, 10);
const PACE_LABEL = { slow: '慢节奏', balanced: '平衡节奏', fast: '紧凑节奏' } as const;
const CROWD_LABEL = { low: '避开人潮', medium: '适中热度', high: '接受热闹' } as const;
const MIX_LABEL = { balanced: '主题交错', primary_secondary: '主次分明', theme_day: '主题分天' } as const;

export default function TravelRunPage({ onBack }: Props) {
  const handoffObjective = useFrostTaskHandoff()?.objective || '';
  const routedDestination = DESTINATIONS.find((destination) => handoffObjective.includes(destination.name))?.name;
  const routedDays = handoffObjective.match(/([123])\s*天/)?.[1];
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeUserMarks(force), []);

  const [destName, setDestName] = useState(routedDestination || DESTINATIONS[0].name);
  const [prefs, setPrefs] = useState<Set<Pref>>(() => new Set<Pref>(['美食', '小众']));
  const [days, setDays] = useState(routedDays ? Number(routedDays) : 2);
  const [date, setDate] = useState(today());       // 出行日期：驱动逐日天气 + 票务深链
  const [fromCity, setFromCity] = useState('');    // 出发城市（选填）：查票深链 + 余票/参考价
  const [requestText, setRequestText] = useState(handoffObjective || '少走回头路，路线松弛一点。');
  const [runtimeStatus, setRuntimeStatus] = useState<TravelPlannerRuntimeStatus>({
    phase: 'checking', engine: 'stub', baseReady: false, adapterReady: false,
    baseModel: 'Qwen3-VL-2B-Instruct', adapter: 'travel-planner', runtime: 'MNN 3.6.1',
  });
  // 增强层（叠在深链之上；查不到只留深链，不空转）
  const [trains, setTrains] = useState<TrainRow[] | null>(null);
  const [trainsBusy, setTrainsBusy] = useState(false);
  const [trainsMsg, setTrainsMsg] = useState('');
  const [flightRef, setFlightRef] = useState<FlightRef | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [phase, setPhase] = useState('');
  const [planRunId, setPlanRunId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getTravelPlannerRuntimeStatus().then((status) => { if (alive) setRuntimeStatus(status); });
    return () => { alive = false; };
  }, []);

  // A 线手动录入 state
  const [manualOpen, setManualOpen] = useState(false);
  const [mCity, setMCity] = useState('');
  const [mDate, setMDate] = useState(today());
  const [mMode, setMMode] = useState<TripMode>('train');

  const completed = getUserMarksByKind('travel');
  const tripCities = new Set(completed.map((m) => String((m.meta || {}).city || ''))).size;
  const stats = getTravelStats();   // P2 旅行档案（城市/类别/季节 + 跨 agent 重叠）

  const togglePref = (p: Pref) => setPrefs((prev) => {
    const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next;
  });
  const showToast = (s: string) => { setToast(s); window.setTimeout(() => setToast(null), 2400); };

  // B 线规划：catalog 精选 or OSM 实时检索（任意城市）→ 三级排序 → 逐日天气；mode/来源透明告知
  const makePlan = async () => {
    if (planning) return;
    const dn = destName.trim();
    if (!dn) { showToast('先填一个目的地'); return; }
    const run = startAgentRun(`规划行程 · ${dn} ${days}天`); setPlanRunId(run.runId);
    setPlanning(true); setPhase('');
    try {
      const tp = await runPlan({
        destName: dn,
        prefs: [...prefs],
        days,
        date: date || undefined,
        fromCity: fromCity.trim() || undefined,
        requestText,
      },
        (p, detail) => { setPhase(p); run.phase(p, detail); });
      run.end(!!tp);
      setPlan(tp);
      setTrains(null); setTrainsMsg(''); setFlightRef(null);
      if (!tp) showToast(`「${dn}」连 OSM 也没找到或景点太少，换个中/英文写法试试`);
      else if (tp.mode === '本地') showToast('云脑/端侧未就绪 · 本地按喜好排序');
      // 机票参考价（Amadeus，可选增强）：两端都有城市码才查；服务端没配 key → 静默无
      if (tp && date && fromCity.trim()) {
        const f = cityCode(fromCity), t = cityCode(tp.dest.name);
        if (f && t && f !== t) flightRefViaMcp(f, t, date).then((r) => setFlightRef(r));
      }
    } catch { run.end(false); showToast('规划出错了，稍后再试'); }
    finally { setPlanning(false); setPhase(''); }   // 与 Movies/Books 同款收口：抛错也复位 planning，免规划按钮永久卡 spinner + unhandled rejection
  };

  // 12306 余票（尽力而为增强：境外服务器可能被限 → 如实降级到深链）
  const checkTrains = async () => {
    if (!plan?.date || !fromCity.trim() || trainsBusy) return;
    setTrainsBusy(true); setTrains(null); setTrainsMsg('查 12306 余票中…');
    const rows = await trainsViaMcp(fromCity.trim(), plan.dest.name, plan.date);
    setTrains(rows);
    setTrainsMsg(rows ? '' : '12306 没查通（线路不通或接口被限）——用「查火车票」链接照样订');
    setTrainsBusy(false);
  };

  // 完成行程 → 每个停留点钉星球（逻辑在 lib/travel/pin.ts，幂等去重 + 回流画像）
  const finishTrip = () => {
    if (!plan) return;
    const { added } = confirmTrip(plan.dest, plan.days, plan.effectivePrefs, plan.date);
    showToast(added ? `已钉到星球 · ${plan.dest.name} ${added} 个足迹` : `${plan.dest.name} 的足迹都已在星球上`);
  };

  // A 线手动钉一笔
  const submitManual = async () => {
    const r = await pinManualStop({ city: mCity, date: mDate, mode: mMode });
    if (r.ok) { showToast(`已记下 · ${mCity.trim()} 钉到星球`); setMCity(''); setManualOpen(false); }
    else if (r.reason === 'needCity') showToast('先填一个城市名');
    else showToast('这个城市名连 OSM 也查不到，换个中/英文写法试试');
  };

  // A 线截图提炼：原图只进端侧 vision、脱敏后才上云结构化
  const shotRef = useRef<HTMLInputElement>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archivePhase, setArchivePhase] = useState('');
  const [archiveRunId, setArchiveRunId] = useState<string | null>(null);
  const [archiveDraft, setArchiveDraft] = useState<TripArchive | null>(null);

  const onPickShots = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const run = startAgentRun(`截图存档 · ${[...files].length} 张`); setArchiveRunId(run.runId);
    setArchiveBusy(true); setArchiveDraft(null); setArchivePhase('读取截图'); run.phase('读取截图');
    try {
      const urls = await Promise.all([...files].slice(0, 8).map((f) => new Promise<string>((res) => {
        const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(f);
      })));
      const { archive, reason } = await runArchive(urls.filter(Boolean), (p, detail) => { setArchivePhase(p); run.phase(p, detail); });
      run.end(!!archive);
      if (archive) setArchiveDraft(archive);
      else if (reason === 'noEdge') showToast('Qwen/MNN 端侧模型未就绪：去控制台安装基座，或用下面手动录入');
      else showToast('没读出行程信息，换张清晰点的截图或手填');
    } finally { setArchiveBusy(false); setArchivePhase(''); if (shotRef.current) shotRef.current.value = ''; }
  };

  const confirmArchiveDraft = async () => {
    if (!archiveDraft) return;
    const { added } = await confirmArchive(archiveDraft);
    showToast(added ? `已钉到星球 · ${archiveDraft.title} ${added} 个点` : '这些点都已在星球上');
    setArchiveDraft(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#EAEAEA] font-sans relative">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">TRAVEL-SKILL</div>
        </div>
        <Plane className="w-4 h-4" strokeWidth={2.5} style={{ color: ROSE }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ROSE }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>目的地 任意城市</span><span className="opacity-40">|</span>
          <span>足迹城市 {tripCities}</span><span className="opacity-40">|</span>
          <span>上地球 {completed.length}</span>
        </div>
      </div>

      {/* LoRA + Qwen 运行时：只做一条轻量状态栏，不复制“上街去”的重型设置页。 */}
      <div className="mx-3 mt-2 flex items-center gap-2 border-2 border-black bg-white px-2.5 py-2 shadow-[2px_2px_0_rgba(0,0,0,0.18)] shrink-0">
        <div className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#ffe3ea]" style={{ color: ROSE }}>
          <Cpu className="h-4 w-4" strokeWidth={2.6} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-[7px] tracking-wider text-black/75">QWEN3-VL-2B + TRAVEL LORA</span>
            <span
              className="ml-auto shrink-0 border px-1.5 py-0.5 text-[8px] font-bold"
              style={{
                borderColor: runtimeStatus.phase === 'ready' ? '#178a55' : '#b67a22',
                color: runtimeStatus.phase === 'ready' ? '#178a55' : '#8a5d18',
                background: runtimeStatus.phase === 'ready' ? '#e8f7ef' : '#fff4dc',
              }}
            >
              {runtimeStatus.phase === 'checking' ? '检测中' : runtimeStatus.phase === 'ready' ? '端侧已就绪' : '规则回退'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-black/48">
            <Database className="h-3 w-3" /> Skill 理解约束 · 城市与书影音数据随时可换
          </div>
        </div>
      </div>

      {/* 规划输入 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2 items-center">
          <input value={destName} disabled={planning} list="travel-dest-list" placeholder="目的地（任意城市）"
            onChange={(e) => { setDestName(e.target.value); setPlan(null); }}
            className="border-2 border-black px-2 py-1.5 text-[12px] bg-white font-bold disabled:opacity-50 min-w-0 flex-1" />
          <datalist id="travel-dest-list">
            {DESTINATIONS.map((d) => <option key={d.name} value={d.name} />)}
          </datalist>
          <div className="flex items-center border-2 border-black shrink-0">
            {[1, 2, 3].map((d) => (
              <button key={d} disabled={planning} onClick={() => { setDays(d); setPlan(null); }}
                className={`px-2 py-1.5 text-[11px] font-bold disabled:opacity-50 ${days === d ? 'text-black' : 'text-black/40'}`}
                style={days === d ? { background: ROSE } : undefined}>{d}天</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={date} disabled={planning} onChange={(e) => { setDate(e.target.value); setPlan(null); }}
            className="border-2 border-black px-1.5 py-1.5 text-[11px] bg-white disabled:opacity-50 shrink-0" />
          <input value={fromCity} disabled={planning} placeholder="出发城市（选填·查票用）"
            onChange={(e) => setFromCity(e.target.value)}
            className="border-2 border-black px-2 py-1.5 text-[11px] bg-white disabled:opacity-50 min-w-0 flex-1" />
          <button onClick={makePlan} disabled={planning}
            className="shrink-0 flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-50" style={{ background: ROSE }}>
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} /> {planning ? (phase || '规划中') : '规划'}
          </button>
        </div>
        {/* 喜好 chips */}
        <div className="flex flex-wrap gap-1.5">
          {PREFERENCES.map((p) => {
            const on = prefs.has(p);
            return (
              <button key={p} disabled={planning} onClick={() => { togglePref(p); setPlan(null); }}
                className={`text-[11px] px-2 py-0.5 border-2 border-black disabled:opacity-50 ${on ? 'text-black font-bold' : 'text-black/50 bg-white'}`}
                style={on ? { background: ROSE } : undefined}>{p}</button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={requestText}
            disabled={planning}
            aria-label="补充旅行要求"
            placeholder="补充要求：少走路 / 想看古籍 / 不去商场…"
            onChange={(event) => { setRequestText(event.target.value); setPlan(null); }}
            className="min-w-0 flex-1 border-2 border-black bg-white px-2 py-1.5 text-[11px] disabled:opacity-50"
          />
          <span className="hidden items-center gap-1 text-[8px] text-black/38 min-[390px]:inline-flex">
            <ShieldCheck className="h-3 w-3" /> 只解析约束
          </span>
        </div>
      </div>

      {/* 内容 */}
      <div className="px-3 py-3 space-y-3">
        {planRunId && <RunTrace runId={planRunId} collapseWhenDone />}

        {plan ? (
          <>
            <div className="flex items-center justify-between">
              <div className="font-pixel text-[9px] tracking-wider text-black/55 flex items-center gap-1.5">
                {plan.dest.name} · {plan.days.length}天 ·
                <span className="inline-flex items-center gap-1" style={{ color: MODE_COLOR[plan.mode] }}>
                  <span className="w-1.5 h-1.5" style={{ background: MODE_COLOR[plan.mode] }} />{MODE_LABEL[plan.mode]}
                </span>
                <span className="border border-black/25 bg-white px-1.5 py-0.5 font-sans text-[8px] font-bold text-black/55">
                  {plan.planner.source === 'qwen-lora' ? 'Travel LoRA' : '规则协议'}
                </span>
              </div>
              <button onClick={finishTrip} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1 text-[10px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px" style={{ color: ROSE }}>
                <Check className="w-3 h-3" strokeWidth={3} /> 完成行程 · 钉星球
              </button>
            </div>
            {plan.source === 'osm' && (
              <div className="text-[10px] text-black/50 leading-snug border-l-2 pl-1.5" style={{ borderColor: ROSE }}>
                景点来自 OpenStreetMap 实时检索（真实存在的地点；国内部分城市数据可能偏少）。
              </div>
            )}
            <div className="border-2 border-black bg-[#fff7f9] shadow-[2px_2px_0_rgba(0,0,0,0.16)]">
              <div className="flex items-center gap-2 border-b-2 border-black px-2.5 py-1.5">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} style={{ color: ROSE }} />
                <span className="text-[11px] font-bold">这次 Qwen + LoRA 解码了什么</span>
                {plan.planner.ruleAssist && <span className="border border-black/30 bg-white px-1 py-0.5 text-[8px] font-bold text-black/48">协议补齐</span>}
                <span className="ml-auto font-pixel text-[7px] text-black/38">INTENT → SOLVER</span>
              </div>
              <div className="flex flex-wrap gap-1.5 px-2.5 py-2">
                {plan.planner.pace && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">{PACE_LABEL[plan.planner.pace]}</span>}
                {plan.planner.crowdTolerance && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">{CROWD_LABEL[plan.planner.crowdTolerance]}</span>}
                {plan.planner.mixStrategy && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">{MIX_LABEL[plan.planner.mixStrategy]}</span>}
                {plan.planner.walkingLimitKm && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">少走路约 ≤ {plan.planner.walkingLimitKm}km/天</span>}
                {plan.planner.compactRoute && !plan.planner.walkingLimitKm && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">地理邻近少绕路</span>}
                {plan.planner.maxStopsPerDay && <span className="border border-black bg-white px-1.5 py-0.5 text-[9px] font-bold">每天最多 {plan.planner.maxStopsPerDay} 站</span>}
                {plan.planner.mustVisit.map((term) => <span key={`must-${term}`} className="border border-black px-1.5 py-0.5 text-[9px] font-bold" style={{ background: ROSE }}>必去 {term}</span>)}
                {plan.planner.avoid.map((term) => <span key={`avoid-${term}`} className="border border-black bg-white px-1.5 py-0.5 text-[9px]">避开 {term}</span>)}
                {!plan.planner.pace && !plan.planner.crowdTolerance && !plan.planner.mixStrategy && !plan.planner.walkingLimitKm && !plan.planner.compactRoute && !plan.planner.maxStopsPerDay && !plan.planner.mustVisit.length && !plan.planner.avoid.length && (
                  <span className="text-[9.5px] text-black/45">没有额外限制，按已选兴趣与个人口味规划。</span>
                )}
              </div>
              <div className="border-t border-black/15 px-2.5 py-1.5 text-[9px] leading-snug text-black/48">
                LoRA 负责把原话变成约束；量化输出漏可选槽位时会标出“协议补齐”。站数、主题多样性和少绕路顺序由确定性规划器执行。
              </div>
            </div>
            {plan.planner.walkingLimitKm && (
              <div className="border-l-2 pl-1.5 text-[10px] leading-snug text-black/52" style={{ borderColor: ROSE }}>
                已识别“少走路”约束（约 {plan.planner.walkingLimitKm} km）；当前先用站点数量与少绕路排序保守规划，实际步行距离以出发前导航为准。
              </div>
            )}
            {/* 查票/订房：带真实线路与日期的深链（只跳查询页，不代订）*/}
            {plan.date && (
              fromCity.trim() ? (
                <div className="flex flex-wrap gap-1.5 items-center">
                    <a href={trainLink(fromCity.trim(), plan.dest.name, plan.date)} target="_blank" rel="noreferrer"
                      className="text-[10.5px] font-bold border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px">🚄 查火车票</a>
                    <button onClick={checkTrains} disabled={trainsBusy}
                      className="text-[10.5px] font-bold border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px disabled:opacity-50">
                      {trainsBusy ? '查余票…' : '🎫 查余票'}
                    </button>
                    <a href={flightLink(fromCity.trim(), plan.dest.name, plan.date).url} target="_blank" rel="noreferrer"
                      className="text-[10.5px] font-bold border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px">
                      ✈️ 查机票{flightLink(fromCity.trim(), plan.dest.name, plan.date).exact ? '' : '（手动搜）'}
                      {flightRef ? <span className="text-[#0a7d4a]"> ¥{Math.round(flightRef.min)}起*</span> : null}
                    </a>
                    <a href={hotelLink(plan.dest.name, plan.date, addDays(plan.date, plan.days.length))} target="_blank" rel="noreferrer"
                      className="text-[10.5px] font-bold border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px">🏨 订酒店</a>
                    <span className="text-[9px] text-black/35">{plan.date} 出发 · 跳转查询页，不代订{flightRef ? ' · *参考价来自 Amadeus 测试数据，以跳转页为准' : ''}</span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[9.5px] text-black/40">
                  <span className="truncate">{plan.date} 出发 · 填出发城市查票</span>
                  <a href={hotelLink(plan.dest.name, plan.date, addDays(plan.date, plan.days.length))} target="_blank" rel="noreferrer"
                    className="ml-auto shrink-0 border-2 border-black bg-white px-1.5 py-0.5 font-bold text-black shadow-[1px_1px_0_#000] active:translate-y-px">🏨 酒店</a>
                  <span className="shrink-0 text-black/30">只查询不代订</span>
                </div>
              )
            )}
            {/* 12306 余票（真数据；查不通如实说，深链兜底永在）*/}
            {trainsMsg && <div className="text-[10px] text-black/50 leading-snug">{trainsMsg}</div>}
            {trains && (
              <div className="border-2 border-black bg-white">
                <div className="px-2 py-1 border-b border-black/20 font-pixel text-[7px] tracking-widest text-black/50">12306 余票 · {fromCity.trim()}→{plan.dest.name} · {plan.date}</div>
                <div className="divide-y divide-black/10">
                  {trains.slice(0, 6).map((t) => (
                    <div key={t.code + t.dep} className="flex items-center gap-2 px-2 py-1 text-[10.5px]">
                      <span className="font-bold w-12 shrink-0">{t.code}</span>
                      <span className="text-black/70 shrink-0">{t.dep}→{t.arr}</span>
                      <span className="text-black/40 shrink-0">{t.dur}</span>
                      <span className="ml-auto text-right text-black/70 truncate">{seatSummary(t.seats)}</span>
                    </div>
                  ))}
                </div>
                {trains.length > 6 && <div className="px-2 py-1 text-[9px] text-black/40">还有 {trains.length - 6} 趟，点「查火车票」看全部</div>}
              </div>
            )}
            {plan.weather && rainAdvice(plan.weather) && (
              <div className="text-[10.5px] leading-snug text-[#7a5a1f] border-l-2 border-[#c08a00] pl-1.5">☔ {rainAdvice(plan.weather)}</div>
            )}
            {plan.days.map((d) => (
              <div key={d.day} className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
                <div className="px-2.5 py-1 border-b-2 border-black font-pixel text-[9px] tracking-widest flex items-center justify-between gap-2" style={{ background: ROSE }}>
                  <span>DAY {d.day}</span>
                  {plan.weather?.[d.day - 1] && <span className="font-sans font-bold normal-case tracking-normal text-[10px]">{weatherLine(plan.weather[d.day - 1])}</span>}
                </div>
                {d.rationale && <div className="border-b border-black/15 bg-[#fff7f9] px-2.5 py-1 text-[9px] font-bold text-black/55">{d.rationale}</div>}
                <div className="divide-y divide-black/10">
                  {d.stops.map((s, i) => (
                    <div key={i}>
                      <div className="flex gap-2.5 px-2.5 py-2 items-start">
                        <div className="w-5 h-5 shrink-0 mt-0.5 border border-black flex items-center justify-center font-pixel text-[8px]" style={{ background: ROSE }}>{i + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-bold truncate">{s.name}</span>
                            <span className="font-pixel text-[7px] border border-black/40 px-1 text-black/60">{s.tag}</span>
                            {d.optionalFromIndex != null && i >= d.optionalFromIndex && (
                              <span className="border border-black bg-[#fff2be] px-1 py-0.5 text-[8px] font-bold">机动站</span>
                            )}
                            <TravelPlaceBrief city={plan.dest.name} place={s.name} />
                          </div>
                          <div className="text-[11px] text-black/60 leading-snug mt-0.5">{s.note}</div>
                          {d.guides?.[i] && (
                            <div className="mt-1.5 space-y-1 border-l-2 border-black/15 pl-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold text-black/65">
                                <span className="border border-black bg-[#fff7f9] px-1.5 py-0.5" style={{ color: ROSE }}>{d.guides[i].period}</span>
                                <span>{d.guides[i].duration}</span>
                                <span className="text-black/32">· {d.guides[i].source}</span>
                              </div>
                              <div className="text-[10px] leading-snug text-black/58">为什么选：{d.guides[i].why}</div>
                              <div className="text-[9px] leading-snug text-black/38">出发前核验：{d.guides[i].verify}</div>
                              {d.optionalFromIndex != null && i >= d.optionalFromIndex && (
                                <div className="text-[9px] font-bold text-black/55">有余力再去；排队、天气或体力不合适时可直接跳过。</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 站间驾车参考：OSRM 真实路网算的 km/min */}
                      {d.legs?.[i] && i < d.stops.length - 1 && (
                        <div className="px-2.5 pb-1 -mt-1 text-[9.5px] text-black/40">↓ 🚗 约 {d.legs[i].min} 分钟 · {d.legs[i].km} km</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="text-center text-[8px] font-pixel text-black/30 py-1 tracking-widest">
              {plan.mode === '云脑' ? '按你的电影/读书/音乐口味挑 · 完成后钉成私人足迹' : '完成后钉成地球上的私人足迹'}
            </div>
          </>
        ) : (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <MapPin className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: ROSE }} />
            <div className="text-[12px] font-bold mb-1">填目的地（任意城市）+ 日期 + 喜好，帮你排行程</div>
            <div className="text-[11px] text-black/55 leading-snug">Travel LoRA 只理解目的地、时间与硬约束；景点来自可替换城市数据和 OpenStreetMap，书籍/电影/音乐只提供你的口味线索。路线由确定性工具排程，完成后可一键落到中间地图。</div>
          </div>
        )}

        {/* A 线 P1：截图自动提炼（端侧 vision 读票据 → 脱敏 → 云脑结构化） */}
        <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <input ref={shotRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickShots(e.target.files)} />
          <button onClick={() => shotRef.current?.click()} disabled={archiveBusy}
            className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold active:translate-y-px disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: ROSE }} />
            {archiveBusy ? (archivePhase || '提炼中…') : '把车票/酒店截图一股脑丢进来'}
            <span className="ml-auto text-[9px] text-black/40">端侧识别</span>
          </button>
          <div className="px-2.5 pb-2 text-[10px] text-black/45 leading-snug">原图只在端侧读、不出手机；身份证/手机号自动打码；只把脱敏后的文字交云脑理成行程。</div>
          {archiveRunId && <div className="px-2.5 pb-2"><RunTrace runId={archiveRunId} collapseWhenDone /></div>}
          {archiveDraft && (
            <div className="px-2.5 pb-2.5 border-t-2 border-black/10 pt-2 space-y-1">
              <div className="text-[12px] font-bold">{archiveDraft.title}</div>
              <div className="text-[10px] text-black/55">
                {archiveDraft.dateStart ? `${archiveDraft.dateStart}${archiveDraft.dateEnd ? `~${archiveDraft.dateEnd}` : ''} · ` : ''}
                途经 {archiveDraft.cities.join('、') || '—'}
              </div>
              {archiveDraft.segments.map((s, i) => (
                <div key={`g${i}`} className="text-[10.5px] text-black/70">🚆 {s.fromCity || '?'}→{s.toCity || '?'}{s.code ? ` ${s.code}` : ''}{s.date ? ` ${s.date}` : ''}</div>
              ))}
              {archiveDraft.stays.map((s, i) => (
                <div key={`s${i}`} className="text-[10.5px] text-black/70">🏨 {s.hotel || s.city}{s.checkIn ? ` ${s.checkIn}` : ''}</div>
              ))}
              {archiveDraft.spots.map((s, i) => (
                <div key={`p${i}`} className="text-[10.5px] text-black/70">📍 {s.name}{s.city ? ` · ${s.city}` : ''}</div>
              ))}
              <div className="text-[9px] text-[#c08a00] leading-snug pt-0.5">⚠ 端侧识别可能有误，钉之前扫一眼；错了用下面手动录入改。</div>
              <button onClick={confirmArchiveDraft} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px mt-1" style={{ color: ROSE }}>
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> 钉到星球
              </button>
            </div>
          )}
        </div>

        {/* A 线 P0：手动记一笔已走过的行程 */}
        <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
          <button onClick={() => setManualOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-bold active:translate-y-px">
            <PenLine className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: ROSE }} />
            手动记一笔已走过的行程
            <span className="ml-auto text-[9px] text-black/40">{manualOpen ? '收起' : '展开'}</span>
          </button>
          {manualOpen && (
            <div className="px-2.5 pb-2.5 pt-1 border-t-2 border-black/10 space-y-2">
              <div className="text-[10px] text-black/45 leading-snug">车票/酒店截图自动识别还在路上（要端侧 OCR + 脱敏）；先手填一个去过的城市钉到星球。</div>
              <div className="flex gap-2">
                <input value={mCity} onChange={(e) => setMCity(e.target.value)} placeholder="城市（中/英文，如 京都 / Kyoto）"
                  className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-white" />
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                  className="border-2 border-black px-1.5 py-1.5 text-[11px] bg-white" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRIP_MODES.map((m) => (
                  <button key={m.key} onClick={() => setMMode(m.key)}
                    className={`text-[10px] px-2 py-0.5 border-2 border-black ${mMode === m.key ? 'text-black font-bold' : 'text-black/50 bg-white'}`}
                    style={mMode === m.key ? { background: ROSE } : undefined}>{m.label}</button>
                ))}
              </div>
              <button onClick={submitManual} className="w-full flex items-center justify-center gap-1.5 border-2 border-black bg-black px-2 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px" style={{ color: ROSE }}>
                <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} /> 钉到星球
              </button>
            </div>
          )}
        </div>

        {/* P2 旅行档案：统计 + 跨 agent 联动 */}
        {stats.spots > 0 && (
          <div className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="px-2.5 py-1.5 bg-black"><span className="font-pixel text-[8px] tracking-widest" style={{ color: ROSE }}>旅行档案</span></div>
            <div className="px-3 py-2.5 space-y-2.5">
              <div className="flex justify-around text-center">
                {[[stats.cities, '城市'], [stats.trips, '趟行程'], [stats.spots, '足迹点']].map(([n, label]) => (
                  <div key={label as string}>
                    <div className="text-[18px] font-bold leading-none" style={{ color: ROSE }}>{n as number}</div>
                    <div className="text-[9px] text-black/45 mt-0.5">{label as string}</div>
                  </div>
                ))}
              </div>
              {stats.topTags.length > 0 && (
                <div>
                  <div className="font-pixel text-[7px] text-black/40 tracking-wider mb-1">最爱</div>
                  <div className="flex flex-wrap gap-1">
                    {stats.topTags.map((t) => <span key={t.tag} className="text-[10px] border border-black/40 px-1.5 py-0.5 bg-[#EAEAEA]">{t.tag} ×{t.n}</span>)}
                  </div>
                </div>
              )}
              {stats.seasons.length > 0 && (
                <div className="text-[10.5px] text-black/60">偏好季节：{stats.seasons.map((s) => `${s.season}(${s.n})`).join(' · ')}</div>
              )}
              {stats.overlaps.length > 0 && (
                <div>
                  <div className="font-pixel text-[7px] text-black/40 tracking-wider mb-1">在这些城市，你的世界交汇</div>
                  <div className="space-y-0.5">
                    {stats.overlaps.slice(0, 6).map((o) => (
                      <div key={o.city} className="text-[10.5px] text-black/70">📍 {o.city} <span className="text-black/45">· 也留下了 {o.kinds.join('、')}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 已钉足迹 */}
        {completed.length > 0 && (
          <div>
            <div className="font-pixel text-[9px] tracking-widest text-black/45 mb-1.5 mt-2">已钉星球的足迹</div>
            <div className="flex flex-wrap gap-1.5">
              {completed.slice(0, 40).map((m) => (
                <span key={m.id} className="text-[10px] border-2 border-black bg-white px-1.5 py-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5" style={{ background: ROSE }} />{m.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 border-2 border-black bg-black text-[11px] px-3 py-1.5 shadow-[2px_2px_0_#000] text-center max-w-[88%]" style={{ color: ROSE }}>
          {toast}
        </div>
      )}
    </div>
  );
}
