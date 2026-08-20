import type { DataPackDomain } from './types';

const KEY = 'pe.dataPacks.mapLayers.v1';
const listeners = new Set<() => void>();

function read(): Partial<Record<DataPackDomain, boolean>> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export const isDataPackMapLayerEnabled = (domain: DataPackDomain): boolean => !!read()[domain];

export function setDataPackMapLayerEnabled(domain: DataPackDomain, enabled: boolean) {
  const values = read();
  if (enabled) values[domain] = true;
  else delete values[domain];
  try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* 内存状态仍由当前交互刷新 */ }
  listeners.forEach((listener) => listener());
}

export const subscribeDataPackMapLayers = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
