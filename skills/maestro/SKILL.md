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
- **`frontend-design` skill** (ships with Everything Claude Code, or any equivalent design-direction skill) — used by Step 5a/5b to generate a concrete design direction and mockup artefact **before** any production code is written. If unavailable, Step 5a/5b fall back to a manual design-direction write-up plus a hand-rolled HTML prototype.
- **UI UX Pro Max** is recommended (`npm i -g uipro-cli && uipro init --ai claude`) — 50+ design styles, 161 colour palettes, 99 UX guidelines; auto-activates on UI/UX-flavoured prompts and composes with Step 5's design-system checklist (the checklist remains the canonical gate; UI UX Pro Max suggestions are additive)
- **n8n-MCP** is recommended (`claude mcp add n8n-mcp -e MCP_MODE=stdio -e LOG_LEVEL=error -e DISABLE_CONSOLE_OUTPUT=true -- npx -y n8n-mcp`) — 400+ n8n workflow integrations accessible as MCP tools; surface only when the task involves building or debugging n8n workflows
- **VoiceMode MCP** is recommended (`claude mcp add --scope user voicemode -- uvx --refresh voice-mode`) — local Whisper STT + Kokoro TTS for voice conversations with Claude Code; requires mic/speakers and ~GB of local model downloads on first use
- **Everything Claude Code** is recommended (`git clone https://github.com/affaan-m/everything-claude-code.git && cd everything-claude-code && ./install.sh --target claude --profile full`) — 150+ skills, 47 agents, 79 commands, 16 rules across 12 language ecosystems; user-scope skills (lower trigger precedence than plugin-scope skills, so superpowers and maestro still win in competition)
- **LightRAG** is recommended (`uv tool install "lightrag-hku[api]"`) — graph+vector RAG Python library and REST server; optional supplement to Step 2 CONTEXT7 for codebases too large for Context7 alone. External service — a custom MCP bridge is required to surface it inside Claude Code (not yet shipped; out of scope here).
- **Andrej Karpathy Skills** is recommended (`claude plugin marketplace add forrestchang/andrej-karpathy-skills && claude plugin install andrej-karpathy-skills@karpathy-skills`) — Karpathy's 4 LLM-coding principles (think before coding, simplicity first, surgical changes, goal-driven execution); composes with maestro's engineering-mindset discipline as a second voice. No conflict with Step 3 BRAINSTORM or Step 7 IMPLEMENT — the Karpathy principles enforce discipline at the edit level; maestro enforces at the workflow level.

## Unified Flow

Every task follows this flow. Steps are skipped only when explicitly not applicable.

