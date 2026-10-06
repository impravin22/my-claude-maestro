# On-Demand Domain Packs: Route to a Pack Without Enabling It

**Date:** 2026-10-06
**Status:** Approved (adopted in v1.18.0)
**Applies to:** v1.17.0 → v1.18.0

## Problem

v1.17.0 kept domain packs (marketing, social, finance, small business, legal, leadership) out of the global set, because every enabled pack adds its skills to every session's skill listing, and the listing was 10.5 times over its budget. The cost of that choice: a switched-off plugin's skills are not offered to Claude at all, so nothing could pick them for a marketing or leadership task. The maintainer asked for maestro to route to the right pack automatically, by project and by requirement.

## Decision

Maestro loads a pack itself when CLASSIFY names its domain (`skill-pack-registry.md`, Loading a pack):

1. **Enabled:** invoke the skill through the Skill tool, as before.
2. **Installed but switched off:** run `skills/maestro/scripts/find-pack.py <plugin>@<marketplace>` from maestro's base directory (the "Base directory for this skill" line the Skill tool prints). It prints the pack's folder and one line per skill, name and description cut at 500 characters; maestro announces the load in one line, reads the chosen `SKILL.md` and follows it inside the Deliverable flow.
3. **Needs connectors** (finance, legal, small-business, Atlassian): the skill text loads the same way, but connector tools exist only while the plugin is enabled, so maestro proposes `claude plugin enable … --scope local` and a restart.
4. **Not on disk:** propose the install line; `ecosystem.md` now has one for every routed pack, atlassian included.

The helper replaces a hand-run one-liner and a `grep`, and adds the checks they skipped. Each outcome is one status line with its own exit code: `found` 0, `not installed` 3, `blocked` 4, `not routed` 5, `unsafe path` 6, `unreadable` 7 (and `no defaults` 8 for `--project`); usage errors exit 2, anything unexpected exits 1 on one line, never with a traceback. The registry treats any other status, exit code or silence the same way as a refusal: load nothing, quote what was printed, and never look for a pack by hand.

