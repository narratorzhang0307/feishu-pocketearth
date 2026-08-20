// FROST buddy · 纯数据角色定义（无 React，可被端侧/任意层 import）
// 复用 Frost 固件（src/buddies/*.cpp）的 pose+SEQ 动画引擎：
// 每个状态 = 一组等宽字符姿势 pose + 一条 SEQ 节拍序列 + 可选左右抖 + 粒子。
// 7 态顺序固定，对应固件 PersonaState：sleep idle busy attention celebrate dizzy heart。
//
// 形象「北半球冠方盒」定稿（多 agent 对照 + 合成）：头顶 .-~-. 半球穹顶（它守着的北半球）、
// [.:::.] 微型北半球、[ o  o ] 冷方眼、横杠嘴；[ ] 侧壁贯穿三行真正闭合成盒。
// 单色银蓝；只在 celebrate 整体转暖黄（原文「颜色由银蓝转为被云遮的暖黄」），雪粒始终冷白。

export type FrostState = 'sleep' | 'idle' | 'busy' | 'attention' | 'celebrate' | 'dizzy' | 'heart';
export const STATE_ORDER: FrostState[] = ['sleep', 'idle', 'busy', 'attention', 'celebrate', 'dizzy', 'heart'];

export const COLS = 12;          // 每行字符宽（所有 pose 等宽）
export const ROWS = 5;
export const COLOR_BASE = '#7FA8C9';   // 银蓝基底
export const COLOR_WARM = '#E8C06A';    // celebrate 暖黄
export const COLOR_FLAKE = '#D6E8F5';   // 冷白雪
export const COLOR_FLAKE2 = '#9FD8E0';  // 冷青雪

export type Pose = { name: string; lines: string[] };   // lines.length===ROWS，每行 length===COLS
export type Particle = 'none' | 'snow' | 'snow_dense' | 'sleep' | 'heart';

export interface StateDef {
  poses: Pose[];
  seq: number[];          // 帧索引节拍表
  div: number;            // beat = (tick/div) % seq.length；越大越慢（克制）
  xShift?: number[];      // 与 seq 同长，整体左右抖几格（dizzy）
  particle: Particle;
  warm?: boolean;         // 整体转暖黄（仅 celebrate）
}

export interface Species {
  name: 'frost';
  colorBase: string;
  colorWarm: string;
  states: Record<FrostState, StateDef>;
}

