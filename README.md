# Maestro — Master Orchestrator for Claude Code

A Claude Code plugin that orchestrates your entire development workflow. Maestro activates at the start of every task to classify work, fetch live library documentation, enforce engineering standards, and guide you through a disciplined build-verify-ship cycle.

## What It Does

1. **Classifies** your task (feature, bug fix, refactor, config, UI-only)
2. **Fetches live docs** via [Context7](https://github.com/upstash/context7) for every library involved — no stale training data
3. **Orchestrates superpowers skills** in the correct order (brainstorm → plan → TDD → implement → verify → PR)
4. **Enforces UI/UX design system** — WCAG 2.1 AA accessibility, Tailwind token usage, shadcn/ui patterns, responsive design, loading/error/empty states
5. **Enforces layered security** — OWASP checklists at planning time + real-time pre-edit scanning via [Security Guidance](https://github.com/anthropics/claude-code)
6. **Visual verification** — [Playwright MCP](https://github.com/microsoft/playwright-mcp) verifies frontend changes render correctly, pass accessibility checks, and behave across breakpoints
7. **Deep PR review** — [PR Review Toolkit](https://github.com/anthropics/claude-code) dispatches specialist agents (code review, silent failure detection, test coverage, type design, code simplification, comment accuracy) before the polling loop
8. **Enforces quality gates** — tests mandatory, lint clean, format clean, TypeScript clean, solution justification, British English

## Prerequisites

| Dependency | Required | Install |
|-----------|----------|---------|
| [superpowers plugin](https://github.com/obra/superpowers) | Yes | Comes with Claude Code |
| [Context7 MCP](https://github.com/upstash/context7) | Yes | `npx ctx7 setup --claude` |
| [Vercel plugin](https://github.com/vercel-labs/agent-skills) | Recommended | Provides shadcn + react-best-practices skills |
| [Security Guidance](https://github.com/anthropics/claude-code) | Recommended | `/plugin install security-guidance@anthropic` — real-time pre-edit security scanning |
| [PR Review Toolkit](https://github.com/anthropics/claude-code) | Recommended | Ships with Claude Code — 6 specialist review agents |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Recommended | `npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright` |

## Installation

### For Individual Use

```bash
/plugin marketplace add impravin22/my-claude-maestro
/plugin install maestro@impravin22
```

Then restart Claude Code.

### For Team-Wide Enforcement

Add to your team's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "impravin22": {
      "source": {
        "source": "github",
        "repo": "impravin22/my-claude-maestro"
      }
    }
  }
}
```

Then each team member runs:

```bash
/plugin install maestro@impravin22
```

## The Unified Flow

Every task follows one flow. Steps are skipped when not applicable:

```
 1. CLASSIFY     → Determine task type and scope
 2. CONTEXT7     → Detect libraries → fetch current docs
 3. BRAINSTORM   → superpowers:brainstorming (or systematic-debugging for bugs)
 4. PLAN         → superpowers:writing-plans
 5. UI/UX GATE   → Full design system checklist (frontend only)
 6. SECURITY     → OWASP + LLM security checklist + real-time edit scanning
 7. IMPLEMENT    → superpowers:test-driven-development
 8. VERIFY       → superpowers:verification + quality gates + Playwright visual checks
 9. FINISH       → superpowers:finishing-a-development-branch → PR
10. REVIEW       → PR Review Toolkit specialist agents → polling loop
```

### Skip Logic

| Condition | Steps Skipped |
|-----------|---------------|
| Trivial config/docs change | 3–6 |
| No frontend touched | 5, visual verification in 8 |
| Bug fix | 3 → systematic-debugging |
| No libraries detected | 2 |
| No dev server running | Visual verification in 8 |
| No new types introduced | `type-design-analyzer` in 10 |
| No comments added/modified | `comment-analyzer` in 10 |

## Checklists

The plugin includes three comprehensive reference checklists:

- **[UI/UX Design System](skills/maestro/references/uiux-checklist.md)** — visual design, accessibility, component patterns, performance, user workflow
- **[Security (OWASP)](skills/maestro/references/security-checklist.md)** — injection, auth, access control, input/output protection, LLM security, dependencies
- **[Quality Gates](skills/maestro/references/quality-gates.md)** — testing, linting, code quality, visual verification (Playwright), PR specialist review, solution justification, style, git workflow

## Customisation

The checklists in `skills/maestro/references/` are plain Markdown. Fork the repo and edit them to match your team's standards:

- Add or remove checklist items
- Change tool-specific commands (e.g., swap Vitest for Jest)
- Adjust accessibility level (WCAG 2.1 AA → AAA)
- Add project-specific security rules

## Plugin Structure

```
my-claude-maestro/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/
│   └── maestro/
│       ├── SKILL.md
│       └── references/
│           ├── uiux-checklist.md
│           ├── security-checklist.md
│           └── quality-gates.md
├── docs/
│   ├── 2026-04-03-maestro-design.md
│   └── 2026-04-07-plugin-integration-design.md
├── README.md
└── LICENSE
```

## Licence

MIT
