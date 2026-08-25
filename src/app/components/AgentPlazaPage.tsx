import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, CloudDownload, Database, Lock, PackageCheck, Pause, PawPrint, Play, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  BUILTIN_SKILLS,
  disableSkill,
  ensureBuiltinSkills,
  getEquippedSkill,
  installSkillFromUrl,
  listInstalledSkills,
  prepareAndEquipSkill,
  cancelSkillPreparation,
  rollbackSkill,
  subscribeSkillsRegistry,
  uninstallSkillWithAssets,
  type InstalledSkill,
  type SkillManifest,
} from '../lib/skill';
import { skillPublisherForManifest, type SkillPublisher } from '../data/skillPublishers';

interface Props {
  onBack: () => void;
  onRun: (target: string) => void;
}

const ACCENT = '#326B55';
const PILL = 'inline-flex items-center gap-1 border border-black/50 bg-[#f2f0e8] px-1.5 py-0.5 text-[8px] tracking-wide';
const DISPLAY_DESCRIPTIONS: Record<string, string> = {
  'pocket.reading-jot': '拍摄书页并框定原文，复核后保存为可追溯的阅读卡片。',
  'pocket.travel': '理解时间与偏好约束，用可靠工具规划路线并钉回地球。',
  'pocket.exhibition': '识读展签、整理展品观察，明确授权后再补全资料。',
  'pocket.book-to-earth': '识读书籍和资料，保留原文证据，经人工确址后生成独立 Mapping Data Pack。',
  'pocket.rubbing': '对照识读碑拓；修复只改用户涂选的残损区域，原图始终保留。',
};

function displayQualityGate(manifest: SkillManifest): string {
  if (manifest.identity.id === 'pocket.reading-jot') return '清晰选区直接识读；退化图片采用增强候选；强分歧必须人工校文；最终写入前取得用户确认';
  if (manifest.runtime.execution === 'mnn') return '处理失败时停止并保留原资料；低置信度结果不得覆盖原始资料；最终写入前取得用户确认';
  return manifest.quality_gate.checks.join('；');
}

