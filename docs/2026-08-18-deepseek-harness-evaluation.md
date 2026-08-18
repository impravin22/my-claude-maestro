# DeepSeek Harness Evaluation: Peer Harness, Not a Pack

**Date:** 2026-08-18
**Status:** Approved (no adoption, no version change)
**Applies to:** v1.14.1

## Problem

The user found [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`deepseek-ai/deepseek-harness`, MIT) and asked whether it fits into maestro. It is DeepSeek AI's open-source agent harness, invoked as `dsh`, built on the [Cordis](https://github.com/cordiverse/cordis) plugin runtime, with the tagline "Everything is a Plugin".

Every prior ecosystem evaluation in this repo asked the same question about a *pack*: a skill bundle, a plugin, an MCP server that maestro consumes at a numbered step. DSH is not that. It is a peer harness, and the category is new here, so the question needs answering in its own terms rather than by pattern-matching to the Recommended table.

## What it actually is

Verified against the GitHub API and the repository's own documentation on 2026-08-18:

| Field | Value |
|---|---|
| Created | 2026-08-13 |
| Last push | 2026-08-17 |
| Stars / forks | 152,515 / 15,725 |
| Licence | MIT |
| Language | TypeScript |
| Size | ~114 MB |
| Status | "developer preview ... THERE WILL BE COMPATIBILITY-BREAKING CHANGES" (its own README) |

It ships a CLI (`apps/cli`) and a web UI (`apps/web`, served at `127.0.0.1:3080` via `npx @deepseek-ai/dsh web`), 49 package families including `core`, `llm`, `session`, `sandbox`, `mcp`, `skill`, `subagent`, `workflow`, `hooks`, `credentials`, `lsp` and `guard`. It is a complete agent runtime with its own model layer, session store, tool registry and plugin system.

Maestro is a ~600-line installer plus one `SKILL.md` that orchestrates Claude Code. The two occupy the same layer of the stack, so one cannot be a plugin of the other in the direction the question implies.

## Which way integration actually flows

DSH already integrates Claude Code. The reverse has no mechanism.

- **`packages/subagent/subagent-claude-code`** registers a fixed `claude-code` subagent provider that invokes the official Claude Agent SDK, resolving the native `claude` executable through DSH's own subprocess service. Its README states the provider "deliberately omits the SDK `settingSources` option", so the child reads the host's normal user, project and local Claude settings relative to the parent session's working directory. Any maestro-installed plugin is therefore already live inside that child. The provider sets `persistSession: false`, disables `AskUserQuestion`, and reports `inheritsParentContext: false`: the child receives a standalone text task and the parent cwd, not the parent conversation, persona or tool filter.
- **`packages/hooks/hooks-claude-code`** consumes Claude Code hook format (alongside `hooks-codex` and a shared `hook-protocol`).
- **`packages/mcp/mcp-client`** speaks MCP, so the servers `install.sh` registers are reachable from both harnesses.

DSH is designed to sit above Claude Code. Maestro sits inside it.

## Interop angles, and what each is worth

**A. Skill portability.** DSH's local skill provider accepts directory bundles (`<name>/SKILL.md`) and flat Markdown files (`<name>.md`), with kebab-case names matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`, and reads the frontmatter keys `disable-model-invocation` and `user-invocable` (both defaulting to `true`). That is Anthropic's Agent Skills format. Discovery roots, in rank order:

| Rank | Source | Root |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | configured bundled root |

`skills/maestro/` satisfies every structural requirement: kebab-case name, `name` and `description` frontmatter, resources below the bundle reachable through the provider's `resourceBase`. Copied to `.agents/skills/maestro/` it would be discovered and loadable.

It would also be close to useless there. `SKILL.md` carries 17 `superpowers:` invocations and depends on the `Skill` tool, the `Agent` tool, Context7 MCP, the pr-review-toolkit agents and named Claude Code plugins. None of that resolves under DSH. What loads is a ten-step flow whose gates all point at nothing. Portable in format, not in function.

**B. DSH as the outer harness.** Install DSH separately and let it delegate through the `claude-code` subagent provider. Maestro fires normally inside the child, because that provider deliberately does not filter host Claude settings. This is the supported path and it requires zero changes to this repo.

**C. Shared MCP servers.** Context7, Playwright, claude-mem and SkillSpector can be registered against both harnesses. Zero code, zero coupling.

## Approach Selection

### Chosen: document the evaluation, change nothing else