```
 1. CLASSIFY     → Determine task type and scope
 2. CONTEXT7     → Detect libraries → fetch current docs
 3. BRAINSTORM   → Invoke superpowers:brainstorming
 4. PLAN         → Invoke superpowers:writing-plans
 5. UI/UX GATE   → Generate design mockup → run design system checklist
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
| No frontend touched | Skip 5 (UI/UX gate + design mockup), skip visual verification in 8 |
| Component-level frontend tweak (className change, copy edit, prop rename) | Skip 5a–5c (mockup) and 5d (UI UX Pro Max refinement), still run 5e (checklist) |
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

**Optional supplement for very large codebases — LightRAG (if installed and wired via an MCP bridge):** For repos where Context7's scope is too narrow (e.g., proprietary frameworks, niche internal APIs), a running `lightrag-server` instance can provide a graph+vector RAG layer. As of v1.3.0 no off-the-shelf MCP bridge ships with maestro — the user must run `lightrag-server` and either query its REST API directly (via a scratch MCP shim) or use it outside the Claude Code loop. Treat LightRAG as an optional *external* service, not as a drop-in Context7 replacement.

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

## Step 5: UI/UX GATE & DESIGN MOCKUP

**Skip if:** No frontend files are touched.

**Trigger taxonomy** (see `references/frontend-design-trigger.md` for the full decision matrix):

| Frontend change type | 5a–5c Mockup? | 5e Checklist? |
|---|---|---|
| New surface (page, route, major component) | **Yes** | Yes |
| Significant redesign (layout shift, new states, new interaction model) | **Yes** | Yes |
| Style refresh of existing surface (palette, typography, spacing) | **Yes** | Yes |
| Component-level tweak (className change, copy edit, prop rename, prop drilling fix) | No | Yes |
| Bug fix without visual change | No | Yes |

If the table says "Yes" in column **5a–5c Mockup**, you MUST run substeps 5a–5c **before** Step 6. Do not proceed to SECURITY or IMPLEMENT until the user has approved the mockup.

---

### 5a. Generate design direction

Invoke the `frontend-design` skill (or `vercel:shadcn` + `vercel:react-best-practices` for component-level surfaces) to produce a concrete design direction:
- Style direction (editorial / brutalist / glass / luxury / Swiss / etc. — pick **one**, justify it)
- Palette (specific tokens, not vague colour names)
- Typography pairing (specific families and scale)
- Layout strategy (grid, bento, scrollytelling, sidebar+canvas, etc.)
- Motion language (when motion clarifies vs. when it distracts)

Reference at least 2 real precedents (existing pages in the same product, or external products) and explain why each is relevant.

### 5b. Generate mockup artefact

Produce a tangible artefact the user can eyeball **before** any production code is written. Pick the lightest form that conveys the design:

| Artefact | When to use | Where it lives |
|---|---|---|
| HTML prototype (single file, Tailwind via CDN) | New surfaces, redesigns, exploration | `proposed-*.html` in repo root or `docs/mockups/` |
| Annotated component sketch in markdown | Small new components | Inline in the plan |
| Existing-page screenshot + redline overlay | Refreshes of existing pages | Attached to the plan |
| Storybook story (if Storybook is configured) | Component-level work | Storybook's tree |

The mockup must show: hero state, loading state, empty state, error state, and at least one responsive breakpoint. **No placeholder lorem ipsum** — use realistic copy from the actual product domain.

### 5c. Mockup approval gate

Present the mockup to the user. Wait for explicit approval (`yes` / `go on` / `approved`). Iterate on feedback **without** writing production code.

**Do not skip this gate** even if the design feels obvious. If the user is in caveman mode and replies "yes", that is sufficient — but the gate must still be hit.

### 5d. UI UX Pro Max refinement (if installed)

If UI UX Pro Max is installed, invoke it to refine palette, typography, and style direction. Treat its suggestions as **additive** to 5a — the maestro checklist in 5e remains the canonical gate (accessibility, responsive, loading/error states, etc.). Consult UI UX Pro Max for *style and palette choices* (the 50+ styles and 161 palettes); do not let it override the checklist-level accessibility or state-coverage requirements.

### 5e. Run UI/UX checklist against the approved mockup

Read and run through `references/uiux-checklist.md` against the approved mockup (not against your imagination of the final UI).

**This is not optional for frontend work.** Every frontend change — even "just a small tweak" — gets checked against the design system.

**Key enforcement areas:**
- **Visual Design** — Tailwind tokens, spacing scale, typography, colour palette, dark mode
- **Accessibility (WCAG 2.1 AA)** — keyboard nav, focus, contrast, ARIA, semantic HTML, motion, touch targets
- **Component Patterns** — shadcn/ui, composition, loading/error/empty states, responsive
- **Performance** — CLS, image optimisation, client component boundaries, bundle impact

Flag any checklist violations against the mockup, fix the mockup, re-confirm with the user, then proceed to Step 6.

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
- **`frontend-design` skill missing** → Step 5a/5b still run, but as a manual design-direction write-up (style direction, palette, typography, layout strategy as prose) plus a hand-rolled single-file HTML prototype. The 5c approval gate is still mandatory — do not skip it just because the artefact is hand-rolled.
- **UI UX Pro Max missing** → Step 5d is skipped; 5a/5b/5c/5e still run. Style/palette suggestions come from `frontend-design` (or the manual fallback) alone; accessibility and responsive gates remain enforced via 5e.
- **n8n-MCP missing** → surface this only when a task actually involves n8n workflows; for any other task, it is irrelevant and its absence is silent.
- **VoiceMode MCP missing** → voice conversations unavailable; text workflow unchanged. Non-blocking for any coding task.
- **Everything Claude Code missing** → 150+ user-scope skills unavailable; maestro and superpowers skills still cover the workflow. No degradation of the 10-step flow itself.
- **LightRAG missing (or wired but no MCP bridge)** → Step 2 falls back to Context7 alone; skip the optional LightRAG supplement. No blocker for normal-sized codebases.
- **Andrej Karpathy Skills missing** → maestro's engineering-mindset discipline (from CLAUDE.md) remains in force; Karpathy-specific phrasing ("think before coding", "surgical changes") won't be explicitly cited but the underlying principles still apply. No gap in behaviour.

### When extended skill ecosystems are installed

If Everything Claude Code (or any future large skill-collection plugin) is installed alongside superpowers and maestro, be explicit about trigger precedence:

- **Plugin-scope skills** (e.g. `superpowers:*`, `maestro:*`, `vercel-plugin:*`) take precedence over user-scope skills in Claude Code's matcher.
- **User-scope skills** (anything in `~/.claude/skills/` without a plugin namespace, such as Everything Claude Code's 150+ skills) are advisory — they are available but do not override the maestro/superpowers workflow.
- When a user-scope skill appears more specialised than a maestro/superpowers one (e.g. `springboot-tdd` vs `superpowers:test-driven-development` for a Spring Boot task), use the more specialised one for domain-specific guidance but keep the maestro workflow skeleton.
- If a user-scope skill's name collides with a maestro/superpowers skill (e.g. ECC's `tdd-workflow` vs `superpowers:test-driven-development`), prefer the plugin-scope version — the user-scope one is an alternative voice, not a replacement.
