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

  it('uses a stable domain-specific Pocket ID so marking the same work twice upserts one row', () => {
    const first = frostSubmissionFromText('books', '用 AI 记录《酒吧长谈》，我很喜欢');
    const second = frostSubmissionFromText('books', '再次标记《酒吧长谈》');
    const movie = frostSubmissionFromText('movies', '用 AI 记录电影《酒吧长谈》');
    expect(first?.record.id).toBe(second?.record.id);
    expect(first?.record.id).not.toBe(movie?.record.id);
  });

  it('creates a photo-only draft with its own schema-shaped record', () => {
    const draft = frostSubmissionFromText('photos', '用 AI 记录《西湖雨夜》这张照片', new Date('2026-08-24T08:00:00Z'));
    expect(draft).toMatchObject({
      domain: 'photos', label: '《西湖雨夜》照片记录',
      record: { title: '西湖雨夜', city: '西湖雨夜', date: '2026-08-24' },
    });
    expect(String(draft?.record.id)).toMatch(/^photo:frost:/);
  });

  it('creates a review-gated music instruction for Feishu Bitable', () => {
    const draft = frostSubmissionFromText('music', '用 AI 记录《成都》，我在成都听完很喜欢', new Date('2026-08-24T08:00:00Z'));
    expect(draft?.domain).toBe('music');
    expect(draft?.label).toBe('《成都》听歌记录');
    expect(draft?.record.aiInstruction).toBe('用 AI 记录《成都》，我在成都听完很喜欢');
    expect(draft?.record.tracks).toEqual(expect.arrayContaining([expect.objectContaining({ title: '成都' })]));
  });
});
