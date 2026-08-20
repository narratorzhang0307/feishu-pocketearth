// Frost Harness · 统一同步 / 流式协议契约（P2-J）
// 一套消息协议，让「同一个用户的多个端」(手机 / 桌面 / CLI) 共享同一份口袋地球状态，
// 并支持流式增量（边生成边出字）。本文件只定义【契约】——它是多端同步与流式的对接面。
//
// 落地现状：app 内各 store(userMarks / planets / geoStickers / profile / skills / heartbeat)
//   已经是本地「事件源」(pub/sub)；本协议把它们的变更归一成可在端间传输的 SyncEvent。
// 待定（前瞻，无人值守不贸然上线）：真正的 WebSocket 中继服务 + 跨设备身份 / 持久化，
//   需要在服务器上起常驻服务并引入用户身份，风险与工作量较大，留作下一步（见 README 路线）。

export type SyncResource = 'mark' | 'planet' | 'mood' | 'profile' | 'skill';
export type SyncOp = 'add' | 'remove' | 'update';

/** 一条状态变更事件：来源端 / 资源 / 操作 / 载荷 / 逻辑时钟。 */
export interface SyncEvent<T = unknown> {
  v: 1;                 // 协议版本
  id: string;           // 事件唯一 id
  device: string;       // 来源端标识（phone / desktop / cli / web…）
  resource: SyncResource;
  op: SyncOp;
  payload: T;
  lamport: number;      // 逻辑时钟（多端合并 / 去重用，后续接 LWW / CRDT）
  ts: string;           // ISO
}

/** 流式增量：边生成边推（对话逐字、电台串词逐句）。 */
export type StreamPhase = 'start' | 'delta' | 'end';
export interface StreamEvent {
  v: 1;
  channel: string;      // 哪条流（如某次对话 id）
  phase: StreamPhase;
  delta?: string;       // phase='delta' 时的增量文本
  ts: string;
}

export type AnyEvent = SyncEvent | StreamEvent;

/** 端间通道契约：未来 WebSocket / BroadcastChannel / 本地 loopback 都实现这一个接口即可，
 *  上层（store 同步、流式渲染）只依赖它，换传输不改调用点。 */
export interface SyncChannel {
  readonly name: string;
  publish(e: AnyEvent): void;
  subscribe(fn: (e: AnyEvent) => void): () => void;
}

let lamport = 0;
/** 取下一个逻辑时钟值（单调递增）。 */
export function nextLamport(): number { return ++lamport; }

/** 构造一条 SyncEvent（device 默认 'web'）。 */
export function makeSyncEvent<T>(resource: SyncResource, op: SyncOp, payload: T, device = 'web'): SyncEvent<T> {
  const n = nextLamport();
  return { v: 1, id: `${resource}-${op}-${n}`, device, resource, op, payload, lamport: n, ts: new Date().toISOString() };
}

/** 构造一条流式增量事件。 */
export function makeStreamEvent(channel: string, phase: StreamPhase, delta?: string): StreamEvent {
  return { v: 1, channel, phase, delta, ts: new Date().toISOString() };
}
