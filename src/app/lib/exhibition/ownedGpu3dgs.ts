import { captureManifest, getFull3DCapture } from './full3dCaptureStore';
import { fetchWithDeadline } from '../runtime/fetchWithDeadline';

export interface OwnedGpuJobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'reconstructing' | 'quality_review' | 'ready' | 'failed';
  progress?: number;
  message?: string;
  assetUrl?: string;
  format?: 'ply' | 'splat' | 'ksplat' | 'spz';
  sha256?: string;
}

const configuredBase = (): string => String(import.meta.env.VITE_EXHIBIT_3DGS_API_URL || '').trim().replace(/\/$/, '');

const SHA256 = /^[a-f0-9]{64}$/i;

const validProgress = (progress: number | undefined): boolean => (
  progress === undefined || (Number.isFinite(progress) && progress >= 0 && progress <= 100)
);

export const ownedGpu3dgsAvailable = (): boolean => !!configuredBase();

const requireBase = (): string => {
  const base = configuredBase();
  if (!base) throw new Error('owned_gpu_service_not_configured');
  return base;
};

export async function submitOwnedGpu3DGS(captureId: string): Promise<OwnedGpuJobStatus> {
  const capture = await getFull3DCapture(captureId);
  if (!capture) throw new Error('capture_not_found');
  const manifest = captureManifest(capture);
  if (!manifest.readyToBuild) throw new Error('capture_not_ready');
  const body = new FormData();
  body.append('manifest', new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'manifest.json');
  capture.frames.forEach((frame, index) => body.append('images', frame.blob, `frame-${String(index).padStart(3, '0')}-${frame.name}`));
  // 上传真实多视角素材可能较久，但必须有上限；断网后不能让手机永远卡在“上传中”。
  const response = await fetchWithDeadline(`${requireBase()}/jobs`, { method: 'POST', body }, 5 * 60_000);
  if (!response.ok) throw new Error(`owned_gpu_submit_${response.status}`);
  const payload = await response.json() as OwnedGpuJobStatus;
  if (!payload.jobId || !['queued', 'processing'].includes(payload.status)) throw new Error('owned_gpu_invalid_submit_response');
  return payload;
}

export async function readOwnedGpu3DGS(jobId: string): Promise<OwnedGpuJobStatus> {
  const response = await fetchWithDeadline(`${requireBase()}/jobs/${encodeURIComponent(jobId)}`, {}, 20_000);
  if (!response.ok) throw new Error(`owned_gpu_status_${response.status}`);
  const payload = await response.json() as OwnedGpuJobStatus;
  if (payload.jobId !== jobId) throw new Error('owned_gpu_job_mismatch');
  if (!['queued', 'processing', 'reconstructing', 'quality_review', 'ready', 'failed'].includes(payload.status)) {
    throw new Error('owned_gpu_invalid_status_response');
  }
  if (!validProgress(payload.progress)) throw new Error('owned_gpu_invalid_progress');
  if (payload.status === 'ready' && (
    !payload.assetUrl
    || !payload.format
    || !payload.sha256
    || !['ply', 'splat', 'ksplat', 'spz'].includes(payload.format)
    || !SHA256.test(payload.sha256)
  )) {
    throw new Error('owned_gpu_ready_without_verified_asset');
  }
  return payload;
}
