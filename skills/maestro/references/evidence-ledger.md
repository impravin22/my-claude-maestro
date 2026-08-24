# Evidence Ledger: Durable Per-Task Gate State

Read this when CLASSIFY marks a task non-trivial, or when updating a ledger at any later step. `SKILL.md` carries only the three wiring lines; the format and rules live here.

## Why it exists

Maestro's gates were prose the model had to remember. At least eight decisions were set at one step and consumed steps later purely from model memory: the skip-logic row, the supply-chain flag, the model tier, the 5c approval, the mockup revision count, the two-failure escalation counter, the Step 8.5 findings map, and the flow position itself. A compaction, a long session, or plain drift could lose any of them, and a gate ticked from memory is exactly what Step 8.0 forbids.

The ledger makes that state a file. Two properties matter:

1. **Pre-commitment.** Each gate's command and expected marker are written at PLAN, before implementation, so the oracle cannot be chosen afterwards to fit the result.
2. **Durable unmet state.** `EVIDENCE: pending` on disk survives compaction and cannot be misremembered as done.

Format adapted from the acceptance-ledger design in [unlazy](https://github.com/Leonxlnx/unlazy) (MIT, Leonxlnx). Adopted format-only, deliberately without its checker script or Stop hook; the decision record is `docs/2026-08-24-unlazy-evaluation.md` in the repo.

## Where it lives

`.maestro/evidence-<date>-<task-slug>.md` in the repository being worked on, e.g. `.maestro/evidence-2026-08-24-okr-pagination.md`. The key is chosen at CLASSIFY and never changes: date plus a short lowercase hyphenated task name. It is deliberately not the branch name, because no branch exists at Step 1 (branches are cut at Step 9), branch names contain `/`, and two tasks started from `main` must not collide. Record the branch in the header once it exists. Add `.maestro/` to the project's `.gitignore` unless the team wants committed audit trails; either mode works, pick one per repo and stay with it. The directory is created at CLASSIFY.

## When it is skipped

- The trivial config/docs row of the skip-logic table (a ledger for a one-line change is ceremony).
- The Deliverable flow: nearly every domain-gate outcome there is manual, and a ledger of manual gates degenerates into a checklist with extra steps. The Deliverable flow keeps its own gates as prose.

## Format

```markdown
# Evidence ledger: <date>-<task-slug>

Classification: <one-line CLASSIFY statement>
Skip row: <row name, or "none">
Supply-chain flag: <yes/no>
Model tier: <recommendation>
Branch: pending

## Gates

- [ ] G1: <one observable outcome>
  CHECK: <command>
  EXPECT: <decisive success marker>
  EVIDENCE: pending
- [x] G2: <a met gate is ticked only when its EVIDENCE is filled>
  CHECK: <command>
  EXPECT: <decisive success marker>
  EVIDENCE: exit 0; <the decisive line of fresh output>
- [ ] G3: <outcome with no runnable oracle>
  EVIDENCE: pending

## Log

<append-only, one line per event: 5c approval, mockup revision N, escalation attempt N, 8.5 finding raised or resolved, step transitions>

## Abandoned

ABANDONED: <id> <non-empty reason>
```

- One observable outcome per gate. A gate with a runnable oracle carries `CHECK:` and `EXPECT:`; a manual gate carries neither, and its EVIDENCE line names what was inspected.
- `EXPECT:` is the decisive marker, not the whole output. Prefer a marker that only a genuine pass can print.
- Every gate starts at `EVIDENCE: pending`.

## Rules

1. **Header at CLASSIFY, read back at every consuming step.** Write the classification, skip row, supply-chain flag, and model tier the moment CLASSIFY closes; set `Branch:` when Step 9 cuts the branch. Re-read the header and gates instead of trusting recall at each point that consumes them: the 5c gate, Step 8.5, Step 9, and the first response after any compaction or session resume.
2. **Gates at PLAN.** Each plan task names its verification command and expected marker (Step 4 requires this); copy them in as gates before Step 7 starts. Seed the rest from the applicable rows of `quality-gates.md`.
3. **Evidence at Step 8.0 only.** Tick a box only when its EVIDENCE is filled from output run fresh in the same message, per the Evidence Gate. A ticked box with `EVIDENCE: pending` counts as unmet.
4. **Demotion.** If a re-run shows a previously ticked gate no longer passes, untick it and reset its EVIDENCE to `pending`. A gate that was true an hour ago is not evidence now.
5. **Abandonment is visible.** An impossible or obsolete gate is never deleted. Leave the gate in `## Gates`, unticked, with `EVIDENCE: pending`; add an `ABANDONED: <id> <non-empty reason>` line under `## Abandoned`. The final report surfaces every abandonment.
6. **The report enumerates the negative space.** The task's final message names every gate not met, with its reason, not only the ones that passed. "All met" is a claim about the ledger, so quote the ledger.

## What not to ledger

Commands that already fail loudly earn one line at most: `pytest`, `ruff`, `tsc`, `vitest` exit non-zero on their own, and wrapping them in prose adds nothing. The ledger earns its keep on the rows no command proves: British English verified, solution justification documented, imports checked, regressions re-read, the 5c approval, and every cross-step decision in the header, with the running counters (mockup revisions, escalation attempts, 8.5 findings and their resolutions, flow position) appended to `## Log` as they happen.

## Honest limit

The ledger is memory, not proof. EVIDENCE lines are written by the model, and no script verifies them here; that is deliberate, because a first-party checker would carry a runtime dependency and a threat model maestro does not want (see the decision record). Step 8.0's fresh-run rule is what makes an EVIDENCE line honest. Treat the ledger as the thing that stops forgetting; treat the Evidence Gate as the thing that stops lying.
