import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const W = 3840;
const H = 2160;
const OUT = '/Users/zhangcheng/Desktop/pocket earth_google/PocketEarthGoogle_提交包/02_架构图/视频插图_Google双推理三幕';

const C = {
  bg: '#07100D',
  bg2: '#0A1511',
  panel: '#0E1B16',
  panel2: '#111F1A',
  white: '#F3F7F2',
  muted: '#A7B3AC',
  dim: '#6F7C75',
  line: '#31423A',
  green: '#00E78C',
  cyan: '#35D4FF',
  purple: '#B892FF',
  yellow: '#FFD95A',
  red: '#FF7C6E',
};

const font = `"SF Pro Display", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif`;
const mono = `"SFMono-Regular", "JetBrains Mono", "PingFang SC", monospace`;

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function text(x, y, value, size, color = C.white, weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" fill="${color}" font-family='${font}' font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
}

function monoText(x, y, value, size, color = C.muted, weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" fill="${color}" font-family='${mono}' font-size="${size}" font-weight="${weight}" letter-spacing="4" ${extra}>${esc(value)}</text>`;
}

function pill(x, y, w, label, fill, fg = C.bg, size = 34) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="64" rx="4" fill="${fill}"/>
    ${text(x + w / 2, y + 43, label, size, fg, 700, 'text-anchor="middle"')}
  </g>`;
}

function card(x, y, w, h, accent, title, body = [], options = {}) {
  const { eyebrow = '', badge = '', badgeWidth = 0, fill = C.panel, titleSize = 56, bodySize = 36 } = options;
  let out = `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${C.white}" stroke-width="3"/>
    <rect x="${x}" y="${y}" width="14" height="${h}" rx="7" fill="${accent}"/>
  </g>`;
  if (eyebrow) out += monoText(x + 50, y + 60, eyebrow, 28, accent, 700);
  const titleY = eyebrow ? y + 132 : y + 82;
  out += text(x + 50, titleY, title, titleSize, C.white, 700);
  body.forEach((line, i) => {
    out += text(x + 50, titleY + 64 + i * 52, line, bodySize, i === 0 ? C.muted : C.dim, 500);
  });
  if (badge) out += pill(x + w - badgeWidth - 36, y + 28, badgeWidth, badge, accent, C.bg, 28);
  return out;
}

function arrow(x1, y1, x2, y2, color = C.green, width = 8, dash = '') {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow-${color.slice(1)})"/>`;
}

