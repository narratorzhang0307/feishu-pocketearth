import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { FeishuTaskStore } from './task-store.mjs';

const identity = { tenantKey: 'tenant-persist', openId: 'open-persist', name: '持久化用户' };
const source = { fileName: '私密资料.pdf', mimeType: 'application/pdf', sourceBase64: 'c3VwZXItc2VjcmV0LWRvY3VtZW50' };

describe('Feishu task persistence', () => {
  it('persists audit metadata and results without raw files or user tokens', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-persist-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'persist-v1' });
    await store.init();
    const created = await store.create({ identity, source, userAccessToken: 'secret-user-token' });
    await store.update(created.task.taskId, { status: 'awaiting_review', locations: [{ id: 'location-1', evidence: '西湖' }] });

    const files = await readdir(path.join(dataDir, 'tasks'));
    const snapshot = await readFile(path.join(dataDir, 'tasks', files[0]), 'utf8');
    expect(snapshot).toContain('awaiting_review');
    expect(snapshot).not.toContain(source.sourceBase64);
    expect(snapshot).not.toContain('secret-user-token');

    const restored = new FeishuTaskStore({ dataDir, workflowVersion: 'persist-v1' });
    await restored.init();
    expect(restored.get(created.task.taskId)).toMatchObject({ status: 'awaiting_review', locations: [{ evidence: '西湖' }] });
  });

  it('fails an interrupted analysis closed and resumes only after the same source is reattached', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-resume-'));
    const first = new FeishuTaskStore({ dataDir, workflowVersion: 'persist-v2' });
    await first.init();
    const created = await first.create({ identity, source, userAccessToken: 'ephemeral-token' });
    await first.update(created.task.taskId, { status: 'qwen_running' });

    const restored = new FeishuTaskStore({ dataDir, workflowVersion: 'persist-v2' });
    await restored.init();
    expect(restored.get(created.task.taskId)).toMatchObject({ status: 'failed', error: 'source_reupload_required', sourceRequired: true });

    const resumed = await restored.create({ identity, source, userAccessToken: 'fresh-token' });
    expect(resumed).toMatchObject({ reused: true, resumed: true, task: { taskId: created.task.taskId, status: 'queued', sourceRequired: false } });
    expect(restored.getInternal(created.task.taskId)._private.userAccessToken).toBe('fresh-token');
  });

  it('keeps Skill routes in the audit snapshot and idempotency key', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'pe-feishu-skill-'));
    const store = new FeishuTaskStore({ dataDir, workflowVersion: 'persist-skill-v1' });
    await store.init();
    const book = await store.create({ identity, source, orchestration: { engine: 'frost', skillId: 'pocket.book-to-earth', skillName: 'Book-to-Earth', outputSchema: 'pocket.mapping/v1', adapterVersion: 'v1' } });
    const generic = await store.create({ identity, source });
    expect(book.task.taskId).not.toBe(generic.task.taskId);
    expect(book.task).toMatchObject({ orchestration: { engine: 'frost', skillId: 'pocket.book-to-earth' } });
  });
});
