import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const W = 2160;
const H = 2880;
const TOTAL = 10;
const OUT = "/Users/zhangcheng/Desktop/pocket earth_google/技术架构图";
const HERO = "/Users/zhangcheng/Desktop/pocket earth_google/PocketEarthGoogle_提交包/05_视频封面/PocketEarth_拼贴封面_AI底图_无文字.png";
let heroData = "";

const C = {
  paper: "#F3F4F2",
  panel: "#FFFCF4",
  white: "#FFFFFF",
  ink: "#111111",
  grey: "#6F7370",
  muted: "#8A8E8B",
  grid: "#D9DDDA",
  green: "#0A8A55",
  cyan: "#18D0E6",
  lime: "#7CF36A",
  purple: "#B58AF2",
  yellow: "#FFBC20",
  blue: "#3C70EA",
  red: "#FF7D6E",
  paleGreen: "#EAF8EF",
  paleBlue: "#EAF7FB",
  palePurple: "#F2ECFC",
  paleYellow: "#FFF8E6",
  paleRed: "#FFF0EC",
  paleGrey: "#EEF3F1",
};

const font = '"SF Pro Display", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif';
const mono = '"SFMono-Regular", "JetBrains Mono", "PingFang SC", monospace';

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tx(x, y, value, size, color = C.ink, weight = 600, extra = "") {
  return '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family=\'' + font
    + '\' font-size="' + size + '" font-weight="' + weight + '" ' + extra + ">" + esc(value) + "</text>";
}

function monoTx(x, y, value, size, color = C.grey, weight = 700, extra = "") {
  return '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family=\'' + mono
    + '\' font-size="' + size + '" font-weight="' + weight + '" letter-spacing="1.5" ' + extra + ">" + esc(value) + "</text>";
}

function textLines(x, y, values, size, color = C.grey, weight = 500, gap = 43, extra = "") {
  return values.map((line, i) => tx(x, y + i * gap, line, size, color, weight, extra)).join("");
}

function defs() {
  return '<defs>'
    + '<pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">'
    + '<path d="M56 0 L0 0 0 56" fill="none" stroke="' + C.grid + '" stroke-width="1.2"/>'
    + "</pattern>"
    + '<filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">'
    + '<feDropShadow dx="9" dy="11" stdDeviation="0" flood-color="#000000" flood-opacity="1"/>'
    + "</filter>"
    + '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
    + '<path d="M0 0 L10 5 L0 10 z" fill="' + C.green + '"/>'
    + "</marker>"
    + "</defs>";
}

function base(index, eyebrow, title, subtitle) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'
    + defs()
    + '<rect width="' + W + '" height="' + H + '" fill="' + C.paper + '"/>'
    + '<rect width="' + W + '" height="' + H + '" fill="url(#grid)"/>'
    + monoTx(86, 100, eyebrow, 27, C.ink, 800)
    + '<line x1="86" y1="132" x2="2074" y2="132" stroke="' + C.ink + '" stroke-width="4"/>'
    + '<g filter="url(#shadow)"><rect x="1754" y="54" width="320" height="84" fill="' + C.white + '" stroke="' + C.ink + '" stroke-width="3.5"/></g>'
    + monoTx(1914, 108, "TECHNICAL · " + String(index).padStart(2, "0") + "/" + TOTAL, 24, C.ink, 800, 'text-anchor="middle"')
    + tx(86, 246, title, 72, C.ink, 800)
    + tx(86, 306, subtitle, 31, C.grey, 500);
}

function footer(left, right) {
  return '<line x1="86" y1="2742" x2="2074" y2="2742" stroke="' + C.grey + '" stroke-width="2" stroke-dasharray="7 7"/>'
    + tx(96, 2802, "■ " + left, 25, C.green, 750)
    + tx(2064, 2802, right, 25, C.grey, 500, 'text-anchor="end"')
    + "</svg>";
}

function section(x, y, w, h, label, accent, fill = C.panel) {
  const labelW = Math.min(w - 64, Math.max(360, label.length * 32 + 88));
  return '<g filter="url(#shadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h
    + '" fill="' + fill + '" stroke="' + C.ink + '" stroke-width="4"/></g>'
    + '<rect x="' + (x + 32) + '" y="' + (y + 28) + '" width="' + labelW + '" height="58" fill="' + accent
    + '" stroke="' + C.ink + '" stroke-width="3.5"/>'
    + monoTx(x + 54, y + 68, label, 25, C.ink, 800);
}

function card(x, y, w, h, title, lines = [], fill = C.white, options = {}) {
  const titleSize = options.titleSize || 38;
  const bodySize = options.bodySize || 25;
  const accent = options.accent || "";
  const tag = options.tag || "";
  const tagFill = options.tagFill || C.yellow;
  const bodyGap = options.bodyGap || 40;
  let out = '<g filter="url(#shadow)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h
    + '" fill="' + fill + '" stroke="' + C.ink + '" stroke-width="3.2"/></g>';
  if (accent) out += '<rect x="' + x + '" y="' + y + '" width="9" height="' + h + '" fill="' + accent + '"/>';
  out += tx(x + 28, y + 55, title, titleSize, C.ink, 760);
  out += textLines(x + 28, y + 99, lines, bodySize, C.grey, 500, bodyGap);
  if (tag) {
    const tagW = Math.max(116, tag.length * 19 + 38);
    out += '<rect x="' + (x + w - tagW - 18) + '" y="' + (y + 18) + '" width="' + tagW + '" height="42" fill="' + tagFill
      + '" stroke="' + C.ink + '" stroke-width="2.5"/>';
    out += monoTx(x + w - tagW / 2 - 18, y + 47, tag, 19, C.ink, 800, 'text-anchor="middle"');
  }
  return out;
}

function smallCard(x, y, w, h, title, line, fill = C.white, accent = "") {
  return card(x, y, w, h, title, [line], fill, { titleSize: 31, bodySize: 21, bodyGap: 34, accent });
}

function arrow(x1, y1, x2, y2, width = 6) {
  return '<path d="M' + x1 + " " + y1 + " L" + x2 + " " + y2 + '" fill="none" stroke="' + C.green
    + '" stroke-width="' + width + '" marker-end="url(#arrow)"/>';
}

