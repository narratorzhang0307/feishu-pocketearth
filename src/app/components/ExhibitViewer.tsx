// 3D 高斯泼溅展品 viewer（看展搭子 L4 展示端）。
// 懒加载 @mkkellogg/gaussian-splats-3d（three.js），加载 .ply/.splat/.ksplat 渲染，内置轨道控制器旋转浏览。
// 卸载严格 dispose（iOS Safari WebGL 内存敏感）；加载失败 onError 回落照片，用户永远看得到展品。
// 采集→重建（绕拍 → 自有 GPU 出 splat）是 P2 管线，此组件只负责「有 splatUrl 就能转」。
import { useEffect, useRef, useState } from 'react';
import { importWithChunkRecovery } from '../lib/runtime/lazyRetry';

interface Viewer { dispose?: () => void; start?: () => void; addSplatScene?: (u: string, o?: unknown) => Promise<void>; }

function sceneFormatOption(GS: unknown, format?: string): unknown {
  const sceneFormat = (GS as { SceneFormat?: Record<string, unknown> }).SceneFormat;
  const key = (format || '').toLowerCase();
  if (!sceneFormat) return undefined;
  if (key === 'ply') return sceneFormat.Ply;
  if (key === 'splat') return sceneFormat.Splat;
  if (key === 'ksplat') return sceneFormat.KSplat;
  if (key === 'spz') return sceneFormat.Spz;
  return undefined;
}

export default function ExhibitViewer({ url, format, onError, sceneRotation }: {
  url: string;
  format?: string;
  onError?: () => void;
  sceneRotation?: readonly [number, number, number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const onErrorRef = useRef(onError);
  const rotationKey = sceneRotation?.join(',') || '';
  onErrorRef.current = onError;   // 每次渲染同步最新回调、但不进 effect 依赖 → 父组件 toast/无关 setState 不再 dispose+重下整个 20–200MB splat
  useEffect(() => {
    let viewer: Viewer | null = null;
    let disposed = false;
    (async () => {
      try {
        // spz 的 gzip 解压走 DecompressionStream（渲染库唯一路径，无 fallback）：iOS Safari 16.4+ 才有。
        // 旧系统给明确指引而不是笼统「加载失败」，用户知道换 .ply 导出就能看。
        if ((format || '').toLowerCase() === 'spz' && typeof DecompressionStream === 'undefined') {
          setErrMsg('这台设备的系统偏旧（需 iOS 16.4+）不支持 SPZ · 请在云端重建工具里改导出 .ply 再导入');
          setErr(true); onErrorRef.current?.();
          return;
        }
        const GS = await importWithChunkRecovery(() => import('@mkkellogg/gaussian-splats-3d'));
        if (disposed || !ref.current) return;
        const V = (GS as unknown as { Viewer: new (o: unknown) => Viewer }).Viewer;
        viewer = new V({
          rootElement: ref.current,
          sharedMemoryForWorkers: false,        // PWA 无 COOP/COEP 跨源隔离头 → 关 SharedArrayBuffer 路径，否则 worker 报错
          gpuAcceleratedSort: false,            // SAB 关时 GPU 排序也应关（移动端本就默认 false）
          sphericalHarmonicsDegree: 0,          // 省显存、抬高 splat 点数上限；单物体视角无关着色够用
          freeIntermediateSplatData: true,      // 上传 GPU 后释放 CPU 端数组，降 iOS Safari 峰值内存
          halfPrecisionCovariancesOnGPU: true,  // 移动端省显存
        });
        const forcedFormat = sceneFormatOption(GS, format);
        // spz 是整体压缩容器（Niantic 格式），不支持渐进流式解析——渐进只留给 ply/splat/ksplat
        const progressiveLoad = (format || '').toLowerCase() !== 'spz';
        await viewer.addSplatScene?.(url, {
          showLoadingUI: true,
          progressiveLoad,
          ...(forcedFormat === undefined ? {} : { format: forcedFormat }),
          ...(sceneRotation ? { rotation: [...sceneRotation] } : {}),
        });
        if (!disposed) viewer.start?.();
      } catch { setErr(true); onErrorRef.current?.(); }
    })();
    return () => { disposed = true; try { viewer?.dispose?.(); } catch { /* 已释放 */ } };
  }, [url, format, rotationKey]);

  if (err) return <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60 font-pixel px-6 text-center leading-relaxed">{errMsg || '3D 加载失败 · 请看照片'}</div>;
  return <div ref={ref} className="w-full h-full" />;
}
