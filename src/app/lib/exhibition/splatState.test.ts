import { describe, expect, it } from 'vitest';
import { hasRenderableSplat } from './splatState';

describe('hasRenderableSplat', () => {
  it('只把 ready 或旧记录中的可打开资产计为 3D 可看', () => {
    expect(hasRenderableSplat({ status: 'ready', splatId: 'splat-ready' })).toBe(true);
    expect(hasRenderableSplat({ splatUrl: '/legacy.splat' })).toBe(true);
    expect(hasRenderableSplat({ splatId: 'legacy-local-splat' })).toBe(true);
  });

  it('失败或生成中的任务残留 id 不计为 3D 可看', () => {
    expect(hasRenderableSplat({ status: 'failed', splatId: 'failed-task' })).toBe(false);
    expect(hasRenderableSplat({ status: 'reconstructing', splatId: 'kiri-task' })).toBe(false);
    expect(hasRenderableSplat({ splatStatus: 'uploading', splatId: 'upload-task' })).toBe(false);
    expect(hasRenderableSplat({ splatStatus: 'capturing', splatUrl: '/pending.splat' })).toBe(false);
  });

  it('归一带空格或大小写的 KIRI 状态再判断 3D 是否可看', () => {
    expect(hasRenderableSplat({ status: ' Reconstructing ', splatId: 'wrapped-task' })).toBe(false);
    expect(hasRenderableSplat({ status: ' ', splatStatus: ' READY ', splatId: 'ready-task' })).toBe(true);
  });
});
