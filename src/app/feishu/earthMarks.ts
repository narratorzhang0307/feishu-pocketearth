import { getUserMarksByKind } from '../data/userMarks';
import { markPlace } from '../lib/skills/markPlace';
import type { FeishuTask, ReviewedLocation } from './types';

export type PinnedFeishuLocation = { latitude: number; longitude: number; label: string };

export function pinFeishuLocations(task: FeishuTask, locations: ReviewedLocation[]): PinnedFeishuLocation[] {
  const existing = new Set(getUserMarksByKind('custom').map((mark) => mark.id));
  const pinned: PinnedFeishuLocation[] = [];
  for (const location of locations) {
    if (!location.approved || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const key = `${task.taskId}-${location.id}`;
    const id = `feishu-${key}`;
    markPlace({
      kind: 'custom', prefix: 'feishu-', key,
      label: location.modernName || location.nameAsWritten,
      geo: { lat: latitude, lng: longitude }, amp: 0,
      meta: {
        agentName: task.orchestration?.skillName || '飞书知识', emoji: '🌍', domain: task.orchestration?.skillId || 'feishu', color: '#00ff88',
        skillId: task.orchestration?.skillId || '', outputSchema: task.orchestration?.outputSchema || '',
        note: location.description, place: location.modernName || location.nameAsWritten,
        evidence: location.evidence, page: location.page, confidence: location.confidence,
        taskId: task.taskId, sourceDocumentUrl: task.sourceDocumentUrl || task.outputs.document?.url || '',
        date: new Date().toISOString().slice(0, 10),
      },
    });
    if (!existing.has(id)) existing.add(id);
    pinned.push({ latitude, longitude, label: location.modernName || location.nameAsWritten });
  }
  return pinned;
}
