# Rubric

A grader (a fresh agent that did not build the screen) scores the build from its **screenshots** (phone and desktop, light and dark) and the final code. It answers each rule's "Judge it" question; the questions live in the rule files and are not copied here.

## Score each line 0, 1 or 2

| Score | Meaning |
|---|---|
| 2 | The question is answered well on every screen touched |
| 1 | Answered well on most; one visible lapse |
| 0 | Answered badly, or cannot be judged because the shot is missing |

## Lines (19, maximum 38)

| Group | Lines | Questions in |
|---|---|---|
| Foundations (7) | Alignment, Contrast, Balance, Hierarchy, Colour, White space, Proximity | [rules/foundations.md](../rules/foundations.md) |
| Secondary (6) | Movement, Proportion, Repetition, Rhythm, Emphasis, Unity | [rules/secondary.md](../rules/secondary.md) |
| Content (1) | One line for the whole screen: actions, errors, empty states, no backend words | [rules/content.md](../rules/content.md) |
| Accessibility (1) | One line for the whole screen: keyboard path, names, focus, announcements | [rules/accessibility.md](../rules/accessibility.md) |
| UX (4) | Feedback and speed, the way out and undo, consistency and discoverability, error and failure handling | [rules/ux.md](../rules/ux.md) |

Rules that do not apply to the prompt (no motion in the build, for example) score 2 only if the screen shows no sign of needing them; otherwise 0.

## Pass

Pass needs both:

1. **Every objective assertion** of the eval in [evals.json](evals.json) true. Assertions are checked from the transcript and `run.mjs` output, by script where possible.
2. **Rubric score at least 85%**: total / 38 >= 0.85 (33 or more).

A rule scoring 0 in two with-skill runs means the skill text or the check is wrong: fix it, re-run.
