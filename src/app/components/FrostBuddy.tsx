import { useEffect, useState, type CSSProperties } from 'react';
import {
  FROST, COLOR_BASE, COLOR_WARM, COLOR_FLAKE, COLOR_FLAKE2, ROWS,
  type FrostState, type Particle,
} from '../../../frost-agent/buddy/poses';
import { THEMES, type FrostTheme } from '../../../frost-agent/buddy/themes';

// FROST buddy · React 渲染层。把固件的 pose+SEQ 引擎搬成 monospace <pre> 逐帧切换。
// 纯展示：state 由外部传入（FrostBuddyPage 据 runFrost/heartbeat 信号 derive）。
// 单色银蓝；celebrate 整体转暖黄，雪粒始终冷白冷青。

// 200ms 一拍的全局节拍（对应固件 TICK_MS=200，5fps）；隐藏页 / 熄屏自动暂停，省电不空转。
function useTick(periodMs = 200): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (id == null) id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), periodMs); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => { if (typeof document !== 'undefined' && document.hidden) stop(); else start(); };
    onVis();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [periodMs]);
  return tick;
}

// 雪/休眠/爱心粒子的 keyframes 只注一次（全局共享，避免每个实例重复注入）。
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.textContent = [
    '@keyframes pe-frost-fall{0%{transform:translateY(0);opacity:0}12%{opacity:.85}88%{opacity:.5}100%{transform:translateY(var(--pe-h,90px));opacity:0}}',
    '@keyframes pe-frost-rise{0%{transform:translateY(0);opacity:0}18%{opacity:.7}100%{transform:translateY(calc(var(--pe-h,90px)*-0.75));opacity:0}}',
  ].join('');
  document.head.appendChild(el);
}

interface FlakeCfg { ch: string; color: string; left: number; delay: number; dur: number; rise?: boolean; }

function particleCfg(kind: Particle): FlakeCfg[] {
  switch (kind) {
    case 'snow':
      return [
        { ch: '✶', color: COLOR_FLAKE, left: 18, delay: 0, dur: 6.5 },
        { ch: '·', color: COLOR_FLAKE2, left: 74, delay: 3.1, dur: 7.2 },
      ];
    case 'snow_dense':
      return [
        { ch: '✶', color: COLOR_FLAKE, left: 14, delay: 0, dur: 4.6 },
        { ch: '·', color: COLOR_FLAKE2, left: 50, delay: 1.4, dur: 5.2 },
        { ch: '*', color: COLOR_FLAKE, left: 82, delay: 2.8, dur: 4.9 },
      ];
    case 'sleep':
      return [{ ch: 'z', color: COLOR_FLAKE2, left: 70, delay: 0, dur: 6.8, rise: true }];
    case 'heart':
      return [
        { ch: 'v', color: COLOR_FLAKE, left: 36, delay: 0, dur: 4.4, rise: true },
        { ch: 'v', color: COLOR_FLAKE2, left: 58, delay: 1.9, dur: 4.8, rise: true },
      ];
    default:
      return [];
  }
}

interface Props {
  state: FrostState;
  theme?: FrostTheme;   // idle 时按聊天主题换装（戴耳机/眼镜/捧书…）；emotion 态优先
  size?: number;        // 字号 px（buddy 宽 ≈ size*0.6*12）
  color?: string;       // 覆盖字色（浅底上用深色，保证看清）
  warmColor?: string;   // celebrate 暖色覆盖（浅底上用深金，避免糊掉）
  glow?: boolean;       // 是否发光 + 飘雪（深底=true；浅底=false 更干净）
  cycle?: boolean;      // 招牌模式：不时自动轮换各种换装形态（忽略 state/theme）
  className?: string;
}

