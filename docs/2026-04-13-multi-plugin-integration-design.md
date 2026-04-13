# Plugin Integration Design — Multi-plugin ecosystem (v1.3.0)

**Date:** 2026-04-13
**Status:** Approved
**Version:** 1.3.0

## Problem

The v1.2.0 release (claude-mem) added one recommended plugin. The user then requested integration of 11 additional Claude-Code-adjacent resources:

1. UI UX Pro Max — design styles + palettes
2. n8n-MCP — 400+ n8n workflow integrations
3. LightRAG — graph+vector RAG research library
4. Everything Claude Code — 150+ skills, 47 agents, 79 commands, 16 rules
5. (superpowers — already installed)
6. Awesome Claude Code — curated awesome-list
7. Claude Code Ultimate Guide — docs + templates
8. Antigravity Awesome Skills — 1,404+ skills
9. Claude Agent Blueprints — index of 75+ templates
10. VoiceMode MCP — voice conversations via Whisper + Kokoro
11. Awesome Claude Plugins — curated plugin index

Left unaddressed, these posed four real risks:
- **Licence boundary violations** — four items are CC BY-NC-ND / CC BY-SA / no-LICENSE and cannot be vendored into an MIT repo.
- **Skill namespace collisions** — adopting both Everything Claude Code (150+) and Antigravity (1,404+) on top of superpowers would double-stack overlapping skill triggers.
- **Apparent-but-not-actionable integration** — LightRAG is a Python research library, not a Claude Code plugin; installing it alone doesn't make it queryable from Claude Code.
- **Silent breakage** — UI UX Pro Max auto-activates on UI/UX prompts and could override maestro's Step 5 checklist without precedence rules documented.

## Solution

Categorise the 11 items (plus the already-installed claude-mem/superpowers) by integration type and apply the appropriate treatment per category. Bump maestro to v1.3.0.

### Category A — Install now, document as RECOMMENDED prerequisites

Added as RECOMMENDED rows in the Prerequisites table. Graceful-degradation entries added for each. All are MIT-licensed and install cleanly via MCP or CLI.

- **UI UX Pro Max** (npm CLI `uipro init --ai claude` — installs into `~/.claude/skills/ui-ux-pro-max/`)
- **n8n-MCP** (`claude mcp add n8n-mcp …`)
- **VoiceMode MCP** (`claude mcp add --scope user voicemode …`)
- **Everything Claude Code** (`./install.sh --target claude --profile full` — 150+ skills, 47 agents, 79 commands, 16 rules installed to `~/.claude/`)
- **Andrej Karpathy Skills** (`claude plugin install andrej-karpathy-skills@karpathy-skills`) — Karpathy's 4 LLM-coding principles as a plugin-scope CLAUDE.md overlay

### Category B — Install with explicit external-service caveat

LightRAG is installed as a Python library (`uv tool install "lightrag-hku[api]"`) but cannot be invoked from Claude Code without a custom MCP bridge. Documented in Step 2 CONTEXT7 as an *optional external supplement* for oversized codebases. The MCP bridge is explicitly out of scope for v1.3.0 — noted as follow-up work.

### Category C — Skipped (collision avoidance)

- **Antigravity Awesome Skills** — user chose Everything Claude Code over it; avoiding double skill-namespace pressure on superpowers was the goal.

### Category D — Link-only in README (`## External Resources` section)

Licence restrictions prevent vendoring; link-only is the licence-clean path.

