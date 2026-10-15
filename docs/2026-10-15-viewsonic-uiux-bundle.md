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
| Vendored | `skills/elattar-uiux-design/` (204 upstream files, plus `LICENSE` and maestro's own patch tests), and the four commands |

## What changed against upstream

Every vendored file is byte-identical to upstream except these. Re-apply all of them on every sync.

1. **`SKILL.md` description narrowed.** Upstream's description fires on any UI task "in any project, even if the user never mentions design or the design system". Bundled into maestro, that would load ViewSonic's tokens and rules into every maestro user's UI work on other systems. The description now scopes the skill to projects on the ViewSonic system (a `viewsonic-ui.config.json` or `.viewsonic-ui/` folder, or the foundation's `--color-action-*` and `--color-value-*` tokens) or an explicit request. The body is untouched.
2. **`checks/install.mjs` refuses to write through a symbolic link.** Upstream's installer refreshes `.viewsonic-ui/checks/` by copying its files in and deleting every other file there, and writes the hook, workflow, config, `.gitattributes` and ESLint config with plain writes. A repository that commits any of those paths as a link to a folder outside the project would have the installer overwrite files there and delete the rest. The patch (`linkOnPath`, `linkUnder`) checks every target path component and every entry under the vendored folder before planning or writing, and refuses with exit 1 and a message naming the link. The dry run refuses too.
3. **`checks/test/plugin-shape.test.mjs` adapted to maestro's layout.** Upstream asserts its own plugin shape. The adapted test keeps every assertion and points it at the bundle: plugin `maestro`, marketplace at the plugin root with source `./`, commands `uiux-*.md`, and a `PostToolUse` entry whose wrapper assigns `CHECK=` to the vendored `on-edit.mjs`.
4. **Added:** `LICENSE` beside the skill, so the MIT notice travels with every copy, and `checks/test/maestro-patches.test.mjs`, the tests for patch 2.

Outside the skill folder:

- **Commands** `commands/uiux-{setup,check,check-full,review}.md` are upstream's four commands, renamed so they read as `/maestro:uiux-check` rather than an ambiguous `/maestro:check`. Their bodies are upstream's, except that `allowed-tools: Bash(node:*), Read` became `allowed-tools: Read`. `Bash(node:*)` pre-approves any `node` command (`node -e ...` included) while a command is active, and for `uiux-setup` it would have made the model's reading of "only after the user says yes" the only gate before `install --yes`. Without it, every run goes through the user's normal permission prompt.
- **Hook** `hooks/uiux-on-edit.sh` is new and **opt-in** (`MAESTRO_UIUX_HOOK=on`). Upstream's hook runs `node .../on-edit.mjs` after every edit for people who chose that plugin. That check loads the edited project's own `typescript` package before any other gate, so in a cloned repository with a planted `node_modules/typescript` it runs that repository's code after an agent edit, with no install or build by the user; and once bundled it would do so for every maestro user. Off by default, the user turns it on knowingly, in their own environment, for repositories they trust. When on, the wrapper stays silent without Node or the script, passes the check's exit 2 through, and turns any other exit into a silent 0 (upstream's own contract for internal errors). The check's findings quote names from the project's files, so the wrapper prefixes them with a line labelling them as project data, strips control characters, caps each line at 300 characters and keeps the first 20 lines, all with shell builtins.

## The Step 5 changes

`frontend-design-trigger.md` gains a "Design-system projects" section, read before the substeps. A project counts only when it has its own tokens in the repo and something enforces them; stock shadcn/ui, Tailwind defaults, Material or Bootstrap as shipped do not count, and when unsure the project is treated as having no system. Then:

- 5a picks composition, never vocabulary: palette, type roles, radius, spacing, shadows and motion come from the system's tokens, and 5a's style list, palette, typography-pairing and motion lines apply only to projects without a system.
- Every voice (5d UI UX Pro Max, Taste, Transitions) stays inside the system; a suggested new token or font pairing is an ask, not a refinement.
- A missing value is an ask, naming the closest token, never an arbitrary literal.
- 5b becomes a local preview route on the system's real components, gitignored, for new surfaces, redesigns and style refreshes.
- The anti-template ban reads against composition: using the system's restyled components is required, not a template smell.
- Both themes belong to the system: a colour that needs a `dark:` variant means a token is missing.

On the ViewSonic system it routes 5a, 5e, 7 and 8 to the bundled skill's steps while maestro's gates (5c approval, TDD, Step 6, the Evidence Gate, 8.5) keep their authority.

`uiux-checklist.md` drops two items that contradicted token-driven systems (stock Tailwind palette as "tokens", `dark:` variants as the default) and adopts upstream's transferable rules: new values are asked for, a description is set smaller than its title, contrast is measured in both themes (disabled controls exempt but distinct), skeletons match the footprint and swap once, every action gives two signals, and a closing group that runs at Step 8, not 5e (a green build is the floor; both themes seen in a browser; report what was verified, never a skipped check as passing).

`SKILL.md` is unchanged: the hot path had 138 bytes of budget left, and Step 5 already reads `frontend-design-trigger.md` first.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Reference only: route to the plugin in ViewSonic's private marketplace | The owner asked for a copy. It would also leave every non-ViewSonic maestro user without the runnable checks, and a private marketplace cannot be installed from outside the organisation |
| Rewrite the rules in maestro's own words | Loses the checks and their 1,100-test suite, and drifts from upstream the day it lands |
| Ship it as a second plugin in the `impravin22` marketplace | Recommended at planning (its hook and description would reach only people who install it), but the owner chose one install. The narrowed description and the opt-in hook are the mitigation |
| Keep the hook on by default, gated on a ViewSonic marker in the wrapper | Still runs a repository's own `typescript` on every edit in any repository that carries the marker, which the repository itself controls |
| Keep upstream's directory layout through a custom skills path in `plugin.json` | Would avoid adapting the plugin-shape test, but rests on harness behaviour this change did not verify |

## Security review

**Before vendoring.** SkillSpector scanned the upstream plugin statically (its LLM pass did not run) and reported risk 81, CRITICAL, `DO_NOT_INSTALL`: 3 HIGH and 29 MEDIUM. All were false positives on reading: a `process.env` spread in a temp-repo git test, the word "override" in a comment about CSS `!important`, the plain `"description"` key in upstream's `plugin.json` (not vendored), rules and evals that tell the agent *not* to act without asking, and the project-scoped loading of Playwright and TypeScript. A rescan of the bundled tree reports the same two remaining HIGH false positives.

**Step 8.5 review** (code reviewer and security reviewer) found what the scanner could not:

| Finding | Severity | Outcome |
| --- | --- | --- |
| The after-edit check loads the project's own `typescript` before any gate, so a planted `node_modules/typescript` runs on any agent edit | HIGH | Fixed: the hook is opt-in |
| The installer follows committed symlinks, overwriting and deleting files outside the project | HIGH | Fixed: patch 2, with tests |
| Project-controlled names (variant keys, diagnostics) reach the agent as hook feedback, a prompt-injection channel | MEDIUM | Fixed in the wrapper: labelled as data, control characters stripped, size capped |
| `allowed-tools: Bash(node:*)` pre-approves arbitrary `node` while a command runs | MEDIUM | Fixed: commands pre-approve `Read` only |
| A repository's `viewsonic-ui.config.json` `uiDir` can point the walk outside the project, and the walks have no file, size or time cap | MEDIUM | Deferred to upstream; reachable only once the user turns the hook on, or through a user-run check |
| Predictable cache and marker names in the OS temp folder are written without `O_NOFOLLOW` (a shared Linux `/tmp` lets another local user clobber a file the victim can write) | MEDIUM | Deferred to upstream; same reach as above, and macOS temp folders are per user |
| Installer-generated workflow and hook built from unescaped `baseUrl` and folder names; screenshots not gitignored; browser checks trust repo-supplied routes and base URL; static-check `@import` paths not contained; a Windows separator bug in the `node_modules` skip | LOW | Deferred to upstream, all user-invoked |

What the check does write: a per-project cache `viewsonic-props-<hash>.json` and a one-time marker `viewsonic-on-edit-no-ts` in the OS temp folder. What it does not do: no network access beyond the configured dev server (browser checks only), no credentials, no telemetry, no `eval`; `git` runs through `spawnSync` with an argument array.

## Tests

- **The vendored suite runs in CI** (`uiux` job, Node 22 and 24), with TypeScript 5.9.3 installed at the repo root (exact version, no lockfile, no install scripts). In the bundle it reports 1,143 tests: 1,049 pass, 0 fail, 94 skipped. The browser checks skip themselves without Playwright.
- **Three skip patterns**, each an exact name, cover tests that need upstream's own tree: the suite `patterns: skeleton code passes the static checks` (copies upstream's styles and checks snippets against its components), the test `an unknown prop name gets a nearest-name suggestion` (needs upstream's React types), and the test `probe with only --fg is a usage error` (needs a shadcn project as the working directory). Upstream's CI runs them.
- **`checks/test/maestro-patches.test.mjs`** proves the installer refuses a linked `.viewsonic-ui/checks`, a linked `.viewsonic-ui` in the dry run, a link deeper inside the vendored folder, and linked hook, workflow, config and `.gitattributes` targets, leaving the outside folder untouched, and still installs a clean project.
- **`tests/hook-smoke.sh`** covers the wrapper: node never starts unless `MAESTRO_UIUX_HOOK=on` exactly; no plugin root, script or node; violations under the data header; clean output passed through; internal errors silent; stdin forwarded; control characters stripped and output capped; and two cases through real node, one of which proves the real exit-2 path on a minimal shadcn project.
- **The `manifests` job** requires the skill, its LICENSE and the wrapper to exist.

## Syncing from upstream

Upstream is private, so `track-upstream.yml` cannot watch it from public CI. To sync by hand, from a machine with access:

```bash
gh api repos/ViewSonic-Transformation/FDP-design-system/tarball/main > /tmp/fdp.tgz
mkdir /tmp/fdp && tar xzf /tmp/fdp.tgz -C /tmp/fdp --strip-components=1
diff -r /tmp/fdp/plugins/elattar-uiux-design/skills/elattar-uiux-design skills/elattar-uiux-design
```

Copy the upstream skill over, re-apply patches 1 to 3 above, keep `LICENSE` and `maestro-patches.test.mjs`, copy any changed command bodies into `commands/uiux-*.md` (keeping `allowed-tools: Read`), re-run SkillSpector on the new upstream tree and adjudicate it, run the suite, and update the commit in the provenance table. If upstream adds or renames a command, the plugin-shape test's `COMMANDS` list fails until the bundle matches. If upstream fixes a deferred finding, drop it from the table above.

## Known limits

- The skill's description (548 characters) joins every maestro session's skill listing, ViewSonic project or not. That is the cost of bundling over a separate plugin.
- The copy goes stale between syncs, and nothing public can detect it.
- The after-edit hook is off unless the user turns it on, so by default variant errors surface at Step 8's `run.mjs fast --changed`, not as each edit lands.
- Roughly a dozen upstream tests that need upstream's own tree do not run here.
