// 备份核验：端侧把「本次授权的照片」与「SSD/网盘备份文件夹里的文件」对账，产出可删除候选。
// 硬现实（2026-07 逐条核证）：
//   · iOS 相册选择器给网页的常是转码副本（HEIC→JPEG、视频压缩、GPS 剥离），字节 hash 只对原件可信；
//     转码件退级用 dHash 感知比对（同名原件 + 内容一致 → 也算已备份）。
//   · iOS 页面内存预算约 300-450MB，大文件绝不整读——>64MB 改「头/中/尾抽样 + 长度」定长 hash。
//   · iOS 18.4+ 才支持 webkitdirectory 整夹选取；更旧系统由 UI 降级为多选文件，本模块只吃 File[]。
import { decode, dHash, hamming } from '../skills/browserVision';

export type BackupMatchStatus = 'verified' | 'verified_content' | 'suspected' | 'missing';
export interface BackupRecord {
  name: string;
  path: string;                  // webkitRelativePath（整夹选取）或文件名
  size: number;
  lastModified: number;
  file: File;
  sha256?: string;               // 惰性缓存：算过一次不再算
  dhash?: string | null;         // 惰性缓存：null = 解码失败过，别重试
}
export interface BackupMatch { status: BackupMatchStatus; path?: string; reason: string; localHash?: string }   // localHash：本地文件指纹（跨会话稳定，视频「已删记账」用它当键）
export interface BackupIndex { byBase: Map<string, BackupRecord[]>; bySize: Map<number, BackupRecord[]> }

const MEDIA_RE = /\.(?:jpe?g|heic|heif|png|gif|webp|dng|tiff?|mov|mp4|m4v|avi|mts|3gp)$/i;
const IMAGE_RE = /\.(?:jpe?g|heic|heif|png|gif|webp|tiff?)$/i;
const SCAN_LIMIT = 20000;
const FULL_HASH_LIMIT = 64 * 1024 * 1024;
const SAMPLE_BYTES = 8 * 1024 * 1024;
const DHASH_MAX_DIST = 2;        // 与 reasoning.ts 查重的「严格重复」档一致

export function recordsFromFiles(list: FileList | File[]): BackupRecord[] {
  return Array.from(list).filter((f) => MEDIA_RE.test(f.name)).slice(0, SCAN_LIMIT).map((file) => ({
    name: file.name,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    size: file.size,
    lastModified: file.lastModified,
    file,
  }));
}

// 归一化主名：去扩展名（转码会把 .heic 改成 .jpeg）、去导出工具常加的数字序号前缀
export function baseName(name: string): string {
  return name.normalize('NFC').toLowerCase()
    .replace(/^\d{4,6}[_ -]+/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim();
}

// 防「拿相册自己核自己」：备份选择器里误选了同一批照片本身 → 字节全对上、全绿"已备份"，
// 但这是自我验证、信了会误删。判据：无目录相对路径（不是整夹选取）且大多数记录与所选照片
// 名字+大小+修改时间三元组完全相同。真备份请走「选备份文件夹」（带相对路径，不会触发）。
export function looksLikeSelfPick(selected: Array<{ name: string; size: number; lastModified: number }>, records: BackupRecord[]): boolean {
  if (!records.length || records.some((r) => r.path !== r.name)) return false;
  const keys = new Set(selected.map((f) => `${f.name}::${f.size}::${f.lastModified}`));
  const hits = records.filter((r) => keys.has(`${r.name}::${r.size}::${r.lastModified}`)).length;
  return hits >= 3 && hits / records.length >= 0.6;
}

export function buildBackupIndex(records: BackupRecord[]): BackupIndex {
  const byBase = new Map<string, BackupRecord[]>();
  const bySize = new Map<number, BackupRecord[]>();
  for (const r of records) {
    const base = baseName(r.name);
    byBase.set(base, [...(byBase.get(base) || []), r]);
    bySize.set(r.size, [...(bySize.get(r.size) || []), r]);
  }
  return { byBase, bySize };
}

async function digestHex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 定长内存 hash：小文件整读；大文件头/中/尾抽样拼接（只用于比较等长文件，抽样一致即视为同件）
export async function quickHash(file: File, fullLimit = FULL_HASH_LIMIT, sample = SAMPLE_BYTES): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持端侧 hash');
  if (file.size <= fullLimit) return digestHex(await file.arrayBuffer());
  const mid = Math.floor(file.size / 2 - sample / 2);
  const parts = await Promise.all([
    file.slice(0, sample).arrayBuffer(),
    file.slice(mid, mid + sample).arrayBuffer(),
    file.slice(file.size - sample).arrayBuffer(),
  ]);
  const buf = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let off = 0;
  for (const p of parts) { buf.set(new Uint8Array(p), off); off += p.byteLength; }
  return 'sampled:' + await digestHex(buf.buffer);
}

