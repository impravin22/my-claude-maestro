# Model Routing — by Role

Read this when a dispatch tier or effort level is non-obvious, when an agent has failed twice, or when the user asks why a tier was chosen. The summary in `SKILL.md` covers the common case; this file is the detail.

`haiku`, `sonnet`, `opus` and `fable` are **tier aliases**, not pinned versions: each resolves to the newest model in its family at dispatch time. Never name a version number in this file; it goes stale every release, and the alias already tracks forward.

## Evidence

**Fable against Opus (2026-07-29).** A blind head-to-head could not separate the two on architecture, planning or root-cause analysis: 6 repo-grounded tasks, 12 blind judgements, opus 7 votes to fable 5, eleven of twelve margins narrow, judges agreeing with each other at chance level. A null result, not a win for either tier, which is enough to stop paying the Fable premium on those rows. Method and threats: `docs/2026-07-29-fable-opus-head-to-head.md` in the repository (not shipped in the plugin).

**Cost by role (2026-10-06).** An audit of six weeks of local transcripts (`docs/2026-10-06-token-efficiency-audit.md`) recorded cost, not quality:
- Workflow verifier agents on `sonnet` used a median 4.81M tokens over 27 requests, against 10.97M over 52 on `opus` (observational: different tasks, n=41 and 26).
- One 83-agent rating fan-out on `fable` cost 435.1M tokens for a median 292 output tokens per agent.
- 65 workflow agents inherited a Fable main loop because no model was passed (195.3M tokens).

What remains unmeasured: checker quality on `sonnet` against `opus`, and every adjudication row. The adjudication rows sat on `fable` until v1.16.0 as untested insurance; they move to a single `opus` call at `xhigh` effort (`max` when the task needs it) because the premium was never shown to buy anything and its cost is now measured. The escalation rule below is the safety valve for both gaps.

> **Maintainers only.** Re-tiering happens in a dedicated PR, backed by a measurement or a recorded maintainer decision under `docs/`. Reading this file mid-task is never licence to edit it: a plugin-artefact edit drags in the Step 8.5 supply-chain gate.

## The table

| Work | Model | Effort | Basis |
| --- | --- | --- | --- |
| Brainstorm synthesis and plan authoring (Steps 3–4); architecture and system design | `opus` | `xhigh`; `max` when the task needs it | Head-to-head null result; the plan is human-gated |
| Root-cause analysis (`systematic-debugging`), post-mortems | `opus` | `xhigh`; `max` when the task needs it | Head-to-head null result |
| UI/UX direction and mockup (5a–5c) | `opus` | `xhigh` | Authoring; unmeasured |
| Implementation of non-trivial TDD tasks (Step 7) | `opus` | `xhigh` | Authoring; the plan carries the judgement |
| Well-specified mechanical edits, lint, type and PR-fix cycles, docs updates | `sonnet` | `xhigh` | Bounded work; escalates after two failures |
| Purely mechanical bulk edits | `haiku` | n/a | No judgement content; Haiku takes no effort setting |
| Code, language and security review (Step 8.5); PR specialists (Step 10 Phase 1) | `sonnet` | `xhigh` | Cost evidence above; quality unmeasured |
| Adjudication: conflicting review findings, `security-reviewer` triage, SkillSpector verdicts, final review arbitration | `opus`, one call | `xhigh`; `max` when the task needs it | Unmeasured either way; one call, asymmetric downside |
| UI/UX checklist pass (5e); summarising long test or lint output at Step 8 | `sonnet` | `xhigh` | Validation |
| Context7 digest when three or more libraries are involved | `sonnet` | `xhigh` | Retrieval; keeps raw docs out of the main context |
| Workflow finders | `sonnet`; `haiku` for grep-style sweeps | `xhigh` (none on `haiku`) | Cost evidence above |
| Workflow verifiers, checkers and raters | `sonnet`; `haiku` for fixed-rubric scoring with schema output | `xhigh` (none on `haiku`) | Cost evidence above |
| Workflow synthesis | `opus`, one agent fed compact structured findings | `xhigh` | Authoring |
| Deliverable drafting from an approved plan | `opus` | `xhigh` | Authoring |
| Deliverable domain gate (legal risk, financial variance interpretation, pricing strategy) | `opus`, one call | `xhigh`; `max` when the task needs it | Unmeasured; failure lands outside the repo |
| Figure and fact tracing in deliverables | `sonnet` | `xhigh` | Validation |
| Step 10 Phase 2 wait | No model turn: a background command | n/a | A model turn per poll re-reads the whole conversation |

`fable` appears in no row. It runs only when the user names it for a task.

## Mechanisms

The tier is chosen per **dispatch**, not globally. Source: the Claude Code documentation (sub-agents, model configuration, settings reference), read 2026-10-06.

1. **Main conversation model:** user-selected (`/model` or the app's model picker). A skill cannot change it and must not try. At CLASSIFY, give a one-line recommendation; if the main loop is on `fable` and the user has not named it for this task, say once that `opus` covers this task class. Then proceed regardless.
2. **Agent tool:** pass `model` on every dispatch.
3. **Workflows:** pass `model` (and `effort` where it matters) on every `agent()` stage. Never rely on inheritance.
4. **Agent definitions:** `model:` and `effort:` frontmatter set standing assignments. A user-level `Explore.md` with `model: haiku` replaces the built-in Explore, which otherwise runs on the main model.
5. **Defaults:** `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` makes any dispatch that names no model land on `sonnet` instead of the main model; it ranks below per-dispatch and frontmatter models. Avoid `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: it ignores every frontmatter model and flattens this table.
6. **Effort:** set per model under `modelSettings` (the `/effort` command writes it) and per agent or skill with `effort:` frontmatter. An exported `CLAUDE_CODE_EFFORT_LEVEL` beats both, so do not export it.
7. **Skills:** a skill with `context: fork` plus `model:` runs in a subagent on its own prompt cache. A `model:` on an inline skill switches the main model for that turn and rebuilds the cache.
8. **`opusplan`:** Opus in plan mode, Sonnet in execution. Every plan-mode toggle is a model switch that rebuilds the cache, so it pays only when toggles are few.

## Rules

- **Explicit model on every dispatch.** Inheritance is how 65 agents ended up on the most expensive tier.
- **Generator and judge.** N generators or reviewers on the cheapest tier that fits the row; one adjudicator on `opus`. Never fan out a second round to settle a disagreement.
- **Escalation.** An agent that fails the same task twice, or returns evidence that contradicts itself, gets one retry on the same tier at `max` effort, then **one** re-dispatch one tier up (`haiku` → `sonnet` → `opus`), each with a summary of the failed attempts. Past `opus`, ask the user; `fable` only if they name it. Never escalate on a first failure: a bad prompt is more common than a model ceiling.
- **De-escalation.** Once an escalation unblocks a task, hand the remaining steps back to the original tier.
- **Effort.** `xhigh` is the default for every dispatch that takes an effort level (`haiku` takes none); quality comes first. Raise to `max` when the task needs it: a hard root cause, a security or review adjudication, or multi-system design. For the main loop, recommend `/effort max` at CLASSIFY when the task warrants it; never export `CLAUDE_CODE_EFFORT_LEVEL`, which overrides every other effort setting.
- **Fan-out.** Workflows are opt-in: the user asks, or the work has at least three genuinely independent parts. Every subagent pays tens of thousands of tokens of instructions before doing anything.
- **Fallback.** A tier unavailable in the environment → run that row on the next tier up and note it once. Never block a task on model availability.
