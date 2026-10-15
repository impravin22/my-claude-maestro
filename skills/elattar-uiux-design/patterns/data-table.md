# Data table

## Use when

**Use when** the user scans, sorts, filters or compares many records across several columns: users, invoices, logs.
**Don't use when** each record needs a rich view of its own (use [list-detail](list-detail.md)) or there are two or three columns of short text.

## Anatomy

| Group | Contents | Gap to next |
|---|---|---|
| Page header | `type-h2` heading, the one primary action ("Add member") | section step |
| Toolbar | search `Input`, filters; bulk actions replace it when rows are selected | field step |
| Table | `Table` with the identifying column first, numbers right-aligned | section step |
| Footer | count and `Pagination` | field step |

- Focal point: the first column (the record name) of the first row.
- Primary action: one `Button` in the header; row actions go in a menu, not as buttons on every row.
- Proximity: the row is the unit; column gaps are consistent.
- Text columns align at the start edge; number columns align at the end edge using `type-number-*`.

## The 13-line design pass, pre-filled

1. Alignment: text columns start-aligned, number columns end-aligned, header aligned with its column.
2. Contrast: secondary columns still 4.5:1; hover and selected rows keep text readable in both themes.
3. Balance: the identifying column gets the most width; no column is mostly empty.
4. Hierarchy: the header row is quieter than the data; the record name is the strongest text in the row.
5. Colour: neutral rows; colour only in the status `Badge`, with its text.
6. White space: row padding gives a comfortable target; no dense rows to fit one more column.
7. Proximity: toolbar controls grouped by purpose; the table sits closer to its toolbar than to the page header.
8. Movement: rows enter with `anim-enter` after loading; sorting or filtering does not animate the layout.
9. Proportion: constant row height; columns sized by content type.
10. Repetition: every row is built the same way from the same cell components.
11. Rhythm: equal row height; a taller row only for wrapped text.
12. Emphasis: one primary action; row actions quiet until hover or focus on wide screens, always visible below `md`, and reachable by keyboard.
13. Unity: `Table`, `Badge`, `Input`, `Pagination` from the system.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | the real header with five to eight `Skeleton` rows at row height | none |
| Empty | no records at all: `Empty` with a reason and the create action; no results from a filter: say so and offer "Clear filters" | what goes here + why empty + one action ("No members yet. Add the first one to start.") |
| Error | `Alert` above the table with a retry `Button`; the toolbar stays | what happened + what to do ("Could not load members. Check your connection, then try again.") |
| Partial | page loaded but a column or a row action failed: the cell shows a dash and the reason as text in the cell, the rest works | "Could not load status. Try again." |
| Success | row actions update that row in place and confirm with a `toast`; bulk actions say how many | verb + object, past tense, with count ("3 members removed"), and Undo when reversible |

## Skeleton code

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Member = { id: string; name: string; role: string; status: string; seats: number };

export function MembersTable({
  rows,
  total,
  loading,
  query,
  onQuery,
  onClearFilters,
  page,
  pageCount,
  onPage,
}: {
  rows: Member[];
  total: number;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onClearFilters: () => void;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const filtered = query.trim() !== "";
  const noRecords = !loading && total === 0 && !filtered;
  const noMatches = !loading && rows.length === 0 && filtered;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="type-h2">Members</h1>
        {noRecords ? null : <Button>Add member</Button>}
      </header>
      {noRecords ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No members yet</EmptyTitle>
            <EmptyDescription>Add the first member to start sharing access.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button>Add member</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Input
            aria-label="Search members"
            placeholder="Search by name"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className="max-w-sm"
          />
          {noMatches ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>No member matches that search. Try a different name.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="secondary" onClick={onClearFilters}>
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? [0, 1, 2, 3, 4].map((key) => (
                      <TableRow key={key}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="type-nav">{row.name}</TableCell>
                        <TableCell>{row.role}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right type-number-base">{row.seats}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          )}
          {loading || noMatches ? null : (
            <footer className="flex items-center justify-between gap-4">
              <span className="type-small text-muted-foreground">{total} members</span>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" disabled={page <= 1} onClick={() => onPage(page - 1)} />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" disabled={page >= pageCount} onClick={() => onPage(page + 1)} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </footer>
          )}
        </>
      )}
    </main>
  );
}
```

Skeleton rows: the code shows a few; use the count in the Loading row above.

## Common failures

- Numbers left-aligned or in a proportional role: right-align with a `type-number-*` role.
- A row action button on every row: one menu per row.
- Filtered-to-nothing shows the same empty state as "no data": say which one it is and how to recover.
- Header scrolls away on a long table: keep it sticky.
- Selection or scroll lost after an action: update the row in place.
