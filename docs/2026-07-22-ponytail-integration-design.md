# Ponytail Evaluation — Ladder Adopted Inline, Plugin Rejected (v1.10.0)

**Date:** 2026-07-22
**Status:** Approved
**Version:** 1.10.0

## Problem

The user found [Ponytail](https://github.com/DietrichGebert/ponytail) (`DietrichGebert/ponytail`, MIT) and asked whether it fits into maestro. Ponytail is a "lazy senior dev" ruleset: before writing code, stop at the first rung that holds — does this need to exist (YAGNI) → already in this codebase → stdlib → native platform feature → installed dependency → one line → only then the minimum that works. Validation, error handling, security, and accessibility stay non-negotiable throughout.

This went through two passes.

**First pass** treated it like any other ecosystem addition (Karpathy Skills, Caveman): install as a Recommended prerequisite, wire it into Step 7, add a precedence rule so it never overrides the mandatory test suite. That version shipped 9 file edits before a follow-up question ("you sure this is 100% the best plugin?") forced a harder look.

**Second pass** surfaced three things the first pass missed:

1. **It's not obscure** — 85k+ GitHub stars, 4.7k forks, 14 releases, trended #2 on GitHub, covered by Chinese tech press and debated on Hacker News and Reddit. Worth knowing either way, but it means the plugin itself is legitimate, not a red flag.
2. **A credible, substantive critique exists.** [Colin Eberhardt (ScottLogic)](https://blog.scottlogic.com/2026/06/16/ponytail-yagni-and-the-problem-with-prompt-benchmarks.html) showed the original single-shot benchmark's headline claim — 80–94% less code — came from an unfair baseline (the no-skill comparison was allowed to emit multiple options and prose; Ponytail's was not), used trivial tasks (~10s of lines), and one test failed for reasons unrelated to the skill (assumed a DOM that wasn't there). He reproduced comparable results with a seven-word instruction — "Follow YAGNI principles, and one-liner solutions" — and no plugin, no hook, no dependency. (The upstream author acknowledged the flaw in issue #126 and re-ran with a corrected agentic benchmark; the corrected figures — 54% fewer lines, 22% fewer tokens, 20% lower cost, 27% faster — are materially smaller than the original claim and stand on the fixed methodology. Eberhardt's point isn't that Ponytail lies, it's that the *packaging* adds little over the *instruction*.)
3. **The hooks are actually fine** — read both `ponytail-activate.js` (`SessionStart`) and `ponytail-mode-tracker.js` (`UserPromptSubmit`) directly. No network calls, no destructive writes, just a local flag file (`~/.claude/.ponytail-active`) and a settings.json read to nudge a statusline setup. This was a real gap in the first pass: maestro's own Step 8.5 exists specifically to vet skill/plugin/MCP artefacts before they land, and the first pass never actually read the hook source before recommending installation. (Audited 2026-07-22 at the then-current upstream head, unpinned — this conclusion expires if upstream edits those hooks; re-audit before any future install decision.)

Applying Ponytail's own decision ladder to itself settles it: does installing a whole third-party plugin, with a marketplace dependency and two hooks running on every session start and every prompt, need to exist here — or does "already in this codebase" (maestro's own `SKILL.md`, which every task loads anyway) cover it? For a ruleset this size, it does.

## Solution

Fold the decision ladder directly into `skills/maestro/SKILL.md` Step 7 as maestro's own text. No plugin, no marketplace dependency, no new hook execution surface, no 20th repo added to the daily upstream tracker. The `ponytail:` shortcut-comment convention becomes `yagni:` instead, since there's no installed tool named Ponytail to reference.

The one rule preserved unchanged from the first pass: the ladder governs *how much implementation code gets written*, not whether the mandatory pytest/Vitest suite, type annotations, or docstrings exist. That precedence mattered before Ponytail was a plugin and matters exactly as much as inline text.

## Approach Selection

### Chosen: Inline instruction in SKILL.md, no plugin dependency

One ~150-word Step 7 bullet plus one Code Quality gate bullet. Matches Eberhardt's own reproduction and costs nothing ongoing beyond its hot-path word count, which is accounted for in the README's token-discipline section.

### Rejected Alternatives

**A. Install Ponytail as a Recommended plugin dependency (the first-pass decision).** Rejected on reflection. The plugin's popularity and hook safety are both fine, that was never the problem. The problem is marginal value: a verified-benign hook running on every `SessionStart` and every `UserPromptSubmit`, forever, plus a marketplace dependency and a 20th upstream repo to track, for content that fits in the text file every task already loads. The one thing the plugin has that inline text doesn't, runtime mode-switching via `/ponytail lite|full|ultra|off`, wasn't valuable enough on its own to justify the rest.

**B. Keep Ponytail installed but document the free alternative as a footnote.** Considered as a middle ground. Rejected as the worse version of both options: still carries the hook/dependency overhead of A, still doesn't get the mode-switching UX enough credit to matter, and leaves two descriptions of the same ladder (plugin instructions plus a footnote) to drift out of sync.

**C. Replace Karpathy Skills with the new inline text.** Rejected — though not for lack of overlap: two of Karpathy's four principles (simplicity first, surgical changes) land on Step 7 with the same intent as this ladder. Kept because the other two (think before coding, goal-driven execution) reach brainstorming and planning, which the ladder doesn't touch, and removing an installed pack is orthogonal churn. Where the two overlap at Step 7, maestro's inline ladder is canonical; Karpathy remains an additive voice.

**D. Do nothing, treat the original critique as reason to drop the idea entirely.** Rejected — Eberhardt's critique targets the packaging, not the underlying discipline. YAGNI-first, stdlib-first, minimum-viable-code is worth having in Step 7 regardless of who wrote the seven words.

## Trade-offs

1. **Loses runtime mode-switching.** No `/ponytail ultra` for a deliberately aggressive pass, or `/ponytail off` to disable for one task. If that's ever wanted, it's a cheap follow-up (a maestro-native `/maestro-yagni [level]` convention), not a reason to carry the dependency today.
2. **No upstream tracking for this specific ruleset.** Fine, because there's nothing upstream to drift, it's maestro's own text now, changed only when maestro's own docs change.
3. **Loses the "if the community independently improves the ruleset, you get it for free" benefit** a tracked dependency would carry. Accepted given the ruleset is small and stable enough that this isn't a realistic ongoing cost.
4. **The instruction is generic YAGNI, not Ponytail-branded** — some searchability/discoverability value from the popular name is lost. Kept the `yagni` and `minimal-code` keywords in `plugin.json` since those describe the actual capability accurately either way.

## Evidence

A small A/B check was run before finalising (two tasks, each generated twice by isolated agents with identical rules except the ladder paragraph):

- **Task 1 (filter valid emails):** without the ladder, ~2.3× the code — an unrequested public `is_valid_email` helper plus `TypeError` guards for input shapes the task never specified, and 9 tests to cover that self-inflicted surface. With the ladder: one function, natural `KeyError` propagation, 3 tests.
- **Task 2 (async fetch with retry):** without the ladder, ~1.5× the code — an unrequested module-level logger and backoff-constant ceremony. Smaller effect than task 1.
- **Both variants in both tasks kept full type hints, docstrings, and happy/error/boundary tests** — the precedence rule (ladder never relaxes the test/type/docstring gates) held in generation, not just on paper.

This is n=2, single-shot, not a benchmark — the same class of small-sample caveat Eberhardt levelled at Ponytail's original numbers applies here. It demonstrates the paragraph is *active and directionally correct* on current models; it does not establish effect size. Generation transcripts were not retained, so the figures above are unreproducible from this repo — treat them as anecdote, not artefact.

## Files Changed

| File | Change |
|------|--------|
| `.claude-plugin/plugin.json` | Version 1.9.0 → 1.10.0; +2 keywords (`yagni`, `minimal-code`); description gains the YAGNI clause |
| `.claude-plugin/marketplace.json` | Version 1.9.0 → 1.10.0; description gains the YAGNI clause |
| `skills/maestro/SKILL.md` | Step 7 IMPLEMENT gains the decision-ladder bullet, first in the additions list (unconditional, no "if installed" framing), with an all-gates precedence carve-out (design, security, tests, types) and a surface-don't-drop rule for user-approved plan items |
| `skills/maestro/references/quality-gates.md` | New bullet under Code Quality (not Extended Plugin Ecosystem, since this is now core, not optional): every `yagni:` comment names its ceiling and upgrade path |
| `README.md` | Docs tree gains this file; token-discipline section restates the hot-path cost honestly (v1.10.0 spends ~190 words on the ladder by design) |
| `docs/2026-07-22-ponytail-integration-design.md` | This design doc, rewritten to carry both passes and why the recommendation reversed |

Not changed (first-pass edits reverted before ever reaching git): the `README.md` Prerequisites table, `skills/maestro/references/ecosystem.md`, `install.sh`, `.github/workflows/track-upstream.yml`. No Prerequisites row, ecosystem entry, installer step, or upstream-tracker entry exists for something that isn't an installed dependency.
