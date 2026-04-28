# Frontend Design Trigger — Decision Matrix for Step 5

This reference governs when Step 5 runs the **design mockup substeps (5a–5c)** versus when it only runs the **checklist substep (5e)**. Owned by maestro Step 5; survives plugin version bumps because the canonical truth lives here, not inside the prose of `SKILL.md`.

---

## Goal

Stop maestro from shipping production frontend code without an approved visual artefact for any change that would surprise the user when they see the result. The mockup gate exists because:

1. Engineers (and LLMs) tend to under-estimate how much visual judgement a change requires
2. A throwaway HTML prototype is cheaper to iterate than a real Next.js page wired to real APIs
3. The user's "yes that's right" before code is written prevents the entire post-implementation rework loop

---

## Trigger Matrix

| Change type | 5a Direction | 5b Mockup | 5c Approval | 5d UI UX Pro Max | 5e Checklist |
|---|---|---|---|---|---|
| **New surface** — new page, route, or major component | Yes | Yes | Yes | If installed | Yes |
| **Significant redesign** — layout shift, new states, new interaction model on existing surface | Yes | Yes | Yes | If installed | Yes |
| **Style refresh** — palette change, typography overhaul, spacing rework on existing surface | Yes | Yes | Yes | If installed | Yes |
| **New variant of existing component** — new size/intent of an existing button, card, modal | Yes (light) | Yes (sketch ok) | Yes | Optional | Yes |
| **Component-level tweak** — className change, copy edit, prop rename, prop drilling fix | No | No | No | No | Yes |
| **Bug fix without visual change** — unbreak existing visual behaviour | No | No | No | No | Yes |
| **A11y-only fix** — add aria-label, fix focus order, fix contrast | No | No | No | No | Yes |
| **Test-only change** — add Vitest, Playwright, or Storybook coverage with no UI change | No | No | No | No | No |

If the answer is ambiguous, default to **Yes**. The user can always say "skip the mockup, just code it" — but the default must be safe.

---

## Substep Definitions

### 5a — Design direction

A short prose write-up that locks in:

- **Style direction** — pick exactly one (editorial, brutalist, glass, luxury, Swiss, scrollytelling, bento, retro-futurism, etc.). Do not write "clean minimal" — that is a non-direction.
- **Palette** — concrete tokens, not vague colour words. Use `oklch(...)` or hex with a justification per colour. Reference the project's existing palette tokens before introducing new ones.
- **Typography pairing** — specific families, weights, and the type scale (`h1: 48/52`, `p-md: 16/22`, etc.).
- **Layout strategy** — grid, bento, sidebar+canvas, scrollytelling, magazine.
- **Motion language** — what motion is for (clarification, hierarchy, delight) and what motion is **not** for (decoration, distraction).
- **At least 2 precedents** — existing pages in the same product or external products. Explain why each is relevant.

This lives in the plan from Step 4, not in a separate file — it must be visible to the user when they approve the mockup.

### 5b — Mockup artefact

A tangible thing the user can eyeball **before** any production code is written.

| Artefact | Use when | File location |
|---|---|---|
| **Single-file HTML prototype** with Tailwind CDN + realistic copy | New surface, significant redesign, style refresh | `proposed-<feature>.html` in repo root or `docs/mockups/<feature>.html` |
| **Annotated component sketch** in markdown (ASCII layout + copy + state list) | Small new components, new variants | Inline in the Step 4 plan |
| **Existing-page screenshot + redline overlay** | Refreshes of pages where the existing layout is mostly preserved | Attached to the plan, stored in `docs/mockups/<feature>/` |
| **Storybook story** | Component-level work in a project with Storybook configured | Storybook's tree, not a one-off file |

**Mandatory contents** of the mockup:

- Hero state (the default rendered state)
- Loading state (skeleton or spinner)
- Empty state (no data)
- Error state (failure UI with the actual error copy that will be shown)
- At least one responsive breakpoint (mobile if the design changes between breakpoints)
- Realistic copy from the actual product domain — **no lorem ipsum**

If the artefact is an HTML prototype, it must render in a browser without a build step (Tailwind CDN, no bundler) so the user can open it locally and judge it.

### 5c — Approval gate

Present the artefact to the user with the design-direction prose from 5a. Wait for explicit approval before proceeding to Step 6 (SECURITY) or Step 7 (IMPLEMENT).

**Acceptable approvals:**

- "yes" / "approved" / "go on" / "ship it" / "looks good"
- "yes but change X" — iterate on X, then re-confirm
- A specific diff request — apply, then re-confirm

**Not approvals:**

- Silence
- "I'll trust you" (push back politely; ask for one explicit yes/no on the artefact)
- "Whatever you think is best" (push back politely; the whole point is the user owns the visual judgement)

**Iteration limit:** if the artefact is in its 4th revision, stop and ask whether the design direction itself (Step 5a) was wrong, rather than continuing to tune the artefact.

### 5d — UI UX Pro Max refinement

Skip this substep if UI UX Pro Max is not installed.

If installed, invoke its skill on the approved direction from 5a/5c. Treat it as a **second opinion on style and palette**, not as a re-opening of the design direction. The user has already approved the direction in 5c — UI UX Pro Max can suggest *refinements* (different palette token, better font pairing, tweaked spacing scale) but cannot override the approved direction.

If UI UX Pro Max suggests a fundamental direction change, surface it to the user explicitly: "UI UX Pro Max recommends switching from editorial to brutalist because X. Stick with editorial, or pivot?" — and wait for an answer.

### 5e — Checklist

Always run, regardless of whether 5a–5d ran. Read `uiux-checklist.md` and run through every item against the **approved mockup** (or against the planned change if no mockup was generated).

This catches accessibility, responsive, and state-coverage issues that the mockup alone does not enforce.

---

## Anti-patterns

These are common ways the design gate gets skipped or weakened. Do not do them.

| Anti-pattern | Why it fails |
|---|---|
| "It's just a small change" | The trigger matrix decides, not your gut. If the matrix says yes, run the gate. |
| "I'll mock it up while coding" | The whole point of 5b is the user sees the visual **before** code. A mockup-while-coding is a lie. |
| Lorem ipsum in the mockup | The user cannot judge visual hierarchy without realistic copy. |
| Skipping the empty/error state | Empty and error states are where most real-world UI fails. They are mandatory. |
| Asking the user "does this work?" without showing them the artefact | The artefact must be visible when you ask for approval. No verbal-only descriptions. |
| Treating UI UX Pro Max suggestions as gospel | The user approved the direction. UI UX Pro Max is additive, not authoritative. |

---

## Caveman-mode interaction

When the user is in caveman mode (terse fragments), the gate still runs — but the dialogue is shorter:

- 5a write-up: bullet list, no prose paragraphs
- 5b mockup: still required, still mandatory states
- 5c approval: "yes" / "no, change X" / "no, redo direction" — all valid

Caveman is a communication style, not a discipline-skip lever. The mockup gate runs every time it should run.
