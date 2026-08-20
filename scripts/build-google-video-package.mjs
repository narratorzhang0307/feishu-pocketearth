import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'PocketEarthGoogle_提交包', '03_视频口播');
const rawSrtPath = join(out, 'Pocket Earth_章程.srt');
const rawJsonPath = join(out, 'Pocket Earth_章程.json');

const corrections = [
  ['手机APP', '手机 App'], ['盯回地球', '钉回地球'], ['自定一出', '自定义出'],
  ['一本书盯到', '一本书钉到'], ['一部电影返回取景地', '一部电影钉到取景地'],
  ['自带金伟渡', '自带经纬度'], ['统一的索影', '统一的索引'], ['主业地图', '主页地图'],
  ['象亮画', '向量化'], ['宋代官谣词', '宋代官窑瓷'], ['东京孟华路', '《东京梦华录》'],
  ['予意坐标', '语义坐标'], ['2000多不观影', '2000 多部观影记录'], ['数百张戴金伟渡', '数百张带经纬度'],
  ['千归一成', '统一成'], ['罗杰泽拉茲尼', '罗杰·泽拉兹尼'], ['书 画 物检', '书、画、物件'],
  ['只把活尾派', '只把活委派'], ['结构化补权', '结构化补全'], ['困 GMI Influence Engine', 'GMI Inference Engine'],
  ['每一部谁处理 发了多久', '每一步谁处理、花了多久'], ['Roundtrace', 'RunTrace'], ['端语协作', '端云协作'],
  ['至Agent', '子 Agent'], ['方向模点', '方向锚点'], ['按情绪 谈紧排出后果', '按情绪、场景排出候选'],
  ['高丝破键', '高斯泼溅'], ['继续升化', '继续升华'], ['中国私筹博物馆', '中国丝绸博物馆'],
  ['杭州官僚地图', '杭州官窑地图'], ['真实的官僚点', '真实的官窑点'], ['听到你的地球上', '钉到你的地球上'],
  ['各自举正', '各自举证'], ['落垂裁断', '落锤裁断'], ['照片毛固回现实', '照片锚固回现实'],
  ['这是可观测的事件数', '这是一棵可观测的事件树'], ['谁再调谁 在哪算', '谁在调谁、在哪算'],
  ['端测', '端侧'], ['端策', '端侧'], ['云砖', '云端'], ['哈西纸', '哈希值'],
  ['MN用MN跑困系列模型', '端侧模型运行时'], ['文本用困3.5到0.8B', '端侧文本模型'],
  ['视觉用困3VL2B', '端侧视觉模型'], ['SM-E2', 'SME2'], ['跨绘画', '跨会话'],
  ['新学道', '新学到'], ['阅读量上来达', '阅读量上来答'], ['挑出来彪红', '挑出来标红'],
  ['Pocket2是一套多字能体配戴的合设化实验', 'Pocket Earth 是一套多智能体编排的工程化实验'],
  ['数据先规一层地球上的脸', '数据先归一成地球上的点'], ['像CEO一样违派', '像 CEO 一样委派'],
  ['端侧管挑得着 云端管写', '端侧管挑，云端管写'], ['安全杂决定', '安全阀决定'],
  ['替你设交', '替你社交'], ['Agent代理设交', 'Agent 代理社交'], ['画像够后', '画像足够后'],
  ['书 影音 照片 形成 心情', '书、影音、照片、行程、心情'], ['让他们在地球上拼成你', '让它们在地球上拼成你'],
];

function correct(text) {
  return corrections.reduce((value, [from, to]) => value.split(from).join(to), text);
}

