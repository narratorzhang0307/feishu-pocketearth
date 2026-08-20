# Pocket Earth Photos 改进与 LoRA Skill 验证方案

**版本：** 2026-08-11  
**目标设备：** vivo X300（12GB RAM + 256GB ROM，天玑 9500）  
**交付形态：** 添加到主屏幕的 Android PWA  
**研究目标：** 验证“带视觉权重的 LoRA Skill”是否显著优于仅由提示词和规则组成的 Markdown Skill。

## 1. 最终决策摘要

1. **Photos Tab 不再把“识别照片内容”作为核心差异。** 苹果相册已经能完成“小狗”“南京的夏”等自然语言检索，通用语义搜索只能作为基础设施。
2. **核心体验改为“旅程选片 + 重返现场”。** Pocket Earth 不只找到过去，而是为每个地点挑出最能代表旅程的照片，并把旧照片自动贴回今天的真实画面。
3. **审美能力用 LoRA Skill 验证。** Markdown Skill 负责触发条件、判断流程和 JSON 输出；LoRA Adapter 负责从大量图片偏好中学习难以写成文字规则的视觉审美。
4. **部署模型选择 Qwen3-VL-2B-Instruct。** 4B 只作为教师模型、能力上限和对照组，不作为 vivo X300 PWA 的比赛默认模型。
5. **“重返现场”第一版使用 OpenCV.js，而不是 ARKit/WebXR。** ORB/特征匹配、RANSAC、Homography 用于将旧照与实时相机画面自动对齐；这属于二维视觉配准，可完全运行在 PWA 内。
6. **真正的三维照片花园保留为增强项。** Android 可尝试 WebXR；iOS 网页通常需要跳转 AR Quick Look。它不应进入跨平台核心承诺。

> **一句话定位：** 苹果相册帮用户找到过去；Pocket Earth 为每段旅程挑出代表性瞬间，带用户回到照片发生的地方，并让过去重新贴回今天的现实。

## 2. 为什么 Photos 需要调整

### 2.1 苹果已经覆盖的能力

- 按动物、人物、城市、季节、文字等语义搜索照片。
- 自动聚合回忆、地点和时间。
- 对照片内容进行端侧理解。

因此，“输入小狗后找到所有狗照片”不能单独成为 Photos Tab 的比赛优势。

### 2.2 Pocket Earth 应该突出什么

Photos 应从“相册搜索器”升级为“旅程记忆策展器”：

- **地点代表性：** 哪张照片最能代表南京、东京或一次徒步。
- **组内选优：** 在同地点、同时间、同主题的一组照片里选出最佳封面。
- **旅程多样性：** 精选集不能全是相似日落，要兼顾人物、风景、昼夜与关键节点。
- **空间回访：** 根据 EXIF/GPS 带用户回到照片附近。
- **重返现场：** 自动将旧照片对齐今天的相机画面，滑动查看过去与现在。
- **可解释选择：** 不只给 7.8 分，而是说明构图、色彩、情绪和地点代表性。

### 2.3 推荐的 Photos 信息架构

#### A. 旅程精选

- 按时间和地点形成 Journey/Place Cluster。
- 每个地点推荐一张封面。
- 每次旅程生成 6～12 张具有叙事顺序的 Highlights。
- 显示“为什么推荐”：构图、光线、情绪、人物、地点辨识度。

#### B. 找照片

- 保留自然语言搜索，但将它作为入口而非主卖点。
- 支持“南京的夏”“有朋友的东京夜景”“适合当封面的照片”。
- 搜索结果可以继续进入旅程精选、地图 Pin 或重返现场。

#### C. 重返现场

- 选择带 GPS 的旧照片。
- 到达拍摄点附近后打开实时相机。
- 自动对齐旧照片与现实画面。
- 用透明度滑杆、分割线或擦除手势查看过去/现在。
- 保存对比图并 Pin 回 Pocket Earth。

#### D. 光阴志

- 保留当前“时间 / 杂志 / 日历”的情感化展示。
- 数据源改成用户确认后的旅程精选，而不是静态展示素材。

## 3. PWA 能力边界与“重返现场”方案

### 3.1 主屏幕 PWA 的真实边界

添加到主屏幕后，PWA 虽然拥有独立窗口和图标，但仍运行在浏览器/WebView 能力边界内：

