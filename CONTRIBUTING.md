# Contributing to Maestro

Thanks for considering a contribution. Maestro is a Claude Code plugin with an unusual constraint set — this document is short, but every rule in it exists because CI or a real user will catch you otherwise.

## Development setup

```bash
git clone https://github.com/impravin22/my-claude-maestro.git
cd my-claude-maestro
```

There is no build step. The plugin payload is `skills/maestro/` + `hooks/` + the two manifests in `.claude-plugin/`. To try your changes locally, add the repo as a local marketplace:

```
/plugin marketplace add /path/to/my-claude-maestro
/plugin install maestro@impravin22
```

## The rules that will actually bite you

### 1. bash 3.2 is the floor

macOS ships bash 3.2.57, and under `set -u` it treats an empty array as unset — expanding one aborts the script. That bug class is why the macOS CI leg exists and why `tests/install-smoke.sh` launches the installer via `"$BASH"` rather than a bare `bash`. Do not use bash 4+ features (associative arrays, `${var,,}`, `readarray`) in `install.sh` or anything it sources, and do not drop the macOS CI leg for being slow — it is the only leg where the regression reproduces.

### 2. Test loop

```bash
bash tests/install-smoke.sh
```

The suite is hermetic: it stubs `claude`, `node`, `npx` and `curl` onto `PATH`, runs the installer in `--dry-run`, and installs nothing. Lint with:

```bash
shellcheck -S warning -e SC2294 install.sh
shellcheck -S warning tests/install-smoke.sh
```

`SC2294` is excluded deliberately — `install.sh` carries one documented `eval "$@"` invariant. Do not widen the exclusion list or lower the severity floor.

### 3. SKILL.md stays lean

`skills/maestro/SKILL.md` loads on **every task** — it is a recurring context tax on every user. Rare-path detail lives in `skills/maestro/references/` and is read only when that path fires. If you add words to `SKILL.md`, the PR description must say why the rule is every-task material and which existing words it displaces. New checklists, tables and install commands go in `references/`, full stop.

### 4. Version bumps land in the PR

A release-worthy change bumps the version in **both** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, plus any README prose that names the version. The `manifests parse` CI job fails the PR if the two manifests disagree. Tagging happens after merge — see [RELEASING.md](RELEASING.md).

### 5. Conventional commit titles

PRs are squash-merged and the PR title becomes the commit subject and the release-notes line. Use `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `ci:`, `chore:` — with the version suffix when the PR bumps one, e.g. `fix(install): assert HOME in preflight (v1.12.1)`.

### 6. Root files and the README tree

If you add, rename or remove a root-level file, update the `Plugin Structure` tree in `README.md`. It is user-facing and drifts silently otherwise.

### 7. Do not rename `ci-ok`

Branch protection requires a status check literally named `ci-ok` (the aggregator job in `.github/workflows/test.yml`). Renaming it leaves every PR waiting forever on a check that will never report. Adding a job to `test.yml` means adding it to `ci-ok`'s `needs:` list — a job left out of that list is invisible to branch protection.

## Style

- Bash: `set -euo pipefail`, shellcheck-clean at `-S warning`.
- Prose (README, docs, comments): British English — "artefact", "licence", "colour".
- Markdown checklists and references: keep the existing register; comments explain *why*, never *what*.

## Proposing larger changes

Open a [Discussion](https://github.com/impravin22/my-claude-maestro/discussions) before building anything that adds a workflow step, a new gate, or a new upstream dependency. Maestro's value is discipline, and discipline survives by staying small — expect "does this earn its hot-path tokens?" as the first question.

## Security issues

Never open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).
