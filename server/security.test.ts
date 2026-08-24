import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, boundedText, clientAddress, createSlidingWindowLimiter, isSafeDataImage, isSafeInlineImage } from './security.mjs';

describe('server security boundary', () => {
  it('rate limits by a bounded sliding window and recovers after expiry', () => {
    const limiter = createSlidingWindowLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.consume('a', 1000).allowed).toBe(true);
    expect(limiter.consume('a', 1500).allowed).toBe(true);
    expect(limiter.consume('a', 1600)).toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.consume('a', 2001).allowed).toBe(true);
  });

  it('does not trust spoofable proxy headers unless explicitly enabled', () => {
    const req = { headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' }, socket: { remoteAddress: '::ffff:127.0.0.1' } } as never;
    expect(clientAddress(req, false)).toBe('127.0.0.1');
    expect(clientAddress(req, true)).toBe('8.8.8.8');
  });

  it('accepts only bounded inline image bytes and rejects SSRF URLs', () => {
    const payload = Buffer.from('valid-image-bytes').toString('base64');
    expect(isSafeDataImage(`data:image/png;base64,${payload}`)).toBe(true);
    expect(isSafeInlineImage(payload)).toBe(true);
    expect(isSafeInlineImage('http://127.0.0.1/admin')).toBe(false);
    expect(isSafeDataImage('https://example.com/image.png')).toBe(false);
  });

  it('bounds user text before it reaches paid providers', () => {
    expect(boundedText('abcdef', 3)).toBe('abc');
    expect(boundedText(42, 3)).toBe('');
  });

  it('keeps frame denial by default but allows only Feishu ancestors for the embedded entry', () => {
    const headers = new Map<string, string>();
    const response = {
      hasHeader: (name: string) => headers.has(name),
      setHeader: (name: string, value: string) => headers.set(name, value),
      removeHeader: (name: string) => headers.delete(name),
    };

    applySecurityHeaders(response);
    expect(headers.get('x-frame-options')).toBe('DENY');

    applySecurityHeaders(response, { allowFeishuEmbed: true });
    expect(headers.has('x-frame-options')).toBe(false);
    expect(headers.get('content-security-policy')).toContain('https://*.feishu.cn');
    expect(headers.get('content-security-policy')).toContain('https://*.larksuite.com');
  });
});
