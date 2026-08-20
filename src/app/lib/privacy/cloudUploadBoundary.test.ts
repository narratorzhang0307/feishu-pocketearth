import { describe, expect, it } from 'vitest';
import { cloudUploadAllowed } from './cloudUploadBoundary';

describe('cloud upload privacy boundary', () => {
  it('requires explicit, purpose-bound confirmation', () => {
    expect(cloudUploadAllowed(null)).toBe(false);
    expect(cloudUploadAllowed({ confirmed: false, purpose: 'public-exhibit-label', confirmedAt: Date.now() })).toBe(false);
    expect(cloudUploadAllowed({ confirmed: true, purpose: 'public-exhibit-label', confirmedAt: Date.now() })).toBe(true);
  });
});
