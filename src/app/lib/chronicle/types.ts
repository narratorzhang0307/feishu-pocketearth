export type KnowledgeTopic = 'ai' | 'technology' | 'finance' | 'climate' | 'science' | 'health' | 'culture' | 'policy';
export type KnowledgeVerdict = 'supported' | 'refuted' | 'mixed' | 'insufficient';
export type KnowledgeMode = 'live' | 'offline' | 'unavailable';

export interface KnowledgeSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  snippet: string;
  origin: string;
  stance: 'support' | 'refute' | 'context';
  reliability: number;
  reason: string;
}

export interface KnowledgeRecord {
  id: string;
  topic: KnowledgeTopic;
  createdAt: string;
  mode: KnowledgeMode;
  claim: string;
  verdict: KnowledgeVerdict;
  truthScore: number;
  confidence: number;
  summary: string;
  sources: KnowledgeSource[];
  commitment: {
    claimKey: string;
    evidenceRoot: string;
    recordHash: string;
    scorePolicyHash: string;
  };
}

export interface DailyKnowledgeEdition {
  schema: 'pocket-earth-public-knowledge-edition/v1';
  date: string;
  day: number;
  factCount: number;
  factsRoot: string;
  manifestHash: string;
  policyRoot: string;
  previousEditionRoot: string;
  editionRoot: string;
  revision: number;
  anchor?: null;
}

export interface DailyKnowledgeResponse {
  mode: KnowledgeMode;
  topic: KnowledgeTopic;
  generatedAt: string;
  records: KnowledgeRecord[];
  edition: DailyKnowledgeEdition | null;
}
