---
name: maestro
description: Use at the start of every task — master orchestrator that classifies work, fetches live library docs via Context7, enforces layered security (OWASP checklists + real-time edit scanning via Security Guidance), visual verification via Playwright MCP, deep PR review with specialist agents (PR Review Toolkit), and orchestrates superpowers skills in the correct order
---

# Maestro — Master Orchestrator

A single unified workflow for every task. Classify, gather context, plan, implement, verify, ship.

<HARD-GATE>
You MUST run through this orchestration flow at the start of every task. No exceptions. No shortcuts. Speed is never an excuse to skip discipline.
</HARD-GATE>

## Prerequisites

Before using this skill, ensure:
- **superpowers plugin** is installed (provides brainstorming, writing-plans, TDD, debugging, verification, finishing-a-development-branch)
- **Context7 MCP** is configured (`npx ctx7 setup --claude`) for live documentation fetching
- **Vercel plugin** is recommended (provides shadcn and react-best-practices skills for frontend work)
- **Security Guidance plugin** is recommended (`/plugin install security-guidance@anthropic`) — adds real-time pre-edit security scanning as a hook
- **PR Review Toolkit plugin** is recommended (ships with Claude Code) — provides 6 specialist review agents for deep PR analysis
- **Playwright MCP** is recommended (`npx @anthropic-ai/claude-code mcp add playwright -- npx @anthropic-ai/mcp-playwright`) — enables visual verification of frontend changes
- **claude-mem plugin** is recommended (`npx claude-mem install`) — persistent cross-session memory via 5 lifecycle hooks (SessionStart/UserPromptSubmit/PostToolUse/Stop/SessionEnd) and 3 MCP tools (`search`, `timeline`, `get_observations`); enables maestro to surface prior observations during CLASSIFY, BRAINSTORM, and PLAN

## Unified Flow

Every task follows this flow. Steps are skipped only when explicitly not applicable.

```
 1. CLASSIFY     → Determine task type and scope
 2. CONTEXT7     → Detect libraries → fetch current docs
 3. BRAINSTORM   → Invoke superpowers:brainstorming
 4. PLAN         → Invoke superpowers:writing-plans
 5. UI/UX GATE   → Run design system checklist
 6. SECURITY     → Run OWASP + LLM security checklist
 7. IMPLEMENT    → Invoke superpowers:test-driven-development
 8. VERIFY       → Invoke superpowers:verification-before-completion
 9. FINISH       → Invoke superpowers:finishing-a-development-branch
10. REVIEW       → PR review loop until clean approval
```

---

## Step 1: CLASSIFY

Determine the task type and scope before doing anything else.

**Ask yourself:**
- What type of task is this? (feature, bug fix, refactor, config change, documentation, UI-only)
- What parts of the codebase are affected? (frontend, backend, full-stack, infrastructure)
- Is this trivial (one-line config, comment fix) or non-trivial?
- Are there libraries/frameworks involved that I need current docs for?

**Output:** A one-line classification statement, e.g.:
> "Feature: full-stack — adding OKR alignment suggestions. Involves: Next.js (frontend), FastAPI + DSPy (backend). Non-trivial."

**Memory-assisted classification (if claude-mem is available):**

Before locking in the classification, query prior observations to avoid re-deriving context that already exists:

1. Call the `search` MCP tool with keywords from the user's request (feature name, affected file paths, library names)
2. Call `timeline` for the affected project path if recent activity may be relevant
3. Weave any high-signal prior observations into the classification statement — surfacing the **raw observation text** (no paraphrasing) so the user can eyeball relevance. Example: "Feature: full-stack OKR alignment suggestions. Prior observation (2026-03-20): user rejected a DSPy-based retriever due to 4× latency — favour cached retrieval."

If claude-mem is unavailable, skip this substep and proceed with the classification from the user's current request alone.

**Skip logic determined here:**

