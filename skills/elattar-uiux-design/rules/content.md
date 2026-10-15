# Content and microcopy

Every word on the screen is interface. Read it at the Design pass (write the copy with the layout, not after) and at the Review. `node <skill>/checks/run.mjs content` catches the mechanical failures; whether a stranger would understand a sentence is judged by reading it.

| Check id | Fires on | Rules below |
|---|---|---|
| `vague-action` | an action label of OK, Submit, Yes, No, Click here, Go or Continue alone | Actions say what happens |
| `vague-error` | "Oops", a bare "Something went wrong", a bare "Error" | Errors |
| `title-case` | 3+ words with two or more capitalised after the first | Sentence case |
| `exclamation` | `!` in a label, title, description or error | No exclamation marks |
| `confirm-without-verb` | a confirm button that is not a verb phrase (Yes, OK, Confirm, Proceed ...) | Confirmations |
| `vague-confirm-title` | a confirm dialog title that names no consequence ("Are you sure?", "Confirm", "Warning") | Confirmations |

`properNouns` and `allowWords` in `viewsonic-ui.config.json` are both lists of words that keep their capitals: names ("GitHub Actions") in the first, product terms in the second. Neither exempts an action label or an error. Pending labels ("Deleting...", "Please wait") are states, not actions, and are never judged as actions. The check reads written-out text only; text assembled at run time is judged by eye.

## Actions say what happens

**Rule.** A button or link says what happens: a verb, plus an object when the verb alone is ambiguous ("Save" and "Retry" are fine).
**Why.** People scan buttons, not paragraphs. A label that needs the sentence above it to make sense fails for anyone who skipped the sentence, including a screen reader reading a list of buttons.
**Do.** "Save changes", "Invite member", "Download report".
**Don't.** "OK", "Submit", "Yes", "Click here", "Go".

## The action matches what it opens

**Rule.** The label of an action matches the title of what it opens.
**Why.** The title is the confirmation that the click went where intended.
**Do.** A button "Add member" opens a dialog titled "Add member".
**Don't.** A button "Add member" that opens "New entry".

## Errors

**Rule.** An error says what happened, why if it is known, and what to do next.
**Why.** An error with no next step is a dead end; blame and noise make it worse.
**Do.** "Could not save your changes. Check your connection, then try again." Write "could not" and "cannot" in full, in errors and confirmations alike.
**Don't.** "Oops", a bare "Something went wrong", "Error 500", "You entered an invalid value".

## Never show the backend

**Rule.** Never show the backend: no error codes, exception text, `error.message` or server responses on screen. Always a human message: what happened in the user's terms, and what they can do next.
**Why.** Backend text is written for the developer who caused it, changes without notice, and can leak internals. The log keeps it; the screen does not.
**Do.** Catch the failure, log the raw error, show "Could not load your orders. Try again in a minute." Map known cases (offline, no permission, not found, validation) to their own message.
**Don't.** `toast(error.message)`, `<p>{String(err)}</p>`, "TypeError: Cannot read properties of undefined", "ECONNREFUSED", "Request failed with status code 502".

## Empty states

**Rule.** An empty state says what goes here, why it is empty, and the one action that fills it.
**Why.** An empty area is the first thing a new user sees; it is the cheapest place to teach.
**Do.** "No members yet. Add the first one to share access." with one "Add member" button. When nothing the user does can fill it, say when it fills: "Orders appear here after the first checkout."
**Don't.** "No data", a blank panel, or three equal buttons.

## Confirmations

**Rule.** A confirmation names the consequence in its title, and its button is a verb phrase that says what will happen.
**Why.** "Yes" has no meaning without rereading the question; a verb phrase makes the choice readable on its own. A noun title such as "Unsaved changes" is fine when the button says "Discard changes".
**Do.** Title "Delete 3 files?", description "This cannot be undone.", buttons "Cancel" and "Delete files".
**Don't.** "Are you sure?" with "Yes" and "No", or "Confirm" and "Proceed".

## Sentence case

**Rule.** Sentence case everywhere: capitalise the first word and proper nouns.
**Why.** Title case is harder to scan and hides which words are proper nouns.
**Do.** "Create new project", "Connect your account".
**Don't.** "Create New Project", "Connect Your Account".

## No exclamation marks

**Rule.** No exclamation marks in interface text.
**Why.** The product is calm. Cheerfulness over a failure or a routine action is noise, and it ages badly.
**Do.** "Project created".
**Don't.** "Project created!", "Welcome back!", "Oops!".

## One term per concept

**Rule.** One word for one thing across the whole product.
**Why.** A second word reads as a second feature. People stop to ask whether "workspace" and "project" are different.
**Do.** Pick "project" and use it in buttons, titles, errors and emails.
**Don't.** "Project" in the menu, "workspace" in the dialog, "space" in the toast.

## Numbers, dates and money

**Rule.** Numbers, dates and money go through one formatter each, never string concatenation.
**Why.** Locale, grouping, currency and time zone are easy to get wrong in ten places and right in one.
**Do.** `formatCurrency(amount)`, `formatDate(date)` from one module.
**Don't.** `"$" + total`, `date.toISOString().slice(0, 10)` on screen.

## Loading

**Rule.** When loading takes more than a second, say what is loading.
**Why.** A spinner alone cannot tell "working" from "stuck".
**Do.** "Loading your orders", "Exporting report".
**Don't.** A bare spinner for ten seconds, or "Please wait".

## Judge it

Read every word on the screen. Does each button say what happens? Does every error give a next step? Would a stranger understand it? Does anything on screen look like something a server or a developer wrote? One line each, PASS or the fix.