function pathArrow(d, width = 6) {
  return '<path d="' + d + '" fill="none" stroke="' + C.green + '" stroke-width="' + width + '" marker-end="url(#arrow)"/>';
}

function rubricBar(x, y, width, percent, title, proof, fill) {
  const filled = Math.round(width * percent / 25);
  return tx(x, y, title, 30, C.ink, 760)
    + tx(x + width, y, percent + "%", 30, C.ink, 800, 'text-anchor="end"')
    + '<rect x="' + x + '" y="' + (y + 24) + '" width="' + width + '" height="32" fill="' + C.white + '" stroke="' + C.ink + '" stroke-width="3"/>'
    + '<rect x="' + x + '" y="' + (y + 24) + '" width="' + filled + '" height="32" fill="' + fill + '"/>'
    + tx(x, y + 96, proof, 23, C.grey, 500);
}

function coverHero() {
  return '<g filter="url(#shadow)"><rect x="108" y="446" width="1944" height="1104" fill="' + C.white
    + '" stroke="' + C.ink + '" stroke-width="4"/></g>'
    + '<image x="120" y="458" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,' + heroData + '"/>'
    + '<rect x="120" y="458" width="1920" height="1080" fill="none" stroke="' + C.ink + '" stroke-width="4"/>';
}

function slide1() {
  let s = base(1, "POCKET EARTH · GOOGLE AI EDITION", "基于空间的个人知识库", "把世界，钉回它该在的地方。");
  s += coverHero();
  s += section(86, 1620, 1988, 770, "PRODUCT POSITIONING · 核心定位", C.cyan);
  s += tx(126, 1760, "不是又一个聊天框。", 58, C.ink, 800);
  s += tx(126, 1828, "而是一颗能被持续写入、确认与回访的私人地球。", 40, C.grey, 550);
  s += card(126, 1900, 588, 300, "空间是索引", ["书、影、乐、照片、行程、心情", "按“发生在哪里”重新相遇"], C.paleGreen, { accent: C.green, tag: "WHERE", tagFill: C.lime });
  s += card(786, 1900, 588, 300, "Google AI 是核心", ["Gemma 管本地选择", "Gemini 管复杂理解与生成"], C.paleBlue, { accent: C.cyan, tag: "GOOGLE AI", tagFill: C.cyan });
  s += card(1446, 1900, 588, 300, "人决定落地", ["Harness 路由 · Boundary 校验", "RunTrace 展开 · 确认后钉回"], C.palePurple, { accent: C.purple, tag: "TRUST", tagFill: C.purple });
  s += card(126, 2250, 1908, 140, "YOUR WORLD · YOUR MEMORY", ["空间知识库 × 个人文化智能体 × 隐私优先推理"], C.white, { titleSize: 28, bodySize: 22, tag: "PRODUCT STORY", tagFill: C.yellow });
  s += footer("ONE EARTH · MANY MEMORIES", "LOCAL GEMMA · CLOUD GEMINI");
  return s;
}

function slide2() {
  let s = base(2, "USER PROBLEM · PRODUCT VALUE", "记忆不该困在 App 里", "Pocket Earth 把碎片收敛成同一种空间对象，让人按地点重新找到自己。");
  s += section(86, 380, 1988, 560, "1 · 为什么记忆会失去上下文", C.cyan);
  s += card(126, 510, 440, 310, "数据散落", ["相册、笔记、票据、平台收藏", "彼此不知道对方存在"], C.white, { accent: C.cyan, tag: "SILO", tagFill: C.cyan });
  s += card(610, 510, 440, 310, "时间不是答案", ["“去年看过什么”容易搜", "“那座城改变了什么”很难找"], C.paleYellow, { accent: C.yellow, tag: "SEARCH" });
  s += card(1094, 510, 440, 310, "语境被翻译丢失", ["直译能传字面", "却常丢掉文化背景与情绪"], C.palePurple, { accent: C.purple, tag: "CONTEXT", tagFill: C.purple, titleSize: 32 });
  s += card(1578, 510, 456, 310, "隐私换便利", ["原图、定位与证件信息", "不应为一次整理先上云"], C.paleRed, { accent: C.red, tag: "PRIVACY", tagFill: C.red });
  s += pathArrow("M1080 940 L1080 1030", 8);
  s += section(86, 1040, 1988, 850, "2 · 一颗地球成为统一索引", C.lime);
  s += '<circle cx="1080" cy="1452" r="222" fill="' + C.paleGreen + '" stroke="' + C.ink + '" stroke-width="5"/>'
    + '<ellipse cx="1080" cy="1452" rx="222" ry="90" fill="none" stroke="' + C.green + '" stroke-width="3"/>'
    + '<path d="M858 1452 C950 1360 1210 1360 1302 1452 C1210 1544 950 1544 858 1452" fill="none" stroke="' + C.green + '" stroke-width="3"/>'
    + '<path d="M1080 1230 C1000 1320 1000 1584 1080 1674 C1160 1584 1160 1320 1080 1230" fill="none" stroke="' + C.green + '" stroke-width="3"/>'
    + monoTx(1080, 1438, "POCKET", 25, C.ink, 800, 'text-anchor="middle"')
    + monoTx(1080, 1482, "EARTH", 34, C.green, 900, 'text-anchor="middle"');
  const nodes = [
    [230, 1220, "书", "故事地 / 作者地", C.purple],
    [230, 1570, "电影", "取景地 / 团剧", C.yellow],
    [650, 1760, "音乐", "歌手城市 / 歌中城市", C.lime],
    [1510, 1760, "照片", "经纬度 / 高价值影像", C.cyan],
    [1490, 1220, "行程", "停留点 / 私人足迹", C.red],
    [1490, 1570, "看展", "博物馆 / 展览 / 展品", C.purple],
  ];
  nodes.forEach((n) => {
    s += smallCard(n[0], n[1], 440, 150, n[2], n[3], C.white, n[4]);
    const cx = n[0] < 1000 ? n[0] + 440 : n[0];
    const cy = n[1] + 75;
    const gx = n[0] < 1000 ? 858 : 1302;
    s += arrow(cx, cy, gx, 1452, 4);
  });
  s += section(86, 1970, 1988, 610, "3 · 出海用户与价值路径", C.purple);
  s += smallCard(126, 2100, 440, 170, "文化旅行者", "把看过的城市与展览带回家", C.paleGreen, C.green);
  s += smallCard(610, 2100, 440, 170, "留学生 / 海外生活者", "在多语言环境保存个人文化坐标", C.paleBlue, C.cyan);
  s += smallCard(1094, 2100, 440, 170, "跨文化家庭", "用双语和语境解释共享一段记忆", C.palePurple, C.purple);
  s += smallCard(1578, 2100, 456, 170, "低网络 / 隐私敏感场景", "高频选择本地完成，复杂任务再上云", C.paleYellow, C.yellow);
  s += card(126, 2320, 1908, 200, "影响路径", ["碎片 → 结构化对象 → 真实坐标 → 可回访记忆 → 更有同理心的文化理解"], C.white, { titleSize: 34, bodySize: 26, tag: "TECH FOR GOOD", tagFill: C.lime });
  s += footer("PLACE IS THE INDEX", "MEMORY BECOMES REVISITABLE");
  return s;
}