function base(index, kicker, titleValue, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#163027" stroke-width="1" opacity="0.55"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="45%" r="62%">
      <stop offset="0" stop-color="#0D3324" stop-opacity="0.82"/>
      <stop offset="0.56" stop-color="#0A1712" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#07100D" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="150%" height="160%">
      <feDropShadow dx="14" dy="16" stdDeviation="0" flood-color="#000000" flood-opacity="0.65"/>
    </filter>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="24" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${[C.green, C.cyan, C.purple, C.yellow, C.red].map(c => `<marker id="arrow-${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/></marker>`).join('')}
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <path d="M110 170V110H170 M3670 110H3730V170 M110 1990V2050H170 M3670 2050H3730V1990" fill="none" stroke="${C.green}" stroke-width="6"/>
  ${monoText(150, 180, 'POCKET · EARTH  /  GOOGLE AI', 34, C.green, 700)}
  ${monoText(3460, 180, `${String(index).padStart(2, '0')} / 05`, 34, C.green, 700, 'text-anchor="end"')}
  ${monoText(150, 340, kicker, 34, C.green, 700)}
  ${text(150, 500, titleValue, 126, C.white, 700)}
  ${text(150, 585, subtitle, 42, C.muted, 500)}
  <line x1="150" y1="645" x2="3690" y2="645" stroke="${C.line}" stroke-width="3"/>
`;
}

function footer(left, right) {
  return `<line x1="150" y1="1940" x2="3690" y2="1940" stroke="${C.line}" stroke-width="3"/>
  ${monoText(150, 2025, left, 30, C.green, 700)}
  ${monoText(3690, 2025, right, 30, C.dim, 500, 'text-anchor="end"')}
  </svg>`;
}

function slideOne() {
  let s = base(1, 'MODEL-FIRST · 双推理核心', '模型能力，放在核心', 'Gemma 本地选择 · Harness 动态路由 · Gemini 复杂生成 · RunTrace 全链可见');

  s += card(150, 760, 1010, 700, C.green, 'Gemma 3n E2B IT', [
    '隐私敏感的本地选择',
    '预分类 · 排序 · 轻量理解',
  ], { eyebrow: 'LOCAL · GOOGLE AI EDGE', badge: '端侧', badgeWidth: 150, fill: '#0D2018' });
  s += pill(200, 1280, 260, 'NO UPLOAD', C.green, C.bg, 30);
  s += pill(485, 1280, 270, 'WebGPU', C.cyan, C.bg, 30);
  s += pill(780, 1280, 320, 'MediaPipe', C.purple, C.bg, 30);

  s += `<g filter="url(#shadow)">
    <path d="M1685 765 L2145 765 L2305 1110 L2145 1455 L1685 1455 L1525 1110 Z" fill="${C.panel2}" stroke="${C.yellow}" stroke-width="6"/>
  </g>`;
  s += monoText(1915, 890, 'HARNESS', 34, C.yellow, 700, 'text-anchor="middle"');
  s += text(1915, 1030, '决定何时调用', 66, C.white, 700, 'text-anchor="middle"');
  s += text(1915, 1115, '隐私 · 成本 · 能力', 38, C.muted, 500, 'text-anchor="middle"');
  s += pill(1700, 1210, 430, 'ROUTE BY INTENT', C.yellow, C.bg, 28);

  s += card(2670, 760, 1020, 700, C.cyan, 'Google Gemini', [
    '复杂理解与跨文化生成',
    '多模态 · 双语叙事 · 推理',
  ], { eyebrow: 'CLOUD · COMPLEX REASONING', badge: '云端', badgeWidth: 150, fill: '#0C1C21' });
  s += pill(2720, 1280, 300, 'MULTIMODAL', C.cyan, C.bg, 27);
  s += pill(3045, 1280, 270, 'BILINGUAL', C.purple, C.bg, 27);
  s += pill(3340, 1280, 300, 'REASONING', C.yellow, C.bg, 27);

  s += arrow(1160, 1110, 1490, 1110, C.green, 9);
  s += arrow(2340, 1110, 2670, 1110, C.cyan, 9);

  s += `<g filter="url(#shadow)"><rect x="350" y="1570" width="3130" height="260" rx="10" fill="#0B1612" stroke="${C.white}" stroke-width="3"/></g>`;
  s += monoText(430, 1645, 'RUNTRACE · 完整链路摊开', 31, C.purple, 700);
  const nodes = [
    ['REQUEST', C.white], ['ROUTER', C.yellow], ['GEMMA / GEMINI', C.green], ['RESULT', C.cyan], ['EVIDENCE', C.purple]
  ];
  const nx = [520, 1110, 1770, 2600, 3200];
  nodes.forEach(([label, color], i) => {
    s += `<circle cx="${nx[i]}" cy="1740" r="18" fill="${color}"/>`;
    s += monoText(nx[i], 1800, label, 25, color, 700, 'text-anchor="middle"');
    if (i < nodes.length - 1) s += `<line x1="${nx[i] + 34}" y1="1740" x2="${nx[i + 1] - 34}" y2="1740" stroke="${C.line}" stroke-width="6"/>`;
  });

  s += footer('HARNESS ROUTES · RUNTRACE EXPLAINS', 'MODEL-FIRST ARCHITECTURE');
  return s;
}

function browserFrame(x, y, w, h) {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#0B1511" stroke="${C.white}" stroke-width="4"/>
    <rect x="${x}" y="${y}" width="${w}" height="86" rx="16" fill="#13221B"/>
    <circle cx="${x + 44}" cy="${y + 43}" r="12" fill="${C.red}"/>
    <circle cx="${x + 82}" cy="${y + 43}" r="12" fill="${C.yellow}"/>
    <circle cx="${x + 120}" cy="${y + 43}" r="12" fill="${C.green}"/>
    ${monoText(x + 180, y + 56, 'POCKET EARTH / AGENTS', 26, C.muted, 500)}
  </g>`;
}

function checkRow(x, y, label, detail, color = C.green) {
  return `<g>
    <rect x="${x}" y="${y}" width="62" height="62" rx="8" fill="${color}"/>
    <path d="M${x + 16} ${y + 31} l14 14 l25 -28" fill="none" stroke="${C.bg}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    ${text(x + 92, y + 43, label, 41, C.white, 700)}
    ${text(x + 550, y + 43, detail, 34, C.muted, 500)}
  </g>`;
}

