# Aesthetic Curator Training Workspace

This workspace implements the training contract in:

`docs/strategy/Pocket-Earth-Photos-审美LoRA训练最终行动准则-2026-08-11.md`

Rules:

1. Raw images, upstream clones, private evaluation images, checkpoints and exported models do not enter Git.
2. `manifests/` records source URLs, exact revisions, hashes, download time and intended use.
3. Splits are group-aware by source image, theme/challenge and near-duplicate cluster. Pair rows are never randomly split.
4. The blind test set is frozen before training pairs are generated.
5. No paid PAI job is submitted without an explicit per-run cost cap.

Current frozen learnability bundle (`bundles/learnability-v1`, ignored by Git):

- 1,327 train / 174 validation / 174 test canonical pairs;
- 2,654 train rows after exact A/B position swapping;
- 3,071 SHA-256-verified images, 545,578,086 bytes;
- 927 TAD66K + 400 AADB train pairs;
- no selected image, pHash duplicate group or known cross-dataset near duplicate crosses a split;
- SPAQ is not included until its selected images pass the same image and pair gates.

Directories are created on demand. The checked-in files are contracts, reports and small reproducibility metadata only.

First guarded PAI run:

- Job `dlcjz4xl668a09b3` succeeded in 1,567 seconds; estimated resource cost at the verified rate is CNY 4.57.
- The visual/aligner Adapter and Base/MD/LoRA outputs were downloaded and hash-verified under `runs/learnability-v1-20260811T135300Z/`.
- The model promotion gate failed: LoRA choice accuracy tied the MD baseline at 59.375% on the 16-pair engineering probe, and format compliance was insufficient.
- No Pilot expansion or blind paid retry is allowed. See `runs/learnability-v1-20260811T135300Z/EXECUTION-REPORT.md` and the final strategy document for the v2 preconditions.
