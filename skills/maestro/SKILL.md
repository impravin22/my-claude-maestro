---
name: maestro
description: Use at the start of every task — master orchestrator that classifies work, fetches live library docs via Context7, enforces engineering standards (OWASP, testing, UI/UX design system, British English, solution justification), and orchestrates superpowers skills in the correct order
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

**Skip logic determined here:**

| Classification | Steps to Skip |
|---------------|---------------|
| Trivial config/docs change | Skip 3–6, go straight to 7 (implement without TDD ceremony) |
| No frontend touched | Skip 5 (UI/UX gate) |
| Bug fix | Step 3 becomes `superpowers:systematic-debugging` instead of brainstorming |
| No libraries detected | Skip 2 (no Context7 calls) |
| Independent subtasks identified | Step 7 can use `superpowers:dispatching-parallel-agents` |

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

**For bug fixes:** Replace this step with `superpowers:systematic-debugging` — diagnose the root cause before proposing any fix.

---

## Step 4: PLAN

Invoke `superpowers:writing-plans` to create a detailed implementation plan.

**Maestro additions on top of planning:**
- The plan must reference specific APIs from the Context7 docs (not guessed signatures)
- If frontend work is included, the plan must note which UI/UX checklist items apply
- If security-sensitive (auth, input handling, LLM calls), the plan must note which security checklist items apply
- Every plan must include a testing strategy section

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

After creating the PR, enter the **PR review loop**:

1. Poll GitHub every 4 minutes using `gh pr checks` and `gh api` to read review comments
2. If the review has **any** issues (suggestions, warnings, nits, dead code findings, errors):
   - Fix them
   - Commit and push
   - Continue polling
3. Only stop when the review is **fully clean** — approved with zero outstanding comments
4. Report the final clean status to the user

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

### When Skills Are Unavailable

If a superpowers skill cannot be invoked (plugin not installed, skill not found):
- **Do not skip the step.** Perform the equivalent manually.
- Brainstorming → ask clarifying questions, propose 2–3 approaches, get approval
- Writing-plans → write a numbered implementation plan
- TDD → write tests before implementation code
- Verification → run all quality gate commands manually
- Note the missing skill in your response so the user can install it
