# Page patterns

**Choose a pattern only if the user gave no design information.** If they gave a design, reference, sketch, layout idea or creative direction, skip this step, load no pattern, and design from their input with `rules/`. A creative layout is still built from the system's tokens and components.

Patterns are a fallback, never a rule. No check fails because a screen does not follow one; only the system rules (tokens, contrast, motion, accessibility, content) are enforced.

## Route by the user's words

| The user says | Pattern |
|---|---|
| create, add, edit, sign up, contact, checkout, "a form" | [form](form.md) |
| preferences, account, profile, notifications, privacy, billing, "settings" | [settings](settings.md) |
| inbox, orders, tickets, messages, projects, "browse and open" | [list-detail](list-detail.md) |
| overview, metrics, KPIs, analytics, "how are we doing", home | [dashboard](dashboard.md) |
| users, invoices, logs, records, sort, filter, export, "a table" | [data-table](data-table.md) |
| onboarding, welcome, getting started, setup, empty workspace | [first-run](first-run.md) |

If two rows fit, take the one that names what the user does on the page, not what the data is.

## Combining

A page may use more than one pattern. One pattern owns the page (its Anatomy sets the order and the single primary action); the others fill a section.

| Combination | How |
|---|---|
| dashboard + data-table | dashboard owns the page; the table is the "secondary" section, trimmed to five to ten rows with a link to the full table page |
| list-detail + form | list-detail owns the page; the form replaces the detail pane when editing |
| settings + form | settings owns the page; a section that needs several inputs uses the form's `FieldGroup` and a save `Button` |
| first-run + form | first-run owns the page; the next step opens the form inline or as the next screen |

Combined pages keep one focal point and one primary action. Write the 13-line design pass once, for the whole page.

## Using a pattern

1. Read the pattern's Anatomy, then copy its 13-line design pass and adjust each line to this screen.
2. Replace the example names and copy in the Skeleton code with the real ones. Keep the components and the token roles.
3. Build every state in its States table, then check with `node <skill>/checks/run.mjs fast`.
