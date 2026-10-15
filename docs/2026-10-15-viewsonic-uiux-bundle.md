# Bundling ViewSonic's UI/UX skill, and a design-system-aware Step 5 (v1.19.0)

## Decision

Maestro bundles `elattar-uiux-design`, ViewSonic's UI/UX skill, as a second skill of the maestro plugin, and its Step 5 gate learns to defer to a project's own design system. Projects on the ViewSonic design system get the skill's design pass, rules and runnable checks inside maestro's flow; every other project gets a gate that no longer asks a token-driven system for a new palette or a Tailwind CDN mockup.

The owner asked for the skill to be copied in (not referenced) and bundled inside maestro (not shipped as a second marketplace plugin), and confirmed that the content may be published in this public repository.

## Provenance

| | |
| --- | --- |
| Upstream | `ViewSonic-Transformation/FDP-design-system` (private), path `plugins/elattar-uiux-design/` |
| Commit | `4e85c1794029c53f80d35fd256044278902f88be` (2026-10-15) |
| Licence | MIT, copyright 2026 Ayoub Elattar; copied to `skills/elattar-uiux-design/LICENSE` |
| Upstream plugin version | `elattar-uiux-design` 0.1.0 |
| Vendored | `skills/elattar-uiux-design/` (204 files, byte-identical except the edits below), plus the four commands |

## What changed against upstream

Everything under `skills/elattar-uiux-design/` is byte-identical to upstream except:

1. **`SKILL.md` description narrowed.** Upstream's description fires on any UI task "in any project, even if the user never mentions design or the design system". Bundled into maestro, that would load ViewSonic's tokens and rules into every maestro user's UI work on other systems. The description now scopes the skill to projects on the ViewSonic system (a `viewsonic-ui.config.json` or `.viewsonic-ui/` folder, or the foundation's `--color-action-*` and `--color-value-*` tokens) or an explicit request. The body is untouched.
2. **`checks/test/plugin-shape.test.mjs` adapted to maestro's layout.** Upstream asserts its own plugin shape (its `plugin.json`, its marketplace two levels up, four commands named `check.md` and so on, its `hooks.json`). The adapted test keeps every assertion and points it at the bundle: plugin `maestro`, marketplace at the plugin root with source `./`, commands `uiux-*.md`, and a `PostToolUse` entry that runs `hooks/uiux-on-edit.sh`, which must run the vendored `on-edit.mjs`.
3. **`LICENSE` added** beside the skill, so the MIT notice travels with every copy.

Outside the skill folder:

- **Commands** `commands/uiux-{setup,check,check-full,review}.md` are upstream's four commands, renamed so they read as `/maestro:uiux-check` rather than an ambiguous `/maestro:check`. Their bodies are unchanged; the `${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/...` paths they use resolve the same way in the bundle.
- **Hook** `hooks/uiux-on-edit.sh` is new. Upstream's hook runs `node .../on-edit.mjs` directly, which is fine for people who chose that plugin. Bundled, it runs after every edit for every maestro user, so the wrapper adds an opt-out (`MAESTRO_UIUX_HOOK=off`), stays silent without Node or the script, passes the check's exit 2 and its stderr through, and turns any other exit into a silent 0. That last rule matches upstream's own contract for internal errors and stops an old Node that cannot parse the module from printing an error after every edit.

## The Step 5 changes

`frontend-design-trigger.md` gains a "Design-system projects" section, read before the substeps:

- 5a picks composition, never vocabulary: palette, type roles, radius, spacing, shadows and motion come from the system's tokens.
- A missing value is an ask, naming the closest token, never an arbitrary literal.
- 5b becomes a local preview route on the system's real components, gitignored, instead of a Tailwind CDN prototype.
- The anti-template ban reads against composition: using the system's restyled components is required, not a template smell.
- Both themes belong to the system: a colour that needs a `dark:` variant means a token is missing.

On the ViewSonic system it routes 5a, 5e, 7 and 8 to the bundled skill's steps while maestro's gates (5c approval, TDD, Step 6, the Evidence Gate, 8.5) keep their authority.

`uiux-checklist.md` drops two items that contradicted token-driven systems (stock Tailwind palette as "tokens", `dark:` variants as the default) and adopts upstream's transferable rules: new values are asked for, a description is set smaller than its title, contrast is measured in both themes (disabled controls exempt but distinct), skeletons match the footprint and swap once, every action gives two signals, and a closing "Before Calling It Done" group (a green build is the floor; both themes seen in a browser; report what was verified, never a skipped check as passing).

