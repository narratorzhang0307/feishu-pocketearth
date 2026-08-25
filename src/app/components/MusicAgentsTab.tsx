// Skills tab —— Frost Agent 的能力控制台（Skill / harness / pipeline）
// 内容静态提炼自 frost-agent/ARCHITECTURE.md 与各 contract.md
import { lazy, Suspense, useState, useEffect } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import FrostTaskHandoffFrame from './FrostTaskHandoffFrame';
import FrostPersona from './FrostPersona';
import OnDeviceBrainPanel from './OnDeviceBrainPanel';
import { getLearnedSkills, subscribeSkills, type LearnedSkill } from '../../../frost-agent/harness/skillForge';
import { startHeartbeat } from '../../../frost-agent/harness/heartbeat';
import { restoreDemoDataPacks } from '../lib/dataPack';
import { ensureBuiltinSkills } from '../lib/skill';
import { skillPublisherForAgent, type SkillPublisher } from '../data/skillPublishers';

// Skill 运行页不属于控制台首屏；用户打开时再按需加载。
const MusicAgentPage = lazy(() => import('./MusicAgentPage'));
const MoviesAgentPage = lazy(() => import('./MoviesAgentPage'));
const BooksAgentPage = lazy(() => import('./BooksAgentPage'));
const PhotosAgentRunPage = lazy(() => import('./PhotosAgentRunPage'));
const TravelRunPage = lazy(() => import('./TravelRunPage'));
const CouncilPage = lazy(() => import('./CouncilPage'));
const FrostBuddyPage = lazy(() => import('./FrostBuddyPage'));
const UniversalCaptureRunPage = lazy(() => import('./UniversalCaptureRunPage'));
const ExhibitionRunPage = lazy(() => import('./ExhibitionRunPage'));
const AgentPlazaPage = lazy(() => import('./AgentPlazaPage'));
const EarthAnswerAgentPage = lazy(() => import('./EarthAnswerAgentPage'));
const AgentForgePage = lazy(() => import('./AgentForgePage'));
const HeritageRestorationPage = lazy(() => import('./HeritageRestorationPage'));
const DeviceEvidenceLedgerPage = lazy(() => import('./DeviceEvidenceLedgerPage'));

function SkillPageLoader({ label }: { label: string }) {
  return <div className="grid h-full place-items-center bg-[#eaeaea] font-pixel text-[8px]">正在装入 {label}…</div>;
}

interface AgentItem {
  name: string;
  label?: string;
  role: string;
  status: string;
  kind?: 'Markdown' | 'LoRA' | '混合';
  background?: string;
}

function PublisherAvatar({ publisher, size = 52 }: { publisher: SkillPublisher; size?: number }) {
  return <span className="shrink-0 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]" style={{ width: size, height: size }}><img src={publisher.avatar} alt={`${publisher.name}的发布者头像`} className="h-full w-full object-contain" loading="lazy" draggable={false} /></span>;
}

const SKILL_PUBLISHING_RULES = [
  ['只准两类', 'Mapping Skill 管知识、规则、工具与地图落位；LoRA Skill 管经过训练的稳定能力。'],
  ['默认不训练', '提示词、MD / JSON、RAG 或规则能稳定完成的任务，一律做 Mapping；会更新的城市事实不得写进 LoRA。'],
  ['LoRA 有门槛', '仅当 Base + Prompt 仍不可靠，且目标属于重复的视觉/物理感知、特殊版面识别或固定结构化行为时才训练。'],
  ['统一 Qwen 底座', '必须使用平台指定的同版 Qwen3-VL-2B、revision 与适配层；底座只装一份，Skill 只切换兼容 LoRA。'],
  ['先装协议再装权重', 'LoRA 必须通过 Skill Protocol Runtime 安装：声明底座、输入输出、权限、依赖、校验和、版本与回退方式。'],
  ['数据与隐私可追溯', '训练集、盲测集按对象隔离并记录来源；用户本地照片、笔记与足迹默认不得进入训练。'],
  ['盲测胜过基座才发布', '同一真实盲测集对比 Base 与 LoRA；保留失败样本、置信度和质量门控，不可见内容必须标 □ 或候选。'],
  ['端侧结果必须诚实', '真机验证 MNN 的体积、延迟、内存与回退；SME2 只代表加速。抠图、深度、姿态或几何模型须单列依赖，不得冒充 Qwen LoRA。'],
] as const;

