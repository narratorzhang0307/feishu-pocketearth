import { useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAPBOX_STYLE } from '../lib/mapbox';
import { applyPublicEarthTheme, applySoftGreenParksTheme, setMapLabelsToChinese } from '../lib/mapboxTheme';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EarthMapProps {
  /** 是否允许拖拽/缩放交互，默认 true */
  interactive?: boolean;
  /** 初始中心点 [lng, lat]，默认南京 */
  center?: [number, number];
  /** 初始缩放级别，默认 2.6（地球整体视图） */
  zoom?: number;
  /** 地图实例创建完成后回调，供父组件做地理锚定的叠加层 */
  onReady?: (map: mapboxgl.Map) => void;
  /** 私人地图使用 globe；公共地球使用编辑桌式世界地图。 */
  theme?: 'private' | 'public';
  className?: string;
}

// 解耦出来的「Pocket Earth」星球底图：Mapbox globe 投影。
// 作为 My Map 的地图底层，UI（网格 / 连线 / 标注 / 卡片）叠加在其上。
export default function EarthMap({
  interactive = true,
  center = [118.793, 32.049],
  zoom = 2.6,
  onReady,
  theme = 'private',
  className,
}: EarthMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // —— 地球自转 ——
  const [spinning, setSpinning] = useState(false);
  const spinningRef = useRef(false);
  const userInteractingRef = useRef(false);
  const spinGlobeRef = useRef<() => void>(() => {});

  // 自转速度（倍率）
  const [spinSpeed, setSpinSpeed] = useState(1);
  const spinSpeedRef = useRef(1);
  const setSpeed = (v: number) => { spinSpeedRef.current = v; setSpinSpeed(v); };

  // 切换地球自转：放大状态下先飞回地球视图再转
  const toggleSpin = () => {
    const v = !spinningRef.current;
    spinningRef.current = v;
    setSpinning(v);
    const m = map.current;
    if (!m) return;
    if (v) {
      if (m.getZoom() > 4.5) {
        // 飞回当前所在区域的地球整体视图，moveend 后自动开始转
        m.flyTo({ center: m.getCenter(), zoom: 2.6, duration: 1600 });
      } else {
        spinGlobeRef.current();
      }
    } else {
      m.stop(); // 停止当前缓动
    }
  };

  // 错误态可见：地图加载中/失败时给可见反馈，而不是首屏一整块纯黑分不清是在加载还是坏了
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    // 私人地图沿用原 Pocket Earth 的 Mapbox globe。缺少 token 时明确失败，
    // 不再静默退化成看似可拖动、实则没有真实地理内容的空白栅格。
    if (!MAPBOX_TOKEN) { setMapError('缺少地图 token'); return; }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: theme === 'public' ? 'mapbox://styles/mapbox/light-v11' : MAPBOX_STYLE,
      projection: theme === 'public' ? 'mercator' : 'globe',
      center,
      zoom,
      minZoom: theme === 'public' ? -1.25 : 0,
      attributionControl: false,
      interactive,
    });
    map.current.on('load', () => setLoaded(true));
    map.current.on('error', (e: { error?: { message?: string } }) => {
      setMapError(e?.error?.message || '地图加载失败');
    });

    map.current.on('style.load', () => {
      if (!map.current) return;
      if (theme === 'public') applyPublicEarthTheme(map.current);
      else applySoftGreenParksTheme(map.current);
      setMapLabelsToChinese(map.current);
      if (theme === 'private') {
        map.current.setFog({
          color: 'rgba(0,0,0,0)',
          'high-color': '#000000',
          'space-color': '#000000',
          'horizon-blend': 0.02,
          'star-intensity': 0,
        } as any);
      }
    });
    map.current.on('load', () => map.current?.resize());

    // 通知父组件地图已就绪，供其挂载地理锚定的叠加层（标定点 / 网格等）
    onReady?.(map.current);

    // 容器尺寸在挂载/Tab 切换动画后才稳定，用 ResizeObserver 持续校正
    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    // —— 地球自转（参考 Mapbox spinning globe：用 moveend 链式 easeTo 实现匀速自转） ——
    const secondsPerRevolution = 120; // 一圈约 120 秒
    const maxSpinZoom = 5;            // 放大超过此级别就不再自转
    const slowSpinZoom = 3;           // 接近此级别时减速
    const spinGlobe = () => {
      const m = map.current;
      if (!m || !spinningRef.current || userInteractingRef.current) return;
      const z = m.getZoom();
      if (z >= maxSpinZoom) return;
      let degreesPerSecond = (360 / secondsPerRevolution) * spinSpeedRef.current;
      if (z > slowSpinZoom) {
        degreesPerSecond *= (maxSpinZoom - z) / (maxSpinZoom - slowSpinZoom);
      }
      const c = m.getCenter();
      c.lng -= degreesPerSecond;
      m.easeTo({ center: c, duration: 1000, easing: (n) => n });
    };
    spinGlobeRef.current = spinGlobe;

    const onInteractStart = () => { userInteractingRef.current = true; };
    const onInteractEnd = () => { userInteractingRef.current = false; spinGlobe(); };
    map.current.on('mousedown', onInteractStart);
    map.current.on('dragstart', onInteractStart);
    map.current.on('mouseup', onInteractEnd);
    map.current.on('touchend', onInteractEnd);
    map.current.on('moveend', spinGlobe);

    return () => {
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={mapContainer}
        className={className}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          background: theme === 'public' ? '#cfd8d1' : '#000000',
          touchAction: 'none',
          pointerEvents: 'auto',
        }}
      />

      {/* 加载中 / 失败的可见反馈（盖在黑色容器上，像素风一致） */}
      {(mapError || !loaded) && (
        <div className={cn('absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 pointer-events-none', theme === 'public' ? 'bg-[#c9c6bd]/90' : 'bg-black/80')}>
          {mapError ? (
            <>
              <div className="w-3 h-3 bg-[#d23b3b] border border-white/60" />
              <div className={cn('text-[11px]', theme === 'public' ? 'text-black/70' : 'text-white/80')}>地图加载失败 · 请检查网络{mapError === '缺少地图 token' ? ' / token' : ''}</div>
            </>
          ) : (
            <div className={cn('w-3 h-3 border border-black/50 animate-pulse', theme === 'public' ? 'bg-[#ff35c9]' : 'bg-[#00ff88]')} />
          )}
        </div>
      )}

      {/* 自转开关 + 速度选择：右上角同一行（速度条在按钮左侧） */}
      <div className="absolute top-4 left-0 right-0 z-20 flex justify-end items-center gap-2 px-4 pointer-events-none">
        {/* 自转速度选择（仅自转时显示） */}
        {spinning && (
          <div className="pointer-events-auto flex items-center gap-1 bg-white/85 backdrop-blur-md rounded-full p-1 shadow-sm border border-black/5 animate-in fade-in slide-in-from-right-2 duration-200">
            {[
              { v: 0.5, label: '0.5×' },
              { v: 1, label: '1×' },
              { v: 2, label: '2×' },
              { v: 4, label: '4×' },
            ].map((s) => (
              <button
                key={s.v}
                onClick={() => setSpeed(s.v)}
                className={cn(
                  'px-3 py-1 rounded-full text-[12px] font-semibold transition-colors',
                  spinSpeed === s.v ? 'bg-[#0A84FF] text-white' : 'text-[#1C1C1E] hover:bg-black/5'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={toggleSpin}
          className={cn(
            'w-10 h-10 shrink-0 rounded-full backdrop-blur-md flex items-center justify-center border shadow-sm pointer-events-auto transition-colors active:scale-95',
            spinning
              ? theme === 'public' ? 'bg-[#35e79a] border-[#b9ffdc]' : 'bg-[#0A84FF] border-[#0A84FF]'
              : theme === 'public' ? 'bg-[#18342b]/90 border-[#7d9b8c]/50' : 'bg-white/80 border-black/5'
          )}
          title="地球自转"
        >
          <Globe
            className={cn('w-5 h-5', spinning ? 'text-white animate-spin' : theme === 'public' ? 'text-[#d9f4e7]' : 'text-[#1C1C1E]')}
            style={spinning ? { animationDuration: '6s' } : undefined}
          />
        </button>
      </div>
    </>
  );
}
