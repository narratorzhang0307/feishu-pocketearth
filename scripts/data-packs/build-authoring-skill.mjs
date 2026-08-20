import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillName = 'make-pocket-data-pack';
const skillDir = path.join(root, 'skills', skillName);
const referencesDir = path.join(skillDir, 'references');
const assetsDir = path.join(skillDir, 'assets');
const skillScriptsDir = path.join(skillDir, 'scripts');
const publicDir = path.join(root, 'public', 'skills');

for (const directory of [referencesDir, assetsDir, skillScriptsDir, publicDir]) mkdirSync(directory, { recursive: true });

const copies = [
  ['schemas/pocket-data-v1/books-record.schema.json', 'references/books-record.schema.json'],
  ['schemas/pocket-data-v1/movies-record.schema.json', 'references/movies-record.schema.json'],
  ['schemas/pocket-data-v1/music-city-record.schema.json', 'references/music-city-record.schema.json'],
  ['schemas/pocket-data-v1/mapping-record.schema.json', 'references/mapping-record.schema.json'],
  ['schemas/pocket-data-v1/examples/books-small.bundle.json', 'references/books-example.bundle.json'],
  ['schemas/pocket-data-v1/examples/movies-small.bundle.json', 'references/movies-example.bundle.json'],
  ['schemas/pocket-data-v1/examples/music-small.bundle.json', 'references/music-example.bundle.json'],
  ['schemas/pocket-data-v1/examples/mapping-small.bundle.json', 'references/mapping-example.bundle.json'],
];

for (const [source, target] of copies) copyFileSync(path.join(root, source), path.join(skillDir, target));

writeFileSync(path.join(referencesDir, 'music-sources.md'), `# 音乐来源整理规则

## YouTube 单曲

1. 把视频页面当作原始来源，不要当作 Data Pack Manifest。
2. 能可靠读取时，提取曲名、艺人和视频 ID；不能确认时保留空字段或询问用户。
3. 将 \`playback.provider\` 设为 \`youtube\`，将视频 ID 写入 \`sourceId\`，将原始 HTTPS 页面写入 \`sourceUrl\`。
4. YouTube 来源的 \`url\` 必须留空，因为它不是可交给 HTML Audio 的音频直链；Pocket Earth 会用 \`sourceId\` / \`sourceUrl\` 启动 YouTube 官方嵌入播放器。
5. 若另有获得许可、可直接播放的 OSS 或外部音频，则改用 \`oss\` 或 \`external\` ，并仅在 \`url\` 填写该 HTTPS 音频直链。

## YouTube 歌单

1. 先展开为曲目清单，再逐首生成 track；歌单本身不是一条 track。
2. 无法访问完整歌单时，要求用户提供 YouTube 导出清单、CSV、截图识别结果或逐行曲目文本，不得猜测缺失曲目。
3. 同一数据包内所有 track ID 必须跨城市唯一。

## 无播放来源

仍可保留曲目元数据。把 \`playback\` 或 \`introPlayback\` 写成 \`{"provider":"none","url":""}\`。不要伪造 OSS 地址或 YouTube ID。
`, 'utf8');

const adapters = {
  books: { label: '书籍', schema: 'pocket.books/v1', skill: 'pocket.books' },
  movies: { label: '电影', schema: 'pocket.movies/v1', skill: 'pocket.movies' },
  music: { label: '音乐', schema: 'pocket.music/v1', skill: 'pocket.music' },
  mapping: { label: '内容 Mapping', schema: 'pocket.mapping/v1', skill: 'pocket.mapping' },
};

for (const [domain, adapter] of Object.entries(adapters)) {
  const template = {
    protocol: 'pocket-data/v1',
    identity: {
      id: `com.example.my-${domain}`,
      name: `我的${adapter.label}数据包`,
      version: '1.0.0',
      author: '请填写数据包作者',
      description: `由 make-pocket-data-pack Skill 整理的${adapter.label}数据`,
    },
    schema: { name: adapter.schema, version: '1.0.0', record_count: 0 },
    compatibility: { skills: [adapter.skill], runtime_min: '1.0.0' },
    privacy: 'private',
    provenance: {
      source: '请填写原始文件、清单、URL 或数据库来源',
      license: 'private-use',
      generated_at: '请替换为 ISO 8601 UTC 时间',
    },
    distribution: { mode: 'inline' },
    records: [],
  };
  writeFileSync(path.join(assetsDir, `${domain}-template.json`), `${JSON.stringify(template, null, 2)}\n`, 'utf8');
}

const validatorCore = readFileSync(path.join(root, 'scripts', 'data-packs', 'protocol.mjs'), 'utf8');
const validatorCli = `

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/validate-data-pack.mjs /absolute/path/to/bundle.json');
  process.exit(2);
}

try {
  const result = validatePackFile(input);
  console.log(JSON.stringify({ status: 'VALID', file: result.file, domain: result.domain, pack: result.manifest.identity.id, version: result.manifest.identity.version, records: result.records.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'INVALID', error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
`;
writeFileSync(path.join(skillScriptsDir, 'validate-data-pack.mjs'), `${validatorCore.trim()}${validatorCli}`, 'utf8');

function collect(directory, prefix = skillName) {
  const files = {};
  for (const entry of readdirSync(directory).sort()) {
    const absolute = path.join(directory, entry);
    const relative = `${prefix}/${entry}`;
    if (statSync(absolute).isDirectory()) Object.assign(files, collect(absolute, relative));
    else files[relative] = strToU8(readFileSync(absolute, 'utf8'));
  }
  return files;
}

const output = path.join(publicDir, `${skillName}.zip`);
writeFileSync(output, zipSync(collect(skillDir), { level: 9 }));
console.log(`Built ${path.relative(root, output)}`);
