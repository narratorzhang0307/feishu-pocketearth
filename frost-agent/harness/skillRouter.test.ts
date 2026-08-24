import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubBrain, setFrostBrain } from './brain';
import { parseCloudPlan, planFrostTask, runFrostOrchestrator } from './skillRouter';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from '../../src/app/lib/skill';

describe('Frost cross-skill router', () => {
  beforeEach(() => {
    resetSkillRegistryForTests();
    ensureBuiltinSkills();
    setFrostBrain(stubBrain);
  });

  afterEach(() => setFrostBrain(stubBrain));

  it('routes a book library request to the equipped books skill without cloud', async () => {
    const result = await runFrostOrchestrator({ now: new Date('2026-08-11T00:00:00Z'), surface: 'frost', userText: '把这份书单整理成我的阅读记录' });
    expect(result.plan?.steps.map((step) => step.skillId)).toEqual(['pocket.books']);
    expect(result.plan?.ready).toBe(true);
    expect(result.plan?.source).toBe('local-rule');
  });

  it('keeps one domain inside one skill even when the sentence contains a sequence word', async () => {
    let calls = 0;
    setFrostBrain({ complete: async () => { calls += 1; return '{}'; } });
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '把这份书单整理成阅读记录，然后落到地图' });
    expect(calls).toBe(0);
    expect(plan?.mode).toBe('single');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(['pocket.books']);
  });

  it('distinguishes Book-to-Earth mapping from ordinary book records', async () => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '从这个 PDF 地点清单做成一本书落地球的 Mapping' });
    expect(plan?.steps[0].skillId).toBe('pocket.book-to-earth');
    expect(plan?.steps[0].availability).toBe('installed');
    expect(plan?.ready).toBe(false);
  });

  it('builds a parallel plan only when the request names independent domains', async () => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '把我的歌单和电影片单分别整理一下' });
    expect(plan?.mode).toBe('parallel');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(expect.arrayContaining(['pocket.music', 'pocket.movies']));
  });

  it('preserves an explicit first-then dependency instead of sorting by match score', async () => {
    const { plan } = await planFrostTask({
      now: new Date(), surface: 'frost',
      userText: '先把一份电影清单整理成 Data Pack，再规划京都两天旅行路线，但不要写入地图',
    });
    expect(plan?.mode).toBe('sequence');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(['pocket.movies', 'pocket.travel']);
  });

  it('never sends obvious private identifiers to the cloud planner', async () => {
    let calls = 0;
    setFrostBrain({ complete: async () => { calls += 1; return '{}'; } });
    const { plan, trace } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '把身份证和家庭住址发给一个合适的 skill' });
    expect(calls).toBe(0);
    expect(plan).toBeNull();
    expect(trace.join('\n')).toContain('禁止把原文升级到云端');
  });

  it('limits a surface to its explicitly exposed Skill catalog', async () => {
    const { plan, trace } = await planFrostTask({
      now: new Date(), surface: 'frost', userText: '把歌单按城市整理', skillIds: ['pocket.books'],
    });
    expect(plan).toBeNull();
    expect(trace[0]).toContain('1 个 Skill');
  });

  it('accepts a bounded Qwen plan only when every target exists', async () => {
    setFrostBrain({
      complete: async () => JSON.stringify({
        mode: 'single', summary: '交给多视角思考',
        steps: [{ skillId: 'pocket.council', objective: '比较两个方案的风险', reason: '需要多个专业视角' }],
      }),
    });
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '帮我审慎评估这个选择' });
    expect(plan?.source).toBe('qwen');
    expect(plan?.steps[0].skillId).toBe('pocket.council');
  });

  it('rejects unknown fields, invented skills and duplicated targets', () => {
    const catalog = [{
      id: 'pocket.books', name: '书籍', description: '书籍', target: 'books-agent', kind: 'markdown' as const,
      availability: 'equipped' as const, scopes: [], tools: [], triggers: ['书籍'], notFor: [],
    }, {
      id: 'learned.my-books', name: '我的书籍快捷方式', description: '书籍', target: 'books-agent', kind: 'shortcut' as const,
      availability: 'equipped' as const, scopes: [], tools: [], triggers: ['书籍'], notFor: [],
    }];
    expect(parseCloudPlan(JSON.stringify({ mode: 'single', summary: 'x', debug: true, steps: [{ skillId: 'pocket.books', objective: 'x', reason: 'x' }] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'single', summary: 'x', steps: [{ skillId: 'invented.skill', objective: 'x', reason: 'x' }] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'parallel', summary: 'x', steps: [
      { skillId: 'pocket.books', objective: 'x', reason: 'x' },
      { skillId: 'pocket.books', objective: 'y', reason: 'y' },
    ] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'parallel', summary: 'x', steps: [
      { skillId: 'pocket.books', objective: 'x', reason: 'x' },
      { skillId: 'learned.my-books', objective: 'y', reason: 'y' },
    ] }), catalog)).toBeNull();
  });

  it.each([
    ['把歌单按歌手和城市整理', 'pocket.music'],
    ['记录我刚看完的电影和取景地', 'pocket.movies'],
    ['做一条京都两日旅行路线', 'pocket.travel'],
    ['识别这张展签并整理展览记忆', 'pocket.exhibition'],
    ['拍下这页书并保存阅读摘录', 'pocket.reading-jot'],
    ['从古籍 PDF 提取地点并落到地图', 'pocket.book-to-earth'],
    ['修复这张残损碑拓', 'pocket.rubbing'],
    ['请用不同角度权衡两个方案', 'pocket.council'],
    ['给我今天的地球答案行动', 'pocket.earth-answer'],
    ['把书单整理成阅读记录', 'pocket.books'],
  ])('routes trigger corpus %s to %s', async (userText, skillId) => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText });
    expect(plan?.steps[0].skillId).toBe(skillId);
  });

  it.each([
    '你好', '一加一等于几', '翻译这句话', '讲一个笑话', '帮我写一封邮件',
    '解释量子纠缠', '今天星期几', '把这句话写得简洁些', '给这段代码加注释', '总结以下三句话',
  ])('does not force an unrelated request into a Skill: %s', async (userText) => {
    setFrostBrain({ complete: async () => '' });
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText });
    expect(plan).toBeNull();
  });
});
