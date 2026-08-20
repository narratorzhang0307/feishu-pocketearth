import type { AvatarSpec, Mouth, Accessory } from '../council/agents';

// 程序化像素头像：按 AvatarSpec 画一张 12×12 网格的像素脸 + 一件「梗」配件。
// 纯 SVG rect，crispEdges 保持像素感；无外部图片依赖。

const INK = '#1a1a1a';

function Mouth({ kind }: { kind: Mouth }) {
  if (kind === 'flat') return <rect x={4.2} y={8.2} width={3.6} height={0.8} fill={INK} />;
  if (kind === 'oh') return <rect x={5} y={7.8} width={2} height={2} fill={INK} />;
  if (kind === 'grin') return (
    <>
      <rect x={3.8} y={7.8} width={4.4} height={1.3} fill={INK} />
      <rect x={4.4} y={8} width={3.2} height={0.5} fill="#fff" />
    </>
  );
  // smile（U 形）
  return (
    <>
      <rect x={4} y={7.8} width={0.9} height={0.9} fill={INK} />
      <rect x={7.1} y={7.8} width={0.9} height={0.9} fill={INK} />
      <rect x={4.8} y={8.7} width={2.4} height={0.9} fill={INK} />
    </>
  );
}

function Accessory({ kind, color }: { kind: Accessory; color: string }) {
  switch (kind) {
    case 'glasses':
      return (
        <g stroke={INK} strokeWidth={0.5} fill="rgba(255,255,255,0.5)">
          <rect x={3.1} y={4.6} width={2.3} height={2.1} />
          <rect x={6.6} y={4.6} width={2.3} height={2.1} />
          <line x1={5.4} y1={5.5} x2={6.6} y2={5.5} />
        </g>
      );
    case 'film':
      return (
        <g>
          <rect x={1.8} y={0.6} width={8.4} height={1.7} fill={INK} />
          {[2.4, 3.6, 4.8, 6, 7.2, 8.4].map((x) => <rect key={x} x={x} y={1.1} width={0.7} height={0.7} fill="#fff" />)}
        </g>
      );
    case 'headphones':
      return (
        <g>
          <rect x={2} y={1.2} width={8} height={1} fill={INK} />
          <rect x={1.1} y={4.8} width={1.4} height={2.8} fill={INK} />
          <rect x={9.5} y={4.8} width={1.4} height={2.8} fill={INK} />
          <rect x={1.3} y={5.2} width={1} height={2} fill={color} />
          <rect x={9.7} y={5.2} width={1} height={2} fill={color} />
        </g>
      );
    case 'camera':
      return (
        <g>
          <rect x={3.6} y={7.2} width={4.8} height={3} fill="#262626" stroke={INK} strokeWidth={0.4} />
          <circle cx={6} cy={8.8} r={1} fill="#8a8a8a" stroke={INK} strokeWidth={0.3} />
          <rect x={4.1} y={7.6} width={0.7} height={0.7} fill="#fff" />
        </g>
      );
    case 'compass': // 探险帽
      return (
        <g>
          <rect x={1.4} y={3} width={9.2} height={0.8} fill="#6b5330" />
          <rect x={2.8} y={1.1} width={6.4} height={2.1} fill="#8a6a3a" stroke={INK} strokeWidth={0.3} />
          <rect x={2.8} y={2.4} width={6.4} height={0.6} fill={color} />
        </g>
      );
    case 'antenna': // 外星触角
      return (
        <g>
          <rect x={3.4} y={0.2} width={0.5} height={1.9} fill={INK} />
          <rect x={8.1} y={0.2} width={0.5} height={1.9} fill={INK} />
          <circle cx={3.65} cy={0.3} r={0.7} fill={color} />
          <circle cx={8.35} cy={0.3} r={0.7} fill={color} />
        </g>
      );
    case 'gavel': // 法槌
      return (
        <g stroke={INK} strokeWidth={0.3}>
          <rect x={8.9} y={4.4} width={2.4} height={1.3} fill="#9a6a3a" transform="rotate(-20 10 5)" />
          <rect x={9.3} y={5.4} width={0.7} height={3} fill="#7a5226" transform="rotate(-20 9.6 7)" />
        </g>
      );
    case 'horns': // 抬杠犄角
      return (
        <g fill="#c4382e">
          <polygon points="2.8,2.2 3.7,0.2 4.6,2.2" />
          <polygon points="7.4,2.2 8.3,0.2 9.2,2.2" />
        </g>
      );
    default:
      return null;
  }
}

export default function PixelAvatar({ spec, size = 40, ring }: { spec: AvatarSpec; size?: number; ring?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      style={{ background: '#EAEAEA', border: `2px solid ${ring || '#1a1a1a'}`, display: 'block' }}
    >
      {/* 脸 */}
      <rect x={2} y={2} width={8} height={8} fill={spec.bg} stroke={INK} strokeWidth={0.5} />
      {/* 腮红 */}
      <rect x={2.6} y={6.6} width={1.1} height={0.8} fill="rgba(0,0,0,0.08)" />
      <rect x={8.3} y={6.6} width={1.1} height={0.8} fill="rgba(0,0,0,0.08)" />
      {/* 眼睛 */}
      <rect x={4} y={5} width={1} height={1.2} fill={INK} />
      <rect x={7} y={5} width={1} height={1.2} fill={INK} />
      <rect x={4.2} y={5.1} width={0.35} height={0.4} fill="#fff" />
      <rect x={7.2} y={5.1} width={0.35} height={0.4} fill="#fff" />
      <Mouth kind={spec.mouth} />
      <Accessory kind={spec.accessory} color={ring || '#1a1a1a'} />
    </svg>
  );
}