`SKILL.md` is unchanged: the hot path had 138 bytes of budget left, and Step 5 already reads `frontend-design-trigger.md` first.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Reference only: route to the plugin in ViewSonic's private marketplace | The owner asked for a copy. It would also leave every non-ViewSonic maestro user without the runnable checks, and a private marketplace cannot be installed from outside the organisation |
| Rewrite the rules in maestro's own words | Loses the checks and their 1,100-test suite, and drifts from upstream the day it lands |
| Ship it as a second plugin in the `impravin22` marketplace | Recommended at planning (its hook would run only for people who install it), but the owner chose one install. The wrapper's opt-out and early exits are the mitigation |
| Keep upstream's directory layout through a custom skills path in `plugin.json` | Would avoid adapting the plugin-shape test, but rests on harness behaviour this change did not verify |

## Security review

SkillSpector scanned the upstream plugin before it entered the repository. It ran static-only (the LLM pass did not run) and reported risk 81, CRITICAL, `DO_NOT_INSTALL`: 3 HIGH and 29 MEDIUM. Each was adjudicated:

- HIGH "credential access" (`checks/test/install.test.mjs`): a `.env`-like match in a test that writes a stub into a temporary fixture. False positive.
- HIGH "instruction override" (`checks/static/rules.mjs`): the word "override" in a comment about CSS `!important`. False positive.
- HIGH YARA "tool metadata poisoning" (upstream `plugin.json`): matched the plain `"description"` key. False positive; that file is not vendored.
- MEDIUM "excessive agency" (16): rules and evals that tell the agent *not* to act without asking. False positives.
- MEDIUM "MCP rug pull" (13): Playwright and TypeScript are loaded from the checked project through `createRequire`, and one `fetch` checks that the configured dev server is reachable. Expected behaviour for a project checker.

A manual read of every executable path found: `git` called through `spawnSync` with an argument array (no shell), the installer writing into the project only after an explicit yes (and removing only stale files inside its own vendored folder), and the after-edit check writing one marker file in the OS temp folder. No network access beyond the configured dev server, no credentials, no internal hostnames.

## Tests

- **The vendored suite runs in CI** (`uiux` job, Node 22 and 24), with TypeScript 5.9.3 installed at the repo root (exact version, no lockfile, no install scripts). In the bundle it reports 1,133 tests: 1,039 pass, 0 fail, 94 skipped. The browser checks skip themselves without Playwright.
- **Three suites are skipped by exact name** because they need upstream's own tree: `patterns: skeleton code passes the static checks` (copies upstream's styles and checks snippets against its components), `on-edit hook (with the project's TypeScript)` (needs upstream's React types and `class-variance-authority`), and `probe with only --fg is a usage error` (needs a shadcn project as the working directory). Upstream's CI runs them.
- **`tests/hook-smoke.sh`** covers the wrapper: opt-out never starts node, no plugin root, no script, no node, violations pass through as exit 2, clean output passes through, internal errors are silent, stdin is forwarded, and one integration case through real node.
- **The `manifests` job** requires the skill, its LICENSE and the wrapper to exist.

## Syncing from upstream

Upstream is private, so `track-upstream.yml` cannot watch it from public CI. To sync by hand, from a machine with access:

```bash
gh api repos/ViewSonic-Transformation/FDP-design-system/tarball/main > /tmp/fdp.tgz
mkdir /tmp/fdp && tar xzf /tmp/fdp.tgz -C /tmp/fdp --strip-components=1
diff -r /tmp/fdp/plugins/elattar-uiux-design/skills/elattar-uiux-design skills/elattar-uiux-design
```

Copy the upstream skill over, then re-apply the two edits above (the `SKILL.md` description and `plugin-shape.test.mjs`), keep `LICENSE`, copy any changed command bodies into `commands/uiux-*.md`, re-run SkillSpector on the new upstream tree and adjudicate it, run the suite, and update the commit in the provenance table. If upstream adds or renames a command, the plugin-shape test's `COMMANDS` list fails until the bundle matches.

## Known limits

- Every maestro user pays one `bash` and one `node` start after each edit, even outside ViewSonic projects; the check exits early outside a shadcn project. `MAESTRO_UIUX_HOOK=off` removes the cost.
- The copy goes stale between syncs, and nothing public can detect it.
- Roughly sixteen upstream tests that need upstream's own tree do not run here.
