import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const source = '/Users/zhangcheng/.codex/generated_images/019f5c73-3b01-74d1-b6b1-c61e1d3bf4a6/exec-813e1c79-335a-4e27-ba84-539428c8182e.png';
const outDir = '/Users/zhangcheng/Desktop/pocket earth_google/PocketEarthGoogle_提交包/05_视频封面';
const baseOut = path.join(outDir, 'PocketEarth_拼贴封面_AI底图_无文字.png');
const finalOut = path.join(outDir, 'PocketEarth_Google版_拼贴视频封面_4K.png');

const W = 3840;
const H = 2160;

fs.mkdirSync(outDir, { recursive: true });

await sharp(source)
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .png({ compressionLevel: 9 })
  .toFile(baseOut);

const overlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="hardShadow" x="-20%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="16" dy="18" stdDeviation="0" flood-color="#111111" flood-opacity="1"/>
    </filter>
  </defs>

  <g filter="url(#hardShadow)">
    <rect x="150" y="1220" width="775" height="98" fill="#111111"/>
  </g>
  <text x="190" y="1288" fill="#F8F3E8" font-family="SFMono-Regular, JetBrains Mono, PingFang SC, monospace" font-size="36" font-weight="700" letter-spacing="4">GOOGLE AI · PERSONAL EARTH</text>

  <text x="150" y="1510" fill="#111111" font-family="Helvetica Neue Condensed Black, Arial Narrow, SF Pro Display, PingFang SC, sans-serif" font-size="176" font-weight="900" letter-spacing="-5">POCKET EARTH</text>
  <text x="150" y="1660" fill="#078A5A" font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="78" font-weight="800">把世界，钉回它该在的地方。</text>

  <line x1="150" y1="1725" x2="1480" y2="1725" stroke="#111111" stroke-width="6"/>
  <text x="150" y="1810" fill="#222222" font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="39" font-weight="600">书、影、乐、照片、行程与心情，</text>
  <text x="150" y="1870" fill="#222222" font-family="PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="39" font-weight="600">都会成为私人地球上的坐标。</text>

  <rect x="150" y="1935" width="890" height="80" fill="#91D9CA"/>
  <text x="185" y="1990" fill="#111111" font-family="SFMono-Regular, JetBrains Mono, PingFang SC, monospace" font-size="31" font-weight="700" letter-spacing="3">YOUR WORLD · YOUR MEMORY</text>
</svg>
`);

await sharp(baseOut)
  .composite([{ input: overlay, top: 0, left: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(finalOut);

console.log(finalOut);

