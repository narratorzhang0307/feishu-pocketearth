type AccessResult = { code?: string };
type AccessError = { errMsg?: string; errCode?: number };

type FeishuBridgeWindow = Window & {
  h5sdk?: {
    ready: (callback: () => void) => void;
    error?: (callback: (error: AccessError) => void) => void;
  };
  tt?: {
    requestAccess: (options: {
      appID: string;
      scopeList: string[];
      success: (result: AccessResult) => void;
      fail: (error: AccessError) => void;
    }) => void;
  };
};

const SDK_URL = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.26.js';

function loadSdk() {
  const feishuWindow = window as FeishuBridgeWindow;
  if (feishuWindow.h5sdk && feishuWindow.tt) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-feishu-jssdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('feishu_jssdk_load_failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.dataset.feishuJssdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('feishu_jssdk_load_failed'));
    document.head.appendChild(script);
  });
}

export async function requestFeishuAuthCode(appId: string) {
  await loadSdk();
  const feishuWindow = window as FeishuBridgeWindow;
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('feishu_jssdk_timeout')), 15_000);
    const fail = (error: AccessError) => {
      window.clearTimeout(timer);
      reject(new Error(error.errMsg || `feishu_request_access_${error.errCode || 'failed'}`));
    };
    feishuWindow.h5sdk?.error?.(fail);
    feishuWindow.h5sdk?.ready(() => {
      if (!feishuWindow.tt) return fail({ errMsg: 'feishu_tt_unavailable' });
      feishuWindow.tt.requestAccess({
        appID: appId,
        scopeList: [],
        success: (result) => {
          window.clearTimeout(timer);
          if (result.code) resolve(result.code);
          else reject(new Error('feishu_auth_code_missing'));
        },
        fail,
      });
    });
  });
}
