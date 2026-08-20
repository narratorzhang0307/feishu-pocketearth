import { describe, expect, it } from 'vitest';
import { evaluatePhotoDeviceBudget } from './deviceBudget';

describe('photo device budget', () => {
  it('pauses heavy indexing in the background or under serious thermal pressure', () => {
    expect(evaluatePhotoDeviceBudget({ visibility: 'hidden' }).allowed).toBe(false);
    expect(evaluatePhotoDeviceBudget({ visibility: 'visible', thermalState: 'serious' }).allowed).toBe(false);
  });

  it('pauses below 20% only when unplugged', () => {
    expect(evaluatePhotoDeviceBudget({ visibility: 'visible', batteryLevel: 0.19, charging: false }).allowed).toBe(false);
    expect(evaluatePhotoDeviceBudget({ visibility: 'visible', batteryLevel: 0.19, charging: true }).allowed).toBe(true);
  });

  it('fails open when the WebView exposes no battery or thermal API', () => {
    expect(evaluatePhotoDeviceBudget({ visibility: 'visible' })).toEqual({ visibility: 'visible', allowed: true });
  });
});
