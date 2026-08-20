import { Component, type ReactNode } from 'react';

// 舱壁：单个 tab 子树渲染抛错时，回退到可见兜底 UI（带「重试 / 重载」），而不是整页白屏。
// 配合 App 里 <ErrorBoundary key={activeTab}>：切 tab 自动重置错误态，一个 tab 崩不拖垮其它 tab。
interface Props { children: ReactNode }
interface State { hasError: boolean; msg?: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    // 仅本地诊断；不外传
    try { console.error('[ErrorBoundary]', err); } catch { /* */ }
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="w-full h-full bg-[#EAEAEA] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-4 h-4 bg-[#d23b3b] border-2 border-black" />
        <div className="text-[13px] font-bold text-black">这个页面出了点问题</div>
        <div className="text-[11px] text-black/55 leading-snug max-w-[260px]">可以重试这个页面，或切到底部其它标签继续用。</div>
        <div className="flex gap-2 mt-1">
          <button onClick={() => this.setState({ hasError: false, msg: undefined })}
            className="border-2 border-black bg-white px-3 py-1.5 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">重试</button>
          <button onClick={() => location.reload()}
            className="border-2 border-black bg-black text-[#7CFF6B] px-3 py-1.5 text-[12px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">重载应用</button>
        </div>
      </div>
    );
  }
}
