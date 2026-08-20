// Pocket Earth Google 硬件快照：静态托管 dist/，复杂生成转交 Google-first 主服务，
// 受限端侧任务走本机 Gemma。树莓派不保存云密钥，任何失败都回退规则与缓存。
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

function loadLocalEnvFiles() {
  for (const name of ['.env.runtime', '.env.local', '.env']) {
    const file = path.join(__dirname, name);
    if (!fs.existsSync(file)) continue;
    try {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
        if (!match) continue;
        const [, key, rawValue = ''] = match;
        if (process.env[key] !== undefined) continue;
        let value = rawValue.trim();
        const quote = value[0];
        if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
          value = value.slice(1, -1);
        } else {
          value = value.replace(/\s+#.*$/, '');
        }
        process.env[key] = value.replace(/\\n/g, '\n');
      }
    } catch {
      // Environment files are optional; runtime env remains the source of truth.
    }
  }
}

loadLocalEnvFiles();

const NODE_ENV = process.env.NODE_ENV || 'development';
const HOST = process.env.HOST || (NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const PORT = Number(process.env.PORT || 8080);
const POCKET_EARTH_CLOUD_URL = (
  process.env.POCKET_EARTH_CLOUD_URL
  || 'https://pocketearth-google.throughtheglass.art'
).replace(/\/$/, '');
const FROST_RAG_PROXY_URL = process.env.FROST_RAG_PROXY_URL || '';
const FROST_RAG_TOP_K = Math.max(1, Math.min(8, Number(process.env.FROST_RAG_TOP_K || 4) || 4));
const GEMMA_URL = (process.env.POCKET_EARTH_GEMMA_URL || 'http://127.0.0.1:8787/v1').replace(/\/$/, '');
const EDGE_MODEL = process.env.POCKET_EARTH_GEMMA_MODEL || 'gemma-4-e4b-it';
const PI_CONTROL_MAX = Number(process.env.PI_CONTROL_MAX || 24);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
};

function currentEntrypoint(ext) {
  try {
    const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    const match = html.match(new RegExp(`/assets/index-[^"']+\\.${ext}`));
    return match ? path.join(DIST, match[0]) : '';
  } catch {
    return '';
  }
}

