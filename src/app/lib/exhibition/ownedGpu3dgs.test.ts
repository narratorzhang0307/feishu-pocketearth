import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownedGpu3dgsAvailable, readOwnedGpu3DGS } from './ownedGpu3dgs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('自有 GPU 3DGS 服务合同', () => {
  it('未配置服务时保持纯本地，不假装可以上传', () => {
    vi.stubEnv('VITE_EXHIBIT_3DGS_API_URL', '');
    expect(ownedGpu3dgsAvailable()).toBe(false);
  });

  it('只接受带真实格式与 SHA-256 的 ready 资产', async () => {
    vi.stubEnv('VITE_EXHIBIT_3DGS_API_URL', 'https://owned-gpu.example/');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: 'job-1', status: 'ready', progress: 100,
        assetUrl: '/assets/exhibit-3dgs/example/model.spz', format: 'spz', sha256: 'a'.repeat(64),
      }),
    }));
    await expect(readOwnedGpu3DGS('job-1')).resolves.toMatchObject({ status: 'ready', format: 'spz' });
    expect(fetch).toHaveBeenCalledWith(
      'https://owned-gpu.example/jobs/job-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('拒绝缺哈希或伪造哈希的 ready 响应', async () => {
    vi.stubEnv('VITE_EXHIBIT_3DGS_API_URL', 'https://owned-gpu.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: 'job-2', status: 'ready', progress: 100,
        assetUrl: '/model.ply', format: 'ply', sha256: 'not-a-sha',
      }),
    }));
    await expect(readOwnedGpu3DGS('job-2')).rejects.toThrow('owned_gpu_ready_without_verified_asset');
  });
});
