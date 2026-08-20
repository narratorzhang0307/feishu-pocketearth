import { describe, it, expect } from 'vitest';
import { decideArMode } from './capability';

const base = { xrArSupported: false, hasCamera: false, secureContext: true, isIOS: false };

describe('arphoto/capability 三模式分流', () => {
  it('WebXR 可用 → webxr 真 AR', () => {
    const c = decideArMode({ ...base, xrArSupported: true, hasCamera: true });
    expect(c.mode).toBe('webxr');
    expect(c.label).toContain('AR');
  });

  it('无 WebXR 有相机 → pseudo，iOS 文案点名安卓 Chrome', () => {
    const ios = decideArMode({ ...base, hasCamera: true, isIOS: true });
    expect(ios.mode).toBe('pseudo');
    expect(ios.hint).toContain('iOS');
    expect(ios.hint).toContain('安卓 Chrome');
    const other = decideArMode({ ...base, hasCamera: true });
    expect(other.mode).toBe('pseudo');
    expect(other.hint).toContain('安卓 Chrome');
  });

  it('非安全上下文 → preview 且点名 HTTPS（即便设备本可 AR）', () => {
    const c = decideArMode({ xrArSupported: true, hasCamera: true, secureContext: false, isIOS: false });
    expect(c.mode).toBe('preview');
    expect(c.hint).toContain('HTTPS');
  });

  it('无相机无 XR → preview 诚实说明', () => {
    const c = decideArMode(base);
    expect(c.mode).toBe('preview');
    expect(c.hint).toContain('3D 预览');
  });
});
