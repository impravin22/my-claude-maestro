# Evals

Ten prompts written the way a real user writes them, each with objective assertions in [evals.json](evals.json) (skill-creator's `expectations` field) and a scored review in [rubric.md](rubric.md).

| # | Name | Layer it exercises |
|---|---|---|
| 1 | settings-page | sections, destructive confirm, save feedback |
| 2 | form-server-validation | server errors, preserved input |
| 3 | list-detail | selection, responsive collapse |
| 4 | dashboard-data-table | skeletons, sort, no-results |
| 5 | empty-first-run | empty state copy and action |
| 6 | async-action-feedback | busy, success, failure, retry |
| 7 | animated-disclosure | motion tokens, reduced motion |
| 8 | fix-light-mode | contrast with existing tokens |
| 9 | failed-data-call | human failure message, never the raw error |
| 10 | creative-direction | user direction wins, no `patterns/` loaded |

## Run all with skill-creator

1. Make a throwaway project with the ViewSonic foundation installed (tokens, components, `viewsonic-ui.config.json`), as a worktree made by hand from the current branch.
2. Load `skill-creator:skill-creator`, point it at this skill, and run each eval twice in the same turn: **with-skill** (plugin enabled) and **without-skill** (baseline, no plugin).
3. Grade every run: script the checkable assertions, have a grader agent score [rubric.md](rubric.md) from the screenshots.
4. Aggregate into a benchmark and review it in the skill-creator viewer. Pass = all objective assertions plus rubric >= 85%.

## Run one eval headlessly

Inside a fresh project that has the foundation installed:

```
claude -p "<prompt from evals.json>" --plugin-dir <path to plugins/elattar-uiux-design> --model sonnet
```

Save the transcript (add `--output-format stream-json --verbose`) so the design-pass block, the screenshot review and the final summary can be checked. For the baseline, run the same command without `--plugin-dir`.

## Results

| Date | Eval | With skill (objective / rubric) | Without skill | Notes |
|---|---|---|---|---|

Pending: filled after the first eval run.
