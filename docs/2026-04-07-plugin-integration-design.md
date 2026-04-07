# Plugin Integration Design — Security Guidance, PR Review Toolkit, Playwright MCP

**Date:** 2026-04-07
**Status:** Approved
**Version:** 1.1.0

## Problem

Maestro v1.0.0 orchestrates a solid 10-step workflow but has gaps:

1. **Security is checklist-only** — catches issues at planning time but nothing at edit time
2. **Verification is code-only** — tests, lint, and types pass, but nobody checks if the UI actually renders correctly
3. **PR review is shallow** — polls for generic review comments but doesn't dispatch specialist analysis

## Solution

Integrate three plugins into the existing 10-step workflow. No new steps — each plugin enhances an existing concern.

### 1. Security Guidance (Step 6: SECURITY)

**What:** Pre-edit hook that scans every code change for common vulnerability patterns in real-time.

**Integration:** Documented as a second security layer alongside the existing checklist. The hook runs automatically — maestro doesn't invoke it directly but documents its role and detects when it's missing.

**Defence in depth:**
- **Planning-time** (checklist) — catches architectural security issues before code is written
- **Edit-time** (Security Guidance hook) — catches implementation-level vulnerabilities as code is written

### 2. Playwright MCP (Step 8: VERIFY)

**What:** Browser automation via the accessibility tree — navigates routes, tests interactions, checks responsive behaviour, verifies accessibility.

**Integration:** Added as a conditional verification phase after code quality gates. Only runs when:
- Frontend files are touched
- A dev server is running
- Playwright MCP is available

**Verification scope:**
- Route rendering (no console errors, correct layout)
- Interactive elements (buttons, forms, toggles)
- Responsive behaviour (375px, 768px, 1280px)
- Accessibility tree (labels, focus order, ARIA)
- Screenshots for PR descriptions

### 3. PR Review Toolkit (Step 10: REVIEW)

**What:** Six specialist review agents that analyse PRs from different angles.

**Integration:** Added as Phase 1 of a two-phase review process. Phase 2 remains the existing polling loop.

**Agent dispatch logic:**

| Agent | When | Purpose |
|-------|------|---------|
| `code-reviewer` | Always | Guideline adherence |
| `silent-failure-hunter` | Always | Swallowed errors, empty catches |
| `pr-test-analyzer` | Always | Test coverage gaps |
| `code-simplifier` | Complex PRs | Unnecessary complexity |
| `type-design-analyzer` | New types added | Type encapsulation quality |
| `comment-analyzer` | Comments added/modified | Comment accuracy |

Agents run in parallel. Findings are fixed before entering Phase 2.

## Approach Selection

### Chosen: Deep Integration into Existing Steps

Enhance steps 6, 8, and 10 with the new plugins' capabilities.

### Rejected Alternatives

**A. New workflow steps (6.5, 8.5, 10.5):**
- Inflates the flow from 10 to 13 steps
- These plugins enhance existing concerns, not new ones
- Half-steps look awkward in the flow diagram

**B. Light reference (mention in Prerequisites only):**
- Wastes the potential — users wouldn't know when or how to use them
- No orchestration benefit — maestro's value is in telling you *what to do at each step*

## Trade-offs

1. **Longer SKILL.md** — grows from 253 to ~330 lines. Acceptable for the value added.
2. **More prerequisites** — 3 new "recommended" entries. Mitigated by graceful degradation (each plugin is optional).
3. **Playwright requires a running dev server** — visual verification silently skips without one. Mitigated by clear documentation and a suggestion to start the server.
4. **PR Review Toolkit adds latency** — dispatching 4-6 agents takes time. Mitigated by running agents in parallel and only dispatching relevant ones.

## Files Changed

| File | Change |
|------|--------|
| `skills/maestro/SKILL.md` | Prerequisites, skip logic, steps 6/8/10, fallback section |
| `skills/maestro/references/quality-gates.md` | Visual verification + PR specialist review sections |
| `README.md` | Prerequisites table, flow descriptions, skip logic, checklists |
| `.claude-plugin/plugin.json` | Version 1.1.0, updated description + keywords |
| `.github/upstream-state.json` | Added `playwright-mcp` entry |
| `.github/workflows/track-upstream.yml` | Added `microsoft/playwright-mcp` to tracked repos |
