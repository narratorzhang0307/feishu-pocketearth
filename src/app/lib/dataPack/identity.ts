import type { DataPackDomain } from './types';

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

export function dataPackRecordIdentity(domain: DataPackDomain, value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${domain}:invalid`;
  const record = value as Record<string, unknown>;
  if (domain === 'books' || domain === 'movies') {
    return `${domain}:${normalize(record.title) || `id:${normalize(record.id)}`}`;
  }
  if (domain === 'music') {
    const track = Array.isArray(record.tracks) && record.tracks[0] && typeof record.tracks[0] === 'object'
      ? record.tracks[0] as Record<string, unknown>
      : null;
    const title = normalize(track?.title);
    return title
      ? `music:${title}:${normalize(track?.artist)}`
      : `music:id:${normalize(record.id)}`;
  }
  if (domain === 'photos') {
    const stableId = normalize(record.contentHash);
    return stableId
      ? `photos:id:${stableId}`
      : `photos:${normalize(record.title)}:${normalize(record.city)}:${normalize(record.date)}`;
  }
  return `mapping:id:${normalize(record.id)}`;
}

export function uniqueDataPackRecords<T>(domain: DataPackDomain, records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const identity = dataPackRecordIdentity(domain, record);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
