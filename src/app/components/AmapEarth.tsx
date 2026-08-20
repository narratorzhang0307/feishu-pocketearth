import { useEffect, useRef, useState } from 'react';
import { loadAmap, AMAP_STYLE, AMAP_KEY } from '../lib/amap';
import { MAP_MARKERS, KIND_COLOR, ensureHeavyMarkers } from '../data/mapMarkers';

interface AmapEarthProps {
  /** 是否允许拖拽 / 缩放，默认 true */
  interactive?: boolean;
  /** 初始中心点 [lng, lat]，默认南京。高德用 [经度, 纬度] */
  center?: [number, number];
  /** 初始缩放级别，默认 3 */
  zoom?: number;
  /** 地图就绪回调（返回 AMap.Map 实例） */
  onReady?: (map: unknown) => void;
  className?: string;
}

// 高德（AMap）底图版：与 EarthMap（Mapbox）平行的实现，由 MAP_PROVIDER 开关选用。
// loadAmap() 注入高德 JSAPI 2.0，new AMap.Map 建图，
// 再把 Pocket Earth 的落点用 AMap.CircleMarker 画到高德底图上。key 全部来自 env，不写死。
export default function AmapEarth({
  interactive = true,
  center = [118.793, 32.049],
  zoom = 3,
  onReady,
  className,
}: AmapEarthProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadAmap()
      .then((AMapNs) => {
        if (cancelled || !containerRef.current) return;
        // AMap 全局命名空间（JSAPI 2.0）。用 any 断言避免引入官方 types 依赖。
        const AMap = AMapNs as any;
        const map = new AMap.Map(containerRef.current, {
          viewMode: '3D',
          center, // 高德同样是 [lng, lat]
          zoom: Math.max(3, zoom),
          mapStyle: AMAP_STYLE,
          dragEnable: interactive,
          zoomEnable: interactive,
          showLabel: true,
        });
        mapRef.current = map;

        map.on('complete', () => {
          if (cancelled) return;
          setLoaded(true);
          drawMarkers(AMap, map);
          onReady?.(map);
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setMapError(e instanceof Error ? e.message : '高德地图加载失败');
      });

    return () => {
      cancelled = true;
      const m = mapRef.current as { destroy?: () => void } | null;
      m?.destroy?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 把统一落点数据画成高德的 CircleMarker（按 kind 上色，与 Mapbox 版一致）。
  async function drawMarkers(AMap: any, map: any) {
    try {
      await ensureHeavyMarkers(); // 动态加电影 / 书的重型点，失败不致命
    } catch {
      /* 重型点加载失败：只画已就绪的音乐 / 照片点 */
    }
    const markers = MAP_MARKERS.map(
      (m) =>
        new AMap.CircleMarker({
          center: [m.lng, m.lat],
          radius: 4,
          fillColor: KIND_COLOR[m.kind] || '#00ff88',
          fillOpacity: 0.9,
          strokeColor: '#000000',
          strokeWeight: 1,
          cursor: 'pointer',
          bubble: true,
        }),
    );
    map.add(markers);
  }

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#000000' }}
      />

      {/* 加载中 / 失败的可见反馈，与 Mapbox 版一致的像素风 */}
      {(mapError || !loaded) && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-black/80 pointer-events-none px-6 text-center">
          {mapError ? (
            <>
              <div className="w-3 h-3 bg-[#d23b3b] border border-white/60" />
              <div className="text-[11px] text-white/80">
                高德地图加载失败 · {mapError}
                {!AMAP_KEY ? '（未配置 VITE_AMAP_KEY）' : ''}
              </div>
            </>
          ) : (
            <div className="w-3 h-3 bg-[#00e5ff] border border-white/40 animate-pulse" />
          )}
        </div>
      )}

      {/* 左下角 provider 水印：肉眼可证当前底图正是高德地图 */}
      {loaded && (
        <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded bg-black/60 text-[10px] text-[#00e5ff] font-mono pointer-events-none">
          MAP: AMap / 高德地图
        </div>
      )}
    </>
  );
}
