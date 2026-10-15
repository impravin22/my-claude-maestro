# Tokens

**Read real values from the project's token CSS** (`run.mjs config` prints where it is), never from this file. This file names the roles and the rules; the CSS holds the numbers.

## The two rules everything serves

| Rule | Meaning |
|---|---|
| Nothing is hardcoded | No hex, no `rgba()`, no `text-[13px]`, `tracking-[0.1em]`, `rounded-[14px]`, `duration-[220ms]`. Colour, type, radius, spacing and motion come from tokens. The only exception is the token files themselves. Enforced by `tokens`. |
| One vocabulary, and it is shadcn's | Page `--background`, container `--card`, fill `--muted`, hover surface `--accent`, text `--foreground` / `--muted-foreground`, hairlines `--border` / `--input`. Never invent a parallel name for a value that has one. |

## Colour roles

| Group | Tokens | Use |
|---|---|---|
| Neutral | `--background` `--card` `--muted` `--accent` `--foreground` `--muted-foreground` | surfaces and text |
| Focus | `--ring` `--ring-halo` | the focus indicator: fields take `focus-visible:border-ring` plus `ring-4 ring-ring-halo`; other controls keep the ring their component already draws |
| Action ×3 + ink | `--color-action-bright` `-action` (fill) `-action-dark` `-action-ink` | interaction: buttons, selection, active nav. ViewSonic red, one brand only |
| Value ×3 + ink | `--color-value-bright` `-value` `-value-dark` `-value-ink` | worth: balances, rewards, rankings |
| State ×4 + ink + surface | `--color-success` `--color-warning` `--color-info` `--destructive`, each with `-ink` and `-surface` | status; `-surface` is the tinted background, `-ink` the text on it |

- **Ramps are named for their role, never their hue.** Write `bg-action`, never `bg-blue-*`; a rebrand then changes no component. Stock `blue-*`, `lime-*`, `purple-*` and every Tailwind hue scale are rejected.
- **Action acts, value pays.** Never swap them.
- **Only `-ink` carries text, and it differs per theme.** `text-action-ink`, `text-value-ink`, `text-success-ink`, `text-warning-ink`, `text-info-ink`, `text-destructive-ink`. Never `text-action-bright`, `text-destructive` or any raw ramp end as text: legible on one theme, invisible on the other. The mid shade fills a button and takes `text-primary-foreground`.
- **A mark with no foreground of its own** (progress fill, slider range, tab rule, chart line) is on the same contract as text: use the `-ink` end, judged against its surface (3:1 minimum).
- **Money out is never red.** Red means error. A purchase or withdrawal is plain text with a sign and an outgoing arrow; money in takes the value ramp. A metric moving the wrong way is plain text too; red is only for a reading outside its band.
- **Glow is rationed.** `glow-action` for selected and primary CTA, `glow-value` for celebrated tiers and reward moments. Navigation never glows.
- **Light and dark are both complete**: every token, shadow and textured effect. Test both; the default theme is whatever the project's theme provider sets (light in ViewSonic's ViewSonic build).
- **Never convey state by colour alone**: pair with a shape, icon or text.

## Type: 21 roles, two breakpoints

The project's `--font-sans` sets every word; its `--font-mono` sets code, identifiers and figures. No third face. Which typefaces those are is the brand's choice, read from the project's stylesheet; never name or hard-code a family in a component. Every role is responsive: phone below 768, tablet 768 to 1023, desktop 1024 and up. A role owns shape only (family, size, line height, weight, tracking); colour, case and opacity belong to the component. Never hand-roll a size.

| Group | Roles (`.type-*`) | Face |
|---|---|---|
| Headings | `display` `h1` `h2` `h3` `h4` `h5` | `--font-sans` |
| Text | `lead` `body` `small` `nav` `badge` `micro` `caption` `cta` | `--font-sans` |
| Code | `code` `identifier` | `--font-mono` |
| Figures | `number-sm` `number-base` `number-md` `number-lg` `number-xl` | `--font-mono` |

Each role is also a `--text-*` / `--leading-*` token pair (`text-body`, `leading-body`) for a class string.

## Current values in ViewSonic's system

A snapshot to recognise drift, not a source: when it disagrees with the project's token CSS, the CSS wins and this table is stale.

