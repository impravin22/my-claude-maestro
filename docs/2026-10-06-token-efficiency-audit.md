# Token Efficiency Audit: Lean Hot Path, Role-Based Routing

**Date:** 2026-10-06
**Status:** Approved (adopted in v1.17.0)
**Applies to:** v1.16.0 → v1.17.0

## Problem

The maintainer asked three things: how to get the best out of maestro on fewer tokens, how to switch models by task, and whether token-saving skills from GitHub should join the ecosystem. Each needed measurement rather than opinion, because maestro had grown from 10.7 KB to 42.8 KB in six months and a prior observation already put a single load at about 9,200 cl100k tokens.

## Method

- **Workflow, read-only.** Four auditors (the skill bundle, the always-on session context, the plugin ecosystem, the Claude Code documentation) and a GitHub sweep followed by a source review of five candidates through the GitHub API. Nothing was cloned, installed or executed. Eight of the ten agents ran on Sonnet.
- **Measurements.** Usage fields from six weeks of local Claude Code transcripts; cl100k counts with tiktoken for file sizes; the real-token multiplier taken from API input deltas on first loads (about 1.6 times cl100k for `SKILL.md`, about 2.75 bytes per real token).
- **Cost of the audit itself.** 10 agents, 5.17M tokens, 1,113 tool calls. That is the fan-out cost the audit goes on to measure, and the reason the fan-out rule below exists.

## Findings

| # | Finding | Figure |
|---|---|---|
| 1 | One `SKILL.md` load | 42,844 bytes, 9,712 cl100k, about 15.4k real tokens |
| 2 | Re-invoking the skill with arguments resends the whole body | 69 of 77 such calls, median +15,498 tokens; with identical rendering and no arguments, a median 48 tokens |
| 3 | A per-turn "invoke maestro first" mandate adds a request per turn | 100 of 112 calls were standalone requests, each re-reading a median 577k-token context; maestro was 3.9 to 17.7% of session input across five sessions |
| 4 | After an auto-compaction Claude Code re-attaches only the first 5,000 tokens of each skill (documented) | The old body kept its first third: Steps 5 to 10 dropped out of long sessions |
| 5 | Material needed at only one step or task type | 4,289 of 9,712 cl100k (44%); Step 5 repeated `frontend-design-trigger.md`, 15 lines verbatim |
| 6 | Adjudication still routed to Fable; dispatches with no model inherit the main loop | 65 workflow agents inherited a Fable main loop (195.3M tokens); one 83-agent rating fan-out on Fable cost 435.1M tokens for a median 292 output tokens each |
| 7 | Every subagent starts from the full instruction and listing prefix | Median about 81k tokens on the first request, before any work |
| 8 | Skill listing over its budget | 914 skills in a 30,000-character budget: 891 shown by name only, 866 never invoked. Agent listing: 94 types, 19 ever dispatched |
| 9 | PR polling as model turns | Median 641,615-token context per poll; 47.6M tokens across 81 polls |
| 10 | Cost by role (observational, different tasks) | Verifier agents: `sonnet` median 4.81M tokens over 27 requests, `opus` 10.97M over 52 |

Outside this repository, the same audit found user-level rule files duplicated three ways (flat, namespaced and translated copies, about 60 KB loaded into every session and every subagent) and background reviewers in other plugins running on premium tiers. Those are configuration, not maestro, and are covered by the README guidance below.

## Decisions

Adopted in v1.17.0:

| Change | Why |
|---|---|
| Lean `SKILL.md` with a read-when index; every gate keeps its name and trigger on the hot path | Findings 1, 4, 5: about 4k real tokens per load, and the whole skill survives compaction |
| New `references/review-gates.md` for Steps 8.5 and 10; other detail moved into the existing references | Finding 5 |
| `tests/skill-bundle-lint.py` with a smoke suite: 12,000-byte body budget, 300-character one-line description, duplicate-line guard, read-when index guard, gate-phrase inventory across `SKILL.md` and three references | Stops regrowth; replaces a word ceiling that had 129 words of headroom and measured neither tokens nor duplication |
| Role-based routing with an effort column; every dispatch names its model; `fable` only on request; adjudication as one `opus` call | Findings 6, 10, and the 2026-07-29 head-to-head |
| Fan-out rule: workflows only when asked or for three or more independent parts | Finding 7 |
| Lookup discipline on the hot path (batch reads, search before reading, probe once, wait in the background) | Idea from JetBrains Benjamin-Plus (below), written in maestro's own words |
| Step 10 Phase 2 waits in a background command, not a model turn per poll | Finding 9 |
| Step 2 says loudly when Context7 tools are absent | A required dependency had silently lapsed in the audited setup |
| `install.sh --profile` with `core`, `engineering` or `full`, mirroring Everything Claude Code's own profiles; the default stays `full` for this release | Finding 8 |
| README: load once from `SessionStart` with no arguments; settings that compound the saving | Findings 2, 3, 6 |

