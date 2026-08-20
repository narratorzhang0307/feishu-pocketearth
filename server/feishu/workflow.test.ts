import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { FeishuTaskStore } from './task-store.mjs';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuWorkflow } from './workflow.mjs';

const identity = { tenantKey: 'tenant-1', openId: 'open-1', name: '测试用户' };
const source = { fileName: '旅行.pdf', mimeType: 'application/pdf', sourceBase64: 'cmVhbC1ieXRlcw==' };

async function eventually<T>(read: () => T, predicate: (value: T) => boolean) {
  for (let index = 0; index < 30; index += 1) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('eventually_timeout');
}

describe('Feishu AI task workflow', () => {
  it('uses one task id across OCR, Qwen, review and Feishu writeback', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-test-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'test-v1' });
    await store.init();
    const workflow = createFeishuWorkflow({
      store,
      ocr: { recognize: async () => ({ engine: 'real-test-adapter', pages: [{ page: 1, text: '杭州西湖' }] }) },
      extractor: { extract: async () => ({ model: 'qwen-test', locations: [{ id: 'location-1', nameAsWritten: '杭州西湖', modernName: '西湖', description: '', page: 1, evidence: '杭州西湖', latitude: 30.25, longitude: 120.15, confidence: 0.9, reviewStatus: 'pending' }] }) },
      writeback: { notifyReview: async () => ({ ok: true }), write: async (task: { taskId: string }) => ({ document: { documentId: `doc-${task.taskId}`, url: 'https://feishu.cn/docx/test' } }) },
    });
    const first = await workflow.createTask({ identity, source, userAccessToken: 'server-only-token' });
    const reviewTask = await eventually(() => store.get(first.task.taskId), (task) => task?.status === 'awaiting_review');
    expect(reviewTask?.taskId).toBe(first.task.taskId);
    const completed = await workflow.confirmAndWrite(first.task.taskId, reviewTask!.locations.map((location: { id: string; modernName: string; description: string; latitude: number; longitude: number }) => ({ ...location, approved: true })));
    expect(completed).toMatchObject({ taskId: first.task.taskId, status: 'completed' });
    expect(JSON.stringify(completed)).not.toContain('server-only-token');

    const duplicate = await workflow.createTask({ identity, source, userAccessToken: 'another-token' });
    expect(duplicate).toMatchObject({ reused: true, task: { taskId: first.task.taskId } });
  });

  it('surfaces provider failures instead of creating fake locations', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-test-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'test-v2' });
    await store.init();
    const workflow = createFeishuWorkflow({
      store,
      ocr: { recognize: async () => { throw new Error('paddle_ocr_not_configured'); } },
      extractor: { extract: async () => { throw new Error('must_not_run'); } },
      writeback: { notifyReview: async () => ({}), write: async () => ({}) },
    });
    const created = await workflow.createTask({ identity, source });
    const failed = await eventually(() => store.get(created.task.taskId), (task) => task?.status === 'failed');
    expect(failed).toMatchObject({ status: 'failed', error: 'paddle_ocr_not_configured', locations: [] });
  });
});
