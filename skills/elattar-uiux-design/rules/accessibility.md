# Keyboard and screen reader

WCAG 2.2 AA, the items a builder owns. Read it at the Design pass (write the keyboard path with the layout) and at the Review (walk it). `node <skill>/checks/run.mjs keyboard <route>` drives the running app: it presses Tab (at most 200 stops per route, both themes), Enter and Escape, and reads the browser's own accessibility tree. `<skill>` is this skill's base directory.

| Check id | Fires on | Rule below |
|---|---|---|
| `focus-invisible` | a focused control with no outline or ring, or one under 3:1 against what it sits on | Focus is always visible |
| `focus-hidden` | something that paints sits over the focused control | Focus is never hidden |
| `focus-order` | focus moves up the page by more than a row, or left along a row | Focus order follows reading order |
| `keyboard-trap` | Tab cannot leave an element | No keyboard trap |
| `overlay-escape` | Escape does not close an overlay, focus does not return to its trigger, or Tab leaves an open modal | Escape closes the top overlay |
| `unnamed-control` | a button, link or field with no name, or a name that omits its visible text | Every control has a name |
| `landmarks` | not exactly one `main`, or not exactly one `h1` | One main, one h1 |
| `img-alt` | an image with no `alt` attribute | Images have alt |
| `small-target` | an interactive box under 24 by 24 px without the WCAG 2.5.8 spacing exception, unless an inline link in running text | Targets are big enough |

The walk reads the first 200 tab stops, on desktop width; if the page has more, it walks 200 more starting from the first control inside `main`. It presses Enter on overlay triggers, so it runs the page's real handlers.

## Every action works by keyboard

**Rule.** Everything a pointer can do, Tab, Enter, Space, arrows and Escape can do (2.1.1): real `button`, `a[href]`, `input`, or the system's component, never a clickable `div`.
**Why.** Keyboard, switch and voice users reach controls only through the focus order; a `div` with `onClick` is not in it.
**System tool.** `components/ui/*` (Radix underneath) already carry roles, keys and focus; compose them.
**Judge it.** No check finds a clickable `div`. Keyboard walk: "Tab through the page without the mouse. Can I reach and operate every control I can click?"

## No keyboard trap

**Rule.** Tab and Shift+Tab always leave an element (2.1.2). The one exception is an open modal, which Escape closes.
**Why.** A trapped user has to reload the page and loses their work.
**System tool.** The system's Dialog, Sheet and Popover trap focus only while open and release it on close.
**Judge it.** `keyboard` (`keyboard-trap`). In the walk: "Does Tab ever stay on one control, or cycle among a few, without a modal open?"

## Focus order follows reading order

**Rule.** Tab moves in the order a sighted reader reads: top to bottom, start to end of a row (2.4.3). Fix the DOM, not `tabindex`; never a positive `tabindex`.
**Why.** Focus that jumps backward or across the layout makes a screen-magnifier user and a screen-reader user lose their place.
**System tool.** Source order = visual order; layout with grid and flex without `order` or `flex-direction: *-reverse` on focusable children.
**Judge it.** `keyboard` (`focus-order`) catches jumps of more than one row up the page and leftward along a row; a sidebar followed by content is not a jump. In the walk: "Does focus ever land somewhere I did not expect next?"

## Focus is always visible

