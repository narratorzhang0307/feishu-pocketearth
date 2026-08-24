import { useState, useEffect, lazy, Suspense, type ComponentType } from 'react';
import { Image, Globe, Sparkles } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
// import RunDrawer from './components/RunDrawer';   // 录视频时临时隐藏「运行轨迹」浮钮；要找回：取消本行 + 下方 <RunDrawer/> 两处注释
import { subscribeMapFocus } from './data/mapFocus';

// 懒加载重试：持续部署后旧 hash 的 chunk 会从服务器消失，挂着不刷新的页面首次切到该 tab 时
// import() 会 reject → 无 ErrorBoundary 即白屏。这里捕获一次、强刷一次拉到新 index.html+新 hash。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy<T>(() => factory()
    .then((m) => { sessionStorage.removeItem('chunk-reload'); return m; })
    .catch((e) => {
      if (!sessionStorage.getItem('chunk-reload')) { sessionStorage.setItem('chunk-reload', '1'); location.reload(); return new Promise<{ default: T }>(() => {}); }
      throw e;   // 已重载过仍失败 → 交给 ErrorBoundary 显示可见兜底
    }));
}

// 三个 tab 懒加载：首屏只下载当前 tab 的 chunk（地球默认），照片/Skills 按需加载。
const PhotosTab = lazyRetry(() => import('./components/PhotosTab'));
const MyMapTab = lazyRetry(() => import('./components/MyMapTab'));
const MusicAgentsTab = lazyRetry(() => import('./components/MusicAgentsTab'));

type Tab = 'photos' | 'earth' | 'agents';

// chunk 加载时的占位（与 app 同底色，中间一颗呼吸的绿色像素块）
const TabFallback = () => (
  <div className="w-full h-full bg-[#EAEAEA] flex items-center justify-center">
    <div className="w-3 h-3 bg-[#00ff88] border border-black animate-pulse" />
  </div>
);

// 是否以「已安装的 PWA」独立运行（加到桌面后从图标打开）。
// 命中时铺满全屏 + 适配 iOS 安全区；否则保持桌面浏览器里的手机框样式。
function useStandalone() {
  const get = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari 专有标记
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const [standalone, setStandalone] = useState<boolean>(get);
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const on = () => setStandalone(get());
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return standalone;
}

