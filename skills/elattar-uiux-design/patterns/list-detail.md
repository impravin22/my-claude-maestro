# List and detail

## Use when

**Use when** the user browses a collection and opens one item to read or act on it: inbox, orders, tickets, projects.
**Don't use when** the user compares many columns across rows (use [data-table](data-table.md)) or there are fewer than about five items with no per-item actions.

## Anatomy

| Group | Contents | Gap to next |
|---|---|---|
| Page title | `type-h2` heading, count or filter summary | section step |
| List pane | rows: primary text, one line of secondary text, one status `Badge` | rows divided by `Separator`; list to detail is a section step |
| Detail pane | item title (`type-h3`), key facts, body, actions | field step inside; actions last |

- Focal point: the selected item's title in the detail pane.
- Primary action: one `Button` in the detail pane for the most common action on this item.
- At phone width the panes become two screens: list, then detail with a way back.
- Proximity: facts about one item stay together; list rows are alike so the eye can scan.

## The 13-line design pass, pre-filled

1. Alignment: list text and detail text each share one start edge; numbers and dates share one end edge.
2. Contrast: secondary text and badges meet 4.5:1 in both themes; the selected row is not told apart by colour alone.
3. Balance: list pane narrower than detail; neither looks empty at rest.
4. Hierarchy: `type-h3` item title is the focal point; list rows are one step quieter.
5. Colour: status carried by a `Badge` variant plus its text; one accent for the selected row.
6. White space: row padding is equal; the detail body has breathing room above the actions.
7. Proximity: title + status + date in a row belong together; a separator, not a gap, divides rows.
8. Movement: selecting a row changes the detail with `anim-enter`; the list does not reflow.
9. Proportion: row height is constant; the detail column is wider than the list column.
10. Repetition: every row is the same component with the same slots.
11. Rhythm: equal row step; detail sections use one step between each.
12. Emphasis: unread or selected rows are marked by weight and a marker, not a second colour; one primary action.
13. Unity: the same `Card`, `Badge`, `Separator` and type roles as the rest of the product.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | six `Skeleton` rows at the real row height; the detail pane shows a skeleton block | none |
| Empty | list: `Empty` with a reason and one action; detail with nothing selected: "Select an order to see it here" | what goes here + why empty + one action ("No orders yet. Orders appear after the first checkout.") |
| Error | list fails: `Alert` above the list with a retry `Button`; one item fails: error in the detail pane only | what happened + what to do ("Could not load orders. Check your connection, then try again.") |
| Partial | list loaded, detail still loading or failed: the list stays interactive | the detail pane shows its own skeleton or error |
| Success | an action on the item updates the row and the detail together and confirms with a `toast` | verb + object, past tense ("Order archived"), with Undo when reversible |

## Skeleton code

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type Row = { id: string; title: string; summary: string; status: string };

export function ListDetail({
  rows,
  loading,
  selectedId,
  onSelect,
}: {
  rows: Row[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="type-h2">Orders</h1>
      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardContent className="flex flex-col gap-1">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : rows.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No orders yet</EmptyTitle>
                  <EmptyDescription>Orders appear here after the first checkout.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((row, index) => (
                  <li key={row.id} className="flex flex-col gap-1">
                    {index > 0 ? <Separator /> : null}
                    <Button
                      type="button"
                      variant={row.id === selectedId ? "secondary" : "ghost"}
                      aria-current={row.id === selectedId ? "true" : undefined}
                      onClick={() => onSelect(row.id)}
                      className="h-auto w-full justify-between py-2"
                    >
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="type-nav">{row.title}</span>
                        <span className="type-small text-muted-foreground">{row.summary}</span>
                      </span>
                      <Badge variant="secondary">{row.status}</Badge>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="type-h3">{selected ? selected.title : "Order details"}</CardTitle>
              <CardDescription>{selected ? selected.summary : "Select an order to see it here."}</CardDescription>
            </CardHeader>
            {selected ? (
              <CardContent>
                <Button>Archive order</Button>
              </CardContent>
            ) : null}
          </Card>
        )}
      </div>
    </main>
  );
}
```

Skeleton rows: the code shows a few; use the count in the Loading row above.

## Common failures

- Detail pane blank with no hint: say what to select.
- The list jumps to the top when an item updates: keep scroll and selection.
- Rows that differ in height or slots: one row component.
- Status shown by colour only: pair the `Badge` colour with its text.
- Phone width shows both panes squeezed: two screens, with a way back.
