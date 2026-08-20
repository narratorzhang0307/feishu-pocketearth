export const SKILL_PROTOCOL = 'pocket-skill/v1' as const;
export const SKILL_RUNTIME_VERSION = '1.0.0';

export type SkillKind = 'markdown' | 'lora' | 'hybrid';
export type SkillExecution = 'declarative' | 'mnn';
export type SkillPlatform = 'web' | 'android-arm64';
export type SkillScope = 'location' | 'photos' | 'audio' | 'network' | 'clipboard' | 'public-sources';
export type SkillTool = 'enrich' | 'geocode' | 'edge_tag' | 'mark_place' | 'data_pack' | 'vision' | 'restore';
export type SkillFallbackStep = 'adapter' | 'base' | 'rules' | 'user-confirmation' | 'stop';

export interface SkillIdentity {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

export interface SkillAsset {
  id: string;
  role: 'instructions' | 'adapter' | 'model' | 'example' | 'avatar' | 'other';
  media_type: string;
  bytes: number;
  sha256: string;
  url: string;
  optional?: boolean;
}

export interface SkillManifest {
  protocol: typeof SKILL_PROTOCOL;
  identity: SkillIdentity;
  kind: SkillKind;
  entry: {
    target: string;
    instructions?: string;
    adapter?: string;
  };
  runtime: {
    execution: SkillExecution;
    runtime_min: string;
    platforms: SkillPlatform[];
    base?: {
      id: string;
      revision: string;
      sha256: string;
    };
  };
  permissions: {
    scopes: SkillScope[];
    tools: SkillTool[];
    network_hosts: string[];
  };
  data: {
    schemas: string[];
  };
  quality_gate: {
    policy_id: string;
    checks: string[];
  };
  fallback: {
    order: SkillFallbackStep[];
  };
  evaluation: {
    suite: string;
    passed: boolean;
    score: number;
    threshold: number;
    tested_at: string;
  };
  distribution: {
    channel: 'builtin' | 'oss' | 'private';
    manifest_url: string;
    uninstall_policy: 'remove-skill-assets-keep-private-data';
  };
  assets: SkillAsset[];
  provenance: {
    source: string;
    license: string;
    released_at: string;
  };
  signature?: {
    algorithm: 'ed25519';
    key_id: string;
    value: string;
  };
}

export type SkillInstallStatus =
  | 'not-installed'
  | 'downloading'
  | 'verifying'
  | 'installed'
  | 'equipped'
  | 'disabled'
  | 'failed'
  | 'update-available';

export interface InstalledSkill {
  key: string;
  manifest: SkillManifest;
  status: SkillInstallStatus;
  installedAt: string;
  source: string;
  previousKey?: string;
  assetsVerifiedAt?: string;
  error?: string;
}

export const skillKeyOf = (manifest: SkillManifest): string => `${manifest.identity.id}@${manifest.identity.version}`;
