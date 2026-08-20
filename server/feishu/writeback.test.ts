import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Runtime module is intentionally shared as plain ESM.
import { createFeishuWriteback } from './writeback.mjs';

const location = {
  id: 'location-1',
  nameAsWritten: '杭州西湖',
  modernName: '西湖',
  description: '杭州代表性湖泊',
  page: 1,
  evidence: '游览杭州西湖',
  latitude: 30.25,
  longitude: 120.15,
  confidence: 0.95,
  reviewStatus: 'approved',
};

describe('Feishu writeback checkpoints', () => {
  it('resumes after completed document steps without duplicating writes', async () => {
    const client = {
      createDocument: vi.fn(),
      appendDocumentBlocks: vi.fn(),
      createBitableRecords: vi.fn(async () => ({ created: 1 })),
      sendInteractiveCard: vi.fn(async () => ({ messageId: 'message-1' })),
    };
    const writeback = createFeishuWriteback({ client, config: { webBaseUrl: 'http://localhost:4173' } });
    const checkpoint = vi.fn();
    const task = {
      taskId: 'task-1',
      openId: 'open-1',
      fileName: '旅行.pdf',
      createdAt: '2026-08-20T00:00:00.000Z',
      workflowVersion: 'test-v1',
      sha256: 'sha256',
      outputs: {
        document: { documentId: 'doc-existing', url: 'https://example.feishu.cn/docx/doc-existing' },
        documentBlocksWritten: true,
      },
    };

    const outputs = await writeback.write(task, [location], checkpoint);
    expect(client.createDocument).not.toHaveBeenCalled();
    expect(client.appendDocumentBlocks).not.toHaveBeenCalled();
    expect(client.createBitableRecords).toHaveBeenCalledOnce();
    expect(client.sendInteractiveCard).toHaveBeenCalledOnce();
    expect(checkpoint).toHaveBeenCalledTimes(2);

    client.createBitableRecords.mockClear();
    client.sendInteractiveCard.mockClear();
    checkpoint.mockClear();
    await writeback.write({ ...task, outputs }, [location], checkpoint);
    expect(client.createBitableRecords).not.toHaveBeenCalled();
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
  });
});
