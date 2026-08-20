# 看展搭子 Exhibition Agent · Google AI 落地方案

## 目标

将公开展签、展品描述和用户当时的观看感受整理为带真实展馆坐标、可编辑、经确认且可再次打开的个人文化记忆对象。

## 用户路径

1. 用户输入文字、选择公开展签或使用验证样例。
2. 本地规则先判断内容类型和敏感信息。
3. 用户主动加载后，浏览器 Google Gemma 3n E2B IT 完成预分类、候选排序和单图预处理。
4. 复杂多语理解需要 Google Gemini 时，系统说明上传内容、用途、provider 和隐私边界。
5. 用户同意后，Gemini 生成受控字段、双语导览、时间线和事实型 cultural bridge。
6. Validator、Critic、朝代表、展馆表和别名表校验草稿。
7. 用户修改字段与个人感受。
8. Confirm Gate 通过后，对象钉到实际观看展馆。

## Google 技术分工

### 浏览器 Google Gemma

- 模型：Gemma 3n E2B IT int4 Web。
- 运行：MediaPipe LLM Inference Web + WebGPU。
- 工作：任务预分类、候选排序、敏感信息判断、短文本生成和单图预处理。
- 边界：用户主动加载；端侧失败不会自动上传。

### Google Gemini

- Flash 级模型：展签理解、结构化补全、中英文导览、时间线和 cultural bridge。
- Pro 级模型：Council 高复杂度推理与争议性文化解释复核。
- 云视觉：仅在公开展签、明确用途和用户二次确认后启用。

服务端优先直连 Google Gemini API。GMI 仅作为可选备用传输，并在 RunTrace 中拆分 provider、modelOwner 和 transport。任何情况下都只允许 Google Gemini model id。

## 输出 Schema

```json
{
  "stableId": "exhibition:<museum>:<item>",
  "nameZh": "",
  "nameEn": "",
  "dynastyOrPeriod": "",
  "material": "",
  "category": "",
  "museum": "",
  "city": "",
  "coordinates": { "lat": 0, "lng": 0 },
  "guideZh": "",
  "guideEn": "",
  "timeline": [],
  "culturalBridge": [],
  "source": [],
  "personalNote": "",
  "status": "draft",
  "confirmedByUser": false
}
```

地点优先表示用户实际观看展品的展馆。出土地、原属地和创作地作为语义字段保留，不替代观看地点。

## 校验

- `dynastyOrPeriod` 需要匹配受控朝代与时期表。
- `material` 与 `category` 使用受控枚举或显式 `unknown`。
- `museum`、`city` 与坐标通过本地展馆目录和别名表消歧。
- cultural bridge 限于可追溯事实与谨慎比较，避免民族性格概括和刻板印象。
- 模型输出不能成为独立来源。
- 缺少可靠坐标时要求用户选择或手填。

## 图片上传边界

展签默认先走本地规则与 Gemma。需要云视觉时展示二次确认：

- 将发送哪一张公开展签。
- 发送目的为文字读取和字段补全。
- model owner 为 Google。
- 实际传输为官方 Gemini API 或 GMI 备用传输。
- 用户可以取消并继续使用文字、目录和手填。

人脸、证件、手机号、卡号、私人照片和精确私人定位不会因端侧失败而静默上传。云视觉失败也不会转发到其他 provider。

## RunTrace

一次完整看展任务记录：

- 规则命中和隐私检测。
- Gemma 可用性、模型、耗时与输出类别。
- 用户上传确认或取消。
- Gemini provider、modelOwner、transport、model 与耗时。
- Schema、Validator 和 Critic 结果。
- 用户修改字段。
- Confirm Gate 与最终空间对象 ID。

## 降级

- WebGPU 缺失：继续文字、目录、手填和用户确认。
- Gemma 未加载：规则快路继续；非隐私复杂任务可经确认升级 Gemini。
- Gemini 不可用：保留本地草稿和手填，不伪造补全结果。
- 地图失败：让用户选择城市或展馆；无可靠坐标不落点。
- 3D/AR 失败：不阻断看展主闭环。

## 核验入口

- 交互 Demo：`https://pocketearth-google.throughtheglass.art/`
- 核心代码：`frost-agent/skills/exhibition/`
- Gemma 端侧：`frost-agent/edge/`
- Gemini 服务端：`server.mjs`
- 架构与证据：`docs/architecture/`、`D-ROUND-EVIDENCE-INDEX.md`