function slideTwo() {
  let s = base(2, 'GOOGLE AI EDGE · 真实运行', 'Gemma 3n E2B IT，已经跑起来', '不是概念接入：模型权重在项目内，Agents 页完成真实加载与端侧生成验证');

  s += browserFrame(150, 760, 2150, 1020);
  s += monoText(250, 950, 'MODEL', 30, C.green, 700);
  s += text(250, 1050, 'Gemma 3n E2B IT', 72, C.white, 700);
  s += pill(250, 1110, 320, 'int4 Web', C.green, C.bg, 30);
  s += pill(600, 1110, 390, '.litertlm', C.cyan, C.bg, 30);
  s += pill(1020, 1110, 520, 'PROJECT-LOCAL', C.purple, C.bg, 30);
  s += `<line x1="250" y1="1240" x2="2190" y2="1240" stroke="${C.line}" stroke-width="3"/>`;
  s += checkRow(250, 1320, '权重已安装', '项目内模型文件', C.green);
  s += checkRow(250, 1435, '模型已加载', '同源 Range 分段加载', C.cyan);
  s += checkRow(250, 1550, '生成已验证', 'Agents 页面真实输出', C.purple);
  s += pill(1670, 1650, 470, 'VERIFIED', C.yellow, C.bg, 32);

  s += card(2500, 760, 1190, 270, C.green, 'Gemma 3n E2B IT', ['Google 开放模型 · 本地权重'], { eyebrow: '01 · MODEL', titleSize: 58 });
  s += card(2500, 1080, 1190, 270, C.cyan, 'MediaPipe LLM Inference Web', ['浏览器端模型运行时'], { eyebrow: '02 · RUNTIME', titleSize: 49 });
  s += card(2500, 1400, 1190, 270, C.purple, 'WebGPU', ['设备内计算 · 不走云端 API'], { eyebrow: '03 · ACCELERATION', titleSize: 62 });
  s += arrow(3095, 1030, 3095, 1060, C.green, 8);
  s += arrow(3095, 1350, 3095, 1380, C.cyan, 8);

  s += `<g filter="url(#softGlow)"><circle cx="3580" cy="1755" r="16" fill="${C.green}"/></g>`;
  s += monoText(3510, 1766, 'ON DEVICE', 27, C.green, 700, 'text-anchor="end"');

  s += footer('INSTALLED · LOADED · GENERATED', 'GOOGLE AI EDGE / WEBGPU');
  return s;
}

