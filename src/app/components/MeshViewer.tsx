// GLB / glTF 网格(mesh)展品 viewer —— 与 ExhibitViewer(高斯泼溅)并列。
// 用户主力路径：KIRI Pro / Scaniverse / Polycam 等把展品扫成 .glb 带回家 → 导入这里展示。
// GLB 是二进制 glTF(模型+材质+纹理打包一个文件)，标准 three.js GLTFLoader 渲染，不是高斯泼溅。
// 卸载严格 dispose（几何/材质/纹理/renderer + forceContextLoss），iOS Safari WebGL 上下文有限、内存敏感。
import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disposeModel(root: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root.traverse((o: any) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mats.forEach((m: any) => { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose?.(); } m.dispose?.(); });
  });
}

export default function MeshViewer({ url, onError }: { url: string; onError?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;   // 同步最新回调、不进 effect 依赖，避免父组件重渲染重载整个模型
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null, controls: any = null;
    const cleanup: Array<() => void> = [];
    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (disposed || !ref.current) return;
        const el = ref.current;
        const w = el.clientWidth || 320, h = el.clientHeight || 320;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 2000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   // 移动端封顶 2x，省显存
        renderer.setSize(w, h);
        el.appendChild(renderer.domElement);

        // 光照：环境光 + 两盏方向光，给文物立体感（GLB 多带 PBR 材质，补光避免死黑）
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 5, 4); scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;

        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) { disposeModel(gltf.scene); return; }   // 加载中途已卸载：释放已解析的几何/纹理，兑现 dispose 契约（否则只能等 GC）
        const model = gltf.scene;

        // 自动居中 + 依包围盒缩放到视野（导入模型尺度未知）
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.position.sub(center);
        camera.position.set(0, maxDim * 0.3, maxDim * 2.2);
        camera.lookAt(0, 0, 0);
        controls.update();
        scene.add(model);

        const loop = () => { if (disposed) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
        loop();

        cleanup.push(() => disposeModel(model));
      } catch { setErr(true); onErrorRef.current?.(); }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup.forEach((f) => { try { f(); } catch { /* 已释放 */ } });
      try { controls?.dispose?.(); } catch { /* */ }
      try {
        renderer?.dispose?.();
        renderer?.forceContextLoss?.();
        const c = renderer?.domElement;
        if (c?.parentNode) c.parentNode.removeChild(c);
      } catch { /* 已释放 */ }
    };
  }, [url]);

  if (err) return <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60 font-pixel px-6 text-center leading-relaxed">3D 加载失败 · 请看照片</div>;
  return <div ref={ref} className="w-full h-full" />;
}
