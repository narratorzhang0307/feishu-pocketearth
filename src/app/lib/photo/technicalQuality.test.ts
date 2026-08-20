import { describe, expect, it } from 'vitest';
import { technicalQualityOf, technicalReasonsOf, valueByType } from './reasoning';
import type { PhotoFeatures } from './types';

const features: PhotoFeatures = {
  dHash: '0000000000000000', w: 100, h: 100, capDate: null, hasCameraFields: false, hasGPS: false,
  softwareIsScreenshot: false, suspectExif: false, sharpness: 0.9, exposure: 0.85, colorful: 0.65,
  contrast: 0.8, mean: 128, aspectScreenHit: false, isUtilityProb: 0.9,
};

describe('technical photo quality', () => {
  it('stays objective even when a photo is routed as a document', () => {
    expect(valueByType(features, 'document')).toBe(45);
    expect(technicalQualityOf(features)).toBeGreaterThan(70);
  });

  it('explains overexposure and underexposure separately', () => {
    expect(technicalReasonsOf({ ...features, mean: 28, exposure: 0.25 })).toContain('欠曝风险（平均亮度 28/255）');
    expect(technicalReasonsOf({ ...features, mean: 228, exposure: 0.25 })).toContain('过曝风险（平均亮度 228/255）');
  });
});
