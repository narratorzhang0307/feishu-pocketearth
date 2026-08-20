// Frost Harness · 内部处理器的严格 I/O 契约。
// 产品前台只有 Frost 与 Skills；旧电台处理器只「建议」radioActions，
// 由 Boundary（Validator）决定是否执行。

export type FrostIntent =
  | 'chitchat'        // 闲聊
  | 'city_culture'    // 城市/作家/作品文化问答
  | 'playlist'        // 要一份歌单
  | 'open_dj'         // 开放式策展（书/心情/场景）
  | 'tour'            // 跟着日落环游
  | 'switch'          // 换歌/暂停/切城等明确指令
  | 'general'         // 通用兜底：没有专门 skill 对应的任何问题
  | 'regenerate';     // 重新生成某城资产（流水线）

/** 电台动作建议。内部处理器产出，Frost Validator 校验后才会落到播放器。 */
export type RadioAction =
  | { type: 'switch_city'; slug: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next_track' }
  | { type: 'prev_track' }
  | { type: 'set_playlist'; trackIds: string[] };

/** 一条对话记录（会话记忆）。 */
export interface ChatTurn {
  role: 'user' | 'frost';
  text: string;
}

/** 进入 Frost 内部处理器的统一上下文。 */
export interface FrostContext {
  now: Date;
  /** 调用入口。radio 保留既有电台路由；frost 启用跨 Skill 总编排。 */
  surface?: 'radio' | 'frost';
  citySlug?: string;     // 当前所在城市
  userText?: string;     // 用户这一句话（闲聊/策展类用）
  history?: ChatTurn[];  // 最近对话（会话记忆，给大脑做上下文）
}

/** 歌单条目（open-dj 等产出，FrostPanel 展示）。 */
export interface PlaylistEntry {
  trackId: string;
  title: string;
  artist: string;
  cityNameZh: string;
  note?: string;
}

/** Frost 内部处理器的统一返回契约。 */
export interface AgentResult<T = unknown> {
  agent: string;          // 内部处理器名（不作为前台人格）
  reply: string;          // 用 Frost 声音对用户说的话
  data: T;                // 结构化结果（各 agent 自定义）
  radioActions: RadioAction[]; // 建议动作（需经 Validator）
  trace?: string[];       // Agent Trace（路由/思考步骤，UI 展示用）
}

/** 可插拔的 Qwen 云脑。需云推理的 Skill 通过它调用，前端不直接持密钥。 */
export interface FrostBrain {
  complete(prompt: string, opts?: { json?: boolean; task?: string }): Promise<string>;
}
