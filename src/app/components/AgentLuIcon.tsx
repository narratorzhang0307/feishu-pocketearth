// agent 头像 · 戴头盔的卡通脸，自包含 SVG、无外部图片依赖。
// 所有 agent 对话里的「agent」一侧统一用它。
export default function AgentLuIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'block' }}>
      {/* 黄底圆 + 黑边 */}
      <circle cx="24" cy="24" r="22" fill="#FFD700" />
      <circle cx="24" cy="24" r="22" stroke="#000000" strokeWidth="3" />

      {/* 头盔主体 银灰 */}
      <ellipse cx="24" cy="26" rx="14" ry="16" fill="#C0C0C0" />
      <ellipse cx="24" cy="26" rx="14" ry="16" stroke="#000000" strokeWidth="2.5" />

      {/* 顶部红色脊鳍 */}
      <path d="M 24 8 L 20 18 L 28 18 Z" fill="#DC143C" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M 24 10 L 22 16 L 26 16 Z" fill="#FF1744" opacity="0.7" />

      {/* 左眼 */}
      <ellipse cx="19" cy="23" rx="3.5" ry="5" fill="#FFFFFF" />
      <ellipse cx="19" cy="23" rx="3.5" ry="5" stroke="#000000" strokeWidth="2" />
      <ellipse cx="18.5" cy="21.5" rx="1.2" ry="1.8" fill="#E0E0E0" />

      {/* 右眼 */}
      <ellipse cx="29" cy="23" rx="3.5" ry="5" fill="#FFFFFF" />
      <ellipse cx="29" cy="23" rx="3.5" ry="5" stroke="#000000" strokeWidth="2" />
      <ellipse cx="28.5" cy="21.5" rx="1.2" ry="1.8" fill="#E0E0E0" />

      {/* 鼻部凸起 */}
      <path d="M 22 30 L 24 28 L 26 30 L 26 32 L 22 32 Z" fill="#A8A8A8" stroke="#000000" strokeWidth="2" strokeLinejoin="round" />

      {/* 嘴（严肃） */}
      <path d="M 20 34 Q 24 33 28 34" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M 19 35 L 20 34" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
      <path d="M 29 35 L 28 34" stroke="#000000" strokeWidth="2" strokeLinecap="round" />

      {/* 标志性胡子 */}
      <path d="M 16 36 Q 19 37 24 37 Q 29 37 32 36" fill="#000000" />
      <path d="M 16 36 Q 19 37 24 37 Q 29 37 32 36" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
      <path d="M 16 36 Q 17 38 19 38" stroke="#000000" strokeWidth="1.5" fill="none" />
      <path d="M 32 36 Q 31 38 29 38" stroke="#000000" strokeWidth="1.5" fill="none" />

      {/* 下颌 */}
      <path d="M 14 32 Q 14 38 24 40 Q 34 38 34 32" fill="#B0B0B0" stroke="#000000" strokeWidth="2" />

      {/* 两侧细节 */}
      <ellipse cx="12" cy="26" rx="2" ry="4" fill="#A0A0A0" stroke="#000000" strokeWidth="1.5" />
      <ellipse cx="36" cy="26" rx="2" ry="4" fill="#A0A0A0" stroke="#000000" strokeWidth="1.5" />
    </svg>
  );
}
