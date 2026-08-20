import { keyedStore } from '../skills/keyedStore';
import type { PhotoRadarAnalysis } from './radarTypes';

const store = keyedStore<PhotoRadarAnalysis>('pe-photo-radar-v1', 'key');

export const getRadarAnalysis = (key: string): Promise<PhotoRadarAnalysis | null> => store.get(key);
export const getRadarAnalyses = (): Promise<PhotoRadarAnalysis[]> => store.all();
export const putRadarAnalysis = (analysis: PhotoRadarAnalysis): Promise<void> => store.put(analysis);
export const putRadarAnalyses = (analyses: PhotoRadarAnalysis[]): Promise<void> => store.putMany(analyses);
export const removeRadarAnalysis = (key: string): Promise<void> => store.del(key);

export async function clearPhotoRadar(): Promise<void> {
  const all = await store.all();
  await store.delMany(all.map((item) => item.key));
}