function sendJson(res, obj) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 1024 * 128) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('request_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

let localRagDocs = null;

function localRagText(value, depth = 0) {
  if (!value || depth > 3) return [];
  if (typeof value === 'string') return [value.replace(/\s+/g, ' ').trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => localRagText(item, depth + 1));
  if (typeof value !== 'object') return [];
  const usefulKeys = ['cityNameZh', 'cityName', 'title', 'artist', 'subtitle', 'introText', 'text', 'description', 'note', 'displayText'];
  return usefulKeys.flatMap((key) => localRagText(value[key], depth + 1));
}

function loadLocalRagDocs() {
  if (localRagDocs) return localRagDocs;
  const docs = [];
  const cityDir = path.join(__dirname, 'resource-library', 'cities');
  try {
    for (const file of fs.readdirSync(cityDir).filter((name) => name.endsWith('.json'))) {
      const city = JSON.parse(fs.readFileSync(path.join(cityDir, file), 'utf8'));
      const cityLabel = city.cityNameZh || city.cityName || city.slug || file.replace(/\.json$/, '');
      const cityText = localRagText(city).join(' ').slice(0, 900);
      if (cityText) docs.push({ title: `${cityLabel} · 城市资料`, text: cityText });
      for (const track of city.tracks || []) {
        const text = localRagText(track).join(' ').slice(0, 640);
        if (text) docs.push({ title: `${cityLabel} · ${track.title || '歌曲'} — ${track.artist || ''}`, text });
      }
      for (const segment of city.podcast || []) {
        const text = localRagText(segment).join(' ').slice(0, 900);
        if (text) docs.push({ title: `${cityLabel} · ${segment.title || '播客文稿'}`, text });
      }
    }
  } catch {
    // Local library is optional in tiny deployments; Frost can still fall back to plain LLM.
  }
  localRagDocs = docs;
  return localRagDocs;
}

function ragTerms(query) {
  const text = String(query || '').toLowerCase();
  const terms = new Set();
  for (const word of text.match(/[a-z0-9][a-z0-9'-]{1,}/g) || []) terms.add(word);
  for (const block of text.match(/[\u4e00-\u9fa5]{2,}/g) || []) {
    terms.add(block);
    for (let i = 0; i < block.length - 1; i += 1) terms.add(block.slice(i, i + 2));
  }
  return [...terms].filter((term) => term.length >= 2).slice(0, 40);
}

function localRagSearch(query, topK = FROST_RAG_TOP_K) {
  const terms = ragTerms(query);
  if (!terms.length) return [];
  return loadLocalRagDocs()
    .map((doc) => {
      const hay = `${doc.title}\n${doc.text}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (hay.includes(term) ? Math.min(8, term.length) : 0), 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

async function remoteRagSearch(query) {
  if (!FROST_RAG_PROXY_URL) return null;
  const response = await fetch(FROST_RAG_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, topK: FROST_RAG_TOP_K }),
    signal: AbortSignal.timeout(Number(process.env.FROST_RAG_TIMEOUT_MS || 5000)),
  });
  if (!response.ok) throw new Error(`rag_proxy_${response.status}`);
  const data = await response.json();
  if (typeof data?.context === 'string') {
    return [{ title: data.source || 'RAG', text: data.context }];
  }
  const hits = Array.isArray(data?.hits) ? data.hits : Array.isArray(data?.results) ? data.results : [];
  return hits
    .map((hit, i) => ({
      title: String(hit.title || hit.source || hit.id || `RAG ${i + 1}`),
      text: String(hit.text || hit.content || hit.chunk || hit.document || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((hit) => hit.text);
}

async function frostRagContext(query) {
  let source = 'local_library';
  let hits = [];
  try {
    const remote = await remoteRagSearch(query);
    if (remote?.length) {
      source = 'proxy_chroma';
      hits = remote;
    }
  } catch {
    source = 'local_fallback';
  }
  if (!hits.length) hits = localRagSearch(query);
  const context = hits
    .map((hit, i) => `【${i + 1} ${hit.title}】${hit.text}`)
    .join('\n')
    .slice(0, 2600);
  return { source, hitCount: hits.length, context };
}

const piControl = {
  seq: 0,
  commands: [],
  state: {
    updatedAt: new Date().toISOString(),
    status: 'idle',
    label: 'Standby',
    city: '',
    track: '',
    message: 'Sunset Radio is ready.',
  },
};
const PI_TRANSIENT_VOICE_LABELS = new Set(['语音待命', '语音待查', '转文字', '安静待命']);

// Ambient day-planner channel: the Pi's orchestration agent publishes its live run here
// (perceive → locate → weather → sunset → compose → commit) and the PWA renders it. The
// Whisplay screen is tiny, so the phone/desktop is where you watch the Pi plan the day.
const PI_PLAN_MAX_STEPS = Number(process.env.PI_PLAN_MAX_STEPS || 16);
const PI_PLAN_MAX_STOPS = Number(process.env.PI_PLAN_MAX_STOPS || 48);
const piPlanStore = {
  plan: {
    runId: '',
    status: 'idle',
    title: 'Sunset Radio 环境编排',
    updatedAt: new Date().toISOString(),
    message: '环境编排 agent 待命。说「规划今天的日落电台」，就在这里看它一步步排全天。',
    steps: [],
    schedule: [],
    stops: 0,
  },
};

function sanitizePiPlan(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const plan = { ...payload };
  plan.updatedAt = new Date().toISOString();
  if (Array.isArray(plan.steps)) plan.steps = plan.steps.slice(0, PI_PLAN_MAX_STEPS);
  if (Array.isArray(plan.schedule)) plan.schedule = plan.schedule.slice(0, PI_PLAN_MAX_STOPS);
  return plan;
}

async function piPlanHandle(req, res) {
  if (req.method === 'GET') {
    sendJson(res, { ok: true, plan: piPlanStore.plan });
    return;
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 96);
      const plan = sanitizePiPlan(JSON.parse(body || '{}'));
      if (!plan) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_plan' }));
        return;
      }
      piPlanStore.plan = plan;
      sendJson(res, { ok: true, plan: piPlanStore.plan });
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  res.writeHead(405);
  res.end();
}

// Pet channel: the Pi's companion pet (mood / activity / dusk-drift / today's timeline,
// plus an optional Whisplay screen-mirror frame) publishes its latest snapshot here and
// the PWA's companion tab polls it. Latest-wins, same shape as the plan channel.
const PI_PET_MAX_EVENTS = Number(process.env.PI_PET_MAX_EVENTS || 40);
const PI_PET_MAX_SCREEN_CHARS = Number(process.env.PI_PET_MAX_SCREEN_CHARS || 200 * 1024);
const piPetStore = {
  pet: {
    updatedAt: new Date().toISOString(),
    mood: 'calm',
    moodZh: '安然',
    activity: 'home_watch',
    activityZh: '在家守光',
    message: '电子宠物待命。树莓派上线后，这里就是它的家。',
  },
};

function sanitizePiPet(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const pet = { ...payload };
  pet.updatedAt = new Date().toISOString();
  if (pet.today && Array.isArray(pet.today.events)) {
    pet.today = { ...pet.today, events: pet.today.events.slice(-PI_PET_MAX_EVENTS) };
  }
  if (typeof pet.screen === 'string' && pet.screen.length > PI_PET_MAX_SCREEN_CHARS) {
    delete pet.screen; // 超限的屏幕镜像帧直接丢弃，状态本体照常更新
  }
  return pet;
}

async function piPetHandle(req, res) {
  if (req.method === 'GET') {
    sendJson(res, { ok: true, pet: piPetStore.pet });
    return;
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 256);
      const pet = sanitizePiPet(JSON.parse(body || '{}'));
      if (!pet) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_pet' }));
        return;
      }
      // 浅合并：守护进程发状态快照、Whisplay 屏发镜像帧，两路各自更新自己的字段互不覆盖
      //（快照的 drift 为 null 时同样以 null 覆盖，神游结束手机端即归位）。
      piPetStore.pet = { ...piPetStore.pet, ...pet };
      sendJson(res, { ok: true });
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  res.writeHead(405);
  res.end();
}

// Inbox channel: letters the pet mails home after each dusk drift. Letters are the
// product's emotional asset, so unlike every other in-memory pi store this one persists
// to disk — a pm2/systemd restart must never lose a letter.
const PI_INBOX_MAX = Number(process.env.PI_INBOX_MAX || 200);
const PI_INBOX_FILE = process.env.PI_INBOX_FILE
  || path.join(os.homedir(), '.local', 'share', 'sunset-radio', 'pi-inbox.json');

function loadInbox() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PI_INBOX_FILE, 'utf8'));
    if (Array.isArray(parsed?.letters)) return parsed.letters.slice(-PI_INBOX_MAX);
  } catch { /* 首次运行/文件损坏：从空信箱开始 */ }
  return [];
}

const piInbox = { letters: loadInbox() };

function persistInbox() {
  try {
    fs.mkdirSync(path.dirname(PI_INBOX_FILE), { recursive: true });
    // 原子写：先写临时文件再 rename——信是唯一落盘的情感资产，崩溃/断电/磁盘满
    // 都不允许把旧信箱毁成半个 JSON。
    const tmp = `${PI_INBOX_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ letters: piInbox.letters }, null, 2));
    fs.renameSync(tmp, PI_INBOX_FILE);
  } catch (e) {
    console.error('[pi-inbox] persist failed:', e?.message || e);
  }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitizeLetter(payload) {
  // 白名单重建：字段逐个取、逐个限长，杂字段（含 __proto__ 一类）一概丢弃——
  // 落盘的数据会被前端长期渲染，一封畸形毒信不能毒死整个信箱。
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 4000) : '';
  if (!body.trim()) return null;
  const track = payload.track && typeof payload.track === 'object' && !Array.isArray(payload.track) ? payload.track : {};
  const no = Number(payload.no);
  return {
    id: str(payload.id, 80) || `letter-${Date.now()}-${piInbox.letters.length}`,
    kind: str(payload.kind, 16) || 'letter',
    at: str(payload.at, 32),
    no: Number.isFinite(no) ? no : undefined,
    city: str(payload.city, 40),
    slug: str(payload.slug, 60),
    sunsetClock: str(payload.sunsetClock, 12),
    weather: str(payload.weather, 200),
    source: str(payload.source, 16),
    track: { id: str(track.id, 80), title: str(track.title, 120), artist: str(track.artist, 120) },
    body,
    receivedAt: new Date().toISOString(),
  };
}

async function piInboxHandle(req, res) {
  if (req.method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    const limit = Math.max(1, Math.min(PI_INBOX_MAX, Number(url.searchParams.get('limit')) || PI_INBOX_MAX));
    // 新信在前：手机信箱直接按序渲染
    sendJson(res, { ok: true, count: piInbox.letters.length, letters: [...piInbox.letters].reverse().slice(0, limit) });
    return;
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 32);
      const parsed = JSON.parse(body || '{}');
      const letter = sanitizeLetter(parsed.letter || parsed);
      if (!letter) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_letter' }));
        return;
      }
      piInbox.letters = [...piInbox.letters, letter].slice(-PI_INBOX_MAX);
      persistInbox();
      sendJson(res, { ok: true, count: piInbox.letters.length });
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  res.writeHead(405);
  res.end();
}

function isPiNowPlayingState(state) {
  return state?.status === 'playing' && Boolean(state.city || state.track);
}

function isTransientVoicePiState(payload) {
  const status = String(payload?.status || '').toLowerCase();
  if (status === 'queued') return false;
  const label = String(payload?.label || '');
  if (PI_TRANSIENT_VOICE_LABELS.has(label)) return true;
  return (
    String(payload?.city || '') === '语音控制'
    && String(payload?.track || '') === '麦克风'
    && ['idle', 'listening', 'thinking'].includes(status)
  );
}

function mergePiState(payload) {
  const updatedAt = new Date().toISOString();
  if (isPiNowPlayingState(piControl.state) && isTransientVoicePiState(payload)) {
    return {
      ...piControl.state,
      updatedAt,
      lastVoiceTransient: {
        status: payload.status || '',
        label: payload.label || '',
        message: payload.message || '',
        at: updatedAt,
      },
    };
  }
  return {
    ...piControl.state,
    ...payload,
    updatedAt,
  };
}

function pushPiCommand(text, source = 'raspi', target = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const command = {
    id: `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    seq: ++piControl.seq,
    text: trimmed,
    source,
    // 寻址：'pi' 只给树莓派认领、'web' 只给网页桥认领、空=谁先到谁认领（旧行为）。
    // 没有它，手机发给 Pi 的命令会在 1.8s 内被手机自己的网页桥抢回去。
    target: target === 'pi' || target === 'web' ? target : '',
    createdAt: new Date().toISOString(),
    claimedBy: '',
    claimedAt: '',
  };
  piControl.commands.push(command);
  piControl.commands = piControl.commands.slice(-PI_CONTROL_MAX);
  piControl.state = {
    ...piControl.state,
    updatedAt: command.createdAt,
    status: 'queued',
    label: source === 'voice' ? 'Voice command' : 'Command queued',
    message: trimmed,
  };
  return command;
}

function publicPiState() {
  const pending = piControl.commands.filter((command) => !command.claimedBy).length;
  return { ...piControl.state, pending, seq: piControl.seq };
}

function commandAgeMs(command, now = Date.now()) {
  const created = Date.parse(command.createdAt || '');
  return Number.isFinite(created) ? Math.max(0, now - created) : 0;
}

async function piControlHandle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET') {
    const shouldClaim = url.searchParams.get('claim') === '1';
    const client = url.searchParams.get('client') || '';
    const minAgeMs = Math.max(0, Number(url.searchParams.get('minAgeMs') || 0) || 0);
    const source = (url.searchParams.get('source') || '').trim();
    const accept = (url.searchParams.get('accept') || '').trim();
    const nowMs = Date.now();
    const commands = piControl.commands.filter((command) => {
      if (command.claimedBy && command.claimedBy !== client) return false;
      // minAge 的存在意义是给多客户端「让先」窗口；定向命令没有竞争者，立即可领——
      // 否则手机宠物按钮要白等 4.5s 才被树莓派的兜底 claim 捡走。
      if (minAgeMs && !command.target && commandAgeMs(command, nowMs) < minAgeMs) return false;
      if (source && command.source !== source) return false;
      // 带 target 的命令只发给声明了对应 accept 的客户端；未声明的旧客户端永远拿不到定向命令。
      if (command.target && command.target !== accept) return false;
      return !command.claimedBy;
    });
    if (shouldClaim && client) {
      const now = new Date().toISOString();
      for (const command of commands) {
        command.claimedBy = client;
        command.claimedAt = now;
      }
    }
    sendJson(res, {
      ok: true,
      state: publicPiState(),
      commands: commands.map(({ claimedBy, claimedAt, ...command }) => ({ ...command, ageMs: commandAgeMs(command, nowMs) })),
    });
    return;
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 16);
      const payload = JSON.parse(body || '{}');
      const command = pushPiCommand(payload.text, payload.source || 'raspi', payload.target || '');
      if (!command) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'empty_text' }));
        return;
      }
      sendJson(res, { ok: true, command: { id: command.id, seq: command.seq, text: command.text, source: command.source, createdAt: command.createdAt }, state: publicPiState() });
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  res.writeHead(405);
  res.end();
}

async function piStateHandle(req, res) {
  if (req.method === 'POST') {
    try {
      const body = await readBody(req, 1024 * 16);
      const payload = JSON.parse(body || '{}');
      piControl.state = mergePiState(payload);
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
      return;
    }
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }
  sendJson(res, { ok: true, state: publicPiState() });
}

async function frostLlm(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  readBody(req).then(async (body) => {
    try {
      const payload = JSON.parse(body || '{}');
      const r = await fetch(`${POCKET_EARTH_CLOUD_URL}/api/frost-llm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return sendJson(res, { text: '', error: `google_cloud_${r.status}`, provider: 'google-first' });
      const data = await r.json();
      sendJson(res, {
        ...data,
        provider: data?.provider || 'google-first',
        modelOwner: data?.modelOwner || 'Google',
        transport: data?.transport || 'pocket-earth-cloud',
      });
    } catch (e) {
      sendJson(res, { text: '', error: String(e) });
    }
  }).catch((e) => sendJson(res, { text: '', error: String(e) }));
}

