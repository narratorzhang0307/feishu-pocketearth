// 反思层：判定前用确定性护栏纠正概率产出（挑错强于一次判对）。
// 通用护栏（评分钳/坐标/简介/年份/纠错/命中索引）收口到 [draftCritic] skill；这里只补电影领域护栏（豆瓣分/演员）。
import type { MovieDraft } from './types';
import { getMoviePrefs, type StoredMovie } from './store';
import { clampDraft, clampYear, applyUserFix as fixFromCorr, mergeKnown as mergeFromKnown } from '../skills/draftCritic';

const NOW_Y = new Date().getFullYear();

export function applyCritic(d: MovieDraft): void {
  clampYear(d, 1888, NOW_Y + 1);                                          // 电影诞生 1888 ~ 明年
  if (d.douban != null) d.douban = Math.max(0, Math.min(10, d.douban));   // 领域护栏：豆瓣分 0-10
  d.tags.cast = (d.tags.cast || []).filter((c) => c && c.length <= 12 && !/[，。、;；:：]/.test(c)).slice(0, 4);  // 演员去脏串
  clampDraft(d);                                                          // 通用：评分钳/坐标/简介/needPlace
}

// 应用历史纠错：同一片之前被用户改过落点/评分 → 沿用（落点 kind=取景地）
export function applyUserFix(d: MovieDraft): void { fixFromCorr(d, getMoviePrefs(), 'filming'); }

// 命中本地索引（之前已补全/已钉）→ 沿用，省云脑、保持一致
export function mergeKnown(d: MovieDraft, known: StoredMovie | null): boolean { return mergeFromKnown(d, known); }
