# Pocket Earth · 阿里决赛版

Pocket Earth 是一个由用户长期拥有的本地 Frost Agent。它通过可安装、可验证、
可装备、可回滚和可卸载的 Skills 获得能力；Skill 与 Data Pack 分离，因此同一能力
可以加载 Pocket Earth 示例数据，也可以加载遵循开放协议的第三方数据。

本目录是唯一决赛工程。当前模型主链路是 Qwen + MNN，不再以 Gemini、Gemma 或
GMI 作为核心依赖。

## 已落地的核心架构

- `pocket-skill/v1`：Skill 身份、Base/Adapter、权限、资产、质量门禁、回退、评测和生命周期。
- `pocket-data/v1`：书籍、电影、音乐和 Mapping 数据包的安装、切换、地图落位与独立卸载。
- 云端 Qwen：服务端通过 DashScope/百炼代理，密钥不进入浏览器包。
- 端侧 Qwen/MNN：桌面 sidecar 已能真实运行 Qwen3-VL Base、LoRA 与专用复原模型；
  Android Java/Capacitor 桥已通过编译，JNI `.so` 与目标 Armv9 真机证据仍待补。
- Skills Plaza：展示作者、版本、依赖、大小、权限、质量门禁、测试和安装状态。
- RunTrace：记录 Skill、Qwen Base、Adapter、Data Pack、工具、质量门禁、回退、确认和写回对象。
- 轻量首屏：地图与专业页面懒加载；模型、LoRA、全量数据库、原始大图和 3D 不进入首屏。

已完成且本轮冻结的产品模块包括书籍、电影、音乐、旅行规划、看展搭子和
Book-to-Earth；文化遗产碑拓识读/复原已按统一 Skill 协议接入。

## 本地运行

```bash
npm install
npm run dev
```

常用验收：

```bash
npm run typecheck
npm test -- --run
npm run build
npm run verify:first-paint
npm run build:mobile
```

云端 Qwen 环境变量示例见 `.env.example`。OSS 资产发布策略见
`docs/deploy/OSS-ASSET-POLICY.md`；发布脚本只读取本机阿里云 CLI 登录态，不接受
写进源码的 AccessKey。

## 真实完成度

| 项目 | 状态 |
|---|---|
| Web 类型检查、全量测试、生产构建 | 已通过 |
| 首屏重资产门禁 | 已通过 |
| Qwen/MNN 桌面 sidecar 实际推理 | 已通过 |
| Android Java/Capacitor 构建与 debug APK | 已通过 |
| Android JNI 原生 MNN | 待签名 `.so` 与模型 Release Bundle |
| OSS 资产清单与上传前校验 | 已通过；实际上传受本机 STS 过期阻塞 |
| Armv9 / SME2 同机 A/B | NOT RUN，禁止宣称已完成 |

详细、可复验的命令与结果见
`docs/evidence/implementation-status-20260811.md`。唯一执行准则是
`docs/strategy/Pocket Earth 决赛改造总计划与执行准则.md`。

## 隐私与发布边界

- 私人照片、票据、足迹、笔记、向量和个人偏好默认只留本机。
- OSS 只分发公开且有许可的版本化模型、Skill、Data Pack、缩略图和可选 3D 资产。
- 云端失败必须回退到端侧或确定性规则，并在 RunTrace 中显示真实原因。
- 未完成的 Android MNN、飞行模式或 SME2 证据不得用配置、文案或桌面结果代替。

历史 Google/GMI 资料保留在归档目录，仅用于追溯，不代表决赛活跃架构。
