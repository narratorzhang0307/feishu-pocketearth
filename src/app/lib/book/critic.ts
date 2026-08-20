// 反思层：确定性护栏纠正概率产出 + 应用用户历史纠错。
// 通用护栏收口到 [draftCritic] skill；这里只补书领域护栏（年份下限到公元前、作者名长度）。
import type { BookDraft } from './types';
import { getBookPrefs, type StoredBook } from './store';
import { clampDraft, clampYear, applyUserFix as fixFromCorr, mergeKnown as mergeFromKnown } from '../skills/draftCritic';

const NOW_Y = new Date().getFullYear();

export function applyCritic(d: BookDraft): void {
  clampYear(d, -800, NOW_Y + 1);                                                          // 书：公元前 800 ~ 明年
  if (d.tags.author && d.tags.author.length > 20) d.tags.author = d.tags.author.slice(0, 20);   // 领域护栏：作者名长度
  clampDraft(d);                                                                          // 通用：评分钳/坐标/简介/needPlace
}

// 应用历史纠错（落点 kind=故事地）
export function applyUserFix(d: BookDraft): void { fixFromCorr(d, getBookPrefs(), 'story'); }

export function mergeKnown(d: BookDraft, known: StoredBook | null): boolean { return mergeFromKnown(d, known); }
