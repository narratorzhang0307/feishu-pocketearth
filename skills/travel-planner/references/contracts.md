# Travel Planner contracts

## `pocket.travel-intent/v1`

The parser produces a closed, versioned intent object. The host UI remains authoritative for destination, date, and selected chips; model output may add constraints but cannot overwrite explicit UI values.

Required logical fields:

- `destination`, `dates`, `duration_days`
- `hard_constraints`: walking limit, accessibility, diet, must-visit, avoid, transport, lodging
- `soft_preferences`: interests, cuisines, pace, crowd tolerance, mix strategy
- `mapping_scope`: selected source Skill IDs
- `missing_fields`, `next_action`, `tool_calls`, `clarification_question`

The deployed quantized MNN adapter may emit semantically equivalent aliases such as `preference`, `constraints.max_walk_distance_km`, `soft_constraints.comfort_level`, or `preferences.theme_mix`. The host adapter may normalize only documented semantic aliases; it must not invent a place, budget, date, or explicit kilometer value. UI destination/date/duration remain authoritative.

Execution mapping:

- `pace=slow` defaults to three core stops plus one clearly labelled optional stop per full day; balanced pace defaults to four core stops; fast pace defaults to five. An optional stop is never presented as mandatory. An explicit `max_stops_per_day` is authoritative and produces only core stops, such as “每天最多 2 个地点”.
- `crowd_tolerance=low` raises verified small/local candidates; it does not label an unverified place “uncrowded”.
- `mix_strategy=balanced` rewards distinct categories; `theme_day` groups same-theme candidates.
- A generic “少走路” request enables geographic compactness without inventing a kilometer value. Only populate and display `walking_limit_km` when the user supplies a number; until walking-route data verifies it, label the value as a planning target rather than a satisfied distance guarantee.
- `must_visit` is prioritized before soft ranking; `avoid` is filtered before ranking.

Unknown or malformed fields must be ignored. Never infer a missing fact merely to make validation pass.

## `pocket.travel-knowledge/v1`

Normalize every candidate place to:

```json
{
  "schema": "pocket.travel-knowledge/v1",
  "id": "stable-source-record-id",
  "title": "Place name",
  "city": "City",
  "coordinates": { "lat": 30.0, "lng": 120.0, "system": "wgs84" },
  "source_skill": "installed-skill-id",
  "source_ref": "record-id-or-evidence-link",
  "kind": "food|nature|museum|exhibition|literature|heritage|custom",
  "tags": [],
  "confidence": 0.9,
  "human_confirmed": true,
  "visit_duration_minutes": 60,
  "opening_hours": null,
  "opening_hours_verified": false,
  "estimated_cost": null,
  "cost_currency": null,
  "wheelchair_accessible": null,
  "note": null
}
```

Reject unconfirmed coordinates from automatic routing. Unknown opening hours may remain candidates only with a visible “出发前核实” notice.

## Book, movie, and music relationship

- A book's `storyPlaces`, a movie's location metadata, or a song's city tag is a taste signal by default.
- Promote it to a travel candidate only when a separate, evidence-bearing location record provides real coordinates and source provenance.
- Unloading a book/movie/music pack removes its optional signals and map layer, not the Travel Planner Skill or saved trips.

## `pocket.travel-place-brief/v1`

Place details are generated only after the user opens a stop. Retrieval and writing are separate layers: the host asks the server-side DashScope Qwen search route to discover candidate pages, the deterministic gate keeps three independent authoritative publishers, and only then does Qwen receive those extracted materials as its complete factual boundary. The API key stays on the server.

Required output fields:

- `text`: approximately 450–550 Chinese characters with inline source numbers, or a clearly labelled source extract when grounded generation fails
- `sources[]`: exactly three independently published records for the same entity, preferring the venue/operator, a government or destination-management body, and a separate authoritative reference; each preserves publisher, exact title, canonical HTTPS URL, source excerpt and revision identifier when available
- `retrieved_at`: ISO-8601 retrieval time
- `model`: the actual Qwen model used to write the summary

Rules:

- Never let the model browse arbitrary URLs, invent a citation, or silently use model memory as evidence.
- For cloud retrieval use DashScope Qwen web search with forced, broad search; do not label it “Bing”. The official built-in search is a Qwen/Model Studio search capability, and the deterministic source gate remains authoritative about what may be cited.
- Count independent institutions and registrable domains, not languages. Multiple Chinese, local-language or English editions published by the same institution count as one source; Wikipedia language editions and Wikimedia mirrors together count as one source.
- Require three distinct source groups before generation. If retrieval cannot find three reliable independent publishers, show “证据不足” and do not pad the list with translations, mirrors, blogs or booking platforms.
- Never state opening hours, admission prices, rankings or current access conditions unless the retrieved material explicitly supports the claim and its freshness is suitable.
- Render every source as a user-openable link after the summary so the original material can be checked.
- Prefer facts corroborated by multiple sources. Permit a distinctive single-source fact only when its sentence carries that source number and the claim is present in the supplied excerpt.
- Reject generic filler such as “历史悠久”“底蕴深厚”“独具魅力”“值得一游”; use concrete names, objects, events, customs and place-specific contrasts instead.
- When retrieval finds no reliable source, show that state instead of a generic introduction. When Qwen fails after retrieval, keep the source links visible and use only a clearly labelled verbatim source extract.
- Reject a generated draft when it introduces a year, number, price, rank or high-risk promotional claim absent from the retrieved material. In that case, display a bounded verbatim source extract and label it as such; never label the extract as Qwen-generated text.
