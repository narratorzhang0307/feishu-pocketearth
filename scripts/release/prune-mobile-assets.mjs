import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const targets = [
  ['mediapipe/wasm', '旧 Gemma/MediaPipe 浏览器模型运行时已退出活跃 Qwen/MNN 路由'],
  ['hardware-digital-twin.html', '旧 Google/Frost Edge 审核页不属于 Qwen 手机决赛产品，避免混入发布口径'],
  ['exhibits/preset-nike.splat', '8.3MB 预设 Splat 只作可选网页演示，不进入 Android 决赛包'],
  ['data-packs', '书籍、电影、音乐默认从不可变 OSS Manifest 按需加载；协议模板仍保留在 protocols/'],
];

let removedBytes = 0;
for (const [relative, reason] of targets) {
  const target = path.join(dist, relative);
  try {
    const info = await stat(target);
    if (info.isFile()) removedBytes += info.size;
    await rm(target, { recursive: true, force: true });
    console.log(JSON.stringify({ removed: relative, reason }, null, 0));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
console.log(JSON.stringify({ mobileReleasePrunedBytesAtLeast: removedBytes, policy: 'models/adapters/data/3d install on demand; never first paint' }));
