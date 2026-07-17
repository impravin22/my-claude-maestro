# Ecosystem — Install Commands & Degradation Rules

Read this **only when** a pack you need is missing, the user asks how to install one, or you need a pack's caveat. Not on every task — `SKILL.md` carries the summary.

## Required

| Pack | Install | Provides |
| --- | --- | --- |
| superpowers | Ships with Claude Code | brainstorming, writing-plans, TDD, systematic-debugging, verification, finishing-a-development-branch |
| Context7 MCP | `npx ctx7 setup --claude` | Live library docs (Step 2) |

## Recommended

| Pack | Install | Consumed at |
| --- | --- | --- |
| Vercel plugin | `claude plugin install vercel@claude-plugins-official` | Step 5 (shadcn, react-best-practices) |
| Security Guidance | `claude plugin install security-guidance@claude-plugins-official` | Step 6 (real-time pre-edit scanning) |
| PR Review Toolkit | Ships with Claude Code | Steps 8.5 + 10 (6 specialist review agents) |
| Playwright MCP | `npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright` | Step 8 (visual verification) |
| claude-mem | `npx claude-mem install` | Steps 1/3/4 (`search`, `timeline`, `get_observations`) |
| frontend-design | `claude plugin install frontend-design@claude-plugins-official` — **or** get it bundled inside `example-skills` (row below); either source works, no need for both | Step 5a/5b (design direction + mockup) |
| Anthropic example-skills | `claude plugin marketplace add anthropics/skills && claude plugin install example-skills@anthropic-agent-skills` | Steps 7/8 + documents/brand domains |
| UI UX Pro Max | `claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill && claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill` | Step 5d |
| Taste | `claude plugin marketplace add Leonxlnx/taste-skill && claude plugin install taste-skill@taste-skill` | Step 5a (direction candidates) |
| Transitions | `git clone https://github.com/Jakubantalik/transitions.dev && cp -r transitions.dev/skills/transitions-dev ~/.claude/skills/` | Step 5a (motion) + Step 7 |
| marketing-skills | `claude plugin marketplace add coreyhaines31/marketingskills && claude plugin install marketing-skills@marketingskills` | Marketing domain |
| social-media-skills | `claude plugin marketplace add charlie947/social-media-skills && claude plugin install social-media-skills@social-media-skills` | Social domain |
| finance / small-business / legal | `claude plugin marketplace add anthropics/knowledge-work-plugins` then `claude plugin install <name>@knowledge-work-plugins` | Those domains |
| SkillSpector | `uv tool install 'skillspector[mcp] @ git+https://github.com/NVIDIA/skillspector.git' && claude mcp add skillspector -- skillspector mcp` | Step 8.5 (supply-chain scan) |
| Andrej Karpathy Skills | `claude plugin marketplace add forrestchang/andrej-karpathy-skills && claude plugin install andrej-karpathy-skills@karpathy-skills` | Step 7 (edit-level discipline) |
| Caveman | `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman` | Output compression (orthogonal) |
| Everything Claude Code | `git clone https://github.com/affaan-m/everything-claude-code.git && cd everything-claude-code && ./install.sh --target claude --profile full` | Step 7 (150+ user-scope skills) |

## Heavy / manual only

| Pack | Install | Note |
| --- | --- | --- |
| n8n-MCP | `claude mcp add n8n-mcp -e MCP_MODE=stdio -e LOG_LEVEL=error -e DISABLE_CONSOLE_OUTPUT=true -- npx -y n8n-mcp` | 400+ n8n integrations; surface only for n8n tasks |
| VoiceMode MCP | `claude mcp add --scope user voicemode -- uvx --refresh voice-mode` | Local Whisper + Kokoro; needs mic/speakers, GBs of models |
| LightRAG | `uv tool install "lightrag-hku[api]"` | Graph+vector RAG; **external service — needs a custom MCP bridge**, not shipped |
| document-skills | `claude plugin marketplace add anthropics/skills && claude plugin install document-skills@anthropic-agent-skills` | docx/pdf/pptx/xlsx; **source-available, not open source** |

## Per-pack caveats

