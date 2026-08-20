import { describe, expect, it } from 'vitest';
import { markerInBounds } from './mapMarkers';

describe('markerInBounds', () => {
  it('keeps only markers inside a normal viewport', () => {
    const bounds = { west: 119, south: 29, east: 121, north: 31 };
    expect(markerInBounds({ lng: 120, lat: 30 }, bounds)).toBe(true);
    expect(markerInBounds({ lng: 122, lat: 30 }, bounds)).toBe(false);
  });

  it('supports viewports crossing the antimeridian', () => {
    const bounds = { west: 170, south: -20, east: -170, north: 20 };
    expect(markerInBounds({ lng: 179, lat: 0 }, bounds)).toBe(true);
    expect(markerInBounds({ lng: -179, lat: 0 }, bounds)).toBe(true);
    expect(markerInBounds({ lng: 0, lat: 0 }, bounds)).toBe(false);
  });
});
