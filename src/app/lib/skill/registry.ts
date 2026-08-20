import { safeSkillManifestUrl, skillProtocolErrorMessage, validateSkillManifest, verifySkillSignature } from './protocol';
import { skillKeyOf, type InstalledSkill, type SkillInstallStatus } from './types';

const STORAGE_KEY = 'pe.skillRegistry.v1';
const MANIFEST_MAX_BYTES = 512 * 1024;

interface PersistedRegistry {
  skills: InstalledSkill[];
  active: Record<string, string>;
}

const empty = (): PersistedRegistry => ({ skills: [], active: {} });
const load = (): PersistedRegistry => {
  try {
    if (typeof localStorage === 'undefined') return empty();
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || !Array.isArray(value.skills) || !value.active || typeof value.active !== 'object') return empty();
    return value as PersistedRegistry;
  } catch { return empty(); }
};

let state = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const persist = () => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  emit();
};

function setStatus(key: string, status: SkillInstallStatus, error = '') {
  state = { ...state, skills: state.skills.map((skill) => skill.key === key ? { ...skill, status, error } : skill) };
  persist();
}

function previousEquipped(id: string): InstalledSkill | undefined {
  const key = state.active[id];
  return key ? state.skills.find((skill) => skill.key === key) : undefined;
}

export const subscribeSkillsRegistry = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const listInstalledSkills = (): InstalledSkill[] => [...state.skills];
export const getInstalledSkill = (key: string): InstalledSkill | undefined => state.skills.find((skill) => skill.key === key);
export const getEquippedSkill = (id: string): InstalledSkill | undefined => previousEquipped(id);

export function installSkillManifest(manifestValue: unknown, source = 'inline'): InstalledSkill {
  const manifest = validateSkillManifest(manifestValue);
  const key = skillKeyOf(manifest);
  const existing = getInstalledSkill(key);
  if (existing) return existing;
  const prior = previousEquipped(manifest.identity.id);
  const installed: InstalledSkill = {
    key,
    manifest,
    status: 'installed',
    installedAt: new Date().toISOString(),
    source,
    previousKey: prior?.key,
  };
  state = { ...state, skills: [installed, ...state.skills] };
  persist();
  return installed;
}

export async function installSkillFromUrl(input: string, trustedKeys: Record<string, string> = {}): Promise<InstalledSkill> {
  const url = safeSkillManifestUrl(input);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Manifest 下载失败：${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MANIFEST_MAX_BYTES) throw new Error('Manifest 超过 512KB 限制');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MANIFEST_MAX_BYTES) throw new Error('Manifest 超过 512KB 限制');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Manifest 不是有效 JSON'); }
  const manifest = validateSkillManifest(value);
  if (!await verifySkillSignature(manifest, trustedKeys)) throw new Error('Skill Manifest 签名无效');
  return installSkillManifest(manifest, url);
}

export function equipSkill(key: string): InstalledSkill {
  const skill = getInstalledSkill(key);
  if (!skill) throw new Error('Skill 尚未安装');
  if (skill.manifest.assets.some((asset) => !asset.optional) && !skill.assetsVerifiedAt) {
    throw new Error('Skill 必需资产尚未完成 SHA256 校验');
  }
  const id = skill.manifest.identity.id;
  const former = previousEquipped(id);
  state = {
    active: { ...state.active, [id]: key },
    skills: state.skills.map((item) => item.key === key
      ? { ...item, status: 'equipped', error: '' }
      : item.key === former?.key ? { ...item, status: 'installed' } : item),
  };
  persist();
  return getInstalledSkill(key)!;
}

export function disableSkill(id: string): void {
  const equipped = previousEquipped(id);
  if (!equipped) return;
  const active = { ...state.active };
  delete active[id];
  state = { active, skills: state.skills.map((skill) => skill.key === equipped.key ? { ...skill, status: 'disabled' } : skill) };
  persist();
}

export function rollbackSkill(id: string): InstalledSkill {
  const current = previousEquipped(id);
  const previousKey = current?.previousKey;
  if (!current || !previousKey || !getInstalledSkill(previousKey)) throw new Error('没有可回滚版本');
  return equipSkill(previousKey);
}

export function uninstallSkill(key: string): void {
  const skill = getInstalledSkill(key);
  if (!skill) return;
  const active = { ...state.active };
  if (active[skill.manifest.identity.id] === key) delete active[skill.manifest.identity.id];
  state = { active, skills: state.skills.filter((item) => item.key !== key) };
  persist();
}

export function markSkillStatus(key: string, status: SkillInstallStatus, error?: unknown) {
  setStatus(key, status, error ? skillProtocolErrorMessage(error) : '');
}

export function markSkillAssetsVerified(key: string): void {
  state = {
    ...state,
    skills: state.skills.map((skill) => skill.key === key
      ? { ...skill, status: 'installed', assetsVerifiedAt: new Date().toISOString(), error: '' }
      : skill),
  };
  persist();
}

export function resetSkillRegistryForTests() {
  state = empty();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* tests */ }
  emit();
}