| Classification | Steps to Skip |
|---------------|---------------|
| Trivial config/docs change | Skip 3–6, go straight to 7 (implement without TDD ceremony) |
| No frontend touched | Skip 5 (UI/UX gate), skip visual verification in 8 |
| Bug fix | Step 3 becomes `superpowers:systematic-debugging` instead of brainstorming |
| No libraries detected | Skip 2 (no Context7 calls) |
| Independent subtasks identified | Step 7 can use `superpowers:dispatching-parallel-agents` |
| No dev server running | Skip visual verification (Playwright) in step 8 |
| No new types introduced | Skip `type-design-analyzer` in step 10 |
| No comments added/modified | Skip `comment-analyzer` in step 10 |

---

## Step 2: CONTEXT7 — Fetch Live Documentation

**Purpose:** Ensure you plan and code against *current* API documentation, not stale training data.

**Process:**

1. From the classification, identify all libraries/frameworks involved in this task
2. For each library, resolve its Context7 ID:
   - Use Context7's `resolve-library-id` tool (or `ctx7 library <name>`)
3. For each resolved library, fetch relevant documentation:
   - Use Context7's `query-docs` tool with a query specific to the current task
   - Focus the query on the APIs/features you'll actually use, not the entire library
4. Hold the fetched docs in context — they inform brainstorming, planning, and implementation

**Example:**
```
Task: "Add server-side pagination to the OKR list endpoint"
Libraries detected: FastAPI, SQLAlchemy, TanStack Query
→ resolve-library-id("fastapi") → fetch docs for "pagination query parameters"
→ resolve-library-id("sqlalchemy") → fetch docs for "limit offset pagination"
→ resolve-library-id("tanstack-query") → fetch docs for "useInfiniteQuery pagination"
```

**If Context7 is unavailable:** Note it and proceed — do not block the workflow. Use your training knowledge but flag that docs were not verified against the latest version.

---

## Step 3: BRAINSTORM

Invoke `superpowers:brainstorming` to explore the idea before committing to an approach.

**Maestro additions on top of brainstorming:**
- Reference the Context7 docs fetched in step 2 when evaluating approaches
- Ensure every proposed approach includes a **solution justification**:
  1. Why this approach is best
  2. At least 2 alternatives considered
  3. Why each alternative was rejected (concrete downsides)
  4. Trade-offs of the chosen approach acknowledged upfront
- Apply **self-critique**: after designing a solution, find at least 2 weaknesses before presenting
- Perform **impact analysis**: what WILL this change? What WON'T? What could break?
- **Memory lookup (if claude-mem available)** — before proposing approaches, call `get_observations` scoped to similar prior work (same library, same feature area). Surface any rejected approaches and their concrete failure reasons. Do not re-propose a previously rejected approach unless the rejection reason no longer applies (state why explicitly).

**For bug fixes:** Replace this step with `superpowers:systematic-debugging` — diagnose the root cause before proposing any fix.

---

## Step 4: PLAN

Invoke `superpowers:writing-plans` to create a detailed implementation plan.

**Maestro additions on top of planning:**
- The plan must reference specific APIs from the Context7 docs (not guessed signatures)
- If frontend work is included, the plan must note which UI/UX checklist items apply
- If security-sensitive (auth, input handling, LLM calls), the plan must note which security checklist items apply
- Every plan must include a testing strategy section
- **Plan reuse (if claude-mem available)** — call `search` for prior plans with similar scope (e.g., "pagination endpoint", "OKR checkin migration"). If a close structural match exists, reuse the proven plan skeleton and cite the prior plan in the justification — do not duplicate planning work the user has already approved.

---

## Step 5: UI/UX GATE

**Skip if:** No frontend files are touched.

Read and run through `references/uiux-checklist.md` against the planned changes.

**This is not optional for frontend work.** Every frontend change — even "just a small tweak" — gets checked against the design system.

**Key enforcement areas:**
- **Visual Design** — Tailwind tokens, spacing scale, typography, colour palette, dark mode
- **Accessibility (WCAG 2.1 AA)** — keyboard nav, focus, contrast, ARIA, semantic HTML, motion, touch targets
- **Component Patterns** — shadcn/ui, composition, loading/error/empty states, responsive
- **Performance** — CLS, image optimisation, client component boundaries, bundle impact

**Also invoke** `vercel:shadcn` and `vercel:react-best-practices` skills if the Vercel plugin is available.

Flag any checklist violations in the plan and resolve them before proceeding to implementation.

---

## Step 6: SECURITY

Read and run through `references/security-checklist.md` against the planned changes.

