import { describe, expect, it } from 'vitest';
import { attachFull3D, full3DOf, removeFull3D, viewingAsset } from './representations';
import type { ArtifactDraft, Splat3D } from './types';

const quick: Splat3D = {
  status: 'ready', sourceKind: 'multi-image-2_5d', engine: 'museum-matting-2_5d',
  splatUrl: '/quick/exhibit.json', format: 'multiview-2_5d',
};
const base = { splat: quick, representations: { quick2_5d: quick } } as ArtifactDraft;

describe('展品双表示契约', () => {
  it('高清3D就绪后仍保留2.5D为稳定默认资产', () => {
    const full: Splat3D = {
      status: 'ready', sourceKind: 'multi-image', engine: 'qwen-colmap-gsplat',
      splatId: 'abo-eef43318', format: 'ply',
    };
    const next = attachFull3D(base, full);
    expect(next.splat).toBe(quick);
    expect(next.representations).toEqual({ quick2_5d: quick, full3d: full });
    expect(viewingAsset(next, 'full3d')).toBe(full);
    expect(viewingAsset(next, 'quick2_5d')).toBe(quick);
  });

  it('高清3D失败或缺资产时自动回退2.5D', () => {
    const failed: Splat3D = {
      status: 'failed', sourceKind: 'multi-image', engine: 'qwen-colmap-gsplat', format: 'ply',
    };
    const next = attachFull3D(base, failed);
    expect(viewingAsset(next, 'full3d')).toBe(quick);
    expect(full3DOf(next)?.status).toBe('failed');
  });

  it('移除高清3D不会删除2.5D', () => {
    const full: Splat3D = {
      status: 'ready', sourceKind: 'multi-image', engine: 'qwen-colmap-gsplat',
      splatId: 'full', format: 'spz',
    };
    const next = removeFull3D(attachFull3D(base, full));
    expect(next.splat).toBe(quick);
    expect(next.representations).toEqual({ quick2_5d: quick });
  });
});
