# The state inventory

## Contents

- [The table](#the-table)
- [Loading: which shape](#loading-which-shape)
- [The two skeleton rules](#the-two-skeleton-rules)
- [Feedback: every action needs two signals](#feedback-every-action-needs-two-signals)
- [Which component carries the feedback](#which-component-carries-the-feedback)

Fill this in **before** writing the component, not after. A blank cell is
unfinished work, not a decision you get to defer to "v2", because the states
nobody drew are the ones users hit on their worst day.

The rule is plain: every component ships its full state set, including the
unhappy ones. A design system that only documents success is documenting half a
component.

## The table

| State | Owed to the user | Common failure |
|---|---|---|
| **rest** | The default. | none |
| **hover** | "This is interactive." | Applied to non-interactive things, which promises an affordance that is not there. |
| **focus-visible** | The same information hover gives, for a keyboard. | Removed because it "looks heavy". Never remove it. `:focus-visible` is always on and always the action colour. |
| **pressed** | "I registered that." Instant in, springy out. | Missing, so a slow action feels broken for the 300ms before anything else happens. |
| **loading** | "It is happening, and here is roughly how much." | A spinner where a skeleton belongs, or vice versa (see below). |
| **success** | "It worked": the outcome, not just the click. | Only the control changes, so the user is unsure the *thing* happened. |
| **error** | What failed, and what to do about it. | Not drawn at all, so the failure is silent. |
| **disabled** | "Not available now", and ideally why. | Drawn as merely faint, so it is indistinguishable from loading. Contrast is *exempt* here (WCAG 1.4.3); do not chase the ratio. |
| **empty** | What this is, and a way forward. | A blank rectangle, which reads as broken rather than empty. |
| **N/A** | A written reason. | Left blank instead, which is indistinguishable from forgotten. "No loading state: the action is synchronous" is a complete answer; silence is not. |

## Loading: which shape

**Skeleton** when you know the shape of what is coming: a list of rows, a
profile header, a card grid. It reserves the layout.

**Spinner** when you do not: an action of unknown duration, an indeterminate
wait.

**Progress** when you can honestly say how far through you are. Do not fake it.

### The two skeleton rules

**Match the footprint.** Same height, padding and radius as the real thing. A
generic grey box where a card will appear causes a layout jump when the data
lands, and a layout jump is worse than the spinner you were trying to avoid.
The easiest way to guarantee this is to render the same component with its
content replaced, rather than drawing a separate "skeleton version". Take care
where the real content is a `<p>` or other text element: `Skeleton` renders a
`<div>` by default, and a `<div>` inside a `<p>` is invalid HTML that every
guard here passes. Pass **`as="span"`** where the placeholder stands in for
words, and swap the *wrapper* too where the whole block is loading.

**One swap, not two.** Use `anim-enter` on the arriving content. It springs,
because content replaced content in the same slot: that is what the utility is
for. Fading the skeleton out and then fading the content in animates one thing
twice and reads as a glitch.

## Feedback: every action needs two signals

The control confirms it **heard** you. The outcome confirms it **worked**. One
without the other leaves a gap:

- Control only → "did that actually do anything?"
- Outcome only → the click felt dead for as long as the request took.

**Worked example: a share button that copies a link:**

| Moment | Signal |
|---|---|
| Press | Nothing to add: `Button` already carries `press`. That same utility is for surfaces that are *not* a Button, too. |
| Heard | `IconSwap` rolls the share glyph to a check. Every control that alternates between icons swaps through it; a control that changes meaning should show you it changed. |
| Worked | A success **toast**. Transient confirmation of something just done. |
| Failed | An error **toast**, plus a fallback: select the link so it can be copied by hand. |
| Reset | The glyph returns after a beat. |

`navigator.clipboard` fails on insecure origins and when permission is denied.
A share button that silently does nothing is the worst possible outcome, and it
is the one that ships when only the happy path is drawn.

**States you cannot reach from the page.** Some states only occur on failure
paths a specimen page cannot produce: a clipboard write refusing on a secure
origin, a network error, a permission denial. The rule is still that every state
must be **live on the page**, not a screenshot, so give the component an
injectable seam: accept the effectful call as an optional prop that defaults to
the real one.

```tsx
// The component takes the effect, so the page can hand it a failing one.
copy?: (text: string) => Promise<void>   // defaults to navigator.clipboard.writeText
```

The specimen then renders the same component three times (real, always-fails,
always-slow) and every state is genuinely reachable and genuinely live. Without
this, the honest options are a static mock (which the page's whole premise
forbids) or an undrawn state, and agents will quietly pick one.

**Only where there is an effect to inject.** A component whose action is
synchronous and cannot fail (a toggle, a tab, a purely presentational badge)
has no loading or error state to reach, and inventing a fake async prop to
satisfy this pattern makes the API worse. Mark those rows N/A and say why.

## Which component carries the feedback

A toast reads the theme from the app's theme provider (sonner does). Before
using one, confirm the `Toaster` sits inside that provider in the root layout;
outside it, it renders dark on a light page and no static check notices
([traps 41](traps.md)). Look at one in the light theme before calling it done.

| Situation | Component | Why |
|---|---|---|
| Confirming something the user just did | **Toast** | Transient. There is nothing to decide. |
| A task containing a choice | **Dialog** | A container: header names it, body is the work, footer closes it. Three zones. |
| Irreversible, must be answered | **AlertDialog** | Two zones: footer band only, because the question *is* the content. Its action is destructive by default. |
| A persistent condition worth explaining | **Alert** | It stays on the page. |
| Nothing is there yet | **Empty** | Always offers a way forward. |

The distinction that matters most: **reversible → Dialog, irreversible →
AlertDialog.** If the action cannot be undone, it needs an AlertDialog; if it
can, a plain Dialog is enough.
