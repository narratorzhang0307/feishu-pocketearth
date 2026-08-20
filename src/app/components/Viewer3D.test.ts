import { describe, expect, it } from 'vitest';
import { isMeshFormat, shouldUseMeshViewer } from './Viewer3D';

describe('Viewer3D · KIRI/GMI 3D 格式分发', () => {
  it('把真实 3D 返回里的文件名、URL 和 MIME 归一到 mesh viewer', () => {
    expect(isMeshFormat('glb')).toBe(true);
    expect(isMeshFormat('.GLB')).toBe(true);
    expect(isMeshFormat('artifact.final.glb')).toBe(true);
    expect(isMeshFormat('https://cdn.example.com/kiri/model.gltf?download=1#viewer')).toBe(true);
    expect(isMeshFormat('model/gltf-binary')).toBe(true);
    expect(isMeshFormat('model/gltf+json; charset=utf-8')).toBe(true);
  });

  it('不把高斯泼溅或不可预览格式误分发到 mesh viewer', () => {
    expect(isMeshFormat('spz')).toBe(false);
    expect(isMeshFormat('ply')).toBe(false);
    expect(isMeshFormat('application/x-spz')).toBe(false);
    expect(isMeshFormat('model/obj')).toBe(false);
  });

  it('KIRI/GMI 只保留模型 URL 时仍能分发到 mesh viewer', () => {
    expect(shouldUseMeshViewer('', 'https://cdn.example.com/kiri/jobs/scan.final.glb?token=1')).toBe(true);
    expect(shouldUseMeshViewer('application/octet-stream', 'https://cdn.example.com/gmi/artifact.gltf#preview')).toBe(true);
    expect(shouldUseMeshViewer(undefined, 'blob:local-scan')).toBe(false);
    expect(shouldUseMeshViewer('spz', 'https://cdn.example.com/kiri/scan.glb')).toBe(false);
  });
});