## GitHub sweep

Verdict: **nothing joins the installer.** Each added skill grows a listing already 10.5 times over its budget, and the measured levers above (removal, routing, model choice) outweigh every candidate's evidence.

| Candidate | Verdict | Reason |
|---|---|---|
| JetBrains/benjamin-plus-skill | Idea adopted; package not installed | Paired test: median cost −17.9% (p=0.005) on SkillsBench with Sonnet 5 at low effort; a later replication leaned negative on quality. Two of its rules contradict maestro's mandatory gates (no unrequested tests; close in two lines); its install path is a live clone of the default branch |
| ccusage/ccusage | User-only trial | Measurement, not a saving. Pin a version (`ccusage@20.0.26`), never `npx ccusage@latest` |
| nagisanzenin/effortmining | Rejected; idea adopted as the effort column | The mechanism (per-agent effort frontmatter) is native; the headline is a single-author simulation, and its realistic composite test was a pre-registered no-win |
| karanb192/claude-code-hooks | User-only trial (spawn cap, cache-tax) | No quantified saving; spawn-cap defaults collide with subagent-driven development and cannot see workflow agents |
| anthropics/claude-code (native settings) | Use the documented levers | Agent `model` and `effort` frontmatter, `CLAUDE_CODE_SUBAGENT_MODEL`, a user `Explore.md` on `haiku`, per-model effort; nothing to install |
| colbymchenry/codegraph | Not vetted in this pass | Best Claude Code evidence among code indexes (vendor-run: −62% tokens); revisit on independent replication |
| microsoft/playwright-cli | Not vetted in this pass | Possible Step 8 trial: fewer tokens than the MCP, not clearly fewer dollars |
| agent-sh/agnix | Not vetted in this pass | Possible CI linter for skills and memory files |
| rtk-ai/rtk | Rejected | Independent paired test: +7.6% cost at low effort; open reports of silent output loss |
| headroomlabs-ai/headroom | Rejected | Independent whole-task results: +44% to +53% cost |
| mksglu/context-mode | Rejected | Elastic-2.0 (source-available), negative independent results, overlaps claude-mem |
| oraios/serena | Rejected for now | GPL-3.0 application; overlaps the LSP plugins; documented tool-adherence problems |
| musistudio/claude-code-router, zilliztech/claude-context | Rejected | Send prompts or code to third parties |
| alexgreensh/token-optimizer, jgravelle/jcodemunch-mcp | Rejected | Non-commercial licences |
| SuperClaude token-efficiency mode | Rejected | Same mechanism as caveman, already in the ecosystem |

## Review (Step 8.5)

`code-reviewer` and `security-reviewer` ran on `sonnet`, in parallel, against the local diff; SkillSpector ran static-only on the skill bundle.

