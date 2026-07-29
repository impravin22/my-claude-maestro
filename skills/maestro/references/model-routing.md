# Model Routing — Fable ↔ Opus

Read this when a dispatch decision is non-obvious, when an agent has failed twice, or when the user asks why a tier was chosen. The summary in `SKILL.md` covers the common case; this file is the detail.

`fable` and `opus` are **tier aliases**, not pinned versions — each resolves to the newest model in its family at dispatch time. Writing tiers rather than model IDs is the only option available, not merely the tidy one: the Agent tool, workflow `agent()`, and agent frontmatter all accept `sonnet | opus | haiku | fable` and expose no version-pinned selector. A dispatch on `opus` therefore lands on the current Opus generation automatically, with no edit here. Never name a specific version number in this file — it goes stale every release, and the alias already tracks forward.

**On the Fable/Opus gap.** The tiering below was set when Fable led Opus by a wide margin. Both families have since shipped new generations, and this file carries no benchmark for the current gap. Treat the `fable` rows as a standing default, not a measured result: if a head-to-head shows the current Opus matching Fable on a given row, demote that row. Keep the premium tier on final review arbitration and security adjudication regardless — those are single calls whose verdict compounds across everything downstream, so the cost of buying judgement there is trivial against the cost of getting it wrong.

## The table

| Work | Model | Why |
| --- | --- | --- |
| Architecture and system design | `fable` | Widest option space; wrong calls here are the most expensive to unwind |
| BRAINSTORM synthesis (Step 3) and PLAN authoring (Step 4) for multi-file or ambiguous work | `fable` | The plan carries the judgement for every downstream step |
| Root-cause analysis in `systematic-debugging`; post-mortems | `fable` | Hypothesis quality dominates; execution is cheap once the cause is known |
| Security adjudication — security-reviewer triage, SkillSpector verdict adjudication (Step 8.5), threat modelling | `fable` | False negatives ship vulnerabilities; false positives burn trust |
| Final review arbitration when specialist reviewers conflict (Step 10) | `fable` | Judgement between competing expert opinions |
| High-stakes domain judgement — legal risk assessment, financial variance interpretation, pricing strategy | `fable` | Subtle errors carry real-world consequences |
| Implementation (Step 7 TDD loop), refactors, test authoring, mechanical multi-file edits | `opus` | Strong coding execution at lower cost; the plan already carries the judgement |
| PR-fix cycles, lint/type fixes, docs updates | `opus` | Bounded, well-specified changes |
| Volume content drafts (marketing / social) from an approved plan | `opus` | Throughput matters; the plan and domain gates carry quality |
| BRAINSTORM/PLAN on a small, well-understood change | `opus` | Judgement load is low; don't pay premium for a two-file plan |
| Trivial config/docs one-liners | `opus` | Rote edits |
| Bulk mechanical fan-out inside a workflow | `opus`, or `haiku` when purely mechanical | Volume work with no judgement content |

## Mechanisms

How the switch actually happens — the tier is chosen per **dispatch**, not globally:

1. **Main conversation model** — user-selected. A skill cannot silently change it, and must not try. At CLASSIFY, emit a one-line tier recommendation; if the current model mismatches the task class, say so and suggest `/model` (or the app's model picker). Then **proceed regardless** — never block a task on this.
2. **Subagents (Agent tool)** — pass `model: "fable"` or `model: "opus"` per dispatch.
3. **Workflows** — pass `{model: 'opus'}` / `{model: 'fable'}` per `agent()` stage. Generators on `opus`, adjudicators on `fable`.
4. **Custom agent definitions** — set `model:` frontmatter in `.claude/agents/*.md` for standing assignments (e.g. a `security-reviewer` that should always run on `fable`).

## Rules

- **Generator / judge asymmetry.** N parallel generators or reviewers on `opus`; the single final adjudicator on `fable`. This is the highest-leverage pattern in the table — it buys judgement quality at the one point it compounds, without paying premium N times.
- **Escalation.** An `opus` agent that fails the same task twice, or returns evidence that contradicts itself, is re-dispatched **once** to `fable` with a summary of the failed attempts. Do not escalate on the first failure — a bad prompt is more common than a model ceiling.
- **De-escalation.** `fable` writes the plan; `opus` executes it. Once judgement is committed to a written plan, execution does not need the premium tier.
- **Cost discipline.** Fable is the premium tier. Never spend it on formatting, mechanical edits, or bulk content expansion. When in doubt, `opus`.
- **Fallback.** If `fable` is unavailable in the environment (model enum, subscription, or headless run), run every row on `opus` and note the downgrade **once** in the response. Never block a task on model availability.