| Token | Light | Dark |
|---|---|---|
| `--ring` | `#004DA5` (ViewSonic blue) | `#CFE9F7` |
| `--ring-halo` | `#CFE9F7` | `#004DA5` at 70% |
| `--muted-foreground` | `#6B6B6B` | `#B2B2B2` |
| `--foreground` on `--background` | `#202020` on `#FFFFFF` | `#F2F2F2` on `#1A1818` |
| `--color-action` | `#DB0025` corporate red; `#167BC4` business and proav; `#444BEB` education | same |
| `--color-value` | `#EF1A3E`, ViewSonic brand red | same |
| `--radius-lg` / `--radius-xl` | 8px / 16px | same |

## Spacing, radius, elevation

| Scale | Ladder | Rule |
|---|---|---|
| Spacing | 8-point: 4, 8, 12, 16, 24, 32, 40, 48, 64, 80 | Layout gaps must be on it. Half-steps (2, 6, 10, 14) are legal inside one component only. Anything under 2px is a mistake. Stacked type declares its own `gap-*`; never rely on line height. |
| Radius | controls `rounded-pill`; `lg` 8 inputs, textareas, menus and popovers; `xl` 16 cards, dialogs and containers; `2xl` 20, `3xl` 24; `4xl` 32 only for a full-width slab on a narrow column | Textarea takes `lg`. A pill needs 16px horizontal clearance. Two container radii side by side is drift. |
| Ambient shadow | `shadow-e1` to `shadow-e4` | how far a surface floats |
| Machine shadow | `shadow-btn` `-btn-primary` `-btn-value` `-btn-down`, `-key`, `-pressed`, `-chip` | whether it can be pressed. In ViewSonic's ViewSonic build controls are flat: the `btn` and `pressed` shadows resolve to a zero shadow, kept so components need no change. Never replace them with `shadow-none`. |
| Safe area | `pt-safe` … `p-safe` | only on something touching the display edge; never stacked with a `p-*` on one element |

## Motion scale

Names and roles only; values live in the token CSS. Content bounces; controls click: springy motion for things that appear or reward, machine motion for things you operate, never mixed. Continuity rules, `motionPhases` and the stay-mounted recipe: [motion.md](motion.md).

| Duration | Role | Easing | Role |
|---|---|---|---|
| `tick` | press feedback | `--ease-emphasized` | THE curve: overshoot then settle |
| `fast` | small state change | `--ease-enter` | things that arrive |
| `normal` | default transition | `--ease-move` | things that loop |
| `slow` | larger moves | `--ease-out-flex` | long travel that must not overshoot |
| `overlay-enter`, `open` | overlays and disclosure | | |
| `bloom` | atmospheric light, never controls | | |

Only the live indicator and the cosmic bloom animate forever. Honour `prefers-reduced-motion`; no information may exist only in an animation; never flash.

## Product meaning lives outside `ui/`

`components/ui/*` is generic chassis. A component that encodes money, scarcity, chance or progression moves out into a product family beside `ui/`. Wrap base components, never fork them. Format currency through one helper. Every product component ships its full state set ([states.md](states.md)).

## Component-owned values

A value no token covers, that the user or the design requires, belongs to the component it lives in. Never to the page, never as a bare literal.

| Step | Rule |
|---|---|
| 1 | Use a system token. If none fits, ask (SKILL step 4). |
| 2 | After a yes, declare the value **once**, as a custom property on the component's root: `--<component>-<purpose>`. `<component>` is the file's base name in kebab-case (`index.tsx` uses its folder). |
| 3 | Put `/* owned: <why>, approved <date> */` on the line directly above (`{/* owned: … */}` in JSX). |
| 4 | Inside the component, read it only through `var(--<component>-<purpose>)`. |
| 5 | No other file reads it. When a second component needs the same value it stops being owned: ask to promote it to a system token. |

Two spellings are recognised:

```tsx
{/* owned: track height from the design, approved 2026-10-11 */}
<div className="[--meter-track:13px] h-(--meter-track)" />

/* owned: track height from the design, approved 2026-10-11 */
const style = { "--meter-track": "13px" };
```

A value built from tokens (`var(--x)`, `--spacing(4)`, `theme(…)`) is an alias, not an invented literal: it needs no comment. A literal anywhere else still fails as today.

| Rule | Fires when |
|---|---|
| `owned-value-unmarked` | a `--<component>-*` declaration has no `owned:` comment above |
| `owned-value-leak` | a file other than the declaring one reads the property |
| `owned-value-reused` | the same literal is owned by two or more components: promote it to a token |
