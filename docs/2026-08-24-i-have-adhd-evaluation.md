# i-have-adhd Evaluation: Peer Output-Mode, Nothing to Adopt

**Date:** 2026-08-24
**Status:** Approved (no maestro integration; user installed it separately for personal use)
**Applies to:** v1.16.0

## Problem

The user found [i-have-adhd](https://github.com/ayghri/i-have-adhd) (`ayghri/i-have-adhd`, MIT) and asked whether it fits into maestro, then asked to install it in their own Claude Code regardless. It is an output-shaping skill: ten rules that make a response act-on-able for a reader with ADHD (lead with the next action, number multi-step work, restate state every turn, suppress tangents, give specific time estimates, cap lists at five, drop preamble and closers). It is invoked with `/i-have-adhd` and can be made always-on behind an opt-in flag file.

Two questions, kept separate:

1. **Should maestro wire it into its flow or ecosystem?** No. This record explains why.
2. **May the user install it for personal use?** Yes. It is clean and opt-in; the user installed it this session. That choice is independent of the maestro decision and does not change it.

## What it actually is

Verified against the GitHub API and a source-level audit on 2026-08-24, at HEAD `b42a45a` (single reachable commit in a shallow clone, dated 2026-08-21):

| Field | Value |
|---|---|
| Created / last push | active; HEAD 2026-08-21 |
| Stars / forks | ~23,500 / ~1,500 |
| Maintainer | One (Ayoub Ghriss) |
| Licence | MIT, clean, no bundled third-party code |
| Version | 0.2.0 (pre-1.0), no Git tag, no GitHub Release |
| Ships | `skills/i-have-adhd/SKILL.md` (140 lines), an opt-in SessionStart hook in three implementations (`.mjs`/`.sh`/`.ps1`), eval and check scripts, multi-harness manifests (Claude, Codex, Cursor, Gemini, Kimi, Qwen, OpenCode) |
| Install | `claude plugin marketplace add ayghri/i-have-adhd` then `claude plugin install i-have-adhd@i-have-adhd` (tracks default-branch HEAD, unpinned) |

## Audit depth and safety

Source-level, because the verdict touches the user's live environment. SkillSpector static scan: `risk_score 0, severity LOW, recommendation SAFE, 0 findings` (the cleanest of the four ecosystem evaluations in this tree). A parallel security read of every executable artefact confirmed it: the always-on hook is opt-in (silent unless `~/.claude/.i-have-adhd-always` exists, asserted by the shipped tests), fails open (every error path exits 0, so it never blocks session start), and all three implementations agree byte-for-byte. It derives `SKILL.md` from its own script location, not a hostile env var. `package.json` has zero dependencies and no lifecycle scripts; no network calls, telemetry, or obfuscation anywhere; the eval scripts are budget-capped, sandbox-locked, and strip `*_API_KEY` from child environments. The skill sets `disable-model-invocation: true` so it never auto-activates, and its own rule-break 6 subordinates it to the host system prompt. Nothing here is a safety concern.

## Why maestro does not integrate it

It fails on merit and layering, not craft. The skill is genuinely well made; it simply has almost nothing maestro does not already have, and its one novel rule is the exact thing maestro forbids.

**It is the union of two things the user already runs.** Mapping its ten rules against caveman (an always-on output compressor the user runs) and maestro's Progress Protocol:

- **5 redundant:** number steps (Step 4 plans + TodoWrite), restate state every turn (Progress Protocol rule 1, near-verbatim, same stated rationale), make wins visible (the Step 8.0 Evidence Gate does this at proof level, stronger), matter-of-fact error tone (caveman), no preamble/recap/closer (caveman, which goes further).
- **3 partial-overlap, already covered:** lead with the next action, end with one next action, suppress tangents (all sit inside Progress Protocol rule 2 plus caveman's direct-fire register).
- **1 conflicting:** rule 6 mandates specific wall-clock time estimates; Progress Protocol rule 4 bans them outright ("a duration is a guess dressed as a figure, and nothing here can check it"). An autonomous agent is the executor with no clock to observe, so a self-directed estimate has no addressee and no checker. The skill's own override 6 already yields to the harness, so maestro wins by the skill's own terms; the intent (concreteness over vagueness) survives via maestro's substitute unit, steps and gates remaining.
- **1 genuinely additive:** rule 9, cap lists at about five and rank must vs nice-to-have. Neither tool imposes a numeric list cap. It is a generic reporting-hygiene heuristic, not workflow-critical, and it partly fights maestro's own "never truncate a checklist" guarantee, so even this one is not cleanly adoptable inline. Two smaller slivers in the Pre-send check (substitute idioms for the literal action; a first-line/last-line skim test) are mildly additive and equally optional.

So narrow "adopt the good rule inline" (the ponytail move) collapses to essentially zero adopted rules: the one novel rule is banned, the next-most-novel one fights an existing guarantee.

**Full integration is worse.** It would stack a third output-shaper on one channel already contested by a compressor (caveman) and a flow-reporter (Progress Protocol), with no precedence defined among three co-equal plugin-scope shapers, so which wins is non-deterministic; and it pulls toward the wall-clock estimates and full-sentence expansion that caveman exists to avoid. It would add an Nth SessionStart hook (matcher `startup|resume|clear|compact`, firing on compact too) injecting about 1,100 words of ruleset every session when enabled. And it would introduce an unpinned, tag-less, pre-1.0, single-maintainer dependency whose hook injects upstream `SKILL.md` verbatim, a silent prompt-injection surface that maestro's one-time Step 8.5 scan and no-review-bot posture would not re-catch on an upstream bump.

**Category mismatch.** maestro is a workflow conductor (classify, route, tier, gate, verify, review). i-have-adhd is a personal-preference output mode, the exact category `references/ecosystem.md` already assigns to caveman ("Output compression (orthogonal)"). It routes to nothing in the domain table.

## Interop angles, priced separately

- **A. Required/Recommended ecosystem row, or an upstream-tracker entry.** Rejected. It is not a pack maestro consumes at a step; the ponytail artefact-placement rule says no installer/tracker entry exists for a thing that is not an installed maestro dependency. Adding a 25th tracked repo for an orthogonal output mode misleads.
- **B. Wire into a flow step.** Rejected. It shapes output; it does not classify, plan, implement, verify, or review. There is no step it belongs in.
- **C. Cherry-pick the additive rules inline (the ponytail treatment).** Rejected, narrowly. The only candidates are the list-cap (which fights the no-truncate guarantee), the anti-idiom substitution, and the skim test. None is workflow-critical, and the marquee novel rule (time estimates) is banned. Not worth a `SKILL.md` edit and the drift it invites.
- **D. Note it as a peer output-mode alongside caveman.** Accepted as the ceiling. One line: it occupies the same persistent every-response output-shaper slot as caveman, so run one or the other, not both stacked; its rule 6 must yield to Progress Protocol rule 4 the way caveman's Auto-Clarity already yields. That is this document.
- **E. Do nothing and write nothing.** Rejected. A 23,500-star repo in this space will be asked about again; writing the analysis once is cheaper than re-deriving it.

## The user's personal install (separate decision)

The user asked to install it in their own Claude Code, and it was installed this session (`claude plugin install i-have-adhd@i-have-adhd`, user scope), verified enabled with the always-on flag absent, so it is available but dormant. This is a legitimate personal-preference choice and does not constitute maestro adopting it. Guidance given to the user:

- It occupies caveman's slot; run one or the other, not both, or rule 6 (time estimates) will fight the Progress Protocol.
- Leaving it opt-in (no `~/.claude/.i-have-adhd-always` flag) is the safe default; setting always-on injects upstream `SKILL.md` verbatim every session, and the install tracks a moving unpinned HEAD.

## Revisit triggers

Reconsider even the peer note only if it ships a tagged release and rule 6 stops contradicting Progress Protocol, and even then only as a pinned-SHA peer, never as a wired step. Treat this document's specifics as evidence of what was true on 2026-08-24.

## Trade-offs

- A user who wants ADHD-shaped output gets no maestro dependency for it; they run `/i-have-adhd` themselves. Deliberate.
- The empirical findings decay fastest of any record here; the metadata table is dated for that reason.
- The install and the maestro decision are recorded together to avoid the future reader concluding that an installed plugin implies an adopted one.

## Evidence

| Claim | Source |
|---|---|
| Repo metadata, stars, provenance | GitHub API and the shallow clone, 2026-08-24 |
| SkillSpector SAFE, 0 findings | `scan_skill` static pass on `skills/i-have-adhd` |
| Opt-in, fail-open, three-impl parity | Source read of `hooks/always-on.{mjs,sh,ps1}` and `tests/test_always_on_hooks.py` |
| No deps, no lifecycle scripts, no network | `package.json` plus a tree-wide grep for fetch/exec/telemetry |
| Rule 6 vs Progress Protocol rule 4 | `skills/i-have-adhd/SKILL.md` rule 6 against maestro `SKILL.md` Progress Protocol rule 4 |
| Rule-by-rule overlap with caveman + Progress Protocol | Full 10-rule map, this session |

No i-have-adhd code was executed during the evaluation; the plugin the user installed is the standard marketplace install, run by the user's own CLI.

## Files changed

| File | Change |
|---|---|
| `docs/2026-08-24-i-have-adhd-evaluation.md` | This record |
| `README.md` | One docs-tree line |

Deliberately not changed: `skills/maestro/SKILL.md`, `references/ecosystem.md`, `install.sh`, the plugin manifests, `.github/workflows/track-upstream.yml`. No version ships with this record.
