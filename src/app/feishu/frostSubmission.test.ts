import { describe, expect, it } from 'vitest';
import { frostSubmissionFromText } from './frostSubmission';

describe('Frost Feishu submission draft', () => {
  it('turns an explicit reading record into a reviewable Bitable draft', () => {
    const draft = frostSubmissionFromText('books', '我读完了《百年孤独》，5星，请记录到飞书', new Date('2026-08-24T08:00:00Z'));
    expect(draft).toMatchObject({
      domain: 'books', label: '《百年孤独》阅读记录',
      record: {
        title: '百年孤独', rating: 5, date: '2026-08-24', locations: [],
        aiInstruction: '我读完了《百年孤独》，5星，请记录到飞书',
      },
    });
  });

  it('does not turn ordinary recommendations into database side effects', () => {
    expect(frostSubmissionFromText('movies', '推荐三部像《路边野餐》的电影')).toBeNull();
  });

  it('creates a review-gated music instruction for Feishu Bitable', () => {
    const draft = frostSubmissionFromText('music', '用 AI 记录《成都》，我在成都听完很喜欢', new Date('2026-08-24T08:00:00Z'));
    expect(draft?.domain).toBe('music');
    expect(draft?.label).toBe('《成都》听歌记录');
    expect(draft?.record.aiInstruction).toBe('用 AI 记录《成都》，我在成都听完很喜欢');
    expect(draft?.record.tracks).toEqual(expect.arrayContaining([expect.objectContaining({ title: '成都' })]));
  });
});
