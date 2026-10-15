# Orchestration: doing a UI task fast

Fast and accurate: split the work, scope every check to what changed, run the complete run once.

| # | Rule | How |
|---|---|---|
| 1 | **Split by file ownership** | Independent pieces (separate components, pages, rules) go to parallel sub-agents, each on its own files. The main agent owns shared files (config, routing, shared tokens) and merges. |
| 2 | **Never two agents on one file** | If two pieces share a file, run them one after the other. |
| 3 | **While building, scope** | After each meaningful edit: `node <skill>/checks/run.mjs fast` (changed files plus their importers, seconds). Browser check only for the route being built and only the check the edit can affect: `run.mjs full --only contrast-rendered,keyboard --route /settings`. |
| 4 | **Review once** | A sub-agent's work is reviewed once. A small fix gets a scoped re-review of the fix only. |
| 5 | **Complete run once, at the end** | `run.mjs full` on every changed route (default: the changed pages plus `/`), then `shots` and the thirteen-rule review. `full --all --all-routes` is CI's job. |
| 6 | **Model choice** | A cheap, fast model for transcription-like work (moving markup, renaming, writing a state list). A stronger model only for design judgment and for reviewing risky changes. |

## Running against a real app

Browser checks need the app running: the dev server while iterating, the production build for `ux-flow` timing and for `runtime-errors` (prerender errors only appear there). Dev-tool overlays are ignored, a redirect is reported per route, and a signed-in page needs `auth.storageState` in `viewsonic-ui.config.json`; details in [../checks/map.md](../checks/map.md), "Real apps".

## Scope flags

| Flag | Meaning |
|---|---|
| `--changed` | Static checks scan files changed vs `HEAD` (staged, unstaged, untracked) plus files that import one of them. Default for `fast` in a git repo. A changed stylesheet or config means every file. |
| `--all` | Every file, every route. |
| `--route <r>` (repeatable) | Browser checks visit only these routes. |
| `--all-routes` | Every route in the config. |
| `--only a,b` | Run only these checks. |

Without `--route`, `full` visits the routes of changed page files plus `/`. Outside a git repo, everything runs. The first lines printed say what was scanned (`scope: …`, `routes: …`); read them, because a scoped run says nothing about the files it skipped.
