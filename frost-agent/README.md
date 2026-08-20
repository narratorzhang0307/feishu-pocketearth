# Frost Agent Harness · Qwen 决赛版

Frost 是用户长期拥有的本地智能体容器；领域能力统一称为 **Skills**。内部实现可以有多个阶段，但前台不再把它们包装成多个“子 Agent”。

## 当前推理路线

- 端侧：`edge/capacitorMnnEdge.ts` → Android Capacitor Plugin → `libpocket_mnn_jni.so` → Alibaba MNN。
- 模型：Qwen3 / Qwen3-VL Base；Travel、古籍、碑拓等能力按需加载 MNN Adapter 或专用模型。
- 加速：同一 arm64 APK 运行时检测 SME2；target 2 是 I8MM/NEON 基线，target 3 是 SME2 实验组。
- 云端：`harness/httpBrain.ts` → `/api/frost-llm` → DashScope Qwen。密钥只保存在服务端。
- 回退：模型或网络不可用时返回明确空值/错误，由业务进入确定性规则或手填，不伪装成模型结果。

## 可信执行链

```text
用户意图
  → Skill Router
  → Qwen/MNN 端侧理解与选择
  → 可选 Qwen 云端增强
  → 确定性工具（检索、校验、排序、地理编码）
  → Validator / Quality Gate
  → 用户确认
  → 写入私人地球 + RunTrace
```

Frost 主入口的跨 Skill 编排位于 `harness/skillRouter.ts`：明确请求先走本地语义指纹，Android 长尾任务再走 Qwen/MNN 的严格 JSON 计划；只有非敏感任务在端侧不可用时才升级 DashScope Qwen。计划通过 Registry 白名单后由用户点击运行，再以 `pocket-frost-task/v1` 交给目标 Skill。Frost 不绕过目标 Skill 的 Adapter 校验、质量门或写入确认。

## 目录

- `agents/`：历史领域契约与兼容实现；产品层统一呈现为 Skills。
- `harness/`：路由、记忆、事件、校验与云端 Brain。
- `edge/`：Qwen/MNN 端侧统一契约、Android 桥和开发期 sidecar。
- `provider-compat/`：DashScope Qwen、MNN 与兼容请求适配。
- `memory/`：会话记忆和本地长期画像。

## 安全口径

- 前端与 APK 不保存 DashScope API Key。
- 用户选择端侧时不静默升级云端；私人原图默认不离设备。
- Adapter 未安装时明确阻断，不能用共享 Base 冒充 Skill。
- 所有写入先建议、再校验、最后由用户确认。
- RunTrace 与真机验收账本只展示真实执行路径和原始指标。