function shield(x, y, color = C.green) {
  return `<g>
    <path d="M${x} ${y} L${x + 92} ${y + 34} V${y + 120} C${x + 92} ${y + 188} ${x + 48} ${y + 226} ${x} ${y + 248} C${x - 48} ${y + 226} ${x - 92} ${y + 188} ${x - 92} ${y + 120} V${y + 34} Z" fill="${color}" opacity="0.16" stroke="${color}" stroke-width="7"/>
    <path d="M${x - 40} ${y + 126} l30 30 l58 -72" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function slideThree() {
  let s = base(3, 'LOCAL FIRST · 复杂任务再上云', '高频隐私任务，不应先上传', 'Gemma 在本地预分类；只有需要复杂理解与生成时，Harness 才升级到 Gemini');

  s += card(150, 770, 840, 700, C.white, '用户任务', [
    '照片 · 地点 · 个人偏好',
    '高频、隐私、设备内优先',
  ], { eyebrow: 'INPUT · PRIVATE BY DEFAULT', fill: '#101915' });
  s += shield(570, 1210, C.green);
  s += monoText(570, 1525, 'PRIVACY FIRST', 27, C.green, 700, 'text-anchor="middle"');

  s += arrow(990, 1120, 1320, 1120, C.green, 9);
  s += `<g filter="url(#shadow)"><path d="M1570 780 L2050 1120 L1570 1460 L1090 1120 Z" fill="${C.panel2}" stroke="${C.yellow}" stroke-width="6"/></g>`;
  s += monoText(1570, 985, 'HARNESS', 30, C.yellow, 700, 'text-anchor="middle"');
  s += text(1570, 1085, '需要复杂理解？', 54, C.white, 700, 'text-anchor="middle"');
  s += text(1570, 1170, '按隐私、成本与能力判断', 34, C.muted, 500, 'text-anchor="middle"');
  s += pill(1345, 1260, 450, 'ROUTE DECISION', C.yellow, C.bg, 28);

  s += card(2280, 750, 1410, 400, C.green, 'Gemma 本地预分类', [
    '分类 · 排序 · 轻量选择',
    '默认不上传原始隐私数据',
  ], { eyebrow: 'NO · LOCAL IS ENOUGH', badge: '本地完成', badgeWidth: 230, fill: '#0C2117', titleSize: 62 });
  s += arrow(1910, 1015, 2280, 960, C.green, 9);
  s += monoText(2140, 930, 'NO', 26, C.green, 700, 'text-anchor="middle"');

  s += card(2280, 1270, 1410, 400, C.cyan, 'Gemini 复杂任务升级', [
    '跨文化理解 · 多模态生成',
    '仅上传完成任务所需内容',
  ], { eyebrow: 'YES · CLOUD ADDS CAPABILITY', badge: '按需上云', badgeWidth: 230, fill: '#0B1C21', titleSize: 62 });
  s += arrow(1910, 1225, 2280, 1430, C.cyan, 9);
  s += monoText(2130, 1365, 'YES', 26, C.cyan, 700, 'text-anchor="middle"');

  s += `<g filter="url(#shadow)"><rect x="640" y="1745" width="2560" height="120" rx="8" fill="${C.green}"/></g>`;
  s += text(1920, 1826, 'Gemma 先分类  ·  Gemini 再升级', 55, C.bg, 700, 'text-anchor="middle"');

  s += footer('LOCAL BY DEFAULT · CLOUD BY NECESSITY', 'PRIVACY-AWARE ROUTING');
  return s;
}

function museumLabel(x, y, w, h) {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#E9E6DC" stroke="${C.white}" stroke-width="3"/>
    <rect x="${x + 34}" y="${y + 34}" width="${w - 68}" height="82" fill="#17211D"/>
    ${text(x + 68, y + 91, '青铜器展签', 38, '#F3F7F2', 700)}
    ${text(x + 42, y + 174, '年代', 29, '#3D4742', 700)}
    ${text(x + 220, y + 174, '西周早期', 29, '#17211D', 700)}
    ${text(x + 42, y + 236, '器类', 29, '#3D4742', 700)}
    ${text(x + 220, y + 236, '礼器 · 爵', 29, '#17211D', 700)}
    ${text(x + 42, y + 298, '材质', 29, '#3D4742', 700)}
    ${text(x + 220, y + 298, '青铜', 29, '#17211D', 700)}
    <line x1="${x + 42}" y1="${y + 340}" x2="${x + w - 42}" y2="${y + 340}" stroke="#88918C" stroke-width="3"/>
    <line x1="${x + 42}" y1="${y + 385}" x2="${x + w - 160}" y2="${y + 385}" stroke="#AAB0AC" stroke-width="3"/>
  </g>`;
}

function slideFour() {
  let s = base(4, 'MUSEUM COMPANION · 看展搭子', '一张展签，生成跨文化导览', '上传前先征得同意；Gemini Flash 补全信息，并一次生成四种结构化内容');

  s += card(150, 760, 760, 1010, C.white, '拍摄展签', [
    '相机输入 · 现场上下文',
    '只在用户确认后进入云端',
  ], { eyebrow: '01 · CAPTURE', badge: 'INPUT', badgeWidth: 160, fill: '#101915', titleSize: 58 });
  s += museumLabel(245, 1110, 570, 470);
  s += pill(245, 1630, 570, 'PHOTO + LABEL', C.white, C.bg, 28);

  s += arrow(910, 1090, 1080, 1090, C.yellow, 8);
  s += card(1080, 790, 760, 390, C.yellow, '先征得同意', [
    '图片上传不是默认动作',
    '用户明确授权后才继续',
  ], { eyebrow: '02 · CONSENT GATE', badge: 'REQUIRED', badgeWidth: 220, fill: '#201C0E', titleSize: 56 });
  s += pill(1170, 1070, 580, 'SUGGEST → CONFIRM', C.yellow, C.bg, 28);

  s += arrow(1460, 1190, 1460, 1300, C.cyan, 8);
  s += card(1080, 1320, 760, 390, C.cyan, 'Gemini Flash', [
    '补全年代 · 器类 · 材质',
    '理解展签与现场图像',
  ], { eyebrow: '03 · GOOGLE GEMINI', badge: 'CLOUD', badgeWidth: 190, fill: '#0B1C21', titleSize: 62 });
  s += pill(1170, 1600, 580, 'STRUCTURED JSON', C.cyan, C.bg, 28);

  s += arrow(1840, 1515, 2010, 1515, C.cyan, 8);
  s += card(2050, 760, 760, 400, C.green, '中文策展手记', [
    '适合个人回访的中文叙事',
    '保留年代、器类与材质依据',
  ], { eyebrow: 'OUTPUT · ZH', fill: '#0C2117', titleSize: 54 });
  s += card(2900, 760, 790, 400, C.cyan, 'English guide', [
    '面向国际观众的英文导览',
    '不是逐字翻译，而是语境重写',
  ], { eyebrow: 'OUTPUT · EN', fill: '#0B1C21', titleSize: 54 });
  s += card(2050, 1260, 760, 400, C.purple, '时间线', [
    '把器物放回历史坐标',
    '连接人物、朝代与文化流动',
  ], { eyebrow: 'OUTPUT · TIMELINE', fill: '#171324', titleSize: 58 });
  s += card(2900, 1260, 790, 400, C.yellow, 'cultural bridge', [
    '解释差异，避免刻板印象',
    '在两种文化之间建立理解',
  ], { eyebrow: 'OUTPUT · CROSS-CULTURE', fill: '#211C0D', titleSize: 54 });

  s += `<g filter="url(#shadow)"><rect x="2050" y="1715" width="1640" height="105" rx="8" fill="${C.green}"/></g>`;
  s += text(2870, 1787, 'ONE CALL  ·  FOUR STRUCTURED OUTPUTS', 42, C.bg, 700, 'text-anchor="middle"');

  s += footer('CONSENT BEFORE CLOUD · CONTEXT BEFORE GENERATION', 'GEMINI FLASH / MUSEUM COMPANION');
  return s;
}