// 430×932 手机框（iPhone 15 Pro Max 逻辑尺寸 · 19.5:9）+ 底部三 tab（照片 / 地球 / Skills）
// · 浏览器：用 aspect-ratio 等比自适应（窄屏按宽收、矮屏按高收，比例恒为 430:932）
// · 已安装 PWA：铺满 100dvw×100dvh，顶部留灵动岛、底部留 home 指示条的安全区
export default function App() {
  const feishuMode = typeof location !== 'undefined' && (location.pathname === '/feishu' || location.pathname.startsWith('/feishu/'));
  const openAgentFromUrl = typeof location !== 'undefined' && (
    new URLSearchParams(location.search).get('agent') === 'exhibition' ||
    new URLSearchParams(location.search).has('recoverKiri')
  );
  const [activeTab, setActiveTab] = useState<Tab>(feishuMode ? 'earth' : openAgentFromUrl ? 'agents' : 'earth');
  const [requestedSkillTarget, setRequestedSkillTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!feishuMode) return;
    void import('./feishu/librarySync').then(({ enableFeishuBuiltinMapLayersOnce }) => enableFeishuBuiltinMapLayersOnce());
  }, [feishuMode]);
  // 记一笔等入口钉完会请求地图焦点 → 自动切到地球 tab，并由 MyMap 消费焦点。
  useEffect(() => subscribeMapFocus(() => setActiveTab('earth')), []);
  const standalone = useStandalone();
  const appViewportMode = standalone || feishuMode;
  // 录制态：本地给地址加 ?rec（或 ?record）才套 iPhone 外壳 + 9:16 录制画布；线上 PWA 默认走正常手机框。
  const recordMode = typeof location !== 'undefined' && /[?&](rec|record)\b/.test(location.search);
  // 嵌入态（?embed）：app 内容满铺、不套任何手机框——给外部独立录制台（record-stage/）用 iframe 套进自带的 iPhone 壳里。
  const embedMode = typeof location !== 'undefined' && /[?&]embed\b/.test(location.search);
  // 录制版：9:16 录制框辅助线，按 G 显隐（对齐好录制区域后按 G 隐藏，框不进画面）
  const [guide, setGuide] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) setGuide((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // app 内容（内容区 + 底部 tab bar），安装态与录制态共用
  const content = (
    <>
      <main
        data-pocket-earth-main
        className="flex-1 overflow-hidden relative"
        style={{
          paddingBottom: appViewportMode
            ? `calc(70px + max(${feishuMode ? '8px' : '20px'}, env(safe-area-inset-bottom)))`
            : '84px',
        }}
      >
        {/* 每个 tab 各包一层 ErrorBoundary（key=activeTab 切 tab 自动复位）：单 tab 崩溃 tab bar 仍在、可切走 */}
        <ErrorBoundary key={activeTab}>
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'photos' && <PhotosTab />}
            {activeTab === 'earth' && <MyMapTab feishuMode={feishuMode} onOpenSkill={(target) => {
              if (target === 'photo-organizer') { setActiveTab('photos'); return; }
              setRequestedSkillTarget(target); setActiveTab('agents');
            }} />}
            {activeTab === 'agents' && <MusicAgentsTab feishuMode={feishuMode} requestedTarget={requestedSkillTarget} onRequestedTargetOpened={() => setRequestedSkillTarget(null)} />}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* <RunDrawer /> 录视频时临时隐藏「运行轨迹」浮钮；要找回：取消本行注释 + 顶部 import 注释 */}

      <div
        className="absolute bottom-0 left-0 right-0 bg-[#EAEAEA] border-t-2 border-black z-30 pt-2"
        style={{ paddingBottom: appViewportMode ? `max(${feishuMode ? '8px' : '20px'}, env(safe-area-inset-bottom))` : '20px' }}
      >
        <div className={`flex h-[60px] items-center justify-between px-6 ${feishuMode ? 'mx-auto w-full max-w-[720px]' : ''}`}>
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
              activeTab === 'photos' ? 'text-[#00aa55]' : 'text-black/65 hover:text-black'
            }`}
          >
            <Image className="w-6 h-6" strokeWidth={2.5} />
            <span className="text-[8px] font-pixel uppercase tracking-widest">Photos</span>
          </button>

          <div className="flex flex-col items-center">
            <button
              onClick={() => setActiveTab('earth')}
              className={`w-[60px] h-[60px] rounded-full border-[3px] border-black flex items-center justify-center transition-all bg-black ${
                activeTab === 'earth'
                  ? 'shadow-[inset_0_0_15px_rgba(0,255,136,0.35)] translate-y-1'
                  : 'shadow-[0_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[0_5px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000]'
              }`}
              title="地球"
            >
              <Globe className="w-7 h-7 text-[#00ff88]" strokeWidth={2.5} />
            </button>
          </div>

          <button
            onClick={() => setActiveTab('agents')}
            className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
              activeTab === 'agents' ? 'text-[#00aa55]' : 'text-black/65 hover:text-black'
            }`}
          >
            <Sparkles className="w-6 h-6" strokeWidth={2.5} />
            <span className="text-[8px] font-pixel uppercase tracking-widest">Skills</span>
          </button>
        </div>
      </div>
    </>
  );

  // 飞书网页应用已经运行在客户端自己的 WebView 中：直接适配它提供的动态视口，
  // 不再重复套 430×932 手机框。这样手机无灰边，桌面端也能利用可用宽度。
  if (feishuMode) {
    return (
      <div data-feishu-viewport className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-[#EAEAEA]">
        <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#EAEAEA]">
          {content}
        </div>
      </div>
    );
  }

  // 安装态（PWA）：铺满全屏
  if (standalone) {
    return (
      <div className="h-[100dvh] w-full bg-[#EAEAEA] overflow-hidden">
        <div className="relative w-full h-full bg-[#EAEAEA] overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {content}
        </div>
      </div>
    );
  }

  // 嵌入版（?embed）：只渲染满铺内容、无外壳/无手机框——外部录制台（record-stage）用 iframe 套进自带的 iPhone 15 Pro Max 壳里。
  if (embedMode) return (
    <div className="fixed inset-0 bg-[#EAEAEA] overflow-hidden flex flex-col">
      {content}
    </div>
  );

  // 录制版（仅本地 ?rec 触发）：9:16 竖屏画布 + iPhone 15 Pro Max 外壳（黑色机身 + 灵动岛），方便录制小红书竖屏视频
  if (recordMode) return (
    <div
      className="min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(130% 90% at 50% 0%, #1a2a36 0%, #0c1118 55%, #060708 100%)' }}
    >
      {/* 9:16 录制画布：录这个居中区域即可 */}
      <div className="relative flex items-center justify-center" style={{ height: '100vh', width: 'calc(100vh * 9 / 16)' }}>
        {/* iPhone 15 Pro Max 外壳 */}
        <div
          className="relative shrink-0 bg-[#1b1b1d]"
          style={{ height: '95%', aspectRatio: '430 / 932', borderRadius: '13% / 6%', padding: '1.5%', boxSizing: 'border-box', boxShadow: '0 0 0 2px #3a3a3c, 0 26px 64px rgba(0,0,0,0.6)' }}
        >
          {/* 屏幕（顶部留出灵动岛安全区，标题落在灵动岛下方） */}
          <div className="relative w-full h-full bg-[#EAEAEA] overflow-hidden flex flex-col" style={{ borderRadius: '11% / 5%', paddingTop: '5.6%' }}>
            {content}
            {/* 灵动岛 */}
            <div className="absolute top-[1.5%] left-1/2 -translate-x-1/2 bg-black rounded-full z-[60] pointer-events-none" style={{ width: '26%', height: '2.4%' }} />
          </div>
        </div>

        {/* 9:16 录制框辅助线（按 G 显隐）：边界正好是 9:16，对齐你的录屏区域用；对齐后按 G 隐藏，框就不进画面 */}
        {guide && (
          <div className="absolute inset-0 z-[80] pointer-events-none">
            <div className="absolute inset-0" style={{ border: '2px dashed rgba(0,255,136,0.75)' }} />
            <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#00ff88]" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#00ff88]" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#00ff88]" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#00ff88]" />
          </div>
        )}
      </div>
    </div>
  );

  // 普通浏览器（线上 PWA 默认）：430×932 手机框，等比自适应
  return (
    <div className="min-h-screen w-full bg-[#dcdcdc] flex items-center justify-center p-4 overflow-auto">
      <div
        className="relative shrink-0 bg-[#EAEAEA] overflow-hidden shadow-2xl flex flex-col"
        style={{ width: 'min(430px, 100vw, calc(100dvh * 430 / 932))', aspectRatio: '430 / 932' }}
      >
        {content}
      </div>
    </div>
  );
}
