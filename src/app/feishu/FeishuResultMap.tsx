import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { type MapMouseEvent, type MapboxGeoJSONFeature } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Globe2, Loader2 } from 'lucide-react';
import type { ExtractedLocation } from './types';

type Props = { locations: ExtractedLocation[] };

type PlaceProperties = {
  title: string;
  evidence: string;
  page: number;
  confidence: number;
};

export default function FeishuResultMap({ locations }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const plotted = useMemo(
    () => locations.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
    [locations],
  );

  useEffect(() => {
    if (!containerRef.current || !plotted.length) return undefined;
    const token = String(import.meta.env.VITE_MAPBOX_TOKEN || '');
    if (!token) { setState('error'); return undefined; }
    mapboxgl.accessToken = token;
    const first = plotted[0];
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      projection: 'mercator',
      center: [Number(first.longitude), Number(first.latitude)],
      zoom: plotted.length === 1 ? 8 : 2,
      attributionControl: true,
    });

    const sourceData = {
      type: 'FeatureCollection' as const,
      features: plotted.map((location) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [Number(location.longitude), Number(location.latitude)] },
        properties: {
          title: location.modernName || location.nameAsWritten,
          evidence: location.evidence,
          page: location.page,
          confidence: location.confidence,
        } satisfies PlaceProperties,
      })),
    };

    map.on('load', () => {
      map.addSource('feishu-results', { type: 'geojson', data: sourceData });
      map.addLayer({
        id: 'feishu-result-halo', type: 'circle', source: 'feishu-results',
        paint: { 'circle-radius': 13, 'circle-color': '#ec4899', 'circle-opacity': 0.18 },
      });
      map.addLayer({
        id: 'feishu-result-points', type: 'circle', source: 'feishu-results',
        paint: { 'circle-radius': 6, 'circle-color': '#ec4899', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'feishu-result-labels', type: 'symbol', source: 'feishu-results',
        layout: { 'text-field': ['get', 'title'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      });
      if (plotted.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        for (const location of plotted) bounds.extend([Number(location.longitude), Number(location.latitude)]);
        map.fitBounds(bounds, { padding: 56, maxZoom: 10, duration: 0 });
      }
      setState('ready');
    });
    map.on('error', () => setState((current) => current === 'ready' ? current : 'error'));

    const showEvidence = (event: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const properties = feature.properties as PlaceProperties | null;
      if (!properties) return;
      const evidence = String(properties.evidence || '').replace(/[<>&]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[character] || character);
      const title = String(properties.title || '').replace(/[<>&]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[character] || character);
      new mapboxgl.Popup({ closeButton: true, maxWidth: '280px' })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>${title}</strong><p style="margin:6px 0 0;font-size:12px;line-height:1.5">第 ${properties.page} 页 · ${Math.round(Number(properties.confidence) * 100)}%</p><p style="margin:6px 0 0;font-size:12px;line-height:1.5">“${evidence}”</p>`)
        .addTo(map);
    };
    map.on('click', 'feishu-result-points', showEvidence);
    map.on('mouseenter', 'feishu-result-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'feishu-result-points', () => { map.getCanvas().style.cursor = ''; });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); };
  }, [plotted]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Knowledge Earth · Real Map</p><h3 className="mt-1 text-lg font-bold">材料里的地点，已经回到真实地图</h3></div>
        <Globe2 className="h-8 w-8 text-emerald-300" />
      </div>
      <div className="relative h-80 bg-slate-900">
        <div ref={containerRef} className="absolute inset-0" />
        {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />正在加载真实底图…</div>}
        {state === 'error' && <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-300">真实底图加载失败，任务证据和飞书写回结果仍然有效。</div>}
      </div>
      {state === 'ready' && <p className="border-t border-white/10 px-5 py-3 text-xs text-slate-400">点击粉色地点可查看原文页码、置信度和证据。</p>}
    </section>
  );
}