function SkillCard({ manifest, installed, publisher, onRun }: { manifest: SkillManifest; installed?: InstalledSkill; publisher: SkillPublisher; onRun: (target: string) => void }) {
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const equipped = getEquippedSkill(manifest.identity.id)?.key === installed?.key;
  const canRollback = !!installed?.previousKey;
  const preparing = installed?.status === 'downloading' || installed?.status === 'verifying';
  const install = async () => {
    const skill = installed || (() => { throw new Error('内置 Skill 尚未注册'); })();
    setLocalError(''); setProgress(0);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await prepareAndEquipSkill(skill.key, {
        signal: controller.signal,
        onProgress: (value) => setProgress(value.total ? Math.min(100, Math.round(value.downloaded / value.total * 100)) : value.phase === 'done' ? 100 : 0),
      });
    } catch (reason) {
      if (!controller.signal.aborted) setLocalError(String(reason));
    } finally { abortRef.current = null; }
  };
  const cancel = async () => {
    abortRef.current?.abort();
    if (installed) await cancelSkillPreparation(installed.key);
  };
  const remove = async () => {
    if (!installed) return;
    setLocalError('');
    try { await uninstallSkillWithAssets(installed.key); }
    catch (reason) { setLocalError(String(reason)); }
  };
  return (
    <article className="border-2 border-black bg-white">
      <div className="flex items-start gap-2.5 p-2.5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]">
          <img src={publisher.avatar} alt={`${publisher.name}的发布者头像`} className="h-full w-full object-contain" loading="lazy" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-pixel text-[9px] tracking-wide">{manifest.identity.name}</h3>
            <span className="shrink-0 text-[8px] text-black/35">v{manifest.identity.version}</span>
          </div>
          <p className="mt-0.5 truncate text-[8.5px] font-bold text-[#18784b]">{publisher.name} · {publisher.role} 发布</p>
          <p className="mt-1 text-[10px] leading-snug text-black/60">{DISPLAY_DESCRIPTIONS[manifest.identity.id] || manifest.identity.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={PILL}><Lock className="h-2.5 w-2.5" />{manifest.permissions.scopes.length ? manifest.permissions.scopes.join('·') : '无额外权限'}</span>
            {manifest.data.schemas.length > 0 && <span className={PILL}><Database className="h-2.5 w-2.5" />Data Pack 可替换</span>}
            <span className={`${PILL} ${manifest.evaluation.passed ? 'text-[#238c57]' : 'text-[#b3261e]'}`}><ShieldCheck className="h-2.5 w-2.5" />静态门 {Math.round(manifest.evaluation.score * 100)}%</span>
            <span className={`${PILL} text-[#18784b]`}><Lock className="h-2.5 w-2.5" />只写入我的私人库</span>
          </div>
          <p className="mt-1 text-[8px] leading-snug text-black/45">门禁：{displayQualityGate(manifest)}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-black/20 bg-[#f4f1e7] px-2.5 py-2">
        <span className={`mr-auto font-pixel text-[7px] ${equipped ? 'text-[#238c57]' : installed ? 'text-black/45' : 'text-[#b3261e]'}`}>
          {equipped ? '● 私人库 · 已装入' : preparing ? `↓ 写入私人库 ${progress}%` : installed?.status === 'failed' ? '× 安装失败' : installed ? '○ 等待装入私人库' : '○ 未登记'}
        </span>
        {equipped ? <>
          <button type="button" onClick={() => onRun(manifest.entry.target)} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1 text-[9px] font-bold text-[#7CFF6B] active:translate-y-px"><Play className="h-3 w-3" />打开</button>
          <button type="button" onClick={() => disableSkill(manifest.identity.id)} title="暂时停用；私人知识与 Data Pack 保留" className="grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"><Pause className="h-3.5 w-3.5" /></button>
        </> : preparing ? <button type="button" onClick={cancel} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold text-[#b3261e] active:translate-y-px"><X className="h-3 w-3" />取消</button>
          : installed ? <button type="button" onClick={install} className="flex items-center gap-1 border-2 border-black px-2 py-1 text-[9px] font-bold text-white active:translate-y-px" style={{ background: ACCENT }}><PackageCheck className="h-3 w-3" />{manifest.assets.length ? '准备并装入' : '装入私人库'}</button> : null}
        {canRollback && <button type="button" onClick={() => rollbackSkill(manifest.identity.id)} title="回滚上一版本" className="grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"><RotateCcw className="h-3.5 w-3.5" /></button>}
        {installed && (installed.source !== 'builtin' || manifest.assets.length > 0) && <button type="button" onClick={remove} title="移除 Skill 与未共享资产；私人知识数据保留" className="grid h-7 w-7 place-items-center border-2 border-black bg-white text-[#b3261e] active:translate-y-px"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {(localError || installed?.error) && <p className="border-t border-[#b3261e]/30 bg-[#fff0ed] px-2.5 py-1.5 text-[8px] leading-snug text-[#b3261e]">{localError || installed?.error}</p>}
    </article>
  );
}

export default function AgentPlazaPage({ onBack, onRun }: Props) {
  const [version, setVersion] = useState(0);
  const [manifestUrl, setManifestUrl] = useState('');
  const [installState, setInstallState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    ensureBuiltinSkills();
    return subscribeSkillsRegistry(() => setVersion((value) => value + 1));
  }, []);
  const installed = useMemo(() => new Map(listInstalledSkills().map((skill) => [skill.key, skill])), [version]);
  const manifests = BUILTIN_SKILLS;
  const equippedCount = useMemo(() => BUILTIN_SKILLS.filter((manifest) => !!getEquippedSkill(manifest.identity.id)).length, [version]);
  const installRemote = async () => {
    if (!manifestUrl.trim() || installState === 'loading') return;
    setInstallState('loading'); setError('');
    try {
      const skill = await installSkillFromUrl(manifestUrl.trim());
      await prepareAndEquipSkill(skill.key);
      setManifestUrl(''); setInstallState('done');
    } catch (reason) {
      setError(String(reason)); setInstallState('error');
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain bg-[#EAEAEA] font-sans">
      <header className="flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="返回 Skills" className="grid h-9 w-9 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0 flex-1"><div className="font-pixel text-[11px] tracking-wider">PRIVATE SKILLS PLAZA</div><div className="mt-0.5 text-[9px] text-black/45">小动物 Agent 发布 · 只装入你的私人知识库</div></div>
        <PawPrint className="h-5 w-5" style={{ color: ACCENT }} />
      </header>

      <div className="flex items-center justify-between border-b-2 border-black bg-black px-4 py-2.5 font-pixel text-[7px] tracking-wider text-[#7CFF6B]">
        <span>{listInstalledSkills().length} 已登记</span><span>{equippedCount} 已装入</span><span>只写私人库</span><span>哈希可验</span>
      </div>

      <main className="space-y-2.5 px-3 py-2.5">
        <section className="border-2 border-black bg-white p-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /><b className="text-[11px]">一个入口 · 一个私人知识库</b></div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-black/60">每个 Skill 只说明它能做什么、会访问什么数据、产出什么结果。装入后只读取或写入你的私人知识库，最终落图与飞书写回都由你确认。</p>
        </section>

        <section className="border-2 border-black bg-[#f4f1e7] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-pixel text-[7px]"><CloudDownload className="h-3.5 w-3.5" />从可信地址带回私人库</div>
          <div className="flex gap-1.5"><input value={manifestUrl} onChange={(event) => setManifestUrl(event.target.value)} placeholder="HTTPS Skill Manifest 地址" className="min-w-0 flex-1 border-2 border-black bg-white px-2 py-1.5 text-[10px] outline-none" /><button type="button" onClick={installRemote} disabled={!manifestUrl.trim() || installState === 'loading'} className="border-2 border-black bg-black px-2 text-[9px] font-bold text-[#7CFF6B] disabled:opacity-40">{installState === 'loading' ? '校验中' : '装入'}</button></div>
          {error && <p className="mt-1.5 text-[8px] text-[#b3261e]">{error}</p>}
        </section>

        <section className="space-y-2">
          {manifests.map((manifest) => <SkillCard key={manifest.identity.id} manifest={manifest} installed={installed.get(`${manifest.identity.id}@${manifest.identity.version}`)} publisher={skillPublisherForManifest(manifest.identity.id)} onRun={onRun} />)}
        </section>
        <p className="pt-1 text-center font-pixel text-[7px] tracking-wider text-black/35">小动物负责发布 · FROST 负责运行 · 知识始终只属于你</p>
      </main>
    </div>
  );
}