function slide3() {
  let s = base(3, "COMPLETION · LIVE DEMO", "3–5 分钟，走完一条真实闭环", "核心功能可运行；审核人员能看见输入、模型路由、结构化结果、用户确认与地图落点。");
  s += section(86, 380, 1988, 500, "1 · 现场从三个真实入口开始", C.cyan);
  s += card(126, 520, 588, 240, "MY MAP", ["浏览私人地球", "按地点与类别回访记忆"], C.paleGreen, { tag: "MAP", tagFill: C.lime });
  s += card(786, 520, 588, 240, "PHOTOS", ["批量整理相册", "本地筛选、去重与落点"], C.paleBlue, { tag: "BATCH", tagFill: C.cyan });
  s += card(1446, 520, 588, 240, "AGENTS", ["启动看展、读书、电影等领域 Agent", "展开端侧 Gemma 控制台"], C.palePurple, { tag: "AGENTS", tagFill: C.purple, titleSize: 36 });
  s += section(86, 950, 1988, 1010, "2 · 一次运行的四个可见动作", C.lime);
  const steps = [
    [126, 1090, "01", "输入", ["一句话 / 展签 / 照片 / 地点", "不要求用户写复杂 Prompt"], C.cyan, C.paleBlue],
    [1110, 1090, "02", "推理", ["Gemma 本地先挑", "复杂任务交给 Gemini"], C.lime, C.paleGreen],
    [126, 1470, "03", "草稿", ["结构化字段 + 解释 + 来源", "RunTrace 展开每一步"], C.purple, C.palePurple],
    [1110, 1470, "04", "确认后钉回", ["Boundary 校验与去重", "结果进入真实坐标，可撤销"], C.yellow, C.paleYellow],
  ];
  steps.forEach((v) => {
    s += card(v[0], v[1], 924, 300, v[2] + " · " + v[3], v[4], v[6], { accent: v[5], tag: v[2], tagFill: v[5], titleSize: 44, bodySize: 28, bodyGap: 44 });
  });
  s += arrow(1050, 1240, 1090, 1240, 6);
  s += pathArrow("M1570 1390 C1570 1440 590 1420 590 1460", 6);
  s += arrow(1050, 1620, 1090, 1620, 6);
  s += section(86, 2040, 1988, 520, "3 · 本次构建证据，不是概念 Demo", C.purple);
  s += card(126, 2180, 440, 230, "52 / 52", ["测试文件通过", "vitest run"], C.paleGreen, { titleSize: 48, tag: "PASS", tagFill: C.lime });
  s += card(610, 2180, 440, 230, "1336 / 1336", ["测试项通过", "当前工作区实跑"], C.paleBlue, { titleSize: 48, tag: "PASS", tagFill: C.cyan });
  s += card(1094, 2180, 440, 230, "TYPECHECK", ["tsc --noEmit", "类型检查通过"], C.palePurple, { titleSize: 39, tag: "PASS", tagFill: C.purple });
  s += card(1578, 2180, 456, 230, "BUILD", ["Vite production", "2246 modules transformed"], C.paleYellow, { titleSize: 42, tag: "PASS", tagFill: C.yellow });
  s += footer("RUNNABLE · TRACEABLE · REVERSIBLE", "3–5 MINUTES TO THE CORE VALUE");
  return s;
}

