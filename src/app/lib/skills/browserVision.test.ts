import { describe, expect, it } from 'vitest';
import { hamming, perceptualHashFromLuma } from './browserVision';

const pattern = (fn: (x: number, y: number) => number): Float64Array =>
  Float64Array.from({ length: 32 * 32 }, (_, index) => fn(index % 32, Math.floor(index / 32)));

describe('browser perceptual hash', () => {
  it('is insensitive to a uniform brightness offset because the DC term is excluded', () => {
    const base = pattern((x, y) => (x * 5 + y * 3 + ((x + y) % 7) * 9) % 180);
    const brighter = Float64Array.from(base, (value) => value + 35);
    const first = perceptualHashFromLuma(base);
    const second = perceptualHashFromLuma(brighter);
    expect(first).toHaveLength(16);
    expect(second).toBe(first);
  });

  it('separates clearly different low-frequency structures', () => {
    const horizontal = perceptualHashFromLuma(pattern((x) => x * 8));
    const vertical = perceptualHashFromLuma(pattern((_x, y) => y * 8));
    expect(hamming(horizontal, vertical)).toBeGreaterThan(6);
  });

  it('fails closed for malformed input', () => {
    expect(perceptualHashFromLuma([1, 2, 3])).toBe('');
  });
});
