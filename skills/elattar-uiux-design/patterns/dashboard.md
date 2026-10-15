# Dashboard

## Use when

**Use when** the user lands to learn how things stand: a few key numbers, a trend, and what needs attention.
**Don't use when** the page is mostly a long table of records (use [data-table](data-table.md)) or one item is the subject (use [list-detail](list-detail.md)).

## Anatomy

| Group | Contents | Gap to next |
|---|---|---|
| Page header | `type-h2` heading, scope or date range, at most one action | section step |
| Key numbers | a row of three or four `Stat`s, same size | section step |
| Main view | one chart or one `Card` that answers the main question | section step |
| Secondary | a short list of what needs action | section step |

- Focal point: the first `Stat`, or the main chart if the question is a trend. Choose one.
- Primary action: at most one, in the header ("Export report"); a dashboard is for reading.
- Proximity: each number sits with its label, change and period; groups are separated by the section step, not by borders.
- Numbers use the `type-number-*` roles so digits align.

## The 13-line design pass, pre-filled

1. Alignment: stat cards share one top and one baseline; the grid has one column edge; numbers right-align in lists.
2. Contrast: value text in `text-foreground`; change indicators use the `-ink` tokens, never a raw role colour; run `contrast`.
3. Balance: the key-number row is even; the main view is wider than the secondary, not lopsided.
4. Hierarchy: `type-number-xl` or `type-number-lg` for the headline number; labels `type-small`; one focal point.
5. Colour: neutral by default; colour marks only meaning: up/down, over limit.
6. White space: section step between rows; no card is crowded to fit one more metric.
7. Proximity: a `Stat` keeps number, label, change and period together; the gap between stats is larger than the gap inside one.
8. Movement: numbers and charts enter with `anim-enter` once; refreshes change values in place with `anim-change`, never re-flowing the grid.
9. Proportion: stats equal width; the main view about two thirds of the row below.
10. Repetition: every metric is the same `Stat`; every panel the same `Card`.
11. Rhythm: equal step between rows; the same inner padding in every card.
12. Emphasis: one thing is loudest; "needs attention" items get a `Badge`, not a coloured background.
13. Unity: charts use the system's chart tokens, not their own palette.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | each `Stat` with `state="loading"`; `Skeleton` where a chart goes, at its final size | none |
| Empty | `Stat` with `state="empty"` and a message; the main view shows `Empty` | what goes here + why empty + one action ("No visits yet. Numbers appear after your first visit.") |
| Error | the failing panel alone shows `state="error"` or an `Alert` with a retry; the rest stays | what happened + what to do ("Revenue did not load. Try again.") |
| Partial | some panels loaded, others not: each panel handles its own state; a stale value carries "Updated 2 hours ago" | the panel says which data is old |
| Success | after a refresh or export: values update in place; export confirms with a `toast` | verb + object, past tense ("Report exported") |

## Skeleton code

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";

export function Dashboard({ loading }: { loading: boolean }) {
  const state = loading ? "loading" : "ready";
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="type-h2">Overview</h1>
        <Button variant="secondary">Export report</Button>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Visits" value="12,480" delta={{ direction: "up", value: "8%" }} hint="Last 30 days" state={state} />
        <Stat label="Sign-ups" value="640" delta={{ direction: "down", value: "2%" }} hint="Last 30 days" state={state} />
        <Stat label="Refunds" value="12" betterWhen="down" delta={{ direction: "flat", value: "0%" }} hint="Last 30 days" state={state} />
        <Stat label="Support tickets" value="" state="empty" message="No tickets yet. They appear when someone writes in." />
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Visits over time</CardTitle>
            <CardDescription>Daily visits, last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-64 w-full" /> : <div className="h-64 w-full" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing needs attention</EmptyTitle>
                <EmptyDescription>Items appear here when a number crosses its limit.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
```

## Common failures

- Eight equal stats: no focal point; keep three or four and pick the loudest.
- A change shown by red or green only: the `Stat` delta pairs colour with a sign and a word; keep it.
- Charts with their own palette or no loading size: use chart tokens and a fixed-height skeleton so nothing shifts.
- Percentages with no period or baseline: say "vs previous 30 days".
- Refresh re-renders the grid: update values in place.