No Recommended row, no `ecosystem.md` entry, no `install.sh` step, no upstream-tracker entry, no version bump. This file is the whole change, plus its line in the README docs tree.

The precedent is the [Ponytail evaluation](2026-07-22-ponytail-integration-design.md), which closes with the rule this follows: no Prerequisites row, ecosystem entry, installer step or upstream-tracker entry exists for something that is not an installed dependency. DSH is not an installed dependency. An entry in a table of packs to install, for a thing that must not be installed, misleads at the exact moment someone reads it.

### Rejected Alternatives

**A. Add DSH to `install.sh` as an optional heavy component**, alongside VoiceMode, n8n-MCP and LightRAG. Rejected on dependency direction. Those three are services maestro consumes at a numbered step. DSH consumes maestro. Shipping a competing agent runtime from a Claude Code plugin installer inverts the relationship and would confuse anyone reading the installer's output, quite apart from the ~114 MB and the pnpm build it would pull in.

**B. Add a `Peer harnesses` section to `references/ecosystem.md`.** This was the original suggestion to the user and it is the closest call here. Rejected on two grounds. First, the ponytail rule above. Second, and more practically, `ecosystem.md` opens by stating it should be read "only when a pack you need is missing, the user asks how to install one, or you need a pack's caveat". DSH will never be a pack that is missing, so an entry there would sit on a path that never fires for it. The docs tree is where "we looked at this and decided" already lives, and the README lists it.

**C. Port maestro to a `dsh-plugin`.** Rejected for now, not permanently. DSH's own topic tag `dsh-plugin` invites it, and if that ecosystem consolidates it becomes a real distribution channel. But a port means rewriting the routing layer against `ctx.skills` and `ctx.tools`, dropping every `superpowers:` reference, and finding DSH equivalents for the Step 5, 8.5 and 10 gates. That is a fork of the skill maintained in parallel, not a port. Revisit when DSH leaves developer preview and its plugin API stops moving.

**D. Adopt nothing and write nothing.** Rejected. A 152k-star repository in this exact problem space will be asked about again, and the answer takes real research to reconstruct. Writing it down once is cheaper than re-deriving it.

## Trade-offs

1. **The window may matter.** 152k stars in five days means the ecosystem could consolidate quickly, and if `dsh-plugin` becomes a distribution channel that others reach first, waiting has a real cost. Accepted because the API surface is explicitly promised to break, so anything built against it now is rework, and alternative C stays open.
2. **This document dates fast.** Every figure above is a 2026-08-18 snapshot of a repository pushing changes daily, and the developer-preview warning means the package layout, skill discovery ranks and subagent contract quoted here can all move. Treat the specifics as evidence of *what was true when the decision was made*, not as current API reference. Re-verify before acting on any of it.
3. **No interop instructions ship to users.** Someone who wants angle B or C gets nothing from maestro to help them do it. Accepted: both angles are configured entirely on the DSH side, and documenting another project's setup here would drift out of date faster than this file already will.
4. **The audit was documentation-level, not source-level.** Package READMEs, the skills subsystem doc and the GitHub API were read; the TypeScript sources under `packages/*/src` were not. That is sufficient for a "do not adopt" verdict, and would not be sufficient for an adoption one. Any future reversal needs the source audit that maestro's own Step 8.5 would demand of a real dependency.

## Evidence

All figures verified 2026-08-18 against `gh api repos/deepseek-ai/deepseek-harness` and the repository's own files:

- Repository metadata, licence, size and timestamps: GitHub API.
- Developer-preview warning and run instructions: `README.md`.
- Package inventory: `packages/` and `apps/` contents listings.
- Skill format, frontmatter keys, kebab-case pattern and the six-rank discovery table: `docs/subsystems/skills.md`.
- Claude Agent SDK delegation, the omitted `settingSources` option, `persistSession: false` and `inheritsParentContext: false`: `packages/subagent/subagent-claude-code/README.md`.
- Claude Code hook and MCP client support: `packages/hooks/` and `packages/mcp/` contents listings.

No DSH code was cloned, built or executed as part of this evaluation.

## Files Changed

| File | Change |
|------|--------|
| `docs/2026-08-18-deepseek-harness-evaluation.md` | This document |
| `README.md` | Docs tree gains this file |

Deliberately not changed: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/maestro/SKILL.md`, `skills/maestro/references/ecosystem.md`, `install.sh`, `.github/workflows/track-upstream.yml`. Nothing was adopted, so nothing installs, routes, degrades or gets tracked differently, and no version ships.
