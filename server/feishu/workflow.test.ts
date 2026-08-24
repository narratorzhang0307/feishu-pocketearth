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
    let writebackToken = '';
    const workflow = createFeishuWorkflow({
      store,
      ocr: { recognize: async () => ({ engine: 'real-test-adapter', pages: [{ page: 1, text: '杭州西湖' }] }) },
      extractor: { extract: async () => ({ model: 'qwen-test', locations: [{ id: 'location-1', nameAsWritten: '杭州西湖', modernName: '西湖', description: '', page: 1, evidence: '杭州西湖', latitude: 30.25, longitude: 120.15, confidence: 0.9, reviewStatus: 'pending' }] }) },
      writeback: { notifyReview: async () => ({ ok: true }), write: async (task: { taskId: string; _private?: { userAccessToken?: string } }) => { writebackToken = task._private?.userAccessToken || ''; return { document: { documentId: `doc-${task.taskId}`, url: 'https://feishu.cn/docx/test' } }; } },
    });
    const first = await workflow.createTask({ identity, source, userAccessToken: 'server-only-token' });
    const reviewTask = await eventually(() => store.get(first.task.taskId), (task) => task?.status === 'awaiting_review');
    expect(reviewTask?.taskId).toBe(first.task.taskId);
    expect(store.getInternal(first.task.taskId)._private.source).toBeNull();
    const completed = await workflow.confirmAndWrite(first.task.taskId, reviewTask!.locations.map((location: { id: string; modernName: string; description: string; latitude: number; longitude: number }) => ({ ...location, approved: true })), 'refreshed-user-token');
    expect(completed).toMatchObject({ taskId: first.task.taskId, status: 'completed' });
    expect(writebackToken).toBe('refreshed-user-token');
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

  it('uses authenticated Feishu document text directly without OCR', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-doc-test-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'test-doc-v1' });
    await store.init();
    let ocrCalls = 0;
    let routedSkill = '';
    const workflow = createFeishuWorkflow({
      store,
      ocr: { recognize: async () => { ocrCalls += 1; throw new Error('must_not_run'); } },
      extractor: { extract: async (pages: Array<{ text: string }>, orchestration: { skillId?: string }) => { routedSkill = orchestration?.skillId || ''; return { model: 'qwen-test', locations: [{ id: 'location-1', nameAsWritten: pages[0].text, modernName: '西湖', description: '', page: 1, evidence: pages[0].text, latitude: 30.25, longitude: 120.15, confidence: 0.9, reviewStatus: 'pending' }] }; } },
      writeback: { notifyReview: async () => ({}), write: async () => ({}) },
    });
    const created = await workflow.createTask({
      identity,
      userAccessToken: 'server-only-token',
      orchestration: { engine: 'frost', skillId: 'pocket.book-to-earth', skillName: 'Book-to-Earth', outputSchema: 'pocket.mapping/v1', adapterVersion: 'feishu-docx-v1' },
      source: { fileName: '杭州游记', mimeType: 'application/x-feishu-document', documentId: 'doc-source', sourceUrl: 'https://example.feishu.cn/docx/doc-source', pages: [{ page: 1, text: '杭州西湖', confidence: 1 }] },
    });
    const review = await eventually(() => store.get(created.task.taskId), (task) => task?.status === 'awaiting_review');
    expect(ocrCalls).toBe(0);
    expect(routedSkill).toBe('pocket.book-to-earth');
    expect(review).toMatchObject({ sourceType: 'feishu_document', sourceDocumentId: 'doc-source', orchestration: { engine: 'frost', skillId: 'pocket.book-to-earth' }, inference: { skillId: 'pocket.book-to-earth', outputSchema: 'pocket.mapping/v1' }, ocr: { engine: 'feishu-docx-raw-content' }, locations: [{ evidence: '杭州西湖' }] });
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
