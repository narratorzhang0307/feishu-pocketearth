// 自定义 agent 工厂 · 行动层（suggest-then-confirm）。
// 确认才写 userMarks(kind:'custom')：全信息塞进 meta（agent 身份 + 标签 + 落点说明），
// 地球永远只认识「custom」这一类、不学习任何具体自定义 agent → 最大化解耦。
// 不喂长期画像（'custom' 不在 ProfileDomain 封闭枚举内，绝不动内核枚举）。镜像 lib/book/pin.ts 的范式。
import { markPlace, isPinned, unmarkPlace } from '../skills/markPlace';
import type { AgentManifest } from './manifest';
import type { CustomDraft } from './engine';

const PREFIX = 'uca-';   // user custom agent

export function alreadyPinned(draft: CustomDraft): boolean { return isPinned('custom', PREFIX, draft.id); }

export function confirmPin(manifest: AgentManifest, draft: CustomDraft): { pinned: boolean; reason?: string } {
  return markPlace({
    kind: 'custom', prefix: PREFIX, key: draft.id, label: draft.label, amp: 0.5,
    geo: draft.geo ? { lat: draft.geo.lat, lng: draft.geo.lng } : null,
    meta: {
      agentId: manifest.id, agentName: manifest.name, emoji: manifest.emoji, domain: manifest.domain, color: manifest.color,
      tags: draft.tags, note: draft.note, place: draft.geo?.place, strategy: draft.geo?.strategy,
      date: new Date().toISOString().slice(0, 10),
    },
  });
}

export function unpin(draft: CustomDraft): void { unmarkPlace('custom', PREFIX, draft.id); }