async function recordHash(r: BackupRecord): Promise<string> {
  if (!r.sha256) r.sha256 = await quickHash(r.file);
  return r.sha256;
}

async function recordDHash(r: BackupRecord): Promise<string | null> {
  if (r.dhash !== undefined) return r.dhash;
  if (typeof document === 'undefined' || !IMAGE_RE.test(r.name)) { r.dhash = null; return null; }
  try {
    const dec = await decode(r.file, 128);
    r.dhash = dec ? dHash(dec.canvas) : null;
  } catch { r.dhash = null; }
  return r.dhash;
}

// 单张照片对账。photoDHash 来自筛选结果（PhotoResult.id），没跑过筛选可传 undefined。
// 判级：字节一致 verified > 感知一致 verified_content > 名字/大小吻合 suspected > missing。
export async function matchBackup(file: File, photoDHash: string | undefined, index: BackupIndex): Promise<BackupMatch> {
  const base = baseName(file.name);
  const named = index.byBase.get(base) || [];
  const sized = (index.bySize.get(file.size) || []).slice(0, 8);
  // ① 等长候选（同名优先）逐个字节级核对
  const exact = [...new Map([...named.filter((r) => r.size === file.size), ...sized].map((r) => [r.path, r])).values()];
  let hashFailed = false;
  let mismatch = false;   // 与至少一个候选【完成】了比对且不一致——是确定性的否证，不是「没查成」
  if (exact.length) {
    try {
      const local = await quickHash(file);
      for (const r of exact) {
        try {
          if (local === await recordHash(r)) return { status: 'verified', path: r.path, reason: r.sha256!.startsWith('sampled:') ? '抽样 SHA-256 一致（大文件）' : 'SHA-256 完全一致', localHash: local };
          mismatch = true;
        } catch { hashFailed = true; }
      }
    } catch { hashFailed = true; }
  }
  // ② 同名但字节对不上（多半是相册选择器给了转码件）→ 感知哈希比内容
  if (photoDHash) {
    for (const r of named) {
      const dh = await recordDHash(r);
      if (dh && hamming(photoDHash, dh) <= DHASH_MAX_DIST) {
        return { status: 'verified_content', path: r.path, reason: '备份的是原件，网页拿到的是转码副本；感知哈希一致' };
      }
    }
  }
  // ③ 弱证据：同名（大小可能因转码不同）→ 疑似，人来复核
  // Live Photo 导出是同名 .heic+.mov 一对：优先指向与本文件同类型的候选，别把照片的疑似路径指到动态 .mov 上
  if (named.length) {
    const r = named.find((c) => IMAGE_RE.test(c.name) === IMAGE_RE.test(file.name)) || named[0];
    return {
      status: 'suspected',
      path: r.path,
      reason: hashFailed ? '同名同大小但 hash 未能完成' : IMAGE_RE.test(file.name) ? '同名但内容未确认' : '同名视频；网页拿到的常是压缩转码件，请在文件 App 里核对原件',
    };
  }
  // 仅大小相同、名字对不上：hash 比对完成且不一致 → 就是没备份，别给「疑似」的错误暗示；
  // 只有 hash 没能跑成时才留「疑似」给人复核。
  if (exact.length === 1 && !mismatch) return { status: 'suspected', path: exact[0].path, reason: hashFailed ? '大小相同但 hash 未能完成，请人工复核' : '大小相同但文件名对不上，未确认' };
  return { status: 'missing', reason: mismatch ? '同大小候选经 hash 比对不一致——不是这张' : '备份位置里没找到这张' };
}
