// 编排层：串六层流水线（感知→本地库→本地索引→云脑补全子agent→地理子agent→校验→draft）。镜像 lib/movie/agent.ts。
import { sense } from './sense';
import { matchInCatalog } from './catalog';
import { enrichTags, geoResolve } from './tagging';
import { applyCritic, applyUserFix, mergeKnown } from './critic';
import { getKnownBook } from './store';
import { bookKey, type BookDraft, type BookInput, type OnBookPhase } from './types';

const today = () => new Date().toISOString().slice(0, 10);

export async function runBookAgent(input: BookInput, onPhase?: OnBookPhase): Promise<BookDraft | null> {
  const ph: OnBookPhase = onPhase || (() => {});

  // ① 感知
  ph(input.kind === 'image' ? '书封认书' : '解析输入');
  const sensed = await sense({ kind: input.kind, text: input.text, imageDataUrl: input.imageDataUrl, manualTitle: input.manual?.title, manualRating: input.manual?.rating });
  const title = sensed.title;
  if (!title) return null;

  const draft: BookDraft = {
    id: '', title, year: null, country: '',
    tags: { author: input.manual?.author || '', translator: '', genre: '', movement: '', plot: '', userRating: sensed.rating ?? input.manual?.rating ?? 0 },
    geo: null, needPlace: true, source: 'manual', confidence: 0.3, needsConfirm: true,
    reason: `感知:${sensed.from}「${title}」`, date: today(),
  };

  // ② 本地书库
  ph('查本地书库', 'matchCatalog');
  const hit = matchInCatalog(title);
  if (hit) {
    const r = hit.record;
    draft.title = r.title || title; draft.year = r.year ?? null; draft.country = r.country || '';
    draft.tags.author = draft.tags.author || r.author || ''; draft.tags.plot = r.synopsis || '';
    draft.source = 'catalog'; draft.confidence = hit.exact ? 0.8 : 0.65;
    draft.reason += `；本地库${hit.exact ? '精确' : '模糊'}命中`;
  }
  draft.id = bookKey(draft.title, draft.tags.author);

  // ③ 本地索引复用
  const known = await getKnownBook(draft.id);
  const alreadyEnriched = mergeKnown(draft, known);

  // ④ 云脑补全子 agent
  const lackTags = !draft.tags.translator || !draft.tags.movement || !draft.tags.genre || draft.needPlace;
  let storyPlace = '', authorPlace = '';
  if (!alreadyEnriched && lackTags) {
    ph('云脑补全标签', 'Qwen 云端');
    const { raw, ok } = await enrichTags(draft.title, { author: draft.tags.author, country: draft.country, year: draft.year });
    if (ok) {
      draft.tags.author = draft.tags.author || raw.author;
      draft.tags.translator = draft.tags.translator || raw.translator;
      draft.tags.genre = draft.tags.genre || raw.genre;
      draft.tags.movement = draft.tags.movement || raw.movement;
      draft.tags.plot = draft.tags.plot || raw.plot;
      draft.country = draft.country || raw.country;
      draft.year = draft.year ?? raw.year;
      storyPlace = raw.storyPlace; authorPlace = raw.authorPlace;
      draft.source = draft.source === 'catalog' ? 'mixed' : 'llm';
      draft.confidence = Math.max(draft.confidence, 0.72);
      draft.reason += '；云脑补全标签';
    } else {
      draft.reason += '；云脑不可用→保留已有';
    }
  }

  // ⑤ 地理子 agent：故事地 > 作者地 > 国家
  ph('定位故事地/作者地', 'resolvePlace 本地→Mapbox');
  if (!draft.geo) draft.geo = await geoResolve({ storyPlace, authorPlace, country: draft.country });
  draft.needPlace = !draft.geo;

  // ⑥ 校验 + 历史纠错
  ph('校验');
  applyCritic(draft);
  applyUserFix(draft);
  draft.needsConfirm = draft.confidence < 0.75 || draft.source === 'manual' || draft.needPlace;

  ph('完成');
  return draft;
}

export { confirmPin, archiveOnly, alreadyPinned, unpin } from './pin';
export { recordPlaceFix, recordRatingFix } from './store';
