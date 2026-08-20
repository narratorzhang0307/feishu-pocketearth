import { keyedStore } from '../skills/keyedStore';

export const FULL3D_MIN_VIEWS = 20;
export const FULL3D_MAX_VIEWS = 80;
export const FULL3D_MAX_FILE_BYTES = 24 * 1024 * 1024;
export const FULL3D_MAX_TOTAL_BYTES = 800 * 1024 * 1024;

export interface Full3DCaptureFrame {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  sha256: string;
  blob: Blob;
}

export interface Full3DCaptureJob {
  id: string;
  artifactId: string;
  createdAt: number;
  updatedAt: number;
  poseRoute: 'colmap-moving-camera';
  frames: Full3DCaptureFrame[];
}

export interface Full3DCaptureManifest {
  schema: 'pocketearth.exhibit-3dgs-capture/v1';
  captureId: string;
  artifactId: string;
  poseRoute: 'colmap-moving-camera';
  views: number;
  totalBytes: number;
  readyToBuild: boolean;
  frames: Array<Omit<Full3DCaptureFrame, 'blob'>>;
}

const store = keyedStore<Full3DCaptureJob>('pe-exhibit-3dgs-captures', 'id');

const hashBlob = async (blob: Blob): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('sha256_unavailable');
  const bytes = await blob.arrayBuffer();
  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
};

export function validateFull3DFiles(files: readonly File[]): void {
  if (!files.length) throw new Error('no_capture_files');
  if (files.length > FULL3D_MAX_VIEWS) throw new Error('too_many_capture_files');
  let total = 0;
  for (const file of files) {
    if (!file.size) throw new Error('empty_capture_file');
    if (file.size > FULL3D_MAX_FILE_BYTES) throw new Error('capture_file_too_large');
    if (!file.type.startsWith('image/')) throw new Error('capture_file_not_image');
    total += file.size;
  }
  if (total > FULL3D_MAX_TOTAL_BYTES) throw new Error('capture_total_too_large');
}

export function captureManifest(job: Full3DCaptureJob): Full3DCaptureManifest {
  const totalBytes = job.frames.reduce((sum, frame) => sum + frame.size, 0);
  return {
    schema: 'pocketearth.exhibit-3dgs-capture/v1',
    captureId: job.id,
    artifactId: job.artifactId,
    poseRoute: job.poseRoute,
    views: job.frames.length,
    totalBytes,
    readyToBuild: job.frames.length >= FULL3D_MIN_VIEWS && job.frames.length <= FULL3D_MAX_VIEWS,
    frames: job.frames.map(({ blob: _blob, ...frame }) => frame),
  };
}

export async function saveFull3DCapture(
  artifactId: string,
  files: readonly File[],
  existingCaptureId?: string,
): Promise<Full3DCaptureManifest> {
  validateFull3DFiles(files);
  const existing = existingCaptureId ? await store.get(existingCaptureId) : null;
  if (existing && existing.artifactId !== artifactId) throw new Error('capture_artifact_mismatch');
  const seen = new Set(existing?.frames.map((frame) => frame.sha256) || []);
  const additions: Full3DCaptureFrame[] = [];
  for (const file of files) {
    const sha256 = await hashBlob(file);
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    additions.push({
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      sha256,
      blob: file,
    });
  }
  const frames = [...(existing?.frames || []), ...additions];
  if (frames.length > FULL3D_MAX_VIEWS) throw new Error('too_many_capture_files');
  if (frames.reduce((sum, frame) => sum + frame.size, 0) > FULL3D_MAX_TOTAL_BYTES) throw new Error('capture_total_too_large');
  const now = Date.now();
  const job: Full3DCaptureJob = {
    id: existing?.id || `capture-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    artifactId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    poseRoute: 'colmap-moving-camera',
    frames,
  };
  await store.put(job);
  const persisted = await store.get(job.id);
  if (!persisted || persisted.frames.length !== frames.length) throw new Error('capture_persistence_failed');
  return captureManifest(persisted);
}

export const getFull3DCapture = (captureId: string): Promise<Full3DCaptureJob | null> => store.get(captureId);
export const deleteFull3DCapture = (captureId: string): Promise<void> => store.del(captureId);
