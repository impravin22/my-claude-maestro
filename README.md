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
8. **Cross-session memory** — [claude-mem](https://github.com/thedotmack/claude-mem) surfaces prior observations (decisions, rejected approaches, failed experiments) during CLASSIFY, BRAINSTORM, and PLAN via the `search`, `timeline`, and `get_observations` MCP tools — no more re-deriving context that already exists
9. **Composes with an extended plugin ecosystem** — [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for design styles + palettes, [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) for 400+ n8n integrations, [VoiceMode MCP](https://github.com/mbailey/voicemode) for voice conversations, [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) for 150+ skills across 12 language ecosystems, and [LightRAG](https://github.com/HKUDS/LightRAG) as an optional graph+vector RAG supplement
10. **Enforces quality gates** — tests mandatory, lint clean, format clean, TypeScript clean, solution justification, British English

## Prerequisites

| Dependency | Required | Install |
|-----------|----------|---------|
| [superpowers plugin](https://github.com/obra/superpowers) | Yes | Comes with Claude Code |
| [Context7 MCP](https://github.com/upstash/context7) | Yes | `npx ctx7 setup --claude` |
| [Vercel plugin](https://github.com/vercel-labs/agent-skills) | Recommended | Provides shadcn + react-best-practices skills |
| [Security Guidance](https://github.com/anthropics/claude-code) | Recommended | `/plugin install security-guidance@anthropic` — real-time pre-edit security scanning |
| [PR Review Toolkit](https://github.com/anthropics/claude-code) | Recommended | Ships with Claude Code — 6 specialist review agents |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Recommended | `npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright` |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Recommended | `npx claude-mem install` — persistent memory across sessions via 5 lifecycle hooks + 3 MCP tools (`search`, `timeline`, `get_observations`) |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Recommended | `npm i -g uipro-cli && uipro init --ai claude` — 50+ styles, 161 colour palettes, 99 UX guidelines (auto-activates on UI/UX prompts; Step 5 checklist remains canonical) |
| [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) | Recommended | `claude mcp add n8n-mcp -e MCP_MODE=stdio -e LOG_LEVEL=error -e DISABLE_CONSOLE_OUTPUT=true -- npx -y n8n-mcp` — 400+ n8n workflow integrations |
| [VoiceMode MCP](https://github.com/mbailey/voicemode) | Recommended | `claude mcp add --scope user voicemode -- uvx --refresh voice-mode` — local Whisper + Kokoro voice conversations (requires mic/speakers) |
| [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) | Recommended | `git clone https://github.com/affaan-m/everything-claude-code.git && cd everything-claude-code && ./install.sh --target claude --profile full` — 150+ skills, 47 agents, 79 commands, 16 rules across 12 language ecosystems |
| [LightRAG](https://github.com/HKUDS/LightRAG) | Recommended | `uv tool install "lightrag-hku[api]"` — graph+vector RAG Python library; optional supplement to Context7 for large codebases (external service; custom MCP bridge required to surface inside Claude Code) |
| [Andrej Karpathy Skills](https://github.com/forrestchang/andrej-karpathy-skills) | Recommended | `claude plugin marketplace add forrestchang/andrej-karpathy-skills && claude plugin install andrej-karpathy-skills@karpathy-skills` — Karpathy's 4 LLM-coding principles (think before coding, simplicity first, surgical changes, goal-driven execution) as an enforced voice that composes with maestro's own engineering-mindset discipline |

## Installation

### For Individual Use

**1. Install Maestro itself:**

```bash
/plugin marketplace add impravin22/my-claude-maestro
/plugin install maestro@impravin22
```

**2. Install the companion ecosystem (recommended):**

```bash
# Clone the repo for the bundled installer
git clone https://github.com/impravin22/my-claude-maestro.git
cd my-claude-maestro
./install.sh
```

The installer handles: superpowers, Context7 MCP, Vercel plugin, Security Guidance, Playwright MCP, claude-mem, UI UX Pro Max, Andrej Karpathy Skills, and Everything Claude Code.

Heavy/specialised dependencies (VoiceMode, n8n-MCP, LightRAG) are **excluded by default** — install manually from the Prerequisites table below if you need them.

**Installer flags:**

```bash
./install.sh --minimal          # required components only (superpowers + Context7)
./install.sh --dry-run          # preview commands without executing
./install.sh --skip-vercel      # opt out of individual components
./install.sh --help
```

Restart Claude Code after installation.

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

## External Resources

Curated references — not integrations, but useful while working with Claude Code. Link-only due to licence restrictions (cannot be vendored into an MIT-licensed repo):

- **[Awesome Claude Code](https://github.com/hesreallyhim/awesome-claude-code)** — community bible of skills, hooks, slash commands, orchestrators (CC BY-NC-ND 4.0)
- **[Claude Code Ultimate Guide](https://github.com/FlorianBruniaux/claude-code-ultimate-guide)** — 24K+ lines of docs, 228 templates, 271-question quiz (CC BY-SA 4.0)
- **[Claude Agent Blueprints](https://github.com/danielrosehill/Claude-Code-Projects-Index)** — index of 75+ agent workspace templates (no licence — link-only)
- **[Awesome Claude Plugins](https://github.com/ComposioHQ/awesome-claude-plugins)** — curated plugin index across categories (no licence — link-only)

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
├── hooks/
│   ├── hooks.json
│   └── check-update.sh
├── docs/
│   ├── 2026-04-03-maestro-design.md
│   ├── 2026-04-07-plugin-integration-design.md
│   ├── 2026-04-13-claude-mem-integration-design.md
│   └── 2026-04-13-multi-plugin-integration-design.md
├── install.sh          # companion ecosystem installer
├── README.md
└── LICENSE
```

## Licence

MIT
