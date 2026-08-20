// 可复用 Skill（app 层）· KIRI API key 的本地保管（BYOK：自带 key）。
// 公开部署不共享服务端额度——每个用户用自己的 KIRI key。key 只存本机 localStorage，
// 用时随请求头 x-kiri-key 传给服务端代理转发给 KIRI，不入任何持久化数据/知识库/落点。
// 服务端不再读 env KIRI_API_KEY 服务公开请求，从根上杜绝陌生人消耗他人额度。
const STORE_KEY = 'pe.kiriKey.v1';

/** 读取本机保存的 KIRI key（无则空串）。 */
export function getKiriKey(): string {
  try { return (localStorage.getItem(STORE_KEY) || '').trim(); } catch { return ''; }
}

/** 保存/更新 KIRI key；传空则清除。隐私模式静默降级（内存态不持久）。 */
export function setKiriKey(k: string): void {
  try {
    const v = (k || '').trim();
    if (v) localStorage.setItem(STORE_KEY, v);
    else localStorage.removeItem(STORE_KEY);
  } catch { /* 隐私模式：忽略 */ }
}

/** 是否已设置 KIRI key。 */
export function hasKiriKey(): boolean { return !!getKiriKey(); }

/** 构造带 key 的请求头（无 key 则空对象，服务端会回 need_kiri_key）。 */
export function kiriKeyHeader(): Record<string, string> {
  const k = getKiriKey();
  return k ? { 'x-kiri-key': k } : {};
}
