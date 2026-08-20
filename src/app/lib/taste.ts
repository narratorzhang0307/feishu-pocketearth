// 读者口味摘要（按评分的「最偏爱」维度）
// 长期画像是按「数量」统计的，会让读得多的地区(中国/美国/日本)盖过读得少但打分极高的地区。
// 这里直接从真实书目(bookRecords，含国家+评分)另算一份「按满意度的偏爱地区」：国家→地区汇总，
// 按地区平均评分排序，让用户真正钟爱的文学(如拉丁美洲魔幻现实主义)浮出来，注入云脑提示。
import { bookRecords } from '../data/books';

// 国家 → 大区。未列出的国家回退为其本身（仍可被汇总展示）。
const REGION_OF: Record<string, string> = {
  中国大陆: '中国', 中国台湾: '中国', 中国香港: '中国', 中国: '中国',
  美国: '北美', 加拿大: '北美',
  日本: '东亚', 韩国: '东亚',
  英国: '西欧', 法国: '西欧', 德国: '西欧', 爱尔兰: '西欧', 瑞士: '西欧', 奥地利: '西欧', 荷兰: '西欧', 比利时: '西欧',
  意大利: '南欧', 西班牙: '南欧', 葡萄牙: '南欧', 希腊: '南欧',
  瑞典: '北欧', 挪威: '北欧', 丹麦: '北欧', 芬兰: '北欧', 冰岛: '北欧',
  俄罗斯: '俄罗斯', 苏联: '俄罗斯',
  哥伦比亚: '拉丁美洲', 阿根廷: '拉丁美洲', 智利: '拉丁美洲', 墨西哥: '拉丁美洲', 秘鲁: '拉丁美洲',
  古巴: '拉丁美洲', 巴西: '拉丁美洲', 乌拉圭: '拉丁美洲', 委内瑞拉: '拉丁美洲', 危地马拉: '拉丁美洲', 尼加拉瓜: '拉丁美洲',
  印度: '南亚', 土耳其: '中东', 以色列: '中东', 埃及: '非洲', 南非: '非洲', 尼日利亚: '非洲',
};
const regionOf = (c: string) => REGION_OF[c] || c;

// 拼出可直接塞进云脑 system 的「口味摘要」，无数据返回空串。
export function getTasteSummary(): string {
  if (!bookRecords.length) return '';
  const cnt: Record<string, number> = {};
  const agg: Record<string, { n: number; sum: number; rated: number; five: number }> = {};
  for (const b of bookRecords) {
    const c = (b.country || '').trim();
    if (!c) continue;
    cnt[c] = (cnt[c] || 0) + 1;
    const reg = regionOf(c);
    const a = (agg[reg] ||= { n: 0, sum: 0, rated: 0, five: 0 });
    a.n++;
    const r = b.rating;
    if (typeof r === 'number') { a.sum += r; a.rated++; if (r >= 5) a.five++; }
  }
  const topCnt = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([c, n]) => `${c}(${n})`);
  // 最偏爱：地区有一定量(≥8 本、≥5 本有评分)，按平均分排序
  const loved = Object.entries(agg)
    .filter(([, a]) => a.n >= 8 && a.rated >= 5)
    .map(([reg, a]) => ({ reg, avg: a.sum / a.rated, five: a.five }))
    .sort((x, y) => y.avg - x.avg || y.five - x.five)
    .slice(0, 4)
    .map((o) => `${o.reg}（均分${o.avg.toFixed(2)}·${o.five}本5★）`);
  if (!topCnt.length) return '';
  const lines = [
    `# 读者口味（来自其真实读书记录，共 ${bookRecords.length} 本，务必结合它作答）`,
    `读得最多：${topCnt.join('、')}`,
  ];
  if (loved.length) lines.push(`最偏爱（按地区平均评分，反映真正钟爱而非读得多少）：${loved.join('、')}`);
  return lines.join('\n');
}
