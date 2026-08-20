import { describe, expect, it } from 'vitest';
import {
  MUSEUM_2_5D_DEMO_HOTSPOTS,
  MUSEUM_2_5D_DEMOS,
  MUSEUM_2_5D_DEMO_VIEWS,
  captureReady,
  hotspotVisibleAtYaw,
  mattingCaptureAccepted,
  nearestObservedView,
  signedYawDelta,
  wrapYaw,
} from './museum2_5d';

describe('museum multi-view 2.5D contract', () => {
  it('ships six distinct reconstructions and preserves archival coverage limits', () => {
    expect(MUSEUM_2_5D_DEMOS).toHaveLength(6);
    expect(new Set(MUSEUM_2_5D_DEMOS.map((demo) => demo.id)).size).toBe(6);
    expect(MUSEUM_2_5D_DEMOS.filter((demo) => demo.views.length === 6).length).toBeGreaterThanOrEqual(4);
    expect(MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-315439-rong-mirror')?.views).toHaveLength(2);
    expect(MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-204612-jade-bi')?.views).toHaveLength(4);
    expect(MUSEUM_2_5D_DEMOS.flatMap((demo) => demo.views).every((view) => view.observed)).toBe(true);
  });

  it('keeps only observed views and wraps yaw', () => {
    expect(MUSEUM_2_5D_DEMO_VIEWS).toHaveLength(6);
    expect(MUSEUM_2_5D_DEMO_VIEWS.every((view) => view.observed)).toBe(true);
    expect(wrapYaw(-59)).toBe(301);
    expect(nearestObservedView(359).yawDeg).toBe(0);
    expect(signedYawDelta(350, 10)).toBe(20);
  });

  it('packages the archival originals for direct matting comparison', () => {
    const bronze = MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-200497-li');
    expect(bronze?.views).toHaveLength(6);
    expect(bronze?.views.every((view) => view.originalUrl?.includes('/originals/'))).toBe(true);
    expect(bronze?.views[5].originalUrl).toContain('view-05-300.jpg');
  });

  it('refuses an under-captured exhibit', () => {
    expect(captureReady(5)).toBe(false);
    expect(captureReady(6)).toBe(true);
    expect(captureReady(8)).toBe(true);
    expect(captureReady(9)).toBe(false);
  });

  it('quality-gates tiny targets and whole-scene masks', () => {
    expect(mattingCaptureAccepted(0.02)).toBe(false);
    expect(mattingCaptureAccepted(0.42)).toBe(true);
    expect(mattingCaptureAccepted(0.93)).toBe(false);
  });

  it('attaches a separate detail photo to one observed angle', () => {
    const [hotspot] = MUSEUM_2_5D_DEMO_HOTSPOTS;
    expect(hotspot.captureRole).toBe('separate_detail_photo');
    expect(hotspot.detailPhotoUrl).toBeUndefined();
    expect(hotspotVisibleAtYaw(2, hotspot)).toBe(true);
    expect(hotspotVisibleAtYaw(90, hotspot)).toBe(false);
  });
});
