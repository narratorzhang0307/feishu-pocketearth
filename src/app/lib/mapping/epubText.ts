import JSZip from 'jszip';

export interface EpubTextPage { href: string; title: string; text: string }

function attribute(tag: string, name: string): string {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || '';
}

function resolveArchivePath(base: string, relative: string): string {
  const out: string[] = [];
  for (const part of `${base ? `${base}/` : ''}${relative}`.split('/')) { if (!part || part === '.') continue; if (part === '..') out.pop(); else out.push(part); }
  return decodeURIComponent(out.join('/'));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, token: string) => {
    if (token[0] === '#') { const code = token[1].toLowerCase() === 'x' ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : '□'; }
    return named[token.toLowerCase()] ?? `&${token};`;
  });
}

function xhtmlText(value: string): { title: string; text: string } {
  const withoutNoise = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const title = decodeEntities(withoutNoise.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '') || '').trim();
  const withBreaks = withoutNoise.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr|section|article|figcaption)>/gi, '\n').replace(/<td\b[^>]*>/gi, '\t');
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, '')).replace(/\u00ad/g, '').replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text };
}

export async function extractEpubText(bytes: ArrayBuffer): Promise<EpubTextPage[]> {
  const archive = await JSZip.loadAsync(bytes);
  const container = await archive.file('META-INF/container.xml')?.async('string'); if (!container) throw new Error('EPUB 缺少 META-INF/container.xml');
  const packagePath = attribute(container.match(/<(?:\w+:)?rootfile\b[^>]*>/i)?.[0] || '', 'full-path'); if (!packagePath) throw new Error('EPUB 未声明 OPF package 路径');
  const packageXml = await archive.file(packagePath)?.async('string'); if (!packageXml) throw new Error(`EPUB 找不到 package：${packagePath}`);
  const packageDir = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/')) : '';
  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const tag of packageXml.match(/<(?:\w+:)?item\b[^>]*>/gi) || []) { const id = attribute(tag, 'id'); const href = attribute(tag, 'href'); if (id && href) manifest.set(id, { href, mediaType: attribute(tag, 'media-type') }); }
  const spineIds = (packageXml.match(/<(?:\w+:)?itemref\b[^>]*>/gi) || []).map((tag) => attribute(tag, 'idref')).filter(Boolean); if (!spineIds.length) throw new Error('EPUB spine 为空，无法确定阅读顺序');
  const pages: EpubTextPage[] = [];
  for (const id of spineIds) {
    const item = manifest.get(id); if (!item || !/(?:xhtml|html)/i.test(item.mediaType || item.href)) continue;
    const href = resolveArchivePath(packageDir, item.href); const raw = await archive.file(href)?.async('string'); if (!raw) continue;
    const parsed = xhtmlText(raw); if (parsed.text) pages.push({ href, ...parsed });
  }
  if (!pages.length) throw new Error('EPUB spine 中没有可用文字章节');
  return pages;
}
