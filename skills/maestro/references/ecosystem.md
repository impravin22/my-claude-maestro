# Ecosystem — Install Commands & Degradation Rules

Read this **only when** a pack you need is missing, the user asks how to install one, or you need a pack's caveat. Not on every task — `SKILL.md` carries the summary.

## Required

| Pack | Install | Provides |
| --- | --- | --- |
| superpowers | `claude plugin install superpowers@claude-plugins-official` | brainstorming, writing-plans, TDD, systematic-debugging, verification, finishing-a-development-branch |
| Context7 MCP | `npx ctx7 setup --claude` | Live library docs (Step 2) |

## Recommended

| Pack | Install | Consumed at |
| --- | --- | --- |
| Vercel plugin | `claude plugin install vercel@claude-plugins-official` | Optional platform tooling; ships no Step 5 skills (5a uses `frontend-design` alone) |
| Security Guidance | `claude plugin install security-guidance@claude-plugins-official` | Step 6 (post-edit scanning) |
| PR Review Toolkit | `claude plugin install pr-review-toolkit@claude-plugins-official` | Steps 8.5 + 10 (6 specialist review agents) |
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
| leadership-skills | `claude plugin marketplace add PierrickMartos/Leadership-Skills` then `claude plugin install <performance-management\|communication\|decision-making\|hiring\|learning>@leadership-skills` | Leadership domain |
| pm-claude-skills | **Pinned — do not `marketplace add` the repo.** `install.sh` clones the reviewed commit to `~/.claude/pinned/pm-claude-skills` (sparse, blobless, ~6MB) and adds that path, then installs `pm-delivery`, `pm-people`, `pm-career`, `pm-comms`. Re-run `./install.sh` (idempotent) or copy the clone sequence from its pinned block | Leadership domain |
| pm-product-discovery | `claude plugin marketplace add phuryn/pm-skills && claude plugin install pm-product-discovery@pm-skills` | Leadership domain (opportunity scans) |
| c-level-skills | `claude plugin marketplace add alirezarezvani/claude-skills && claude plugin install c-level-skills@claude-code-skills` — marketplace registers as `claude-code-skills`, not the repo name | Leadership domain (org leverage) |
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
- **leadership packs** — route to already-installed `atlassian` and `pm-*` skills before installing any of these; ticket summarising in particular is already saturated. Install the named bundles, never a whole marketplace. See `skill-pack-registry.md` for the job-to-skill map and the impact-claim gate.
- **pm-claude-skills** — its README badge claims a listing in Anthropic's official plugin directory that does not exist (the badge links to its own README anchor), and it lands roughly a dozen commits a day across 858 skills at the pinned commit. Content is sound and the four leadership bundles make zero network calls, so it ships **pinned**: `PM_CLAUDE_SKILLS_SHA` in `install.sh` is the reviewed commit, and `verify_pinned_sha` fails closed if the checkout is at any other commit **or has local modifications** (a `git checkout` over a dirty tree keeps the edit, so HEAD alone is not the guarantee). A third guard, `is_ephemeral_path`, refuses to register the marketplace at all when the pin directory resolves under a temporary root: the path is recorded absolutely in the global registry, so a run under a throwaway `HOME` leaves an entry pointing at a directory that later vanishes, and every subsequent `claude plugin list` reports `cache-miss`. In all three cases the pack is skipped and the run exits non-zero. Bumping that constant is a re-review, not a version bump. Do not confuse it with `phuryn/pm-skills`, a different and better-known repo, which it tells users to search for by name.
- **Excluded leadership repos** — `deanpeters/Product-Manager-Skills` is CC BY-NC-SA (NonCommercial unresolved for commercial employers); `htk007/claude-skills-for-leaders` and `shaik41/em-skills-claude-code` ship no LICENSE file, so all-rights-reserved applies. Good content in all three; none is safely adoptable at work.
- **SkillSpector** — git-only (not on PyPI); the `[mcp]` extra is required for `skillspector mcp`. Keyless by design: the static pass flags candidates, **Claude adjudicates**. It over-flags teaching-skills and defensive code — never accept a raw `DO_NOT_INSTALL` verdict at face value.
- **Everything Claude Code** — user-scope skills, so plugin-scope skills (superpowers, maestro) win on collisions.

## Degradation rules

A missing pack **never blocks a task**. Perform the equivalent manually and note the gap once so the user can install it.

| Missing | Effect |
| --- | --- |
| A superpowers skill | Do the step manually — brainstorming → propose 2–3 approaches and get approval; writing-plans → a numbered plan; TDD → tests first anyway; verification → run the gate commands by hand. **Never skip the step.** |
| Security Guidance | Step 6 checklist still enforced; no automated post-edit scanning |
| Playwright MCP | Step 8 skips visual verification; tests, lint, types still apply |
| PR Review Toolkit | Step 10 skips Phase 1; Phase 2 polling loop still runs. Step 8.5 falls back to manual self-review against CLAUDE.md + the security checklist |
| claude-mem | Steps 1/3/4 skip memory lookup; proceed from the current request alone |
| frontend-design | Step 5a/5b fall back to a manual direction write-up + hand-rolled HTML prototype. **Warn loudly** — the manual path is far more prone to template output. The anti-template ban, required-qualities check, and the 5c approval gate apply **without exception** |
| UI UX Pro Max | Step 5d skipped; 5a/5b/5c/5e still run |
| Taste / Transitions | Silent — additive voices, not gates |
| example-skills | mcp-builder / webapp-testing / brand-guidelines / web-artifacts-builder unavailable; engineering flow unaffected. Brand gate falls back to whatever brand material the user provides |
| finance / small-business / legal | Domain tasks still run the Deliverable flow with general reasoning; domain gates (figures trace to source, drafts-not-advice) enforced manually. **State explicitly that no domain pack is installed** |
| marketing / social packs | Content tasks proceed manually through the Deliverable flow. The publish-approval gate applies regardless |
| leadership packs | Route to the installed `atlassian` and `pm-*` skills named in `skill-pack-registry.md` — they cover ticket summarising outright and most ticket craft. The impact-claim, Jira-write, and people-data gates apply regardless of which pack is present |
| SkillSpector | Step 8.5 skips the automated supply-chain scan; Claude still manually reviews the artefact against the skill-threat list (prompt injection, config snooping, MCP rug-pull, excessive agency). Silent for ordinary app-code diffs |
| n8n-MCP | Surface only when a task actually involves n8n; otherwise silent |
| VoiceMode | Text workflow unchanged; non-blocking |
| Everything Claude Code | 150+ user-scope skills unavailable; the 10-step flow is unaffected |
| LightRAG | Step 2 falls back to Context7 alone |
| Karpathy Skills | The underlying principles still apply via CLAUDE.md; no behavioural gap |
| `fable` tier | Run every Model Routing row on `opus`; note the downgrade once |
