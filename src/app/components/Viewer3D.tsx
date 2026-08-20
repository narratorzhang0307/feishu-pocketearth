// 3D 分发器：按格式把展品送到正确的渲染器。
// - 高斯泼溅(.ply/.splat/.ksplat) → ExhibitViewer（@mkkellogg/gaussian-splats-3d）
// - 网格 mesh(.glb/.gltf) → MeshViewer（three.js GLTFLoader）
// 两者都懒加载（同属 splat3d 异步块），只在点开 3D 时才下载渲染器代码。
import { Suspense } from 'react';
import { lazyRetry } from '../lib/runtime/lazyRetry';

const ExhibitViewer = lazyRetry(() => import('./ExhibitViewer'));
const MeshViewer = lazyRetry(() => import('./MeshViewer'));
const Museum2_5DViewer = lazyRetry(() => import('./Museum2_5DViewer'));

const MESH_FORMATS = ['glb', 'gltf'];
const SPLAT_FORMATS = ['ply', 'splat', 'ksplat', 'spz'];
const MESH_MIME_FORMATS: Record<string, string> = {
  'model/gltf': 'gltf',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/gltf-json': 'gltf',
};

function normalize3DFormat(format?: string): string {
  const raw = (format || '').trim().toLowerCase();
  const cleanMime = raw.split(';', 1)[0].trim();
  const byMime = MESH_MIME_FORMATS[cleanMime];
  if (byMime) return byMime;
  const cleanPath = cleanMime.split(/[?#]/, 1)[0];
  return (cleanPath.includes('.') ? cleanPath.split('.').pop() : cleanPath)?.replace(/^\./, '') || '';
}

export function isMeshFormat(format?: string): boolean {
  return MESH_FORMATS.includes(normalize3DFormat(format));
}

export function shouldUseMeshViewer(format?: string, url?: string): boolean {
  const normalizedFormat = normalize3DFormat(format);
  if (MESH_FORMATS.includes(normalizedFormat)) return true;
  if (SPLAT_FORMATS.includes(normalizedFormat)) return false;
  return isMeshFormat(url);
}

export default function Viewer3D({ url, format, onError, sceneRotation }: {
  url: string;
  format?: string;
  onError?: () => void;
  sceneRotation?: readonly [number, number, number, number];
}) {
  if ((format || '').toLowerCase() === 'multiview-2_5d') {
    return (
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-[10px] text-white/50 font-pixel">加载 2.5D…</div>}>
        <div className="h-full w-full bg-[#d9d1c3] p-3 sm:p-8"><Museum2_5DViewer fill assetUrl={url} /></div>
      </Suspense>
    );
  }
  const mesh = shouldUseMeshViewer(format, url);
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-[10px] text-white/50 font-pixel">加载 3D…</div>}>
      {mesh ? <MeshViewer url={url} onError={onError} /> : <ExhibitViewer url={url} format={format} onError={onError} sceneRotation={sceneRotation} />}
    </Suspense>
  );
}
