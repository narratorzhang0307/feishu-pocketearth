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
});
