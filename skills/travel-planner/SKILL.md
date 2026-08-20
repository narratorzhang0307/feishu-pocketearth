---
name: travel-planner
description: Compose a source-linked, constraint-checked itinerary from a destination, dates, user constraints, replaceable city data, and installed Pocket Earth Skills. Use when a user asks for a day trip, multi-day plan, low-walking route, mixed-interest itinerary, or wants books, movies, music, heritage, exhibitions, food, nature, or personal map data to influence travel planning. Parse intent with the Travel Planner LoRA when available, then validate and solve deterministically; never invent places, opening hours, prices, or bookings.
---

# Travel Planner

Treat this Skill as an orchestrator. Keep model capability, content data, and route calculation separate.

## Workflow

1. Send the request to the LoRA with its trained `shangjiequ.travel-intent/v1` system prompt and natural-language request format. Do not rename the model-facing schema to `pocket.*` inside the prompt.
2. Adapt the accepted model output into host contract `pocket.travel-intent/v1`, preserving hard constraints, pace, crowd tolerance, mix strategy and source trace. If unavailable or invalid, emit the same host contract with explicit `source=rules`.
3. Read only metadata for installed content/data Skills; load records lazily after the user selects a source.
4. Normalize candidate places to `pocket.travel-knowledge/v1`. Read [references/contracts.md](references/contracts.md) when adapting a new source.
5. Preserve each place's source Skill, record ID, coordinates, freshness, and confidence.
6. Apply hard constraints before ranking. Make pace change stops per day; make crowd tolerance and mix strategy change ranking; make low-walking requests prefer geographically compact ordering. Never silently relax accessibility, avoidance, time, budget, or confirmed-coordinate requirements.
7. Use deterministic tools for weather, transport, route distance, day splitting, and map write-back. For every selected stop, show its time-of-day slot, recommended visit-duration range, matched constraint, source, and facts that still need pre-departure verification. Never ask the model to calculate or invent them.
8. Keep place introductions lazy. When the user asks for a stop's details, retrieve up to three fixed-allowlist sources for the same entity, preferring Chinese, local-language and English editions; preserve every canonical URL, revision identifier and retrieval time. Ask the Qwen base model for a concrete 450–550-character Chinese introduction with inline source numbers. Favor recognizable names, events, objects, customs and place-specific contrasts; reject generic praise. Show all source links after the summary. If no verifiable material exists, or grounded generation fails, do not invent a description.
9. Return a draft. Save or place it on the map only after an explicit user action.

## Data boundaries

- Books, movies, and music Data Packs can shape local taste signals; they do not become travel facts.
- City, map, heritage, food, exhibition, and user-created packs can provide candidate places only through the common place contract.
- Replacing or unloading a Data Pack must not remove the Skill, LoRA, or private trip history.
- Keep large databases, photos, and downloadable models outside the initial bundle; load versioned manifests and verify SHA-256.

## Runtime rules

Read [references/runtime.md](references/runtime.md) when installing, testing, or changing the Qwen/MNN chain.

- Accept LoRA output only when the response reports the MNN backend and the `travel-planner` adapter is installed.
- Never use Gemma, a generic Qwen base, an Ollama model, or mock output while labeling the result “Travel LoRA”.
- Repair only the documented MNN INT4 extra-root-brace syntax fault. Reject other malformed JSON.
- Show the user whether the run used `Travel LoRA` or `规则回退`.
