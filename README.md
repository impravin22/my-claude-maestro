# Maestro — Master Orchestrator for Claude Code

A Claude Code plugin that orchestrates your entire development workflow. Maestro activates at the start of every task to classify work, fetch live library documentation, enforce engineering standards, and guide you through a disciplined build-verify-ship cycle.

## What It Does

1. **Classifies** your task (feature, bug fix, refactor, config, UI-only) and routes it — to the right **domain pack** and the right **model tier**
2. **Fetches live docs** via [Context7](https://github.com/upstash/context7) for every library involved — no stale training data
3. **Orchestrates superpowers skills** in the correct order (brainstorm → plan → TDD → implement → verify → PR)
4. **Enforces UI/UX design system** — WCAG 2.1 AA accessibility, Tailwind token usage, shadcn/ui patterns, responsive design, loading/error/empty states. Step 5 runs an **anti-template design-mockup gate** that produces an approved visual artefact (HTML prototype, sketch, or Storybook story) **before** any production frontend code is written. The gate enforces an explicit anti-template ban (no centred max-w-md card with icon→headline→CTA, no "clean minimal", no unmodified Tailwind defaults), requires the design to demonstrate at least four of ten quality markers (hierarchy, rhythm, depth, typography, semantic colour, drawn states, grid-breaking, atmosphere, motion, dataviz), and self-audits before the user is asked to approve — eliminating both the post-implementation rework loop and the template-by-default failure mode
5. **Enforces layered security** — OWASP checklists at planning time + real-time pre-edit scanning via [Security Guidance](https://github.com/anthropics/claude-code) + [SkillSpector](https://github.com/NVIDIA/SkillSpector) supply-chain vetting of skill/plugin/MCP artefacts before PR (Step 8.5)
6. **Visual verification** — [Playwright MCP](https://github.com/microsoft/playwright-mcp) verifies frontend changes render correctly, pass accessibility checks, and behave across breakpoints
7. **Deep PR review** — [PR Review Toolkit](https://github.com/anthropics/claude-code) dispatches specialist agents (code review, silent failure detection, test coverage, type design, code simplification, comment accuracy) before the polling loop
8. **Cross-session memory** — [claude-mem](https://github.com/thedotmack/claude-mem) surfaces prior observations (decisions, rejected approaches, failed experiments) during CLASSIFY, BRAINSTORM, and PLAN via the `search`, `timeline`, and `get_observations` MCP tools — no more re-deriving context that already exists
9. **Composes with an extended plugin ecosystem** — [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for design styles + palettes, [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) for 400+ n8n integrations, [VoiceMode MCP](https://github.com/mbailey/voicemode) for voice conversations, [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) for 150+ skills across 12 language ecosystems, and [LightRAG](https://github.com/HKUDS/LightRAG) as an optional graph+vector RAG supplement
10. **Routes to domain skill packs** — maestro is not only a coding orchestrator. CLASSIFY names a domain and routes to its pack: engineering (superpowers), documents and brand ([example-skills](https://github.com/anthropics/skills)), [marketing](https://github.com/coreyhaines31/marketingskills) (47 skills), [social media](https://github.com/charlie947/social-media-skills) (17), and Anthropic's first-party [finance](https://github.com/anthropics/knowledge-work-plugins) (8), [small-business](https://github.com/anthropics/knowledge-work-plugins) (31) and [legal](https://github.com/anthropics/knowledge-work-plugins) (9). Design is **not** a routing destination — [frontend-design](https://github.com/anthropics/skills), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Taste](https://github.com/Leonxlnx/taste-skill) and [Transitions](https://github.com/Jakubantalik/transitions.dev) are voices consumed inside Step 5, not domains CLASSIFY can name. Non-code deliverables run a shortened **Deliverable flow** with domain-specific gates (publish approval, voice profile, figures-trace-to-source, drafts-not-advice)
11. **Routes to the right model** — **Fable** for judgement (architecture, planning, root-cause analysis, security adjudication, review arbitration), **Opus** for execution (implementation, tests, PR fixes, content drafting). N generators on Opus, the single adjudicator on Fable; escalate to Fable only after two failed attempts. Both are **tier aliases** that resolve to whatever generation is current in each family at dispatch time — the documented tier values (`sonnet`, `opus`, `haiku`, `fable`) pin no version, so the routing table never names one and never goes stale on release day
12. **Enforces quality gates** — tests mandatory, lint clean, format clean, TypeScript clean, solution justification, British English
13. **Reports through a Progress Protocol** — inside a multi-step flow, every response opens with its position ("Step 5 (UI/UX gate) — blocked on your mockup approval"), leaves at most one open ask, puts fresh command output above the justification prose, and quotes no wall-clock estimates. Adapted from cognitive-accessibility formatting practice; it governs reporting order and ask count only, and never truncates a checklist, drops a justification, or suppresses a gate's question
14. **Tracks upstream dependencies** — daily GitHub Actions workflow detects changes in all 19 tracked upstream repos, files issues, and auto-creates PRs for review

### Token discipline

`SKILL.md` loads on **every** task, so it carries only the router: which domain and model a task maps to, in one line each. Every detail — install commands, per-pack caveats, domain gates, degradation rules, the full model table — lives in `references/` and is read **only when that path actually fires**. Adding eight domain packs (145 skills: 12 + 8 + 31 + 9 + 47 + 17 + 13 + 7 + 1) and model routing in v1.9.0 made `SKILL.md` *smaller* — 5,959 → 5,534 words. v1.10.0 spends ~190 of that saving deliberately: the YAGNI decision ladder is an every-task implementation rule, so it lives on the hot path by design (5,723 words). v1.11.0 spends a further ~260 on the Progress Protocol for the same reason — it governs every response inside a flow, so a `references/` file it never reads would be worthless. That puts `SKILL.md` at 5,982 words, ~20 past the 5,959 pre-registry baseline: the first hot-path overspend since the registry landed, and a deliberate one. Rare-path detail still never goes in `SKILL.md`.

## Prerequisites

| Dependency | Required | Install |
|-----------|----------|---------|
| [superpowers plugin](https://github.com/obra/superpowers) | Yes | Comes with Claude Code |
| [Context7 MCP](https://github.com/upstash/context7) | Yes | `npx ctx7 setup --claude` |
| [Vercel plugin](https://github.com/vercel-labs/agent-skills) | Recommended | Provides shadcn + react-best-practices skills |
| [Security Guidance](https://github.com/anthropics/claude-code) | Recommended | `claude plugin install security-guidance@claude-plugins-official` — real-time pre-edit security scanning |
| [PR Review Toolkit](https://github.com/anthropics/claude-code) | Recommended | Ships with Claude Code — 6 specialist review agents |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Recommended | `npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright` |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Recommended | `npx claude-mem install` — persistent memory across sessions via 5 lifecycle hooks + 3 MCP tools (`search`, `timeline`, `get_observations`) |
| [`frontend-design` skill](https://github.com/anthropics/skills) | Recommended | `claude plugin install frontend-design@claude-plugins-official` — **or** get it bundled inside the `example-skills` row below; either source works, no need for both. Used by Step 5a/5b to generate the design direction and mockup artefact **before** any production frontend code is written |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Recommended | `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill && claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill` — 84 styles, 192 colour palettes, 74 font pairings, 98 UX guidelines (auto-activates on UI/UX prompts; Step 5e checklist remains canonical). **The `uipro-cli` npm package was renamed `ui-ux-pro-max-cli`** — the old name still installs a stale version, so prefer the plugin route |
| [Anthropic example-skills](https://github.com/anthropics/skills) | Recommended | `claude plugin marketplace add anthropics/skills && claude plugin install example-skills@anthropic-agent-skills` — one plugin covering `skill-creator`, `mcp-builder`, `webapp-testing`, `brand-guidelines`, `web-artifacts-builder`, `frontend-design`, `canvas-design`, `theme-factory` and more. The sibling `document-skills` plugin (docx/pdf/pptx/xlsx) is **source-available, not open source** — install separately only if needed |
| [finance / small-business / legal](https://github.com/anthropics/knowledge-work-plugins) | Recommended | `claude plugin marketplace add anthropics/knowledge-work-plugins` then `claude plugin install <name>@knowledge-work-plugins` — Anthropic first-party domain packs (8 / 31 / 9 skills, Apache-2.0). These live in `knowledge-work-plugins`, **not** `claude-plugins-official`. Each ships a `.mcp.json` pre-wiring hosted connectors (Snowflake, QuickBooks, DocuSign, Slack…) — dormant until OAuth-approved, but review before org rollout |
| [marketing-skills](https://github.com/coreyhaines31/marketingskills) | Recommended | `claude plugin marketplace add coreyhaines31/marketingskills && claude plugin install marketing-skills@marketingskills` — 47 MIT skills (copywriting, seo-audit, lead-magnets, launch, pricing, cro, ads…). Install only from the canonical `coreyhaines31` slug — copycat forks circulate |
| [social-media-skills](https://github.com/charlie947/social-media-skills) | Recommended | `claude plugin marketplace add charlie947/social-media-skills && claude plugin install social-media-skills@social-media-skills` — 17 MIT skills (voice-builder, post-writer, hook-generator, reels-scripting, youtube-thumbnail…). **Run `voice-builder` first** or output carries the author's branding; `reels-scripting` and `post-scorer` call paid third-party APIs |
| [Taste](https://github.com/Leonxlnx/taste-skill) | Recommended | `claude plugin marketplace add Leonxlnx/taste-skill && claude plugin install taste-skill@taste-skill` — 13 MIT design-taste skills feeding Step 5a as additive direction candidates (still subject to the anti-template ban and the 5c gate) |
| [Transitions](https://github.com/Jakubantalik/transitions.dev) | Recommended | `git clone https://github.com/Jakubantalik/transitions.dev && cp -r transitions.dev/skills/transitions-dev ~/.claude/skills/` — 27 production transition recipes with `prefers-reduced-motion` guards. **No licence file on the canonical repo** (all-rights-reserved by default): fine for personal use, do not vendor its content |
| [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) | Heavy / manual | `claude mcp add n8n-mcp -e MCP_MODE=stdio -e LOG_LEVEL=error -e DISABLE_CONSOLE_OUTPUT=true -- npx -y n8n-mcp` — 400+ n8n workflow integrations |
| [VoiceMode MCP](https://github.com/mbailey/voicemode) | Heavy / manual | `claude mcp add --scope user voicemode -- uvx --refresh voice-mode` — local Whisper + Kokoro voice conversations (requires mic/speakers) |
| [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) | Recommended | `git clone https://github.com/affaan-m/everything-claude-code.git && cd everything-claude-code && ./install.sh --target claude --profile full` — 150+ skills, 47 agents, 79 commands, 16 rules across 12 language ecosystems |
| [LightRAG](https://github.com/HKUDS/LightRAG) | Heavy / manual | `uv tool install "lightrag-hku[api]"` — graph+vector RAG Python library; optional supplement to Context7 for large codebases (external service; custom MCP bridge required to surface inside Claude Code) |
| [Andrej Karpathy Skills](https://github.com/forrestchang/andrej-karpathy-skills) | Recommended | `claude plugin marketplace add forrestchang/andrej-karpathy-skills && claude plugin install andrej-karpathy-skills@karpathy-skills` — Karpathy's 4 LLM-coding principles (think before coding, simplicity first, surgical changes, goal-driven execution) as an enforced voice that composes with maestro's own engineering-mindset discipline |
| [Caveman](https://github.com/JuliusBrussee/caveman) | Recommended | `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman` — ultra-compressed communication mode that cuts ~75% token usage while preserving full technical accuracy |
| [SkillSpector](https://github.com/NVIDIA/SkillSpector) | Recommended | `uv tool install 'skillspector[mcp] @ git+https://github.com/NVIDIA/skillspector.git' && claude mcp add skillspector -- skillspector mcp` (git-only — not on PyPI; the `[mcp]` extra is required to run `skillspector mcp`) — NVIDIA static security scanner for AI agent skills (Apache-2.0); Step 8.5 vets any skill/plugin/MCP artefact in a diff before PR. Keyless: static pass flags candidates, Claude adjudicates (its own LLM pass needs a provider key, not required) |

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

The installer handles: superpowers, Context7 MCP, Vercel plugin, Security Guidance, PR Review Toolkit, Playwright MCP, claude-mem, UI UX Pro Max, Andrej Karpathy Skills, Caveman, SkillSpector, Everything Claude Code, and the domain packs — Anthropic example-skills, finance, small-business, legal, marketing-skills, social-media-skills, Taste, and Transitions.

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
 1. CLASSIFY     → Task type, scope, domain pack, model tier
 2. CONTEXT7     → Detect libraries → fetch current docs
 3. BRAINSTORM   → superpowers:brainstorming (or systematic-debugging for bugs)
 4. PLAN         → superpowers:writing-plans
 5. UI/UX GATE   → Generate approved design mockup → full design system checklist (frontend only)
 6. SECURITY     → OWASP + LLM security checklist + real-time edit scanning
 7. IMPLEMENT    → superpowers:test-driven-development
 8. VERIFY       → superpowers:verification + quality gates + Playwright visual checks
8.5 LOCAL REVIEW → code-reviewer on the local diff (+ SkillSpector for skill artefacts)
 9. FINISH       → superpowers:finishing-a-development-branch → PR
10. REVIEW       → PR Review Toolkit specialist agents → polling loop
```

### Skip Logic

| Condition | Steps Skipped |
|-----------|---------------|
| Trivial config/docs change | 3–6 and 8.5 — but a `SKILL.md`, plugin-manifest or MCP-config edit is never trivial, and always runs 8.5 |
| No frontend touched | 5, visual verification in 8 |
| Component-level frontend tweak (className, copy edit, prop rename) | 5a–5c (mockup) and 5d — 5e checklist still runs |
| Bug fix | 3 → systematic-debugging |
| No libraries detected | 2 |
| No dev server running | Visual verification in 8 |
| Independent subtasks identified | Nothing skipped — 7 may use `dispatching-parallel-agents` |
| No new types introduced | `type-design-analyzer` in 10 |
| No comments added/modified | `comment-analyzer` in 10 |
| Non-code deliverable (marketing, social, finance, legal…) | 5, 7, 8.5, 9, 10 → runs the shortened **Deliverable flow** instead. 6 runs only if credentials, customer data, or PII are handled |

## Checklists

Reference files are read **on demand**, never on every task — that is what keeps `SKILL.md` cheap:

- **[UI/UX Design System](skills/maestro/references/uiux-checklist.md)** — visual design, accessibility, component patterns, performance, user workflow
- **[Security (OWASP)](skills/maestro/references/security-checklist.md)** — injection, auth, access control, input/output protection, LLM security, dependencies
- **[Quality Gates](skills/maestro/references/quality-gates.md)** — testing, linting, code quality, visual verification (Playwright), PR specialist review, solution justification, style, git workflow
- **[Frontend Design Trigger](skills/maestro/references/frontend-design-trigger.md)** — the decision matrix for when Step 5 needs a mockup
- **[Skill Pack Registry](skills/maestro/references/skill-pack-registry.md)** — the Deliverable flow, each domain pack's skills, gates, and caveats. Read only when routing to a non-engineering domain
- **[Model Routing](skills/maestro/references/model-routing.md)** — the full Fable/Opus table, dispatch mechanisms, escalation rules, cost discipline
- **[Ecosystem](skills/maestro/references/ecosystem.md)** — install commands, per-pack caveats, and the full degradation table. Read only when a pack is missing

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
│       └── references/          # read on demand, not every task
│           ├── uiux-checklist.md
│           ├── security-checklist.md
│           ├── quality-gates.md
│           ├── frontend-design-trigger.md
│           ├── skill-pack-registry.md
│           ├── model-routing.md
│           └── ecosystem.md
├── hooks/
│   ├── hooks.json
│   └── check-update.sh
├── tests/
│   └── install-smoke.sh        # bash tests/install-smoke.sh — runs in CI
├── docs/
│   ├── 2026-04-03-maestro-design.md
│   ├── 2026-04-07-plugin-integration-design.md
│   ├── 2026-04-13-claude-mem-integration-design.md
│   ├── 2026-04-13-multi-plugin-integration-design.md
│   └── 2026-07-22-ponytail-integration-design.md
├── install.sh          # companion ecosystem installer
├── README.md
└── LICENSE
```

## Licence

MIT
