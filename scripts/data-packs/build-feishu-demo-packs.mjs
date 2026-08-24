import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const snapshotPath = process.argv[2] || '/tmp/pe-feishu-demo-snapshot.json';
const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
const generatedAt = '2026-08-24T00:00:00.000Z';

const definitions = {
  books: {
    id: 'earth.pocket.feishu.demo.books',
    name: 'Pocket Earth × 飞书 · 100 条示例书库',
    description: '与飞书书籍多维表格已确认示例协调的 100 条轻量书籍数据包。',
    schema: 'pocket.books/v1',
    skill: 'pocket.books',
  },
  movies: {
    id: 'earth.pocket.feishu.demo.movies',
    name: 'Pocket Earth × 飞书 · 100 条示例片库',
    description: '与飞书电影多维表格已确认示例协调的 100 条轻量电影数据包。',
    schema: 'pocket.movies/v1',
    skill: 'pocket.movies',
  },
  music: {
    id: 'earth.pocket.feishu.demo.music',
    name: 'Pocket Earth × 飞书 · 100 条示例音乐库',
    description: '与飞书音乐多维表格已确认示例协调的 100 条轻量音乐数据包；每条保留一首代表曲。',
    schema: 'pocket.music/v1',
    skill: 'pocket.music',
  },
};

function recordsFor(domain) {
  const records = Array.isArray(snapshot[domain]) ? snapshot[domain].slice(0, 100) : [];
  if (records.length !== 100) throw new Error(`${domain} snapshot must contain exactly 100 confirmed records`);
  if (domain !== 'music') return records;
  const compact = records.map((record) => ({
    ...record,
    tracks: Array.isArray(record.tracks) ? record.tracks.slice(0, 1) : [],
    podcast: [],
  }));
  const tracks = compact.reduce((count, record) => count + record.tracks.length, 0);
  if (tracks !== 100) throw new Error(`music snapshot must provide one representative track per record; found ${tracks}`);
  return compact;
}

for (const [domain, definition] of Object.entries(definitions)) {
  const records = recordsFor(domain);
  const document = {
    protocol: 'pocket-data/v1',
    identity: {
      id: definition.id,
      name: definition.name,
      version: '1.0.0',
      author: 'Pocket Earth × 飞书',
      description: definition.description,
    },
    schema: { name: definition.schema, version: '1.0.0', record_count: records.length },
    compatibility: { skills: [definition.skill], runtime_min: '1.0.0' },
    privacy: 'public',
    provenance: {
      source: 'Confirmed Pocket Earth Feishu Bitable demo projection',
      license: 'competition-demonstration-only',
      generated_at: generatedAt,
    },
    distribution: { mode: 'inline' },
    records,
  };
  const outputDir = path.join(root, 'public', 'data-packs', `feishu-pocket-earth-${domain}`, '1.0.0');
  await fs.mkdir(outputDir, { recursive: true });
  const json = JSON.stringify(document);
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'manifest.json'), json),
    fs.writeFile(path.join(outputDir, 'bundle.json'), json),
  ]);
  console.log(`${domain}: ${records.length} records, ${Buffer.byteLength(json)} bytes`);
}
