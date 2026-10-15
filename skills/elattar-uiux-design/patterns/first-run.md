# First run

## Use when

**Use when** a new user or a new, empty workspace needs to reach its first useful result: onboarding, an empty project, a first-time setup.
**Don't use when** the user is returning to a populated product (show the product, with its own empty states) or the setup is one field (use [form](form.md)).

## Anatomy

| Group | Contents | Gap to next |
|---|---|---|
| Welcome | `type-h2` heading naming the outcome, one line on what happens next | section step |
| Steps | two to four steps in a `Card`: each a `type-nav` title, one line of why, its state | row step |
| Next action | the one step the user should do now, with its `Button` | field step |
| Escape | a quiet way to skip or come back later | field step |

- Focal point: the next step, never the whole list.
- Primary action: one `Button` on the next step ("Connect a data source"); completed steps have none.
- Proximity: each step's title, reason and action stay together; finished steps are quieter, upcoming steps are muted but readable.
- Progress is shown as "2 of 4"; use `Progress` only if it adds information.

## The 13-line design pass, pre-filled

1. Alignment: one start edge for heading, steps and actions; no centred paragraphs.
2. Contrast: muted upcoming steps still meet 4.5:1; completion is not shown by colour alone.
3. Balance: a single column with a capped width, centred as a block but left-aligned inside.
4. Hierarchy: `type-h2` outcome heading; the next step is the loudest row.
5. Colour: neutral; success tokens only on the completed mark, with a label.
6. White space: generous section step; nothing competes with the next step.
7. Proximity: step title + reason + action grouped; a larger step between steps.
8. Movement: a completed step eases to its done state with `anim-change`; the next step takes focus calmly.
9. Proportion: steps are equal height; the next step's button is the most prominent control.
10. Repetition: every step is the same row structure.
11. Rhythm: equal step between rows; the skip link is set apart.
12. Emphasis: one filled `Button`; skip is a `link` variant.
13. Unity: the same card, type roles and tokens as the product it leads into.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | `Skeleton` rows while progress loads, so a returning user never sees step one flash | none |
| Empty | this pattern is the empty state of the workspace: say what will appear once set up | what goes here + why empty + one action ("Your dashboard fills in after you connect a source.") |
| Error | the failed step shows what went wrong inline with a retry; other steps stay available | what happened + what to do ("We could not connect to that source. Check the address, then try again.") |
| Partial | some steps done: leaving and returning keeps progress; the done steps stay a quiet line | "2 of 4 done" |
| Success | when the last step finishes the page changes into the product with a short confirmation; this page never shows again | verb + object, past tense ("Source connected"), then the product's own first screen |

## Skeleton code

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type Step = { id: string; title: string; reason: string; done: boolean };

export function FirstRun({ steps, loading }: { steps: Step[]; loading: boolean }) {
  const next = steps.find((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-h2">Get your first report</h1>
        <p className="type-body text-muted-foreground">Four short steps, about five minutes.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Set up</CardTitle>
          <CardDescription>{loading ? "Loading your progress" : `${doneCount} of ${steps.length} done`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : (
            <ol className="flex flex-col gap-4">
              {steps.map((step, index) => (
                <li key={step.id} aria-current={step.id === next?.id ? "step" : undefined} className="flex flex-col gap-4">
                  {index > 0 ? <Separator /> : null}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="type-nav">{step.title}</span>
                      <span className="type-small text-muted-foreground">{step.reason}</span>
                    </div>
                    {step.done ? (
                      <Badge variant="success">Done</Badge>
                    ) : step.id === next?.id ? (
                      <Button>{step.title}</Button>
                    ) : (
                      <Badge variant="outline">Later</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      <Button variant="link" className="self-start">
        Skip for now
      </Button>
    </main>
  );
}
```

## Common failures

- A tour of tooltips before any action: lead with the first useful step.
- Steps as loose `div`s with a filled button on each: the steps are an ordered list (`ol` and `li`, the next one `aria-current="step"`), and only the next one has the filled button.
- No way out: always a quiet skip, and progress survives leaving.
- The checklist reappears after completion: persist done and hide it.
- A step titled "Next" or "Continue": name the verb and object.