- **example-skills** — the artifacts skill is named **`web-artifacts-builder`**; configs referencing "artifacts-builder" will not match. One plugin covers 12 skills: skill-creator, mcp-builder, webapp-testing, brand-guidelines, web-artifacts-builder, frontend-design, canvas-design, theme-factory, doc-coauthoring, internal-comms, algorithmic-art, slack-gif-creator. It bundles `frontend-design`, so installing both it and `frontend-design@claude-plugins-official` is redundant — either source is fine. Note the repo clone also contains `docx`/`pdf`/`pptx`/`xlsx`/`claude-api`, but those belong to the sibling `document-skills` and `claude-api` plugins and are **not** exposed by installing example-skills.
- **UI UX Pro Max** — the npm package was renamed `uipro-cli` → `ui-ux-pro-max-cli`. **The old name still installs and is 18 releases stale** — use the plugin route above, or `npm i -g ui-ux-pro-max-cli` if you want the CLI. Requires `python3` (local stdlib-only BM25 search; no network).
- **Taste** — only trust `github.com/Leonxlnx/taste-skill`; impersonation crypto tokens circulate around the project name. Directory names differ from skill names (`skills/soft-skill` → `high-end-visual-design`).
- **Transitions** — canonical repo `Jakubantalik/transitions.dev` carries **no licence file** (all-rights-reserved by default). Fine to install for personal use; **do not vendor its content into your own repos**. Avoid the stale `transitions-dev` mirror.
- **marketing-skills** — canonical slug is `coreyhaines31/marketingskills`; copycat forks with identical descriptions exist.
- **social-media-skills** — run `voice-builder` first; `reels-scripting` and `post-scorer` cost money and scrape. See `skill-pack-registry.md`.
- **knowledge-work plugins** — these live in `anthropics/knowledge-work-plugins`, **not** `claude-plugins-official`. Each ships a `.mcp.json` pre-wiring third-party connectors — review before org rollout. See `skill-pack-registry.md`.
- **SkillSpector** — git-only (not on PyPI); the `[mcp]` extra is required for `skillspector mcp`. Keyless by design: the static pass flags candidates, **Claude adjudicates**. It over-flags teaching-skills and defensive code — never accept a raw `DO_NOT_INSTALL` verdict at face value.
- **Everything Claude Code** — user-scope skills, so plugin-scope skills (superpowers, maestro) win on collisions.

## Degradation rules

A missing pack **never blocks a task**. Perform the equivalent manually and note the gap once so the user can install it.

| Missing | Effect |
| --- | --- |
| A superpowers skill | Do the step manually — brainstorming → propose 2–3 approaches and get approval; writing-plans → a numbered plan; TDD → tests first anyway; verification → run the gate commands by hand. **Never skip the step.** |
| Security Guidance | Step 6 checklist still enforced; no real-time edit scanning |
| Playwright MCP | Step 8 skips visual verification; tests, lint, types still apply |
| PR Review Toolkit | Step 10 skips Phase 1; Phase 2 polling loop still runs. Step 8.5 falls back to manual self-review against CLAUDE.md + the security checklist |
| claude-mem | Steps 1/3/4 skip memory lookup; proceed from the current request alone |
| frontend-design | Step 5a/5b fall back to a manual direction write-up + hand-rolled HTML prototype. **Warn loudly** — the manual path is far more prone to template output. The anti-template ban, required-qualities check, and the 5c approval gate apply **without exception** |
| UI UX Pro Max | Step 5d skipped; 5a/5b/5c/5e still run |
| Taste / Transitions | Silent — additive voices, not gates |
| example-skills | mcp-builder / webapp-testing / brand-guidelines / web-artifacts-builder unavailable; engineering flow unaffected. Brand gate falls back to whatever brand material the user provides |
| finance / small-business / legal | Domain tasks still run the Deliverable flow with general reasoning; domain gates (figures trace to source, drafts-not-advice) enforced manually. **State explicitly that no domain pack is installed** |
| marketing / social packs | Content tasks proceed manually through the Deliverable flow. The publish-approval gate applies regardless |
| SkillSpector | Step 8.5 skips the automated supply-chain scan; Claude still manually reviews the artefact against the skill-threat list (prompt injection, config snooping, MCP rug-pull, excessive agency). Silent for ordinary app-code diffs |
| n8n-MCP | Surface only when a task actually involves n8n; otherwise silent |
| VoiceMode | Text workflow unchanged; non-blocking |
| Everything Claude Code | 150+ user-scope skills unavailable; the 10-step flow is unaffected |
| LightRAG | Step 2 falls back to Context7 alone |
| Karpathy Skills | The underlying principles still apply via CLAUDE.md; no behavioural gap |
| `fable` tier | Run every Model Routing row on `opus`; note the downgrade once |
