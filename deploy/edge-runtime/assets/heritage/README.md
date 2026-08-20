# Heritage on-device artifacts

These are the exact deployable artifacts used by the three heritage Skills.

| Skill | Artifact | SHA-256 |
| --- | --- | --- |
| Ancient-book visual OCR | `guji-v2/visual-lora.mnn` | `6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112` |
| Rubbing/stele visual OCR | `rubbing-v2/visual-lora.mnn` | `1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e` |
| General document/photo OCR | `general-ocr-release/visual-lora.mnn` | `d09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e` |
| Masked image restoration | `restorer-v1/heritage-restorer.mnn` | `c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87` |

The adapter files are graph overlays, not complete copies of Qwen. At install time `server.py` creates visual graph weight aliases as hard links to one shared INT8 precision base. General OCR v6 is deliberately visual-only and keeps the shared Qwen decoder unchanged. All three released overlays are pinned to visual graph SHA-256 `087805fa…fa31` and shared visual weight SHA-256 `dba2242b…8b29`; the stock downloadable INT4 package is retained as a fallback base but is rejected for these overlays instead of being treated as compatible.

`general-ocr-v1`, the v5 paired export, and v6 scale 0.5/0.75 calibrations are retained only as rejected research artifacts. The released full-strength v6 reduced frozen-blind total CER from 0.5112 to 0.4219 and stress CER from 0.6461 to 0.4174, with no degenerate or catastrophic pages after the completeness gate. Its clean-page CER is 0.4264 versus the base's 0.3763, so reliable digital text is still extracted directly and the product records this limitation instead of claiming universal dominance.

The U-Net generator is a fixed 256×256 tile model. PatchGAN was used only as a training discriminator and is intentionally not deployed.
