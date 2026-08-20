import { describe, expect, it } from 'vitest';
import { reviewManifest } from '../agent/manifest';
import { SPACE_AGENTS } from './catalog';
import { toManifest } from './spaceAgent';

describe('Google Space Agents catalog', () => {
  it('declares a Google runtime plane without identity credentials', () => {
    expect(SPACE_AGENTS.length).toBeGreaterThanOrEqual(8);
    expect(SPACE_AGENTS.some((agent) => agent.runTarget === 'photos-agent')).toBe(false);
    for (const agent of SPACE_AGENTS) {
      expect(agent.modelPlane).toMatch(/qwen|local/);
      expect(agent.permissions.scopes).not.toContain('wallet-readonly');
      expect(JSON.stringify(agent)).not.toMatch(/Injective|contract|wallet|NFT/i);
    }
  });

  it('converts installable cards into manifests accepted by the safety gate', () => {
    for (const agent of SPACE_AGENTS.filter((item) => !item.runTarget)) {
      const manifest = { ...toManifest(agent), id: 'test', createdAt: new Date(0).toISOString() };
      expect(reviewManifest(manifest).ok).toBe(true);
    }
  });
});
