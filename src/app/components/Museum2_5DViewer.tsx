import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  MUSEUM_2_5D_DEMOS,
  Museum2_5DDetailHotspot,
  hotspotVisibleAtYaw,
  museum2_5DDemoFromUrl,
  nearestObservedView,
  signedYawDelta,
  wrapYaw,
} from '../lib/exhibition/museum2_5d';
import { explainConfirmedArtifactInscription, runArtifactInscriptionPipeline } from '../lib/exhibition/artifactInscription';

const vertexShader = `
  uniform sampler2D depthMap;
  uniform float depthScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float depth = texture2D(depthMap, uv).r;
    vec3 displaced = position;
    displaced.z += (depth - 0.5) * depthScale * step(0.003, depth);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D colorMap;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(colorMap, vUv);
    if (color.a < 0.02) discard;
    gl_FragColor = color;
  }
`;

type Museum2_5DViewerProps = {
  compact?: boolean;
  fill?: boolean;
  assetUrl?: string;
  hotspots?: Museum2_5DDetailHotspot[];
  initialHotspotId?: string;
  hideDemoSwitch?: boolean;
};

type AssetQualityGate = 'checking' | 'pass' | 'legacy' | 'reject';

export default function Museum2_5DViewer({
  compact = false,
  fill = false,
  assetUrl,
  hotspots,
  initialHotspotId,
  hideDemoSwitch = false,
}: Museum2_5DViewerProps) {
  const initialDemo = museum2_5DDemoFromUrl(assetUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);
  const yawRef = useRef(initialDemo.views[0]?.yawDeg || 0);
  const draggingRef = useRef(false);
  const dragXRef = useRef(0);
  const [demoId, setDemoId] = useState(initialDemo.id);
  const [yaw, setYaw] = useState(initialDemo.views[0]?.yawDeg || 0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [runtimeHotspots, setRuntimeHotspots] = useState<Museum2_5DDetailHotspot[]>(initialDemo.hotspots);
  const [activeHotspot, setActiveHotspot] = useState<Museum2_5DDetailHotspot | null>(null);
  const [readingInscription, setReadingInscription] = useState(false);
  const [readingError, setReadingError] = useState('');
  const [assetQualityGate, setAssetQualityGate] = useState<AssetQualityGate>('checking');
  const [showOriginal, setShowOriginal] = useState(false);
  const selectedDemo = MUSEUM_2_5D_DEMOS.find((demo) => demo.id === demoId) || MUSEUM_2_5D_DEMOS[0];
  const activeView = useMemo(() => nearestObservedView(yaw, selectedDemo.views), [selectedDemo, yaw]);
  const activeHotspots = hotspots || runtimeHotspots;
  const visibleHotspots = useMemo(
    () => activeHotspots.filter((hotspot) => hotspotVisibleAtYaw(yaw, hotspot)),
    [activeHotspots, yaw],
  );

  useEffect(() => { yawRef.current = yaw; }, [yaw]);
  useEffect(() => {
    const next = museum2_5DDemoFromUrl(assetUrl);
    setDemoId(next.id);
  }, [assetUrl]);
  useEffect(() => {
    const nextYaw = selectedDemo.views[0]?.yawDeg || 0;
    yawRef.current = nextYaw;
    setYaw(nextYaw);
    setRuntimeHotspots(selectedDemo.hotspots);
    setActiveHotspot(null);
    setReadingError('');
    setReady(false);
    setShowOriginal(false);
  }, [selectedDemo]);

  useEffect(() => {
    if (!initialHotspotId) return;
    const nextHotspot = (hotspots || selectedDemo.hotspots).find((item) => item.id === initialHotspotId);
    if (!nextHotspot) return;
    yawRef.current = nextHotspot.yawDeg;
    setYaw(nextHotspot.yawDeg);
    setPaused(true);
    setActiveHotspot(nextHotspot);
  }, [hotspots, initialHotspotId, selectedDemo]);

  useEffect(() => {
    let cancelled = false;
    setAssetQualityGate('checking');
    fetch(selectedDemo.manifestUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`manifest ${response.status}`);
        return response.json();
      })
      .then((manifest) => {
        if (cancelled) return;
        const gate = manifest?.quality_gate;
        if (!gate) {
          setAssetQualityGate('legacy');
          return;
        }
        const viewsAccepted = Array.isArray(manifest?.views)
          && manifest.views.length > 0
          && manifest.views.every((view: any) => view?.alpha_quality?.accepted_for_2_5d === true);
        setAssetQualityGate(gate.status === 'pass' && gate.eligible_for_2_5d === true && viewsAccepted ? 'pass' : 'reject');
      })
      .catch(() => { if (!cancelled) setAssetQualityGate('reject'); });
    return () => { cancelled = true; };
  }, [selectedDemo.manifestUrl]);

  const replaceHotspot = (next: Museum2_5DDetailHotspot) => {
    setRuntimeHotspots((current) => current.map((item) => item.id === next.id ? next : item));
    setActiveHotspot(next);
  };

  const readDetailPhoto = async (file?: File) => {
    if (!file || !activeHotspot || readingInscription) return;
    const imageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!imageUrl) { setReadingError('无法读取细节照片'); return; }
    const captured = { ...activeHotspot, detailPhotoUrl: imageUrl };
    replaceHotspot(captured);
    setReadingInscription(true);
    setReadingError('');
    try {
      const result = await runArtifactInscriptionPipeline(imageUrl);
      replaceHotspot({
        ...captured,
        ocr: {
          rawText: result.rawText,
          normalizedText: result.normalizedText,
          modernText: result.modernText,
          confidence: result.confidence,
          baseCandidate: result.baseCandidate,
          loraCandidate: result.loraCandidate,
          source: result.source,
          needsConfirmation: result.needsConfirmation,
          gateReason: result.gateReason,
          languageGateReason: result.languageGateReason,
          semanticSource: result.semanticSource,
        },
      });
    } catch {
      setReadingError('端侧 Qwen 未就绪；细节照已保留，可稍后重试');
    } finally {
      setReadingInscription(false);
      if (detailInputRef.current) detailInputRef.current.value = '';
    }
  };

  const confirmInscriptionCandidate = async (rawText: string, source: 'base-fallback' | 'rubbing-lora') => {
    if (!activeHotspot?.ocr || !rawText || readingInscription) return;
    setReadingInscription(true);
    setReadingError('');
    try {
      const language = await explainConfirmedArtifactInscription(rawText);
      replaceHotspot({
        ...activeHotspot,
        ocr: {
          ...activeHotspot.ocr,
          rawText,
          ...language,
          source,
          needsConfirmation: false,
          confidence: Math.max(activeHotspot.ocr.confidence, 0.72),
          gateReason: `用户已确认 ${source === 'rubbing-lora' ? '碑拓 LoRA' : 'Base'} 候选；原生 Qwen 仅做断句与今译`,
        },
      });
    } catch {
      setReadingError('候选已保留，但原生 Qwen 断句解释暂未完成');
    } finally {
      setReadingInscription(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !['pass', 'legacy'].includes(assetQualityGate)) return;
    let stopped = false;
    let frame = 0;
    // `three` is intentionally declared as a lightweight vendor module in this
    // app, so keep runtime handles structural instead of depending on @types.
    let renderer: any = null;
    let material: any = null;
    let geometry: any = null;
    let resizeObserver: ResizeObserver | null = null;
    const textures: any[] = [];
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
      const resize = () => {
        const width = Math.max(1, canvas.clientWidth || 420);
        const height = Math.max(1, canvas.clientHeight || 320);
        const aspect = width / height;
        renderer?.setSize(width, height, false);
        camera.aspect = aspect;
        camera.position.set(0, 0.03, Math.max(4.1, 1.82 / (2 * Math.tan(THREE.MathUtils.degToRad(14)) * aspect) * 1.08));
        camera.updateProjectionMatrix();
      };
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      // Keep the complete capture inside the narrow phone viewport.  The
      // previous 2.45 plane exceeded the camera frustum and cropped the jar's
      // handles, which made the 2.5D proof look like a texture close-up.
      geometry = new THREE.PlaneGeometry(1.82, 1.82, 112, 112);
      const loader = new THREE.TextureLoader();
      Promise.all([
        loader.loadAsync(activeView.colorUrl),
        loader.loadAsync(activeView.depthUrl),
      ]).then(([color, depth]) => {
        if (stopped) { color.dispose(); depth.dispose(); return; }
        color.colorSpace = THREE.SRGBColorSpace;
        depth.colorSpace = THREE.NoColorSpace;
        textures.push(color, depth);
        material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: true,
          uniforms: { colorMap: { value: color }, depthMap: { value: depth }, depthScale: { value: 0.12 } },
          vertexShader,
          fragmentShader,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry!, material);
        scene.add(mesh);
        setReady(true);
        const animate = () => {
          if (stopped || !renderer) return;
          if (!draggingRef.current && !paused) {
            yawRef.current = wrapYaw(yawRef.current + 0.075);
            if (Math.round(yawRef.current * 5) % 5 === 0) setYaw(yawRef.current);
          }
          const residual = signedYawDelta(activeView.yawDeg, yawRef.current);
          mesh.rotation.y = THREE.MathUtils.degToRad(Math.max(-24, Math.min(24, residual * 0.45)));
          mesh.rotation.x = Math.sin(performance.now() / 2100) * 0.025;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };
        animate();
      }).catch(() => setReady(false));
    } catch {
      setReady(false);
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      material?.dispose();
      geometry?.dispose();
      textures.forEach((texture) => texture.dispose());
      resizeObserver?.disconnect();
      renderer?.dispose();
    };
  }, [activeView.id, activeView.colorUrl, activeView.depthUrl, activeView.yawDeg, assetQualityGate, paused]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    dragXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = wrapYaw(yawRef.current + (event.clientX - dragXRef.current) * 0.48);
    dragXRef.current = event.clientX;
    yawRef.current = next;
    setYaw(next);
  };
  const stopDrag = () => { draggingRef.current = false; };

  return (
    <div
      className={`relative ${fill ? 'h-full min-h-[420px]' : compact ? 'h-[214px]' : 'h-[292px]'} select-none overflow-hidden ${compact ? '' : 'border-2 border-black'} bg-[radial-gradient(circle_at_50%_42%,#fff8db_0,#d9d1c3_55%,#b9b0a3_100%)] cursor-ew-resize`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      aria-label={`${selectedDemo.label}的 ${selectedDemo.views.length} 个实际观察视角 2.5D 旋转预览`}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-black/20 bg-white/75 px-3 py-2 backdrop-blur-sm">
        <span className="font-pixel text-[7px] tracking-widest">{selectedDemo.label} · {Math.round(yaw)}°</span>
        <div className="flex items-center gap-1">
          {activeView.originalUrl && (
            <button
              type="button"
              className={`border border-black px-1.5 py-0.5 font-pixel text-[6px] ${showOriginal ? 'bg-[#ffd166]' : 'bg-white'}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setPaused(true);
                setShowOriginal((value) => !value);
              }}
            >
              {showOriginal ? '返回抠图' : '原图对照'}
            </button>
          )}
          <button
            type="button"
            className="border border-black bg-white px-1.5 py-0.5 font-pixel text-[6px]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setPaused((value) => !value); }}
          >
            {paused ? '继续转动' : '暂停'}
          </button>
          <span className={`border border-black px-1.5 py-0.5 font-pixel text-[6px] ${assetQualityGate === 'reject' ? 'bg-[#ff8b7c]' : assetQualityGate === 'checking' ? 'bg-[#ffd166]' : 'bg-[#7CFF6B]'}`}>
            {assetQualityGate === 'pass' ? '抠图自检通过' : assetQualityGate === 'legacy' ? 'MNN FP16' : assetQualityGate === 'reject' ? '已回退静态帧' : '自检中'}
          </span>
        </div>
      </div>
      {!hideDemoSwitch && <div className="absolute left-2 right-2 top-10 z-30 flex gap-1 overflow-x-auto pb-1" aria-label="切换 2.5D 展品示例">
        {MUSEUM_2_5D_DEMOS.map((demo) => (
          <button
            key={demo.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setDemoId(demo.id); setPaused(false); }}
            className={`shrink-0 border border-black px-1.5 py-1 font-pixel text-[6px] shadow-[1px_1px_0_#000] ${demo.id === selectedDemo.id ? 'bg-[#7CFF6B]' : 'bg-white/90'}`}
          >
            {demo.label}
          </button>
        ))}
      </div>}
      <img
        src={activeView.colorUrl}
        alt={`${selectedDemo.label}自动抠除背景视角`}
        className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${compact ? 'p-8' : 'p-10'} transition-opacity ${ready && !showOriginal ? 'opacity-0' : showOriginal ? 'opacity-0' : 'opacity-100'}`}
      />
      <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full transition-opacity ${showOriginal ? 'opacity-0' : 'opacity-100'}`} />
      {showOriginal && activeView.originalUrl && (
        <img
          src={activeView.originalUrl}
          alt={`${selectedDemo.label} ${activeView.yawDeg} 度原始照片`}
          className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-contain ${compact ? 'p-8' : 'p-10'}`}
        />
      )}
      {assetQualityGate === 'reject' && (
        <div className="pointer-events-none absolute left-1/2 top-[68px] z-30 -translate-x-1/2 border-2 border-black bg-[#fff0ec] px-2 py-1 font-pixel text-[6px] text-[#8b1e12] shadow-[2px_2px_0_#000]">
          透明底完整性门禁未通过 · 禁止深度变形
        </div>
      )}
      <div className={`pointer-events-none absolute inset-0 z-20 ${showOriginal ? 'hidden' : ''}`}>
        {visibleHotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            aria-label={`查看${hotspot.title}`}
            className="pointer-events-auto group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setPaused(true);
              setActiveHotspot(hotspot);
            }}
          >
            <span className="absolute inset-[-7px] animate-ping rounded-full border border-black/40 bg-[#ff5e57]/30" />
            <span className="relative grid h-7 w-7 place-items-center rounded-full border-2 border-black bg-[#ff5e57] font-pixel text-[9px] text-white shadow-[2px_2px_0_#000]">＋</span>
            <span className="pointer-events-none absolute left-1/2 top-8 hidden -translate-x-1/2 whitespace-nowrap border border-black bg-white px-2 py-1 font-pixel text-[6px] shadow-[2px_2px_0_#000] group-hover:block">
              独立细节照
            </span>
          </button>
        ))}
      </div>
      {activeHotspot && (
        <aside
          className={`absolute ${compact ? 'bottom-9 left-2 right-2' : 'bottom-11 left-3 right-3'} z-30 border-2 border-black bg-[#fffdf2]/95 p-2.5 shadow-[3px_3px_0_#000] backdrop-blur-sm`}
          aria-label="展品独立细节照"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            {activeHotspot.detailPhotoUrl ? (
              <img src={activeHotspot.detailPhotoUrl} alt={activeHotspot.title} className="h-14 w-14 border border-black object-cover" />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center border border-dashed border-black bg-[#efe8d1] text-center font-pixel text-[6px] leading-tight">单独<br />补拍</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-black text-xs">{activeHotspot.title}</div>
              <div className="mt-1 font-pixel text-[6px] leading-relaxed text-black/65">
                {activeHotspot.detailPhotoUrl
                  ? '独立细节照片已附着到当前角度；只将这张照片送入铭文 / 纹饰识别。'
                  : '此处只保存细节拍摄槽位，不会把 6–8 张环绕重建照裁切后冒充细节。'}
              </div>
              {activeHotspot.ocr && (
                <div className="mt-1 border-t border-black/20 pt-1">
                  <div className="flex items-center gap-1">
                    <span className={`border border-black px-1 py-0.5 font-pixel text-[5px] ${activeHotspot.ocr.needsConfirmation ? 'bg-[#ffd166]' : 'bg-[#7CFF6B]'}`}>
                      {activeHotspot.ocr.needsConfirmation
                        ? '双候选待确认'
                        : activeHotspot.ocr.source === 'base-fallback'
                          ? '质量门控 · BASE 回退'
                          : activeHotspot.ocr.source === 'manual'
                            ? '双路门控 · 已确认'
                            : activeHotspot.ocr.source === 'agreement'
                              ? '双路一致 · 自动通过'
                              : '质量门控 · LORA 命中'}
                    </span>
                    <span className="font-pixel text-[5px] text-black/55">{Math.round(activeHotspot.ocr.confidence * 100)}%</span>
                  </div>
                  {activeHotspot.ocr.needsConfirmation ? (
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] leading-tight">
                      <button
                        type="button"
                        disabled={!activeHotspot.ocr.baseCandidate || readingInscription}
                        className="border border-black/30 bg-white p-1 text-left disabled:opacity-40"
                        onClick={() => void confirmInscriptionCandidate(activeHotspot.ocr?.baseCandidate || '', 'base-fallback')}
                      >
                        <b className="font-pixel text-[5px]">BASE · 点击确认</b><br />{activeHotspot.ocr.baseCandidate || '未读出'}
                      </button>
                      <button
                        type="button"
                        disabled={!activeHotspot.ocr.loraCandidate || readingInscription}
                        className="border border-black/30 bg-[#e5f5ec] p-1 text-left disabled:opacity-40"
                        onClick={() => void confirmInscriptionCandidate(activeHotspot.ocr?.loraCandidate || '', 'rubbing-lora')}
                      >
                        <b className="font-pixel text-[5px]">RUBBING LORA · 点击确认</b><br />{activeHotspot.ocr.loraCandidate || '未读出'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 font-serif text-xs">{activeHotspot.ocr.normalizedText || activeHotspot.ocr.rawText}</div>
                      {activeHotspot.ocr.modernText && <div className="mt-1 text-[9px] leading-relaxed text-black/65">{activeHotspot.ocr.modernText}</div>}
                    </>
                  )}
                  {activeHotspot.ocr.gateReason && <div className="mt-1 font-pixel text-[5px] leading-relaxed text-black/45">{activeHotspot.ocr.gateReason}</div>}
                  {activeHotspot.ocr.languageGateReason && <div className="mt-1 border border-[#b42318]/30 bg-[#fff0ec] p-1 font-pixel text-[5px] leading-relaxed text-[#8b1e12]">{activeHotspot.ocr.languageGateReason}</div>}
                </div>
              )}
              {readingInscription && <div className="mt-1 font-pixel text-[6px] text-[#5A8F7B]">端侧 Base ↔ 碑拓 LoRA 对照中…</div>}
              {readingError && <div className="mt-1 text-[8px] text-[#b42318]">{readingError}</div>}
              <button
                type="button"
                disabled={readingInscription}
                className="mt-1.5 border border-black bg-black px-2 py-1 font-pixel text-[6px] text-white disabled:opacity-40"
                onClick={() => detailInputRef.current?.click()}
              >
                {activeHotspot.detailPhotoUrl ? '重拍铭文细节' : '单独近拍铭文'}
              </button>
              <input
                ref={detailInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => void readDetailPhoto(event.target.files?.[0])}
              />
            </div>
            <button
              type="button"
              aria-label="关闭细节"
              className="grid h-6 w-6 shrink-0 place-items-center border border-black bg-white font-black"
              onClick={() => { setActiveHotspot(null); setPaused(false); }}
            >
              ×
            </button>
          </div>
        </aside>
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 border border-black bg-white/80 px-2 py-1 font-pixel text-[6px] tracking-wider">
        左右拖动 · 大角度切换实拍视角 · 红点查看独立细节
      </div>
      <div className="absolute bottom-10 left-3 right-3 flex justify-center gap-1.5">
        {selectedDemo.views.map((view) => (
          <button
            key={view.id}
            aria-label={`查看 ${view.yawDeg} 度实拍视角`}
            onClick={(event) => {
              event.stopPropagation();
              setPaused(true);
              yawRef.current = view.yawDeg;
              setYaw(view.yawDeg);
            }}
            className={`h-2.5 w-2.5 rounded-full border border-black ${view.id === activeView.id ? 'bg-black' : 'bg-white/80'}`}
          />
        ))}
      </div>
    </div>
  );
}
