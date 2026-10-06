# Maestro — Master Orchestrator for Claude Code

[![tests](https://github.com/impravin22/my-claude-maestro/actions/workflows/test.yml/badge.svg)](https://github.com/impravin22/my-claude-maestro/actions/workflows/test.yml)
[![release](https://github.com/impravin22/my-claude-maestro/actions/workflows/release.yml/badge.svg)](https://github.com/impravin22/my-claude-maestro/actions/workflows/release.yml)

A Claude Code plugin that orchestrates your entire development workflow. Maestro activates at the start of every task to classify work, fetch live library documentation, enforce engineering standards, and guide you through a disciplined build-verify-ship cycle.

## What It Does

1. **Classifies** your task (feature, bug fix, refactor, config, UI-only) and routes it — to the right **domain pack** and the right **model tier**
2. **Fetches live docs** via [Context7](https://github.com/upstash/context7) for every library involved — no stale training data
3. **Orchestrates superpowers skills** in the correct order (brainstorm → plan → TDD → implement → verify → PR)
4. **Enforces UI/UX design system** — WCAG 2.1 AA accessibility, Tailwind token usage, shadcn/ui patterns, responsive design, loading/error/empty states. Step 5 runs an **anti-template design-mockup gate** that produces an approved visual artefact (HTML prototype, sketch, or Storybook story) **before** any production frontend code is written. The gate enforces an explicit anti-template ban (no centred max-w-md card with icon→headline→CTA, no "clean minimal", no unmodified Tailwind defaults), requires the design to demonstrate at least four of ten quality markers (hierarchy, rhythm, depth, typography, semantic colour, drawn states, grid-breaking, atmosphere, motion, dataviz), and self-audits before the user is asked to approve — eliminating both the post-implementation rework loop and the template-by-default failure mode
5. **Enforces layered security** — OWASP checklists at planning time + post-edit scanning via [Security Guidance](https://github.com/anthropics/claude-code) + [SkillSpector](https://github.com/NVIDIA/SkillSpector) supply-chain vetting of skill/plugin/MCP artefacts before PR (Step 8.5)
6. **Visual verification** — [Playwright MCP](https://github.com/microsoft/playwright-mcp) verifies frontend changes render correctly, pass accessibility checks, and behave across breakpoints
7. **Deep PR review** — [PR Review Toolkit](https://github.com/anthropics/claude-code) dispatches specialist agents (code review, silent failure detection, test coverage, type design, code simplification, comment accuracy) before the external review, which is awaited by a background command rather than a model turn per poll
8. **Cross-session memory** — [claude-mem](https://github.com/thedotmack/claude-mem) surfaces prior observations (decisions, rejected approaches, failed experiments) during CLASSIFY, BRAINSTORM, and PLAN via the `search`, `timeline`, and `get_observations` MCP tools — no more re-deriving context that already exists
9. **Composes with an extended plugin ecosystem** — [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for design styles + palettes, [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) for 400+ n8n integrations, [VoiceMode MCP](https://github.com/mbailey/voicemode) for voice conversations, [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) for 150+ skills across 12 language ecosystems, and [LightRAG](https://github.com/HKUDS/LightRAG) as an optional graph+vector RAG supplement
10. **Routes to domain skill packs** — maestro is not only a coding orchestrator. CLASSIFY names a domain and routes to its pack: engineering (superpowers), documents and brand ([example-skills](https://github.com/anthropics/skills)), [marketing](https://github.com/coreyhaines31/marketingskills) (50 skills), [social media](https://github.com/charlie947/social-media-skills) (17), and Anthropic's first-party [finance](https://github.com/anthropics/knowledge-work-plugins) (8), [small-business](https://github.com/anthropics/knowledge-work-plugins) (31) and [legal](https://github.com/anthropics/knowledge-work-plugins) (9). v1.13.0 adds **leadership** — Jira tickets, status roll-ups, exec impact write-ups, 1:1s and performance reviews, opportunity scans — which routes to your *installed* [atlassian](https://github.com/anthropics/claude-plugins-official) and `pm-*` skills first and only then to [leadership-skills](https://github.com/PierrickMartos/Leadership-Skills) (11 of 13), [pm-product-discovery](https://github.com/phuryn/pm-skills) (13), [c-level-skills](https://github.com/alirezarezvani/claude-skills). v1.14.0 adds a pinned slice of [pm-claude-skills](https://github.com/mohitagw15856/pm-claude-skills) (40 skills) to that same route. Design is **not** a routing destination — [frontend-design](https://github.com/anthropics/skills), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Taste](https://github.com/Leonxlnx/taste-skill) and [Transitions](https://github.com/Jakubantalik/transitions.dev) are voices consumed inside Step 5, not domains CLASSIFY can name. Non-code deliverables run a shortened **Deliverable flow** with domain-specific gates (publish approval, voice profile, figures-trace-to-source, drafts-not-advice, impact-claims-trace-to-artefacts)
11. **Routes to the right model, by role** — authoring and design on Opus; reviewers, checkers and finders on Sonnet; purely mechanical bulk on Haiku; the single adjudication call over conflicting findings on Opus; **Fable only when you name it**. Every dispatch names its model and an effort level by role (`high` for authoring and adjudication, `medium` for review and implementation, `low` for checks; never `max`): a dispatch that names no model inherits the main loop, and the [2026-10-06 token audit](docs/2026-10-06-token-efficiency-audit.md) found 65 workflow agents that had inherited a premium main loop that way. The Fable/Opus [blind head-to-head](docs/2026-07-29-fable-opus-head-to-head.md) still stands: no measurable difference on architecture, planning or root cause. Tiers are aliases (`haiku`, `sonnet`, `opus`, `fable`) that track each family's newest model, so the routing table never names a version
12. **Enforces quality gates** — tests mandatory, lint clean, format clean, TypeScript clean, solution justification, British English; non-trivial engineering tasks carry a per-task **evidence ledger** (`.maestro/evidence-<date>-<task-slug>.md`) whose gates are pre-registered at PLAN and filled only from fresh output at Step 8.0, so cross-step state survives compaction and the final report must name every unmet gate
13. **Reports through a Progress Protocol** — inside a multi-step flow, every response opens with its position ("Step 5 (UI/UX gate) — blocked on your mockup approval"), leaves at most one open ask, puts fresh command output above the justification prose, and quotes no wall-clock estimates. Adapted from cognitive-accessibility formatting practice; it governs reporting order and ask count only, and never truncates a checklist, drops a justification, or suppresses a gate's question
14. **Tracks upstream dependencies** — daily GitHub Actions workflow detects changes across 24 tracked upstream repos (including the pinned pm-claude-skills SHA, whose drift is reported as a re-review trigger), files issues with per-day deltas, and keeps its state on a dedicated `upstream-state` branch so a stalled run can never masquerade as a green one

### Token discipline

`SKILL.md` loads once per session when invoked (the `SessionStart` hook below does it, and fires again after a compaction), so it carries only the router and the gates: which domain and model a task maps to, and each gate's name and when it fires. All gate detail (dispatch tables, checklists, install commands, degradation rules, the model table) lives in `references/` behind a read-when index and loads only when its trigger fires.

v1.17.0 cut `SKILL.md` from 42,844 to about 11,900 bytes (6,371 to 1,794 words) after a [token audit](docs/2026-10-06-token-efficiency-audit.md) of six weeks of local transcripts:

- One load cost about 15.4k tokens in real API usage; the lean body is about 4k.
- After an auto-compaction, Claude Code re-attaches only the first 5,000 tokens of a skill. The old body kept its first third, so Steps 5 to 10 dropped out of long sessions; the lean body survives whole.
- CI replaced the word ceiling with a byte budget on the injected body (12,000), a 300-character cap on the description, a duplicate-line guard against the references, a read-when index guard and a gate-phrase inventory. `tests/skill-bundle-lint-smoke.sh` proves each one fires.

**How to load it.** Invoke the skill once per session with no arguments, from a `SessionStart` hook, which fires again on resume, clear and compact. Do not force an invocation on every turn: re-invoking with arguments resends the whole body, and in the audit a per-turn mandate cost 3.9 to 17.7% of a session's input tokens. A minimal hook for `~/.claude/settings.json`:

```json
{"hooks": {"SessionStart": [{"hooks": [{"type": "command",
  "command": "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"Invoke the maestro:maestro skill once with no arguments, then apply it to every task. Never pass arguments.\"}}'"}]}]}}
```

**Settings that compound the saving.** `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in the settings `env`, so a dispatch that names no model stops inheriting the main loop. Effort per model under `modelSettings` rather than an exported `CLAUDE_CODE_EFFORT_LEVEL`, which overrides every agent's own effort level. `ultracode` off, opting into a workflow per task by typing `ultracode:` in the prompt. And `./install.sh --profile=engineering`, with domain packs enabled only in the projects that use them. The installer only adds, so on an existing install take packs out of the global set with `claude plugin disable <plugin>@<marketplace> --scope user`.

## Prerequisites

| Dependency | Required | Install |
|-----------|----------|---------|
| [superpowers plugin](https://github.com/obra/superpowers) | Yes | `claude plugin install superpowers@claude-plugins-official` |
| [Context7 MCP](https://github.com/upstash/context7) | Yes | `npx ctx7 setup --claude` |
| [Vercel plugin](https://github.com/vercel-labs/agent-skills) | Recommended | Optional platform tooling; ships no maestro-consumed Step 5 skills |
| [Security Guidance](https://github.com/anthropics/claude-code) | Recommended | `claude plugin install security-guidance@claude-plugins-official` — post-edit security scanning |
| [PR Review Toolkit](https://github.com/anthropics/claude-code) | Recommended | `claude plugin install pr-review-toolkit@claude-plugins-official` — 6 specialist review agents |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Recommended | `npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright` |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Recommended | `npx claude-mem install` — persistent memory across sessions via 5 lifecycle hooks + 3 MCP tools (`search`, `timeline`, `get_observations`) |
| [`frontend-design` skill](https://github.com/anthropics/skills) | Recommended | `claude plugin install frontend-design@claude-plugins-official` — **or** get it bundled inside the `example-skills` row below; either source works, no need for both. Used by Step 5a/5b to generate the design direction and mockup artefact **before** any production frontend code is written |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Recommended | `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill && claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill` — 84 styles, 192 colour palettes, 74 font pairings, 98 UX guidelines (auto-activates on UI/UX prompts; Step 5e checklist remains canonical). **The `uipro-cli` npm package was renamed `ui-ux-pro-max-cli`** — the old name still installs a stale version, so prefer the plugin route |
| [Anthropic example-skills](https://github.com/anthropics/skills) | Recommended | `claude plugin marketplace add anthropics/skills && claude plugin install example-skills@anthropic-agent-skills` — one plugin covering `skill-creator`, `mcp-builder`, `webapp-testing`, `brand-guidelines`, `web-artifacts-builder`, `frontend-design`, `canvas-design`, `theme-factory` and more. The sibling `document-skills` plugin (docx/pdf/pptx/xlsx) is **source-available, not open source** — install separately only if needed |
| [finance / small-business / legal](https://github.com/anthropics/knowledge-work-plugins) | Recommended | `claude plugin marketplace add anthropics/knowledge-work-plugins` then `claude plugin install <name>@knowledge-work-plugins` — Anthropic first-party domain packs (8 / 31 / 9 skills, Apache-2.0). These live in `knowledge-work-plugins`, **not** `claude-plugins-official`. Each ships a `.mcp.json` pre-wiring hosted connectors (Snowflake, QuickBooks, DocuSign, Slack…) — dormant until OAuth-approved, but review before org rollout |
| [marketing-skills](https://github.com/coreyhaines31/marketingskills) | Recommended | `claude plugin marketplace add coreyhaines31/marketingskills && claude plugin install marketing-skills@marketingskills` — 50 MIT skills (copywriting, seo-audit, lead-magnets, launch, pricing, cro, ads…). Install only from the canonical `coreyhaines31` slug — copycat forks circulate |
| [leadership-skills](https://github.com/PierrickMartos/Leadership-Skills) | Recommended | `claude plugin marketplace add PierrickMartos/Leadership-Skills` then install `performance-management`, `communication`, `decision-making` — 11 of its 13 MIT skills (write-performance-review, calibrate-talent, difficult-conversations, reframe-for-execs, bluf-communication, decision-memo, adversarial-review). The `hiring` and `learning` plugins are left to taste. Task-and-artefact shaped: each ends in a deliverable with a fixed output contract |
| [pm-product-discovery](https://github.com/phuryn/pm-skills) + [c-level-skills](https://github.com/alirezarezvani/claude-skills) | Recommended | `claude plugin marketplace add phuryn/pm-skills && claude plugin install pm-product-discovery@pm-skills`, then `claude plugin marketplace add alirezarezvani/claude-skills && claude plugin install c-level-skills@claude-code-skills` (that marketplace registers under `claude-code-skills`, not its repo name) — MIT. Opportunity scanning (Torres opportunity-solution-tree) and engineering-org leverage (vpe-advisor, org-health-diagnostic, decision-logger). [pm-claude-skills](https://github.com/mohitagw15856/pm-claude-skills) ships **pinned to a reviewed commit** — `pm-delivery`, `pm-people`, `pm-career`, `pm-comms` (1:1 prep, delegation briefs, SBI feedback, brag-doc). Its README claims an official-directory listing that does not exist and it lands ~12 commits a day, so `install.sh` clones the reviewed commit rather than tracking `main`, and fails closed on a wrong commit, a modified worktree, or a pin directory under a temporary root |
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

The installer handles: superpowers, Context7 MCP, Vercel plugin, Security Guidance, PR Review Toolkit, Playwright MCP, claude-mem, UI UX Pro Max, Andrej Karpathy Skills, Caveman, SkillSpector, Everything Claude Code, and the domain packs — Anthropic example-skills, finance, small-business, legal, marketing-skills, social-media-skills, leadership-skills, pm-product-discovery, c-level-skills (installer component name: `c-level-advisor`), Taste, and Transitions. `pm-claude-skills` is the one pack installed from a **pinned commit** rather than a default branch, cloned to `~/.claude/pinned/pm-claude-skills`; skip it with `--skip-pm-claude-skills`. `--profile=engineering` leaves out finance, small-business, legal, marketing-skills, social-media-skills, the three leadership bundles, pm-product-discovery, c-level-skills, pm-claude-skills and Vercel (add those per project, as `references/ecosystem.md` describes), keeps example-skills (it carries frontend-design, mcp-builder and skill-creator), Taste and Transitions, and installs Everything Claude Code with its own `developer` profile instead of `full`. `--profile=core` also drops PR Review Toolkit, Playwright, SkillSpector, UI UX Pro Max, Karpathy, Taste and Transitions, so Steps 5a/5d, 8, 8.5 and 10 run their manual fallbacks.

Heavy/specialised dependencies (VoiceMode, n8n-MCP, LightRAG) are **excluded by default** — install manually from the [Prerequisites](#prerequisites) table if you need them.

**Installer flags:**

```bash
./install.sh --profile=engineering  # coding packs only; domain packs per project
./install.sh --profile=core         # engineering minus review, visual and scan tooling
./install.sh --minimal              # required components only (superpowers + Context7)
./install.sh --dry-run              # preview commands without executing
./install.sh --skip-vercel          # opt out of individual components
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
 6. SECURITY     → OWASP + LLM security checklist + post-edit scanning
 7. IMPLEMENT    → superpowers:test-driven-development
 8. VERIFY       → superpowers:verification + quality gates + Playwright visual checks
8.5 LOCAL REVIEW → code-reviewer on the local diff (+ SkillSpector for skill artefacts)
 9. FINISH       → superpowers:finishing-a-development-branch → PR
10. REVIEW       → PR Review Toolkit specialist agents → background wait for review
```

### Skip Logic

| Condition | Steps Skipped |
|-----------|---------------|
| Trivial config/docs change | 3–6 and 8.5 — but an edit to agent instructions or agent config (`SKILL.md`, `references/`, agent or command definitions, hooks, a plugin manifest, an MCP-server config, `CLAUDE.md` or rules files, `.claude/settings*.json`) is never trivial, and always runs Step 6 and Step 8.5 |
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
- **[Evidence Ledger](skills/maestro/references/evidence-ledger.md)** — durable per-task gate state: pre-registered oracles at PLAN, fresh evidence at Step 8.0, visible abandonment
- **[Skill Pack Registry](skills/maestro/references/skill-pack-registry.md)** — the Deliverable flow, each domain pack's skills, gates, and caveats. Read only when routing to a non-engineering domain
- **[Model Routing](skills/maestro/references/model-routing.md)** — the role-based table (model and effort per role), dispatch mechanisms, escalation rules, and the evidence behind them
- **[Review Gates](skills/maestro/references/review-gates.md)** — Step 8.5 dispatch, severity and SkillSpector rules; Step 10 specialists and the background wait for the external review
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
├── .github/
│   ├── workflows/               # tests, tag-driven release, upstream tracker
│   ├── ISSUE_TEMPLATE/
│   ├── CODEOWNERS
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── release.yml              # release-notes categories
├── skills/
│   └── maestro/
│       ├── SKILL.md
│       └── references/          # read on demand, not every task
│           ├── uiux-checklist.md
│           ├── security-checklist.md
│           ├── quality-gates.md
│           ├── frontend-design-trigger.md
│           ├── evidence-ledger.md
│           ├── skill-pack-registry.md
│           ├── model-routing.md
│           ├── review-gates.md
│           └── ecosystem.md
├── hooks/
│   ├── hooks.json
│   └── check-update.sh
├── tests/
│   ├── install-smoke.sh            # bash tests/install-smoke.sh — runs in CI
│   ├── hook-smoke.sh               # update-notice hook tests
│   ├── skill-bundle-lint.py        # hot-path budget, references, gate phrases
│   └── skill-bundle-lint-smoke.sh  # proves each lint guard fires
├── docs/
│   ├── 2026-04-03-maestro-design.md
│   ├── 2026-04-07-plugin-integration-design.md
│   ├── 2026-04-13-claude-mem-integration-design.md
│   ├── 2026-04-13-multi-plugin-integration-design.md
│   ├── 2026-07-22-ponytail-integration-design.md
│   ├── 2026-07-29-fable-opus-head-to-head.md   # evidence behind the v1.12.0 re-tier
│   ├── 2026-08-18-deepseek-harness-evaluation.md   # why DSH is a peer harness, not a pack
│   ├── 2026-08-24-unlazy-evaluation.md   # right layer, fails on merit; ledger idea adopted first-party
│   ├── 2026-08-24-i-have-adhd-evaluation.md   # peer output-mode; nothing to adopt, redundant with caveman + Progress Protocol
│   └── 2026-10-06-token-efficiency-audit.md   # evidence behind the v1.17.0 lean skill and role-based routing
├── install.sh          # companion ecosystem installer
├── CONTRIBUTING.md     # dev setup + the rules CI enforces
├── SECURITY.md         # private vulnerability reporting
├── RELEASING.md        # bump → merge → tag, and why that order
├── CODE_OF_CONDUCT.md
├── README.md
└── LICENSE
```

## Contributing

Contributions are welcome — [CONTRIBUTING.md](CONTRIBUTING.md) covers the dev setup and the handful of rules CI enforces (bash 3.2 floor, hermetic smoke suite, the SKILL.md token budget, version-bump parity). Questions and proposals go in [Discussions](https://github.com/impravin22/my-claude-maestro/discussions); vulnerabilities go through [private reporting](SECURITY.md), never public issues. Releases follow [RELEASING.md](RELEASING.md) — versions ship from `main`, tags mark them afterwards.

## Licence

MIT
