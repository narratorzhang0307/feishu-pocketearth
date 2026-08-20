// 法庭（courtroom）升级 · 共享类型（解耦：council/courtroom 自成一体，旧 engine.ts 四模式零改动）。
// 架构见 workflow council-redesign 的设计 + 对抗校验 P0。核心：流水线庭审 + 结构化 Verdict 产物 + 判例库。
// 绝不 import / 改动 FROST 封闭枚举内核（router/validator/RadioAction）。

export type CourtRole = 'judge' | 'prosecutor' | 'defender' | 'juror' | 'clerk' | 'critic';
export type CourtStage = '立案' | '举证质证' | '法庭辩论' | '合议裁决' | '复核';

// 一条带证据与推理链的主张（确定性三明治的「上层面包」：语法上消灭空口断言）
export interface ArgPoint { claim: string; evidenceRef: string; reasoning: string }

// 阶段间只传这份「结构化小结论」给下游（Handoff Contract：报文传输而非共享全量历史）
export interface StageReport {
  stage: CourtStage;
  issues?: string[];                 // 争点清单（立案阶段产出，下游必需输入）
  proArgs?: ArgPoint[];
  conArgs?: ArgPoint[];
  digest?: string;                   // 该阶段公开发言摘要
}

// 结构化裁决产物（合议阶段用 /api/frost-llm json 模式一次性生成）
export interface Verdict {
  id: string;
  topic: string;
  mode: 'courtroom';
  issues: string[];                  // 争点
  proArgs: ArgPoint[];               // 正方论据
  conArgs: ArgPoint[];               // 反方论据
  verdict: string;                   // 裁断文本
  confidence: number;                // 0-1
  dissent: string;                   // 保留的分歧（刻意存异）
  ruleEstablished: string;           // 本案确立的裁判要旨
  critique: string;                  // 复核意见（Critic）
  criticalViolations?: string[];     // 确定性核验抓到的 critical 违规（如疑似杜撰证据）；非空则不入判例库、UI 标红
  createdAt: string;
  transcriptDigest: string;          // 庭审纪要摘要
  geo?: { lat: number; lng: number; place: string };  // 地理锚点（可空；带则可钉地球）
}

export interface CaseRecord { verdict: Verdict; ts: number }

// 复核 Critic 的结构化诊断
export interface CritiqueReport { ok: boolean; problems: string[]; note: string }

export const newVerdictId = (() => { let n = 0; return () => { n += 1; return 'vd-' + Date.now() + '-' + n; }; })();
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : (Number.isFinite(x) ? x : 0.5));