function slide4() {
  let s = base(4, "GOOGLE AI · DEEP INTEGRATION", "两条 Google 推理平面，各司其职", "Gemma 负责隐私与低成本本地任务；Gemini 负责复杂、多模态与跨文化生成。");
  s += section(86, 380, 1988, 680, "1 · GOOGLE AI EDGE · 设备内", C.cyan, C.paleGreen);
  s += card(126, 520, 460, 330, "Gemma 3n E2B IT", ["端侧多模态开放模型", "分类 · 排序 · 对话 · 看图"], C.white, { accent: C.green, tag: "MODEL", tagFill: C.lime, titleSize: 31 });
  s += card(626, 520, 460, 330, "int4 Web", [".litertlm 模型包", "项目内 3.04 GB 权重"], C.paleYellow, { accent: C.yellow, tag: "WEIGHT" });
  s += card(1126, 520, 460, 330, "MediaPipe GenAI", ["LlmInference Web 运行时", "业务层由 GemmaEdge 隔离"], C.paleBlue, { accent: C.cyan, tag: "RUNTIME", tagFill: C.cyan, titleSize: 27 });
  s += card(1626, 520, 408, 330, "WebGPU", ["GPU delegate", "不经过云推理 API"], C.palePurple, { accent: C.purple, tag: "DEVICE", tagFill: C.purple });
  s += arrow(586, 685, 606, 685, 5);
  s += arrow(1086, 685, 1106, 685, 5);
  s += arrow(1586, 685, 1606, 685, 5);
  s += card(126, 900, 1908, 130, "为什么用 Gemma", ["高频、隐私敏感、网络不稳定或无需复杂生成的任务，留在设备完成。"], C.white, { titleSize: 30, bodySize: 23, tag: "LOCAL FIRST", tagFill: C.lime });
  s += section(86, 1140, 1988, 820, "2 · GOOGLE GEMINI API · 云端", C.lime, C.paleBlue);
  s += card(126, 1280, 588, 300, "Gemini 3.1 Flash-Lite", ["轻量意图识别与路由", "低延迟 · 高并发 · 低成本"], C.white, { accent: C.lime, tag: "ROUTE", tagFill: C.lime, titleSize: 34 });
  s += card(786, 1280, 588, 300, "Gemini 3.5 Flash", ["多模态理解与结构化补全", "双语叙事 · cultural bridge"], C.white, { accent: C.cyan, tag: "CORE", tagFill: C.cyan, titleSize: 36 });
  s += card(1446, 1280, 588, 300, "Gemini 3.1 Pro Preview", ["圆桌、辩论、法庭式合议", "复杂推理任务专用"], C.white, { accent: C.purple, tag: "COUNCIL", tagFill: C.purple, titleSize: 32 });
  s += card(126, 1640, 1908, 230, "为什么用 Gemini", ["需要跨语言语境、多模态理解、结构化输出与复杂合议时升级到云端；", "每个任务由 taskModels 选择相匹配的 Gemini 档位。"], C.paleYellow, { titleSize: 35, bodySize: 25, bodyGap: 39, tag: "TASK ROUTING", tagFill: C.yellow });
  s += section(86, 2040, 1988, 520, "3 · 官方直连优先，网关只是备用传输", C.purple);
  s += card(126, 2180, 520, 230, "Google Gemini API", ["GEMINI_API_KEY 存在时优先", "modelOwner: Google"], C.paleBlue, { accent: C.cyan, tag: "PRIMARY", tagFill: C.cyan, titleSize: 30 });
  s += card(820, 2180, 520, 230, "GMI transport", ["仅官方 Key 缺失时备用", "只放行 google/gemini-*"], C.paleGrey, { accent: C.grey, tag: "FALLBACK", tagFill: C.paleGrey });
  s += card(1514, 2180, 520, 230, "三重模型白名单", ["启动配置 · provider adapter · test", "拒绝非 Google 云模型"], C.paleGreen, { accent: C.green, tag: "GUARD", tagFill: C.lime });
  s += arrow(646, 2295, 800, 2295, 5);
  s += arrow(1340, 2295, 1494, 2295, 5);
  s += footer("GOOGLE MODELS OWN THE CAPABILITY", "GMI = OPTIONAL TRANSPORT ONLY");
  return s;
}

function slide5() {
  let s = base(5, "GOOGLE AI EDGE · VERIFIABLE", "Gemma 3n 真正进入了产品链路", "权重、加载路由、浏览器运行时、Agents 控制台与业务契约均在当前项目内。");
  s += section(86, 380, 1988, 570, "1 · 已安装的官方 Web 权重", C.cyan);
  s += card(126, 520, 760, 300, "3,038,117,888 bytes", ["gemma-3n-E2B-it-int4-Web.litertlm", "项目独立目录 .local-models/"], C.paleGreen, { accent: C.green, tag: "INSTALLED", tagFill: C.lime, titleSize: 44, bodySize: 24 });
  s += card(930, 520, 520, 300, "同源 Range 加载", ["Vite 与 server.mjs 均实现", "206 Partial Content · 不整包入内存"], C.paleYellow, { accent: C.yellow, tag: "RANGE", titleSize: 34 });
  s += card(1494, 520, 540, 300, "不进 dist / bundle", ["模型部署在本项目服务旁", "不会影响其他 Pocket Earth 项目"], C.paleBlue, { accent: C.cyan, tag: "ISOLATED", tagFill: C.cyan, titleSize: 34 });
  s += section(86, 1030, 1988, 780, "2 · Agents 页可现场复核的真实加载链", C.lime);
  const chain = [
    [126, "点击加载", ["加载已安装 Gemma 3n"], C.paleYellow, C.yellow],
    [600, "检查设备", ["WebGPU adapter"], C.paleBlue, C.cyan],
    [1074, "创建运行时", ["MediaPipe LlmInference", "delegate: GPU"], C.palePurple, C.purple],
    [1548, "端侧试一句", ["generateResponse", "耗时与输出可见"], C.paleGreen, C.green],
  ];
  chain.forEach((v, i) => {
    s += card(v[0], 1170, 410, 300, v[1], v[2], v[3], { accent: v[4], tag: String(i + 1).padStart(2, "0"), tagFill: v[4], titleSize: 35, bodySize: 23 });
    if (i < chain.length - 1) s += arrow(v[0] + 410, 1320, chain[i + 1][0] - 20, 1320, 5);
  });
  s += card(126, 1520, 1908, 220, "一个 GemmaEdge 契约，四种端侧能力", ["classify · rank · chat · vision", "业务层不绑定运行时细节；异常返回安全空值，再由确定性规则接管。"], C.white, { titleSize: 36, bodySize: 25, bodyGap: 40, tag: "EDGE CONTRACT", tagFill: C.lime });
  s += section(86, 1890, 1988, 670, "3 · 隐私与失败边界写在代码里", C.purple);
  s += card(126, 2030, 588, 330, "NO CLOUD API", ["端侧推理不走 /api/edge", "输入与模型权重留在设备", "卸载时释放运行时"], C.paleGreen, { accent: C.green, tag: "LOCAL", tagFill: C.lime, titleSize: 38 });
  s += card(786, 2030, 588, 330, "FAIL SAFE", ["没有 WebGPU / 模型未就绪", "返回空值并记录 health", "不把隐私输入静默升级上云"], C.paleYellow, { accent: C.yellow, tag: "FALLBACK" });
  s += card(1446, 2030, 588, 330, "CODE EVIDENCE", ["gemmaEdge.ts · contract.ts", "OnDeviceBrainPanel.tsx", "gemmaEdge.test.ts"], C.paleBlue, { accent: C.cyan, tag: "AUDIT", tagFill: C.cyan });
  s += footer("INSTALLED · LOADABLE · AUDITABLE", "LOCAL BY DEFAULT");
  return s;
}

