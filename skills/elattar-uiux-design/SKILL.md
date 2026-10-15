---
name: elattar-uiux-design
description: Design, build, change, or review UI/UX with ViewSonic design system, in a project on that system (a viewsonic-ui.config.json or .viewsonic-ui/ folder, or the foundation's --color-action-* and --color-value-* tokens) or when the user asks for the ViewSonic design system. Use for pages, screens, components, forms, dashboards, settings, styling, theming (light and dark), interaction states, loading/empty/error states, motion, microcopy, accessibility, responsive layout, and UI reviews in those projects. Not for projects on another design system.
---

# ViewSonic UI/UX design

Work through the steps in order. A passing build is the floor, not the proof: it cannot show that both themes work, every state exists, or actions give feedback. Each step ends with the files to load; load only those, at that step. `<skill>` is this skill's base directory.

## 1. Detect the project

Run `node <skill>/checks/run.mjs config`. It prints where the project's tokens, components, routes and docs live and whether ViewSonic's system is installed. Never assume repo paths. Offer `node <skill>/checks/run.mjs install` (pre-commit hook and CI workflow); it writes nothing until the user says yes.

Load: [checks/map.md](checks/map.md) only when a check is unfamiliar.

## 2. Inventory

List what already exists before choosing anything new: components, tokens, type roles, page patterns, hooks. Reuse before adding, extend with a variant before forking.

Use only what the project has: retired parts (a `premium` or `outline` Button, a `premium` Badge) and parts this system does not ship (agent workspace, AI chat elements, voice orb, cube avatar) are not options. Files are picked through the one `FilePicker` (or a `Dropzone`) and screened by the project's upload limits; never add a second file input.

Load: [system/components.md](system/components.md).

## 3. Choose a pattern (only if the user gave no design information)

Choose a pattern only if the user gave no design information. If they gave a design, reference, sketch, layout idea or creative direction, skip this step and design from their input with `rules/`. Otherwise route by their words with [patterns/README.md](patterns/README.md), then read the one pattern file it names.

Load: [patterns/README.md](patterns/README.md) and the pattern it names.

## 4. Ask before adding a new value

If no existing token, type role, duration, easing, spacing step or shadow fits, stop and ask the user. Name the closest existing token, why it does not fit, and the value you would add. Add it only after a yes. A missing value is never an arbitrary literal; an approved one is owned by its component.

Load: [system/tokens.md](system/tokens.md), "Component-owned values".

## 5. Design pass

Before any code, write thirteen lines for each screen or component: one per foundation in [rules/foundations.md](rules/foundations.md) (Alignment, Contrast, Balance, Hierarchy, Colour, White space, Proximity), then one per secondary rule in [rules/secondary.md](rules/secondary.md) (Movement, Proportion, Repetition, Rhythm, Emphasis, Unity), each naming the token, type role or component that serves it. Example: "Hierarchy: `type-h2` title is the focal point; one `Button` default, the rest `secondary`." "Proximity: label and helper gap one scale step tighter than the row gap."

Hard rule, no exceptions: a description is always set in a smaller type role than its title, never the same size and never bigger ([rules/foundations.md](rules/foundations.md), Hierarchy).

Hard rule, no exceptions: every colour pair meets WCAG AA at minimum, or AAA when the project sets `"contrastLevel": "AAA"`, in light and dark. One pair below the level means the design is NOT done: do not report it finished, fix it first ([rules/foundations.md](rules/foundations.md), Contrast).

Then add one line of content intent from [rules/content.md](rules/content.md): the words each button, error and empty state will use, and what a user does next after each failure.

Then add one line of accessibility intent from [rules/accessibility.md](rules/accessibility.md): the keyboard path (tab order, what Escape closes, where focus lands after each action) and the accessible name of every icon-only control.

Then add one UX line for each rule in [rules/ux.md](rules/ux.md) that the screen touches. Always cover: the feedback each action gives and what shows past 1s (rules 2, 3), the way out of each overlay (5), what the user reads when a call fails (16), how each destructive action confirms or undoes (8), what is kept when a submit fails (20), the views and navigation (21 to 23: one job per view, every page reachable on a phone) and how every action completes its task (24). Example: "Never show the backend: a failed save shows a written message and Retry; the error object is logged, not rendered."

No thirteen lines, no build. A line no existing token can fill is a step 4 ask.

Load: [rules/foundations.md](rules/foundations.md), [rules/secondary.md](rules/secondary.md), [rules/content.md](rules/content.md), [rules/accessibility.md](rules/accessibility.md), [rules/ux.md](rules/ux.md).

## 6. Build on the tokens

Build with the system's components and tokens only, covering every state and both themes. Fill the state table before writing the component. If anything moves, follow the continuity rules and the presence recipe. Anything that reads the theme (toasts, charts, portals) needs the app's theme provider mounted above it: check the root layout before using it. When the work has independent parts (separate components or pages), split it into parallel sub-agents on disjoint files per [system/orchestration.md](system/orchestration.md); never two agents on one file.

Load: [system/tokens.md](system/tokens.md), [system/states.md](system/states.md), [system/motion.md](system/motion.md) when anything moves, [system/orchestration.md](system/orchestration.md) when the work splits.

## 7. Check

After each meaningful edit run `node <skill>/checks/run.mjs fast --changed` (scoped to changed files and their importers; `--all` for everything). Run a browser check only for the route being built: `run.mjs full --only <check> --route <r>`. Fix what they report using each failure's `fix` line. Invalid component props and variants (`Button size="md"`) are flagged automatically after every edit; run the project's lint too and fix every `viewsonic/valid-variant` error by using a variant that exists. Contrast is fixed by the loop: change the token or the pairing, re-run `contrast`, repeat until it passes in both themes. Which check enforces which rule: [checks/map.md](checks/map.md). None run on their own unless the project installed the hook and CI. Before Review the project's production build (`next build`, or the build script in `package.json`) must pass, and `node <skill>/checks/run.mjs runtime-errors <route>...` must be clean on every changed route: a green build does not mean a page that renders without console errors, and prerender errors only show in the build.

Load: [checks/map.md](checks/map.md), [system/orchestration.md](system/orchestration.md).

## 8. Review

Run `full` once, on the changed routes (the default); browser checks need the app running, dev server for iteration, production build for `ux-flow` timing. A route behind sign-in needs `auth.storageState` in the config ([checks/map.md](checks/map.md)). Screenshot review. Run `node <skill>/checks/run.mjs shots <route>` for every route you touched and review the slices (viewport-tall pieces of every page, light and dark, phone and desktop; a short page's full image is its one slice). Judge each against the "Judge it" questions in [rules/foundations.md](rules/foundations.md) and [rules/secondary.md](rules/secondary.md), writing one line per rule, thirteen in all: PASS, or what is wrong and the fix. Fix, re-shoot, re-judge. Then read every word on the screen against [rules/content.md](rules/content.md): does each button say what happens, does every error give a next step, would a stranger understand it, does anything look like server or developer text? Then the keyboard walk: run `node <skill>/checks/run.mjs keyboard <route>` for every route you touched, then Tab through the page yourself, including any part the check noted it could not reach: can I reach and use every control, is focus always visible and never under a sticky bar, does Escape close the top overlay and return focus to its trigger, does every control have a name, is each status change announced? Judge it against [rules/accessibility.md](rules/accessibility.md). Then the UX pass: run `node <skill>/checks/run.mjs ux` and `node <skill>/checks/run.mjs ux-flow <route>` for every route you touched, and answer every **Review** question in [rules/ux.md](rules/ux.md) for the screen: could a stranger use it without help, would the user say these words, can they back out of every step, does each action keep one name, what do they read when the server says something odd, is the success moment designed, what would they redo after a reload? Contrast is never judged by eye: run `contrast` and `contrast-rendered <route>...` for the routes you touched.

Load: [checks/verify.md](checks/verify.md), [system/traps.md](system/traps.md) (every trap shipped green; skim the contents for the ones your change could repeat).

## 9. Document and report honestly

Document what was added: the component and its states on the project's specimen or docs page, and any owned value with its reason. Then report what was verified and what was not: which checks ran and passed, which were skipped and why, which routes were shot, what no check can see and you judged by hand. Never claim a check passed that did not run, and never round a failure down.

Load: nothing new; the report states evidence, not opinion.
