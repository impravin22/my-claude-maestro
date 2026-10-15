---
description: Fast design-system check: tokens, rules, references, contrast, content, UX (no browser), on changed files
allowed-tools: Read
---
Run `node "${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/checks/run.mjs" fast --changed`. It checks only the files changed since HEAD plus the files that import them.
For a complete scan of the whole project, run it with `--all` instead, when the user asks.
Show the last summary line, then each BAD as: file:line, what is wrong, the fix.
Do not change any file. If everything is GOOD, say so in one line.
