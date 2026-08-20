# Photos 上游研究工作区

`research/upstream/` 是只读、浅克隆、稀疏检出的上游源码工作区，已经加入 `.gitignore`，不会随 Pocket Earth 打包或被误提交。

用途只有三项：

1. 在固定 commit 上核对真实 API、数据结构、性能策略和失败路径；
2. 先看许可证，再决定“调用依赖、独立重写、仅参考架构或完全不用”；
3. 为 `docs/strategy/Photos-GitHub上游研究与三轮迭代记录.md` 提供可复核证据。

禁止事项：

- 不从 AGPL 项目 Ente、Immich 复制实现代码；
- 不把 Apple MobileCLIP 的研究用途模型权重放进发布包；
- 不修改这些上游 checkout，也不把它们当作 Pocket Earth 的 vendored source；
- 不因为设备是 ARM64 就声称 MNN 已实际命中 SME2。

当前固定版本见三轮迭代记录。若要更新，必须重新核对许可证、commit 和适配差异，不能直接 `git pull` 后发布。