function slide6() {
  let s = base(6, "CROSS-CULTURAL EXPERIENCE", "把一张展签变成可回访的文化记忆", "本地读图优先；只有用户同意，Gemini 才参与结构化补全与跨文化生成。");
  s += section(86, 380, 1988, 660, "1 · 拍摄之后，先过隐私与授权边界", C.cyan);
  s += card(126, 520, 440, 300, "拍一张展签", ["公开说明牌 + 现场上下文", "默认不上传"], C.white, { accent: C.cyan, tag: "CAPTURE", tagFill: C.cyan });
  s += card(610, 520, 440, 300, "Gemma 端侧读图", ["visionRead → 确定性脱敏", "失败则进入手填兜底"], C.paleGreen, { accent: C.green, tag: "LOCAL", tagFill: C.lime, titleSize: 29 });
  s += card(1094, 520, 440, 300, "用途绑定同意", ["只允许 public-exhibit-label", "确认时间与用途均需有效"], C.paleYellow, { accent: C.yellow, tag: "CONSENT", titleSize: 29 });
  s += card(1578, 520, 456, 300, "Gemini 3.5 Flash", ["端侧读不出且用户同意才上云", "结构化补全年代、器类、材质"], C.paleBlue, { accent: C.cyan, tag: "CLOUD", tagFill: C.cyan, titleSize: 33 });
  s += arrow(566, 670, 590, 670, 5);
  s += arrow(1050, 670, 1074, 670, 5);
  s += arrow(1534, 670, 1558, 670, 5);
  s += card(126, 860, 1908, 120, "隐私规则", ["端侧失败不等于默认上传；云视觉必须由显式 consent 解锁。"], C.paleRed, { titleSize: 31, bodySize: 23, tag: "PRIVACY BOUNDARY", tagFill: C.red });
  s += section(86, 1120, 1988, 780, "2 · Gemini 一次生成四种面向不同语境的内容", C.lime);
  s += card(126, 1260, 440, 430, "中文策展手记", ["面向个人回访", "解释为什么值得看", "不是百科条目复制"], C.paleGreen, { accent: C.green, tag: "ZH", tagFill: C.lime, titleSize: 34 });
  s += card(610, 1260, 440, 430, "English guide", ["忠于已给事实", "按英文导览语境重写", "不是逐字机器翻译"], C.paleBlue, { accent: C.cyan, tag: "EN", tagFill: C.cyan, titleSize: 34 });
  s += card(1094, 1260, 440, 430, "时间线", ["把器物放回时代与地点", "连接材料、文明与流动", "保留可核验事实边界"], C.palePurple, { accent: C.purple, tag: "TIME", tagFill: C.purple });
  s += card(1578, 1260, 456, 430, "cultural bridge", ["解释共同主题或语境差异", "禁止国族性格推断", "主动避免文化刻板印象"], C.paleYellow, { accent: C.yellow, tag: "EMPATHY", tagFill: C.yellow, titleSize: 31 });
  s += card(126, 1740, 1908, 120, "同一次结构化输出", ["curatorNote · curatorNoteEn · timelineNote · culturalBridgeNote"], C.white, { titleSize: 29, bodySize: 22, tag: "GEMINI NARRATIVE", tagFill: C.cyan });
  s += section(86, 1980, 1988, 580, "3 · 建议不等于落地，确认后才进入私人地球", C.purple);
  s += smallCard(126, 2120, 400, 210, "AI 草稿", "四种内容与来源可见", C.palePurple, C.purple);
  s += smallCard(626, 2120, 400, 210, "用户确认", "内容、位置与写入由人决定", C.paleYellow, C.yellow);
  s += smallCard(1126, 2120, 400, 210, "博物馆坐标", "markPlace 校验、去重后落点", C.paleGreen, C.green);
  s += smallCard(1626, 2120, 408, 210, "批量看展纪录", "同场照片按时间地点聚合", C.paleBlue, C.cyan);
  s += arrow(526, 2225, 606, 2225, 5);
  s += arrow(1026, 2225, 1106, 2225, 5);
  s += arrow(1526, 2225, 1606, 2225, 5);
  s += card(126, 2380, 1908, 120, "跨文化同理心落在交互里", ["先征得同意、再按语境生成、避免刻板印象、最后由用户确认。"], C.white, { titleSize: 31, bodySize: 23, tag: "10% RUBRIC", tagFill: C.purple });
  s += footer("CONSENT BEFORE CLOUD", "CONTEXT BEFORE TRANSLATION");
  return s;
}

function slide7() {
  let s = base(7, "INNOVATION · AGENT HARNESS", "上面是路由，下面是委派；最后回到地球", "模型不直接写入世界：Harness 决定调用，Boundary 校验动作，RunTrace 解释全过程。");
  s += section(86, 380, 1988, 430, "1 · 用户入口", C.cyan);
  s += smallCard(126, 520, 440, 160, "MY MAP", "地球主图与侧边主控", C.white, C.cyan);
  s += smallCard(610, 520, 440, 160, "CHAT / JOT", "自然语言与截图入口", C.white, C.cyan);
  s += smallCard(1094, 520, 440, 160, "PHOTOS", "批量照片与相册整理", C.white, C.cyan);
  s += smallCard(1578, 520, 456, 160, "AGENTS", "领域智能体控制台", C.white, C.cyan);
  s += pathArrow("M1080 810 L1080 900", 8);
  s += section(86, 910, 1988, 650, "2 · HARNESS 内核 · 规则 → GEMMA → GEMINI", C.lime);
  const core = [
    [126, "SHELL", "人格与语言规则"],
    [440, "MEMORY", "会话记忆 + 结构化画像"],
    [754, "ROUTER", "隐私 / 复杂度 / 成本"],
    [1068, "BRAIN", "Gemma 本地 / Gemini 云端"],
    [1382, "BOUNDARY", "动作白名单 + 上传许可"],
    [1696, "TRACE", "RunTrace 事件树"],
  ];
  core.forEach((v, i) => {
    s += card(v[0], 1050, 290, 300, v[1], [v[2]], i === 2 || i === 3 ? C.paleYellow : C.white, { titleSize: 29, bodySize: 20, accent: i === 2 ? C.yellow : (i === 3 ? C.cyan : "") });
    if (i < core.length - 1) s += arrow(v[0] + 290, 1200, core[i + 1][0] - 20, 1200, 4);
  });
  s += card(126, 1400, 1908, 120, "路由原则", ["明确指令规则秒回；隐私任务 Gemma 先挑；长尾复杂任务才升级 Gemini。"], C.paleGreen, { titleSize: 28, bodySize: 22, tag: "MODEL ROUTE", tagFill: C.lime });
  s += pathArrow("M1080 1560 L1080 1650", 8);
  s += section(86, 1660, 1988, 430, "3 · 领域 Agent 委派", C.purple);
  const domains = [
    [126, "看展", "展签 → 展馆坐标"],
    [444, "读书", "故事地 / 作者地"],
    [762, "电影", "取景地 / 团剧"],
    [1080, "音乐", "歌手城市 / 歌中城市"],
    [1398, "照片", "筛选 / 去重 / 落点"],
    [1716, "行程", "停留点 / 私人足迹"],
  ];
  domains.forEach((v) => s += card(v[0], 1795, 280, 190, v[1], [v[2]], C.white, { titleSize: 28, bodySize: 19 }));
  s += pathArrow("M1080 2090 L1080 2180", 8);
  s += section(86, 2190, 1988, 370, "4 · 统一动作收口 · 记忆闭环", C.yellow);
  s += smallCard(126, 2325, 500, 150, "suggest-then-confirm", "AI 只建议，不自动写入", C.paleYellow, C.yellow);
  s += smallCard(830, 2325, 500, 150, "markPlace", "坐标校验 · 去重 · 同域抖散", C.paleGreen, C.green);
  s += smallCard(1534, 2325, 500, 150, "PRIVATE EARTH", "写入 userMarks · 下次可回访", C.paleBlue, C.cyan);
  s += arrow(626, 2400, 810, 2400, 5);
  s += arrow(1330, 2400, 1514, 2400, 5);
  s += card(126, 2490, 1908, 70, "长期画像只保存结构化偏好标签计数，不保存原始对话与隐私原文。", [], C.white, { titleSize: 22, tag: "MEMORY BOUNDARY", tagFill: C.purple });
  s += footer("ROUTE · DELEGATE · VALIDATE · PIN", "RUNTRACE MAKES IT VISIBLE");
  return s;
}