function photoThumb(x, y, color, index) {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="190" height="150" rx="8" fill="#E8E4DA" stroke="${C.white}" stroke-width="3"/>
    <rect x="${x + 18}" y="${y + 18}" width="154" height="86" rx="4" fill="${color}" opacity="0.5"/>
    <circle cx="${x + 55}" cy="${y + 55}" r="20" fill="${color}"/>
    <path d="M${x + 20} ${y + 104} L${x + 72} ${y + 61} L${x + 112} ${y + 96} L${x + 145} ${y + 69} L${x + 170} ${y + 104} Z" fill="${color}" opacity="0.78"/>
    ${monoText(x + 95, y + 136, `0${index}`, 20, '#3F4944', 700, 'text-anchor="middle"')}
  </g>`;
}

function slideFive() {
  let s = base(5, 'CONFIRM → PLACE → MEMORY', '确认之后，才写回文化记忆', '生成只是建议；用户确认后钉回博物馆坐标，批量照片也能一键整理成看展纪录');

  s += card(150, 760, 1050, 800, C.purple, 'AI 生成草稿', [
    '中文策展手记',
    'English guide',
    '时间线 · cultural bridge',
  ], { eyebrow: '01 · SUGGEST', badge: 'DRAFT', badgeWidth: 190, fill: '#171324', titleSize: 64, bodySize: 40 });
  s += pill(260, 1370, 830, 'NO WRITE BEFORE CONFIRM', C.purple, C.bg, 29);

  s += arrow(1200, 1130, 1370, 1130, C.yellow, 8);
  s += `<g filter="url(#shadow)">
    <path d="M1665 790 L2040 1130 L1665 1470 L1290 1130 Z" fill="#201C0E" stroke="${C.yellow}" stroke-width="6"/>
  </g>`;
  s += monoText(1665, 960, 'USER CONTROL', 28, C.yellow, 700, 'text-anchor="middle"');
  s += text(1665, 1080, '确认后写入', 58, C.white, 700, 'text-anchor="middle"');
  s += `<circle cx="1665" cy="1205" r="74" fill="${C.yellow}"/>
    <path d="M1625 1204 l28 28 l58 -70" fill="none" stroke="${C.bg}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += monoText(1665, 1345, 'CONFIRM', 26, C.yellow, 700, 'text-anchor="middle"');

  s += arrow(2040, 1130, 2200, 1130, C.green, 8);
  s += `<g filter="url(#shadow)"><rect x="2200" y="760" width="1490" height="800" rx="10" fill="#0B1813" stroke="${C.white}" stroke-width="3"/></g>`;
  s += monoText(2270, 840, '02 · PRIVATE EARTH / MUSEUM', 28, C.green, 700);
  s += text(2270, 930, '钉回博物馆坐标', 61, C.white, 700);
  s += `<path d="M2310 1050 C2550 940 2770 1210 3010 1080 S3430 940 3620 1090" fill="none" stroke="${C.line}" stroke-width="10"/>
    <path d="M2380 1390 C2600 1240 2810 1420 3040 1280 S3420 1230 3590 1360" fill="none" stroke="${C.line}" stroke-width="10"/>
    <path d="M2620 1000 L2720 1450 M3190 1000 L3280 1450" fill="none" stroke="${C.line}" stroke-width="8"/>
    <circle cx="3030" cy="1210" r="44" fill="${C.green}" filter="url(#softGlow)"/>
    <path d="M3030 1100 C2950 1100 2890 1160 2890 1240 C2890 1350 3030 1450 3030 1450 C3030 1450 3170 1350 3170 1240 C3170 1160 3110 1100 3030 1100 Z" fill="none" stroke="${C.green}" stroke-width="10"/>
    <circle cx="3030" cy="1240" r="34" fill="${C.green}"/>`;
  s += pill(2260, 1440, 470, '个人文化记忆', C.green, C.bg, 30);
  s += pill(2780, 1440, 820, '可回访 · 可继续补充 · 可追溯', C.cyan, C.bg, 30);

  s += monoText(150, 1660, '03 · BATCH PHOTOS → EXHIBITION RECORD', 28, C.cyan, 700);
  s += photoThumb(150, 1700, C.green, 1);
  s += photoThumb(375, 1700, C.cyan, 2);
  s += photoThumb(600, 1700, C.purple, 3);
  s += photoThumb(825, 1700, C.yellow, 4);
  s += arrow(1045, 1775, 1290, 1775, C.cyan, 8);
  s += `<g filter="url(#shadow)"><rect x="1320" y="1688" width="2370" height="175" rx="8" fill="#0B1C21" stroke="${C.white}" stroke-width="3"/></g>`;
  s += text(1420, 1765, '批量照片', 43, C.cyan, 700);
  s += text(1700, 1765, '一键整理', 43, C.yellow, 700);
  s += text(2040, 1765, '看展纪录', 43, C.green, 700);
  s += text(1420, 1825, '同一场展览自动聚合：展品、时间线、手记与博物馆坐标', 34, C.muted, 500);

  s += footer('SUGGEST · USER CONFIRM · PRIVATE EARTH', 'PERSONAL CULTURAL MEMORY');
  return s;
}

