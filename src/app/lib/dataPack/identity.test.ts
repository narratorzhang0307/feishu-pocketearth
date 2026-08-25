import { describe, expect, it } from 'vitest';
import { dataPackRecordIdentity, uniqueDataPackRecords } from './identity';

describe('Data Pack semantic identity', () => {
  it('collapses three historical book rows with the same normalized title', () => {
    const records = [
      { id: 'book:local', title: '酒吧长谈', synopsis: '本地记录' },
      { id: 'book:feishu-1', title: '《酒吧长谈》', synopsis: '飞书投影' },
      { id: 'book:feishu-2', title: ' 酒吧长谈 ', synopsis: '历史重复' },
    ];

    expect(uniqueDataPackRecords('books', records)).toEqual([records[0]]);
  });

  it('keeps identities isolated by domain and uses artist/hash where required', () => {
    expect(dataPackRecordIdentity('books', { title: '夜航' })).not
      .toBe(dataPackRecordIdentity('movies', { title: '夜航' }));
    expect(dataPackRecordIdentity('music', { tracks: [{ title: 'Heroes', artist: 'David Bowie' }] })).not
      .toBe(dataPackRecordIdentity('music', { tracks: [{ title: 'Heroes', artist: 'Peter Gabriel' }] }));
    expect(uniqueDataPackRecords('photos', [
      { id: 'photo:1', contentHash: 'ABC' },
      { id: 'photo:2', contentHash: 'abc' },
    ])).toHaveLength(1);
  });
});
