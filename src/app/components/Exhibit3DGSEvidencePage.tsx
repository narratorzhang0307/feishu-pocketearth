import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Viewer3D from './Viewer3D';

type Evidence = {
  status: string;
  object: { label: string; source: string; license: string; publicUse: string };
  capture: { views: number; maximumYawGapDegrees: number; status: string };
  alpha: { viewsPassed: number; viewsTotal: number; model: string; runtime: string; status: string };
  pose: { route: string; source: string; notColmap: boolean; status: string };
  quick2_5d: { status: string; manifest: string; baselineView: string; specialistView: string; specialistAlpha: string };
  modelProof: { blindBest: string; blindRegression: string };
  full3d: { status: string; asset: string | null; format: string | null; sha256: string | null };
  assetRetention: { root: string; persistentMaterialExample: boolean; temporarySignedUrlAllowed: boolean; plannedFiles: string[] };
  immutableJobArchive: { name: string; sha256: string; bytes: number };
  mobileBoundary: { status: string; checkedFiles: number; cloudDependenciesInApp: number; viewer: string };
};

const MANIFEST = '/assets/exhibit-3dgs/abo-eef43318/evidence-manifest.json';
const VIEWER_DEMO = '/exhibits/preset-nike.splat';

const openViewerDemoFromUrl = (): boolean => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('exhibit3dViewerDemo') === '1';
  } catch { return false; }
};

const Gate = ({ label, value, passed = true }: { label: string; value: string; passed?: boolean }) => (
  <div className="border border-black bg-[#fffdf5] p-2">
    <div className="font-pixel text-[7px] text-black/45">{label}</div>
    <div className="mt-1 flex items-center gap-1 font-pixel text-[8px]">
      <span style={{ color: passed ? '#2f7d5d' : '#b06f18' }}>{passed ? '● PASS' : '◆ PENDING'}</span>
      <span className="break-all">{value}</span>
    </div>
  </div>
);

