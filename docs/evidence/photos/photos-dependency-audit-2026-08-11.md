# Photos 新增依赖审计（2026-08-11）

## 结果

- `tar` 的已知 DoS/异常问题通过根级 override 固定到 `7.5.22`；`npm audit --omit=dev` 不再报告 `tar`。
- `@huggingface/transformers@3.8.1` 仍因其 Node 依赖 `sharp@0.34.5` 被 npm 报告 2 个 high 条目；当前审计数据库标记 `fixAvailable:false`。
- `sharp` 与 `onnxruntime-node` 不在 Vite 浏览器/Android WebView 生产资源中；生产目录只包含单独拆分的 Transformers.js 浏览器代码、`onnxruntime-web` 和本地 ORT WASM。

## 风险边界

“未进入浏览器 bundle”不等于依赖树没有风险。开发/构建机器仍安装 Node 侧依赖，因此：

- 不用 `sharp` 处理不可信用户上传文件。
- 不运行来自照片元数据或网络的 Node 侧解压/转换命令。
- 上游发布 `sharp >=0.35.0` 或 Transformers.js 移除该依赖后立即升级并重新审计。
- 不执行 `npm audit fix --force`；避免为了清零数字引入未经验证的破坏性升级。

## 复验

```text
npm ls tar sharp @huggingface/transformers --all
npm audit --omit=dev
npm run build
find dist/assets -maxdepth 1 -type f | grep -E 'sharp|tar'
```

最后一条在本次构建中无输出。

