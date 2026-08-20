import { eraOf, matchMuseum } from './catalog';
import { artifactKey, type ArtifactDraft } from './types';

const today = () => new Date().toISOString().slice(0, 10);

export function createExhibitionDemoDraft(): ArtifactDraft {
  const museum = matchMuseum('卢浮宫');
  const era = eraOf('greece-hellenistic');
  const museumName = museum?.name || '卢浮宫';
  const lng = museum?.lng ?? 2.3376;
  const lat = museum?.lat ?? 48.8606;
  const nameZh = '萨莫色雷斯胜利女神像';

  return {
    id: artifactKey(nameZh, museumName),
    nameZh,
    museum: museumName,
    exhibition: '本地示例',
    eraStart: era?.start ?? -323,
    eraEnd: era?.end ?? -31,
    tags: {
      nameEn: 'Winged Victory of Samothrace',
      dynastyKey: 'greece-hellenistic',
      dynastyLabel: era?.zh || '希腊化时代',
      material: ['大理石'],
      category: '造像',
      culture: '古希腊',
      findspot: '萨莫色雷斯岛',
      dimensions: '高约 244 厘米',
      myRating: 5,
      curatorNote: '她把海风、船艏和胜利瞬间凝成一个可以绕着看的身体。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 约公元前323年',
    },
    labels: [{
      lang: 'zh',
      rawText: '本地示例展签：希腊化时代，大理石造像，现藏卢浮宫。',
      ocrEngine: 'manual',
    }],
    splat: {
      status: 'ready',
      sourceKind: 'preset',
      engine: 'preset',
      splatUrl: '/exhibits/preset-nike.splat',
      format: 'splat',
    },
    photos: [],
    geo: { kind: 'venue', place: museumName, lng, lat, confidence: 0.95 },
    needPlace: false,
    source: 'manual',
    confidence: 0.95,
    needsConfirm: true,
    reason: '本地 demo：无需 Qwen 云端 key、相机权限或用户 3D 文件',
    visitDate: today(),
  };
}

export function createQwenOwnedGpuCompetitionDemoDraft(): ArtifactDraft {
  const draft = createExhibitionDemoDraft();
  return {
    ...draft,
    source: 'mixed',
    confidence: 0.94,
    reason: 'Qwen视觉识别；Qwen结构化补全；Qwen生成导览词（3D展品卡）；云端 mock 3D 已完成',
    labels: [{
      lang: 'zh',
      rawText: 'Winged Victory of Samothrace\nMarble, Hellenistic period\nLouvre',
      ocrEngine: 'qwen-vision',
    }],
    tags: {
      ...draft.tags,
      aliases: ['Nike of Samothrace'],
      qwenConfidence: 0.94,
      curatorNote: '旋转模型时先看船首和衣褶，海风像被固定在大理石里。',
      timelineNote: '时间线位置：古希腊 · 希腊化时代 · 卢浮宫',
    },
    splat: {
      status: 'ready',
      sourceKind: 'multi-image',
      engine: 'qwen-colmap-gsplat',
      splatId: 'mock-owned-gpu-3d',
      format: 'ply',
      taskId: 'mock-owned-gpu-task',
    },
  };
}
