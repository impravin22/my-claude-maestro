---
description: Design review of a page: screenshots in both themes and both sizes, judged against every design, content, accessibility and UX rule
argument-hint: "<route, e.g. /settings>"
allowed-tools: Read
---
Load the `elattar-uiux-design` skill's Review step. If no route was given in $ARGUMENTS, ask which one.
Run `node "${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/checks/run.mjs" shots $ARGUMENTS` (add `--base <url>` if the app is not at the configured address; in Git Bash on Windows prefix `MSYS_NO_PATHCONV=1` so `/route` is not rewritten; a route may carry a query, e.g. `"/settings?state=empty"`) and review the slices it lists (viewport-tall pieces; the full-page file is only for the overall shape).
Judge each rule in `rules/foundations.md`, `rules/secondary.md`, `rules/content.md`, `rules/accessibility.md` and `rules/ux.md` using its "Judge it" question: one line per rule, PASS or what is wrong and the fix.
Do not change any file unless the user asks.
