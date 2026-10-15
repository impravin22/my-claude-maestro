# Form

## Use when

**Use when** one task needs several inputs and one submit: create, edit, sign up, contact, checkout details.
**Don't use when** the fields save one by one on change (use [settings](settings.md)) or the input is a single search box.

## Anatomy

Top to bottom, one column, one left edge.

| Group | Contents | Gap to next |
|---|---|---|
| Title block | `type-h2` heading, one line of context | section step |
| Fields | `FieldGroup` of `Field`s: label, control, helper or error | tight step between label, control and helper; row step between fields |
| Actions | one primary `Button`, one `secondary` cancel | section step above |

- Focal point: the heading, then the first empty field.
- Primary action: the submit `Button` (default variant), named for the result ("Create project"), never "Submit".
- Proximity: label, control and helper sit one scale step tighter than the gap between fields.
- Width: a form column is 45-75 characters wide, not the whole page.
- Files: a file field is a `Dropzone` (or a `Button` that opens the one `FilePicker`), never a raw `<input type="file">`; show what the upload limits skipped ([components.md](../system/components.md#uploads)).
- Several screens in a row: a `Stepper` above the form shows where the user is; the Back and Next buttons stay yours.

## The 13-line design pass, pre-filled

1. Alignment: one left edge for title, labels, controls and actions; labels above controls, never centred.
2. Contrast: helper and error text use `text-muted-foreground` and `text-destructive-ink`; run `contrast` for both themes.
3. Balance: a single column capped by `max-w-xl`; actions sit at the start edge, not floating right on a wide page.
4. Hierarchy: `type-h2` title is the focal point; field labels use the system label role; one default `Button`.
5. Colour: neutral surface; `destructive` only on an error; no brand colour on labels.
6. White space: section step between title, fields and actions; nothing touches the card edge.
7. Proximity: label + control + helper form one `Field`; `FieldGroup` spaces the fields apart.
8. Movement: errors appear with `anim-enter`; the submit state swaps with `anim-change`; nothing jumps when an error opens.
9. Proportion: every control is the same height (`Input`, `Button` default size); the submit is not larger than the fields.
10. Repetition: every field is the same `Field` + `FieldLabel` + control; a new field copies the old one.
11. Rhythm: equal row step between fields; a bigger step only before the actions.
12. Emphasis: only the submit is filled; cancel is `secondary`; required marks are plain text, not colour.
13. Unity: the same card, radius and type roles as every other page; no one-off styling.

## States

| State | What shows | Microcopy shape |
|---|---|---|
| Loading | `Skeleton` per field while existing values load; submit disabled | none, or "Loading your details" for assistive tech |
| Empty | the blank form is the empty state; helper text says what the field is for | helper: what to enter and why it is needed |
| Error | `FieldError` under the field, plus a summary `Alert` when several fail; focus moves to the first bad field | what happened in the user's terms + what to do next ("Enter an email like name@example.com"); never backend text |
| Partial | some fields valid, others not: valid fields stay, only bad ones show errors; the draft is kept on a failed submit | error on the bad fields only |
| Success | confirmation `toast` or a redirect to the created item; the button returns to rest | verb + object, past tense ("Project created"), with a next action |

Submit pending: the button keeps its width, shows `Spinner`, and its label becomes "Creating project".

## Skeleton code

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type Values = { name: string; owner: string };
type Errors = Partial<Record<keyof Values, string>>;

export function FormPage({
  values,
  errors,
  loading,
  pending,
  onChange,
  onSubmit,
}: {
  values: Values;
  errors: Errors;
  loading: boolean;
  pending: boolean;
  onChange: (field: keyof Values, value: string) => void;
  onSubmit: () => void;
}) {
  const failed = Object.values(errors).filter(Boolean).length;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <h1 className="type-h2">Create a project</h1>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onSubmit();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
            <CardDescription>You can change these later.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {failed > 1 ? (
              <Alert variant="destructive">
                <AlertTitle>{failed} fields need attention</AlertTitle>
                <AlertDescription>Fix the marked fields, then create the project again.</AlertDescription>
              </Alert>
            ) : null}
            {loading ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <FieldGroup>
                <Field data-invalid={errors.name ? true : undefined}>
                  <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                  <Input
                    id="project-name"
                    name="name"
                    required
                    value={values.name}
                    onChange={(event) => onChange("name", event.target.value)}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? "project-name-error" : "project-name-help"}
                  />
                  {errors.name ? (
                    <FieldError id="project-name-error">{errors.name}</FieldError>
                  ) : (
                    <FieldDescription id="project-name-help">Shown to everyone on the team.</FieldDescription>
                  )}
                </Field>
                <Field data-invalid={errors.owner ? true : undefined}>
                  <FieldLabel htmlFor="project-owner">Owner email</FieldLabel>
                  <Input
                    id="project-owner"
                    name="owner"
                    type="email"
                    required
                    value={values.owner}
                    onChange={(event) => onChange("owner", event.target.value)}
                    aria-invalid={errors.owner ? true : undefined}
                    aria-describedby={errors.owner ? "project-owner-error" : undefined}
                  />
                  {errors.owner ? <FieldError id="project-owner-error">{errors.owner}</FieldError> : null}
                </Field>
              </FieldGroup>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="submit" disabled={loading} aria-disabled={pending || undefined}>
              {pending ? <Spinner /> : null}
              {pending ? "Creating project" : "Create project"}
            </Button>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
}
```

## Common failures

- Placeholder used as the label: it vanishes on typing; always a `FieldLabel`.
- Error shown only by colour, or only in a toast that disappears: put `FieldError` next to the field and move focus to it.
- "Submit" or "OK" as the button label: name the result (verb + object).
- Two filled buttons: one primary; cancel is `secondary`.
- A failed submit clears what the user typed: keep the draft.
