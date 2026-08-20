// 重返现场 · 全屏 AR 组件（三模式一套场景）
// ─────────────────────────────────────────────────────────────────────────────
// webxr  ：安卓 Chrome 真 AR —— immersive-ar + hit-test 找平面，点击放置照片群（dom-overlay HUD）
// pseudo ：iOS/无 WebXR 降级 —— getUserMedia 相机背景 + 透明 WebGL 叠加（诗歌树 PoemTreeARView 三坑已修：
//          await 回来已卸载要停 tracks / ref 已空要停 / 拒权降级不抛错）+ 可选陀螺仪视差（手势内请求权限）
// preview：桌面/无相机 —— 渐变背景 + 拖动环视 + 滚轮缩放（demo 视频录制路径）
//
// 照片布局由 lib/arphoto/layout.ts 程序化生成（对标 XOSMO Lab 用 Blender 手排"垂吊照片墙"——排版这步
// 我们用确定性算法替掉，整条链路零建模软件）。相框是像素新粗野风拍立得（canvas 合成 CanvasTexture）。
//
// 工程契约：three 只在 effect 内动态 import（vite manualChunks → splat3d 懒块，不进首屏）；
// 卸载严格清理（setAnimationLoop(null)/session.end/stop tracks/dispose+forceContextLoss/disposed 旗标）；
// 相机帧与照片像素零上云；WebXR 会话必须在用户手势链上发起（视图内"开始 AR"按钮，不隔 await 抢跑）。
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ArMode, ArLayoutKind, ArPose } from '../lib/arphoto/types';
import { layoutFor } from '../lib/arphoto/layout';

const CYAN = '#00e5ff';

interface ARPhotoViewProps {
  mode: ArMode;
  layout: ArLayoutKind;
  photos: { id: string; image: string }[];
  title?: string;
  seed: string;                         // 布局确定性种子（锚点 id）——重访贴合时布局不跳变
  placeLabel?: string;                  // 放置按钮文案（重访时传"重新贴合到这里"）
  onPlaced?: (pose: ArPose | null) => void;
  onClose: () => void;
}

// ── WebXR 最小类型垫片（TS lib.dom 不含 WebXR；只声明用到的面） ──
interface XRHitTestSourceLike { cancel?: () => void }
interface XRPoseLike { transform: { matrix: Float32Array | number[] } }
interface XRFrameLike { getHitTestResults(src: XRHitTestSourceLike): Array<{ getPose(ref: unknown): XRPoseLike | null }> }
interface XRSessionLike {
  requestReferenceSpace(type: string): Promise<unknown>;
  requestHitTestSource?(opts: { space: unknown }): Promise<XRHitTestSourceLike>;
  addEventListener(type: string, fn: () => void): void;
  end(): Promise<void>;
}
interface XRSystemLike { requestSession(mode: string, opts?: Record<string, unknown>): Promise<XRSessionLike> }

type Status = 'boot' | 'ready' | 'starting' | 'running' | 'placed' | 'error';