function SkillPublishingDeclaration() {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-2 border-black bg-[#f7f1df]" aria-label="Skill 发布声明">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="skill-publishing-rules"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 p-2.5 text-left active:translate-y-px"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-[#00ff88]">
          <ShieldCheck size={20} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block font-pixel text-[9px] tracking-wider">SKILL 发布声明</strong>
          <span className="mt-1 block text-[8.5px] font-bold text-black/55">两种类型 · 8 条硬规则 · 全部通过才可发布</span>
        </span>
        <span className="border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">{open ? '收起' : '必读'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.8} />
      </button>

      {open && (
        <div id="skill-publishing-rules" className="border-t-2 border-black p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="border-2 border-black bg-white p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">01 · MAPPING SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">MD / JSON / RAG / 工具 / 地图数据，不训练模型，内容可独立更新。</p>
            </div>
            <div className="border-2 border-black bg-[#eef3df] p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">02 · LORA SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">统一 Qwen 底座上的可切换权重，必须经协议安装和真实盲测。</p>
            </div>
          </div>

          <ol className="mt-2 border-2 border-black bg-white">
            {SKILL_PUBLISHING_RULES.map(([title, body], index) => (
              <li key={title} className="grid grid-cols-[28px_1fr] border-b border-black/25 last:border-b-0">
                <span className="grid min-h-[42px] place-items-center border-r border-black/25 bg-[#f0ead8] font-pixel text-[6px]">{String(index + 1).padStart(2, '0')}</span>
                <span className="p-2 text-[8.5px] leading-relaxed text-black/65">
                  <strong className="mr-1 text-black">{title}。</strong>{body}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-2 border-2 border-black bg-[#00ff88] px-2 py-1.5 text-center font-pixel text-[6px] tracking-wider">
            8 / 8 PASS · 才能进入 SKILLS PLAZA
          </div>
        </div>
      )}
    </section>
  );
}

const SKILL_GROUPS: { title: string; sub: string; items: AgentItem[] }[] = [
  {
    title: '02 · CONTENT / WORKFLOW',
    sub: 'MD · JSON · RAG · DATA PACK · RULES',
    items: [
      { name: 'earth-answer-agent', label: 'EARTH ANSWER', role: '每天 00:00 解锁一条行动原文；可以回看，不可偷看明天', status: '可运行', kind: 'Markdown' },
      { name: 'music-agent', label: 'music-skill', role: '把音乐钉到歌手出身地 / 歌曲城市', status: '契约就位', kind: 'Markdown' },
      { name: 'books-agent', label: 'books-skill', role: '把书钉到故事地 / 作者地 + 读完日期', status: '契约就位', kind: 'Markdown' },
      { name: 'movies-agent', label: 'movies-skill', role: '把电影钉到取景地 / 故事地', status: '契约就位', kind: 'Markdown' },
      { name: 'photos-agent', label: 'photos-skill', role: '端侧整理照片；确认后的元数据写入独立照片表', status: '契约就位', kind: 'Markdown' },
      { name: 'council-room', label: 'COUNCIL', role: '圆桌 / 辩论 / 法庭：Frost 切换多个专业视角后给出综合判断', status: '可运行', kind: 'Markdown' },
    ],
  },
  {
    title: '01 · MODEL SKILLS',
    sub: '共享 Qwen Base · 按任务切换模型资产',
    items: [
      { name: 'agent-forge', label: 'BOOK-TO-EARTH', role: '导入书籍 / 资料 → 端侧识读 → 原文证据 → 人工确址 → 独立 Data Pack', status: '端侧可装', kind: '混合', background: '#f3ecff' },
      { name: 'jot-agent', label: 'READING-JOT', role: 'Base 优先；疑难选区才运行 OCR LoRA，增强视图复核后由你校文并保存', status: '端侧可装', kind: 'LoRA', background: '#f7f1ff' },
      { name: 'travel-skill', label: 'TRAVEL', role: 'Travel LoRA 理解约束，确定性规划后落地球', status: '端侧就位', kind: 'LoRA', background: '#f7f1ff' },
      { name: 'exhibition-agent', label: 'EXHIBITION', role: '拍展签识别 + 照片时间线 + 3D 绕拍，展品钉回展馆', status: '端侧可装', kind: '混合', background: '#f7f1ff' },
      { name: 'heritage-restoration', label: '碑拓识读与数字复原', role: 'Qwen Base + 碑拓 LoRA 双候选门控；遮罩内端侧修复，原图始终保留', status: '端侧可装', kind: '混合', background: '#f7f1ff' },
    ],
  },
];

const SYSTEM_GROUPS: { title: string; sub: string; items: AgentItem[] }[] = [{
    title: 'PLAZA',
    sub: '发现、校验、安装与回滚',
    items: [
      { name: 'agent-plaza', label: 'SKILLS PLAZA', role: '小动物创作者发布；审核权限、Qwen/MNN 基座与资产哈希后，只装入你的私人系统', status: '可运行' },
    ],
  }];

const FEISHU_SYSTEM_GROUPS: typeof SYSTEM_GROUPS = [{
  title: 'PLAZA',
  sub: '发现、校验、安装与回滚',
  items: [
    { name: 'agent-plaza', label: 'SKILLS PLAZA', role: '发现并安装适合你的 Skills；权限与版本可审计、可回滚', status: '可运行' },
  ],
}];

const GROUPS = [SKILL_GROUPS[1], SKILL_GROUPS[0], ...SYSTEM_GROUPS];


type Running = 'frost' | 'music' | 'movies' | 'books' | 'photos' | 'travel' | 'council' | 'spaceplaza' | 'agentforge' | 'heritage' | 'jot' | 'exhibition' | 'earthanswer' | 'deviceevidence' | null;
const RUN_BY_NAME: Record<string, Running> = {
  'earth-answer-agent': 'earthanswer',
  'music-agent': 'music', 'movies-agent': 'movies',
  'books-agent': 'books', 'travel-skill': 'travel', 'travel-agent': 'travel',
  'photos-agent': 'photos',
  'council-room': 'council', 'jot-agent': 'jot',
  'exhibition-agent': 'exhibition',
  'agent-plaza': 'spaceplaza',
  'heritage-restoration': 'heritage',
};
// 兼容旧深链 id：原 Agent Forge 已按总计划迁移为 Book-to-Earth Mapping Skill。
const HERO_BY_NAME: Record<string, Running> = { 'agent-forge': 'agentforge' };

function runningForTarget(target?: string | null): Running {
  if (!target) return null;
  return RUN_BY_NAME[target] ?? HERO_BY_NAME[target] ?? null;
}

interface MusicAgentsTabProps {
  feishuMode?: boolean;
  requestedTarget?: string | null;
  onRequestedTargetOpened?: () => void;
}

export default function MusicAgentsTab({ feishuMode = false, requestedTarget, onRequestedTargetOpened }: MusicAgentsTabProps) {
  const agentFromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('agent') : null;
  const openExhibitionFromUrl = typeof location !== 'undefined' && (
    agentFromUrl === 'exhibition' ||
    new URLSearchParams(location.search).has('recoverKiri')
  );
  const [running, setRunning] = useState<Running>(() => runningForTarget(requestedTarget) || (openExhibitionFromUrl ? 'exhibition' : null));
  const [demoRestore, setDemoRestore] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  // P2-I：已学技能（点击=路由到其目标 agent）
  const [learned, setLearned] = useState<LearnedSkill[]>(getLearnedSkills());
  useEffect(() => subscribeSkills(() => setLearned([...getLearnedSkills()])), []);
  useEffect(() => ensureBuiltinSkills(), []);
  useEffect(() => {
    const next = runningForTarget(requestedTarget);
    if (!next) return;
    setRunning(next);
    onRequestedTargetOpened?.();
  }, [requestedTarget, onRequestedTargetOpened]);
  // 启动 FROST heartbeat：进入控制台即定期产「主动建议」（此前 startHeartbeat 全仓零调用，建议链路静默常关）。
  // 幂等（只起一个定时器），卸载时清理。
  useEffect(() => startHeartbeat(), []);
  const runSkill = (target: string) => { const t = RUN_BY_NAME[target] ?? HERO_BY_NAME[target]; if (t) setRunning(t); };
  const visibleGroups = feishuMode
    ? [{ ...SKILL_GROUPS[0], title: '01 · CONTENT / WORKFLOW' }, ...FEISHU_SYSTEM_GROUPS]
    : GROUPS;
  const visibleSkillCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);
  const restoreDemo = async () => {
    if (demoRestore === 'loading') return;
    setDemoRestore('loading');
    try {
      await restoreDemoDataPacks();
      setDemoRestore('done');
      window.setTimeout(() => setDemoRestore('idle'), 2400);
    } catch {
      setDemoRestore('error');
      window.setTimeout(() => setDemoRestore('idle'), 3200);
    }
  };

  if (running === 'frost') return <Suspense fallback={<SkillPageLoader label="FROST" />}><FrostBuddyPage onBack={() => setRunning(null)} onRun={runSkill} /></Suspense>;
  if (running === 'music') return <FrostTaskHandoffFrame target="music-agent"><Suspense fallback={<SkillPageLoader label="MUSIC" />}><MusicAgentPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'movies') return <FrostTaskHandoffFrame target="movies-agent"><Suspense fallback={<SkillPageLoader label="MOVIES" />}><MoviesAgentPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'books') return <FrostTaskHandoffFrame target="books-agent"><Suspense fallback={<SkillPageLoader label="BOOKS" />}><BooksAgentPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'photos') return <FrostTaskHandoffFrame target="photos-agent"><Suspense fallback={<SkillPageLoader label="PHOTOS" />}><PhotosAgentRunPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'travel') return <FrostTaskHandoffFrame target="travel-skill"><Suspense fallback={<SkillPageLoader label="TRAVEL" />}><TravelRunPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'council') return <FrostTaskHandoffFrame target="council-room"><Suspense fallback={<SkillPageLoader label="COUNCIL" />}><CouncilPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'spaceplaza') return <Suspense fallback={<SkillPageLoader label="SKILLS PLAZA" />}><AgentPlazaPage onBack={() => setRunning(null)} onRun={runSkill} /></Suspense>;
  if (running === 'agentforge') return <FrostTaskHandoffFrame target="agent-forge"><Suspense fallback={<SkillPageLoader label="BOOK-TO-EARTH" />}><AgentForgePage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'heritage') return <FrostTaskHandoffFrame target="heritage-restoration"><Suspense fallback={<SkillPageLoader label="文化遗产 SKILL" />}><HeritageRestorationPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'jot') return <FrostTaskHandoffFrame target="jot-agent"><Suspense fallback={<SkillPageLoader label="READING JOT" />}><UniversalCaptureRunPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'exhibition') return <FrostTaskHandoffFrame target="exhibition-agent"><Suspense fallback={<SkillPageLoader label="EXHIBITION" />}><ExhibitionRunPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'earthanswer') return <FrostTaskHandoffFrame target="earth-answer-agent"><Suspense fallback={<SkillPageLoader label="EARTH ANSWER" />}><EarthAnswerAgentPage onBack={() => setRunning(null)} /></Suspense></FrostTaskHandoffFrame>;
  if (running === 'deviceevidence') return <Suspense fallback={<SkillPageLoader label="本机验收账本" />}><DeviceEvidenceLedgerPage onBack={() => setRunning(null)} /></Suspense>;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[9px] uppercase tracking-[0.14em] leading-none">{feishuMode ? 'POCKET EARTH · FEISHU SKILLS' : 'POCKET EARTH · QWEN + MNN'}</div>
      </div>

      {/* 标题 */}
      <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">SKILLS</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          私人记忆由你的 Frost 整理 · Skills 随时装备与运行
        </p>
      </div>

      {/* 状态条 */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88] shrink-0">
        <div className="font-pixel text-[8px] flex justify-between items-center gap-2 tracking-widest">
          <span>{feishuMode ? `SKILLS ${visibleSkillCount} · FEISHU ROUTED` : `MODEL ${SKILL_GROUPS[1].items.length} · CONTENT ${SKILL_GROUPS[0].items.length}`}</span>
          <button onClick={restoreDemo} disabled={demoRestore === 'loading'} className="shrink-0 border border-[#00ff88]/70 px-2 py-1 text-[6px] tracking-wider disabled:opacity-40 active:bg-[#00ff88] active:text-black">
            {demoRestore === 'loading' ? '恢复中…' : demoRestore === 'done' ? '✓ 已恢复并落地图' : demoRestore === 'error' ? '恢复失败 · 重试' : '↻ 恢复三个示例库'}
          </button>
        </div>
      </div>

      {/* agent 分组列表（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!feishuMode && <SkillPublishingDeclaration />}

        {/* 决赛验收入口：Agents 内容区第一位，默认展开，真实控制 Android MNN / SME2 并保存可导出证据。 */}
        {!feishuMode && <OnDeviceBrainPanel onOpenLedger={() => setRunning('deviceevidence')} />}

        {/* Frost 总编排入口：理解任务后路由到已登记 Skill。 */}
        <button
          onClick={() => setRunning('frost')}
          className="w-full text-left grid grid-cols-[52px_1fr_auto] items-center gap-2.5 border-2 border-black p-2.5 active:translate-y-px"
          style={{ background: '#d9d9d9' }}
        >
          <div className="flex w-[52px] justify-center">
            <FrostPersona variant={4} size={52} contentScale={1.35} className="border-2 border-black" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[11px] tracking-wider text-black">FROST</div>
            <div className="mt-0.5 text-[10.5px] leading-snug text-black/60">{feishuMode ? '理解飞书中的任务并调度已装备 Skills；写回前始终由用户确认。' : '理解任务、调度已装备 Skills；敏感原文不会因为规划失败而自动上云。'}</div>
            <div className="mt-1 font-pixel text-[6px] text-[#326B55]">{feishuMode ? 'FEISHU AUTH · SKILL ROUTER · HUMAN REVIEW' : 'LOCAL PERSONA · NOT AN IDENTITY CREDENTIAL'}</div>
          </div>
          <span className="grid min-h-11 w-[76px] shrink-0 place-items-center border-2 border-black bg-[#00ff88] px-1 text-center font-pixel text-[6px] leading-relaxed text-black">▶ RUN</span>
        </button>

        {visibleGroups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 border-b-2 border-black pb-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-pixel text-[10px] tracking-widest">{g.title}</h2>
                <span className="shrink-0 border border-black bg-white px-1.5 py-0.5 font-pixel text-[6px]">{g.items.length}</span>
              </div>
              <span className="mt-1 block text-[8.5px] font-bold tracking-wide text-black/45">{g.sub}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((a) => {
                const target = RUN_BY_NAME[a.name] ?? HERO_BY_NAME[a.name];
                const runnable = !!target;
                const publisher = skillPublisherForAgent(a.name);
                return (
                  <button
                    key={a.name}
                    onClick={runnable ? () => setRunning(target) : undefined}
                    className={`grid min-h-[82px] w-full grid-cols-[52px_1fr_76px] items-center gap-2.5 border-2 border-black p-2.5 text-left transition-colors ${
                      runnable ? 'hover:bg-[#00ff88]/10 active:translate-y-px' : 'cursor-default'
                    }`}
                    style={{ background: a.background ?? '#fff' }}
                  >
                    <PublisherAvatar publisher={publisher} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-pixel text-[9px] tracking-wide">{a.label ?? a.name}</div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <div className="min-w-0 flex-1 truncate text-[8.5px] font-bold text-[#18784b]">{publisher.name} · {publisher.role} 发布</div>
                        {a.kind && <span className={`shrink-0 border border-black px-1 py-0.5 font-pixel text-[5px] ${a.kind === 'Markdown' ? 'bg-[#eef3df] text-[#326B55]' : a.kind === 'LoRA' ? 'bg-[#b388ff] text-black' : 'bg-black text-[#b388ff]'}`}>{a.kind}</span>}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-black/55">{a.role}</div>
                    </div>
                    <span className={`grid min-h-11 w-[76px] shrink-0 place-items-center border-2 border-black px-1 text-center font-pixel text-[6px] leading-relaxed ${
                      runnable ? 'bg-[#00ff88] text-black' : 'bg-white text-black/45'
                    }`}>
                      {runnable ? '打开 Skill' : a.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* P2-I · frost 学到的快捷技能（点击=路由到目标 agent） */}
        {learned.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-pixel text-[11px] tracking-widest">LEARNED</h2>
              <span className="text-[9px] text-black/45">frost 学到的快捷技能</span>
            </div>
            <div className="space-y-2">
              {learned.map((s) => (
                <button key={s.id} onClick={() => runSkill(s.target)}
                  className="w-full text-left flex items-center gap-3 bg-white border-2 border-black p-2.5 transition-colors hover:bg-[#7c8cff]/10 active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 bg-black flex items-center justify-center border border-black" style={{ boxShadow: '1px 1px 0px #7c8cff' }}>
                    <div className="w-1.5 h-1.5" style={{ background: '#7c8cff' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-pixel text-[9px] tracking-wide truncate">{s.name}</div>
                    <div className="text-[11px] text-black/60 leading-tight mt-0.5 truncate">{s.desc || s.target}</div>
                  </div>
                  <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black px-1.5 py-1 bg-black text-[#7CFF6B]">▶ RUN</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-[8px] font-pixel text-black/30 py-2 tracking-widest">
          {feishuMode ? '飞书输入 · Frost 路由 · Skills 执行 · 用户确认' : '端侧管「挑和找」· 云管「写」'}
        </div>
      </div>
    </div>
  );
}