export default function Exhibit3DGSEvidencePage({ onClose }: { onClose: () => void }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState('');
  const [viewerDemoOpen, setViewerDemoOpen] = useState(openViewerDemoFromUrl);

  useEffect(() => {
    fetch(MANIFEST)
      .then((response) => {
        if (!response.ok) throw new Error(`evidence ${response.status}`);
        return response.json();
      })
      .then(setEvidence)
      .catch(() => setError('证据清单读取失败'));
  }, []);

  return (
    <div className="absolute inset-0 z-[150] overflow-y-auto bg-[#efeade] text-black">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-black bg-[#18344f] px-3 py-2 text-white">
        <div>
          <div className="font-pixel text-[10px]">3DGS 胜例证据 · ABO EEF43318</div>
          <div className="mt-1 text-[10px] text-white/65">同一真实陶器 · 72 张环绕照片 · 2.5D 默认 + 高清 3D 可选</div>
        </div>
        <button onClick={onClose} aria-label="关闭证据页" className="flex h-8 w-8 items-center justify-center border-2 border-[#c8a24b] bg-black">
          <X className="h-4 w-4 text-[#c8a24b]" strokeWidth={3} />
        </button>
      </header>

      {error && <div className="m-3 border-2 border-black bg-[#ffd9d2] p-3 font-pixel text-[8px]">{error}</div>}
      {!evidence && !error && <div className="p-8 text-center font-pixel text-[8px]">读取可回查证据…</div>}
      {evidence && <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Gate label="采集覆盖" value={`${evidence.capture.views}/${evidence.capture.views} · 最大缺口 ${evidence.capture.maximumYawGapDegrees}°`} />
          <Gate label="抠图门禁" value={`${evidence.alpha.viewsPassed}/${evidence.alpha.viewsTotal} · ${evidence.alpha.runtime}`} />
          <Gate label="位姿来源" value={`${evidence.pose.route} · 非冒充 COLMAP`} />
          <Gate label="高清 3D" value={evidence.full3d.status === 'ready' ? `${evidence.full3d.format} · 已验收` : '等待 PAI 实际优化'} passed={evidence.full3d.status === 'ready'} />
        </section>

        <section className="border-2 border-black bg-[#fffdf5] p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-pixel text-[10px]">模型是否真的改善抠图</h2>
            <span className="font-pixel text-[7px] text-black/45">冻结盲测 · 原图 / 真值 / 原生基线 / 博物馆专项模型</span>
          </div>
          <img src={evidence.modelProof.blindBest} alt="博物馆专项模型与原生抠图基线的冻结盲测对照" className="w-full border border-black object-contain" />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
          {[
            ['通用抠图基线', evidence.quick2_5d.baselineView, '用于对照，不作为最终产品输出'],
            ['博物馆专项 MNN', evidence.quick2_5d.specialistView, `${evidence.alpha.model} · 72 页全过门禁`],
            ['最终 Alpha', evidence.quick2_5d.specialistAlpha, '透明通道单独留证；不只展示最好角度'],
          ].map(([title, src, note]) => <article key={title} className="border-2 border-black bg-[#fffdf5] p-2">
            <div className="mb-2 font-pixel text-[8px]">{title}</div>
            <div className="flex aspect-square items-center justify-center bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px]">
              <img src={src} alt={title} className="h-full w-full object-contain" />
            </div>
            <div className="mt-2 text-[10px] text-black/55">{note}</div>
          </article>)}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <article className="overflow-hidden border-2 border-black bg-[#fffdf5]">
            <div className="border-b border-black px-3 py-2 font-pixel text-[8px]">快速 2.5D · 已可交互</div>
            <div className="h-[440px]"><Viewer3D url={evidence.quick2_5d.manifest} format="multiview-2_5d" /></div>
          </article>
          <article className="flex min-h-[440px] flex-col border-2 border-black bg-[#fffdf5]">
            <div className="flex items-center justify-between gap-2 border-b border-black px-3 py-2">
              <div className="font-pixel text-[8px]">高清 3DGS · 用户主动升级</div>
              {evidence.full3d.status !== 'ready' && <button onClick={() => setViewerDemoOpen((open) => !open)}
                className="shrink-0 border border-black px-2 py-1 font-pixel text-[7px] active:translate-y-px"
                style={{ background: viewerDemoOpen ? '#fffdf5' : '#c8a24b' }}>
                {viewerDemoOpen ? '返回 ABO 状态' : '体验现成 3D'}
              </button>}
            </div>
            {evidence.full3d.status === 'ready' && evidence.full3d.asset && evidence.full3d.format ?
              <div className="min-h-0 flex-1 bg-black"><Viewer3D url={evidence.full3d.asset} format={evidence.full3d.format} /></div> :
              viewerDemoOpen ? <div className="relative min-h-[440px] flex-1 bg-black">
                <div className="absolute left-2 top-2 z-10 border border-[#c8a24b] bg-black/85 px-2 py-1 font-pixel text-[7px] text-[#c8a24b]">
                  查看器体验 · NIKE SPLAT · 非 ABO 训练成果
                </div>
                <Viewer3D url={VIEWER_DEMO} format="splat" sceneRotation={[0, 0, 1, 0]} />
              </div> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="font-pixel text-[12px] text-[#b06f18]">◆ 等待 PAI GPU 接纳恢复</div>
                <div className="max-w-sm text-[11px] leading-relaxed text-black/55">这里不会放演示占位模型。只有 Splatfacto 实际完成、PLY/SPZ 哈希固定、盲视角和加载回退都通过后，才会显示同一 ABO 陶器的高清 splat。</div>
              </div>}
          </article>
        </section>

        <section className="border-2 border-black bg-[#fffdf5] p-3 text-[10px] leading-relaxed">
          <div className="font-pixel text-[8px]">可复核身份</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>数据：{evidence.object.source} · {evidence.object.license}</div>
            <div>用途：{evidence.object.publicUse}</div>
            <div>任务包：{evidence.immutableJobArchive.name} · {(evidence.immutableJobArchive.bytes / 1048576).toFixed(1)}MB</div>
            <div className="break-all">SHA-256：{evidence.immutableJobArchive.sha256}</div>
            <div>移动端隔离：扫描 {evidence.mobileBoundary.checkedFiles} 文件 · 云端训练依赖 {evidence.mobileBoundary.cloudDependenciesInApp}</div>
            <div>手机只保留查看器：{evidence.mobileBoundary.viewer}</div>
            <div className="break-all">胜例素材目录：{evidence.assetRetention.root}</div>
            <div>长期留存：{evidence.assetRetention.persistentMaterialExample ? '是' : '否'} · 临时签名链接：{evidence.assetRetention.temporarySignedUrlAllowed ? '允许' : '不允许'}</div>
          </div>
        </section>
      </main>}
    </div>
  );
}