- **Security, HIGH (fixed).** Step 10's fix-and-push loop acted on any PR comment, so on a public repository anyone could steer it. The loop predates this release, but the rewrite closes it: review text is data, `gh api` is GET-only, only the known review bot and repository members are acted on, findings are fixed only inside files the PR already changes, anything else goes to the user, and a finding that survives three fix cycles stops the loop.
- **MEDIUM (fixed).** "Git operations need no confirmation" was broader than v1.16.0; it now covers committing, pushing the working branch and opening the PR, and force-pushes, history rewrites, merges, branch deletion and setting changes always ask. The supply-chain flag now covers every agent-instruction surface, `references/` included, because the gates moved there. SkillSpector adjudication treats the artefact as untrusted text, and a third-party CRITICAL or HIGH is cleared only with the user. The wait loop takes the last-seen snapshot, reports `error:` and `timeout` distinctly, and is preceded by a read of anything already outstanding. Effort is stated per role everywhere. The gate-phrase inventory now uses phrases unique to each gate and covers three references; the description check rejects block scalars; the index guard requires a table row. The installer smoke suite asserts every skipped pack and every rejection message.
- **LOW (fixed).** The two rules the first cut dropped (prefer a specialised domain skill inside the skeleton; the Progress Protocol never shortens a checklist or a justification) are back. The installer rejects a repeated `--profile` and a flag-shaped value, and its ECC helper fails on an unmapped profile instead of installing `full`. The hook-path regex is linear and refuses paths that leave the plugin root. The lint smoke suite refuses symlinks and now proves the hook and repository checks.
- **Step 10 Phase 1 (fixed).** `pr-test-analyzer` found two HIGH test gaps by mutation: the profile tests checked skips in one direction only (a `core` that also dropped `superpowers` passed), and the gate-phrase inventory missed the Step 6, Step 8 and Step 9 gates. The installer suite now asserts each profile's exact skip set, the required components, and that `--profile=full` matches the default; the inventory covers those gates and four review-gate trust rules, and every phrase must occur exactly once. `silent-failure-hunter` and the guideline reviewer found no CRITICAL or HIGH; their fixes: CI green means at least one check and none pending, the wait script validates its arguments and fails fast, hook paths are read quoted or not, a lint crash exits 2 instead of passing as a finding, and the installer says when a profile leaves earlier installs enabled.
- **SkillSpector.** Score 26 (MEDIUM, `CAUTION`, safe to install). Its one HIGH (agent-config access, confidence 0.27) is the Memory checklist line that asks whether an edit to `~/.claude/settings.json` broke the lifecycle hooks: a verification step that reads nothing, so a false positive. Its excessive-agency MEDIUM was the git wording above, now fixed. Its eight rug-pull MEDIUMs are unpinned `npx` and `uvx` lines: two are project-local tool runs in `quality-gates.md` (false positives); the install commands in `ecosystem.md` predate this release and are left for a follow-up that pins them.

## Trade-offs

- The lean hot path relies on the model reading a reference when its trigger fires. Gate names and blocking conditions stay on the hot path, and the lint fails a deleted gate phrase.
- Reviewers move to `sonnet` with no quality measurement; the escalation rule and the single `opus` adjudication are the safety valves.
- Adjudication leaves `fable` without a measurement either way. The premium was never shown to buy anything; its cost now is measured.
- Profiles default to `full` for one release so existing installs do not change silently.
- The background wait needs a background-task facility and a timeout, so a stuck check cannot hang unnoticed.
- The savings come from five heavy sessions and overlap with each other; lighter sessions save less, and the figures are not additive.

## Revisit triggers

- Claude Code changes the compaction re-attach budget or the skill re-invocation semantics.
- The planned before-and-after comparison (seven days either side) shows no saving.
- An independent replication appears for codegraph or Benjamin-Plus.
- A Sonnet reviewer misses something an Opus reviewer would have caught: measure checker quality before re-tiering.

## Evidence

- Claude Code documentation read on 2026-10-06: sub-agents, skills, model configuration, settings reference, context window, prompt caching, workflows, environment variables.
- Candidate commits reviewed: benjamin-plus-skill `0f7b2df`, ccusage `a7dd0f2` (release v20.0.26 at `d982108`), effortmining `09090cf`, claude-code-hooks `3c9c90a`, anthropics/claude-code `e8ae451`.
- Transcript measurements stay with the maintainer: they are built from personal session logs and contain nothing from this repository.

## Files changed

- `skills/maestro/SKILL.md` — lean hot path, read-when index, role-based routing summary, fan-out and lookup rules
- `skills/maestro/references/review-gates.md` — new: Steps 8.5 and 10
- `skills/maestro/references/model-routing.md` — role-based table with effort, mechanisms, rules
- `skills/maestro/references/frontend-design-trigger.md`, `quality-gates.md`, `security-checklist.md`, `ecosystem.md`, `skill-pack-registry.md` — detail moved from `SKILL.md`; install profiles; per-project packs
- `tests/skill-bundle-lint.py`, `tests/skill-bundle-lint-smoke.sh` — new
- `tests/install-smoke.sh`, `install.sh` — `--profile`
- `.github/workflows/test.yml` — lint and lint smoke in CI
- `README.md`, `CONTRIBUTING.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — guidance and v1.17.0
