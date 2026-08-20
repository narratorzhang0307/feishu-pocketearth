import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from './builtins';
import { SkillProtocolError, validateSkillManifest } from './protocol';
import { disableSkill, ensureBuiltinSkills, equipSkill, getEquippedSkill, installSkillManifest, listInstalledSkills, resetSkillRegistryForTests, rollbackSkill, uninstallSkill } from './index';

describe('pocket-skill/v1', () => {
  beforeEach(() => resetSkillRegistryForTests());

  it('accepts all built-in Markdown/LoRA/hybrid manifests', () => {
    expect(BUILTIN_SKILLS.map(validateSkillManifest)).toHaveLength(BUILTIN_SKILLS.length);
  });

  it('publishes Reading Jot with a conditional LoRA gate', () => {
    const readingJot = BUILTIN_SKILLS.find((item) => item.identity.id === 'pocket.reading-jot');
    expect(readingJot?.quality_gate.policy_id).toBe('pocket.reading-jot-gate/v2');
    expect(readingJot?.quality_gate.checks).toEqual(expect.arrayContaining([
      expect.stringContaining('不运行 LoRA'),
      expect.stringContaining('独立增强视图'),
      expect.stringContaining('人工校文'),
    ]));
  });

  it('rejects unknown fields, incompatible bases and undeclared network', () => {
    const base = structuredClone(BUILTIN_SKILLS[0]) as any;
    base.debug = true;
    expect(() => validateSkillManifest(base)).toThrow(SkillProtocolError);

    const lora = structuredClone(BUILTIN_SKILLS.find((item) => item.kind === 'lora')!) as any;
    delete lora.runtime.base;
    expect(() => validateSkillManifest(lora)).toThrow(/基座/);

    const network = structuredClone(BUILTIN_SKILLS[0]) as any;
    network.permissions.network_hosts = ['example.com'];
    expect(() => validateSkillManifest(network)).toThrow(/network scope/);
  });

  it('installs, equips, disables, upgrades, rolls back and uninstalls', () => {
    const v1 = installSkillManifest(BUILTIN_SKILLS[0]);
    equipSkill(v1.key);
    expect(getEquippedSkill(v1.manifest.identity.id)?.key).toBe(v1.key);
    disableSkill(v1.manifest.identity.id);
    expect(getEquippedSkill(v1.manifest.identity.id)).toBeUndefined();

    equipSkill(v1.key);
    const v2Manifest = structuredClone(BUILTIN_SKILLS[0]);
    v2Manifest.identity.version = '1.1.0';
    const v2 = installSkillManifest(v2Manifest);
    equipSkill(v2.key);
    expect(getEquippedSkill(v1.manifest.identity.id)?.key).toBe(v2.key);
    expect(rollbackSkill(v1.manifest.identity.id).key).toBe(v1.key);
    uninstallSkill(v2.key);
    expect(listInstalledSkills().some((item) => item.key === v2.key)).toBe(false);
  });

  it('bootstraps each built-in exactly once', () => {
    ensureBuiltinSkills();
    ensureBuiltinSkills();
    expect(listInstalledSkills()).toHaveLength(BUILTIN_SKILLS.length);
    expect(BUILTIN_SKILLS.filter((item) => item.assets.length === 0).every((item) => getEquippedSkill(item.identity.id))).toBe(true);
    expect(BUILTIN_SKILLS.filter((item) => item.assets.length > 0).every((item) => !getEquippedSkill(item.identity.id))).toBe(true);
  });
});
