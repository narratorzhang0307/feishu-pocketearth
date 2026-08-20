import type { FeishuConfig, FeishuTask, FeishuUser, ReviewedLocation } from './types';

const SESSION_KEY = 'pocket-earth.feishu.session.v1';
let sessionToken = sessionStorage.getItem(SESSION_KEY) || '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export async function getFeishuConfig() {
  return request<FeishuConfig>('/api/feishu/config');
}

export async function authenticateFeishu(input: { code?: string; devBypass?: boolean }) {
  const result = await request<{ sessionToken: string; user: FeishuUser; expiresAt: number }>('/api/feishu/auth', {
    method: 'POST', body: JSON.stringify(input),
  });
  sessionToken = result.sessionToken;
  sessionStorage.setItem(SESSION_KEY, sessionToken);
  return result;
}

export async function createFeishuTask(input: { fileName: string; mimeType: string; sourceBase64: string }) {
  return request<{ task: FeishuTask; reused: boolean }>('/api/feishu/tasks', {
    method: 'POST', body: JSON.stringify(input),
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
