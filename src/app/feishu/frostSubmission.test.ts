import { describe, expect, it } from 'vitest';
import { frostSubmissionFromText } from './frostSubmission';

describe('Frost Feishu submission draft', () => {
  it('turns an explicit reading record into a reviewable Bitable draft', () => {
    const draft = frostSubmissionFromText('books', '我读完了《百年孤独》，5星，请记录到飞书', new Date('2026-08-24T08:00:00Z'));
    expect(draft).toMatchObject({
      domain: 'books', label: '《百年孤独》阅读记录',
      record: { title: '百年孤独', rating: 5, date: '2026-08-24', locations: [] },
    });
  });

  it('does not turn ordinary recommendations into database side effects', () => {
    expect(frostSubmissionFromText('movies', '推荐三部像《路边野餐》的电影')).toBeNull();
  });
});
