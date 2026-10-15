# Settings

## Use when

**Use when** the page holds preferences or account options the user returns to and changes one at a time: profile, notifications, privacy, billing details.
**Don't use when** the user fills a one-off set of inputs and submits once (use [form](form.md)).

## Anatomy

Settings is many jobs, so it is many views: one section per view, each at its own URL (`/settings/notifications`), never one long page and never jump-links to anchors.

| Where | Contents | Gap to next |
|---|---|---|
| Desktop | section navigation on the start edge (a `nav` of links, the current one marked `aria-current="page"`) beside the one open section | column step |
| Phone | `/settings` is an index list of sections; choosing one opens that section as its own page with a back link to the index | section step |
| Section view | `type-h2` title, one line of context, then `Card`s for the topics of this section | section step |
| Setting row | label + one line of description on the start edge, the control on the end edge | row step inside the card |
| Danger card | last card of the section that owns it, same layout, `destructive` action | larger step above it |

- Focal point: the section title, then the first card.
- Primary action: per section, at most one `Button` ("Save changes"), and only where the section needs an explicit save; switches save on change.
- Every setting completes its task: a consequential change (plan, payment method) opens a full flow with the options, the current one marked, what changes, a confirm and feedback; a collection (cards, devices, members) offers add, edit, remove and set default.
- Proximity: a row's label and description are tighter than the gap between rows; one card per topic.

## The 13-line design pass, pre-filled

1. Alignment: labels and descriptions share the start edge; controls share the end edge; nothing centred.
2. Contrast: descriptions in `text-muted-foreground`; run `contrast` for both themes.
3. Balance: the section navigation is narrower than the section it opens; no card is much taller than its neighbours without reason.
4. Hierarchy: `type-h2` section title, `CardTitle` per card; the open section is the only content.
5. Colour: neutral cards; `destructive` only on the danger card; the current navigation item marked by weight and `aria-current`, not colour alone.
6. White space: section step between cards; the card padding is the system default.
7. Proximity: label + description + control are one row; rows in a card are one topic.
8. Movement: a switch flips with its own transition; a saved confirmation uses `anim-enter`; changing section swaps the view in place.
9. Proportion: every row is the same height unless it holds a longer description; navigation items are equal.
10. Repetition: every row is the same structure; a new setting copies an existing row; every section view has the same header.
11. Rhythm: equal row step in every card; equal step between cards and between navigation items.
12. Emphasis: no filled button in a card without unsaved changes; the danger action is the only `destructive` element.
13. Unity: cards, switches and buttons are the system's, so this page looks like the rest of the product.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | `Skeleton` row per setting, same height as a real row; the navigation is already there | none |
| Empty | a section with nothing to configure: `Empty` with the reason and one action | what goes here + why empty + one action ("No connected apps yet. Connect one to share data.") |
| Error | the switch returns to its old value; an inline `FieldError` next to the control says what failed and stays until the next attempt | what happened + what to do ("Could not turn on alerts. Check your connection and try again.") |
| Partial | one card fails to load: that card shows an error and a retry `Button`, the rest of the section and the navigation stay usable | "Notifications did not load. Try again." |
| Success | `toast` confirms the change; a switch needs no toast if the change is visible | verb + object, past tense ("Notifications turned on") |

Destructive or irreversible settings ask for confirmation in a dialog that names the thing being changed.

## Skeleton code

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type Section = { slug: string; title: string };

// `current` is the open section's slug, or null on the phone index (/settings).
export function SettingsLayout({ sections, current, loading }: { sections: Section[]; current: string | null; loading: boolean }) {
  const open = sections.find((section) => section.slug === current);
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 p-6 md:grid-cols-4">
      <nav aria-label="Settings" className={`flex-col gap-1 md:flex ${open ? "hidden" : "flex"}`}>
        <h1 className="type-h2">Settings</h1>
        {sections.map((section) => (
          <Link
            key={section.slug}
            href={`/settings/${section.slug}`}
            aria-current={section.slug === current ? "page" : undefined}
            className="type-body rounded-md p-2 aria-[current=page]:bg-muted"
          >
            {section.title}
          </Link>
        ))}
      </nav>
      {open ? (
        <section aria-labelledby="section-title" className="flex flex-col gap-6 md:col-span-3">
          <Link href="/settings" className="type-small text-muted-foreground md:hidden">
            Back to settings
          </Link>
          <h2 id="section-title" className="type-h2">{open.title}</h2>
          <Card>
            <CardHeader>
              <CardTitle>Email</CardTitle>
              <CardDescription>Choose what reaches your inbox.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Field orientation="horizontal">
                  <FieldContent className="min-w-0">
                    <FieldLabel htmlFor="weekly-summary">Weekly summary</FieldLabel>
                    <FieldDescription>One email every Monday with last week's activity.</FieldDescription>
                  </FieldContent>
                  <Switch id="weekly-summary" defaultChecked className="shrink-0" />
                </Field>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Delete account</CardTitle>
              <CardDescription>This removes your data and cannot be undone.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="destructive">Delete account</Button>
            </CardFooter>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
```

## Common failures

- Every section on one scrolling page, or a side list of `#anchor` links: one section per view, each with its own URL; navigation switches views and never jump-scrolls.
- On a phone the navigation scrolls away or the sections are unreachable: `/settings` is an index list, each section a page with a back link, never a squeezed two-column layout.
- A button that leads nowhere ("Change plan", "Change payment method"), or a collection with no way to add: each opens a complete flow; cards, devices and members can be added, edited, removed and set as default.
- A save button for a switch: switches act on change; confirm through the visible result.
- Controls scattered at different x positions, or a switch squeezed at phone width: all controls on one end edge, the row stays horizontal at every width, the label column wraps (`min-w-0`) and the control keeps its size (`shrink-0`).
