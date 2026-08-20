import type { ArtifactDraft, ExhibitRepresentations, Splat3D } from './types';

export const isQuick2_5D = (asset: Splat3D | null | undefined): boolean =>
  asset?.format === 'multiview-2_5d' || asset?.sourceKind === 'multi-image-2_5d';

export function representationsOf(draft: Pick<ArtifactDraft, 'splat' | 'representations'>): ExhibitRepresentations | null {
  if (draft.representations) return draft.representations;
  if (isQuick2_5D(draft.splat)) return { quick2_5d: draft.splat! };
  return null;
}

export function full3DOf(draft: Pick<ArtifactDraft, 'splat' | 'representations'>): Splat3D | null {
  if (draft.representations?.full3d) return draft.representations.full3d;
  return draft.splat && !isQuick2_5D(draft.splat) ? draft.splat : null;
}

export const hasOpenableAsset = (asset: Splat3D | null | undefined): boolean =>
  !!asset && asset.status === 'ready' && !!((asset.splatUrl || '').trim() || (asset.splatId || '').trim());

export function viewingAsset(
  draft: Pick<ArtifactDraft, 'splat' | 'representations'>,
  requested: 'quick2_5d' | 'full3d',
): Splat3D | null {
  const reps = representationsOf(draft);
  const full3d = full3DOf(draft);
  if (requested === 'full3d' && hasOpenableAsset(full3d)) return full3d;
  if (reps && hasOpenableAsset(reps.quick2_5d)) return reps.quick2_5d;
  return hasOpenableAsset(draft.splat) ? draft.splat : null;
}

export function attachFull3D(draft: ArtifactDraft, full3d: Splat3D): ArtifactDraft {
  const reps = representationsOf(draft);
  if (!reps) return { ...draft, splat: full3d };
  return {
    ...draft,
    splat: reps.quick2_5d,
    representations: { quick2_5d: reps.quick2_5d, full3d },
  };
}

export function removeFull3D(draft: ArtifactDraft): ArtifactDraft {
  const reps = representationsOf(draft);
  if (!reps) return isQuick2_5D(draft.splat) ? draft : { ...draft, splat: null };
  return {
    ...draft,
    splat: reps.quick2_5d,
    representations: { quick2_5d: reps.quick2_5d },
  };
}
