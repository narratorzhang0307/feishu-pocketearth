import type { FrostTheme } from '../../../frost-agent/buddy/themes';

const PERSONA_ALT = [
  '日落电台 Frost', '书房学者 Frost', '北欧极光 Frost', '影像记录 Frost', '爵士夜行 Frost', '文化策展 Frost',
  '城市探险 Frost', '漫游旅人 Frost', '经典叙事 Frost', '星光广播 Frost', '创作街 Frost', '地球守望 Frost',
] as const;

export function personaVariantForTheme(theme: FrostTheme, seed = 0): number {
  const base: Record<FrostTheme, number> = {
    none: 4, music: 0, movie: 6, book: 1, photo: 3, travel: 7, cosmos: 11, mood: 8, culture: 5,
  };
  return (base[theme] + Math.abs(seed)) % 12;
}

export default function FrostPersona({
  variant = 4,
  size = 72,
  contentScale = 1,
  className = '',
}: {
  variant?: number;
  size?: number;
  contentScale?: number;
  className?: string;
}) {
  const safe = ((Math.round(variant) % 12) + 12) % 12;
  const sheet = safe < 6 ? 1 : 2;
  const cell = safe % 6;
  const col = cell % 3;
  const row = Math.floor(cell / 3);
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-[#F6F0E4] ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={PERSONA_ALT[safe]}
    >
      <img
        src={`/frost-personas/frost-personas-0${sheet}.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          width: `${300 * contentScale}%`,
          height: `${200 * contentScale}%`,
          left: `${50 - (col + 0.5) * 100 * contentScale}%`,
          top: `${50 - (row + 0.5) * 100 * contentScale}%`,
        }}
      />
    </div>
  );
}
