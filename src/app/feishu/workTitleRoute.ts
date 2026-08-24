interface BookTitleRecord { title: string }
interface MovieTitleRecord { title: string; original?: string }

export interface WorkTitleRoute {
  title: string;
  skillId: 'pocket.books' | 'pocket.movies' | null;
  ambiguous: boolean;
}

const BOOK_SIGNAL = /(读了|读完|读过|读书|阅读|这本书|书籍|小说|作者)/;
const MOVIE_SIGNAL = /(电影|影片|观影|这部片|这部电影|导演|演员)/;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s《》「」『』“”'"·—–_\-，。！？、：；（）()【】\[\]]+/g, '');
}

function quotedTitles(text: string): Set<string> {
  return new Set([...text.matchAll(/[《「『]([^》」』]{1,80})[》」』]/g)].map((match) => normalize(match[1])));
}

/** Use the active local Data Packs as a lightweight deterministic title directory. */
export function inferWorkTitleRoute(
  text: string,
  books: readonly BookTitleRecord[],
  movies: readonly MovieTitleRecord[],
): WorkTitleRoute | null {
  const input = normalize(text);
  if (!input) return null;
  const quoted = quotedTitles(text);
  const matches = new Map<string, { title: string; books: boolean; movies: boolean }>();

  const add = (title: string, domain: 'books' | 'movies') => {
    const key = normalize(title);
    if (!key || (!quoted.has(key) && (key.length < 4 || !input.includes(key)))) return;
    const current = matches.get(key) || { title, books: false, movies: false };
    current[domain] = true;
    matches.set(key, current);
  };

  books.forEach((record) => add(record.title, 'books'));
  movies.forEach((record) => {
    add(record.title, 'movies');
    if (record.original) add(record.original, 'movies');
  });

  const best = [...matches.entries()].sort((left, right) => right[0].length - left[0].length)[0]?.[1];
  if (!best) return null;
  if (best.books && best.movies) {
    if (BOOK_SIGNAL.test(text) && !MOVIE_SIGNAL.test(text)) return { title: best.title, skillId: 'pocket.books', ambiguous: false };
    if (MOVIE_SIGNAL.test(text) && !BOOK_SIGNAL.test(text)) return { title: best.title, skillId: 'pocket.movies', ambiguous: false };
    return { title: best.title, skillId: null, ambiguous: true };
  }
  return { title: best.title, skillId: best.books ? 'pocket.books' : 'pocket.movies', ambiguous: false };
}
