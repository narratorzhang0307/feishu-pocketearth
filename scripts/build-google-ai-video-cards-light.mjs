import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const W = 3840;
const H = 2160;
const OUT = '/Users/zhangcheng/Desktop/pocket earth_google/PocketEarthGoogle_提交包/02_架构图/视频插图_Google技术五幕_浅色版';

const C = {
  paper: '#F3F4F2',
  panel: '#FFFCF4',
  white: '#FFFFFF',
  ink: '#111111',
  grey: '#6F7370',
  grid: '#D9DDDA',
  green: '#0A8A55',
  cyan: '#18D0E6',
  lime: '#7CF36A',
  purple: '#B58AF2',
  yellow: '#FFBC20',
  blue: '#3C70EA',
  red: '#FF7D6E',
  paleGreen: '#EAF8EF',
  paleBlue: '#EAF7FB',
  palePurple: '#F2ECFC',
  paleYellow: '#FFF8E6',
  paleRed: '#FFF0EC',
  paleGrey: '#EEF3F1',
};

const font = `"SF Pro Display", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif`;
const mono = `"SFMono-Regular", "JetBrains Mono", "PingFang SC", monospace`;

function esc(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function tx(x, y, value, size, color = C.ink, weight = 600, extra = '') {
  return `<text x="${x}" y="${y}" fill="${color}" font-family='${font}' font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
}

function monoTx(x, y, value, size, color = C.grey, weight = 600, extra = '') {
  return `<text x="${x}" y="${y}" fill="${color}" font-family='${mono}' font-size="${size}" font-weight="${weight}" letter-spacing="2" ${extra}>${esc(value)}</text>`;
}

function richTitle(main, tail) {
  return `<text x="120" y="150" font-family='${font}' font-size="82" font-weight="800">
    <tspan fill="${C.ink}">${esc(main)}</tspan>
    <tspan fill="${C.green}"> · </tspan>
    <tspan fill="${C.grey}" font-weight="500">${esc(tail)}</tspan>
  </text>`;
}

function base(index, main, tail, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${C.grid}" stroke-width="1.4"/>
    </pattern>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="14" dy="16" stdDeviation="0" flood-color="#000000" flood-opacity="1"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.green}"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  ${richTitle(main, tail)}
  ${tx(120, 238, subtitle, 38, C.grey, 500)}
  <g filter="url(#shadow)">
    <rect x="3370" y="72" width="340" height="105" fill="${C.white}" stroke="${C.ink}" stroke-width="4"/>
  </g>
  ${monoTx(3540, 142, `VIDEO · ${String(index).padStart(2, '0')}/05`, 31, C.ink, 800, 'text-anchor="middle"')}
`;
}

function end(left, right) {
  return `<line x1="120" y1="2000" x2="3720" y2="2000" stroke="${C.grey}" stroke-width="2" stroke-dasharray="7 7"/>
  ${tx(130, 2070, `■ ${left}`, 31, C.green, 700)}
  ${tx(3710, 2070, right, 31, C.grey, 500, 'text-anchor="end"')}
  </svg>`;
}

function section(x, y, w, h, label, accent, fill = C.panel) {
  const labelW = Math.min(w - 80, Math.max(430, label.length * 42 + 100));
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${C.ink}" stroke-width="4"/>
  </g>
  <rect x="${x + 42}" y="${y + 34}" width="${labelW}" height="70" fill="${accent}" stroke="${C.ink}" stroke-width="4"/>
  ${monoTx(x + 68, y + 82, label, 31, C.ink, 800)}
`;
}

function card(x, y, w, h, title, lines = [], fill = C.white, options = {}) {
  const { titleSize = 44, bodySize = 30, accent = '', tag = '', tagFill = C.yellow } = options;
  let out = `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${C.ink}" stroke-width="3.5"/></g>`;
  if (accent) out += `<rect x="${x}" y="${y}" width="12" height="${h}" fill="${accent}"/>`;
  out += tx(x + 34, y + 64, title, titleSize, C.ink, 750);
  lines.forEach((line, i) => {
    out += tx(x + 34, y + 112 + i * 45, line, bodySize, i === 0 ? C.grey : '#858986', 500);
  });
  if (tag) {
    const tagW = Math.max(150, tag.length * 28 + 54);
    out += `<rect x="${x + w - tagW - 22}" y="${y + 20}" width="${tagW}" height="52" fill="${tagFill}" stroke="${C.ink}" stroke-width="3"/>`;
    out += monoTx(x + w - tagW / 2 - 22, y + 56, tag, 25, C.ink, 800, 'text-anchor="middle"');
  }
  return out;
}

function arrow(x1, y1, x2, y2, width = 7) {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${C.green}" stroke-width="${width}" marker-end="url(#arrow)"/>`;
}

function downArrow(x, y1, y2) {
  return arrow(x, y1, x, y2, 8);
}

function note(x, y, w, label, body) {
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="92" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/></g>
    ${tx(x + 28, y + 58, label, 29, C.green, 800)}
    ${tx(x + 185, y + 58, body, 29, C.grey, 500)}
  `;
}

function checkIcon(x, y, color = C.green) {
  return `<rect x="${x}" y="${y}" width="54" height="54" fill="${color}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M${x + 12} ${y + 28} l11 12 l22 -28" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function slide1() {
  let s = base(1, 'Google AI 推理核心', '模型能力放在核心', 'Gemma 本地选择 · Harness 动态路由 · Gemini 复杂生成 · RunTrace 全链可见');

  s += section(120, 330, 3600, 450, '1 · 双推理平面', C.cyan);
  s += card(170, 465, 760, 235, 'Gemma 3n E2B IT', ['隐私敏感的本地选择', '预分类 · 排序 · 轻量理解'], C.paleGreen, { accent: C.green, tag: 'LOCAL', tagFill: C.lime });
  s += card(1090, 465, 650, 235, 'Harness', ['判断何时调用', '按隐私、成本与能力路由'], C.paleYellow, { accent: C.yellow, tag: 'ROUTER' });
  s += card(1900, 465, 760, 235, 'Google Gemini', ['复杂理解与跨文化生成', '多模态 · 双语叙事 · 推理'], C.paleBlue, { accent: C.cyan, tag: 'CLOUD', tagFill: C.cyan });
  s += card(2820, 465, 850, 235, 'RunTrace', ['摊开完整调用链', '模型 · 路由 · 耗时 · 结果'], C.palePurple, { accent: C.purple, tag: 'TRACE', tagFill: C.purple });
  s += arrow(930, 582, 1070, 582);
  s += arrow(1740, 582, 1880, 582);
  s += arrow(2660, 582, 2800, 582);

  s += section(120, 850, 3600, 440, '2 · HARNESS 路由先判意图', C.lime);
  const row2 = [
    [170, 'REQUEST', ['照片 · 文字 · 地点']],
    [850, 'PRIVACY', ['是否含敏感信息']],
    [1530, 'COMPLEXITY', ['轻量选择 / 复杂生成']],
    [2210, 'MODEL ROUTE', ['Gemma → Gemini']],
    [2890, 'BOUNDARY', ['上传确认 · 写入校验']],
  ];
  row2.forEach(([x, title, lines], i) => {
    s += card(x, 990, 610, 210, title, lines, i === 3 ? C.paleYellow : C.white, { titleSize: 39, bodySize: 28 });
    if (i < row2.length - 1) s += arrow(x + 610, 1095, x + 660, 1095, 6);
  });

  s += section(120, 1360, 3600, 430, '3 · RUNTRACE 全链可见', C.purple);
  const trace = [
    ['请求', 'REQUEST'], ['判断', 'ROUTER'], ['端侧 / 云端', 'MODEL'], ['结构化结果', 'RESULT'], ['审核证据', 'EVIDENCE']
  ];
  trace.forEach(([cn, en], i) => {
    const x = 180 + i * 700;
    s += card(x, 1510, 580, 190, cn, [en], i === 2 ? C.paleGreen : C.white, { titleSize: 40, bodySize: 27, accent: i === 2 ? C.green : '' });
    if (i < trace.length - 1) s += arrow(x + 580, 1605, x + 670, 1605, 6);
  });

  s += note(120, 1845, 1120, '路由：', '本地先做轻量任务，复杂任务再升级。');
  s += note(1360, 1845, 1120, '委派：', '每个模型只承担擅长的工作。');
  s += note(2600, 1845, 1120, '可见：', '调用模型与降级原因均可追踪。');
  s += end('MODEL-FIRST · GOOGLE AI FIRST', 'HARNESS ROUTES · RUNTRACE EXPLAINS');
  return s;
}

function slide2() {
  let s = base(2, 'Google AI Edge', 'Gemma 3n E2B IT 真实运行', '模型文件、浏览器运行时、硬件加速与 Agents 页面验证形成第二条 Google 推理路径');

  s += section(120, 330, 3600, 450, '1 · 项目内模型与运行时', C.cyan);
  s += card(170, 465, 780, 235, 'Gemma 3n E2B IT', ['Google 开放模型', '端侧多模态理解与选择'], C.paleGreen, { accent: C.green, tag: 'MODEL', tagFill: C.lime });
  s += card(1110, 465, 700, 235, 'int4 Web · .litertlm', ['模型权重已放入项目', '同源 Range 分段加载'], C.paleYellow, { accent: C.yellow, tag: 'WEIGHT' });
  s += card(1970, 465, 900, 235, 'MediaPipe LLM Inference Web', ['浏览器端模型运行时', '业务层通过 GemmaEdge 隔离'], C.paleBlue, { accent: C.cyan, tag: 'RUNTIME', tagFill: C.cyan, titleSize: 39 });
  s += card(3030, 465, 640, 235, 'WebGPU', ['设备内计算', '不走云端推理 API'], C.palePurple, { accent: C.purple, tag: 'DEVICE', tagFill: C.purple });
  s += arrow(950, 582, 1090, 582);
  s += arrow(1810, 582, 1950, 582);
  s += arrow(2870, 582, 3010, 582);

  s += section(120, 850, 3600, 430, '2 · AGENTS 页真实验证', C.lime);
  const checks = [
    [170, '权重已安装', '项目内模型文件', C.lime],
    [1040, '模型已加载', '真实解析 .litertlm', C.cyan],
    [1910, '生成已验证', 'Agents 页面端侧输出', C.purple],
    [2780, '可复核证据', 'UI · RunTrace · 测试', C.yellow],
  ];
  checks.forEach(([x, title, body, color]) => {
    s += card(x, 995, 790, 200, title, [body], C.white, { titleSize: 40 });
    s += checkIcon(x + 690, 1065, color);
  });

  s += section(120, 1350, 3600, 430, '3 · 隐私与网络边界', C.purple);
  s += card(170, 1495, 760, 200, '无需云端 API 计费', ['端侧任务在设备内完成'], C.paleGreen, { titleSize: 40 });
  s += card(1050, 1495, 760, 200, '无 /api/edge 回传', ['端侧生成不绕回服务端'], C.paleBlue, { titleSize: 40 });
  s += card(1930, 1495, 760, 200, '用户主动加载', ['模型由用户明确启用'], C.paleYellow, { titleSize: 40 });
  s += card(2810, 1495, 860, 200, 'LiteRT-LM JS 可迁移', ['接口隔离，不改变业务层'], C.palePurple, { titleSize: 40 });

  s += note(120, 1845, 1120, '安装：', '项目内存在真实模型权重。');
  s += note(1360, 1845, 1120, '运行：', 'MediaPipe + WebGPU 浏览器推理。');
  s += note(2600, 1845, 1120, '验证：', '已加载并产生端侧生成结果。');
  s += end('INSTALLED · LOADED · GENERATED', 'GOOGLE AI EDGE / GEMMA 3N');
  return s;
}

function slide3() {
  let s = base(3, '隐私感知路由', '本地优先，复杂任务再上云', '高频隐私任务不应先上传；Gemma 先预分类，只有复杂任务才升级到 Gemini');

  s += section(120, 330, 3600, 430, '1 · 输入先过隐私边界', C.cyan);
  s += card(170, 470, 780, 205, '用户任务', ['照片 · 地点 · 个人偏好'], C.white, { tag: 'INPUT', tagFill: C.cyan });
  s += card(1180, 470, 950, 205, '本地隐私判断', ['识别敏感输入，不默认上传原图'], C.paleRed, { accent: C.red, tag: 'LOCAL' });
  s += card(2360, 470, 1310, 205, 'Harness 路由决策', ['隐私 · 复杂度 · 成本 · 能力'], C.paleYellow, { accent: C.yellow, tag: 'DECIDE' });
  s += arrow(950, 572, 1160, 572);
  s += arrow(2130, 572, 2340, 572);

  s += downArrow(1920, 760, 855);
  s += section(120, 860, 3600, 560, '2 · GEMMA 本地完成 / GEMINI 按需升级', C.lime);
  s += card(170, 1010, 1540, 300, 'NO · Gemma 本地预分类', ['分类 · 排序 · 轻量选择', '默认不上传原始隐私数据'], C.paleGreen, { accent: C.green, tag: 'LOCAL ENOUGH', tagFill: C.lime, titleSize: 48 });
  s += card(2130, 1010, 1540, 300, 'YES · Gemini 复杂任务升级', ['跨文化理解 · 多模态生成', '仅上传完成任务所需的内容'], C.paleBlue, { accent: C.cyan, tag: 'CLOUD NEEDED', tagFill: C.cyan, titleSize: 48 });
  s += arrow(1710, 1160, 2110, 1160);
  s += monoTx(1910, 1125, 'ONLY IF COMPLEX', 25, C.green, 800, 'text-anchor="middle"');

  s += section(120, 1490, 3600, 300, '3 · 结果落地与可追踪', C.purple);
  s += card(170, 1608, 950, 120, '结构化结果', ['返回业务层'], C.white, { titleSize: 36, bodySize: 25 });
  s += card(1445, 1608, 950, 120, '用户确认', ['写入前仍由人决定'], C.paleYellow, { titleSize: 36, bodySize: 25 });
  s += card(2720, 1608, 950, 120, 'RunTrace', ['显示 Gemma / Gemini 贡献'], C.palePurple, { titleSize: 36, bodySize: 25 });
  s += arrow(1120, 1668, 1425, 1668);
  s += arrow(2395, 1668, 2700, 1668);

  s += note(120, 1845, 1120, '默认：', '本地完成，不自动上云。');
  s += note(1360, 1845, 1120, '升级：', '仅复杂任务交给 Gemini。');
  s += note(2600, 1845, 1120, '边界：', '上传与写入都需要用户确认。');
  s += end('LOCAL BY DEFAULT · CLOUD BY NECESSITY', 'PRIVACY-AWARE ROUTING');
  return s;
}

function slide4() {
  let s = base(4, '看展搭子', '一张展签生成跨文化导览', '上传前先征得同意；Gemini Flash 补全年代、器类和材质，并一次生成四种内容');

  s += section(120, 330, 3600, 440, '1 · 拍展签 → 授权 → GEMINI FLASH', C.cyan);
  const flow = [
    [170, 760, '拍摄展签', ['照片 + 现场上下文'], C.white, 'CAPTURE', C.cyan],
    [1050, 760, '上传前征得同意', ['不是默认上传动作'], C.paleYellow, 'CONSENT', C.yellow],
    [1930, 760, 'Gemini Flash', ['视觉理解与结构化补全'], C.paleBlue, 'GOOGLE AI', C.cyan],
    [2810, 860, '年代 · 器类 · 材质', ['补全缺失字段并保留来源'], C.paleGreen, 'ENRICH', C.lime],
  ];
  flow.forEach(([x, w, title, lines, fill, tag, tagFill], i) => {
    s += card(x, 475, w, 205, title, lines, fill, { titleSize: 39, tag, tagFill });
    if (i < flow.length - 1) s += arrow(x + w, 577, flow[i + 1][0] - 20, 577, 6);
  });

  s += section(120, 840, 3600, 570, '2 · 一次生成四种结构化内容', C.lime);
  s += card(170, 990, 790, 300, '中文策展手记', ['适合个人回访的中文叙事', '保留年代、器类与材质依据'], C.paleGreen, { accent: C.green, tag: 'ZH', tagFill: C.lime, titleSize: 44 });
  s += card(1070, 990, 790, 300, 'English guide', ['面向国际观众的英文导览', '按语境重写而非逐字翻译'], C.paleBlue, { accent: C.cyan, tag: 'EN', tagFill: C.cyan, titleSize: 44 });
  s += card(1970, 990, 790, 300, '时间线', ['把器物放回历史坐标', '连接人物、朝代与文化流动'], C.palePurple, { accent: C.purple, tag: 'TIME', tagFill: C.purple, titleSize: 44 });
  s += card(2870, 990, 800, 300, 'cultural bridge', ['解释差异，避免刻板印象', '在两种文化之间建立理解'], C.paleYellow, { accent: C.yellow, tag: 'BRIDGE', tagFill: C.yellow, titleSize: 42 });

  s += section(120, 1480, 3600, 300, '3 · 跨文化生成边界', C.purple);
  s += card(170, 1600, 1000, 115, '事实依据', ['年代、器类、材质可追踪'], C.white, { titleSize: 34, bodySize: 24 });
  s += card(1420, 1600, 1000, 115, '避免刻板印象', ['不把文化差异压成标签'], C.paleRed, { titleSize: 34, bodySize: 24 });
  s += card(2670, 1600, 1000, 115, '双语但不机械翻译', ['面向不同文化语境重新组织'], C.paleBlue, { titleSize: 34, bodySize: 24 });

  s += note(120, 1845, 1120, '同意：', '上传图片前必须明确授权。');
  s += note(1360, 1845, 1120, '生成：', 'Gemini Flash 一次输出四种内容。');
  s += note(2600, 1845, 1120, '桥接：', '解释文化差异，避免刻板印象。');
  s += end('CONSENT BEFORE CLOUD · CONTEXT BEFORE GENERATION', 'GEMINI FLASH / MUSEUM COMPANION');
  return s;
}

function slide5() {
  let s = base(5, '文化记忆闭环', '确认后写回，批量照片一键成册', 'AI 先生成建议；用户确认后才钉回博物馆坐标，成为可回访的个人文化记忆');

  s += section(120, 330, 3600, 430, '1 · SUGGEST → USER CONFIRM → PRIVATE EARTH', C.cyan);
  s += card(170, 470, 800, 205, 'AI 生成草稿', ['手记 · guide · 时间线 · bridge'], C.palePurple, { tag: 'SUGGEST', tagFill: C.purple });
  s += card(1150, 470, 700, 205, '用户确认', ['确认内容与写入位置'], C.paleYellow, { tag: 'CONFIRM', tagFill: C.yellow });
  s += card(2030, 470, 700, 205, 'markPlace', ['校验、去重、统一落点'], C.paleGreen, { tag: 'PLACE', tagFill: C.lime });
  s += card(2910, 470, 760, 205, '私人地球', ['钉回博物馆坐标'], C.paleBlue, { tag: 'MEMORY', tagFill: C.cyan });
  s += arrow(970, 572, 1130, 572);
  s += arrow(1850, 572, 2010, 572);
  s += arrow(2730, 572, 2890, 572);

  s += section(120, 840, 3600, 540, '2 · 可回访的个人文化记忆', C.lime);
  s += card(170, 990, 760, 275, '博物馆坐标', ['展览地点与参观时间', '结果钉回真实发生地'], C.white, { accent: C.green, tag: 'LOCATION', tagFill: C.lime });
  s += card(1080, 990, 760, 275, '文化记忆卡', ['照片 · 展签 · 双语手记', '持续补充，不是一次性回答'], C.paleYellow, { accent: C.yellow, tag: 'CARD' });
  s += card(1990, 990, 760, 275, '再次回访', ['按地点与展览重新打开', '可继续提问与追加资料'], C.paleBlue, { accent: C.cyan, tag: 'REVISIT', tagFill: C.cyan });
  s += card(2900, 990, 770, 275, 'RunTrace 证据', ['模型、路由与确认动作', '完整链路可复核'], C.palePurple, { accent: C.purple, tag: 'TRACE', tagFill: C.purple });

  s += section(120, 1450, 3600, 340, '3 · 批量照片一键整理成看展纪录', C.purple);
  s += card(170, 1580, 780, 125, '批量照片', ['同一场展览的多张照片'], C.white, { titleSize: 36, bodySize: 24 });
  s += card(1190, 1580, 780, 125, '自动聚合', ['按时间、地点与展品归组'], C.paleGreen, { titleSize: 36, bodySize: 24 });
  s += card(2210, 1580, 780, 125, '结构化整理', ['手记、时间线与展品索引'], C.paleYellow, { titleSize: 36, bodySize: 24 });
  s += card(3230, 1580, 440, 125, '看展纪录', ['一键生成'], C.paleBlue, { titleSize: 36, bodySize: 24 });
  s += arrow(950, 1643, 1170, 1643);
  s += arrow(1970, 1643, 2190, 1643);
  s += arrow(2990, 1643, 3210, 1643);

  s += note(120, 1845, 1120, '确认：', '没有用户确认就不写回。');
  s += note(1360, 1845, 1120, '坐标：', '结果回到真实博物馆地点。');
  s += note(2600, 1845, 1120, '批量：', '多张照片聚合成完整看展纪录。');
  s += end('SUGGEST · USER CONFIRM · PRIVATE EARTH', 'PERSONAL CULTURAL MEMORY');
  return s;
}

const slides = [
  ['视频插图_01_模型核心与Harness_RunTrace_浅色版_4K', slide1()],
  ['视频插图_02_Gemma3n端侧真实运行_浅色版_4K', slide2()],
  ['视频插图_03_本地优先复杂任务升级Gemini_浅色版_4K', slide3()],
  ['视频插图_04_看展搭子_GeminiFlash跨文化生成_浅色版_4K', slide4()],
  ['视频插图_05_确认后写回文化记忆与批量整理_浅色版_4K', slide5()],
];

fs.mkdirSync(OUT, { recursive: true });

for (const [name, svg] of slides) {
  const svgPath = path.join(OUT, `${name}.svg`);
  const pngPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  console.log(`${name}: ${pngPath}`);
}

const readme = `# Google 技术五幕 · 浅色视频插图\n\n` +
`严格对齐原 A–D 架构图视觉：浅灰网格纸、米白分区、粗黑描边、硬投影、彩色章节标签与绿色流程箭头。\n\n` +
`五张均为 3840×2160 PNG，并保留 SVG 矢量源文件。请优先使用本目录浅色版，不使用旧黑底版。\n`;
fs.writeFileSync(path.join(OUT, 'README_浅色版使用说明.md'), readme, 'utf8');

