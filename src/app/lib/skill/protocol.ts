import {
  SKILL_PROTOCOL,
  SKILL_RUNTIME_VERSION,
  type SkillAsset,
  type SkillExecution,
  type SkillFallbackStep,
  type SkillKind,
  type SkillManifest,
  type SkillPlatform,
  type SkillScope,
  type SkillTool,
} from './types';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const KINDS: SkillKind[] = ['markdown', 'lora', 'hybrid'];
const EXECUTIONS: SkillExecution[] = ['declarative', 'mnn'];
const PLATFORMS: SkillPlatform[] = ['web', 'android-arm64'];
const SCOPES: SkillScope[] = ['location', 'photos', 'audio', 'network', 'clipboard', 'public-sources'];
const TOOLS: SkillTool[] = ['enrich', 'geocode', 'edge_tag', 'mark_place', 'data_pack', 'vision', 'restore'];
const FALLBACK_STEPS: SkillFallbackStep[] = ['adapter', 'base', 'rules', 'user-confirmation', 'stop'];

export class SkillProtocolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SkillProtocolError';
  }
}

const asObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkillProtocolError('schema', `${label} 必须是对象`);
  return value as Record<string, unknown>;
};

const text = (value: unknown, label: string, max: number, allowEmpty = false): string => {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new SkillProtocolError('schema', `${label} 不是有效文本`);
  return value;
};

const exactKeys = (value: Record<string, unknown>, allowed: string[], label: string) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new SkillProtocolError('schema', `${label} 包含未知字段 ${extra}`);
};

