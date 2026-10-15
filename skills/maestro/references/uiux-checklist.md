# UI/UX Design System Checklist

Run this checklist against every frontend change. No exceptions.

---

## Visual Design

- [ ] **Design tokens only**: no arbitrary values (`bg-[#ff0000]`, `text-[13px]`, `duration-[220ms]`) when a token exists. In a project with its own token system, Tailwind's stock palette (`bg-red-500`) is a literal too
- [ ] **Spacing scale**: all spacing uses the project's spacing scale (Tailwind's default 4px grid when the project defines none: `p-1` = 4px, `p-2` = 8px, etc.)
- [ ] **Typography scale**: use the project's type roles, else Tailwind's type scale (`text-sm`, `text-base`, `text-lg`, etc.), no arbitrary `text-[17px]`
- [ ] **Colour palette**: all colours come from the project's design tokens or Tailwind config; no inline hex/rgb values
- [ ] **New values are asked for**: when no token, type role, duration or spacing step fits, ask the user, naming the closest existing one; never invent a literal
- [ ] **Both themes**: if the project supports dark mode, every new component works in light and dark. Where themes switch through tokens, a colour that needs a `dark:` variant means a token is missing; elsewhere apply `dark:` variants
- [ ] **Visual hierarchy**: primary actions stand out (size, colour, weight), secondary actions recede; a description is always set smaller than its title, never the same size
- [ ] **Consistent iconography**: use the project's icon library (e.g., Lucide); no mixing icon sets

## Accessibility (WCAG 2.1 AA)

- [ ] **Keyboard navigation**: all interactive elements reachable and operable via keyboard alone (Tab, Enter, Escape, Arrow keys)
- [ ] **Focus indicators**: visible focus ring on all interactive elements; never `outline-none` without a replacement
- [ ] **Colour contrast (text)**: minimum 4.5:1 ratio for normal text, 3:1 for large text (18px+ or 14px+ bold)
- [ ] **Colour contrast (UI)**: minimum 3:1 ratio for UI components and graphical objects against adjacent colours
- [ ] **Contrast is measured**: every ratio comes from a check or a computed value, in light and dark, never judged by eye. A disabled control is exempt (WCAG 1.4.3) but must still look clearly different from enabled; active helper or error text beside it still meets AA
- [ ] **ARIA labels**: all non-text interactive elements have `aria-label`, `aria-labelledby`, or visible text
- [ ] **Semantic HTML**: use `<button>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<header>`, `<footer>`, no `<div>` soup
- [ ] **Heading hierarchy**: one `<h1>` per page, headings in order (`h1` → `h2` → `h3`), no skipped levels
- [ ] **Alt text**: all `<img>` elements have meaningful `alt` text (or `alt=""` for decorative images)
- [ ] **Motion preferences**: animations respect `prefers-reduced-motion: reduce`; use Tailwind's `motion-reduce:` variant
- [ ] **Touch targets**: minimum 44×44px for all interactive elements on touch devices
- [ ] **Screen reader tested**: content makes sense when read linearly; no information conveyed by colour alone
- [ ] **Form labels**: every form input has a visible `<label>` associated via `htmlFor`/`id`
- [ ] **Error identification**: form errors are described in text, not just colour; associated with the input via `aria-describedby`

## Component Patterns

- [ ] **The project's components first**: its design system's components, else shadcn/ui; extend with a variant before forking; never restyle a system component through `className`; don't reinvent existing primitives
- [ ] **Composition over props drilling**: prefer component composition (`children`, slots) over deep prop chains
- [ ] **Loading states**: every async operation has visible feedback: a skeleton when the shape is known (same footprint as the content it becomes, swapped once), a spinner when it is not, progress only when it is real
- [ ] **Two signals per action**: the control shows it heard the user, and the outcome shows it worked (or failed, with a next step). A control that silently does nothing is a defect
- [ ] **Error states**: every failure has a clear, actionable message with retry option where applicable; never a blank screen
- [ ] **Empty states**: empty lists/tables show a helpful message and call-to-action, not just blank space
- [ ] **Responsive breakpoints**: tested at mobile (375px), tablet (768px), and desktop (1280px) breakpoints
- [ ] **Client components**: `"use client"` directive added to all components using hooks, event handlers, or browser APIs
- [ ] **ErrorBoundary**: wrap critical sections in ErrorBoundary; provide fallback UI
- [ ] **Consistent patterns**: same UI pattern for same concept across the application (e.g., all delete actions use the same confirmation dialog)

## Performance

- [ ] **No layout shifts (CLS)**: images/embeds have explicit width/height or aspect-ratio; no content jumping on load
- [ ] **Image optimisation**: use Next.js `<Image>` component with appropriate `width`, `height`, and `priority` props
- [ ] **Client component boundaries**: keep `"use client"` as low in the tree as possible; don't wrap entire pages
- [ ] **Bundle impact**: new dependencies justified; check bundle size impact before adding libraries
- [ ] **Lazy loading**: below-the-fold content and heavy components use `dynamic()` or `React.lazy()`
- [ ] **Memoisation**: expensive computations wrapped in `useMemo`; callback functions in `useCallback` where re-renders are measured
- [ ] **Font loading**: use `next/font` for font optimisation; no external font CDN links

## User Workflow

- [ ] **Entry point clear**: user knows where they are and what they can do
- [ ] **Navigation intuitive**: user can always get back to where they came from
- [ ] **Feedback immediate**: every user action produces visible feedback within 100ms
- [ ] **Destructive actions guarded**: delete, remove, reset actions require confirmation
- [ ] **Progress preserved**: form data not lost on accidental navigation (warn or auto-save)
- [ ] **Input safety**: `useIMEComposition` hook for chat textareas (CJK input handling)

## Before Calling It Done

- [ ] **A green build is the floor, not the proof**: the production build passes, and every changed route renders with no console error, uncaught exception or framework error overlay
- [ ] **Both themes seen in a real browser**: screenshots in light and dark, or, when a screenshot cannot be taken, measured structural proof (box sizes, computed colours) named as measured rather than looked at
- [ ] **Report what was verified**: which checks ran and passed, which were skipped and why, and what was judged by hand. A skipped check is never reported as passing

On the ViewSonic design system, the bundled `elattar-uiux-design` skill's checks cover most of this list mechanically; see `frontend-design-trigger.md`.
