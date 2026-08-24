import { afterEach, describe, expect, it } from 'vitest';
import { getUserMarksByKind, removeUserMark } from '../data/userMarks';
import { pinFeishuLocations } from './earthMarks';
import type { FeishuTask, ReviewedLocation } from './types';

const task = {
  taskId: 'task-1', fileName: '杭州游记', sourceType: 'feishu_document', sha256: 'sha', workflowVersion: 'v1',
  createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z', status: 'completed',
  progress: { current: 4, total: 4, label: '完成' }, locations: [], outputs: {}, error: null, attempt: 1,
  sourceDocumentUrl: 'https://example.feishu.cn/docx/source-doc',
  orchestration: { engine: 'frost', mode: 'single', source: 'explicit', summary: 'route', objective: 'extract', skillId: 'pocket.book-to-earth', skillName: 'Book-to-Earth', target: 'agent-forge', outputSchema: 'pocket.mapping/v1', adapterVersion: 'v1', requiresConfirmation: true },
} satisfies FeishuTask;

const location = {
  id: 'location-1', nameAsWritten: '杭州西湖', modernName: '西湖', description: '文档中的目的地', page: 1,
  evidence: '我们在杭州西湖散步', latitude: 30.25, longitude: 120.15, confidence: 0.96,
  reviewStatus: 'pending', approved: true,
} satisfies ReviewedLocation;

afterEach(() => {
  getUserMarksByKind('custom').filter((mark) => mark.id.startsWith('feishu-task-1-')).forEach((mark) => removeUserMark(mark.id));
});

describe('Feishu knowledge points on the original Earth', () => {
  it('pins only approved locations with valid coordinates and stays idempotent', () => {
    pinFeishuLocations(task, [location, { ...location, id: 'rejected', approved: false }, { ...location, id: 'missing-geo', latitude: null }]);
    pinFeishuLocations(task, [location]);
    const marks = getUserMarksByKind('custom').filter((mark) => mark.id.startsWith('feishu-task-1-'));
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ id: 'feishu-task-1-location-1', label: '西湖', meta: { agentName: 'Book-to-Earth', skillId: 'pocket.book-to-earth', evidence: '我们在杭州西湖散步' } });
    expect(marks[0].lat).toBeCloseTo(30.25, 8);
    expect(marks[0].lng).toBeCloseTo(120.15, 8);
  });
});