export default function ARPhotoView({ mode, layout, photos, title, seed, placeLabel, onPlaced, onClose }: ARPhotoViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('boot');
  const [note, setNote] = useState('正在准备场景…');
  const [camState, setCamState] = useState<'checking' | 'on' | 'fallback'>('checking');
  const camStateRef = useRef<'checking' | 'on' | 'fallback'>('checking');   // 场景 effect 闭包里读最新值（避免拒权文案被就绪文案覆盖）
  const [parallaxOn, setParallaxOn] = useState(false);
  const [parallaxDenied, setParallaxDenied] = useState(false);
  // 跨 effect/handler 的命令通道（start AR / place / parallax 由按钮触发，实现在 effect 闭包里）
  const actionsRef = useRef<{ startXR?: () => void; place?: () => void; enableParallax?: () => void }>({});
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const onPlacedRef = useRef(onPlaced); onPlacedRef.current = onPlaced;

  // ── 伪 AR：相机背景流（三态；三坑修复版，参照诗歌树加固版考古） ──
  useEffect(() => {
    if (mode !== 'pseudo') return;
    let stream: MediaStream | null = null;
    let disposed = false;
    const toFallback = (withNote: boolean) => {
      camStateRef.current = 'fallback'; setCamState('fallback');
      if (withNote) setNote('相机打不开（权限被拒或无相机）——夜色背景预览，照片仍可放置');
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { if (!disposed) toFallback(true); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; camStateRef.current = 'on'; setCamState('on'); }
        else { stream.getTracks().forEach((t) => t.stop()); toFallback(false); }
      } catch { if (!disposed) toFallback(true); }
    })();
    return () => { disposed = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [mode]);

  // ── three 场景（一次挂载建齐三模式所需，卸载全量清理） ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: () => void = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed || !mountRef.current) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(66, mount.clientWidth / mount.clientHeight, 0.01, 40);
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));

      // 相框群：像素风拍立得（米白面 #FFFDF5 + 黑边 + 底部留白），布局引擎给位姿
      const group = new THREE.Group();
      const items = layoutFor(layout, photos.length, seed);
      const disposables: Array<{ dispose: () => void }> = [];
      const bobs: Array<{ mesh: InstanceType<typeof THREE.Mesh>; baseY: number; phase: number }> = [];
      await Promise.all(photos.slice(0, items.length).map(async (p, i) => {
        const tex = await makePolaroidTexture(THREE, p.image);
        if (!tex) return;
        const aspect = (tex.image as HTMLCanvasElement).width / (tex.image as HTMLCanvasElement).height;
        const h = layout === 'single' ? 0.62 : 0.42;
        const geo = new THREE.PlaneGeometry(h * aspect, h);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat);
        const it = items[i];
        mesh.position.set(...it.position);
        mesh.rotation.set(it.tilt, it.rotationY, 0);
        mesh.scale.setScalar(it.scale);
        disposables.push(geo, mat, tex);
        bobs.push({ mesh, baseY: it.position[1], phase: (i * 2.399) % (Math.PI * 2) });
        group.add(mesh);
      }));
      if (disposed) {
        // 纹理加载 await 期间被卸载：与主 cleanup 同规格释放（含 forceContextLoss，iOS WebGL 上下文红线）
        disposables.forEach((d) => d.dispose());
        try { renderer.dispose(); (renderer as unknown as { forceContextLoss?: () => void }).forceContextLoss?.(); } catch { /* 上下文已失 */ }
        renderer.domElement.remove();
        return;
      }
      scene.add(group);

      let placed = false;
      // 位姿上报与一次性状态迁移解耦：挪动纠偏后落库的必须是最新位姿，不能是被放弃的首次位姿
      const markPlaced = (pose: ArPose | null) => {
        onPlacedRef.current?.(pose);   // 每次放置/挪动都上报（父层覆盖为最新）
        if (placed) return;            // 状态/文案只迁移一次
        placed = true;
        setStatus('placed');
        setNote(mode === 'webxr' ? '已放进现实 · 走近看看，点其他位置可挪动' : '已放置 · 移动手机环视');
      };

      // 待清理句柄
      let session: XRSessionLike | null = null;
      let hitTestSource: XRHitTestSourceLike | null = null;
      let orientHandler: ((e: DeviceOrientationEvent) => void) | null = null;
      const t0 = performance.now();
      const bob = () => {
        const t = (performance.now() - t0) / 1000;
        for (const b of bobs) b.mesh.position.y = b.baseY + Math.sin(t * 0.9 + b.phase) * 0.012;
      };

      if (mode === 'webxr') {
        // 真 AR：群组隐藏，等 hit-test 放置；会话由视图内按钮（新手势）发起
        group.visible = false;
        renderer.xr.enabled = true;
        // 关键：three 默认申请 'local-floor' 参考空间，但 immersive-ar 默认特性集只有 viewer/local——
        // 不显式改成 'local' 会在 setSession 时被 NotSupportedError 拒掉（ARButton.js 官方模式同此）。
        // 放置高度不受影响：hit-test 给的是真实平面位姿。
        (renderer.xr as unknown as { setReferenceSpaceType?: (t: string) => void }).setReferenceSpaceType?.('local');
        const reticleGeo = new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2);
        const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
        const reticle = new THREE.Mesh(reticleGeo, reticleMat);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);
        disposables.push(reticleGeo, reticleMat);

        const place = () => {
          if (!reticle.visible) return;   // 放置后仍可点其他位置挪动（放歪了不至于重进 AR）
          const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scl = new THREE.Vector3();
          reticle.matrix.decompose(pos, quat, scl);
          group.position.copy(pos);
          const camPos = new THREE.Vector3();
          camera.getWorldPosition(camPos);
          group.rotation.y = Math.atan2(camPos.x - pos.x, camPos.z - pos.z);   // 面向放置者
          group.visible = true;
          markPlaced({ position: [pos.x, pos.y, pos.z], quaternion: [quat.x, quat.y, quat.z, quat.w] });
        };

        let xrStarting = false;
        let xrInitFailed = false;
        actionsRef.current.startXR = async () => {
          if (xrStarting || session) return;   // 重入守卫：会话建立窗口内二次点击会被 InvalidStateError 拒掉并错乱 status
          xrStarting = true;
          setStatus('starting'); setNote('正在进入 AR…（首次会请求相机权限）');
          const xr = (navigator as unknown as { xr?: XRSystemLike }).xr;
          if (!xr) { setStatus('error'); setNote('此浏览器没有 WebXR'); xrStarting = false; return; }
          try {
            // 注意：requestSession 必须最先 await（保住用户手势激活），其余初始化随后
            const overlay = overlayRef.current;
            session = await xr.requestSession('immersive-ar', {
              requiredFeatures: ['hit-test'],
              optionalFeatures: ['dom-overlay'],
              ...(overlay ? { domOverlay: { root: overlay } } : {}),
            });
          } catch {
            setStatus('error'); setNote('进入 AR 失败（相机权限被拒或设备限制）——可退出后改用相机叠加模式');
            xrStarting = false;
            return;
          }
          try {
            // 初始化失败时靠 xrInitFailed 挡住 'end' 自动关视图，否则 error 文案一帧都看不到
            session.addEventListener('end', () => { if (!disposed && !xrInitFailed) onCloseRef.current(); });
            // dom-overlay：点 HUD（退出钮等）默认仍会派发 XR select 导致误放置，必须 beforexrselect 抑制
            const overlay = overlayRef.current;
            const suppressSelect = (e: Event) => e.preventDefault();
            overlay?.addEventListener('beforexrselect', suppressSelect);
            const prevClean = cleanup; cleanup = () => { overlay?.removeEventListener('beforexrselect', suppressSelect); prevClean(); };
            await (renderer.xr as unknown as { setSession(s: unknown): Promise<void> }).setSession(session);
            const viewerSpace = await session.requestReferenceSpace('viewer');
            hitTestSource = session.requestHitTestSource ? await session.requestHitTestSource({ space: viewerSpace }) : null;
            const controller = renderer.xr.getController(0);
            controller.addEventListener('select', place);
            scene.add(controller);
            setStatus('running'); setNote('移动手机扫描地面/桌面 · 出现圆环后点击放置');
            const xrLoop = (_t: number, frame?: XRFrameLike) => {
              if (frame && hitTestSource) {   // 放置后圆环继续跟踪：支持点其他位置挪动
                const refSpace = (renderer.xr as unknown as { getReferenceSpace(): unknown }).getReferenceSpace();
                const hits = frame.getHitTestResults(hitTestSource);
                if (hits.length) {
                  const pose = hits[0].getPose(refSpace);
                  if (pose) { reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix as number[]); }
                } else reticle.visible = false;
              }
              bob();
              renderer.render(scene, camera);
            };
            renderer.setAnimationLoop(xrLoop as unknown as Parameters<typeof renderer.setAnimationLoop>[0]);
          } catch {
            xrInitFailed = true;
            setStatus('error'); setNote('AR 会话初始化失败——退出重试或改用相机叠加模式');
            try { await session?.end(); } catch { /* 已结束 */ }
            session = null;
            xrStarting = false;
          }
        };
        setStatus('ready'); setNote('照片就绪 · 点「开始 AR」进入现实空间');
      } else {
        // pseudo / preview：群组直接可见，放在面前 2.2m；相机在人眼高
        group.position.set(0, 0, -2.2);
        camera.position.set(0, 1.6, layout === 'cloud' ? 0.9 : 0.3);
        const center = new THREE.Vector3(0, 1.5, -2.2);
        camera.lookAt(center);

        let yaw = 0, pitch = 0, radius = camera.position.distanceTo(center);
        const baseYaw = Math.atan2(camera.position.x - center.x, camera.position.z - center.z);
        const applyOrbit = () => {
          const y = baseYaw + yaw;
          const p = Math.max(-0.9, Math.min(0.9, pitch));
          camera.position.set(
            center.x + Math.sin(y) * Math.cos(p) * radius,
            center.y + Math.sin(p) * radius + 0.1,
            center.z + Math.cos(y) * Math.cos(p) * radius,
          );
          camera.lookAt(center);
        };

        if (mode === 'preview') {
          // 拖动环视 + 滚轮缩放 + 无操作缓慢自转（录 demo 好看）
          let dragging = false, lastX = 0, lastY = 0, lastAct = 0;
          const el = renderer.domElement;
          const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; lastAct = performance.now(); };
          const move = (e: PointerEvent) => {
            if (!dragging) return;
            yaw -= (e.clientX - lastX) * 0.005;
            pitch += (e.clientY - lastY) * 0.003;
            lastX = e.clientX; lastY = e.clientY; lastAct = performance.now();
            applyOrbit();
          };
          const up = () => { dragging = false; };
          const wheel = (e: WheelEvent) => {
            e.preventDefault();
            radius = Math.max(1.2, Math.min(6, radius + e.deltaY * 0.002));
            lastAct = performance.now();
            applyOrbit();
          };
          el.addEventListener('pointerdown', down);
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          el.addEventListener('wheel', wheel, { passive: false });
          renderer.setAnimationLoop(() => {
            // 放置后停自转（落定感）；拖动/操作后 2.4s 才恢复漂移
            if (!dragging && !placed && performance.now() - lastAct > 2400) { yaw += 0.0022; applyOrbit(); }
            bob();
            renderer.render(scene, camera);
          });
          const offPreview = () => {
            el.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            el.removeEventListener('wheel', wheel);
          };
          const prevCleanup = cleanup; cleanup = () => { offPreview(); prevCleanup(); };
          setStatus('running'); setNote('拖动环视 · 滚轮缩放（3D 预览模式）');
        } else {
          // pseudo：陀螺仪视差（可选，手势内请求 iOS 权限；拒权→给反馈并收起按钮，不做死按钮）
          actionsRef.current.enableParallax = async () => {
            if (orientHandler) return;   // 防重入：await 窗口内连点会叠加双监听
            const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
            try {
              if (DOE?.requestPermission) {
                const r = await DOE.requestPermission();
                if (disposed) return;
                if (r !== 'granted') { setParallaxDenied(true); setNote('陀螺仪权限被拒——保持静态视角，仍可观看'); return; }
              }
            } catch { if (!disposed) { setParallaxDenied(true); setNote('陀螺仪不可用——保持静态视角'); } return; }
            if (disposed) return;   // requestPermission await 期间可能已卸载，别把监听挂到死场景上
            let base: { beta: number; gamma: number } | null = null;
            orientHandler = (e: DeviceOrientationEvent) => {
              if (e.beta == null || e.gamma == null) return;
              if (!base) base = { beta: e.beta, gamma: e.gamma };
              yaw = ((e.gamma - base.gamma) / 90) * -0.5;
              pitch = ((e.beta - base.beta) / 90) * 0.35;
              applyOrbit();
            };
            window.addEventListener('deviceorientation', orientHandler);
            setParallaxOn(true);
          };
          renderer.setAnimationLoop(() => { bob(); renderer.render(scene, camera); });
          setStatus('running');
          // 相机可能早已拒权（持久拒绝毫秒级 reject，比场景初始化快）——就绪文案不许覆盖降级文案
          if (camStateRef.current === 'fallback') setNote('相机打不开（权限被拒或无相机）——夜色背景预览，照片仍可放置');
          else setNote('举起手机 · 照片浮现在镜头前（相机叠加）');
        }
        actionsRef.current.place = () => markPlaced(null);
      }

      const onResize = () => {
        if (!mountRef.current || renderer.xr.isPresenting) return;
        const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      const prevCleanup = cleanup;
      cleanup = () => {
        prevCleanup();
        window.removeEventListener('resize', onResize);
        if (orientHandler) window.removeEventListener('deviceorientation', orientHandler);
        try { renderer.setAnimationLoop(null); } catch { /* 已停止 */ }
        hitTestSource?.cancel?.();
        if (session) session.end().catch(() => { /* 已结束 */ });
        disposables.forEach((d) => { try { d.dispose(); } catch { /* 已释放 */ } });
        try { renderer.dispose(); (renderer as unknown as { forceContextLoss?: () => void }).forceContextLoss?.(); } catch { /* 上下文已失 */ }
        renderer.domElement.remove();
      };
    })().catch(() => { if (!disposed) { setStatus('error'); setNote('3D 场景初始化失败'); } });

    return () => { disposed = true; cleanup(); };
    // photos/layout/seed/mode 变化都应整场重建；本视图按"一次挂载一次体验"用，父组件用 key 控制
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC 关闭（MarkerDetail 同范式）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const modeLabel = mode === 'webxr' ? 'AR · 现实锚定' : mode === 'pseudo' ? '伪AR · 相机叠加' : '3D · 预览';

  return (
    <div className="absolute inset-0 z-[130] bg-black flex flex-col overflow-hidden">
      {/* z0 背景：伪AR 相机流 / 相机不可用的夜色降级 / 预览渐变 */}
      {mode === 'pseudo' && (
        camState === 'fallback'
          ? <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 40%, #0a1a20, #000)' }} />
          : <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}
      {mode === 'preview' && (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #10222a 0%, #050a0d 62%, #0b1a14 100%)' }} />
      )}
      {/* z5 三维层 */}
      <div ref={mountRef} className="absolute inset-0" style={{ zIndex: 5 }} />
      {/* z10 HUD（webxr 时兼作 dom-overlay root，进入会话后浏览器把它叠在相机画面上） */}
      <div ref={overlayRef} className="absolute inset-0 flex flex-col" style={{ zIndex: 10, pointerEvents: 'none' }}>
        <div className="flex items-center justify-between px-3 py-2 bg-black/85" style={{ borderBottom: `2px solid ${CYAN}`, pointerEvents: 'auto' }}>
          <div className="min-w-0">
            <div className="font-pixel text-[8px]" style={{ color: CYAN }}>{modeLabel}</div>
            <div className="text-white text-xs truncate">{title || '重返现场'}</div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 grid place-items-center border-2 border-white/70 text-white active:translate-y-px"
            aria-label="退出"
          >
            <X size={15} />
          </button>
        </div>

        {/* 四角括号（诗歌树 HUD 血统） */}
        <div className="relative flex-1">
          {['top-3 left-3 border-l-2 border-t-2', 'top-3 right-3 border-r-2 border-t-2', 'bottom-3 left-3 border-l-2 border-b-2', 'bottom-3 right-3 border-r-2 border-b-2'].map((c) => (
            <div key={c} className={`absolute w-5 h-5 ${c}`} style={{ borderColor: CYAN, opacity: 0.85 }} />
          ))}
        </div>

        {/* 底部：状态字 + 动作钮 */}
        <div className="px-4 pb-5 pt-2 space-y-2 bg-gradient-to-t from-black/80 to-transparent" style={{ pointerEvents: 'auto' }}>
          <div className="text-[11px]" style={{ color: CYAN }}>{note}</div>
          <div className="flex gap-2">
            {mode === 'webxr' && status === 'ready' && (
              <button
                onClick={() => actionsRef.current.startXR?.()}
                className="flex-1 py-2.5 border-2 border-black bg-[#00e5ff] text-black text-sm font-bold shadow-[3px_3px_0_rgba(0,0,0,0.85)] active:translate-y-px"
              >
                开始 AR
              </button>
            )}
            {mode !== 'webxr' && status === 'running' && (
              <button
                onClick={() => actionsRef.current.place?.()}
                className="flex-1 py-2.5 border-2 border-black bg-[#00e5ff] text-black text-sm font-bold shadow-[3px_3px_0_rgba(0,0,0,0.85)] active:translate-y-px"
              >
                {placeLabel || '就放在这里'}
              </button>
            )}
            {mode === 'pseudo' && status !== 'boot' && !parallaxOn && !parallaxDenied && (
              <button
                onClick={() => actionsRef.current.enableParallax?.()}
                className="px-3 py-2.5 border-2 border-white/70 text-white text-xs active:translate-y-px"
              >
                开启视差
              </button>
            )}
            {(status === 'placed' || status === 'error') && (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border-2 border-white/80 bg-black/60 text-white text-sm active:translate-y-px"
              >
                {status === 'placed' ? '完成 · 返回' : '退出'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 拍立得相框纹理：米白 #FFFDF5 面 + 黑 2px 边 + 底部留白（像素新粗野风） ──
async function makePolaroidTexture(THREE: typeof import('three'), dataUrl: string) {
  const img = await new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = dataUrl;
  });
  if (!img || !img.width || !img.height) return null;
  const pad = Math.round(Math.max(img.width, img.height) * 0.055);
  const bottom = Math.round(Math.max(img.width, img.height) * 0.16);
  const cv = document.createElement('canvas');
  cv.width = img.width + pad * 2;
  cv.height = img.height + pad + bottom;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#FFFDF5';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(2, Math.round(pad * 0.35));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cv.width - ctx.lineWidth, cv.height - ctx.lineWidth);
  ctx.drawImage(img, pad, pad);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
