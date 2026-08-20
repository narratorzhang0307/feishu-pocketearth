import { describe, expect, it } from 'vitest';
import { FROST_PUBLIC_IDENTITIES } from './frostPublicIdentities';

describe('Frost public identity manifests', () => {
  it('keeps five distinct, privacy-safe public identities', () => {
    expect(FROST_PUBLIC_IDENTITIES).toHaveLength(5);
    expect(new Set(FROST_PUBLIC_IDENTITIES.map((item) => item.agentId)).size).toBe(5);
    expect(new Set(FROST_PUBLIC_IDENTITIES.map((item) => item.publicId)).size).toBe(5);

    const serialized = JSON.stringify(FROST_PUBLIC_IDENTITIES).toLowerCase();
    for (const forbidden of ['wallet', 'contract', 'injective', 'nft', 'private key', '助记词']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('documents an explicit boundary for every Agent', () => {
    for (const identity of FROST_PUBLIC_IDENTITIES) {
      expect(identity.publicTraits.length).toBeGreaterThanOrEqual(3);
      expect(identity.boundary.length).toBeGreaterThan(15);
      expect(identity.publicId).toMatch(/^PE-G-0[1-5]-00\d{2}$/);
    }
  });
});
