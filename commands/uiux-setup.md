---
description: Set up elattar-uiux-design in this project: commit hook, CI and config
allowed-tools: Bash(node:*), Read
---
Run `node "${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/checks/run.mjs" install` (no `--yes`: this is a dry run that only prints the plan).
Show the user exactly what it will write. Only after the user says yes, run it again with `--yes`.
If Playwright is missing, say the browser checks need it and offer the install command; install only on a yes.
Report what was installed in one short list.