**This applies to every task that touches:**
- API endpoints or middleware
- User input handling
- Database queries
- LLM calls (input sanitisation, output scanning)
- Authentication or authorisation
- File uploads or external data processing

Flag any checklist violations in the plan and resolve them before proceeding to implementation.

### Layered Defence with Security Guidance

Maestro provides **two layers** of security enforcement:

1. **Planning-time** (this step) — the security checklist catches architectural and design-level security issues *before* code is written
2. **Edit-time** (Security Guidance plugin) — a pre-edit hook that automatically scans every code change for common vulnerability patterns in real-time

**If the Security Guidance plugin is installed**, it runs automatically on every file edit. It detects:
- Command injection (`os.system()`, `subprocess` with shell=True, `child_process.exec()`)
- Code injection (`eval()`, `Function()` constructor, `vm.runInNewContext()`)
- XSS vectors (`dangerouslySetInnerHTML`, unsanitised template literals)
- Insecure deserialisation (`pickle.loads()`, `yaml.load()` without SafeLoader)
- Hardcoded secrets (API keys, tokens, passwords in source code)

When a vulnerability is detected, the hook shows a warning with remediation advice *before* the edit is applied. This catches issues that pass checklist review but appear during implementation.

**If the Security Guidance plugin is not installed:** This step still functions via the checklist alone. Note the missing plugin in your response so the user can install it for real-time protection.

---

## Step 7: IMPLEMENT

Invoke `superpowers:test-driven-development` to write tests first, then implementation.

**Maestro additions on top of TDD:**
- Use the Context7 docs from step 2 when writing code — do not guess API signatures
- Follow **Google style guides** strictly (Python and TypeScript)
- **British English** in all prose, comments, commit messages, and documentation
- Type annotations everywhere (Python type hints, TypeScript types)
- No `any` types in TypeScript — use specific types
- `snake_case` for API interface fields (match backend FastAPI)
- Every test file must include security-focused tests where applicable

**For independent subtasks:** Use `superpowers:dispatching-parallel-agents` or `superpowers:subagent-driven-development` to parallelise work.

---

## Step 8: VERIFY

Invoke `superpowers:verification-before-completion`.

**Then run through `references/quality-gates.md`:**

- [ ] Tests written and passing (pytest for Python, Vitest for TypeScript)
- [ ] Lint clean: `ruff check --fix .` (Python) / `npm run lint` (TypeScript)
- [ ] Format clean: `ruff format --check .` (Python) / `npx prettier --check .` (TypeScript)
- [ ] TypeScript clean: `npx tsc --noEmit` (zero errors)
- [ ] Solution justification documented (why, alternatives, trade-offs)
- [ ] British English verified in all new prose
- [ ] Imports verified — all exist, signatures match
- [ ] No regressions — read changed code once more before committing

### Visual Verification with Playwright

**Skip if:** No frontend files are touched, or no dev server is running.

When frontend changes are involved and Playwright MCP is available, perform visual verification:

1. **Ensure a dev server is running** — if not, suggest the user starts one (`npm run dev` or equivalent). Do not start one silently.
2. **Navigate to affected routes** — use Playwright to open each route that was changed or added
3. **Verify visual rendering** — check that the page renders without errors, layout is correct, and no elements are broken
4. **Test interactive elements** — click buttons, fill forms, toggle states that were changed
5. **Check responsive behaviour** — verify at key breakpoints (375px mobile, 768px tablet, 1280px desktop) if layout changes were made
6. **Verify accessibility** — use Playwright's accessibility tree to check for missing labels, broken focus order, or missing ARIA attributes
7. **Take screenshots** — capture before/after screenshots for the PR description if the change is visually significant

**If Playwright MCP is not available:** Skip visual verification. Note the missing tool in your response so the user can install it. The remaining quality gates (tests, lint, types) still apply.

**Do NOT claim work is done until every applicable gate passes.**

---

## Step 9: FINISH

Invoke `superpowers:finishing-a-development-branch`.

**Maestro rules:**
- **Never push directly to main.** Always create a branch and PR.
- Commit messages use conventional format: `fix:`, `feat:`, `refactor:`, `docs:`, `style:`, `test:`
- Git operations are auto-approved — do not ask for confirmation to commit, push, or create PRs.

