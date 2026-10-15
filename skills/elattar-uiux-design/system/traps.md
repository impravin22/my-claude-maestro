# Traps that have actually shipped

History: every entry is a past incident, kept for the lesson. Some name parts that have since been retired (the
`premium` Button and Badge, the value foil, the lime and gold ramps). Do not reach for them: check the project's
current components ([components.md](components.md#component-vocabulary)) before reusing a fix from here.

## Contents

1. [Dead references: the guard's blind spot](#1-dead-references-the-guards-blind-spot)
2. [`text-action-bright`: legible in one theme, invisible in the other](#2-text-action-bright-legible-in-one-theme-invisible-in-the-other)
3. [Foregrounds that must NOT flip](#3-foregrounds-that-must-not-flip)
4. [tailwind-merge does not know your scales](#4-tailwind-merge-does-not-know-your-scales)
5. [Unlayered CSS beats layered CSS, whatever the specificity](#5-unlayered-css-beats-layered-css-whatever-the-specificity)
6. [Memoised reads go stale when the theme flips](#6-memoised-reads-go-stale-when-the-theme-flips)
7. [`color-mix(in oklab, …)` cannot be parsed as RGB](#7-color-mixin-oklab--cannot-be-parsed-as-rgb)
8. [Blend modes are arithmetic, not styling](#8-blend-modes-are-arithmetic-not-styling)
9. [Opacity is not contrast-preserving: but disabled is exempt](#9-opacity-is-not-contrast-preserving-but-disabled-is-exempt)
10. [Bulk replaces do more than you asked](#10-bulk-replaces-do-more-than-you-asked)
11. [A coloured dot is one signal, not two](#11-a-coloured-dot-is-one-signal-not-two)
12. [State hues were dark-only until they were not](#12-state-hues-were-dark-only-until-they-were-not)
13. [The class looks undefined and is not: trap 1 from the other side](#13-the-class-looks-undefined-and-is-not-trap-1-from-the-other-side)
14. [A vendored component can carry a local fix that no guard defends](#14-a-vendored-component-can-carry-a-local-fix-that-no-guard-defends)
15. [Sharing tokens is not the same as sharing a component](#15-sharing-tokens-is-not-the-same-as-sharing-a-component)
16. [Locale-sensitive markup can pass every source guard and fail hydration](#16-locale-sensitive-markup-can-pass-every-source-guard-and-fail-hydration)
17. [`Icon` swallows unrecognized props](#17-icon-swallows-unrecognized-props)
18. [An empty `role="status"` announces nothing](#18-an-empty-rolestatus-announces-nothing)
19. [`animation: none` drops fill-mode under reduced motion](#19-animation-none-drops-fill-mode-under-reduced-motion)
20. [375px overflow must be measured with `clientWidth`](#20-375px-overflow-must-be-measured-with-clientwidth)
21. [Portalled panels must be measured open](#21-portalled-panels-must-be-measured-open)
22. [Playwright's `colorScheme` does not flip next-themes](#22-playwrights-colorscheme-does-not-flip-next-themes)
23. [Script and test folders are Tailwind content sources](#23-script-and-test-folders-are-tailwind-content-sources)
24. [Comment prose must be re-derived after a rename](#24-comment-prose-must-be-re-derived-after-a-rename)
25. [Audit evidence must name the artefact, not just claim it was read](#25-audit-evidence-must-name-the-artefact-not-just-claim-it-was-read)
26. [`element.matches(selector)` proves nothing about styling](#26-elementmatchesselector-proves-nothing-about-styling)
27. [Two classes that write the same longhand, on one element](#27-two-classes-that-write-the-same-longhand-on-one-element)
28. [`*/` inside a block comment ends it](#28--inside-a-block-comment-ends-it)
29. [`defaultOpen` on a modal takes the whole page hostage](#29-defaultopen-on-a-modal-takes-the-whole-page-hostage)
30. [Markdown in a string that four things read](#30-markdown-in-a-string-that-four-things-read)
31. [A viewport breakpoint inside a component that can be placed in a column](#31-a-viewport-breakpoint-inside-a-component-that-can-be-placed-in-a-column)
32. [A full disk reports a passing run](#32-a-full-disk-reports-a-passing-run)
33. [A project's `testIgnore` replaces the top-level one](#33-a-projects-testignore-replaces-the-top-level-one)
34. [A name that promises one thing and documents another](#34-a-name-that-promises-one-thing-and-documents-another)
35. [An axe pass finds what a green render cannot](#35-an-axe-pass-finds-what-a-green-render-cannot)
36. [Two measurements of the same thing disagreed: believe the trusted one](#36-two-measurements-of-the-same-thing-disagreed-believe-the-trusted-one)
37. [A deleted route is still linked and tested from somewhere](#37-a-deleted-route-is-still-linked-and-tested-from-somewhere)
38. [Tailwind-merge keeps the LAST class in a group, so a floor set first can lose](#38-tailwind-merge-keeps-the-last-class-in-a-group-so-a-floor-set-first-can-lose)
39. [`EADDRINUSE` on the test server means the suite ran against the OLD one](#39-eaddrinuse-on-the-test-server-means-the-suite-ran-against-the-old-one)
40. [A forgotten dev server beside the production server corrupts the production run](#40-a-forgotten-dev-server-beside-the-production-server-corrupts-the-production-run)
41. [A toast outside the theme provider renders in the wrong theme](#41-a-toast-outside-the-theme-provider-renders-in-the-wrong-theme)
42. [A component that needs a provider only fails when it is opened](#42-a-component-that-needs-a-provider-only-fails-when-it-is-opened)

Most of these passed a green build, that is the point of
the list: it is a map of what a passing build does not prove. Three are a
different shape and are here anyway: 9 was a mistake in the *guidance* rather
than the code, 10's second incident happened in a rules document, which neither guard
reads at all, and 13 never shipped, it is the one where the *report* was wrong
and the code was fine, which cost two pieces of work.

Loaded at SKILL.md step 8; skim the contents before building too, when you draw the states.
Most take one line to avoid and an afternoon to find.

---


## 1. Dead references: the guard's blind spot

**the `tokens` check looks for hardcoded values, not references that resolve to
nothing.** Those are opposite failures and only one is caught.

Tailwind drops unknown classes silently. CSS drops declarations containing
undeclared variables silently. Neither errors, neither warns.

**What shipped:**

- `shadow-btn-gold` was renamed to `shadow-btn-lime` by a prose sweep, but the
  token is `--shadow-btn-value`. The class resolved to nothing, so the premium
  button and premium badge had **no shadow at all** for weeks.
- Two now-retired furniture typography roles (both since folded into `small`)
  painted with `var(--color-foreground-subtle)`, a token named in a comment
  and declared nowhere. The whole `color` declaration was invalid, so both
  classes silently *inherited*, and every call site had quietly compensated
  by writing `text-muted-foreground` beside the class.

**How to catch it:** there is a check for exactly this:

```bash
node <skill base dir>/checks/run.mjs refs
```

It cross-checks every utility in our own namespaces, every `.type-*`, every
`shadow-*` and every `var(--*)`, and it knows which variables libraries declare
at runtime so it does not cry wolf.

**Know its two limits, because they are where the next one will hide.** It pools
declarations from *every* scanned file rather than scoping them, so a `var()`
used in the global stylesheet and declared only in a component still passes, the name
exists somewhere, which is not the same as being in scope. And it reads class
strings only where **every** token is class-shaped, which is what stops it
flagging English prose; a string containing `(`, `=` or a `${}` is skipped
whole, so most `data-[state=open]:…` strings in vendored components go
unchecked. Neither is a reason to distrust a failure, it does not report false
ones, but a pass is weaker than it looks in those two places.

Both bugs above were re-injected to prove it catches them, it does, naming the
file and line. If you need to teach it about a new runtime-declared variable,
add it to the check's runtime-declared list with a note saying which library sets it; do not
loosen the pattern.

Spot check in the browser: if you wrote a shadow and
`getComputedStyle(el).boxShadow` is `none`, the class does not exist.

**Then read trap 13 before you report one.** This trap is "the class is dead and
looks alive". Trap 13 is the same question from the other side, "the class looks
dead and is alive", and it is the more expensive of the two to get wrong,
because the output is a confident sweep through working code.

## 2. `text-action-bright`: legible in one theme, invisible in the other

The text-safe end of a brand ramp is a **different shade in each theme**. On
dark it is `--color-action-bright`; on light it is `--color-action-dark`. They
are opposites.

A component cannot know which surface it is on, so it must not choose. Write
**`text-action-ink`** and let the theme block answer.

Measured on the colours page, live: on light, `action-ink` is 10.6:1 AAA and
`action-bright` **fails at 1.9:1**. On dark it is exactly reversed.

## 3. Foregrounds that must NOT flip

The mirror-image mistake. `--color-value-foreground` is the label on the value
foil, and it deliberately does not change between themes, because the foil is
an **opaque** metal ramp and is the same lime on white as on black.

It previously used `text-background`, which is correct in a dark-only system and
became white-on-lime the moment light mode existed.

**The test:** does the *surface* flip? If yes, the foreground flips with it. If
the surface is opaque and constant, the foreground must be constant too.

## 4. tailwind-merge does not know your scales

`cn()` merges classes, but tailwind-merge only understands the scales it has
been taught. Anything else it guesses at, and it guesses **colour**.

`shadow-pressed` was being filed as a shadow *colour*, not a shadow *size*.
Colours and sizes do not conflict, so `cn("shadow-pressed", "shadow-none")` kept
**both** and `shadow-none` never won. That is why inputs inside an
`InputGroup` drew a second sunken socket inside the group's own, a field
floating in a field, with the addon icons stranded outside it.

The same bug had already shipped once for `text-*` before that.

**If you add a `--shadow-*` or `--text-*` token to the CSS entry file, add it to the
matching list in the tailwind-merge config (usually `lib/utils.ts`).** Otherwise it silently stops being overridable.

## 5. Unlayered CSS beats layered CSS, whatever the specificity

Tailwind puts `@utility` output in a layer. A third-party stylesheet injected at
runtime, sonner does this, is unlayered. **Unlayered always wins**, so no
selector written inside `@utility` can beat it, however many classes you stack.

**What shipped:** the live toast's bloom broke on hover while its preview beside
it was fine. Hovering sets `data-expanded="true"`, and sonner's unlayered rule
takes `::after`, `bottom: 100%`, `height: ~15px`, lifting the layer carrying
the hot core clean off the toast.

**The fix pattern:** put the reclaiming rule at the **top level of
the CSS entry file** (unlayered) with enough specificity to win, and read the geometry
from variables so the override cannot drift from the definition it defends.

**The tell:** if a third-party component behaves differently from its static
preview, you have lost a property you did not declare. Find which one.

## 6. Memoised reads go stale when the theme flips

The colours page computes contrast from the live stylesheet, its whole premise
is "measured, not asserted". Its cache was justified with "the product is
dark-only and these tokens never change at runtime", which stopped being true
the moment there were two themes.

Result: swatches repainted (they are `var()`, the browser handles that) while
the printed hex and the measured ratio stayed frozen at whatever the first
render saw. The page asserted that light-mode ink measured 10.6:1 on black.

**If you cache anything read from computed styles, invalidate it on theme
change**, a `MutationObserver` on `<html>`'s `class` attribute, which is what
next-themes rewrites.

## 7. `color-mix(in oklab, …)` cannot be parsed as RGB

It computes to `oklab(…)`. `getComputedStyle` hands it back in that form, and a
regex expecting `rgb()` will either fail or silently grab the wrong numbers,
producing contrast ratios in the millions, which is how the mistake announces
itself.

**To measure a mixed or blended colour honestly, rasterise it:** paint the
computed value into a 1×1 canvas and read the pixel back. That is how the
premium button's worst-case 7.8:1 was established across the foil's gradient.

## 8. Blend modes are arithmetic, not styling

`mix-blend-mode: screen` **adds** light. It is correct on near-black and
literally invisible on white. `multiply` is the inverse.

Two consequences that both shipped:

- Effects built on `screen` vanish entirely in light mode until they flip to
  `multiply`.
- The same alpha is not equivalent across the two. Screen on near-black is
  gentle; multiply on white bites hard. A bloom at the 0.75 that reads as soft
  iridescence on dark painted a dark smear across every Alert and took the body
  copy with it.

Also: gradients must fade to the blend's **identity**, white for multiply,
black for screen, or the falloff paints grey across the surface. That is a
dirty bloom, not a dim one.

## 9. Opacity is not contrast-preserving: but disabled is exempt

`Button` carries `disabled:opacity-50`, and half of a colour that clears AA does
not clear AA. It was `opacity-45` when this entry was written, measured at about
**3.2:1 on light** and **4.4:1 on dark**; the system's shared disabled-opacity
value is `50` now, which is very slightly lighter and changes nothing about the
reasoning below.

**That is not a bug, and this entry used to imply it was.** WCAG 2.1 SC 1.4.3
exempts "text or images of text that are part of an inactive user interface
component", a disabled control has no contrast requirement at all. Reporting it
as a failure sends the next person off to "fix" a system-wide token on the
strength of a rule that does not apply.

What genuinely matters for a disabled control:

- It must be **distinguishable from its enabled state**, that is what the
  opacity is for, and it works.
- The exemption covers the control. It does **not** cover helper text, error
  text or a label sitting *next* to it that is still active.
- If a control needs to look unavailable but stay readable, it is probably not
  disabled, it is a control that should explain why, which is a different
  design.

So: measure it if you like, but do not raise it as a defect, and do not raise
the opacity to "fix" it.

## 10. Bulk replaces do more than you asked

Two incidents, one root cause. You are editing this repo's prose constantly,
Step 6 makes documenting mandatory, so this is not a niche editing concern.

**It hit code that looked like prose.** A `gold` → `lime` sweep was meant for
sentences. It also rewrote the class name `shadow-btn-gold` into
`shadow-btn-lime`, and the token is `--shadow-btn-value`. That is trap 1: the
premium button had no shadow for weeks.

**It fed its own output back in.** Renumbering sections of a rules document with an
ordered list, `§4→§2`, `§5→§3`, `§6→§4` …, passed each result into the next
replacement. Every cross-reference in the file collapsed onto `§2` or `§3`.
Caught only because "the four files listed in §2" pointed at *Typography*.

**So:** run identifier renames separately from prose renames, anchored, build in
between. Remap a set of values in **one pass**, a single regex with a lookup
function, never as a sequence. And read a sample of the results; a replacement
count tells you nothing about whether the replacements were right. A bulk
regex that matches inside a code comment is still a comment-prose edit, not a
code edit, it can silently rewrite an example string a reader will copy.

## 11. A coloured dot is one signal, not two

§7 requires that status and money direction each carry **two or more non-colour
signals**. It is easy to think a coloured dot beside a label satisfies that: two
elements, therefore two signals.

It does not. If the dot is the same shape and size in every state, the *only*
thing distinguishing "online" from "away" is its hue, so the dot is one signal
(colour) and the label is the second. Remove the label and the component is
unreadable to anyone who cannot separate those hues, which is the exact failure
the rule exists to prevent.

**Give the mark its own non-colour dimension.** Shape, fill, or size: a solid
disc for online, a smaller disc for away, a hollow ring for offline, a dash for
unknown. Now the mark alone carries the state and the colour is reinforcement
rather than the message.

The same trap applies to a bare coloured left-border on an Alert, and to a
red/green figure with no sign or arrow.

## 12. State hues were dark-only until they were not

`--color-success`, `--color-warning` and `--color-info` were chosen against
zinc 950 and are correct there. On white they are decorative: measured, amber
was **1.67:1** and cyan **1.81:1**, `text-warning` on a light surface was
simply unreadable, and nothing said so.

All four now follow the same `-ink` contract as the brand ramps:
`text-success-ink`, `text-warning-ink`, `text-info-ink` resolve to a deep shade
on light (5.0 to 5.5:1) and the lifted one on dark (7.8 to 11.9:1).
`--destructive` was the last to get one, it is a single red in both themes and
measured ~4.1:1 as a glyph on dark, so `text-destructive-ink` lifts it to 7.2:1
there and leaves it unchanged on light, where it already cleared AA.

**Name the ink, never the raw hue, wherever a glyph or a label is involved.**
The raw tokens remain correct for fills, dots and chips, where the shape carries
the meaning and the colour is reinforcement, see trap 11.

The swap cannot regress either theme, which is why it is always the right move on
text: `--destructive-ink` **is** `--destructive` on light and lifts it on dark;
`--success|warning|info-ink` **are** their raw tokens on dark and deepen on
light. So `text-*-ink` equals `text-*` in the theme the raw token was chosen for,
and improves the other.

the `tokens` check's `state-colour-as-text` rule now fails the build on
`text-destructive|success|warning|info` outside a comment. It was added because
no guard could see this class of bug at all, `destructive` is a real token, so
nothing was wrong with the *value*, only with which end of the pair was named,
and the `refs` check resolves it happily. Run over the tree it was written against it
reported **35 occurrences on 29 lines in 17 files**, and that was *after* two of
them had been found and fixed by hand, one file at a time, in the same week
(`bubble.tsx`, then `questionnaire.tsx`). Among the seventeen still standing:
`FieldError`, every menu's destructive item, the destructive `Button` and
`Badge`, all four `Alert` glyphs, the tool chip's error text, the composer's
dictation error.

**The count is not the lesson.** A bug found and fixed twice by hand and still
live in seventeen more files was never a bug about those files. It was a missing
guard.

**And that first sweep missed an entire spelling, which is the more useful half
of the story.** It was built by running the class-form regex over the tree, so by
construction it could not see `color: var(--color-warning)`, and
the global stylesheet was painting all five toast glyphs exactly that way: the same
four hues just fixed in `alert.tsx`, plus `--color-action-bright`, which the `-ink` rule
forbids on text outright and which the stylesheet's own comment names as the
thing nothing may write. Measured on `--popover` in light: **2.54, 1.67, 1.81 and
1.85 to one.** A reviewer found it. Neither the sweep nor the new guard did.

So know exactly what the guard covers, because the gap is where the next one
hides:

| Spelling | Caught | Runs in the CSS entry file? |
|---|---|---|
| `text-destructive`, `text-warning`, … | yes | no, skipped with every literal rule |
| `color: var(--color-warning)`, and the brand `-bright` / `-dark` ends | yes | **yes, deliberately**, it is the only file that spells it this way, and it was breaking the rule five times |
| `fill:` / `stroke:` naming a raw state hue | **no** | none |
| a raw hue reaching text through a `--custom-property` indirection | **no** | none |

`fill:` is uncovered on purpose: a chart bar filled `var(--color-success)` is
correct and a glyph filled the same is not, and the declaration does not say
which.

**When you add a guard, write down what it does not catch, in the same commit.**
The first draft of this entry said the rule was safe to enforce "with no
exceptions", which read as *nothing gets past this*, and something already had.

## 13. The class looks undefined and is not: trap 1 from the other side

**Trap 1 is "the class is dead and looks alive". This is "the class looks dead
and is alive", and it is the more expensive one**, because a false dead-reference
report does not sit there quietly: it produces a sweep through working code.

**Symptom.** An agent greps the CSS entry file, finds no `@custom-variant
data-open` and no `@utility scroll-fade-y`, and reports them dead with
confidence. Or it compiles a scratch file containing `@import "tailwindcss"`,
sees nothing emitted, and reports the same.

**What shipped:** two whole pieces of planned work, briefed and part-written,
to "fix" `data-open:` and six `scroll-fade-*` / `scrollbar-*` utilities that had
never been broken. Both were withdrawn before anything reached history. Nothing
was wrong with the code either time.

**Cause.** The entry file is not the whole stylesheet. Its first three lines
import `tailwindcss`, `tw-animate-css` and `shadcn/tailwind.css`. That last file
registers nine `@custom-variant`s, `data-open`, `data-closed`, `data-checked`,
`data-unchecked` and `data-active` matching both `data-state="…"` and a bare
`data-*`; `data-disabled` matching the bare attribute; `data-selected` matching
`[data-selected="true"]` and **nothing else**, so it is silent against a bare
`data-selected`; `data-horizontal` / `data-vertical` matching
`data-orientation`, plus the whole
`scroll-fade-*` and `shimmer-*` families and `no-scrollbar`. Tailwind v4 ships
`scrollbar-none`, `scrollbar-gutter-stable` and `scrollbar-thumb-*` /
`scrollbar-track-*` on its own.

So a grep of the entry file answers "is it defined *here*", not "does it resolve",
and a bare `@import "tailwindcss"` compile omits two of the three imports.
the `refs` check does not close the gap either, by design: it validates the
namespaces the project owns, which is why it has never had an opinion about
`scroll-fade-*`.

**The check, one command, and it is the build:**

```bash
the project's build command, then `grep -o '[^{}]*data-open[^{}]*{[^}]*}' .next/static/chunks/*.css
```

which answers it outright:

```css
.data-open\:anim-open:where([data-state=open]),
.data-open\:anim-open:where([data-open]:not([data-open=false]))
  { animation: ds-open var(--duration-open) var(--ease-emphasized) both }
```

Emitted means alive. Absent means dead **or never referenced**, and those are not
the same finding, a class Tailwind never saw proves nothing. Reference it on an
element first, rebuild, then grep, and say which of the two you established.

## 14. A vendored component can carry a local fix that no guard defends

`components/ui/*` is regenerated by `npx shadcn add`. That reintroduces stock
spacing, type and duration values, and the failure is loud, because the
`tokens` check fails on them.

**The silent version is worse: a fix that changes a *selector* rather than a
value passes every guard in this repo, in both directions.** Nothing notices when
it is there and nothing notices when it is gone.

**What shipped:** stock `chart.tsx` styles axis labels with
`[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground`. In recharts 3.8
that selector matches **nothing**, the `<text>` moved out of
`.recharts-cartesian-axis-tick` into a sibling `Layer` and carries
`.recharts-cartesian-axis-tick-value`. So every axis label silently kept
recharts' own default fill, in a colour from outside the system, and each theme
failed AA on one of the two axis families.

Measured on the chart page, rasterised against
`--background`. **How, because "what would stock look like" is otherwise a
guess:** clone a live tick `<text>` into a bare `<svg>` appended to `<body>`, so
it sits outside `[data-slot="chart"]` and our selector no longer matches it, then
read `getComputedStyle(clone).fill`. That is recharts' own value, first-hand,
without reverting anything.

| | recharts' own fill | dark | light | with our selectors |
|---|---|---|---|---|
| cartesian ticks (78 on the page) | `rgb(102,102,102)` = `#666` | **3.46:1** | 5.74:1 | 13.46:1 / 4.83:1 |
| polar ticks (10) | `rgb(128,128,128)` = `#808080` | 5.04:1 | **3.95:1** | 13.46:1 / 4.83:1 |

`document.querySelectorAll('.recharts-cartesian-axis-tick text').length` returns
**0** on that page, the stock selector matching nothing is the whole defect, and
it is a one-line check anyone can repeat.

Two files in `components/ui/` currently carry a local fix of this kind:

| File | The fix | What reverting it costs |
|---|---|---|
| `chart.tsx` | the two `-tick-value` selectors above | axis labels back to `#666`, 3.46:1 on dark |
| `field.tsx` | `text-destructive-ink` on `FieldError` and on `fieldVariants`' `data-[invalid=true]:` | error copy back to `--destructive` (trap 12) |

`field.tsx`'s reversion is now caught, the `tokens` check's `state-colour-as-text`
rule fires on it. `chart.tsx`'s is not, and cannot easily be: no guard can know
which selectors a third-party library's DOM actually answers to.

**So: after any shadcn add, read the diff, do not just run the guards.** A
green build is the floor for a regenerated file, not the proof. Both fixes are
documented in a comment at the site, naming the version they were measured
against, that comment is the only thing standing between the next regeneration
and a silent revert.

## 15. Sharing tokens is not the same as sharing a component

A duplicate control can use only semantic tokens and still be a fork. The
questionnaire shipped its own 16px radio/check box as nested `<span>` elements,
while `RadioGroupItem` and `Checkbox` already owned the system's 20px control,
pressed shadow and selection animations. the `tokens` check and the `refs` check were
green because every copied class was valid. Changing the base radio would have
left the questionnaire behind.

Do not solve this by nesting the existing Radix control inside the compound
control. Questionnaire choices are labels around native inputs; inserting a
Radix button creates an interactive control inside another interactive control
and breaks semantics. Extract the non-interactive visual chassis and animated
mark, then let both semantic owners compose those shared pieces. Here those are
`radioControlClassName` / `RadioIndicator` and
`checkboxControlClassName` / `CheckboxMark`.

The audit question is therefore not only “does this value come from a token?”
but also “does this shape already have an owner?” Search for the visual anatomy
as well as the export name: `rounded-full` plus `border-input` finds radios even
when nobody called the copy a radio. The token guard now also requires the
questionnaire to consume all four shared pieces, so a vendor refresh that
restores its private indicators fails loudly.

The same audit found thirty files rendering Lucide components directly even
though `Icon` already owned size, tone and accessibility. They now route through
`Icon`, and the `tokens` check rejects direct Lucide JSX. The single exception is a
Recharts custom dot: the chart calls it with absolute SVG coordinates and needs
an SVG glyph returned in that coordinate space, while `Icon` deliberately
renders a normal-flow glyph. That line carries `allow-direct-icon` and still
reads its dimensions from `ICON_SIZES`, so the exception bypasses composition,
not the size system.

## 16. Locale-sensitive markup can pass every source guard and fail hydration

Anything rendered on both the server and client must have a locale-independent
identity. A Calendar used `date.toLocaleString()` for `data-day`; the server
emitted `26/7/2026` while the browser emitted `26/07/2026`. Tokens, types, lint,
and the production build were all green because the defect exists only where
the two runtimes meet.

Use a stable local-date key (`YYYY-MM-DD` assembled from `getFullYear()`,
`getMonth()`, and `getDate()`) for attributes and keys. If a human-facing locale
label needs a fallback, pin the fallback locale and allow an explicit locale to
override it. During browser verification, inspect runtime error logs after a
fresh navigation; a visually correct screenshot does not prove hydration.

## 17. `Icon` swallows unrecognized props

`components/ui/icon.tsx` did not spread `...rest` onto the glyph it renders.
Anything written on an `<Icon>` that the component does not explicitly
destructure, `data-slot`, `role`, `id`, `aria-*`, an event handler, never
reached the DOM. No guard catches this: the prop typechecks, the JSX compiles,
and nothing renders wrong, because nothing renders *at all* for that attribute.

**What shipped:** `components/ui/spinner.tsx` wrote `data-slot="spinner"`,
`role="status"` and `aria-label="Loading"` onto an `<Icon>`. All three were
silently dropped. No state was actually unannounced in the one place it was
first noticed, a spinner inside `Button loading` is decoration beside the
button's own `aria-busy`, but the component claimed an announcement it did
not make, and a second call site (`attachment.tsx`, which sizes it via
`*:data-[slot=spinner]:size-6!`, a direct-child selector) depended on the slot
actually landing on the element it thought it was styling.

**The fix pattern:** `Icon` now forwards `...rest`, which widens its public
surface, audit that as part of the component rather than treating it as
settled. Before that fix, the check was to render the component in isolation
and read `screen.getByTestId(...)` or `getComputedStyle`, a swallowed prop
that a specimen "looks right" will never surface, because the surrounding
markup happens to be styled correctly by other means.

## 18. An empty `role="status"` announces nothing

A live region announces its **contents**, not its accessible name. Fixing a
swallowed `role="status"` and `aria-label` (trap 17) is only half the fix if
the element the role lands on still has no text inside it, `<svg
role="status" aria-label="Loading">` is a named, empty live region, and
nothing gets read aloud when it mounts.

**The check:** assert the live region's *text content*, not just its
accessible name. `getByRole("status", { name })` resolving is not proof the
region announces anything; only asserting on its rendered text is. The
working fix hosts the role on a wrapping element carrying visually-hidden
(`sr-only`) text, with the glyph itself marked decorative
(`aria-hidden`/`tone="inherit"`) inside it, content and name are both
required, and neither substitutes for the other.

## 19. `animation: none` drops fill-mode under reduced motion

The reduced-motion blanket rule in the global motion stylesheet sets
`animation-duration: 0.01ms !important`, which most animated elements survive
under a naive sweep that skips anything whose computed `animationName` is
`none`. But anything that reaches an actual `animation: none`, `tw-animate-css`'s
`animate-none`, a conditional `data-[...]:animate-none`, drops **fill-mode**
along with it. An override that forgets to also set `opacity: 1` (or whatever
the animation's end state was) lands in exactly the bucket a naive sweep
throws away, so the sweep cannot fail for its own subject.

**The check:** invert the test. Do not skip elements with no computed
animation; assert that every element which *should* end at full visibility
and information under reduced motion actually does, regardless of whether it
has a running animation.

## 20. 375px overflow must be measured with `clientWidth`

An overflow assertion written as `window.innerWidth` cannot fail on a
mobile-shaped Playwright context: Chrome grows the *layout* viewport to fit an
overflowing document rather than clipping it, so `innerWidth` grows right
along with the overflow it was supposed to catch.

**The check:** measure `document.documentElement.scrollWidth` against
`document.documentElement.clientWidth`, never `window.innerWidth`. This is
the one true general-purpose "does anything overflow horizontally" assertion
used across the specimen suite.

## 21. Portalled panels must be measured open

A page-level overflow test using `clientWidth` (trap 20) still cannot see a
portalled or absolutely/fixed-positioned panel, a context menu, a
navigation-menu flyout, a sidebar's account menu, because a `position:
fixed` or `absolute` wrapper never grows `document.scrollWidth` no matter how
far it extends past the viewport edge.

**The check:** open the panel first, then measure *its own* bounding box
against `document.documentElement.clientWidth` / `clientHeight` directly, and
photograph it open. A closed-state screenshot and a page-level overflow
assertion both pass while the open panel clips or scrolls off-screen.

## 22. Playwright's `colorScheme` does not flip next-themes

`ThemeProvider` in this repo pins `defaultTheme="dark"`, so next-themes never
consults `prefers-color-scheme`, Playwright's `colorScheme: "light"` context
option does **nothing** to it. Every "light mode" claim made against a
context configured only with `colorScheme` was actually re-measuring dark
mode at a different pixel size.

**The fix:** seed next-themes' own `localStorage` key in a `beforeEach`
before navigation, then reload. This is the one reliable way to force a
theme in an automated pass; `colorScheme` alone is cosmetic here.

## 23. Script and test folders are Tailwind content sources

Tailwind scans every file its content globs cover for class-shaped strings,
including script and test folders, not just `app/` and `components/`. A class
name written in a comment or a string literal in those folders can leak
into the compiled bundle exactly as if it were a real usage, which is the
opposite failure from trap 1 (a real usage silently producing nothing): here
a *mention* silently produces something.

**The check:** if a guard or a docs script hardcodes example class names in
a comment for illustration, exclude that directory with `@source not`, or the
"is this class alive" question (trap 13) gets a false positive from
a script or test folder alone.

## 24. Comment prose must be re-derived after a rename

A bulk identifier rename that also touches prose is trap 10's other half,
specific to comments. A regex written to catch class lists inside backtick
template literals also matched backtick-quoted inline code spans inside
comment sentences, so a comment naming a now-retired furniture role on the
wrong end of a component became a comment naming its replacement plus a
colour utility that was never part of the claim: grammatically intact,
technically false, and untouched by any guard because guards check code, not
prose.

**The check:** after any rename that touches comments, re-read every comment
line that mentions the renamed identifier, grep for the old name plus a
second pass for the identifier paired with a size, weight, case, or tracking
claim, and re-derive the sentence from what the code now actually does,
rather than trusting the substitution. A replacement count proves nothing
about whether the replacements were right.

## 25. Audit evidence must name the artefact, not just claim it was read

An audit table's rows claimed "screenshots read: desktop dark and light, tablet,
mobile" for every row in a batch, while the tablet and mobile captures had never
actually been opened, only asserted against by a test and then filed as "read" by
convention. Re-opening them one at a time found a real defect (a state grid
missing a cell at 768px) that no automated assertion had covered.

**The check:** evidence must name the specific artefact and viewport it came from
(`shots read: desktop-dark 1440, desktop-light 1440, tablet 768, mobile 375, all
four opened`), not a generic claim that verification happened. If a screenshot was
captured but not opened, say so, do not let "captured" read as "read".

These last nine were all found the same way: by actually driving the live
page, a keyboard pass, an opened screenshot, a reduced-motion toggle, rather
than by reading source. None of them show up in a build or a static check.

## 26. `element.matches(selector)` proves nothing about styling

A test that asserts a focus ring like this passes whether or not the ring
exists:

```ts
group.matches(":has([data-slot=command-input]:focus-visible)")  // WRONG
```

`matches()` runs the selector against the **DOM**. It answers "is there a
focus-visible descendant with that slot", which is true the moment the input is
focused, and says nothing about whether any stylesheet contains a rule using
that selector. Written to pin the fix for the command palette's missing focus
ring, it passed with the fix deliberately removed from `command.tsx` and the
page rebuilt.

Assert the **computed value** instead, and know what the broken state looks
like before you write the matcher. Measured with the ring absent, the group's
`boxShadow` was five copies of `rgba(0, 0, 0, 0) 0px 0px 0px 0px`; with it, one
entry is a real 3px ring. So:

```ts
const ALL_TRANSPARENT = /^(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?:, )?)+$/
expect(ring.boxShadow).not.toMatch(ALL_TRANSPARENT)
```

The general rule, and it is the same one trap 2 makes about the built
stylesheet: **a check that reads the markup cannot answer a question about
paint.** If the thing you care about is a rendered pixel, the assertion has to
come from `getComputedStyle`, and the guard has to be run once with the defect
put back to prove it fails.

Two related notes from the same fix:

- `:focus-visible` is a heuristic, and Chromium does not grant it for a
  programmatic `element.focus()`. A test that focuses that way measures the ring
  as absent on a page where it paints correctly. Type into the field
  (`locator.press("a")`) so the focus is keyboard-originated.
- Playwright's `webServer` uses `reuseExistingServer: true`, so a stale
  production server from an earlier build serves the OLD bundle and the suite
  reports on code you are no longer running. If a fix is verified in the dev
  server and still fails under Playwright, run on a different port
  before believing the failure.

## 27. Two classes that write the same longhand, on one element

`p-safe` and `p-4` both write `padding-top`/`right`/`bottom`/`left`. Put them on
the same element and the later rule wins outright, there is no merge, no
addition, and no warning. The first draft of the `safe-area` specimen carried
`className="p-safe rounded-md bg-muted/50 p-4"` and its own caption claimed the
visible padding came from `p-4`; measured, all four sides were `0px`.

This generalises past the safe-area family: any two utilities that resolve to
the same longhand collide silently, and the collision is invisible in review
because both class names are present and both are spelled correctly. Put them on
separate elements, and measure the result rather than reading the class list.

## 28. `*/` inside a block comment ends it

A doc comment that quotes a path with a glob in it closes early:

```ts
/**
 * the docs validator fails any
 * `<folder>/*/page.tsx` carrying a `"use client"` directive.
 *   ^^ the comment ends HERE
 */
```

Everything after that point is parsed as code. The symptom is not "unterminated
comment", it is a pile of errors that point somewhere else entirely:
`TS1443: Module declaration names may only use ' or " quoted strings` on a line
of prose, and `TS1160: Unterminated template literal` at the end of the file,
because a backtick further down opened one.

It cost three files in one sitting. Write `<folder>/<name>/page.tsx`, or
any spelling without `*/` in it. This also applies to a regex in prose
(`/\*\/`), a CSS comment quoted in a JS comment, and a file glob in a
`@example` block.

## 29. `defaultOpen` on a modal takes the whole page hostage

A documentation page wants its overlay specimen to be visible without a click,
so it reaches for `defaultOpen`. What that actually does on mount:

```js
getComputedStyle(document.body).pointerEvents  // "none"
```

The article cannot be scrolled, the navigation rail cannot be clicked, and
every section below the specimen is unreachable. It looks fine in a screenshot
of the top of the page, which is exactly why it shipped four times in one
sitting, on `alert-dialog`, `dialog`, `drawer` and `command`.

**The escape hatches do not work, and reading the library's source will tell
you they do.**

- `AlertDialog` hard-sets `modal: true` *after* the prop spread. It cannot be
  non-modal at all.
- `Dialog` accepts `modal={false}`, but `DialogContent` always renders
  `DialogOverlay`, which is a fixed full-viewport scrim whether focus is
  trapped or not. The page is reachable and invisible.
- `Drawer` (vaul) accepts `modal={false}` and its source restores
  `document.body.style.pointerEvents`, on close. Measured on mount with
  `modal={false}`, the body still computed `none`. A worker read the source,
  concluded it was safe, verified it by eye, and was wrong.

Non-modal overlays, `HoverCard`, `Popover`, `Tooltip`, are fine open, and
measuring says so (`pointer-events: auto`).

For a modal, give the specimen a **trigger**, and if the component has none of
its own (`CommandDialog` owns no trigger, the caller owns the open state), put
one in a companion client file. A route that loads with
`pointer-events: none` on `<body>` is this bug; measure for it.

## 30. Markdown in a string that four things read

`meta.description` is one authoritative sentence per capability, read by the
rail blurb, the search palette, the `<meta name="description">` tag and the
page hero. Seven of them name an identifier, written in backticks, and three of
those four readers are plain text, so the chart pages printed literal
backticks in 32px type, and a search result read `` `AreaChart` `` with the
punctuation in it.

Found by opening a page on a phone. No guard sees it: the string is valid, the
type is `string`, and every reader renders it "correctly".

A small helper now splits it, a parts form for the hero, a plain form for the
other three. The general rule: **a string with
markup in it needs one renderer per reader, and if you only have one reader
that can render it, the other readers need the markup stripped rather than
passed through.**

## 31. A viewport breakpoint inside a component that can be placed in a column

`Meta` split its rows into a 13rem label column plus the rest on `sm:`, a
VIEWPORT breakpoint. The sidebar documentation page puts a `Meta` inside a
`20rem` column of its specimen, and at a 1440px viewport the rule fired anyway:
a 13rem label against a 320px container left **56px** for the description,
which wrapped to roughly one word per line.

Nothing catches this. Every class is a token, the markup is correct, the page
does not overflow, and the `refs` check and the `tokens` check are both clean. It is
only visible by looking, and only obvious once you measure the cell.

The rule: **a component that can be placed in a narrow column asks how wide IT
is, not how wide the window is.** `@container/<name>` on the element, `@sm/<name>:`
on the rule. `Card` already did this (`@container/card-header`); `Meta` did not.

A `dd` or `td` under 90px holding four or more words is this bug, because
"the page is the right width" and "the text is readable" are different claims.

## 32. A full disk reports a passing run

A browser test run finished with **exit code 0**, no failures, and this summary:

```
  26 skipped
  378 passed (53.6m)
```

794 tests were declared. 378 + 26 = 404. **Three hundred and ninety tests never
ran**, and nothing in the output said so, no "did not run" line, no error, a
green exit code.

The cause was `ENOSPC` on the volume holding the temp directory. One spec
scaffolded a throwaway app with its own `node_modules` and production build,
430MB, and never deleted it. Ten runs had left ten of them: 4.1GB. Once the disk
filled, the runner could not write its artifacts and processes started failing in
ways that did not surface as test failures.

Two habits come out of this:

- **Count the tests.** The runner's `--list` mode prints the declared total.
  If passed + skipped + failed does not equal it, the run did not finish,
  whatever the exit code says. A summary is not a receipt.
- **A spec that creates a directory deletes it** in teardown, and only what it
  created, a directory the caller supplied is the caller's.

## 33. A project's `testIgnore` replaces the top-level one

A test config ignored one spec at the top level because that spec needs its own
config and environment variables. Most of the config's projects then declared a
`testIgnore` of their own, and that **replaced** the top-level list rather than
merging with it.

The ignored spec was silently collected again for those projects, where it
skipped itself at runtime for want of its env vars. The symptom is a skipped test,
which reads as "deliberately skipped" rather than "the config stopped working".
`--list` is what shows it: the file count went up by one.

The same applies to `testMatch`, `grep` and `grepInvert`. A project-level
filter is a replacement, not an addition, repeat the inherited entries explicitly.

## 34. A name that promises one thing and documents another

A page called "background effect" documented the per-surface reveal glows rather
than the page atmosphere its name promised, and a "chart geometry" page showed two
hand-drawn charts rather than the scale-and-tick maths its name promised. Both
rows were green in the project's contract, because the contract checks names, not
what the page documents.

The fix is to compare what the name promises with what the source actually
*does*. The thing squatting on a name gets its own honest name, or its honest
delivery (here, "owned by the chart library").

## 35. An axe pass finds what a green render cannot

Adding one `axe()` call to an existing slash-palette test failed immediately: `Required ARIA parents role not present:
group, listbox`. Every `option` sat inside plain `<ul>`/`<li>` under the
`listbox`, so assistive technology saw list items, not options. The render
tests had passed for weeks.

A `listbox` owns `option`s directly or through `group`s and nothing else.
Intermediate list markup kept for scroll logic gets `role="presentation"`,
and each inner list becomes the `group`, labelled by its own heading.

The point is the habit: **a focused test renders AND axes.** The render
proves it mounts; the axe proves it is the thing it claims to be.

## 36. Two measurements of the same thing disagreed: believe the trusted one

One worker measured keyboard Space through the Browser pane's key action and read
`transform: none` three times, concluding Space never drives `:active`. Another
worker's Playwright spec, driving a real CDP key event, read `scale(0.94)`. Both
were honest; the pane's events are not trusted events and Chromium does not apply
`:active` for them.

The class now answers a `[data-pressed]` attribute beside `:active` anyway,
Firefox and non-button hosts (`<a>`, `role="button"`) still have no keyboard
`:active`, and the docs state the measurement that was actually true. When two
measurements disagree, find out which one the browser trusts before writing
either down.

## 37. A deleted route is still linked and tested from somewhere

Routes were deleted after their content moved to per-item routes. One test file
enumerated the routes from data, so it was retargeted in the same change. Three
others hard-coded the same routes in `page.goto` calls, and were not: every test
in them opened a 404 and timed out waiting for a selector. **391 failures**, which
the last line of the run summarised as `374 passed`, the failures block was above
it, in a file that had only kept its tail.

The other half: a demo page still rendered a `<Link>` to one of the deleted routes.
Nobody clicked it, so nobody saw a 404 page, but `next/link` prefetches on hover
and in the viewport, so every visit fetched the deleted route and logged
`Failed to load resource: 404` to the console. The console-noise test reported a
bare "404 (Not Found)" with no URL, which cost a second run to trace.

Habits:

- Before deleting a route, `grep -rn "<route>"` across the app, components, docs
  and tests, and retarget every hit, not only the file that derives its routes
  from data. Doc comments count: seven of them pointed readers at pages that no
  longer existed. After: count the tests (trap 32).
- A console-noise test records `page.url()` and, for a failed resource, the
  resource URL. `page.on("response")` with `status() >= 400` catches the
  prefetch even when the console line is vague.

## 38. Tailwind-merge keeps the LAST class in a group, so a floor set first can lose

A select trigger declared `min-h-(--size-target-min)` and measured 40px. It
rendered through a group button whose underlying `Button` carries the default
size's `min-h-10`, and the Slot passes that in through `className`.
`cn(floor, className)` resolves two `min-h-*` to the last one, the 40px.
The class was in the source and was not on the element (trap 26 again).

When a class is a contract the component enforces, a target floor, a role, it
goes AFTER `className` in `cn`, with a comment saying why the usual "className
last so callers can override" is inverted here.

## 39. `EADDRINUSE` on the test server means the suite ran against the OLD one

The browser suite ran against a production server on a fixed port with
`reuseExistingServer: true`. A restart after a rebuild did `pkill -f "next start"`,
which on Windows reaches nothing, then started a new server that failed with
`EADDRINUSE` into a log nobody read, while the previous process kept answering
with the previous build. The suite ran for fifty minutes against code the fixes
had not touched, and 619 failures, most of them timeouts from a process that had
been up for hours, looked like a regression.

Before a run that must reflect a rebuild:

- Free the port by PID: `netstat -ano | grep :<port>` → `taskkill //F //PID`.
- Read the server's first three lines and confirm it bound.
- **Prove it is the new build** with a marker the change introduced, a
  rewritten link, a new class on a known element, fetched with `curl` before the
  suite starts. "The server responded 200" says nothing about which build responded.

## 40. A forgotten dev server beside the production server corrupts the production run

A dev server from an earlier working session was still alive when the production
server began serving the browser suite. The production server began throwing
`ChunkLoadError: Failed to load chunk server/chunks/ssr/…` from its first request:
pages rendered without their client chunks, dialogs measured inline far down the
page, `pointer-events` read `auto` where the stylesheet said `none`, and 294 tests
failed for reasons that had nothing to do with the change under test.

Before a production run: list every `node` process whose command line mentions
`next` and kill the ones you did not just start; delete the dev build folder;
rebuild; then `curl` five routes for 200 and grep the server log for
`ChunkLoadError` before starting the suite. Trap 39 checks WHICH build answers;
this checks that nothing else is writing under it.

## 41. A toast outside the theme provider renders in the wrong theme

sonner (and any portalled widget that reads the theme: charts, a command
palette) asks the app's theme provider which theme is active. Mounted outside
it, or in a layout the provider does not wrap, it never hears the answer and
renders its default, dark, whatever the page is doing. Build, types, lint and
every static check pass; the toast is a dark card on a light page, and only the
screenshot or the rendered-contrast run on a light route shows it.

Before using a toast (or any theme-reading portal), open the root layout and
confirm the `Toaster` is a descendant of the theme provider, not a sibling of
it. If the app has no provider, ask: that is a missing piece of the app, not
something to patch in the component. Review question: trigger a toast in the
light theme and look at it.

## 42. A component that needs a provider only fails when it is opened

A Danger-zone `AlertDialog` crashed the page with "`Tooltip` must be used within `TooltipProvider`" the moment it
opened: its cancel control renders a Tooltip internally, and the app mounted no provider. The page rendered, the build
passed, types passed, and every check that loads the page and stops there passed. The error lived behind a click.

Before using an overlay, a tooltip or any component from the providers table in
[components.md](components.md#providers), find its provider in the root layout. Then open every overlay on the page
yourself, in the running app, and watch the console. `runtime-errors` does the same pass: it opens each overlay
trigger and hovers or focuses each tooltip trigger, and fails on any console error or exception. Review question:
"Did I open every dialog, sheet and menu on this page, and was the console silent?"
