import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createQwenPhotoCurator, parseQwenPhotoCuration } from './photo-curation.mjs';

const image = `data:image/jpeg;base64,${'A'.repeat(16)}`;

describe('Feishu Qwen photo curation', () => {
  it('accepts one complete, bounded review per requested photo', () => {
    const reviews = parseQwenPhotoCuration(JSON.stringify({ reviews: [
      { id: 'photo-a', recommendation: 'keep', qualityScore: 88.7, storyScore: 92, summary: '主体明确', reasons: ['构图稳定'] },
      { id: 'photo-b', recommendation: 'review', qualityScore: 54, storyScore: 80, summary: '记忆价值高', reasons: [] },
    ] }), ['photo-a', 'photo-b']);
    expect(reviews).toEqual([
      { id: 'photo-a', recommendation: 'keep', qualityScore: 89, storyScore: 92, summary: '主体明确', reasons: ['构图稳定'] },
      { id: 'photo-b', recommendation: 'review', qualityScore: 54, storyScore: 80, summary: '记忆价值高', reasons: [] },
    ]);
  });

  it('rejects missing or invented ids', () => {
    expect(() => parseQwenPhotoCuration('{"reviews":[{"id":"photo-x","recommendation":"keep"}]}', ['photo-a']))
      .toThrow('qwen_photo_curation_id_invalid');
  });

  it('sends a bounded multi-image request to the Qwen vision model', async () => {
    let body: any;
    const curator = createQwenPhotoCurator({ key: 'key', url: 'https://qwen.test', visionModel: 'qwen-vl-test' }, async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ choices: [{ message: { content: '{"reviews":[{"id":"photo-a","recommendation":"reject","qualityScore":20,"storyScore":10,"summary":"失焦","reasons":["主体不可辨"]}]}' } }] });
    });
    const result = await curator.review([{ id: 'photo-a', image, technicalQuality: 12, tags: ['模糊'] }]);
    expect(body).toMatchObject({ model: 'qwen-vl-test', response_format: { type: 'json_object' } });
    expect(body.messages[0].content.filter((item: any) => item.type === 'image_url')).toHaveLength(1);
    expect(result).toMatchObject({ model: 'qwen-vl-test', reviews: [{ id: 'photo-a', recommendation: 'reject' }] });
  });
});