function slide8() {
  let s = base(8, "PRIVATE EARTH × PUBLIC EARTH", "私人记忆与公共知识，物理分轨", "私人地球只服务个人回访；公共地球只接收有来源、可质疑、经人工发布的公共知识。");
  s += section(86, 380, 1988, 650, "1 · 两颗地球，共用空间索引，不共用数据边界", C.cyan);
  s += card(126, 520, 884, 350, "PRIVATE EARTH · 私人地球", ["书、影、乐、照片、旅行、展览与 Jot", "浏览器本地保存 · 用户修改 · Confirm Gate", "不把私人原文、原图与精确坐标送入公共层"], C.paleGreen, { accent: C.green, tag: "PRIVATE", tagFill: C.lime, titleSize: 38, bodySize: 25, bodyGap: 43 });
  s += card(1050, 520, 984, 350, "PUBLIC EARTH · 公共地球", ["8 个领域 Signal Agent 发现候选主张", "来源审查 · 双角色模型核验 · Truth Score", "只有人工发布的版本才进入公共知识地图"], C.paleBlue, { accent: C.cyan, tag: "PUBLIC", tagFill: C.cyan, titleSize: 38, bodySize: 25, bodyGap: 43 });
  s += card(126, 900, 1908, 90, "默认行为：进入 EARTH 先回私人地球；进入 AGENTS 先显示 MY AGENTS。", [], C.white, { titleSize: 24, tag: "SAFE DEFAULT", tagFill: C.yellow });
  s += section(86, 1110, 1988, 800, "2 · FACTRELAY · 六步事实核验，不让模型自权威", C.lime);
  const relay = [
    [126, "01 · CLAIM", "把新闻整理成可验证主张", C.cyan],
    [440, "02 · SOURCE", "保留 URL、日期与发布方", C.lime],
    [754, "03 · INVESTIGATE", "Gemini 说明证据支持什么", C.purple],
    [1068, "04 · SKEPTIC", "独立检查断章与来源洗白", C.yellow],
    [1382, "05 · SCORE", "确定性公式计算 Truth Score", C.red],
    [1696, "06 · RECEIPT", "来源哈希与本地 Merkle 版本", C.cyan],
  ];
  relay.forEach((v, i) => {
    s += card(v[0], 1250, 290, 300, v[1], [v[2]], C.white, { titleSize: 24, bodySize: 19, accent: v[3] });
    if (i < relay.length - 1) s += arrow(v[0] + 290, 1400, relay[i + 1][0] - 20, 1400, 4);
  });
  s += card(126, 1600, 1908, 230, "发布边界", ["Investigator 与 Skeptic 不能引用自己的输出作为新来源；", "模型不能自动批准，automaticPublication = false，人工发布闸负责最终责任。"], C.paleYellow, { titleSize: 34, bodySize: 24, bodyGap: 40, tag: "HUMAN GATE", tagFill: C.yellow });
  s += section(86, 2000, 1988, 560, "3 · 同一批已核验公共知识，进入三个可审查出口", C.purple);
  s += card(126, 2140, 520, 260, "知识地图", ["按地点查看公共主张", "打开来源、verdict 与版本"], C.paleGreen, { accent: C.green, tag: "MAP", tagFill: C.lime });
  s += card(820, 2140, 520, 260, "DAILY KNOWLEDGE", ["8 领域候选信号与每日版次", "七日缓存 · 可下载核验包"], C.paleBlue, { accent: C.cyan, tag: "EDITION", tagFill: C.cyan, titleSize: 30 });
  s += card(1514, 2140, 520, 260, "POCKET PODCAST", ["只读同批已核验知识", "文字简报与播客模式共用证据"], C.palePurple, { accent: C.purple, tag: "AUDIO", tagFill: C.purple, titleSize: 31 });
  s += arrow(646, 2270, 800, 2270, 5);
  s += arrow(1340, 2270, 1494, 2270, 5);
  s += card(126, 2450, 1908, 90, "当前诚实状态：8 个领域接口已实现；实时数据取决于 provider / snapshot，不把无数据伪装成已发布版次。", [], C.white, { titleSize: 22, tag: "RUNTIME TRUTH", tagFill: C.red });
  s += footer("PRIVATE MEMORY ≠ PUBLIC FACT", "SOURCE · SKEPTIC · HUMAN GATE");
  return s;
}