---

## Step 10: REVIEW

After creating the PR, run a **two-phase review process**: specialist agent analysis followed by the PR review polling loop.

### Phase 1: Specialist Agent Analysis (PR Review Toolkit)

Dispatch the relevant specialist agents from the PR Review Toolkit in parallel. Select agents based on what the PR contains:

| Agent | When to Dispatch | What It Checks |
|-------|-----------------|----------------|
| `pr-review-toolkit:code-reviewer` | **Always** | Adherence to project guidelines, style, patterns |
| `pr-review-toolkit:silent-failure-hunter` | **Always** — any PR can introduce silent failures | Swallowed errors, empty catch blocks, inappropriate fallbacks, missing error propagation |
| `pr-review-toolkit:pr-test-analyzer` | **Always** | Test coverage gaps, missing edge cases, critical untested paths |
| `pr-review-toolkit:code-simplifier` | When implementation is complex or touches multiple files | Unnecessary complexity, redundant code, simplification opportunities |
| `pr-review-toolkit:type-design-analyzer` | When new types/interfaces are introduced | Type encapsulation, invariant expression, design quality |
| `pr-review-toolkit:comment-analyzer` | When docstrings or documentation comments are added/modified | Comment accuracy, staleness risk, maintainability |

**Process:**
1. Determine which agents are relevant based on the PR diff
2. Dispatch all relevant agents **in parallel** using the Agent tool
3. Collect findings from all agents
4. Fix any issues flagged by the agents — commit and push
5. Re-run any agents whose scope was affected by the fixes (if needed)

### Phase 2: PR Review Polling Loop

After specialist analysis is clean, enter the external review loop:

1. Poll GitHub every 4 minutes using `gh pr checks` and `gh api` to read review comments
2. If the review has **any** issues (suggestions, warnings, nits, dead code findings, errors):
   - Fix them
   - Commit and push
   - Continue polling
3. Only stop when the review is **fully clean** — approved with zero outstanding comments
4. Report the final clean status to the user

### When PR Review Toolkit Is Unavailable

If the PR Review Toolkit agents are not available, skip Phase 1 and proceed directly to Phase 2 (the polling loop). Note the missing toolkit in your response.

---

## Orchestration Rules

### Always Enforce (Every Task)

1. **Plan first** — never write code without a plan (exception: trivial one-liners)
2. **Tests are mandatory** — every code change ships with tests, no exceptions
3. **Solution justification** — every approach must explain why, alternatives, and trade-offs
4. **British English** — in all responses, comments, commits, and documentation
5. **Security-first** — assume all input is hostile, validate at every boundary
6. **Never push to main** — always branch + PR

### Self-Critique Protocol

After designing any solution, before presenting it:
1. Ask "what's wrong with this?" — find at least 2 weaknesses
2. State the impact of each weakness
3. Explain why the approach is still the best option despite them (or revise)

### Context7 Protocol

- Fetch docs **before** brainstorming, not during implementation
- Focus queries on the specific APIs needed, not entire library docs
- If Context7 returns nothing useful, note it and proceed with training knowledge
- Always flag when you're using training knowledge vs. verified current docs

### When Skills or Plugins Are Unavailable

If a superpowers skill cannot be invoked (plugin not installed, skill not found):
- **Do not skip the step.** Perform the equivalent manually.
- Brainstorming → ask clarifying questions, propose 2–3 approaches, get approval
- Writing-plans → write a numbered implementation plan
- TDD → write tests before implementation code
- Verification → run all quality gate commands manually
- Note the missing skill in your response so the user can install it

If a recommended plugin is unavailable, the workflow degrades gracefully:
- **Security Guidance missing** → Step 6 still enforces security via the checklist; no real-time edit scanning
- **Playwright MCP missing** → Step 8 skips visual verification; tests, lint, and type checks still apply
- **PR Review Toolkit missing** → Step 10 skips Phase 1 (specialist agents); Phase 2 (polling loop) still runs
- **claude-mem missing** → Steps 1/3/4 skip the memory-lookup substeps; the workflow proceeds using only the current request. Note the missing plugin in your response so the user can install it for cross-session continuity.
