import { describe, expect, it } from 'vitest';
import { searchPhotoRadar, type SearchablePhoto } from './search';

const now = new Date('2026-08-11T00:00:00+08:00');

function fixture(
  key: string,
  tags: string[],
  creationTime = new Date('2026-06-01T12:00:00+08:00').getTime(),
  gps = false,
  documentText = '',
): SearchablePhoto {
  return {
    asset: {
      key, assetId: key, source: 'native-library', access: 'full', mediaType: 'image', mimeType: 'image/jpeg',
      fileName: `${key}.jpg`, width: 1600, height: 1200, creationTime,
      ...(gps ? { latitude: 30, longitude: 120 } : {}),
      indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed', sourceState: 'available',
    },
    analysis: {
      key, assetId: key, contentHash: key, photoType: documentText ? 'document' : 'life', technicalQuality: 70,
      preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: gps, needPlace: !gps,
      tags, reasons: [], visionBackend: 'local-features', analyzedAt: 1,
      ...(documentText ? { document: {
        kind: 'receipt' as const, text: documentText, identifiers: [], confidence: 0.8,
        route: 'base' as const, qualityScore: 0.8, qualityGate: 'base-accepted' as const,
      } } : {}),
    },
  };
}

describe('photo search synthetic 100/20 frozen evaluation', () => {
  it('retrieves every expected metadata/tag/OCR target within Recall@5 and Recall@20', () => {
    const cases = [
      { query: '去年杭州拍的猫', item: fixture('q01', ['杭州', '猫'], new Date('2025-05-01').getTime(), true) },
      { query: '中山公园的猫', item: fixture('q02', ['中山公园', '猫']) },
      { query: '巴黎旅行的狗', item: fixture('q03', ['巴黎', '旅行', '狗']) },
      { query: '东京旅行中有朋友的照片', item: fixture('q04', ['东京', '旅行', '朋友']) },
      { query: '所有停车票据', item: fixture('q05', ['停车', '票据'], undefined, false, '停车费票据') },
      { query: '机场登机牌', item: fixture('q06', ['机场', '登机牌'], undefined, false, '机场登机牌') },
      { query: '上海带二维码的照片', item: fixture('q07', ['上海', '二维码']) },
      { query: '没有 GPS 但像西湖的照片', item: fixture('q08', ['西湖']) },
      { query: '带 GPS 的城市夜景', item: fixture('q09', ['城市夜景'], undefined, true) },
      { query: '上海的截图', item: fixture('q10', ['上海', '截图']) },
      { query: '2024 北京人物', item: fixture('q11', ['北京', '人物'], new Date('2024-03-01').getTime()) },
      { query: '苏州园林的狗', item: fixture('q12', ['苏州园林', '狗']) },
      { query: '成都旅行的朋友', item: fixture('q13', ['成都', '旅行', '朋友']) },
      { query: '咖啡发票', item: fixture('q14', ['咖啡', '发票'], undefined, false, '咖啡发票') },
      { query: '机场停车小票', item: fixture('q15', ['机场', '停车', '小票'], undefined, false, '机场停车小票') },
      { query: '东京没有 GPS 的猫', item: fixture('q16', ['东京', '猫']) },
      { query: '2025 广州二维码', item: fixture('q17', ['广州', '二维码'], new Date('2025-09-01').getTime()) },
      { query: '海边的人物', item: fixture('q18', ['海边', '人物']) },
      { query: '夜市票据', item: fixture('q19', ['夜市', '票据'], undefined, false, '夜市消费票据') },
      { query: '杭州旅行中的朋友', item: fixture('q20', ['杭州', '旅行', '朋友']) },
    ];
    const distractors = Array.from({ length: 80 }, (_, index) => fixture(
      `d${String(index).padStart(2, '0')}`, [`干扰地点${index}`, '普通风景'], new Date(2026, 0, 1 + index).getTime(), index % 2 === 0,
    ));
    const library = [...cases.map((entry) => entry.item), ...distractors];
    let hitAt5 = 0; let hitAt20 = 0; let noResult = 0; const missed: string[] = [];
    for (const entry of cases) {
      const keys = searchPhotoRadar(library, entry.query, now).map((result) => result.asset.key);
      if (!keys.length) noResult++;
      if (keys.slice(0, 5).includes(entry.item.asset.key)) hitAt5++;
      if (keys.slice(0, 20).includes(entry.item.asset.key)) hitAt20++;
      else missed.push(entry.query);
    }
    expect(missed).toEqual([]);
    expect({ library: library.length, queries: cases.length, hitAt5, hitAt20, noResult }).toEqual({
      library: 100, queries: 20, hitAt5: 20, hitAt20: 20, noResult: 0,
    });
  });
});