// 招牌模式轮换的形态（你做出来的那几种「表情」：基础 + 8 套主题换装）
const CYCLE: { state: FrostState; theme: FrostTheme }[] = [
  { state: 'idle', theme: 'none' },
  { state: 'idle', theme: 'music' },
  { state: 'idle', theme: 'movie' },
  { state: 'idle', theme: 'book' },
  { state: 'idle', theme: 'photo' },
  { state: 'idle', theme: 'travel' },
  { state: 'idle', theme: 'cosmos' },
  { state: 'idle', theme: 'mood' },
  { state: 'idle', theme: 'culture' },
];
const CYCLE_TICKS = 18;   // 每种约 18×200ms ≈ 3.6s

export default function FrostBuddy({ state, theme = 'none', size = 26, color: colorProp, warmColor: warmColorProp, glow = true, cycle = false, className }: Props) {
  const tick = useTick();
  ensureStyles();

  // 招牌模式：据 tick 慢速轮换形态（复用同一 tick，不另起定时器）。
  let curState = state, curTheme = theme;
  if (cycle) {
    const ci = Math.floor(tick / CYCLE_TICKS) % CYCLE.length;
    curState = CYCLE[ci].state; curTheme = CYCLE[ci].theme;
  }

  // idle 是“稳态/在说话”：此时按主题换装；busy/celebrate/dizzy 等情绪态优先、压过主题。
  const themed = curState === 'idle' && curTheme !== 'none' ? THEMES[curTheme] : undefined;
  const def = themed ?? FROST.states[curState] ?? FROST.states.idle;
  const beat = Math.floor(tick / (def.div || 1)) % def.seq.length;
  const pose = def.poses[def.seq[beat]] ?? def.poses[0];
  const xShift = def.xShift?.[beat] ?? 0;
  const warm = !!def.warm;
  const color = warm ? (warmColorProp ?? COLOR_WARM) : (colorProp ?? COLOR_BASE);
  const glowColor = warm ? 'rgba(232,192,106,0.42)' : 'rgba(127,168,201,0.32)';

  const flakes = glow ? particleCfg(def.particle) : [];
  const boxH = Math.round(size * 1.12 * (pose.lines.length || ROWS));

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      <pre
        aria-hidden
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
          fontSize: size,
          lineHeight: 1.12,
          letterSpacing: 0,
          color,
          textShadow: glow ? `0 0 ${Math.round(size * 0.5)}px ${glowColor}` : 'none',
          whiteSpace: 'pre',
          fontVariantLigatures: 'none',
          transition: 'color .45s ease, text-shadow .45s ease',
          transform: xShift ? `translateX(${(xShift * size * 0.6).toFixed(1)}px)` : undefined,
        }}
      >
        {pose.lines.join('\n')}
      </pre>

      {flakes.length > 0 && (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', '--pe-h': `${boxH}px` } as CSSProperties}
        >
          {flakes.map((f, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                top: f.rise ? '60%' : 0,
                left: `${f.left}%`,
                color: f.color,
                fontSize: Math.round(size * 0.42),
                fontFamily: 'var(--font-mono, monospace)',
                opacity: 0,
                animation: `${f.rise ? 'pe-frost-rise' : 'pe-frost-fall'} ${f.dur}s linear ${f.delay}s infinite`,
              }}
            >
              {f.ch}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 对话头像：方盒整体 12 列塞不进小头像，退化成「冠 + 方眼」两行精简脸，
// 装进一个和用户头像同尺寸的方框，静态（身份印记，不抢上方那只活的 buddy）。
export function FrostAvatar({ size = 26 }: { size?: number }) {
  const fs = Math.round(size * 0.3);
  return (
    <div
      aria-label="FROST"
      style={{
        width: size, height: size, flexShrink: 0,
        background: '#0d1522', border: '2px solid #000',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}
    >
      <pre
        aria-hidden
        style={{
          margin: 0, fontFamily: 'var(--font-mono, ui-monospace, Menlo, Consolas, monospace)',
          fontSize: fs, lineHeight: 1.04, color: COLOR_BASE, whiteSpace: 'pre', fontVariantLigatures: 'none',
          textShadow: `0 0 ${Math.round(size * 0.2)}px rgba(127,168,201,0.45)`,
        }}
      >
        {'.-~-.\n[o o]'}
      </pre>
    </div>
  );
}
