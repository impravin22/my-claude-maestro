# Maestro Plugin — Design Spec

**Date:** 2026-04-03
**Author:** Praveen Kumar Chittem
**Status:** Approved

## Purpose

Maestro is a master orchestrator plugin for Claude Code that activates at the start of every task. It classifies the work, proactively fetches up-to-date library documentation via Context7, enforces engineering standards (OWASP, testing, British English, solution justification), applies a comprehensive UI/UX design system checklist, and orchestrates existing superpowers skills in the correct order.

## Design Decisions

| Decision | Choice | Alternatives Rejected |
|----------|--------|-----------------------|
| Activation | Every task (master orchestrator) | Feature-only, on-demand |
| Context7 | Proactive — auto-fetch docs for detected libraries | On-demand only, hybrid |
| UI/UX | Full design system enforcer (WCAG 2.1 AA, Tailwind tokens, shadcn, component patterns) | Lightweight rules only, comprehensive without design system |
| Superpowers relationship | Wrapper — orchestrates existing skills, adds custom rules on top | Replacement (absorbs logic), hybrid |
| Workflow | One unified flow, skip steps that don't apply | Task-type routing with distinct paths |
| Distribution | Publishable Claude Code plugin via GitHub | Local-only `.claude/` skill |
| Architecture | Single SKILL.md + supporting reference files | Multiple skills, monolithic single file |

## Unified Flow

Every task follows one flow. Steps are skipped when not applicable:

```
1. CLASSIFY    → What type of task? (feature, bug, refactor, config, UI, docs)
2. CONTEXT7    → Detect libraries → fetch current docs via Context7 MCP
3. BRAINSTORM  → Invoke superpowers:brainstorming (skip for trivial tasks)
4. PLAN        → Invoke superpowers:writing-plans
5. UI/UX GATE  → If frontend: run full design system checklist (references/uiux-checklist.md)
6. SECURITY    → Run OWASP + LLM Top 10 checklist (references/security-checklist.md)
7. IMPLEMENT   → Invoke superpowers:test-driven-development → write code
8. VERIFY      → Invoke superpowers:verification-before-completion + quality gates
9. FINISH      → Invoke superpowers:finishing-a-development-branch → create PR
10. REVIEW     → PR review loop: poll every 4 min until clean approval
```

### Skip Logic

| Condition | Steps Skipped |
|-----------|---------------|
| Trivial config/docs change | 3–6 (straight to implement) |
| No frontend touched | 5 |
| Bug fix | 3 becomes superpowers:systematic-debugging |
| Independent subtasks | 7 uses superpowers:dispatching-parallel-agents |
| No libraries detected | 2 (no Context7 calls) |

## Context7 Integration

At step 2, the skill will:

1. Analyse the task description and current codebase to detect which libraries/frameworks are involved
2. Call Context7's `resolve-library-id` for each detected library
3. Call `query-docs` with a query relevant to the current task
4. Inject fetched docs into context before brainstorming/planning begins

**Prerequisite:** Context7 MCP must be configured (`npx ctx7 setup --claude`).

## UI/UX Design System Checklist

Full enforcement for every frontend change. Categories:

- **Visual Design** — Tailwind tokens, spacing scale (4px grid), typography scale, colour palette from tokens, dark mode
- **Accessibility (WCAG 2.1 AA)** — keyboard nav, focus indicators, contrast ratios, ARIA, semantic HTML, motion preferences, touch targets
- **Component Patterns** — shadcn/ui usage, composition over props drilling, loading/error/empty states, responsive breakpoints
- **Performance** — CLS prevention, image optimisation, client component boundaries, bundle impact

See `references/uiux-checklist.md` for the full runnable checklist.

## Security Checklist

OWASP Top 10 + LLM Application Top 10, structured as a runnable checklist:

- Input sanitisation, output scanning, auth on every endpoint, ownership validation
- Zod schemas at frontend boundaries, rehype-sanitize on Markdown, authFetch for authenticated calls
- No PII logging, parameterised queries, no hardcoded credentials

See `references/security-checklist.md` for the full runnable checklist.

## Quality Gates

Enforced at verification step:

- Tests written and passing (pytest / Vitest)
- Lint clean (ruff / ESLint)
- Formatting clean (ruff format --check / Prettier)
- TypeScript clean (tsc --noEmit)
- Solution justification documented
- British English in all prose
- Imports verified, signatures match

See `references/quality-gates.md` for the full runnable checklist.

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
│   └── 2026-04-03-maestro-design.md
├── README.md
└── LICENSE
```

## Distribution

- GitHub repo: `impravin22/my-claude-maestro`
- Teammates install: `/plugin marketplace add impravin22/my-claude-maestro` → `/plugin install maestro@impravin22`
- Team-wide: add to `.claude/settings.json` under `extraKnownMarketplaces`

## Dependencies

- **superpowers plugin** must be installed (provides brainstorming, writing-plans, TDD, debugging, verification, finishing-a-development-branch)
- **Context7 MCP** must be configured for live doc fetching
- **Vercel plugin** recommended for shadcn and react-best-practices skills

## Trade-offs

1. **Opinionated** — teammates must buy into the full workflow or it feels heavy
2. **Context7 latency** — network calls at the start of every task add time
3. **Dependency on superpowers** — not standalone; if superpowers updates and breaks an interface, maestro needs updating