function slide9() {
  let s = base(9, "FROST EDGE · PHYSICAL AI", "同一个 Frost，从浏览器走进现实空间", "硬件是公共、低风险、可缓存能力的实体出口；私人记忆与云密钥不进入树莓派。");
  s += section(86, 380, 1988, 610, "1 · Google AI 上游核验，Frost Feed 白名单下发", C.cyan);
  s += card(126, 520, 520, 300, "PUBLIC KNOWLEDGE", ["公开来源 → Gemini 双角色核验", "确定性评分 → 人工发布"], C.paleBlue, { accent: C.cyan, tag: "UPSTREAM", tagFill: C.cyan, titleSize: 31 });
  s += card(820, 520, 520, 300, "FROST FEED", ["认证 · cursor · JSONL", "只同步白名单公共事件"], C.paleYellow, { accent: C.yellow, tag: "BRIDGE", tagFill: C.yellow, titleSize: 36 });
  s += card(1514, 520, 520, 300, "RASPBERRY PI", ["断网读取上一有效缓存", "不保存私人原文与云端密钥"], C.paleGreen, { accent: C.green, tag: "EDGE", tagFill: C.lime, titleSize: 36 });
  s += arrow(646, 670, 800, 670, 5);
  s += arrow(1340, 670, 1494, 670, 5);
  s += card(126, 860, 1908, 90, "Google 技术的职责是生成与核验公共知识；硬件负责安全呈现，不把整套树莓派运行时包装成 Google 模型。", [], C.white, { titleSize: 22, tag: "HONEST BOUNDARY", tagFill: C.lime });
  s += section(86, 1070, 1988, 750, "2 · 三个实体体验，共用一条事件与隐私边界", C.lime);
  s += card(126, 1220, 588, 390, "日落电台", ["按地点与日落时刻组织内容", "公共音乐与缓存优先", "断网仍能保持基础体验"], C.paleYellow, { accent: C.yellow, tag: "SUNSET RADIO", tagFill: C.yellow, titleSize: 45, bodySize: 25, bodyGap: 43 });
  s += card(786, 1220, 588, 390, "口袋播客", ["读取同批已核验公共知识", "播客模式 / 文字模式", "内容不足时不为数量放宽门槛"], C.palePurple, { accent: C.purple, tag: "PODCAST", tagFill: C.purple, titleSize: 45, bodySize: 25, bodyGap: 43 });
  s += card(1446, 1220, 588, 390, "地球答案", ["地点与公共知识的实体问答", "优先本地目录与缓存", "失败时回到安全可解释状态"], C.paleGreen, { accent: C.green, tag: "EARTH ANSWER", tagFill: C.lime, titleSize: 45, bodySize: 25, bodyGap: 43 });
  s += card(126, 1660, 1908, 100, "统一 Frost 人格：软件 Agent、公开身份卡与实体设备共用视觉和行为边界，但不共享私人数据。", [], C.white, { titleSize: 24, tag: "ONE CHARACTER", tagFill: C.cyan });
  s += section(86, 1900, 1988, 660, "3 · 可提交、可复核的硬件完成度证据", C.purple);
  s += card(126, 2040, 440, 300, "整机与树莓派端", ["硬件软件快照已入仓", "三种体验入口可定位"], C.white, { accent: C.cyan, tag: "SOURCE", tagFill: C.cyan });
  s += card(610, 2040, 440, 300, "Bridge + Pi Adapter", ["事件白名单与字段裁剪", "私有事件拒绝进入设备"], C.paleGreen, { accent: C.green, tag: "BOUNDARY", tagFill: C.lime, titleSize: 31 });
  s += card(1094, 2040, 440, 300, "10 个核心 Smoke", ["Google Frost Edge 核心脚本通过", "Feed / Bridge Node 测试 4 / 4"], C.paleBlue, { accent: C.cyan, tag: "PASS", tagFill: C.cyan, titleSize: 31 });
  s += card(1578, 2040, 456, 300, "当前线上状态", ["Frost Feed 默认关闭", "用实物、视频、源码与测试证明"], C.paleYellow, { accent: C.yellow, tag: "OFFLINE", tagFill: C.yellow, titleSize: 31 });
  s += card(126, 2390, 1908, 110, "绝不进入设备：私人原文 · 原图 · 完整画像 · 精确坐标 · Gemini / GMI 云密钥。", [], C.paleRed, { titleSize: 25, tag: "DEVICE PRIVACY", tagFill: C.red });
  s += footer("SOFTWARE × HARDWARE · ONE FROST", "PUBLIC EVENTS ONLY");
  return s;
}

function slide10() {
  let s = base(10, "TECHNICAL · RUBRIC CLOSURE", "五项审核要求，一一落到可核验证据", "不自评打分；只展示审核人员能现场看到、代码能复核、材料能对应的证据。");
  s += section(86, 380, 1988, 1480, "1 · 评分维度 → Pocket Earth 证据", C.cyan);
  s += rubricBar(126, 530, 1828, 25, "完成度与传播效果", "线上 Demo · Web/PWA · Public Earth · Frost Edge · 52 文件 / 1336 测试 · typecheck + build", C.cyan);
  s += rubricBar(126, 750, 1828, 25, "Google AI / 产品工具深度使用", "Gemma + MediaPipe + WebGPU 进入端侧核心；Gemini 进入多模态、双语、路由与事实核验", C.lime);
  s += rubricBar(126, 970, 1828, 20, "创新性与 Vibe Coding", "空间对象协议 · 公私双地球 · Agent Harness · FactRelay · RunTrace · 硬件事件桥", C.purple);
  s += rubricBar(126, 1190, 1828, 20, "Tech for Good 社会价值与落地潜力", "隐私优先 · 公共事实可追溯 · 低网降级 · 跨文化记忆 · 软硬件共生", C.yellow);
  s += rubricBar(126, 1410, 1828, 10, "跨文化同理心与本地化体验", "中文手记 + English guide + cultural bridge · 语境重写 · 避免刻板印象", C.red);
  s += card(126, 1600, 1828, 190, "审核闭环", ["每一项都有：用户问题 → 产品交互 → Google 技术 → 代码文件 → 现场画面。"], C.white, { titleSize: 34, bodySize: 25, tag: "EVIDENCE", tagFill: C.lime });
  s += section(86, 1940, 1988, 620, "2 · 建议现场演示顺序", C.lime);
  s += smallCard(126, 2080, 400, 220, "00:00–00:40", "一句话定位 + 私人地球", C.white, C.cyan);
  s += smallCard(626, 2080, 400, 220, "00:40–01:40", "Agents 加载 Gemma / 端侧试问", C.paleGreen, C.green);
  s += smallCard(1126, 2080, 400, 220, "01:40–03:20", "拍展签 → 同意 → Gemini 四输出", C.paleBlue, C.cyan);
  s += smallCard(1626, 2080, 408, 220, "03:20–05:00", "钉回 + Public Earth + Frost Edge", C.palePurple, C.purple);
  s += arrow(526, 2190, 606, 2190, 5);
  s += arrow(1026, 2190, 1106, 2190, 5);
  s += arrow(1526, 2190, 1606, 2190, 5);
  s += card(126, 2350, 1908, 140, "一句收束", ["Gemma 在本地保护选择，Gemini 在云端扩展理解；记忆最终由用户确认，回到真实世界。"], C.paleYellow, { titleSize: 31, bodySize: 23, tag: "AI BUILDS AN UNBOUNDED FUTURE", tagFill: C.yellow });
  s += footer("FIVE RUBRICS · ONE PRODUCT STORY", "GOOGLE AI AT THE CORE");
  return s;
}

