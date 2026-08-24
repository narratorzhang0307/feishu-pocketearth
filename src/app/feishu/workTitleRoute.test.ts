import { describe, expect, it } from 'vitest';
import { inferWorkTitleRoute } from './workTitleRoute';

const books = [{ title: '霍乱时期的爱情' }, { title: '沙丘' }];
const movies = [{ title: '花样年华' }, { title: '沙丘', original: 'Dune' }];

describe('Feishu work-title routing', () => {
  it('recognizes an unquoted title from the active book Data Pack', () => {
    expect(inferWorkTitleRoute('我看了霍乱时期的爱情', books, movies)).toEqual({
      title: '霍乱时期的爱情', skillId: 'pocket.books', ambiguous: false,
    });
  });

  it('recognizes a movie title and lets explicit context resolve adaptations', () => {
    expect(inferWorkTitleRoute('聊聊《花样年华》', books, movies)?.skillId).toBe('pocket.movies');
    expect(inferWorkTitleRoute('我读了《沙丘》', books, movies)?.skillId).toBe('pocket.books');
    expect(inferWorkTitleRoute('我看了电影《沙丘》', books, movies)?.skillId).toBe('pocket.movies');
  });

  it('asks for clarification instead of guessing across a book and movie with the same title', () => {
    expect(inferWorkTitleRoute('我看了《沙丘》', books, movies)).toEqual({
      title: '沙丘', skillId: null, ambiguous: true,
    });
  });

  it('does not treat unrelated prose as a known work', () => {
    expect(inferWorkTitleRoute('帮我写一封邮件', books, movies)).toBeNull();
  });
});