**Rule.** Every focused control shows an indicator of at least 3:1 against the colour next to it, in both themes (2.4.7, 1.4.11). The system's focus ring token is the indicator; `outline-none` is only allowed beside a replacement ring.
**Why.** Without it a keyboard user cannot tell where they are.
**System tool.** The `--ring` and `--ring-halo` tokens (in ViewSonic's system ViewSonic blue `#004DA5` with a `#CFE9F7` halo on light, `#CFE9F7` on dark) and the focus-visible ring every `components/ui/*` control already draws: fields use `focus-visible:border-ring` with `ring-4 ring-ring-halo`. Reuse it; never draw a focus ring in the action or brand colour.
**Judge it.** `keyboard` (`focus-invisible`) measures the ring against its backdrop, light and dark; fix with `run.mjs contrast --fg <ring token> --bg <surface>`. In the walk: "Screenshot a focused control in each theme: can I find it in a second?"

## Focus is never hidden

**Rule.** A focused control is not covered by a sticky header, a fixed bar, a cookie banner or a floating button (2.4.11; the check is stricter, it fails a control that is part-covered at its centre).
**Why.** A focus indicator under a sticky bar is as good as none.
**System tool.** `scroll-padding` the height of the sticky element on the scrolling container.
**Judge it.** `keyboard` (`focus-hidden`) checks the centre of each focused control. In the walk: "Tab to the first and last control under each sticky element: is it visible?"

## Targets are big enough

**Rule.** Minimum 24×24 (WCAG 2.5.8) for every target; primary and frequent touch actions use a component size ≥ 44 (e.g. `lg`). Never meet a size target by overriding components, use their sizes. The exception is a text link inside running text. A label counts as part of its checkbox or radio.
**Why.** Small targets are missed by thumbs, tremors and low-precision pointers.
**System tool.** The component's own size variants (`sm` 32, default 40, `lg` 48); padding rather than a bigger glyph.
**Judge it.** `keyboard` (`small-target`) fails only a box under 24 px with no spacing exception; 24 to 43 px gets a per-route note. The measuring function is shared with the UX check.

## Every control has a name that contains its visible label

**Rule.** Every button, link and field has an accessible name; an icon-only control has `aria-label`; when it also shows text, the name contains that text (4.1.2, 2.5.3).
**Why.** A screen reader announces the name, and voice control says the visible text: if the two differ, "click Save" does nothing.
**System tool.** `Button`, `Field` and `Label` from `components/ui/*`; `aria-label` on `size="icon"` buttons.
**Judge it.** `keyboard` (`unnamed-control`) reads the browser's accessibility tree. Review: "Read the page as the list of controls a screen reader would read: does each say what it does?"

## Status changes are announced

**Rule.** A change the user did not cause by moving focus (a saved toast, an error under a field, a loading finish, a count that updates) is announced through a live region: `role="status"` or `aria-live="polite"`, and `role="alert"` for errors that block (4.1.3).
**Why.** A screen-reader user hears nothing from a toast they cannot see.
**System tool.** The system's toast and `FieldError`; `aria-live` on a region that exists before the text arrives.
**Judge it.** No check observes announcements. Review: "For each message that appears without focus moving, is it inside a live region that was already on the page?"

## One main, one h1

**Rule.** One `main` and one `h1` per page, with the other regions in `header`, `nav`, `aside` and `footer` (1.3.1, 2.4.1, 2.4.6). Heading levels do not skip (the `rules` check's `hierarchy`).
**Why.** Landmarks and headings are how screen-reader users move through a page.
**System tool.** The page shell; the `type-*` roles style a heading without changing its level.
**Judge it.** `keyboard` (`landmarks`).

## Escape closes the top overlay

**Rule.** In a dialog, sheet, menu or popover: Enter on the trigger opens it and moves focus inside; Tab stays inside a modal; Escape closes the topmost one; focus returns to the trigger (2.1.2, 2.4.3).
**Why.** Focus left behind in a closed overlay, or on the page body, restarts the user at the top of the page.
**System tool.** The system's Dialog, AlertDialog, Sheet, Popover and DropdownMenu. A hand-built overlay is a finding in itself.
**Judge it.** `keyboard` (`overlay-escape`) opens up to 10 distinct triggers per route (`aria-haspopup`, `data-slot$=trigger`, `aria-expanded`), presses Escape, and checks where focus went. It prints how many it tried; the rest are tried by hand.

## Images have alt

**Rule.** Every image has an `alt` attribute: a short description of what it says if it carries meaning, `alt=""` if it is decoration (1.1.1).
**Why.** A missing `alt` makes a screen reader read the file name.
**System tool.** `next/image` and `<img>` both require it.
**Judge it.** `keyboard` (`img-alt`) finds the missing attribute. Whether the description is useful is judged by reading it.