const slides = [
  ['视频插图_01_模型核心与Harness_RunTrace_4K', slideOne()],
  ['视频插图_02_Gemma3n端侧真实运行_4K', slideTwo()],
  ['视频插图_03_本地优先复杂任务升级Gemini_4K', slideThree()],
  ['视频插图_04_看展搭子_GeminiFlash跨文化生成_4K', slideFour()],
  ['视频插图_05_确认后写回文化记忆与批量整理_4K', slideFive()],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [name, svg] of slides) {
  const svgPath = path.join(OUT, `${name}.svg`);
  const pngPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  console.log(`${name}: ${pngPath}`);
}

const readme = `# Google 推理与看展搭子五幕 · 视频插图\n\n` +
`五张图均为 3840×2160 PNG，并保留 SVG 矢量源文件。\n\n` +
`1. **模型核心与 Harness / RunTrace**\n` +
`   - 配口播：“目前，我把模型能力放在核心：Gemini 负责复杂理解和跨文化生成，Gemma 3n E2B 负责隐私敏感的本地选择；Harness 决定何时调用，RunTrace 摊开完整链路。”\n` +
`2. **Gemma 3n 端侧真实运行**\n` +
`   - 配口播：“第二项 Google 核心技术，是端侧 Gemma 3n E2B IT。权重已安装在项目内，Agents 页已完成真实加载和端侧生成验证。”\n` +
`3. **本地优先，复杂任务升级 Gemini**\n` +
`   - 配口播：“高频隐私任务不应先上传。让 Gemma 在本地预分类；只有复杂任务才升级到云端 Gemini。”\n` +
`4. **看展搭子：Gemini Flash 跨文化生成**\n` +
`   - 配口播：“把这套机制放到博物馆里，就是看展搭子。拍一张展签，Gemini Flash 会补全年代、器类和材质；上传图片前，系统会先征得同意。它会一次生成中文策展手记、English guide 和时间线，还会生成避免刻板印象的 cultural bridge。”\n` +
`5. **确认后写回文化记忆与批量整理**\n` +
`   - 配口播：“你确认后，结果才钉回博物馆坐标，成为可回访的个人文化记忆。批量照片也能一键整理成看展纪录。”\n`;
fs.writeFileSync(path.join(OUT, 'README_视频插入建议.md'), readme, 'utf8');
