import type { MemoryEntry, MemoryStore } from './types';

export interface PublicSemanticOptions {
  fetcher?: typeof fetch;
  date?: string;
  maxTopics?: number;
  maxEntries?: number;
}
export function selectPublicKnowledgeTopics(query: string, limit?: number): string[];
export function retrievePublicSemanticMemory(query: string, options?: PublicSemanticOptions): Promise<MemoryEntry[]>;
export function formatPublicSemanticMemory(entries: MemoryEntry[]): string;
export const publicSemanticStore: MemoryStore;
