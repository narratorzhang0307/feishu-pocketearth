import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlannerPrompt, inferPlannerIntent, interestsToPreferences, parsePlannerModelObject,
  TRAINED_TRAVEL_SYSTEM_PROMPT,
} from './intentRuntime';

afterEach(() => vi.unstubAllGlobals());

describe('Travel Planner LoRA intent contract', () => {
  it('builds a stable prompt without embedding city facts', () => {
    const prompt = buildPlannerPrompt({
      destination: '杭州', date: '2026-08-10', days: 1,
      preferences: ['美食', '小众'], requestText: '想看古籍，少走路。',
    });
    expect(prompt).toContain('帮我安排杭州1日游');
    expect(prompt).toContain('想看古籍');
    expect(prompt).toContain('地理邻近安排');
    expect(prompt).toContain('不要猜测步行上限');
    expect(prompt).not.toContain('杭州博物馆');
  });

  it('keeps the exact schema family used to train the LoRA', () => {
    expect(TRAINED_TRAVEL_SYSTEM_PROMPT).toContain('shangjiequ.travel-intent/v1');
    expect(TRAINED_TRAVEL_SYSTEM_PROMPT).not.toContain('pocket.travel-intent/v1');
  });

  it('repairs only the known MNN extra-root-brace shape', () => {
    const result = parsePlannerModelObject('{"slots":{"city":"杭州"},{"next_action":"call_tools"}');
    expect(result.repaired).toBe(true);
    expect(result.value).toEqual({ slots: { city: '杭州' }, next_action: 'call_tools' });
  });

  it('rejects arbitrary malformed output', () => {
    expect(parsePlannerModelObject('{bad json').value).toBeNull();
  });

  it('maps natural-language constraints into existing UI preferences', () => {
    expect(interestsToPreferences(['古籍与碑拓', '本地小吃', '避开游客路线'])).toEqual(['美食', '历史', '小众']);
  });

  it('accepts a real MNN adapter response but keeps explicit UI fields authoritative', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backend: 'mnn', text: '{"destination":"错误城市","preferences":["古籍","美食"],"next_action":"call_tools"}' }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 2,
      preferences: ['小众'], requestText: '少走路',
    });
    expect(result.source).toBe('qwen-lora');
    expect(result.interests).toEqual(['小众', '美食', '历史']);
    expect(result.walkingLimitKm).toBeNull();
    expect(result.compactRoute).toBe(true);
  });

  it('adapts MNN alias fields into executable pace, crowd, mix and walking constraints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backend: 'mnn',
        text: JSON.stringify({
          destination: '京都',
          preference: ['美食', '小众体验'],
          constraints: { max_walk_distance_km: 2.5, avoid_popular_points: true },
          soft_constraints: { comfort_level: 'relaxing', theme_mix: '平衡' },
          next_action: 'call_tools',
        }),
      }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 2,
      preferences: [], requestText: '',
    });
    expect(result.source).toBe('qwen-lora');
    expect(result.interests).toEqual(['美食', '小众']);
    expect(result.walkingLimitKm).toBe(2.5);
    expect(result.compactRoute).toBe(true);
    expect(result.pace).toBe('slow');
    expect(result.crowdTolerance).toBe('low');
    expect(result.mixStrategy).toBe('balanced');
    expect(result.ruleAssist).toBe(false);
  });

  it('keeps local execution semantics when the quantized model omits optional slots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backend: 'mnn', text: '{"destination":"京都","next_action":"call_tools"}' }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 2,
      preferences: ['美食'], requestText: '路线松弛，避开人多，不要重复同一类。',
    });
    expect(result.source).toBe('qwen-lora');
    expect(result.pace).toBe('slow');
    expect(result.crowdTolerance).toBe('low');
    expect(result.mixStrategy).toBe('balanced');
    expect(result.avoid).toEqual([]);
    expect(result.ruleAssist).toBe(true);
  });

  it('treats an explicit daily stop count as a constraint, not slow pace itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backend: 'mnn', text: '{"destination":"京都","next_action":"call_tools"}' }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 2,
      preferences: [], requestText: '路线松弛，但每天安排4个地点。',
    });
    expect(result.pace).toBe('slow');
    expect(result.maxStopsPerDay).toBe(4);
  });

  it('rejects unknown-only JSON instead of labeling it Travel LoRA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backend: 'mnn', text: '{"foo":"bar"}' }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 2,
      preferences: ['小众'], requestText: '',
    });
    expect(result.source).toBe('rules');
    expect(result.error).toBe('invalid_model_contract');
  });

  it('keeps local avoid rules when the MNN runtime is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ backend: 'stub', text: '', error: 'offline' }),
    }));
    const result = await inferPlannerIntent({
      destination: '京都', date: '2026-08-10', days: 1,
      preferences: [], requestText: '避开商场，不要夜店。',
    });
    expect(result.source).toBe('rules');
    expect(result.avoid).toEqual(['商场', '夜店']);
  });
});
