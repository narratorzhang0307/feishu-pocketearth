import type { Splat3D } from './types';

export interface RenderableSplatLike {
  status?: Splat3D['status'] | string;
  splatStatus?: Splat3D['status'] | string;
  splatUrl?: string;
  splatId?: string;
}

const IN_PROGRESS_SPLAT_STATUS = new Set(['capturing', 'uploading', 'reconstructing']);

const normalizedSplatStatus = (status?: string) => String(status || '').trim().toLowerCase();

export function hasRenderableSplat(splat?: RenderableSplatLike | null): boolean {
  if (!splat) return false;
  const status = normalizedSplatStatus(splat.status) || normalizedSplatStatus(splat.splatStatus);
  if (status === 'failed' || IN_PROGRESS_SPLAT_STATUS.has(status)) return false;
  return status === 'ready' || !!splat.splatUrl || !!splat.splatId;
}
