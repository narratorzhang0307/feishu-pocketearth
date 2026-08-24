import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { extractionPromptForSkill, listFeishuSkillAdapters, planFeishuSkillTask } from './frost-skill-router.mjs';

describe('Feishu to Frost Skill routing', () => {
  it('routes a Feishu document to the existing Book-to-Earth contract', () => {
    const plan = planFeishuSkillTask({ requestedSkillId: 'pocket.book-to-earth', objective: '从《城记》提取地点' });
    expect(plan).toMatchObject({
      engine: 'frost', mode: 'single', source: 'explicit', skillId: 'pocket.book-to-earth',
      skillName: 'Book-to-Earth', target: 'agent-forge', outputSchema: 'pocket.mapping/v1', requiresConfirmation: true,
    });
    expect(extractionPromptForSkill(plan)?.system).toContain('Book-to-Earth');
  });

  it('exposes only adapted Skills and fails closed for unregistered ones', () => {
    expect(listFeishuSkillAdapters().map((skill: { id: string }) => skill.id)).toEqual(['pocket.book-to-earth']);
    expect(() => planFeishuSkillTask({ requestedSkillId: 'pocket.movies' })).toThrow('feishu_skill_not_supported');
  });
});
