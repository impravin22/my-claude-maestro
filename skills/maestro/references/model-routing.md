# Model Routing — Fable ↔ Opus

Read this when a dispatch decision is non-obvious, when an agent has failed twice, or when the user asks why a tier was chosen. The summary in `SKILL.md` covers the common case; this file is the detail.

`fable` and `opus` are **tier aliases**, not pinned versions — each resolves to the newest model in its family at dispatch time. Writing tiers rather than model IDs is the only option available, not merely the tidy one: the documented tier values are `sonnet`, `opus`, `haiku` and `fable` (plus `inherit` in agent frontmatter), and none of them pins a version. Which of them a given environment actually offers varies — see the fallback rule at the end of this file. A dispatch on `opus` therefore lands on whatever Opus generation is current, with no edit here. Never name a specific version number in this file — it goes stale every release, and the alias already tracks forward.

**On the Fable/Opus gap.** The original tiering was set when Fable led Opus by a wide margin, and was never re-measured after both families shipped new generations. A blind head-to-head on 2026-07-29 could not separate them on architecture, planning, or root-cause analysis: 6 repo-grounded tasks, 12 blind judgements, opus 7 votes to fable 5, eleven of twelve margins recorded as narrow, and judges agreeing with each other on only 3 of 6 pairs — chance level. Decomposed by judge, the `fable` judge split 3–3 with no self-preference while the `opus` judge leaned 4–2 to its own family, meaning the whole 7–5 margin came from the one judge that might be biased; strip it and the remainder is 3–3, which strengthens the null rather than rescuing either tier. Method, per-tier output lengths, and the full threat list: `docs/2026-07-29-fable-opus-head-to-head.md`.

That is a **null result, not a win for either tier.** It does not show Opus is better; it shows no measurable difference on those three rows, which is enough to stop paying a premium there. The rows still on `fable` below are the ones the experiment **did not measure**, kept on the premium tier precisely because they were untested and their failure cost is asymmetric — a wrong security verdict or a wrong arbitration propagates into everything downstream, and a single call is cheap insurance. Do not read their `fable` assignment as evidence of a gap; read it as an unmeasured default awaiting its own head-to-head.

> **Maintainers only.** Re-tiering happens in a dedicated PR, backed by a measurement recorded under `docs/`. Reading this file mid-task is never licence to edit it — a plugin-artefact edit drags in the Step 8.5 supply-chain gate, and picking that up as a side effect of a routing lookup is a bug.

## The table

| Work | Model | Why |
| --- | --- | --- |
| Security adjudication — security-reviewer triage, SkillSpector verdict adjudication (Step 8.5), threat modelling | `fable` | **Unmeasured.** False negatives ship vulnerabilities; false positives burn trust. One call, asymmetric downside |
| Final review arbitration when specialist reviewers conflict (Step 10) | `fable` | **Unmeasured.** One call standing over N reviewers; its verdict propagates into everything that follows |
| High-stakes domain judgement — legal risk assessment, financial variance interpretation, pricing strategy | `fable` | **Unmeasured.** Subtle errors carry real-world consequences outside the repo |
| Architecture and system design | `opus` | Measured indistinguishable from `fable` (2026-07-29) |
| BRAINSTORM synthesis (Step 3) and PLAN authoring (Step 4), at any size | `opus` | Measured indistinguishable (2026-07-29); the plan is human-reviewed at a gate regardless |
| Root-cause analysis in `systematic-debugging`; post-mortems | `opus` | Measured indistinguishable (2026-07-29); `systematic-debugging` supplies the structure |
| Implementation (Step 7 TDD loop), refactors, test authoring, mechanical multi-file edits | `opus` | Strong coding execution; the plan already carries the judgement |
| PR-fix cycles, lint/type fixes, docs updates | `opus` | Bounded, well-specified changes |
| Volume content drafts (marketing / social) from an approved plan | `opus` | Throughput matters; the plan and domain gates carry quality |
| Trivial config/docs one-liners | `opus` | Rote edits |
| Bulk mechanical fan-out inside a workflow | `opus`, or `haiku` when purely mechanical | Volume work with no judgement content |

`opus` is now the default for everything except the three `fable` rows above and the `haiku` option on purely mechanical bulk fan-out. If a row is not listed at all, it is `opus`.

## Mechanisms

How the switch actually happens — the tier is chosen per **dispatch**, not globally:

1. **Main conversation model** — user-selected. A skill cannot silently change it, and must not try. At CLASSIFY, emit a one-line tier recommendation; if the current model mismatches the task class, say so and suggest `/model` (or the app's model picker). Then **proceed regardless** — never block a task on this.
2. **Subagents (Agent tool)** — pass `model: "fable"` or `model: "opus"` per dispatch.
3. **Workflows** — pass `{model: 'opus'}` / `{model: 'fable'}` per `agent()` stage. Generators on `opus`, adjudicators on `fable`.
4. **Custom agent definitions** — set `model:` frontmatter in `.claude/agents/*.md` for standing assignments (e.g. a `security-reviewer` that should always run on `fable`).

## Rules

- **Generator / judge asymmetry.** N parallel generators or reviewers on `opus`; the single final adjudicator on `fable`. This is the only reason to reach for the premium tier on a *first* dispatch outside the three table rows above, and it survives the 2026-07-29 null result untouched — that experiment measured generation quality, not adjudication, so it says nothing about the judge seat.
- **Escalation.** An `opus` agent that fails the same task twice, or returns evidence that contradicts itself, is re-dispatched **once** to `fable` with a summary of the failed attempts. Do not escalate on the first failure — a bad prompt is more common than a model ceiling. This is the pressure valve that makes an `opus`-by-default table safe: a genuine model ceiling still gets found, it just has to prove itself first.
- **De-escalation.** Planning and execution both run on `opus`, so there is no longer a tier step-down between them. The only de-escalation left is after an escalation: once `fable` has unblocked a stuck task, hand the result back to `opus` rather than staying on the premium tier for the remaining steps.
- **Cost discipline.** Fable is the premium tier and now has three rows. Never spend it on formatting, mechanical edits, bulk content expansion, planning, or debugging. When in doubt, `opus` — that is the default, not the fallback.
- **Fallback.** If `fable` is unavailable in the environment (model enum, subscription, or headless run), run every row on `opus` and note the downgrade **once** in the response. Never block a task on model availability.
