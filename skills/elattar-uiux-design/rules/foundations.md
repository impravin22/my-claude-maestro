# The 7 foundations

Read at the Design pass (step 5) and the Review (step 8). Every screen and component is judged against all seven. `<skill>` is this skill's base directory.

## Alignment

**Rule.** One alignment edge per container: if the heading is left-aligned, everything in that container is. Left by default. Centre only a single short line (button label, badge, number, icon), never body text over one line. Reading text is 45-75 characters per line.

**Why.** Ragged-right left-aligned text reads more easily past about three lines; 45-75 characters is the comfortable measure ([Baymard: line length](https://baymard.com/blog/line-length-readability)).

**System tool.** The layout grid and one container edge; `type-*` roles for reading text, with a measure cap (`max-w-*` in `ch` or a container token) rather than full width.

**Judge it.** Static: `node <skill>/checks/run.mjs rules` (`alignment`: `text-center` together with `type-body` or `type-lead`, or `type-small` over long text). Screenshot: "Trace the left edges. One edge per container? Anything centred that is more than one line?"

## Contrast

**Hard rule: WCAG AA or AAA, or the design is not done.** Every colour pair, in light and dark, meets the project's contrast level: AA by default, AAA when `viewsonic-ui.config.json` sets `"contrastLevel": "AAA"`. AA is the floor; nothing lower exists. A single failing pair means the work is unfinished: never report a design done, never ship it, never round a ratio up.

| Level | Text | Large text | Controls, borders, focus rings, meaningful icons |
|---|---|---|---|
| AA (floor) | 4.5:1 | 3:1 | 3:1 |
| AAA | 7:1 | 4.5:1 | 3:1 (non-text has no AAA bar) |

**Rule.** Large text is 24px and up, or 18.66px and up bold. Disabled controls and logos are exempt. APCA may be reported alongside, never instead.

**Why.** [WCAG 2.2 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

**System tool.** `-ink` tokens carry coloured text and differ per theme; `-foreground` tokens sit on their surface; never a raw role colour as text.

**Judge it.** `node <skill>/checks/run.mjs contrast` (token pairs, both themes) and `node <skill>/checks/run.mjs contrast-rendered` (what the page paints). Any BAD means not done. Fix loop: try the existing tokens the output suggests, swap to the first that passes and keeps the meaning; only if none passes, tell the user "we may need a new colour" with the pair, the ratio and the proposed value. Never by eye.

## Balance

**Rule.** Visual weight is spread so no side or corner dominates without intent. At phone width nothing is orphaned or squeezed.

**Why.** Classic composition: unequal weight pulls the eye away from the focal point, and a squeezed or orphaned item reads as a layout fault.

**System tool.** Grid tokens and the 768 and 1024 breakpoints; symmetric padding from the spacing scale.

**Judge it.** Screenshot: "Does one side or corner pull the eye without a reason? At phone width, is anything orphaned or squeezed?" Use `node <skill>/checks/run.mjs shots <route>`.

## Hierarchy

**Rule.** One focal point per view and one primary action. Importance order equals the order of size, then weight, then colour. Heading levels never skip. The squint test passes.

**Why.** Visual hierarchy is the order in which the eye takes things in; too many focal points means none is found ([NN/g: Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)).

**System tool.** The `.type-*` roles (pick the role, never size or weight beside it); `Button` variants: one `default`, the rest `secondary` or `ghost`; the next heading level, styled with a role.

**Hard rule: a description is always smaller than its title.** The text that describes a title (a card's, dialog's, alert's, section's or row's description, subtitle or helper line) uses a type role with a SMALLER font size than that title at every breakpoint. Never the same size, never bigger. Weight, colour and opacity do not make up the difference: two roles of equal size read as equals, and the title stops leading. Fix it by shrinking the description to the next smaller role (for example `caption` under a `nav` title), not by inflating the title.

**Judge it.** Static: `node <skill>/checks/run.mjs rules` (`hierarchy`: a heading level skips inside one file). Measured: `node <skill>/checks/run.mjs title-scale <route>` (`description-not-smaller`: every `<x>-title` / `<x>-description` pair and every heading with the paragraph after it, phone and desktop). Screenshot: "Squint at the desktop shot. What is seen 1st, 2nd, 3rd? Does that match importance? Exactly one primary action? Is every description visibly smaller than its title?"

## Colour

**Rule.** Role tokens only. Colour is never the only signal. Glow is rationed. Money out is never red.

**Why.** [WCAG 2.2 SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html); the system's colour roles carry meaning, a hue does not.

**System tool.** The semantic role tokens (action, value, success, warning, info, destructive) and their `-ink` text partners; icon plus label beside any colour-coded state.

**Judge it.** `node <skill>/checks/run.mjs tokens` and `rules` (`colour`). Screenshot: "Is colour ever the only signal? Cover the colour: does the state still read?"

## White space

**Rule.** Only spacing-scale steps. Space grows with the level of the group. Nothing cramped against an edge or another element; no group floating in empty space.

**Why.** The spacing scale is the system's rhythm; arbitrary gaps break it and make levels indistinguishable.

**System tool.** The spacing scale in the project's tokens stylesheet (`gap-*`, `p-*`, `space-*` steps).

**Judge it.** `node <skill>/checks/run.mjs tokens` plus screenshot: "Anything cramped against an edge or another element? Any group floating in empty space? Does space grow with the level of the group?"

## Proximity

**Rule.** The gap inside a group is smaller than the gap between groups, by at least one rung of the spacing scale. Groups nest: the gap grows at every level up.

**Why.** Gestalt law of proximity: things close together are read as related ([NN/g: Proximity Principle](https://www.nngroup.com/articles/gestalt-proximity/)).

**System tool.** The spacing scale. Example, a settings row: label and helper text are one group (tight gap); the control is another; the gap between the two groups is one step larger; the gap between rows one step larger again.

**Judge it.** Screenshot: "Draw the groups. Is every gap inside a group smaller than the gap around it, by at least one scale step? Does any item look like it belongs to the wrong group?"