const stringList = <T extends string>(value: unknown, allowed: readonly T[], label: string, max = 20): T[] => {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string' || !allowed.includes(item as T))) {
    throw new SkillProtocolError('schema', `${label} 包含无效值`);
  }
  if (new Set(value).size !== value.length) throw new SkillProtocolError('schema', `${label} 不能重复`);
  return value as T[];
};

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function validateAsset(value: unknown, index: number): SkillAsset {
  const label = `assets[${index}]`;
  const asset = asObject(value, label);
  exactKeys(asset, ['id', 'role', 'media_type', 'bytes', 'sha256', 'url', 'optional'], label);
  const id = text(asset.id, `${label}.id`, 128);
  if (!ID.test(id)) throw new SkillProtocolError('schema', `${label}.id 无效`);
  if (!['instructions', 'adapter', 'model', 'example', 'avatar', 'other'].includes(String(asset.role))) throw new SkillProtocolError('schema', `${label}.role 无效`);
  text(asset.media_type, `${label}.media_type`, 120);
  if (!Number.isInteger(asset.bytes) || Number(asset.bytes) < 0 || Number(asset.bytes) > 8 * 1024 * 1024 * 1024) throw new SkillProtocolError('size', `${label}.bytes 无效`);
  const sha = text(asset.sha256, `${label}.sha256`, 64);
  if (!SHA256.test(sha)) throw new SkillProtocolError('sha256', `${label}.sha256 无效`);
  const url = text(asset.url, `${label}.url`, 2000, true);
  if (url && !/^https:\/\//.test(url)) throw new SkillProtocolError('url', `${label}.url 必须是 HTTPS 地址`);
  if (asset.optional !== undefined && typeof asset.optional !== 'boolean') throw new SkillProtocolError('schema', `${label}.optional 必须是布尔值`);
  return value as SkillAsset;
}

export function validateSkillManifest(value: unknown): SkillManifest {
  const root = asObject(value, 'manifest');
  exactKeys(root, ['protocol', 'identity', 'kind', 'entry', 'runtime', 'permissions', 'data', 'quality_gate', 'fallback', 'evaluation', 'distribution', 'assets', 'provenance', 'signature'], 'manifest');
  if (root.protocol !== SKILL_PROTOCOL) throw new SkillProtocolError('protocol', `只支持 ${SKILL_PROTOCOL}`);

  const identity = asObject(root.identity, 'identity');
  exactKeys(identity, ['id', 'name', 'version', 'author', 'description'], 'identity');
  const identityId = text(identity.id, 'identity.id', 128);
  if (!ID.test(identityId)) throw new SkillProtocolError('schema', 'identity.id 必须是反向域名式稳定 ID');
  text(identity.name, 'identity.name', 80);
  const version = text(identity.version, 'identity.version', 40);
  if (!SEMVER.test(version)) throw new SkillProtocolError('version', 'identity.version 必须是 SemVer');
  text(identity.author, 'identity.author', 120);
  text(identity.description, 'identity.description', 500);

  if (!KINDS.includes(root.kind as SkillKind)) throw new SkillProtocolError('schema', 'kind 无效');
  const entry = asObject(root.entry, 'entry');
  exactKeys(entry, ['target', 'instructions', 'adapter'], 'entry');
  text(entry.target, 'entry.target', 128);
  if (entry.instructions !== undefined) text(entry.instructions, 'entry.instructions', 2000);
  if (entry.adapter !== undefined) text(entry.adapter, 'entry.adapter', 128);

  const runtime = asObject(root.runtime, 'runtime');
  exactKeys(runtime, ['execution', 'runtime_min', 'platforms', 'base'], 'runtime');
  if (!EXECUTIONS.includes(runtime.execution as SkillExecution)) throw new SkillProtocolError('runtime', 'runtime.execution 无效');
  const runtimeMin = text(runtime.runtime_min, 'runtime.runtime_min', 40);
  if (!/^\d+\.\d+\.\d+$/.test(runtimeMin) || compareVersions(SKILL_RUNTIME_VERSION, runtimeMin) < 0) throw new SkillProtocolError('compatibility', `需要 Pocket Skill Runtime ${runtimeMin}`);
  stringList(runtime.platforms, PLATFORMS, 'runtime.platforms');
  if (runtime.base !== undefined) {
    const base = asObject(runtime.base, 'runtime.base');
    exactKeys(base, ['id', 'revision', 'sha256'], 'runtime.base');
    text(base.id, 'runtime.base.id', 160);
    text(base.revision, 'runtime.base.revision', 160);
    const sha = text(base.sha256, 'runtime.base.sha256', 64);
    if (!SHA256.test(sha)) throw new SkillProtocolError('sha256', 'runtime.base.sha256 无效');
  }
  const kind = root.kind as SkillKind;
  if (kind === 'markdown' && runtime.execution !== 'declarative') throw new SkillProtocolError('compatibility', 'Markdown Skill 必须使用 declarative runtime');
  if (kind !== 'markdown' && (runtime.execution !== 'mnn' || runtime.base === undefined || !entry.adapter)) {
    throw new SkillProtocolError('compatibility', 'LoRA/混合 Skill 必须声明 MNN 基座和 adapter');
  }

  const permissions = asObject(root.permissions, 'permissions');
  exactKeys(permissions, ['scopes', 'tools', 'network_hosts'], 'permissions');
  const scopes = stringList(permissions.scopes, SCOPES, 'permissions.scopes');
  stringList(permissions.tools, TOOLS, 'permissions.tools');
  if (!Array.isArray(permissions.network_hosts) || permissions.network_hosts.length > 20) throw new SkillProtocolError('permissions', 'permissions.network_hosts 无效');
  const hosts = permissions.network_hosts.map((host, index) => text(host, `permissions.network_hosts[${index}]`, 253));
  if (hosts.some((host) => !HOST.test(host))) throw new SkillProtocolError('permissions', 'network_hosts 只允许精确域名，不允许 URL、通配符或 IP');
  if (hosts.length && !scopes.includes('network')) throw new SkillProtocolError('permissions', '声明联网域名时必须申请 network scope');
  if (!scopes.includes('network') && hosts.length) throw new SkillProtocolError('permissions', '离线 Skill 不能声明联网域名');

  const data = asObject(root.data, 'data');
  exactKeys(data, ['schemas'], 'data');
  if (!Array.isArray(data.schemas) || data.schemas.length > 20 || data.schemas.some((item) => typeof item !== 'string' || item.length > 128)) throw new SkillProtocolError('schema', 'data.schemas 无效');

  const qualityGate = asObject(root.quality_gate, 'quality_gate');
  exactKeys(qualityGate, ['policy_id', 'checks'], 'quality_gate');
  text(qualityGate.policy_id, 'quality_gate.policy_id', 128);
  if (!Array.isArray(qualityGate.checks) || qualityGate.checks.length < 1 || qualityGate.checks.length > 20
    || qualityGate.checks.some((item) => typeof item !== 'string' || !item.trim() || item.length > 200)) {
    throw new SkillProtocolError('quality_gate', 'quality_gate.checks 必须声明至少一条可验证条件');
  }

  const fallback = asObject(root.fallback, 'fallback');
  exactKeys(fallback, ['order'], 'fallback');
  const fallbackOrder = stringList(fallback.order, FALLBACK_STEPS, 'fallback.order', FALLBACK_STEPS.length);
  if (!fallbackOrder.length || fallbackOrder[fallbackOrder.length - 1] !== 'stop') throw new SkillProtocolError('fallback', 'fallback.order 必须以 stop 结束');

  const evaluation = asObject(root.evaluation, 'evaluation');
  exactKeys(evaluation, ['suite', 'passed', 'score', 'threshold', 'tested_at'], 'evaluation');
  text(evaluation.suite, 'evaluation.suite', 160);
  if (typeof evaluation.passed !== 'boolean') throw new SkillProtocolError('evaluation', 'evaluation.passed 必须是布尔值');
  for (const field of ['score', 'threshold'] as const) {
    if (typeof evaluation[field] !== 'number' || !Number.isFinite(evaluation[field]) || evaluation[field] < 0 || evaluation[field] > 1) {
      throw new SkillProtocolError('evaluation', `evaluation.${field} 必须是 0—1`);
    }
  }
  if (evaluation.passed !== (Number(evaluation.score) >= Number(evaluation.threshold))) throw new SkillProtocolError('evaluation', 'evaluation.passed 与 score/threshold 不一致');
  if (Number.isNaN(Date.parse(text(evaluation.tested_at, 'evaluation.tested_at', 40)))) throw new SkillProtocolError('evaluation', 'evaluation.tested_at 无效');

  const distribution = asObject(root.distribution, 'distribution');
  exactKeys(distribution, ['channel', 'manifest_url', 'uninstall_policy'], 'distribution');
  if (!['builtin', 'oss', 'private'].includes(String(distribution.channel))) throw new SkillProtocolError('distribution', 'distribution.channel 无效');
  const manifestUrl = text(distribution.manifest_url, 'distribution.manifest_url', 2000, true);
  if (manifestUrl && !/^https:\/\//.test(manifestUrl)) throw new SkillProtocolError('distribution', 'distribution.manifest_url 必须是 HTTPS 地址');
  if (distribution.channel === 'oss' && !manifestUrl) throw new SkillProtocolError('distribution', 'OSS Skill 必须声明 manifest_url');
  if (distribution.uninstall_policy !== 'remove-skill-assets-keep-private-data') throw new SkillProtocolError('distribution', 'distribution.uninstall_policy 无效');

  if (!Array.isArray(root.assets) || root.assets.length > 100) throw new SkillProtocolError('schema', 'assets 无效');
  const assets = root.assets.map(validateAsset);
  const assetIds = assets.map((asset) => asset.id);
  if (new Set(assetIds).size !== assetIds.length) throw new SkillProtocolError('schema', 'asset id 不能重复');
  if (entry.adapter && !assetIds.includes(String(entry.adapter))) throw new SkillProtocolError('compatibility', 'entry.adapter 必须指向 assets 中的资产');
  if (entry.instructions && !assetIds.includes(String(entry.instructions))) throw new SkillProtocolError('compatibility', 'entry.instructions 必须指向 assets 中的资产');

  const provenance = asObject(root.provenance, 'provenance');
  exactKeys(provenance, ['source', 'license', 'released_at'], 'provenance');
  text(provenance.source, 'provenance.source', 500);
  text(provenance.license, 'provenance.license', 120);
  if (Number.isNaN(Date.parse(text(provenance.released_at, 'provenance.released_at', 40)))) throw new SkillProtocolError('schema', 'provenance.released_at 无效');

  if (root.signature !== undefined) {
    const signature = asObject(root.signature, 'signature');
    exactKeys(signature, ['algorithm', 'key_id', 'value'], 'signature');
    if (signature.algorithm !== 'ed25519') throw new SkillProtocolError('signature', '只支持 ed25519 签名');
    text(signature.key_id, 'signature.key_id', 128);
    text(signature.value, 'signature.value', 256);
  }
  return value as SkillManifest;
}

export function safeSkillManifestUrl(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new SkillProtocolError('url', 'Manifest 地址无效'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new SkillProtocolError('url', 'Manifest 必须使用无凭据 HTTPS 地址');
  return url.toString();
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const base64Bytes = (value: string): Uint8Array => {
  try {
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  } catch { throw new SkillProtocolError('signature', '签名不是有效 Base64'); }
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Detached signature covers the canonical manifest without its signature field. */
export async function verifySkillSignature(manifest: SkillManifest, trustedKeys: Record<string, string>): Promise<boolean> {
  if (!manifest.signature) return true;
  const publicKey = trustedKeys[manifest.signature.key_id];
  if (!publicKey) throw new SkillProtocolError('signature', `签名密钥 ${manifest.signature.key_id} 不受信任`);
  const unsigned = { ...manifest } as SkillManifest;
  delete unsigned.signature;
  const payload = new TextEncoder().encode(stableJson(unsigned));
  try {
    const key = await crypto.subtle.importKey('raw', base64Bytes(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, base64Bytes(manifest.signature.value), payload);
  } catch (error) {
    throw new SkillProtocolError('signature', `签名校验失败：${String(error)}`);
  }
}

export const skillProtocolErrorMessage = (error: unknown): string => error instanceof SkillProtocolError ? error.message : String(error);
