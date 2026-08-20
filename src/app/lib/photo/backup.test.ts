// 备份核验引擎单测：只测 node 可跑的确定性路径（命名归一化 / 索引 / 字节-抽样 hash / 判级）；
// dHash 感知路径依赖 DOM，模块内已做环境守卫，这里验证「无 DOM 时优雅退级为 suspected」。
import { describe, it, expect } from 'vitest';
import { baseName, recordsFromFiles, buildBackupIndex, matchBackup, quickHash, looksLikeSelfPick } from './backup';

const mk = (name: string, bytes: Uint8Array | string, lastModified = 1700000000000): File =>
  new File([typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes], name, { lastModified });

describe('baseName 归一化', () => {
  it('去扩展名（HEIC→JPEG 转码后仍同名）', () => {
    expect(baseName('IMG_1234.HEIC')).toBe(baseName('IMG_1234.jpeg'));
  });
  it('去导出工具的数字序号前缀', () => {
    expect(baseName('00017_IMG_1234.heic')).toBe('img_1234');
  });
  it('普通名不受影响', () => {
    expect(baseName('海边日落.jpg')).toBe('海边日落');
  });
});

describe('recordsFromFiles', () => {
  it('只收媒体文件，记录 webkitRelativePath', () => {
    const media = mk('a.jpg', 'x');
    Object.defineProperty(media, 'webkitRelativePath', { value: 'backup/2024/a.jpg' });
    const recs = recordsFromFiles([media, mk('note.txt', 'y'), mk('b.mov', 'z')]);
    expect(recs.map((r) => r.path)).toEqual(['backup/2024/a.jpg', 'b.mov']);
  });
});

describe('quickHash', () => {
  it('小文件整读：同内容同 hash，不同内容不同 hash', async () => {
    expect(await quickHash(mk('a.jpg', 'same-bytes'))).toBe(await quickHash(mk('b.jpg', 'same-bytes')));
    expect(await quickHash(mk('a.jpg', 'aaa'))).not.toBe(await quickHash(mk('b.jpg', 'bbb')));
  });
  it('超限走头/中/尾抽样，带 sampled: 前缀且对同内容稳定', async () => {
    const big = new Uint8Array(64);
    big.fill(7);
    const h1 = await quickHash(mk('v.mov', big), 32, 8);
    const h2 = await quickHash(mk('v2.mov', new Uint8Array(big)), 32, 8);
    expect(h1.startsWith('sampled:')).toBe(true);
    expect(h1).toBe(h2);
    big[30] = 9;   // 改中段抽样窗口内的字节（mid 窗=[28,36)）→ 抽样能抓到
    expect(await quickHash(mk('v3.mov', big), 32, 8)).not.toBe(h1);
    // 抽样盲区（窗口之间）改动抓不到——这是「等长+头中尾一致≈同件」的既定取舍，不断言
  });
});

describe('looksLikeSelfPick 防自我核验', () => {
  const sel = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `IMG_${i}.jpeg`, size: 100 + i, lastModified: 1719050000000 }));
  it('无相对路径且大多数三元组与所选照片相同 → true（相册自选自）', () => {
    const records = recordsFromFiles(sel(5).map((f) => mk(f.name, new Uint8Array(f.size), f.lastModified)));
    expect(looksLikeSelfPick(sel(5), records)).toBe(true);
  });
  it('整夹选取（带 webkitRelativePath）→ false，永不触发', () => {
    const files = sel(5).map((f) => { const file = mk(f.name, new Uint8Array(f.size), f.lastModified); Object.defineProperty(file, 'webkitRelativePath', { value: `backup/${f.name}` }); return file; });
    expect(looksLikeSelfPick(sel(5), recordsFromFiles(files))).toBe(false);
  });
  it('重合比例低（真备份里恰好有几张同名）→ false', () => {
    const backup = [...sel(2).map((f) => mk(f.name, new Uint8Array(f.size), f.lastModified)), ...Array.from({ length: 8 }, (_, i) => mk(`b_${i}.jpg`, 'x'.repeat(50 + i)))];
    expect(looksLikeSelfPick(sel(10), recordsFromFiles(backup))).toBe(false);
  });
});

describe('matchBackup 判级', () => {
  it('同名同字节 → verified，且带 localHash（记账稳定键）', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('IMG_1.jpg', 'photo-bytes')]));
    const m = await matchBackup(mk('IMG_1.jpg', 'photo-bytes'), undefined, index);
    expect(m.status).toBe('verified');
    expect(m.localHash).toBe(await quickHash(mk('x.jpg', 'photo-bytes')));
  });
  it('改名但同字节（备份工具重命名）→ verified', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('renamed.jpg', 'photo-bytes')]));
    const m = await matchBackup(mk('IMG_1.jpg', 'photo-bytes'), undefined, index);
    expect(m.status).toBe('verified');
  });
  it('同名不同字节、无 DOM 算不了感知哈希 → suspected（绝不进可删）', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('IMG_1.heic', 'original-bytes')]));
    const m = await matchBackup(mk('IMG_1.jpeg', 'transcoded-bytes'), 'aabbccddeeff0011', index);
    expect(m.status).toBe('suspected');
  });
  it('Live Photo 同名 .heic+.mov 备份对：照片的疑似路径指向同类型的 .heic 而非 .mov', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('IMG_5.mov', 'live-motion-part'), mk('IMG_5.heic', 'still-original')]));
    const m = await matchBackup(mk('IMG_5.jpeg', 'transcoded-still'), undefined, index);
    expect(m.status).toBe('suspected');
    expect(m.path).toBe('IMG_5.heic');
  });
  it('同名视频不同字节 → suspected 并提示转码', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('IMG_2.mov', 'original-large')]));
    const m = await matchBackup(mk('IMG_2.mov', 'compressed'), undefined, index);
    expect(m.status).toBe('suspected');
    expect(m.reason).toContain('转码');
  });
  it('毫无线索 → missing', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('other.jpg', 'zzz')]));
    const m = await matchBackup(mk('IMG_3.jpg', 'photo'), undefined, index);
    expect(m.status).toBe('missing');
  });
  it('同大小改名但 hash 比对不一致 → missing（不给「疑似」错误暗示）', async () => {
    const index = buildBackupIndex(recordsFromFiles([mk('renamed.jpg', 'aaaa')]));
    const m = await matchBackup(mk('IMG_4.jpg', 'bbbb'), undefined, index);   // 同 4 字节、内容不同
    expect(m.status).toBe('missing');
    expect(m.reason).toContain('不一致');
  });
});