heroData = (await sharp(HERO).resize(1920, 1080, { fit: "fill" }).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer()).toString("base64");

const slides = [
  ["当前版本审核_01_封面_基于空间的个人知识库_3比4", slide1()],
  ["当前版本审核_02_用户痛点与空间索引_3比4", slide2()],
  ["当前版本审核_03_三到五分钟真实闭环_3比4", slide3()],
  ["当前版本审核_04_Google双推理平面_3比4", slide4()],
  ["当前版本审核_05_Gemma3n端侧可核验证据_3比4", slide5()],
  ["当前版本审核_06_跨文化看展搭子_3比4", slide6()],
  ["当前版本审核_07_Harness_RunTrace_长期记忆_3比4", slide7()],
  ["当前版本审核_08_公私双地球与FactRelay_3比4", slide8()],
  ["当前版本审核_09_FrostEdge软硬件共生_3比4", slide9()],
  ["当前版本审核_10_当前版本五项审核闭环_3比4", slide10()],
];

fs.mkdirSync(OUT, { recursive: true });
const pngs = [];
for (const [name, svg] of slides) {
  const svgPath = path.join(OUT, name + ".svg");
  const pngPath = path.join(OUT, name + ".png");
  fs.writeFileSync(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  pngs.push(pngPath);
  console.log(name + ": " + pngPath);
}

const thumbW = 480;
const thumbH = 640;
const gap = 48;
const columns = 4;
const rows = Math.ceil(pngs.length / columns);
const sheetW = gap * (columns + 1) + thumbW * columns;
const sheetH = gap * (rows + 1) + thumbH * rows;
const thumbs = await Promise.all(pngs.map((p) => sharp(p).resize(thumbW, thumbH, { fit: "fill" }).png().toBuffer()));
const comps = thumbs.map((input, i) => ({
  input,
  left: gap + (i % columns) * (thumbW + gap),
  top: gap + Math.floor(i / columns) * (thumbH + gap),
}));
await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: C.paper } })
  .composite(comps)
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, "当前版本审核十图_总览联系表.png"));

const readme = [
  "# Pocket Earth · Google AI 技术审核十图",
  "",
  "规格：2160 × 2880，宽高比 3:4；每张同时提供 PNG 与 SVG。",
  "",
  "统一视觉：浅灰网格纸、米白分区、粗黑描边、硬投影、青/绿/紫/黄章节标签与绿色流程箭头，严格延续“Google 技术五幕·浅色版”。",
  "",
  "## 十图与审核要求",
  "",
  "1. 封面定位：基于空间的个人知识库，建立一句话产品记忆点。",
  "2. 用户痛点与空间索引：目标海外用户、真实场景、出海价值与 Tech for Good 起点。",
  "3. 3–5 分钟真实闭环：回应完成度与传播效果 25%；含本次实跑 52/52 测试文件、1336/1336 测试项、typecheck 与 build。",
  "4. Google 双推理平面：回应 Google AI 深度使用 25%；说明 Gemma / Gemini 为什么与任务匹配。",
  "5. Gemma 3n 端侧证据：项目内 3,038,117,888 bytes 权重、同源 Range、MediaPipe、WebGPU、Agents 可现场复核入口与失败边界。",
  "6. 跨文化看展搭子：回应跨文化同理心 10%；显式同意、双语语境重写、cultural bridge 与反刻板印象。",
  "7. Harness / RunTrace / 长期记忆：回应创新性与 Vibe Coding 20%；展示空间索引、多 Agent 委派、确认式写入与可观测编排。",
  "8. 公私双地球与 FactRelay：私人记忆与公共事实分轨；来源收集、Gemini 双角色核验、确定性评分和人工发布形成责任闭环。",
  "9. Frost Edge：展示日落电台、口袋播客、地球答案，以及公共事件白名单、断网缓存、Pi 无云密钥等硬件边界。",
  "10. 五项审核闭环：把 25/25/20/20/10 五项指标映射到现场可见、代码可复核的证据，并给出 5 分钟演示顺序。",
  "",
  "## 口径边界",
  "",
  "- Google Gemini API 官方直连优先；GMI 只在无官方 Key 时作为 Google 模型的备用传输。",
  "- Gemma 权重已安装，代码具备加载与端侧试问入口；图中写“可现场复核”，不把未录制的现场状态夸大为已完成演示。",
  "- 不申报 Firebase、Vertex AI、Flutter、Google ADK、Search Grounding 等当前代码未使用的技术。",
  "- KIRI、Mapbox、OSM、Open-Meteo 等不是本次 Google AI 核心技术。",
  "- 8 个公共知识领域的 Agent 接口已实现，但实时版次取决于 provider / snapshot；无数据时明确显示 unavailable。",
  "- Frost Feed 当前线上默认关闭，硬件完成度以实物、视频、源码、白名单和 smoke test 证明。",
  "",
  "生成脚本：scripts/build-google-technical-portrait-cards.mjs",
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "README_十图与审核对应说明.md"), readme, "utf8");
