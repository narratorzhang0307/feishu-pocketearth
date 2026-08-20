// 用户头像 ·「猹」——给「你」一个好玩的化身。
// 纯 SVG、无外部图片依赖；方形黑边 + 米色纸底，与圆桌像素头像（PixelAvatar）同一套视觉。
export default function UserZhaIcon({ size = 34, ring = '#1a1a1a' }: { size?: number; ring?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"
      style={{ background: '#fdfbf2', border: `2px solid ${ring}`, display: 'block' }}
    >
      <text
        x="24" y="26" textAnchor="middle" dominantBaseline="central"
        fontSize="30" fontWeight={900} fill="#1a1a1a"
        fontFamily="'PingFang SC','Noto Sans SC','SimHei','Microsoft YaHei',sans-serif"
        style={{ letterSpacing: '-0.5px' }}
      >猹</text>
    </svg>
  );
}
