import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [sourcePath, targetPath, supplementPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) {
  throw new Error('Usage: node build-guji-place-gazetteer.mjs <guji-skill-library.json> <target.json>');
}

const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const places = [];

for (const skill of source.skills || []) {
  for (const book of skill.books || []) {
    for (const place of book.places || []) {
      const names = [...new Set([place.name, place.ancientName, place.modernName].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
      if (!names.length) continue;
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      places.push({
        city: String(book.city || ''),
        names,
        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
        status: String(place.status || place.ancientSiteStatus || 'memory-only'),
        sourceTitle: String(book.title || skill.displayName || skill.name || ''),
        ...(typeof place.chapter === 'string' && place.chapter.trim() ? { sourceRef: place.chapter.trim() } : {}),
        ...(typeof place.quote === 'string' && place.quote.trim() ? { evidenceText: place.quote.trim() } : {}),
      });
    }
  }
}

let supplementSha256 = '';
if (supplementPath) {
  const supplementBytes = await readFile(supplementPath);
  const supplement = JSON.parse(supplementBytes.toString('utf8'));
  supplementSha256 = createHash('sha256').update(supplementBytes).digest('hex');
  for (const place of supplement.places || []) {
    if (!Array.isArray(place.names) || !place.names.length) continue;
    places.push(place);
  }
}

const document = {
  format: 'pocket-guji-place-gazetteer/v1',
  sourceFormat: String(source.format || ''),
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  ...(supplementSha256 ? { supplementSha256 } : {}),
  placeCount: places.length,
  places,
};

await writeFile(targetPath, JSON.stringify(document));
console.log(`wrote ${places.length} places to ${targetPath}`);
