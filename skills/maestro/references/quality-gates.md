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
