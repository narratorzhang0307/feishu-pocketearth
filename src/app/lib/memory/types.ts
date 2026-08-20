export type MemoryKind = 'self' | 'episodic' | 'semantic' | 'procedural';

export type MemoryTier = 'working' | 'short-term' | 'long-term';

export interface MemoryEvidence {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
}
export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  tier: MemoryTier;
  content: string;
  summary: string;
  topic?: string;
  recordedAt: string;
  trustScore?: number;
  evidence?: MemoryEvidence[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MemoryStore {
  readonly kind: MemoryKind;
  retrieve(query: string): Promise<MemoryEntry[]>;
}

export interface MemoryRecall {
  block: string;
  lanes: MemoryKind[];
  entries: MemoryEntry[];
  trace: string[];
}
