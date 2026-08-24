import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { parseQwenLibraryInstruction } from './qwen-library-instruction.mjs';

describe('Qwen Bitable AI instruction parser', () => {
  it('turns a natural-language book note into a reviewable Data Pack record', () => {
    const record = parseQwenLibraryInstruction(JSON.stringify({ record: {
      title: '百年孤独', author: '加西亚·马尔克斯', country: '哥伦比亚', type: '长篇小说', year: 1967,
      note: '我很喜欢', description: '布恩迪亚家族的故事',
      locations: [{ kind: 'story', place: '阿拉卡塔卡', lng: -74.19, lat: 10.59, confidence: 0.7 }],
    } }), { domain: 'books', recordId: 'rec-ai', instruction: '帮我记录一条《百年孤独》的笔记，我很喜欢' });

    expect(record).toMatchObject({
      id: 'book:feishu-ai:rec-ai', title: '百年孤独', author: '加西亚·马尔克斯', note: '我很喜欢', aiInstruction: '帮我记录一条《百年孤独》的笔记，我很喜欢',
      locations: [{ kind: 'story', place: '阿拉卡塔卡', lng: -74.19, lat: 10.59, confidence: 0.7 }],
    });
  });

  it('rejects an unusable AI result instead of inventing a title', () => {
    expect(() => parseQwenLibraryInstruction('{"record":{"note":"只有感想"}}', {
      domain: 'books', recordId: 'rec-ai', instruction: '帮我记一下',
    })).toThrow('qwen_library_instruction_title_missing');
  });

  it('turns a music instruction into a reviewable city and track record', () => {
    const record = parseQwenLibraryInstruction(JSON.stringify({ record: {
      title: '成都', artist: '赵雷', genre: '民谣', city: '成都', cityName: 'Chengdu',
      lat: 30.5728, lng: 104.0668, note: '夜里听很合适', description: '歌曲与成都街巷记忆相关',
    } }), { domain: 'music', recordId: 'rec-music', instruction: '用 AI 记录《成都》，夜里听很合适' });

    expect(record).toMatchObject({
      id: 'music-city:feishu-ai:rec-music', cityNameZh: '成都', cityName: 'Chengdu',
      lat: 30.5728, lng: 104.0668,
      tracks: [{ title: '成都', artist: '赵雷', genre: '民谣' }],
    });
  });

  it('turns a photo instruction into a reviewable place record', () => {
    const record = parseQwenLibraryInstruction(JSON.stringify({ record: {
      title: '西湖雨夜', city: '杭州', date: '2026-08-24', lat: 30.25, lng: 120.15,
      note: '雨后的湖面', description: '低照度但有清晰叙事',
    } }), { domain: 'photos', recordId: 'rec-photo', instruction: '记录这张杭州西湖雨夜照片' });

    expect(record).toMatchObject({
      id: 'photo:feishu-ai:rec-photo', title: '西湖雨夜', city: '杭州',
      lat: 30.25, lng: 120.15, qwen: { summary: '低照度但有清晰叙事' },
    });
  });
});
