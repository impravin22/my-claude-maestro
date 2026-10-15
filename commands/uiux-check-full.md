---
description: Full check: everything in check plus the browser checks (contrast as rendered, motion, rhythm, emphasis, layout shift, keyboard, UX) on the changed routes
argument-hint: "[base URL, default http://localhost:3000]"
allowed-tools: Read
---
Make sure the app is running at $ARGUMENTS (or http://localhost:3000); if not, tell the user how to start it and stop.
Run `node "${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/checks/run.mjs" full --base <url>`. It checks the routes of the changed pages plus "/".
For every route in the project, run it with `--all --all-routes` instead, when the user asks.
Report GOOD/BAD/SKIPPED counts, then each BAD with its fix. A SKIPPED check is never reported as passing.
Do not change any file.
