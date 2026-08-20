// 能力检测与三模式分流（决策纯函数可测；采集器舱壁降级）。
// 红线：不做死按钮——不支持就诚实说缺什么，并给能跑的降级模式。
// SPZ 预检（ExhibitViewer.tsx:33-37）同款范式：能力不够 → 定向文案。
import type { ArMode } from './types';

export interface ArCapabilityFlags {
  xrArSupported: boolean;   // navigator.xr.isSessionSupported('immersive-ar')
  hasCamera: boolean;       // navigator.mediaDevices.getUserMedia 存在
  secureContext: boolean;   // WebXR/getUserMedia 都要 HTTPS（或 localhost）
  isIOS: boolean;
}

export interface ArCapability {
  mode: ArMode;
  label: string;   // 模式徽章
  hint: string;    // 诚实说明（缺什么、这个模式是什么）
}

/** 纯决策矩阵（vitest 全分支覆盖） */
export function decideArMode(f: ArCapabilityFlags): ArCapability {
  if (f.xrArSupported && f.secureContext) {
    return { mode: 'webxr', label: 'AR · 现实锚定', hint: '设备支持 WebXR，可识别平面，把照片真正放进现实空间' };
  }
  if (f.hasCamera && f.secureContext) {
    return {
      mode: 'pseudo',
      label: '伪AR · 相机叠加',
      hint: f.isIOS
        ? 'iOS 浏览器没有 WebXR，用相机画面叠加照片预览；真 AR 请用安卓 Chrome 打开'
        : '此浏览器没有 WebXR，用相机画面叠加照片预览；真 AR 请用安卓 Chrome 打开',
    };
  }
  if (!f.secureContext) {
    return { mode: 'preview', label: '3D · 预览', hint: '当前不是 HTTPS 安全环境，相机与 AR 不可用——先用 3D 预览看布展效果' };
  }
  return { mode: 'preview', label: '3D · 预览', hint: '没有可用相机——用 3D 预览看布展效果（拖动环视）' };
}

/** 含 iPadOS 伪装 Mac 的触点兜底（PhotosAgentRunPage 同款判式） */
export function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 采集真实环境旗标 → 决策。任何一步异常都当作不支持（舱壁，不抛错）。 */
export async function detectArCapability(): Promise<ArCapability> {
  let xrArSupported = false;
  try {
    const xr = (navigator as unknown as { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr;
    if (xr?.isSessionSupported) xrArSupported = !!(await xr.isSessionSupported('immersive-ar'));
  } catch { xrArSupported = false; }
  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext !== false : false;
  return decideArMode({ xrArSupported, hasCamera, secureContext, isIOS: detectIOS() });
}
