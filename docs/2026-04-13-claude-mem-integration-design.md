# Plugin Integration Design — claude-mem

**Date:** 2026-04-13
**Status:** Approved
**Version:** 1.2.0

## Problem

Maestro v1.1.0 orchestrates a disciplined 10-step workflow but is stateless across sessions:

1. **Classifications are re-derived** every session — prior rulings on "this is a config change" or "this is backend-only" evaporate.
2. **Brainstorms revisit rejected approaches** — there is no way to surface "we tried a DSPy retriever last month and it was 4× too slow" until the user manually remembers.
3. **Plans get re-authored** — structurally similar work (pagination, CRUD migration, endpoint refactor) is planned from scratch each time.

A grep across the v1.1.0 repo for `memory|observation|continuity` returns zero matches — maestro currently has no opinion on session persistence.

## Solution

Integrate [claude-mem](https://github.com/thedotmack/claude-mem) (v12.1.0) into the existing 10-step workflow as a RECOMMENDED plugin. No new steps — the 3 MCP tools enhance three existing steps (CLASSIFY, BRAINSTORM, PLAN) where prior context delivers the most leverage.

### 1. Memory lookup in Step 1 (CLASSIFY)

**What:** Before locking in the task classification, call the `search` MCP tool with keywords from the user's request and `timeline` for the affected project path.

**Integration:** Classification output becomes context-aware. Example: "Feature X. Prior observation (2026-03-20): user rejected approach Y because of Z."

**Requirement:** Surface the raw observation text (no paraphrasing) so the user can eyeball relevance before it anchors the classification.

### 2. Memory lookup in Step 3 (BRAINSTORM)

**What:** Before proposing approaches, call `get_observations` for similar prior work. Surface rejected approaches and their concrete failure reasons.

**Integration:** Prevents re-proposing solutions the user already rejected. Forces explicit justification when re-opening a previously rejected approach (state why the rejection reason no longer applies).

### 3. Memory lookup in Step 4 (PLAN)

**What:** Call `search` for prior plans with similar scope. Reuse proven plan skeletons where structurally appropriate.

**Integration:** Reduces redundant planning labour for patterns the user has ratified before (pagination, migration, endpoint scaffolding).

## Approach Selection

### Chosen: Deep Integration into CLASSIFY / BRAINSTORM / PLAN

The three steps where prior context most directly improves output. Matches the v1.1.0 integration philosophy: plugins enhance existing concerns, never introduce new ones.

### Rejected Alternatives

**A. Make claude-mem REQUIRED alongside superpowers and Context7:**
- Adds a service dependency (SQLite worker on port 37777, `~/.claude-mem/` directory, Bun + uv toolchain) to a plugin whose core promise is graceful degradation.
- claude-mem is AGPL-3.0; maestro is MIT. Making it REQUIRED creates legal-review friction for teams whose policies reject copyleft tooling — even though MCP-over-stdio is arms-length IPC and no code is vendored.
- Users without claude-mem would see maestro fail to initialise — contradicts the "maestro must work without recommended plugins" principle from the v1.1.0 design.

**B. Add a new workflow step (1.5 MEMORY or 11 ARCHIVE):**
- Inflates the flow from 10 to 11 steps — directly contradicts the v1.1.0 principle ("plugins enhance existing concerns, not introduce new ones").
- Memory retrieval has no standalone value — it only matters insofar as it changes CLASSIFY / BRAINSTORM / PLAN output.
- A separate archival step would duplicate what claude-mem's `Stop` and `SessionEnd` hooks already do automatically.

**C. Light reference (Prerequisites-only mention, no SKILL.md orchestration):**
- Wastes the 3 MCP tools — users wouldn't know when to call `search` vs `timeline` vs `get_observations`.
- No orchestration benefit — maestro's value is in telling you *what to do at each step*.
- Inconsistent with how Playwright and PR Review Toolkit were integrated in v1.1.0.

**D. Install via `/plugin marketplace add thedotmack/claude-mem`:**
- Upstream docs warn that the `/plugin` / `npm install -g` path installs only the SDK — the worker and MCP server are not registered.
- The apparently-working-but-silently-broken state is the worst failure mode (invisible).
- `npx claude-mem install` is the upstream-primary path and does everything end-to-end.

**E. Vendor claude-mem's code into maestro:**
- AGPL-3.0 copyleft would force maestro to relicense to AGPL-3.0 or dual-license — both change the distribution story for every downstream team.
- MCP-over-stdio is arms-length IPC that does not create a derivative work, so the RECOMMENDED + integration-via-MCP approach is license-clean.

## Trade-offs

1. **Longer SKILL.md** — grows ~24 lines across five insertions. Acceptable for the value added.
2. **Extra prerequisite entry** — one additional "Recommended" row. Mitigated by graceful degradation (plugin optional; memory substeps explicitly skipped when unavailable).
3. **Latency on Steps 1/3/4** — local MCP tool calls add ~50–200ms per step. Mitigated by the worker being local (no network) and by treating memory lookup as advisory (non-blocking).
4. **Stale-memory risk** — observations captured months ago may describe APIs/libraries that have since changed. Mitigated by Step 2 (CONTEXT7) fetching current docs regardless — when claude-mem says "we did X" and Context7 says "X is deprecated", Context7 wins.
5. **AGPL-3.0 / MIT licence boundary** — claude-mem is AGPL-3.0; maestro is MIT. No code is vendored; integration is via MCP tool calls over stdio only, so no licence contamination. Keeping claude-mem RECOMMENDED means teams subject to strict licence review can opt out without losing maestro.

## Files Changed

| File | Change |
|------|--------|
| `skills/maestro/SKILL.md` | Prerequisites bullet, Step 1 CLASSIFY memory substep, Step 3 BRAINSTORM memory bullet, Step 4 PLAN memory bullet, graceful-degradation entry |
| `skills/maestro/references/quality-gates.md` | New optional "Memory" gate section (observations captured + hooks healthy) |
| `README.md` | New prerequisites row for claude-mem, new "What It Does" item, plugin-structure tree updated |
| `.claude-plugin/plugin.json` | Version 1.1.0 → 1.2.0, extended description, 4 new keywords (`memory`, `claude-mem`, `context-persistence`, `observations`) |
| `.claude-plugin/marketplace.json` | Version 1.1.0 → 1.2.0, extended description |
| `docs/2026-04-13-claude-mem-integration-design.md` | This design doc |
