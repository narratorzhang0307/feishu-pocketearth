const manifests = [
  'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-books-movies-v1/pocket-earth-books/1.0.0/manifest.json',
  'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-books-movies-v1/pocket-earth-movies/1.0.0/manifest.json',
  'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-music-v1/pocket-earth-music/1.0.0/manifest.json',
];

const valuesAfter = (flag) => process.argv.flatMap((value, index, all) => value === flag && all[index + 1] ? [all[index + 1]] : []);
const origins = valuesAfter('--origin');
const urls = valuesAfter('--url');
const targets = urls.length ? urls : manifests;
const checkedOrigins = origins.length ? origins : [
  'https://pocketearth-google.throughtheglass.art',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const results = [];
for (const origin of checkedOrigins) {
  for (const url of targets) {
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const allowOrigin = response.headers.get('access-control-allow-origin') || '';
    const allowMethods = response.headers.get('access-control-allow-methods') || '';
    const passed = response.ok && (allowOrigin === origin || allowOrigin === '*') && /(?:^|,\s*)GET(?:\s*,|$)/i.test(allowMethods);
    results.push({ origin, url, status: response.status, allowOrigin, allowMethods, passed });
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ status: failed.length ? 'FAILED' : 'CORS_OK', checks: results.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
