# Unlazy Evaluation: Right Layer, Fails on Merit

**Date:** 2026-08-24
**Status:** Approved (no adoption; one first-party follow-up ships separately)
**Applies to:** v1.14.1

## Problem

The user found [unlazy](https://github.com/Leonxlnx/unlazy) (`Leonxlnx/unlazy`, MIT) and asked whether maestro can leverage or integrate it. It is a completion-discipline skill: the agent writes an acceptance ledger (`GATES.md`) before implementing, each gate carries a `CHECK:` shell command and an `EXPECT:` match, a zero-dependency Node script (`gate-check.mjs`) executes approved checks and writes evidence back, and an optional Claude Code Stop hook blocks the session from ending while gates are unmet.

The DeepSeek Harness record (2026-08-18) rejected on layering: DSH sits above Claude Code and consumes maestro, so it could never be a pack. That precedent does not transfer. Unlazy ships Anthropic's own skill format, installs cleanly at user scope, and sits exactly in the layer maestro consumes. It is a pack-shaped candidate, and it fails on merit, not on category. This record exists so the distinction is written down once.

## What it actually is

Verified against the GitHub API and a source-level audit on 2026-08-24, at HEAD `754d9a6` (the single commit reachable in a shallow clone, dated 2026-08-23):

| Field | Value |
|---|---|
| Created | 2026-08-09 (15 days old at evaluation) |
| Last push | 2026-08-23 |
| Stars / forks | 1,692 / 103 |
| Commits on main | 31 |
| Maintainer | One (thin contributor tail; bus factor 1) |
| Licence | MIT, clean, no bundled third-party code |
| Runtime | Node >= 16, zero dependencies, ~1,570 lines of executable script |
| Version | 2.1.0 in `package.json`; no Git tag, no GitHub Release |
| Install path | `npx skills add Leonxlnx/unlazy` (resolves default-branch HEAD, unpinned) |

## Audit depth

Deeper than the DSH record, deliberately. DSH got a documentation-level audit because a do-not-adopt verdict on layering needs no more. Unlazy is in the consumable layer, so the verdict needed execution evidence: the full test suite was run in a sandboxed scratchpad clone (26 + 19 + 10 + 9 passing on Node 24), the Stop hook was driven with synthetic payloads, `gate-check.mjs` was exercised through status, approve, reverify and failure-demotion cycles, and maestro's own Step 8.5 SkillSpector scan was run with Claude adjudication. Nothing was executed against the user's live configuration.

## Engineering quality: genuinely high

Recording this first because the rejection is not a quality complaint. Atomic writes with symlink refusal, ABA-safe file locks, ReDoS bounded in a disposable worker (250 ms), a 1 MiB output cap, pass requiring both exit 0 and an `EXPECT:` match, in-flight oracle staleness detection, CRLF preservation, and approval records that bind command, expectation, resolved working directory, resolved shell, timeout, output limits, platform and the full inherited `PATH`, stored outside the repository. CI is a 3-OS by 3-Node matrix with SHA-pinned actions. `SECURITY.md` is candid that the safety boundary is review and approval, not sandboxing. No network calls, no telemetry, no obfuscation, no lifecycle scripts.

SkillSpector's raw static verdict was CRITICAL (risk score 99, `DO_NOT_INSTALL`). Adjudication per maestro's own Step 8.5 rule dismissed 11 of 13 findings as false positives (test-harness spawn options, the tool deleting its own state key, a directory-layout code fence, MIT boilerplate). Two survive and neither is malicious: the documented install path is unpinned, and the hook installer genuinely mutates Claude settings files. The raw score is exactly the over-flagging Step 8.5 warns about.

## Why it fails anyway

1. **The success state is reachable with zero gates met.** Reproduced live on HEAD: one agent-written `ABANDON:` line flips a ledger from `UNMET`, exit 1 and a Stop-hook block to `ALL MET`, exit 0 and a silent allow, and the parent integration template then grants branch completion credit for the abandoned child. The skill itself instructs the agent to write that line; the only guard is prose. Filed upstream as [issue 21](https://github.com/Leonxlnx/unlazy/issues/21) (UL001) by a third party on 2026-08-24, open and unanswered at evaluation time, alongside [issue 22](https://github.com/Leonxlnx/unlazy/issues/22) (UL002: approvals and evidence stay current after the checked script or its inputs change) and [issue 23](https://github.com/Leonxlnx/unlazy/issues/23) (UL003: nothing binds the gate population to the requested contract, so a plan can omit a deliverable while every declared gate passes honestly). Together these are the three ways a verification harness can report success without verifying. A green `ALL MET` that can be manufactured is worse than no gate, because maestro Step 8.0 would consume it as evidence.
2. **The Stop hook ignores `stop_hook_active` and its release guard does not bound anything.** Measured: 12 consecutive blocks against a documented maximum of 6, because the release counter resets on any ledger byte change and the checker itself rewrites `EVIDENCE:` lines on every run. Worse, Claude Code sets `stop_hook_active` session-wide once any Stop hook blocks, and the user's existing `evidence-gate.js` and security-guidance Stop hooks honour that flag and self-suppress. Installing this one verification hook therefore switches off two existing ones. Net enforcement coverage goes down.
3. **The consent boundary dissolves in autonomous use.** `--approve` is a CLI flag, not a person. In a maestro run the agent authors the `CHECK:` line and the agent passes the flag; reviewer and reviewed are the same process, and approved checks inherit the full environment, credentials included.
4. **Conductor semantics.** Unlazy wants to own planning (its own `PLAN.md` format, leaf and branch vocabulary, rolling dispatch, lease claims) where maestro Step 4 already owns planning through superpowers, and its four-pass polish loop ("repeat until a full improvement pass finds nothing") contradicts the Step 7 YAGNI decision ladder, which deliberately sanctions named, intentional ceilings. Maestro's precedence rule is that packs are voices, never conductors; unlazy is written as a conductor. Its frontmatter also triggers on ordinary words ("gates", "audit", "do not stop until it is done"), so it would self-activate alongside the HARD-GATE rather than when asked.

## Interop angles, priced separately

- **A. Install as a peer skill (ecosystem row).** Rejected. Implicit activation on common phrasing, conductor semantics against maestro's flow, and the three open soundness issues. An ecosystem row is a recommendation; this is not currently recommendable.
- **B. Pinned install through the v1.14.0 mechanism.** Rejected for now, not permanently. The pin (an `UNLAZY_SHA` constant through `verify_pinned_sha`) would block silent upstream mutation, but it cannot assert the thing that matters here: the runtime surface is arbitrary shell written into ledgers at run time, so no static grep of the pinned tree proves anything about execution. HEAD is itself a hook bug fix dated the day before evaluation, so a pin today freezes mid-stabilisation, and the repo's own re-review-per-bump rule would make a fast-moving pin a standing tax.
- **C. Vendor `gate-check.mjs` as a first-party script.** Rejected. The narrow slice worth vendoring is precisely the component carrying UL001, UL002 and UL003, and adopting it means adopting a Node runtime dependency, a Windows shell surface, an approval store and a threat model maestro does not currently carry.
- **D. Adopt the format, not the code.** Accepted, shipped separately as `references/evidence-ledger.md` plus Step 4 and Step 8.0 wiring. The two properties unlazy genuinely has that maestro's prose gates lack are pre-commitment (the oracle is fixed before implementation, not chosen afterwards to fit the result) and a durable unmet state that survives compaction. Both are format properties, not script properties. A maestro-owned ledger captures them with no third-party code, no Stop hook, no approval store, and with the ABANDON discipline mapped onto maestro's existing UNVERIFIED wording. Attribution to unlazy's ledger format is carried in the reference file, as MIT asks.
- **E. Adopt nothing and write nothing.** Rejected. A 1,700-star repository in exactly this problem space will be asked about again, and this analysis took real reproduction work to establish. Writing it down once is cheaper than re-deriving it.

## Revisit triggers

Re-evaluate option B only when all of: issues 21, 22 and 23 close with regression coverage in the shipped suite; the Stop hook honours `stop_hook_active`; a tagged release exists. Treat this document's specifics as evidence of what was true on 2026-08-24, not as a current description of the repository; at 15 days old, the project can invert any of these findings quickly.

## Trade-offs

- A user who wants unlazy gets no install path from maestro. Deliberate: the analysis above is the reason.
- The empirical findings decay fastest of any record in this tree; the metadata table is dated for that reason.
- The evidence-ledger follow-up (option D) borrows the idea while the upstream issues stand, so if upstream fixes land, the two artefacts will overlap and the reference file should then say which wins.

## Evidence

| Claim | Source |
|---|---|
| Repo metadata, star and commit counts | GitHub API, 2026-08-24 |
| Test suite passes | `npm test` in the scratchpad clone, Node v24.3.0, exit 0 |
| ABANDON flips UNMET to ALL MET silently | Live reproduction in a throwaway repo at HEAD `754d9a6`; upstream issue 21 |
| 12 consecutive Stop-hook blocks | Synthetic-payload probe with a churning ledger |
| `stop_hook_active` absent from the tree | `grep -r stop_hook_active` across the clone, zero hits |
| Hook suppression of existing gates | `evidence-gate.js` line 23 and security-guidance `security_reminder_hook.py` line 1850, both exiting on the flag |
| SkillSpector verdict and adjudication | `scan_skill` static pass, 13 findings, 11 dismissed on `file:line` reads |
| No unlazy code executed against live config | All probes ran in the session scratchpad |

## Files changed

| File | Change |
|---|---|
| `docs/2026-08-24-unlazy-evaluation.md` | This record |
| `README.md` | One docs-tree line |

Deliberately not changed: `skills/maestro/SKILL.md`, `references/ecosystem.md`, `install.sh`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.github/workflows/track-upstream.yml`. No version ships with this record. The evidence-ledger follow-up and the repository fixes shipping in the same session land as their own PRs with their own version bumps.
