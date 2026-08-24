export type FeishuConfig = {
  appId: string;
  bitableAppUrl: string;
  configured: boolean;
  devBypassAuth: boolean;
  maxUploadBytes: number;
  acceptedTypes: string[];
  integrations: { ocr: boolean; qwen: boolean; document: boolean; bitable: boolean; bitableLibrary: boolean };
  bitableDomains: Partial<Record<FeishuLibraryDomain, boolean>>;
  skills: FeishuSkillAdapter[];
};

export type FeishuLibraryDomain = 'books' | 'movies' | 'music' | 'photos';

export type FeishuLibraryDomainData = {
  domain: FeishuLibraryDomain;
  schema: string;
  version: string;
  records: unknown[];
  rejected: Array<{ recordId: string; error: string }>;
  pending: Array<{ recordId: string; status: string }>;
  syncedAt: string;
};

export type FeishuLibrarySnapshot = {
  domains: Partial<Record<FeishuLibraryDomain, FeishuLibraryDomainData>>;
  configuredDomains: FeishuLibraryDomain[];
  syncedAt: string;
};

export type FeishuLibraryVersions = {
  domains: Partial<Record<FeishuLibraryDomain, { version: string; count: number; rejected: number; pending: number; syncedAt: string }>>;
  configuredDomains: FeishuLibraryDomain[];
};

export type FeishuSkillAdapter = {
  id: string;
  name: string;
  target: string;
  description: string;
  outputSchema: string;
  adapterVersion: string;
  requiresConfirmation: boolean;
};

export type FeishuOrchestration = {
  engine: 'frost';
  mode: 'single';
  source: 'explicit' | 'local-rule';
  summary: string;
  objective: string;
  skillId: string;
  skillName: string;
  target: string;
  outputSchema: string;
  adapterVersion: string;
  requiresConfirmation: boolean;
};

export type FeishuUser = {
  openId: string;
  name: string;
  avatarUrl?: string;
};

export type ExtractedLocation = {
  id: string;
  nameAsWritten: string;
  modernName: string;
  description: string;
  page: number;
  evidence: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  reviewStatus: 'pending' | 'approved' | 'rejected';
};

export type FeishuTaskStatus =
  | 'queued'
  | 'ocr_running'
  | 'qwen_running'
  | 'awaiting_review'
  | 'writing_back'
  | 'completed'
  | 'failed';

export type FeishuTask = {
  taskId: string;
  fileName: string;
  sourceType: 'pdf' | 'image' | 'feishu_document';
  sourceDocumentId?: string;
  sourceDocumentUrl?: string;
  orchestration?: FeishuOrchestration;
  sha256: string;
  workflowVersion: string;
  createdAt: string;
  updatedAt: string;
  status: FeishuTaskStatus;
  progress: { current: number; total: number; label: string };
  locations: ExtractedLocation[];
  outputs: {
    document?: { documentId: string; url: string };
    documentBlocksWritten?: boolean;
    bitable?: { skipped?: boolean; reason?: string };
    notification?: { skipped?: boolean; reason?: string; messageId?: string } | null;
  };
  error: string | null;
  attempt: number;
  retryStage?: 'analysis' | 'writeback' | null;
  sourceRequired?: boolean;
};

export type ReviewedLocation = ExtractedLocation & { approved: boolean };