function piTtsStatus() {
  return {
    ok: false,
    configured: false,
    provider: 'local-muted',
    reason: 'speech_generation_not_enabled_in_google_hardware_snapshot',
  };
}

async function piTtsHandle(req, res) {
  if (req.method === 'GET') {
    sendJson(res, piTtsStatus());
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  await readBody(req, 1024 * 8).catch(() => '');
  sendJson(res, { ...piTtsStatus(), audio: '' });
}

const edgeProbeCache = { ready: null, checkedAt: 0 };
async function probeGemma() {
  const now = Date.now();
  if (edgeProbeCache.ready !== null && now - edgeProbeCache.checkedAt < 10000) return edgeProbeCache.ready;
  try { edgeProbeCache.ready = (await fetch(`${GEMMA_URL}/models`, { signal: AbortSignal.timeout(1500) })).ok; } catch { edgeProbeCache.ready = false; }
  edgeProbeCache.checkedAt = now;
  return !!edgeProbeCache.ready;
}

async function gemmaChat(messages, opts = {}) {
  const responseFormat = opts.json ? { response_format: { type: 'json_object' } } : {};
  const r = await fetch(`${GEMMA_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: EDGE_MODEL,
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 96,
      ...responseFormat,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`gemma_${r.status}`);
  return (await r.json())?.choices?.[0]?.message?.content || '';
}

async function pickEdgeBackend() {
  return (await probeGemma())
    ? { name: 'gemma-local', model: EDGE_MODEL, modelOwner: 'Google', transport: 'loopback', chat: gemmaChat }
    : null;
}

async function edgeImageToBase64(image) {
  if (!image) return '';
  if (image.startsWith('data:')) return image.split(',')[1] || '';
  if (image.startsWith('http')) return Buffer.from(await (await fetch(image)).arrayBuffer()).toString('base64');
  return image;
}

async function edgeHandle(raw) {
  const b = JSON.parse(raw || '{}');
  const be = await pickEdgeBackend();
  if (!be) return { backend: 'stub' };
  switch (b.task) {
    case 'ping':
      return { backend: be.name };
    case 'chat': {
      const msgs = [];
      if (b.system) msgs.push({ role: 'system', content: b.system });
      msgs.push({ role: 'user', content: b.prompt || '' });
      return { backend: be.name, text: await be.chat(msgs, { json: b.json }) };
    }
    case 'classify': {
      const labels = Array.isArray(b.labels) ? b.labels : [];
      const text = await be.chat([
        { role: 'system', content: '你是分类器。只输出给定选项中的一个，不要任何多余文字。' },
        { role: 'user', content: `文本：${b.text || ''}\n选项：${labels.join(' / ')}\n答：` },
      ], { think: false });
      return { backend: be.name, text: labels.find((label) => text.includes(label)) || '' };
    }
    case 'rank': {
      const candidates = Array.isArray(b.candidates) ? b.candidates : [];
      const text = await be.chat([
        { role: 'system', content: '给每个候选打 0-100 的相关度分。只返回一个 JSON 数组，仅数字，长度与候选一致。' },
        { role: 'user', content: `查询：${b.query || ''}\n候选：\n${candidates.map((c, i) => `${i}. ${c}`).join('\n')}\nJSON：` },
      ], { json: true, think: false });
      try {
        const arr = JSON.parse(text);
        const list = Array.isArray(arr) ? arr : arr.scores || [];
        return { backend: be.name, scores: candidates.map((_, i) => (Number(list[i]) || 0) / 100) };
      } catch {
        return { backend: be.name, scores: [] };
      }
    }
    case 'embed':
      return { backend: be.name, vectors: [], error: 'embedding_not_enabled_on_frost_edge' };
    case 'vision': {
      return { backend: be.name, text: '', error: 'vision_requires_explicit_cloud_consent' };
    }
    default:
      return { backend: 'stub' };
  }
}

async function frostEdge(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  readBody(req).then(async (body) => {
    try {
      sendJson(res, await edgeHandle(body));
    } catch (e) {
      sendJson(res, { backend: 'stub', error: String(e) });
    }
  }).catch((e) => sendJson(res, { backend: 'stub', error: String(e) }));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let file = path.join(DIST, rel);
  // 防目录穿越
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      const normalizedRel = rel.replace(/\\/g, '/');
      const ext = path.extname(normalizedRel).toLowerCase();
      const staleEntrypoint = normalizedRel.match(/^assets\/index-[A-Za-z0-9_-]+\.(js|css)$/);
      if (staleEntrypoint) {
        file = currentEntrypoint(ext.slice(1));
        if (!file) { res.writeHead(404); res.end('not found'); return; }
      } else if (ext) {
        res.writeHead(404); res.end('not found'); return;
      } else {
        // SPA 回退：未知路由交给 index.html
        file = path.join(DIST, 'index.html');
      }
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const relPath = path.relative(DIST, file).replace(/\\/g, '/');
    const cacheable = ext !== '.html' && relPath !== 'sw.js' && relPath !== 'manifest.webmanifest';
    res.writeHead(200, {
      'content-type': type,
      'cache-control': cacheable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.warn(`dist/index.html not found. Run "npm run build" before starting the local host.`);
}

const app = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/frost-llm')) return frostLlm(req, res);
  if ((req.url || '').startsWith('/api/edge')) return frostEdge(req, res);
  if ((req.url || '').startsWith('/api/pi-control')) return piControlHandle(req, res);
  if ((req.url || '').startsWith('/api/pi-state')) return piStateHandle(req, res);
  if ((req.url || '').startsWith('/api/pi-plan')) return piPlanHandle(req, res);
  if ((req.url || '').startsWith('/api/pi-pet')) return piPetHandle(req, res);
  if ((req.url || '').startsWith('/api/pi-inbox')) return piInboxHandle(req, res);
  if ((req.url || '').startsWith('/api/pi-tts')) return piTtsHandle(req, res);
  if ((req.url || '') === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  serveStatic(req, res);
});

app.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=${PORT + 1} npm run serve`);
    process.exit(1);
  }
  throw err;
});

app.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  console.log(`pocket-earth edge snapshot at http://${shownHost}:${PORT}  (Gemma ${EDGE_MODEL}; Gemini via ${POCKET_EARTH_CLOUD_URL})`);
});