- **Awesome Claude Code** — CC BY-NC-ND 4.0
- **Claude Code Ultimate Guide** — CC BY-SA 4.0 (ShareAlike conflicts with maestro's MIT)
- **Claude Agent Blueprints** — no LICENSE file (default all-rights-reserved)
- **Awesome Claude Plugins** — no LICENSE file

### Category E — Orthogonal concern: daily auto-update

User requested "every morning pull from GitHub". Implemented as a macOS launchd agent at 09:00 local:
- `~/.claude/bin/update-plugins.sh` — runs `claude plugin marketplace update --all`, `claude plugin update --all`, and `git pull --ff-only` on user-hosted marketplace repos (maestro, thedotmack/claude-mem cache).
- `~/Library/LaunchAgents/com.kumarpr.claude-plugins-update.plist` — `StartCalendarInterval { Hour: 9, Minute: 0 }`.
- Logs to `~/.claude/logs/auto-update.log` and `auto-update.stderr.log`.

## Approach Selection

### Chosen: Categorise by integration type

Each category gets treatment matching its nature: install for MIT-licensed installable plugins, link-only for licence-blocked resources, caveat-prefixed install for Python-lib-but-not-plugin items, and skip for collision candidates.

### Rejected Alternatives

**A. Install all 12 blindly (including Antigravity alongside ECC and superpowers):**
- Double skill-namespace collision with 1,554+ skills fighting superpowers' triggers.
- No benefit from redundant skill collections — more skills does not equal more signal.

**B. Vendor the licence-blocked awesome-lists and guides into maestro:**
- CC BY-NC-ND (Awesome Claude Code) forbids derivatives outright.
- CC BY-SA (Ultimate Guide) would force maestro to relicense from MIT to CC BY-SA — changes the distribution story.
- No-LICENSE items default to all-rights-reserved; vendoring is copyright infringement.

**C. Build the LightRAG MCP bridge in this PR:**
- A real engineering project (REST client, tool schema design, auth, index lifecycle, server lifecycle management).
- Belongs in its own PR post-v1.3.0 so its scope doesn't derail the ecosystem integration.

**D. Skip everything not already a Claude Code plugin:**
- Would exclude VoiceMode (MCP, already Claude-Code-native), n8n-MCP (MCP, already Claude-Code-native), UI UX Pro Max (CLI-installed skill), and LightRAG.
- Under-delivers on user request without commensurate safety benefit — these are all legitimately installable.

**E. Install Antigravity *in addition to* Everything Claude Code:**
- Per user Q1: chose Everything Claude Code only. Document what was rejected and why.

## Trade-offs

1. **Skill directory ballooned** — `~/.claude/skills/` went from 1 (ui-ux-pro-max) to 151 entries post-ECC. Disk footprint is ~3 MB; nothing dramatic. Trigger ambiguity is real but mitigated by plugin-scope > user-scope precedence — documented in SKILL.md "When extended skill ecosystems are installed".
2. **launchd plist hardcodes `/Users/kumarpr/...` paths** — fine for personal setup, not portable. Teamwide rollout would need a templated plist (future work).
3. **VoiceMode first-run downloads several GB** — Kokoro + Whisper local models. Tolerable since VoiceMode is opt-in and only invoked on voice prompts.
4. **LightRAG is installed but not callable from Claude Code** — explicit in SKILL.md and README so expectations are set. Trade-off for shipping v1.3.0 on time vs. waiting for the MCP bridge.
5. **Four items (`Awesome Claude Code`, `Ultimate Guide`, `Agent Blueprints`, `Awesome Plugins`) are link-only** — the user cannot "install" these, so they are documented as `## External Resources`. Honest labelling over feature-inflation.
6. **Auto-update silent-breakage risk** — daily pulls may introduce breaking changes. Mitigated by logging to `~/.claude/logs/auto-update.log`; the user is responsible for periodic log review. No auto-rollback.
7. **UI UX Pro Max vs maestro Step 5 overlap** — UI UX Pro Max auto-activates on UI/UX prompts. Documented precedence: maestro's checklist is canonical; UI UX Pro Max suggestions are additive. If the trigger matcher still picks UI UX Pro Max first, the user sees both responses layered — acceptable.

## Files Changed

| File | Change |
|------|--------|
| `.claude-plugin/plugin.json` | Version 1.2.0 → 1.3.0; extended description; 7 new keywords (`n8n`, `voicemode`, `lightrag`, `ui-ux-pro-max`, `everything-claude-code`, `skill-marketplace`, `multi-plugin`) |
| `.claude-plugin/marketplace.json` | Version 1.2.0 → 1.3.0; extended description |
| `README.md` | New "Composes with an extended plugin ecosystem" item in What It Does; 5 new prereq rows (UI UX Pro Max, n8n-MCP, VoiceMode, Everything Claude Code, LightRAG); new `## External Resources` section (4 licence-blocked links); plugin-structure tree updated |
| `skills/maestro/SKILL.md` | 5 new prereq bullets; Step 2 CONTEXT7 gains optional LightRAG paragraph; Step 5 UI/UX adds UI UX Pro Max precedence clarification; graceful-degradation section gains 5 entries; new "When extended skill ecosystems are installed" subsection |
| `skills/maestro/references/quality-gates.md` | New "Extended Plugin Ecosystem" gate section (5 optional gates) |
| `docs/2026-04-13-multi-plugin-integration-design.md` | This design doc |

Out of repo (installed on user machine):
- n8n-MCP, VoiceMode MCP registered in `~/.claude.json`
- UI UX Pro Max skill moved to `~/.claude/skills/ui-ux-pro-max/`
- Everything Claude Code installed to `~/.claude/` (skills, agents, commands, rules, hooks, scripts)
- LightRAG installed as `uv` tool (5 executables under `~/.local/bin/`)
- `~/.claude/bin/update-plugins.sh` + `~/Library/LaunchAgents/com.kumarpr.claude-plugins-update.plist` for daily auto-update
