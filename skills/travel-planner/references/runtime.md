# Qwen + Travel LoRA runtime

## Verified module

- Base: `Qwen/Qwen3-VL-2B-Instruct`
- Base revision: `ae9985b208c074c10cfbe3a61b5cb7268cdc9c53`
- Runtime: `MNN 3.6.1`
- Adapter ID: `travel-planner`
- Scope: language-only, rank 16, alpha 32
- Deployment LoRA SHA-256: `791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13`
- Deployment size: `72,633,256` bytes
- Expected base graph SHA-256: `c2286f60cbd56a82f26bfeac92f6a96e9690889b1939346abfe9e1fae996a8f3`
- Expected shared language weight SHA-256: `1554f9ce71743b56c2d7fba4cb0c2a31c7cddf4f21e1a2ff5a2e85b9a316a29f`

The LoRA reuses `llm.mnn.weight`. Do not duplicate the 1+ GB shared weight per Skill.

## Request chain

```text
Pocket Earth Travel UI
  -> POST /api/edge { task: "chat", adapter: "travel-planner" }
  -> local MNN sidecar /v1/chat
  -> Qwen3-VL-2B shared language base + travel-planner LoRA
  -> pocket.travel-intent/v1 gate
  -> deterministic candidate ranking, weather, routing, and map write-back
```

## Prompt compatibility

The adapter was trained against the exact `shangjiequ.travel-intent/v1` system prompt. Keep that model-facing prompt and express the UI request in its familiar natural form, for example destination + duration + date + interests + “节奏悠闲 / 步行上限 / 避开 / 均衡主题”. Convert the accepted result to `pocket.travel-intent/v1` only after inference.

Do not add motivational instructions such as “be smarter” or ask the LoRA to generate a polished itinerary. Prompt changes are allowed only to recover trained slots and tool routing. The deterministic solver remains responsible for station count, diversity, route ordering and constraint application.

## Failure behavior

- Missing sidecar, base, adapter, or hash match: return `backend=stub`; use rules and label the UI accordingly.
- Empty or arbitrary malformed model output: reject and use rules.
- The one allowed deterministic repair is an extra anonymous root object before `next_action`, `tool_calls`, `missing_fields`, or `clarification_question`.
- Do not claim SME2 performance until tested on an Armv9 device supporting SME2.

The public machine-readable manifest lives at `public/models/travel-planner/manifest.json`.
