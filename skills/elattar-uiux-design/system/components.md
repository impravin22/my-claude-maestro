# Component contracts

Read the section matching the component or pattern being changed. Paths below
are the shadcn convention (`components/ui/`); use the ones `run.mjs config` printed.

## Contents

- [Base components](#base-components)
- [Compound controls](#compound-controls)
- [Charts](#charts)
- [Sidebars](#sidebars)
- [Constrained buttons](#constrained-buttons)
- [Native scrollbars](#native-scrollbars)
- [Uploads](#uploads)
- [Steps and review tiles](#steps-and-review-tiles)
- [Code blocks](#code-blocks)
- [React Compiler](#react-compiler)
- [Providers](#providers)
- [Component vocabulary](#component-vocabulary)

## Base components

Search the project's `components/ui/` (and its live specimen page, if any) before
adding anything. Add a generic visual chassis to `ui/`; move it out when it
encodes product meaning. Extend an existing base component with a variant when
the chassis is shared. Wrap it in a product family, beside `ui/` and never inside
it, when only the composition or meaning changes.

The same className override (a forced height, size, radius or padding) on one component three or more times means the agent is fighting the system: use an existing variant, or ask before adding one (a component-owned value, SKILL step 4). `rules` reports it as `override-cluster`.

Sizes come from the component's size variants (Button: xs 24, sm 32, default 40, lg 48, xl 56); never force one size on all controls (`global-override`).

Do not register a new `ui/` module in a barrel unless the project already has
one. Add it to the project's navigation or specimen list if it keeps one. Teach
`tailwind-merge` any new `--shadow-*` or `--text-*` token (usually in
`lib/utils.ts`), or it files the class as a colour and silently drops it.

Route Lucide glyphs through `Icon` or `IconSwap`. Do not render a second icon
system or use emoji as an interface icon. Reaction exception: an emoji the user
selected is content, not an icon substitute.

Never use Lucide's `Sparkles` icon. Select the concrete action or object glyph
instead; sparkle is not a substitute for product meaning.

## Compound controls

Reuse the system control instead of redrawing it. When nesting the semantic
control would produce invalid interactive markup, extract and share the
non-interactive visual chassis and mark, as a radio or checkbox inside a
questionnaire shares the base control's class name and indicator.

## Charts

Search the project's chart components before drawing marks. Reuse one when its
data shape fits. Otherwise compose through `components/ui/chart.tsx`; do not
import the chart library directly into product pages or hand-draw an existing
chart shape.

## Sidebars

Preserve the shared anatomy: workspace switcher and optional search in
`SidebarHeader`, grouped navigation in `SidebarContent`, secondary actions in
`SidebarFooter`, `SidebarRail`, `SidebarTrigger`, and tooltips for rows that
survive icon collapse. Replace product content, not the interaction model.

## Constrained buttons

Keep a button `min-w-0 max-w-full`. Put long visible copy in `ButtonLabel` and
repeat the complete label in a tooltip available to pointer and keyboard users.
Do not abbreviate a destructive consequence to make it fit.

## Native scrollbars

Let `html` receive the global browser scrollbar from the global stylesheet. Add
`scrollbar-thin` to nested native overflow regions on either axis. Use
`ScrollArea` only for a contained application panel that needs a composed rail.
Never hide the only cue that more content is reachable.

## Uploads

One hidden file input serves the whole app: `FilePicker` (`components/ui/file-picker.tsx`). Never render a second
`<input type="file">`, and never show or focus the picker itself. A visible control opens it through a ref:
a `Button` calls `ref.current.click()`, or a `Dropzone` does it for you.

| Component | Props | Notes |
|---|---|---|
| `FilePicker` | `onFiles(files)` (required), `onSkipped(skipped)`, `already` (`{ count, bytes }`), `directory`, `multiple` (default true), plus input props such as `accept` and `ref` | hidden, `tabIndex={-1}`, `aria-hidden`; `directory` picks a whole folder, each file carrying `webkitRelativePath`; the value is cleared after each pick so the same file can be picked again |
| `Dropzone` | `label`, `accept`, `hint` (all required), `onFiles`, `onDropData(dataTransfer)` (return true when it handled the drop, for example a folder walk), `already`, `reading` (files read so far, or null), `skipped` (what the caller left out), `children` | a dashed card whose one `button` opens the picker and is named by `label` and described by `hint`; shows a spinner while `reading`, the skipped notice in destructive ink, and a polite `role="status"` line |

Every pick and drop is screened by the project's upload limits helper (`lib/file-limits.ts`: `screenFiles`,
`skippedText`, `MAX_FILES`, `MAX_DEPTH`, `MAX_BYTES`). In ViewSonic's system the limits are 500 files, 8 folders deep
and 2 GB per pick, counted on top of `already`, and a name that is empty, `.`, `..`, or holds a backslash or a
control character is refused. Skipped files are never silent: show `skippedText(skipped)` (or let `Dropzone` show it),
for example "3 files skipped: 2 with an unsafe name, 1 over the 500 file limit." Read the limits from the helper;
never repeat the numbers in a component. Pass `already` so a second pick counts against the same limits.

## Steps and review tiles

| Component | Props | Use |
|---|---|---|
| `Stepper` (`stepper.tsx`) | `steps: { label, detail?, state: "done" \| "current" \| "pending" }[]`, `orientation` (`horizontal` default, `vertical`), `align` (`center` default, `between`, horizontal only) | progress through a fixed sequence; an `<ol>` with `aria-current="step"` on the current step, a check on done steps; it is display only, so navigation between steps stays in your own buttons |
| `CellTile` (`cell-tile.tsx`) | `tone` (`default` `memory` `warning` `destructive` `success` `legal` `muted`), `pressed`, `dimmed`, `glyph` (top right, decorative), children (short text, clamped to three lines) | a pressable cell in a review matrix; `pressed` marks the open cell, `dimmed` fades it when a filter puts other tiles forward. The `glyph` is `aria-hidden`, so its meaning must also be in the text or the accessible name |
| `CellBox` (`cell-tile.tsx`) | `tone` (`default` `dashed` `warning` `destructive`) | the same box, not pressable: the source text a row of tiles translates |
| `NamePart` (`name-part.tsx`) | `value` and `label` (required), `tone` (`set` default, `guess` `missing` `optional`), `highlighted` | one part of a built name (a code over its label) as a small button that jumps to that part's field; `guess` is warning, `missing` destructive, `optional` dashed |

## Code blocks

Render fenced code through the project's code-block component. Colour comes from
the `--code-*` tokens, never a baked-in theme. Preserve React-element rendering;
never replace it with injected highlighted HTML. Let an empty or unknown fence
language fall back to plain tokenized code without failing the surrounding page.

## React Compiler

Do not synchronize mounted state with `setState` in an effect; the React Compiler
lint rejects it. Use `useSyncExternalStore` for browser feature or mounted-state
subscriptions (the project's `use-mobile` hook and theme toggle show the shape).

## Providers

A component that reads a context throws, or renders wrongly, when its provider is not above it. Build and types stay
green; only opening the thing shows it ([traps 41, 42](traps.md)). Before using one of these, check that the app's root
layout mounts the provider above every page that reaches it.

| Component | Needs above it | When missing |
|---|---|---|
| `Tooltip`, and anything that renders one: `AlertDialog` and `Dialog` and `Sheet` cancel or close controls, `Attachment`, `Sidebar` items | `TooltipProvider` | throws "`Tooltip` must be used within `TooltipProvider`" the moment the overlay opens |
| `Toaster` (sonner) | the app's theme provider | renders in the default theme, dark on a light page |
| `Sidebar` parts | `SidebarProvider` | throws "useSidebar must be used within a SidebarProvider" |
| `Chart` parts | `ChartContainer` | throws "useChart must be used within a ChartContainer" |
| `Carousel` parts | `Carousel` | throws "useCarousel must be used within a Carousel" |
| `Form` fields | `Form` (react-hook-form `FormProvider`) and `FormField` | throws on first render |

This list is a start, not the whole set: grep the project's ui folder for `useContext` and `must be used within`, and add what you find to the specimen page. A provider that is missing is a missing piece of the app: ask, do not patch the component. Run `runtime-errors`: it opens each overlay and hovers each tooltip trigger, so a provider crash is caught.

## Component vocabulary

Every base component ViewSonic's system ships. A project may have installed only
some: list its `components/ui/` first, and add a missing one with the project's
shadcn registry rather than hand-rolling it.

accordion, active-indicator, alert, alert-dialog, aspect-ratio, attachment,
avatar, badge, breadcrumb, bubble, button, button-group, calendar, card,
carousel, cell-tile, chart, checkbox, collapsible, combobox, command,
content-change, context-menu, dialog, direction, disabled, drawer,
dropdown-menu, dropzone, empty, field, file-picker, form, hover-card, icon,
icon-swap, input, input-group, input-otp, item, kbd, label, marker, menubar,
message, message-scroller, name-part, native-select, navigation-menu,
pagination, popover, progress, prose, questionnaire, radio, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, spinner,
stat, stepper, switch, table, tabs, textarea, toaster, toggle, toggle-group,
tooltip, user-menu.

Retired, do not use: the `premium` (value foil) `Button` and the `premium` `Badge`, and the `outline` `Button`
(use `secondary`). `Badge` still has an `outline` variant. ViewSonic's system ships no agent workspace, AI chat
elements, voice orb or cube avatar; if a task asks for one, it is a new component: ask first (SKILL step 4).

Button variants: `default` (one primary per region), `secondary`, `ghost`, `destructive`, `link`. Sizes: `xs` 24,
`sm` 32, `default` 40, `lg` 48, `xl` 56, and `icon-xs`, `icon-sm`, `icon`, `icon-lg`. Read the component's `cva()` for
the current set; the after-edit hook rejects a variant it does not define.
