# Quality Gates

Every task must pass these gates before claiming completion. Run through this checklist at the VERIFY step.

---

## Testing

- [ ] **Tests written** — every code change ships with tests; no exceptions
- [ ] **Python tests passing** — `uv run pytest tests/ -v` exits clean
- [ ] **TypeScript tests passing** — `npx vitest run` exits clean
- [ ] **Coverage adequate** — happy paths, error cases, boundary conditions, and null/undefined handling covered
- [ ] **Security tests included** — injection attempts, unauthorised access, malformed input tested where applicable
- [ ] **Tests are runnable** — no placeholder assertions, no TODO comments, no skipped tests without justification

## Linting

- [ ] **Python lint clean** — `uv run ruff check --fix .` reports no errors
- [ ] **Python format clean** — `uv run ruff format --check .` reports no changes needed (CI enforces this)
- [ ] **TypeScript lint clean** — `npm run lint` reports no errors
- [ ] **TypeScript types clean** — `npx tsc --noEmit` exits with zero errors

## Code Quality

- [ ] **Type annotations** — all new functions have full type annotations (Python type hints, TypeScript types)
- [ ] **No `any` types** — TypeScript code uses specific types, never `any`
- [ ] **snake_case for API fields** — TypeScript API interfaces use `snake_case` to match backend FastAPI
- [ ] **Descriptive naming** — no abbreviations unless universally understood; clear, descriptive identifiers
- [ ] **No magic values** — constants named and explained; no unexplained numbers or strings
- [ ] **Imports verified** — all new imports exist, function signatures match, types are consistent
- [ ] **No regressions** — re-read changed code once more; check for logical errors, off-by-one mistakes, edge cases

## Solution Justification

- [ ] **Why this approach** — reasoning documented (performance, readability, maintainability, correctness, or pattern alignment)
- [ ] **Alternatives considered** — at least 2 alternative approaches listed
- [ ] **Alternatives rejected with reason** — each alternative has a concrete downside explained
- [ ] **Trade-offs stated** — any downsides of the chosen approach acknowledged upfront

## Style & Language

- [ ] **British English** — all prose, comments, commit messages, and documentation use British English spelling
- [ ] **Google style guides** — code follows Google Python Style Guide or Google TypeScript Style Guide
- [ ] **Commit messages** — conventional format: `fix:`, `feat:`, `refactor:`, `docs:`, `style:`, `test:`

## Visual Verification (Frontend Changes Only — Requires Playwright MCP)

- [ ] **Dev server running** — local dev server confirmed running before visual checks
- [ ] **Affected routes render** — every changed/added route loads without console errors
- [ ] **Interactive elements work** — buttons, forms, toggles, and navigation behave as expected
- [ ] **Responsive behaviour** — verified at 375px (mobile), 768px (tablet), 1280px (desktop) if layout changed
- [ ] **Accessibility tree** — no missing labels, broken focus order, or absent ARIA attributes detected via Playwright
- [ ] **Screenshots captured** — before/after screenshots taken for visually significant changes

## PR Specialist Review (Requires PR Review Toolkit)

- [ ] **Code review clean** — `pr-review-toolkit:code-reviewer` reports no guideline violations
- [ ] **No silent failures** — `pr-review-toolkit:silent-failure-hunter` reports no swallowed errors or inappropriate fallbacks
- [ ] **Test coverage adequate** — `pr-review-toolkit:pr-test-analyzer` reports no critical gaps
- [ ] **Code simplified** — `pr-review-toolkit:code-simplifier` applied where complexity was flagged (if applicable)
- [ ] **Type design sound** — `pr-review-toolkit:type-design-analyzer` approves new types (if applicable)
- [ ] **Comments accurate** — `pr-review-toolkit:comment-analyzer` confirms comment accuracy (if applicable)

## Memory (Optional — Requires claude-mem)

- [ ] **Observations captured** — claude-mem's `PostToolUse` and `Stop` hooks have written the session's key decisions, rejected approaches, and verification outcomes to the SQLite store so future sessions can retrieve them via `search` / `timeline` / `get_observations`
- [ ] **Hooks healthy** — claude-mem worker responds on `127.0.0.1:37777`; MCP server `claude-mem` appears under `/mcp` in Claude Code
- [ ] **No regressions in memory hooks** — if any edit modified `~/.claude/settings.json` or `~/.claude-mem/`, the five lifecycle hooks still fire correctly

## Extended Plugin Ecosystem (Optional — if the respective plugins are installed)

- [ ] **n8n-MCP healthy** — `claude mcp list | grep n8n-mcp` shows a running server (skip if n8n workflows are not in scope for this task)
- [ ] **VoiceMode healthy** — `claude mcp list | grep voicemode` shows a running server (skip unless voice conversations are being used)
- [ ] **UI UX Pro Max precedence honoured** — for UI/UX tasks, the `references/uiux-checklist.md` gate was applied before UI UX Pro Max style suggestions; style/palette choices are additive, not a replacement for accessibility/responsive/state-coverage gates
- [ ] **Skill collision review** — if Everything Claude Code is installed, confirm no user-scope skill fired ahead of a maestro/superpowers skill; prefer plugin-scope skills for the canonical workflow
- [ ] **LightRAG supplement** — if queried, the retrieved context was cross-checked against Context7's current-version docs (Context7 wins on API freshness when they disagree)

## Git Workflow

- [ ] **On a branch** — changes are on a feature branch, not `main`
- [ ] **PR created** — pull request created with clear title and description
- [ ] **Never pushed to main** — verified changes are not on `main` branch

## DSPy-Specific (When Applicable)

- [ ] **configure_dspy()** — called at start of any function using DSPy modules (idempotent)
- [ ] **LM singletons** — using `get_dspy_fast_lm()`, `get_dspy_creative_lm()`, `get_dspy_validation_lm()`
- [ ] **dspy.context(lm=...)** — per-call LM overrides use context manager
- [ ] **dspy.asyncify(module)** — sync DSPy modules wrapped for async endpoints
- [ ] **Module singletons** — DSPy module instances at module scope, never per-request
- [ ] **ChainOfThought kept** — not switched to Predict unless explicitly requested
