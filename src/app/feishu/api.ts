import type { FeishuConfig, FeishuLibraryDomain, FeishuLibraryDomainData, FeishuLibrarySnapshot, FeishuLibraryVersions, FeishuPersonalWorkspace, FeishuTask, FeishuUser, ReviewedLocation } from './types';
import { requestFeishuAuthCode } from './bridge';

const SESSION_KEY = 'pocket-earth.feishu.session.v1';
const WORKSPACE_KEY = 'pocket-earth.feishu.workspace.v1';
let sessionToken = typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(SESSION_KEY) || '';
let reauthentication: Promise<void> | null = null;
let activeFeishuOpenId = '';

type StoredFeishuWorkspace = Pick<FeishuPersonalWorkspace, 'appToken' | 'tables'> & { ownerOpenId: string };

function storedFeishuWorkspace(): StoredFeishuWorkspace | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null') as Partial<StoredFeishuWorkspace> | null;
    return value?.ownerOpenId && value.appToken && value.tables ? value as StoredFeishuWorkspace : undefined;
  } catch { return undefined; }
}

function rememberFeishuWorkspace(workspace: FeishuPersonalWorkspace) {
  if (typeof localStorage === 'undefined' || !activeFeishuOpenId || !workspace?.appToken) return;
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ ownerOpenId: activeFeishuOpenId, appToken: workspace.appToken, tables: workspace.tables }));
}

function clearFeishuSession() {
  sessionToken = '';
  activeFeishuOpenId = '';
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
}

function notifyFeishuSessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pocket-earth:feishu-session-expired'));
}

async function request<T>(path: string, init: RequestInit = {}, allowReauthentication = true): Promise<T> {
  if (typeof sessionStorage !== 'undefined') {
    sessionToken = sessionStorage.getItem(SESSION_KEY) || sessionToken;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal,
      headers: {
        ...(init.body ? { 'content-type': 'application/json; charset=utf-8' } : {}),
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        ...init.headers,
      },
    });
  } finally {
    window.clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/feishu/session' && path !== '/api/feishu/auth') {
      clearFeishuSession();
      if (allowReauthentication) {
        try {
          await reauthenticateFeishuSession();
          return request<T>(path, init, false);
        } catch (error) {
          notifyFeishuSessionExpired();
          if (error instanceof Error) throw error;
          throw new Error('feishu_reauthentication_failed');
        }
      }
      notifyFeishuSessionExpired();
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function reauthenticateFeishuSession() {
  if (!reauthentication) {
    reauthentication = (async () => {
      const config = await getFeishuConfig();
      if (config.devBypassAuth) await authenticateFeishu({ devBypass: true });
      else await authenticateFeishu({ code: await requestFeishuAuthCode(config.appId) });
    })().finally(() => { reauthentication = null; });
  }
  return reauthentication;
}

export async function getFeishuConfig() {
  return request<FeishuConfig>('/api/feishu/config');
}

export async function authenticateFeishu(input: { code?: string; devBypass?: boolean }) {
  const workspace = storedFeishuWorkspace();
  const result = await request<{ sessionToken: string; user: FeishuUser; expiresAt: number; workspace: FeishuPersonalWorkspace }>('/api/feishu/auth', {
    method: 'POST', body: JSON.stringify({ ...input, workspace, workspaceOwner: workspace?.ownerOpenId }),
  });
  sessionToken = result.sessionToken;
  activeFeishuOpenId = result.user.openId;
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_KEY, sessionToken);
  rememberFeishuWorkspace(result.workspace);
  return result;
}

export async function resumeFeishuSession() {
  const result = await request<{ user: FeishuUser; expiresAt: number; workspace: FeishuPersonalWorkspace }>('/api/feishu/session');
  activeFeishuOpenId = result.user.openId;
  rememberFeishuWorkspace(result.workspace);
  return result;
}

export async function ensureFeishuSession() {
  try { return await resumeFeishuSession(); }
  catch {
    const config = await getFeishuConfig();
    return config.devBypassAuth
      ? authenticateFeishu({ devBypass: true })
      : authenticateFeishu({ code: await requestFeishuAuthCode(config.appId) });
  }
}

