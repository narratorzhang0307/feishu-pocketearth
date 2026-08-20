import {
  DATA_PACK_PROTOCOL,
  DATA_PACK_RUNTIME_VERSION,
  dataPackAdapterForDomain,
  type DataPackDomain,
} from './types';
import booksRecordSchema from '../../../../schemas/pocket-data-v1/books-record.schema.json';
import moviesRecordSchema from '../../../../schemas/pocket-data-v1/movies-record.schema.json';
import musicRecordSchema from '../../../../schemas/pocket-data-v1/music-city-record.schema.json';
import mappingRecordSchema from '../../../../schemas/pocket-data-v1/mapping-record.schema.json';
import booksExample from '../../../../schemas/pocket-data-v1/examples/books-small.bundle.json';
import moviesExample from '../../../../schemas/pocket-data-v1/examples/movies-small.bundle.json';
import musicExample from '../../../../schemas/pocket-data-v1/examples/music-small.bundle.json';
import mappingExample from '../../../../schemas/pocket-data-v1/examples/mapping-small.bundle.json';

const DOMAIN_LABELS: Record<DataPackDomain, string> = { books: '书籍', movies: '电影', music: '音乐', mapping: '内容 Mapping' };
const domainLabel = (domain: DataPackDomain) => DOMAIN_LABELS[domain];
const RECORD_SCHEMAS: Record<DataPackDomain, object> = {
  books: booksRecordSchema,
  movies: moviesRecordSchema,
  music: musicRecordSchema,
  mapping: mappingRecordSchema,
};
const EXAMPLE_BUNDLES: Record<DataPackDomain, object> = {
  books: booksExample,
  movies: moviesExample,
  music: musicExample,
  mapping: mappingExample,
};

export function createEmptyDataPackTemplate(domain: DataPackDomain, generatedAt = new Date().toISOString()) {
  const adapter = dataPackAdapterForDomain(domain);
  return {
    protocol: DATA_PACK_PROTOCOL,
    identity: {
      id: `com.example.my-${domain}`,
      name: `我的${domainLabel(domain)}数据包`,
      version: '1.0.0',
      author: '请填写作者',
      description: `符合 ${DATA_PACK_PROTOCOL} 的${domainLabel(domain)}数据包`,
    },
    schema: {
      name: adapter.schemaName,
      version: adapter.schemaVersion,
      record_count: 0,
    },
    compatibility: {
      skills: [adapter.skillId],
      runtime_min: DATA_PACK_RUNTIME_VERSION,
    },
    privacy: 'private',
    provenance: {
      source: '请填写原始数据来源',
      license: 'private-use',
      generated_at: generatedAt,
    },
    distribution: { mode: 'inline' },
    records: [],
  };
}

export function createDataPackAiInstruction(domain: DataPackDomain): string {
  const adapter = dataPackAdapterForDomain(domain);
  const recordRule = domain === 'books'
    ? '每条记录使用字段：id、title、author、country、type、year、rating、date、synopsis，可选 locations。'
    : domain === 'movies'
      ? '每条记录使用字段：id、title、original、type、director、country、year、rating、publicRating、date、synopsis，可选 locations。'
      : domain === 'music'
        ? '每条记录代表一座城市电台，使用 id、slug、cityName、cityNameZh、ianaTz、tzOffset、station、cover、lat、lng、description、tracks、podcast。每首 track 使用 id、title、artist、genre、durationSec、playback、introText、introPlayback。YouTube 来源写成 playback={provider:"youtube",url:"",sourceId:"视频 ID",sourceUrl:"原始 HTTPS 页面"}；可直接播放的 OSS/外部音频写成 provider="oss" 或 "external"，并在 url 提供可播放的 HTTPS 音频地址。不要把 YouTube 歌单 URL 当成 Data Pack Manifest。'
        : '每条记录代表一份书籍或资料，使用 id、title、author、era、city、sourceName、sourceSha256、summary、locations。每个地点必须保存原文页码、逐字引文、关系、现状、WGS84 坐标、置信度与人工确认状态；未经人工确认或没有有限坐标的候选不得写入最终 Data Pack。';
  const template = JSON.stringify(createEmptyDataPackTemplate(domain), null, 2);
  const schema = JSON.stringify(RECORD_SCHEMAS[domain], null, 2);
  const example = JSON.stringify(EXAMPLE_BUNDLES[domain], null, 2);

  return `你现在充当 Pocket Earth Data Pack 制作 Skill。请把我随后提供的原始资料整理为可直接导入的 ${DATA_PACK_PROTOCOL} 单文件 Bundle。

【固定目标】
- 数据类型：${domainLabel(domain)}
- 目标 Skill：${adapter.skillId}
- 记录 Schema：${adapter.schemaName}
- Schema 版本：${adapter.schemaVersion}

【执行流程】
1. 先阅读下方“空白模板”“记录 JSON Schema”和“合法示例”，再处理原始资料。
2. 只替换模板中的 identity、provenance、records 和 record_count；固定目标字段不得自行改名。
3. ${recordRule}
4. 每条记录 id 必须稳定且在数据包内唯一；schema.record_count 必须严格等于 records.length。
5. 不得编造事实。未知文本填空字符串，未知数字填 null；Schema 允许省略的字段可省略。音乐未知播放来源使用 {"provider":"none","url":""}。
6. 个人数据默认 privacy=private、license=private-use；provenance.source 必须写真实输入来源。
7. 地点只有在来源可靠时才写，坐标使用 WGS84；评分、公开评分和地点置信度不得混用。
8. 输出前检查顶层字段、字段类型、额外字段、重复 ID、记录数、日期、URL、坐标和隐私。
9. 最终只输出一份纯 JSON，不要 Markdown 代码围栏、解释文字或省略号。

${domain === 'music' ? `【YouTube 特别规则】
- 单曲或歌单 URL 是“原始资料”，不是 Data Pack Manifest。
- 歌单先展开为 tracks；无法读取完整歌单时向我索取导出清单，不得猜测缺失曲目。
- YouTube 来源保留 provider="youtube"、sourceId 和 sourceUrl；如果没有可确认的来源就用 provider="none"。

` : domain === 'mapping' ? `【Mapping 特别规则】
- 自动化只生成候选；页码、原文引句、历史地点状态与坐标必须经过人工确认后才可进入 records。
- 古籍、现代小说、游记、史书、剧本、笔记和展览图录共用 pocket.mapping/v1；古籍只是载体预设，不另造协议。
- sourceSha256 必须是原始导入文件的 SHA256；sourceRef 可写 EPUB 章节路径或页码来源；sourceUrls 只放可复核的 HTTPS 链接。

` : ''}【空白模板：在此结构中填数据】
${template}

【记录 JSON Schema：每条 records 项必须完全通过它】
${schema}

【合法示例：学习结构，不要照抄示例事实】
${example}

现在等待我提供原始资料；收到后直接生成最终 JSON。`;
}
