import type { FeishuConfig, FeishuLibraryDomain, FeishuLibraryDomainData, FeishuLibrarySnapshot, FeishuLibraryVersions, FeishuTask, FeishuUser, ReviewedLocation } from './types';
import { requestFeishuAuthCode } from './bridge';

const SESSION_KEY = 'pocket-earth.feishu.session.v1';
let sessionToken = typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(SESSION_KEY) || '';
let reauthentication: Promise<void> | null = null;

function clearFeishuSession() {
  sessionToken = '';
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
  const result = await request<{ sessionToken: string; user: FeishuUser; expiresAt: number }>('/api/feishu/auth', {
    method: 'POST', body: JSON.stringify(input),
  });
  sessionToken = result.sessionToken;
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_KEY, sessionToken);
  return result;
}

export async function resumeFeishuSession() {
  return request<{ user: FeishuUser; expiresAt: number }>('/api/feishu/session');
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
};

export async function bootstrapFeishuLibrary() {
  return request<FeishuLibraryBootstrapResult>('/api/feishu/library/bootstrap', {
    method: 'POST', body: JSON.stringify({}),
  });
}

export async function upsertFeishuLibraryRecords(
  domain: FeishuLibraryDomain,
  records: unknown[],
  options: { status?: '待分析' | '分析中' | '待确认' | '已确认' | '分析失败'; source?: string } = {},
) {
  return request<{ created: number; updated: number; previousVersion: string }>(`/api/feishu/library/${domain}/records`, {
    method: 'POST', body: JSON.stringify({ records, ...options }),
  });
}

export type FeishuPhotoReview = {
  id: string;
  recommendation: 'keep' | 'review' | 'reject';
  qualityScore: number;
  storyScore: number;
  summary: string;
  reasons: string[];
};

export async function reviewFeishuPhotos(photos: Array<{
  id: string;
  image: string;
  technicalQuality: number;
  tags: string[];
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
