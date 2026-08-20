import { validatePackFile } from './protocol.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run datapack:validate -- /absolute/path/to/manifest-or-bundle.json');
  process.exit(2);
}

try {
  const result = validatePackFile(input);
  console.log(JSON.stringify({ status: 'VALID', file: result.file, domain: result.domain, pack: result.manifest.identity.id, version: result.manifest.identity.version, records: result.records.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'INVALID', error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}

