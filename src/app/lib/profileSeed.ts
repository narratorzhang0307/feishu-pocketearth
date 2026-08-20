// 用「现有书影音照」库存给长期画像播种一次（幂等，按 SEED_VERSION 版本控制）。
// 放在 app 层：由应用把自己的数据喂给 frost-agent 内核的画像，方向是 app → core，
// 内核 profile.ts 保持纯粹、不反向依赖任何 app 数据。
// 画像只供云脑侧提示注入，端侧 Selector 不接触。

import { recordSignals, setSeedVersion, getProfileSeedVersion } from '../../../frost-agent/harness/profile';
import { ensureMovieData, movieRecords } from '../data/movies';
import { bookRecords, ensureBookData } from '../data/books';
import genresMap from '../data/music-genres.json';
import { photoPoints } from '../data/photos';

const SEED_VERSION = 1;

/** 启动时调用一次：把库存聚合成口味标签累加进画像；已是当前版本则直接跳过。 */
export async function seedProfileFromLibrary(): Promise<void> {
  if (getProfileSeedVersion() >= SEED_VERSION) return;
  await Promise.all([ensureMovieData(), ensureBookData()]);

  // 电影：导演 / 国别（豆瓣观影记录，天然带频次）
  recordSignals('movies', {
    directors: movieRecords.map((m) => m.director),
    countries: movieRecords.map((m) => m.country),
  });

  // 书：作者 / 作者国别（豆瓣阅读记录）
  recordSignals('books', {
    authors: bookRecords.map((b) => b.author),
    countries: bookRecords.map((b) => b.country),
  });

  // 音乐：流派 / 地域 + 艺人（music-genres.json：artist → 地域/流派）
  const gmap = genresMap as Record<string, string>;
  recordSignals('music', {
    genres: Object.values(gmap),
    artists: Object.keys(gmap),
  });

  // 照片：城市（取城市名首段）
  recordSignals('photos', {
    cities: photoPoints.map((p) => (p.city || '').split(',')[0]),
  });

  setSeedVersion(SEED_VERSION);
}
