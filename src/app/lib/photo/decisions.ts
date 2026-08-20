import type { PhotoDecisionGroups, PhotoRadarAnalysis } from './radarTypes';

export function buildPhotoDecisionGroups(analyses: PhotoRadarAnalysis[]): PhotoDecisionGroups {
  const clusters = new Map<string, PhotoRadarAnalysis[]>();
  for (const item of analyses) {
    if (!item.clusterId) continue;
    const group = clusters.get(item.clusterId) || [];
    group.push(item);
    clusters.set(item.clusterId, group);
  }
  return {
    bursts: [...clusters.values()].filter((group) => group.length > 1)
      .sort((a, b) => Math.max(...b.map((x) => x.technicalQuality)) - Math.max(...a.map((x) => x.technicalQuality))),
    duplicates: analyses.filter((item) => !!item.duplicateOf),
    technicalIssues: analyses.filter((item) => item.photoType === 'junk' || item.technicalQuality < 24),
    documents: analyses.filter((item) => item.photoType === 'document' || item.tags.some((tag) => /票据|发票|登机牌|二维码|document|receipt/i.test(tag))),
    earthCandidates: analyses.filter((item) => item.pinnable),
  };
}