- 可通过 `getUserMedia()` 使用相机。
- 可通过 Canvas/WebAssembly/WebGPU 进行本地图像处理和模型推理。
- 不能因为“安装”而直接获得 ARKit 原生 API。
- 不能把 12GB 系统内存全部交给浏览器模型。

### 3.2 OpenCV 配准：核心方案

第一版“重返现场”采用如下流程：

```text
旧照片
  ↓ 提取 ORB/AKAZE 等局部特征
实时相机帧
  ↓ 描述子匹配
RANSAC 剔除错误匹配
  ↓
Homography 计算旋转、缩放与透视关系
  ↓
warpPerspective 将旧照片贴合到当前画面
  ↓
透明度滑杆 / 分割线 / 对比拍摄
```

这一方案：

- 不需要 ARKit。
- 不需要 ARCore。
- 不需要 WebXR。
- 可以完全留在 Android PWA 中。
- 最适合建筑、街道、墙面、门窗、招牌等具有稳定纹理的场景。

限制也需要明确：大幅视角变化、强烈景深视差、树木水面、人群或建筑已完全改变时，Homography 可能失败。产品应保留手动缩放、旋转、透明度和四角微调作为兜底。

### 3.3 `opencv-mobile` 与 OpenCV.js 的选择

[`nihui/opencv-mobile`](https://github.com/nihui/opencv-mobile) 是精简版 OpenCV 构建包，不是现成的 AR App，也没有实现完整“重返现场”。它提供的是图像匹配、透视变换、光流等底层能力，更适合 Android/iOS 原生 C++、JNI 或自定义 WASM。

对当前 React PWA，首选：

- [`opencv/opencv`](https://github.com/opencv/opencv) 中的 OpenCV.js/WebAssembly 路线。
- 浏览器相机帧 + Canvas + OpenCV.js。
- 后续若包体或性能不满足，再从 `opencv-mobile` 裁剪自定义 WASM。

### 3.4 真三维照片花园：仅作为增强项

真正把照片固定在三维地面并允许用户绕行，需要世界追踪：

- Android PWA：可尝试 WebXR，浏览器底层使用 ARCore 能力。
- iOS 网页/PWA：通常通过 AR Quick Look 打开 USDZ，体验会进入系统查看器。
- [`google/model-viewer`](https://github.com/google/model-viewer) 可统一部分入口，但 Quick Look 中无法保留完整 PWA DOM 交互。

因此三维照片花园适合作为彩蛋，不应替代 OpenCV 配准版“重返现场”。

## 4. 审美 LoRA Skill 的研究假设

### 4.1 Markdown Skill 能做什么

Markdown Skill 擅长：

- 定义触发条件。
- 给出构图、色彩、光线、主体等判断规则。
- 提供少量示例。
- 规定输出 JSON Schema。
- 组织调用流程和错误回退。

但它很难仅靠文字真正学习：

- 什么程度的留白更舒服。
- 同样是逆光，哪张有氛围、哪张只是失败。
- 同地点两张都不错时，哪张更适合作为旅程封面。
- 什么画面更有“到达感”“瞬间感”和地点记忆。

### 4.2 LoRA Skill 的价值

LoRA Adapter 可以把成千上万组图片偏好写入模型权重。推荐将 Skill 设计为：

```text
aesthetic-curator-skill/
├── SKILL.md
│   ├── 触发条件
│   ├── 任务流程
│   └── 输出格式
├── adapter/
│   ├── adapter_config.json
│   └── adapter_model.safetensors
├── prompts/
│   └── evaluation.md
└── eval/
    ├── test_pairs.json
    └── human_ranking.json
```

- **MD 部分：** 什么时候用、怎样用、输出什么。
- **LoRA 部分：** 真正学习视觉偏好与排序。
- **Eval 部分：** 证明提升不是提示词或主观感觉。

### 4.3 训练输出不要只做小数分

参考 [`Q-Future/Q-Align`](https://github.com/Q-Future/Q-Align) 的思路，优先训练离散文字等级和图片对偏好，而不是直接回归 `7.3`。

推荐输出：

```json
{
  "overallLevel": "excellent",
  "composition": 8,
  "color": 7,
  "emotion": 9,
  "placeRepresentativeness": 9,
  "coverCandidate": true,
  "reason": "夕阳和城墙形成清晰层次，地点辨识度高，适合作为南京旅程封面"
}
```

## 5. 数据集与训练方式

### 5.1 推荐数据集

| 数据集 | 主要标注 | 在本项目中的用途 |
|---|---|---|
| AVA | 大规模 1～10 分审美投票分布 | 学习通用摄影审美等级 |
| TAD66K | 66K 图片、47 类主题、审美评分 | 学习城市、风景、人物等同主题选优 |
| AADB | 总体审美及构图、色彩、景深等属性 | 学习多维审美属性 |
| PARA | 审美与用户偏好差异 | 研究个性化审美 |
| PCCD / AVA-Captions | 图片与自然语言摄影评论 | 学习“为什么好看” |
| AesBench / AUBD | 专家审美理解评测 | 作为解释与理解测试集 |
| ArtiMuse-10K | 多维专家审美分析与整体评分 | 参考细粒度输出和评测 |

数据入口可从 [`bcmi/Awesome-Aesthetic-Evaluation-and-Cropping`](https://github.com/bcmi/Awesome-Aesthetic-Evaluation-and-Cropping) 汇总查看。

### 5.2 三阶段训练

#### 阶段一：通用审美等级

- 将 AVA/TAD66K 的连续评分映射为离散等级。
- 例如：较差、一般、良好、优秀。
- 训练单图结构化输出，建立稳定评分语言。

#### 阶段二：同主题二选一

- 从相同地点类型或相同主题中构造图片对。
- 训练“哪张更适合作为旅程封面”。
- 优先使用评分差距明确的样本；保留评分接近的困难样本用于测试。
- 避免模型只学会“日落总比白天好”“有人总比没人好”等捷径。

训练样本示例：

```json
{
  "images": ["a.jpg", "b.jpg"],
  "question": "两张都是城市夜景，哪张更适合作为旅程封面？",
  "answer": {
    "choice": "B",
    "level": "excellent",
    "reason": "B 的主体更明确，灯光形成纵深，地点氛围和到达感更强"
  }
}
```

#### 阶段三：Pocket Earth 专属偏好

- 自行标注约 1,000～3,000 组真实手机旅行照片二选一，先验证小规模有效性。
- 标签不只包含“美不美”，还包含：
  - 地点代表性。
  - 旅程故事感。
  - 与其他入选照片的重复程度。
  - 是否适合作为地图/旅程封面。
  - 是否值得进入重返现场。

### 5.3 LoRA 训练建议

- 基座：`Qwen3-VL-2B-Instruct`。
- 第一轮冻结视觉编码器，在语言模型 attention/MLP 上训练 LoRA。
- 如果只改变措辞、排序能力提升不明显，再将 LoRA 扩展到视觉 merger/projector 附近层。
- 先用 5,000～10,000 条高质量样本验证，不追求一次性做大数据集。
- 训练时保持结构化短输出，避免模型把算力浪费在长篇审美散文。

## 6. LoRA Skill 对照实验

### 6.1 核心三组

| 组别 | 模型配置 | 要验证的问题 |
|---|---|---|
| A | Qwen3-VL-2B 原始基座 | 基础视觉判断能力 |
| B | Qwen3-VL-2B + Markdown Skill | 纯提示词/规则能提升多少 |
| C | Qwen3-VL-2B + 同一 MD Skill + LoRA Adapter | 权重 Skill 是否产生真实视觉提升 |

可增加上限组：

| 组别 | 模型配置 | 用途 |
|---|---|---|
| D | Qwen3-VL-4B + Markdown Skill | 大模型但无专用 LoRA 的能力上限 |

最有说服力的比赛结论是：

> 2B + LoRA 明显超过同基座的 MD Skill，并接近或超过参数量更大的 4B + MD。

### 6.2 评测指标

- 同主题二选一准确率。
- 与人工排序的 Spearman/Kendall 相关性。
- 同图重复运行的一致性。
- 理由是否对应真实画面，而不是套话。
- JSON 格式正确率。
- vivo X300 端到端耗时、连续运行稳定性与温升。

建议研究验收线：

```text
LoRA Skill 相比 MD Skill：
- 二选一准确率提升 ≥ 8%
- 排序相关性提升 ≥ 0.10
- 重复判断一致性明显提高
```

## 7. 为什么部署选择 2B 而不是 4B

### 7.1 目标设备与浏览器约束

vivo X300 为 12GB RAM + 256GB ROM、天玑 9500。存储足够，但 PWA 的关键限制是可用运行内存：

- Android/OriginOS、Chrome、页面、相机和 WebGPU 都会占用内存。
- 浏览器不能独占系统 12GB。
- 运行时还需要模型解包、激活值、KV Cache 和视觉特征内存。
- PWA 应按 WebGPU 路线设计，不假定可直接调用天玑 NPU。

一个已发布的“视觉 FP32 + 文本 INT4”ONNX 构建示例中：

- Qwen3-VL-2B 包约 3.66GB。
- Qwen3-VL-4B 包约 5.43GB。

即使继续量化视觉部分，4B 运行峰值仍显著更高。工程判断：2B 是 12GB Android PWA 的合理上限；4B 在浏览器里存在加载慢、OOM、页面被系统回收和持续降频风险。

### 7.2 对窄审美任务，2B 更合适

- 审美 Skill 输出短且结构固定，不需要长链复杂推理。
- LoRA 已经把模型向专门任务收敛。
- 2B 可为双图输入和视觉 token 留出更多余量。
- 2B 更适合连续分析多张候选图。
- 2B + LoRA 如果接近 4B + MD，反而更能证明 LoRA Skill 的价值。

### 7.3 4B 的保留用途

- 教师模型：生成解释草稿和困难样本标签。
- 对照组：判断 2B LoRA 是否接近更大基座。
- 实验室上限：不进入比赛默认路径。

4B 只有同时满足以下条件才值得替换 2B：

```text
- 审美二选一准确率比 2B 提高 ≥ 8%
- 端到端耗时不超过 2B 的 1.5 倍
- 连续分析 20 张照片不崩溃、不触发页面重载
- 无明显持续发热降频
- PWA 切换页面后模型不会被频繁回收
```

## 8. vivo X300 PWA 部署建议

- 使用 `Qwen3-VL-2B-Instruct`。
- LoRA 训练完成后合并权重，再导出最终推理模型。
- 使用 Q4/Q4F16 等量化版本做最终验收。
- 将项目中的 `@huggingface/transformers` 从当前 3.8.1 评估升级到支持 Qwen3-VL 的 Transformers.js v4。
- WebGPU 推理放入 Web Worker，避免 UI 主线程卡死。
- 输入图片最长边限制在 448～512px；原始 200MP 照片不能直接进入 VLM。
- 一次处理一张或一个小组，禁止整批并发。
- 输出控制在约 64～100 tokens。
- 赛前将模型完整缓存到比赛手机，并申请持久存储。
- 在最终量化模型上做 20 张连续图片测试，而不是只在电脑 BF16 模型上验证。

推荐运行漏斗：

```text
EXIF / GPS / dHash / pHash / 清晰度
  ↓ 便宜筛选、聚类、去重
浏览器 CLIP / MobileCLIP
  ↓ 语义粗筛和候选排序
Qwen3-VL-2B + Aesthetic LoRA Skill
  ↓ 只分析簇代表、候选封面和困难样本
Journey Highlights / 重返现场 / 地图 Pin
```

## 9. 与当前 Pocket Earth 代码的衔接

### 9.1 已有基础

- `src/app/lib/photo/features.ts`：EXIF、GPS、清晰度、曝光、色彩、dHash/pHash。
- `src/app/lib/photo/reasoning.ts`：类型判断、技术质量、去重和时空聚类。
- `src/app/lib/photo/vision.ts`：浏览器 CLIP 零样本分类。
- `src/app/lib/photo/store.ts`：IndexedDB 派生结论与纠错记录。
- `src/app/components/PhotosAgentRunPage.tsx`：照片分析运行页。
- `src/app/components/ARPhotoRunPage.tsx`：WebXR/相机叠加/3D 预览三模式和 GPS 回访。
- `src/app/lib/arphoto/nearby.ts`：回到照片附近的距离判断和提示。

### 9.2 推荐的数据模型拆分

当前 `technicalQuality` 不应被 LoRA 审美分替代。建议并列保存：

```ts
interface PhotoCurationScore {
  technicalQuality: number;
  aestheticLevel: 'poor' | 'fair' | 'good' | 'excellent';
  aestheticScore?: number;
  placeRepresentativeness: number;
  storyValue: number;
  coverCandidate: boolean;
  reason: string;
  modelVersion: string;
  skillVersion: string;
}
```

- `technicalQuality`：清晰、曝光、误拍等客观技术信号。
- `aestheticLevel`：LoRA 学到的公众/策展审美。
- `placeRepresentativeness`：Pocket Earth 专属地点表达。
- `coverCandidate`：是否进入旅程封面候选。
- 最终删除、保留或 Pin 行为仍由用户确认。

### 9.3 最小改造路径

1. 在 X300 上先跑 Qwen3-VL-2B Q4 基础模型性能门，不先训练 4B。
2. 建立固定测试集和人工图片对排序。
3. 实现 2B + MD Skill 基线。
4. 训练 2B 审美 LoRA，完成 A/B/C 对照。
5. 将 LoRA 结果作为 `PhotoCurationScore` 新字段接入，不覆盖现有技术质量。
6. 将 OpenCV.js 自动配准接入 `ARPhotoRunPage` 的相机叠加模式。
7. Photos Tab 用旅程精选串联搜索、地图 Pin 和重返现场。

## 10. GitHub 仓库选择清单

### 10.1 核心采用/优先验证

| 仓库 | 用途 | 结论 |
|---|---|---|
| [`QwenLM/Qwen3-VL`](https://github.com/QwenLM/Qwen3-VL) | 2B/4B 视觉语言基座 | 采用 2B；4B 作教师/对照 |
| [`huggingface/transformers.js`](https://github.com/huggingface/transformers.js) | 浏览器 WebGPU/WASM 推理 | PWA 主推理框架；需评估升级 v4 |
| [`Q-Future/Q-Align`](https://github.com/Q-Future/Q-Align) | 离散文字等级视觉评分 | 训练方法首要参考 |
| [`opencv/opencv`](https://github.com/opencv/opencv) | OpenCV.js、ORB、RANSAC、Homography | 重返现场 PWA 核心 |
| [`opencv/opencv_contrib`](https://github.com/opencv/opencv_contrib) | img_hash 等扩展算法 | 照片相似度/去重参考 |
| [`microsoft/onnxruntime-inference-examples`](https://github.com/microsoft/onnxruntime-inference-examples) | JavaScript/ONNX 推理示例 | 模型导出与浏览器接入参考 |

### 10.2 审美模型与训练参考

| 仓库 | 用途 | 结论 |
|---|---|---|
| [`idealo/image-quality-assessment`](https://github.com/idealo/image-quality-assessment) | NIMA MobileNet 审美/技术评分 | 轻量审美基线；仓库已归档但模型仍有参考价值 |
| [`LAION-AI/aesthetic-predictor`](https://github.com/LAION-AI/aesthetic-predictor) | CLIP embedding 上的审美线性评分 | 现代审美基线；PWA 直接运行偏重 |
| [`christophschuhmann/improved-aesthetic-predictor`](https://github.com/christophschuhmann/improved-aesthetic-predictor) | CLIP + MLP 审美预测 | 服务器/教师或对照参考 |
| [`chaofengc/IQA-PyTorch`](https://github.com/chaofengc/IQA-PyTorch) | NIMA、MUSIQ、BRISQUE、TOPIQ 等综合 IQA 工具箱 | 训练/评测工具，不作为 PWA 直接依赖 |
| [`ncoevoet/facet`](https://github.com/ncoevoet/facet) | 本地照片审美、构图、人脸、连拍和选片 | 产品逻辑与多维评分参考 |
| [`cleanlab/cleanvision`](https://github.com/cleanlab/cleanvision) | 模糊、曝光、近重复等问题检测 | 技术质量审计参考，不负责审美策展 |

### 10.3 数据集、评测与细粒度美学

| 仓库 | 用途 | 结论 |
|---|---|---|
| [`bcmi/Awesome-Aesthetic-Evaluation-and-Cropping`](https://github.com/bcmi/Awesome-Aesthetic-Evaluation-and-Cropping) | 数据集/论文/代码汇总 | 数据入口索引 |
| [`yipoh/AesBench`](https://github.com/yipoh/AesBench) | 多模态大模型审美理解评测 | 用于解释质量和理解能力评测 |
| [`thunderbolt215/ArtiMuse`](https://github.com/thunderbolt215/ArtiMuse) | 多维审美评分与专业解释 | 细粒度输出结构参考 |
| [`2U1/Qwen2-VL-Finetune`](https://github.com/2U1/Qwen2-VL-Finetune) | Qwen-VL 系列 LoRA/微调工程 | 训练脚本与数据格式参考；使用时对齐 Qwen3-VL 当前接口 |

### 10.4 相册搜索与完整照片产品参考

| 仓库 | 用途 | 结论 |
|---|---|---|
| [`mazzzystar/Queryable`](https://github.com/mazzzystar/Queryable) | 本地照片 embedding 与语义搜索 | “找照片”端侧索引参考 |
| [`apple/ml-mobileclip`](https://github.com/apple/ml-mobileclip) | 轻量 CLIP 与移动端示例 | 粗筛/embedding 模型参考 |
| [`ente-io/ente`](https://github.com/ente-io/ente) | 本地人脸、语义搜索、加密照片索引 | 完整架构参考 |
| [`immich-app/immich`](https://github.com/immich-app/immich) | CLIP 搜索、OCR、人物、重复与照片堆叠 | 产品交互和数据结构参考 |
| [`Cap-go/capacitor-photo-library`](https://github.com/Cap-go/capacitor-photo-library) | Capacitor 原生相册 asset/缩略图桥 | 当前纯 PWA 不依赖；若恢复原生壳可用 |

### 10.5 推理、原生和 AR 备选

| 仓库 | 用途 | 结论 |
|---|---|---|
| [`nihui/opencv-mobile`](https://github.com/nihui/opencv-mobile) | 精简 OpenCV 原生/WASM 构建 | 不是现成重返现场；PWA v1 不首选 |
| [`alibaba/MNN`](https://github.com/alibaba/MNN) | Android/端侧多模态原生推理 | 原生部署路线；纯 PWA 不直接使用 |
| [`mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) | 浏览器 LLM WebGPU 推理 | 项目已有依赖；Qwen3-VL 多模态优先验证 Transformers.js v4 |
| [`google/model-viewer`](https://github.com/google/model-viewer) | WebXR/Scene Viewer/Quick Look 统一入口 | 三维照片花园增强项 |

## 11. 推荐的比赛 Demo

1. 用户打开 Photos，看到由真实照片生成的“南京的夏”旅程卡片。
2. 系统展示同一地点的三张候选照片。
3. 切换“普通 MD Skill”和“Aesthetic LoRA Skill”，展示选片结果与理由差异。
4. LoRA Skill 选出最适合作为地点封面的照片，并生成结构化审美解释。
5. 用户点击“重返现场”，地图引导到照片附近。
6. PWA 打开相机，OpenCV.js 自动将旧照片对齐当前街景。
7. 用户拖动过去/现在分割线，保存对比图并 Pin 回 Pocket Earth。
8. 最后展示 RunTrace：模型为 Qwen3-VL-2B、加载方式、LoRA Skill 版本、耗时和降级路径。

这条 Demo 同时证明：

- Photos 不只是苹果相册已有的语义搜索。
- LoRA Skill 比 Markdown Skill 多学到了真实视觉偏好。
- 2B 在 vivo X300 PWA 中比 4B 更适合稳定展示。
- Pocket Earth 将照片理解、地点、回访和现实对齐串成了完整闭环。

## 12. 最终执行顺序

1. **先做实机门：** X300 上验证 Qwen3-VL-2B Q4、Transformers.js v4、单图 448～512px。
2. **再做评测集：** 固定同主题图片对、人工排序和重复一致性测试。
3. **建立 MD Skill 基线：** 同一输出 Schema、同一测试集。
4. **训练 2B LoRA Skill：** 离散等级 + 同主题二选一 + Pocket Earth 专属标签。
5. **完成 A/B/C/D 对照：** 2B Base、2B MD、2B LoRA、4B MD。
6. **接入 Photos 数据模型：** 技术质量与审美策展分开保存。
7. **实现 OpenCV.js 重返现场：** 自动配准 + 手动兜底。
8. **最后打磨 Demo 和 RunTrace：** 确保 20 张连续运行稳定，比赛默认不加载 4B。