function parseTime(value) {
  const [h, m, rest] = value.split(':');
  const [s, ms] = rest.split(',');
  return (((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000) + Number(ms);
}

function formatTime(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

function parseSrt(source) {
  return source.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    const [start, end] = lines[1].split(' --> ').map(parseTime);
    return { start, end, text: lines.slice(2).join('\n') };
  });
}

function serialize(cues) {
  return cues.map((cue, index) => `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}`).join('\n\n') + '\n';
}

const replacements = [
  {
    start: 149080, end: 188260,
    cues: [
      [149080, 153300, 'Frost Agent 是一套多智能体 Harness。'],
      [153300, 158400, '路由从规则开始：明确命令秒回，隐私任务优先交给设备上的 Gemma 3n E2B IT；'],
      [158400, 162300, '复杂任务再升级给 Google Gemini。'],
      [162300, 167300, 'Flash-Lite 负责低延迟路由，Flash 负责叙事、双语和视觉理解，'],
      [167300, 172400, 'Pro 负责 Council 的高复杂度推理。'],
      [172400, 178600, '默认直连 Google Gemini API；GMI 只是可选的备用传输。'],
      [178600, 184000, '主要阶段由谁处理、耗时多久和显式降级，都会进入 RunTrace。'],
      [184000, 188260, '这就是 Pocket Earth 的端云协作。'],
    ],
  },
  {
    start: 224580, end: 253020,
    cues: [
      [224580, 228400, '把这套机制放到博物馆里，就是看展搭子。'],
      [228400, 232900, '拍一张展签，Gemini Flash 会补全年代、器类和材质；'],
      [232900, 236800, '上传前会二次确认；只有点击同意，公开展签才会发送。'],
      [236800, 242000, '它会一次生成中文策展手记、English guide 和时间线，'],
      [242000, 246300, '还会生成避免刻板印象的 cultural bridge。'],
      [246300, 250300, '你确认后，结果才钉回博物馆坐标，成为可回访的个人文化记忆。'],
      [250300, 253020, '批量照片也能一键整理成看展纪录。'],
    ],
  },
  {
    start: 260920, end: 281700,
    cues: [
      [260920, 265000, 'Agent Forge 让你自定义出属于自己的知识库。'],
      [265000, 268300, '比如你说：帮我建一张杭州官窑地图。'],
      [268300, 272500, 'Gemini 会基于模型知识生成候选点、解释和核验提示；'],
      [272500, 276500, '所有地点都标为待核验，只有你确认后才写入地球。'],
      [276500, 281700, '这样，模型知识不会被伪装成实时搜索结果。'],
    ],
  },
  {
    start: 296240, end: 368780,
    cues: [
      [296240, 300700, '这次 Google AI 比赛，我把模型能力放在核心：'],
      [300700, 306200, 'Gemini 负责复杂理解和跨文化生成，Gemma 3n E2B 负责隐私敏感的本地选择；'],
      [306200, 310500, 'Harness 决定何时调用，RunTrace 摊开完整链路。'],
      [310500, 315300, '第二项 Google 核心技术，是端侧 Gemma 3n E2B IT。'],
      [315300, 319600, '项目采用 int4 Web 版 .litertlm 权重。'],
      [319600, 325800, 'MediaPipe LLM Inference Web 调度 WebGPU，分类、排序和图像理解都在浏览器内运行。'],
      [325800, 330600, '权重已安装在项目内，通过同源 Range 路由加载。'],
      [330600, 335800, 'Agents 页已完成真实加载和端侧生成验证；全程不走 edge API。'],
      [335800, 340000, '这不是概念接入，而是第二条可运行的 Google 推理路径。'],
      [340000, 346700, '相册常混有人脸、证件、手机号和定位，所以高频隐私任务不应先上传。'],
      [346700, 352500, 'Router 先用规则，再让 Gemma 在本地预分类；'],
      [352500, 356600, '只有复杂任务才升级到云端 Gemini。'],
      [356600, 361700, '隐私图片失败不会静默上传，云端视觉必须经用户确认。'],
      [361700, 368780, 'MediaPipe 当前处于维护模式；GemmaEdge 已隔离运行时，可平滑迁移 LiteRT-LM JavaScript。'],
    ],
  },
  {
    start: 389820, end: 423180,
    cues: [
      [389820, 394700, 'Pocket Earth 是一套 Google-first 多智能体编排实验：'],
      [394700, 399500, '数据归一成地球上的点，Frost Agent 负责委派；'],
      [399500, 404800, 'Gemma 3n E2B 在本机管挑，Gemini 在云端管理解、双语叙事和看图；'],
      [404800, 409600, 'Privacy Boundary 管上传，动作 Boundary 管落地，RunTrace 让过程可见。'],
      [409600, 414100, '它不是多一个聊天框，'],
      [414100, 418900, '而是让普通人以更少隐私交换，保存自己的生活痕迹；'],
      [418900, 423180, '也让一件文物跨越语言和文化，被另一个人真正理解。'],
    ],
  },
];

const rawSrt = await readFile(rawSrtPath, 'utf8');
const correctedCues = parseSrt(correct(rawSrt));
const replacementCues = replacements.flatMap((block) => block.cues.map(([start, end, text]) => ({ start, end, text })));
const finalCues = correctedCues
  .filter((cue) => !replacements.some((block) => cue.start < block.end && cue.end > block.start))
  .concat(replacementCues)
  .sort((a, b) => a.start - b.start);

await writeFile(join(out, '01_原片完整字幕_人工校订版.srt'), serialize(correctedCues));
await writeFile(join(out, '01_原片完整字幕_人工校订版.txt'), correctedCues.map((cue) => cue.text).join('\n') + '\n');
await copyFile(rawJsonPath, join(out, '01_原片完整字幕_词级时间戳.json'));
await writeFile(join(out, '02_Google版_全片字幕.srt'), serialize(finalCues));
await writeFile(join(out, '02_Google版_全片字幕.txt'), finalCues.map((cue) => cue.text).join('\n') + '\n');
await writeFile(join(out, '03_Google版_新增替换口播.srt'), serialize(replacementCues));
await writeFile(join(out, '03_Google版_新增替换口播.txt'), replacementCues.map((cue) => `${formatTime(cue.start)} - ${formatTime(cue.end)}\n${cue.text}`).join('\n\n') + '\n');

console.log(`video package generated: ${correctedCues.length} original cues, ${replacementCues.length} replacement cues, ${finalCues.length} final cues`);