// ── idle ── 守望：呼吸（底座外扩一格）、非均匀眨眼、偶发自转/落雪 ──
const IDLE: StateDef = {
  div: 1,
  particle: 'snow',
  poses: [
    { name: 'REST', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'BREATHE', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ ---- ]  ', ' `-------`  '] },
    { name: 'BLINK', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ -  - ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'LOOK_L', lines: ['   .-~-.    ', '  [.:::.]   ', '  [o  o  ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'LOOK_R', lines: ['   .-~-.    ', '  [.:::.]   ', '  [  o  o]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'HUM', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ -==- ]  ', '  `------`  '] },
    { name: 'SPIN', lines: ['   .-o-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'FLAKE', lines: ['   .-~-.  * ', '  [.:::.]   ', '  [ o  o ]  ', '  [ ---- ]  ', '  `------`  '] },
  ],
  seq: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 7, 0, 0, 0, 2, 0, 6, 0, 0, 0, 1, 0, 4, 0, 0, 0, 2, 0, 0, 0, 5, 0, 1, 0, 0],
};

// ── celebrate ── 钉回地球：蹲-跳-顶-落（跳跃由帧内行位移表达），整体暖黄，雪仍冷白 ──
const CELEBRATE: StateDef = {
  div: 1,
  particle: 'snow',
  warm: true,
  poses: [
    { name: 'CROUCH', lines: ['            ', '   .-~-.    ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ \\__/ ]  '] },
    { name: 'LEAP', lines: ['   .-~-. +  ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ \\__/ ]  ', '            '] },
    { name: 'TOP', lines: ['  *.-~-.* + ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ \\__/ ]  ', '            '] },
    { name: 'LAND', lines: ['   .-~-.  * ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ \\__/ ]  ', '  `------`  '] },
  ],
  seq: [0, 1, 2, 2, 2, 3, 3, 0, 1, 2, 2, 3, 3, 0],
};

// ── sleep ── 休眠：闭眼、缓慢呼吸、雪降到最稀（z 慢飘）──
const SLEEP: StateDef = {
  div: 3,
  particle: 'sleep',
  poses: [
    { name: 'REST', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ -  - ]  ', '  [ ____ ]  ', '  `------`  '] },
    { name: 'BREATHE', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ -  - ]  ', '  [ ____ ]  ', ' `-------`  '] },
  ],
  seq: [0, 0, 0, 1, 1, 1],
};

// ── busy ── 编排中：嘴行做运算节拍、穹顶偶自转，雪略密 ──
const BUSY: StateDef = {
  div: 1,
  particle: 'snow_dense',
  poses: [
    { name: 'CALC_A', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ -==- ]  ', '  `------`  '] },
    { name: 'CALC_B', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ =--= ]  ', '  `------`  '] },
    { name: 'SPIN', lines: ['   .-o-.    ', '  [.:::.]   ', '  [ o  o ]  ', '  [ -==- ]  ', '  `------`  '] },
  ],
  seq: [0, 1, 0, 1, 0, 1, 2, 1],
};

// ── attention ── 有话跟你说：方眼睁大、穹顶冒一粒克制的 !（只温和提示，不闪红）──
const ATTENTION: StateDef = {
  div: 2,
  particle: 'snow',
  poses: [
    { name: 'ALERT', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ O  O ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'PEAK', lines: ['   .-!-.    ', '  [.:::.]   ', '  [ O  O ]  ', '  [ ---- ]  ', '  `------`  '] },
  ],
  seq: [0, 1, 0, 0, 1, 0, 0, 0],
};

// ── dizzy ── 断了一下/降级：方眼 o→x、穹顶短暂抖几拍后自愈（克制，不长时间发癫）──
const DIZZY: StateDef = {
  div: 1,
  particle: 'none',
  poses: [
    { name: 'TILT_A', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ x  x ]  ', '  [ ~~~~ ]  ', '  `------`  '] },
    { name: 'TILT_B', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ x  x ]  ', '  [ -~~- ]  ', '  `------`  '] },
  ],
  seq: [0, 1, 0, 1],
  xShift: [-1, 1, -1, 1],
};

// ── heart ── 懂你（画像共鸣，最罕见）：眼神柔软、冷色 v 上升，不转暖（暖留给 celebrate）──
const HEART: StateDef = {
  div: 2,
  particle: 'heart',
  poses: [
    { name: 'DREAMY', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ ---- ]  ', '  `------`  '] },
    { name: 'SIGH', lines: ['   .-~-.    ', '  [.:::.]   ', '  [ ^  ^ ]  ', '  [ -==- ]  ', '  `------`  '] },
  ],
  seq: [0, 0, 1, 0, 0, 0],
};

export const FROST: Species = {
  name: 'frost',
  colorBase: COLOR_BASE,
  colorWarm: COLOR_WARM,
  states: { sleep: SLEEP, idle: IDLE, busy: BUSY, attention: ATTENTION, celebrate: CELEBRATE, dizzy: DIZZY, heart: HEART },
};

// 给用户看的态名（英文、克制、终端感）
export const STATE_LABEL: Record<FrostState, string> = {
  sleep: 'SLEEPING', idle: 'STANDBY', busy: 'WORKING', attention: 'NUDGING',
  celebrate: 'PINNED', dizzy: 'GLITCHED', heart: 'FOND',
};

// ── derive(信号) → 态 ── 纯函数决策树（照搬固件思路）。Pocket Earth 信号映射见端口规格。
export interface FrostSignal {
  busy?: boolean;        // runFrost 正在调度 Skill
  error?: boolean;       // 出错 / 降级（云脑不可用、validator 全判非法）
  reward?: boolean;      // 刚成功落地（一次性脉冲，celebrate）
  attention?: boolean;   // heartbeat 有待你确认的建议
  affection?: boolean;   // 画像共鸣（重温你常钉的）
  asleep?: boolean;      // 长时间空闲 / 隐藏页 / 熄屏
}

export function derive(s: FrostSignal): FrostState {
  if (s.error) return 'dizzy';
  if (s.reward) return 'celebrate';
  if (s.busy) return 'busy';
  if (s.affection) return 'heart';
  if (s.attention) return 'attention';
  if (s.asleep) return 'sleep';
  return 'idle';
}
