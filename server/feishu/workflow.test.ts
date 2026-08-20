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
    expect(store.getInternal(first.task.taskId)._private.source).toBeNull();
    const completed = await workflow.confirmAndWrite(first.task.taskId, reviewTask!.locations.map((location: { id: string; modernName: string; description: string; latitude: number; longitude: number }) => ({ ...location, approved: true })));
    expect(completed).toMatchObject({ taskId: first.task.taskId, status: 'completed' });
    expect(JSON.stringify(completed)).not.toContain('server-only-token');
    expect(store.getInternal(first.task.taskId)._private.userAccessToken).toBe('');

    const duplicate = await workflow.createTask({ identity, source, userAccessToken: 'another-token' });
    expect(duplicate).toMatchObject({ reused: true, task: { taskId: first.task.taskId } });
    expect(store.getInternal(first.task.taskId)._private.userAccessToken).toBe('');
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

  it('reopens the review stage after a writeback failure without repeating OCR or Qwen', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-writeback-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'test-v3' });
    await store.init();
    let ocrCalls = 0;
    let extractCalls = 0;
    const workflow = createFeishuWorkflow({
      store,
      ocr: { recognize: async () => { ocrCalls += 1; return { engine: 'ocr', pages: [{ page: 1, text: '杭州西湖' }] }; } },
      extractor: { extract: async () => { extractCalls += 1; return { model: 'qwen-test', locations: [{ id: 'location-1', nameAsWritten: '杭州西湖', modernName: '西湖', description: '', page: 1, evidence: '杭州西湖', latitude: 30.25, longitude: 120.15, confidence: 0.9, reviewStatus: 'pending' }] }; } },
      writeback: { notifyReview: async () => ({}), write: async () => { throw new Error('feishu_document_unavailable'); } },
    });
    const created = await workflow.createTask({ identity, source });
    const review = await eventually(() => store.get(created.task.taskId), (task) => task?.status === 'awaiting_review');
    await expect(workflow.confirmAndWrite(created.task.taskId, review!.locations.map((location: { id: string }) => ({ ...location, approved: true })))).rejects.toThrow('feishu_document_unavailable');
    expect(store.get(created.task.taskId)).toMatchObject({ status: 'failed', retryStage: 'writeback' });

    const reopened = await workflow.retry(created.task.taskId);
    expect(reopened).toMatchObject({ status: 'awaiting_review', retryStage: 'writeback' });
    expect({ ocrCalls, extractCalls }).toEqual({ ocrCalls: 1, extractCalls: 1 });
  });
});