- **Routing table only.** The spec must appear in the registry's Loading a pack table, so a pack the registry never vetted cannot be loaded this way.
- **Install record only.** The folder comes from the `installPath` in `~/.claude/plugins/installed_plugins.json`: the user-scope entry first, else a `local` or `project` entry whose `projectPath` is the working directory. A missing entry is `not installed`; there is no fallback to the newest cache folder, which may be stale. A record of another shape (a version other than 2, a non-list entry) is `unreadable`.
- **Inside the cache.** The real path must sit inside `~/.claude/plugins/cache`; a relative path, a `..` climb or a symlink out is `unsafe path`.
- **Managed settings.** An organisation's `enabledPlugins: {"<spec>": false}` in `managed-settings.json` or a `managed-settings.d/*.json` drop-in (macOS `/Library/Application Support/ClaudeCode/`, Linux and WSL `/etc/claude-code/`, as the Claude Code managed-settings page gives them) is `blocked`; a managed file that cannot be read is `unreadable`, never an allow.
- **Skills.** `skills/*/SKILL.md` only. A skill is skipped when its folder name holds anything but letters, digits, `.`, `_` or `-`; when its folder, its `SKILL.md` or any symlink inside it leads out of the pack; or when `disable-model-invocation` is anything but plainly off (empty, `false`, `no`, `off` or `0`), so a YAML tag such as `!!bool true` fails closed. A pack folder whose path holds `$`, a backtick, `"` or `\` is an unsafe path, because the model reads files by that path. Descriptions are parsed as YAML scalars (plain, quoted, folded `>`/`>-`, literal `|`/`|-`, indented continuations) by `pack_text.py`, cut at 500 characters, and stripped of controls, format, private-use and surrogate characters, tag characters and variation selectors before printing.

Per-project defaults live in an optional user file, `~/.claude/maestro-packs.json`, mapping folders to packs. For deliverable, mixed or unclear tasks CLASSIFY runs `find-pack.py --project "$PWD"`: a key matches when the directory is that folder or sits inside it (real paths, so `/x/shop` does not match `/x/shop-site`), the longest key wins, and names outside the routing table are reported and ignored. Writing the file is ask-first.

**Authority.** A loaded pack supplies method, structure and voice only. The registry pins an allow-list: before any tool action the pack names (a command or its scripts, reads outside its folder or the task's files, writes outside the deliverable, network calls, changes to settings, permissions, memory or `maestro-packs.json`, installing, sending, dispatching an agent, or skipping a gate), maestro quotes the line to the user and waits. `SKILL.md` keeps the blanket untrusted-text rule, with that loaded pack as its one named exception.

The installer's lean profiles now install domain packs **switched off** instead of skipping them, so a fresh `--profile=engineering` install gets on-demand routing with no listing cost.

## Alternatives considered

| Option | Why it lost |
|---|---|
| Re-enable every pack globally | Puts the listing back over budget: descriptions drop for the least-used skills, so the domain skills that need routing are the ones Claude can no longer see described. Connector packs also bring dozens of MCP server entries. |
| Enable packs per project only | Works for known projects but not for a one-off marketing request in a code repository, and enabling mid-session needs a restart before the skills appear. Kept as the route for connector packs. |
| `skillOverrides` to hide descriptions | Does not apply to plugin skills; plugin visibility is managed only by enabling or disabling the plugin. |
| A hand-run one-liner and `grep` (the first draft of this design) | Read only the first line of a description, which for a block scalar is `description: >`; fell back to the newest cache folder when the record had no entry; and checked neither the routing table, managed settings, symlinks nor `disable-model-invocation`. |
| PyYAML for the frontmatter | Not in the standard library, and the helper runs from the plugin cache on machines whose only Python may be the macOS system 3.9 with no packages. |

## Trade-offs

- **Outside the Skill tool.** A pack read from disk gets no `allowed-tools` pre-approval, no `context: fork`, and none of that plugin's hooks; its instructions run under the session's normal permissions. The allow-list above is the counterweight. The lint pins it as a whole line, as it does the untrusted-text rule and the any-other-status rule, so a deleted clause or an appended exception both fail CI.
- **Internal file.** `installed_plugins.json` is Claude Code's own record and could change shape. The helper reads only the shape it knows and otherwise reports `unreadable` and loads nothing, so a Claude Code update can switch on-demand loading off until maestro catches up, visibly rather than wrongly.
- **Managed settings, partly.** Only file-based policy is visible to the helper. A block delivered only by an MDM profile, the Windows registry or server-managed settings is not seen; Claude Code enforces those for enabled plugins, not for a file maestro reads.
- **Drift.** The registry's routing table must name packs the installer really installs. `tests/skill-bundle-lint.py` now finds the heading exactly, fails any table row that yields no `plugin@marketplace` spec, and compares specs against the exact set `install.sh` installs (the third argument of each `install_plugin` call and each literal `claude plugin install`, comment lines skipped), so a substring such as `comms` for `pm-comms` no longer passes. `atlassian@claude-plugins-official` stays exempt by exact spec. The lint also fails when a script the registry names is missing, and `tests/test_find_pack.py` checks that the helper and the lint read the same specs from the real registry.

## Evidence

- All eleven domain packs switched off in v1.17.0 were still on disk with flat `skills/*/SKILL.md` layouts; two plugins name their version folders by commit hash, which is why the folder comes from the install record rather than a version sort (a sort picked a stale `example-skills` folder, the record the live one).
- The shortlist step, run against `marketing-skills` for "rewrite a landing page", returned `copywriting` and `copy-editing`.
- Block-scalar descriptions are now read. The first design's `grep -m1 '^description:'` printed only `description: >` for both `decision-making` skills; 28 of the 29 descriptions in `communication`, `decision-making`, `performance-management` (leadership-skills) and `social-media-skills` are block scalars. `find-pack.py decision-making@leadership-skills` reads both whole (807 and 600 characters) and prints each to the 500-character cap, and the helper lists all 6, 2, 4 and 17 skills of those four packs.
- On the maintainer's machine all 16 routed specs resolve to `found` (252 skills, none skipped, nothing on stderr), under the macOS system Python 3.9.6 and Python 3.14.
- The frontmatter parser agreed with PyYAML on every `name`, `description` and `disable-model-invocation` field of the 885 `SKILL.md` files in that plugin cache (1,799 fields, whitespace normalised; PyYAML used for the comparison only).
- Seventeen deliberately broken copies of the helper each failed the unit suite: no symlink skip, no cache containment, the managed block ignored, `disable-model-invocation` ignored or read with the old true-word test, a prefix match without a separator, the routing table not enforced, the install scope ignored, a missing record crashing, a block scalar read as its `>` indicator (the first draft's failure), no folder-name check, no shell-character check on the pack folder, an undefanged skill name, hidden-character categories ignored, the old comment regex, no walk for nested symlinks, and no description cap.
- The old comment pattern `[ \t]+#` took 4.7 s on one 64K line of blanks; the linear `[ \t]#` takes 0.5 ms.

## Files changed

- `skills/maestro/SKILL.md` — routing line names on-demand loading and project defaults; the untrusted-text rule covers all third-party skill text again, with a loaded domain pack as its one exception; the registry's read-when trigger includes unclear tasks
- `skills/maestro/scripts/find-pack.py`, `skills/maestro/scripts/pack_text.py` — the loader helper and its frontmatter and safe-printing module (new)
- `skills/maestro/references/skill-pack-registry.md` — Loading a pack through the helper, the allow-list, routing table, Project defaults
- `skills/maestro/references/ecosystem.md`, `README.md`, `CONTRIBUTING.md` — profile behaviour, the atlassian install line, per-project guidance, the unit-test command
- `install.sh`, `tests/install-smoke.sh` — dormant packs under `engineering` and `core`
- `tests/skill-bundle-lint.py`, `tests/skill-bundle-lint-smoke.sh` — exact routing guard, script check, whole-rule gate phrases
- `tests/test_find_pack.py`, `tests/test_find_pack_frontmatter.py`, `tests/find_pack_support.py`, `.github/workflows/test.yml` — the helper's unit tests, run in CI's manifests job
- `.gitignore` — `__pycache__/`
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — v1.18.0