export async function getFeishuLibrary() {
  return request<FeishuLibrarySnapshot>('/api/feishu/library');
}

export async function getFeishuLibraryVersions() {
  return request<FeishuLibraryVersions>('/api/feishu/library/versions');
}

export async function getFeishuLibraryDomain(domain: FeishuLibraryDomain) {
  return request<FeishuLibraryDomainData>(`/api/feishu/library/${domain}`);
}

export async function requestFeishuLibrarySync(domains?: FeishuLibraryDomain[]) {
  return request<{ ok: boolean; snapshot: FeishuLibrarySnapshot }>('/api/feishu/library/sync', {
    method: 'POST', body: JSON.stringify(domains?.length ? { domains } : {}),
  });
}

export type FeishuLibraryBootstrapResult = {
  ok: boolean;
  appToken: string;
  appUrl: string;
  createdApp: boolean;
  tables: Record<FeishuLibraryDomain, { tableId: string; name: string }>;
  createdTables: FeishuLibraryDomain[];
  createdFields: Array<{ domain: FeishuLibraryDomain; fieldName: string }>;
  guideDocument?: { documentId: string; url: string } | null;
  workspace: FeishuPersonalWorkspace;
};

export async function bootstrapFeishuLibrary() {
  const result = await request<FeishuLibraryBootstrapResult>('/api/feishu/library/bootstrap', {
    method: 'POST', body: JSON.stringify({}),
  });
  rememberFeishuWorkspace(result.workspace);
  return result;
}

export async function upsertFeishuLibraryRecords(
  domain: FeishuLibraryDomain,
  records: unknown[],
  options: { status?: '待分析' | '分析中' | '待确认' | '已确认' | '分析失败'; source?: string; duplicatePolicy?: 'warn' | 'update' } = {},
) {
  const result = await request<{ created: number; updated: number; alreadyExists: Array<{ pocketId: string; title: string }>; previousVersion: string; domain: FeishuLibraryDomain; schema: string; tableUrl: string; workspace: FeishuPersonalWorkspace }>(`/api/feishu/library/${domain}/records`, {
    method: 'POST', body: JSON.stringify({ records, ...options }),
  });
  rememberFeishuWorkspace(result.workspace);
  return result;
}

export async function deleteFeishuLibraryRecords(domain: FeishuLibraryDomain, pocketIds: string[]) {
  return request<{ deleted: number; domain: FeishuLibraryDomain; tableUrl: string }>(`/api/feishu/library/${domain}/records`, {
    method: 'DELETE', body: JSON.stringify({ pocketIds }),
  });
}

export type FeishuPhotoReview = {
  id: string;
  recommendation: 'keep' | 'review' | 'reject';
  qualityScore: number;
  storyScore: number;
  summary: string;
  reasons: string[];
  location?: {
    placeName: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    confidence: number;
    evidence: string;
  };
};

export async function reviewFeishuPhotos(photos: Array<{
  id: string;
  image: string;
  technicalQuality: number;
  tags: string[];
  fileName: string;
}>) {
  return request<{ model: string; reviews: FeishuPhotoReview[] }>('/api/feishu/photos/review', {
    method: 'POST', body: JSON.stringify({ photos }),
  });
}

export async function createFeishuTask(input: { fileName: string; mimeType: string; sourceBase64: string }) {
  return request<{ task: FeishuTask; reused: boolean }>('/api/feishu/tasks', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export async function createFeishuDocumentTask(documentUrl: string, skillId?: string) {
  return request<{ task: FeishuTask; reused: boolean }>('/api/feishu/tasks/from-document', {
    method: 'POST', body: JSON.stringify({ documentUrl, skillId }),
  });
}

export async function getFeishuTask(taskId: string) {
  return request<{ task: FeishuTask }>(`/api/feishu/tasks/${encodeURIComponent(taskId)}`);
}

export async function writeBackFeishuTask(taskId: string, locations: ReviewedLocation[]) {
  return request<{ task: FeishuTask }>('/api/feishu/writeback', {
    method: 'POST', body: JSON.stringify({ taskId, locations }),
  });
}

export async function retryFeishuTask(taskId: string) {
  return request<{ task: FeishuTask }>(`/api/feishu/tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
}
