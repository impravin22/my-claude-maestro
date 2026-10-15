# UX rules

Twenty-four rules for how a screen behaves and what the user has to know. Read at the Design pass (one line per rule that applies) and at the Review (answer every **Review** question). Sources: NN/g on information architecture and navigation; Norman, *The Design of Everyday Things*; Krug, *Don't Make Me Think*; Nielsen's ten heuristics; Yablonski, *Laws of UX*; Cooper, *About Face*; Lidwell et al., *Universal Principles of Design*; Schwartz, *The Paradox of Choice*.

Checks catch the mechanical half. A passing check is never proof the rule holds: the **Review** question is.

| Check id | Run with | Fires on | Rule |
|---|---|---|---|
| `raw-error` | `run.mjs ux` | a rendered `.message`, `.stack`, `.statusText`, `.code`, `String(err)` or `` `${err}` `` | 16 |
| `system-words` | `run.mjs ux` | on-screen text with null, undefined, payload, endpoint, exception, a status code, a raw id, json, api ... | 4, 16 |
| `unconfirmed-destructive` | `run.mjs ux` | a destructive button with no confirmation and no undo | 8 |
| `term-drift` | `run.mjs ux` | one action under two labels across files (review item) | 6 |
| `no-feedback` | `run.mjs ux-flow` | a click with no visible change (a stub: complete the flow), or pending over 1s with no progress indicator | 2, 24 |
| `slow-response` | `run.mjs ux-flow` | first visible change later than 400ms | 3 |
| `no-escape` | `run.mjs ux-flow` | an overlay Escape does not close, or a dialog with no visible close or cancel | 5 |
| `lost-input` | `run.mjs ux-flow` | a failed submit that empties, resets or removes what the user typed | 20 |
| `page-length` | `run.mjs page-length` | a document over 3 screens on desktop or 6 on a phone (not a feed) | 21 |
| `nav-reach` | `run.mjs nav-reach` | on a phone, no navigation on screen at the bottom of a long page, or a desktop destination with no path | 22 |
| `anchor-nav` | `run.mjs anchor-nav` | a navigation whose links mostly jump to `#sections` of the same page | 23 |

`allowSystemWords` in `viewsonic-ui.config.json` lists words the product really uses ("API" in a developer tool). It is not `allowWords`, which keeps capitals. Both are judged per word, never per file.

## 1. Don't make me think

**Rule.** Every screen is obvious without explanation: what it is, what to do first, what each control does.
**Why.** Krug: people scan, satisfice and muddle through; a screen that asks for thought loses them.
**Judge it.** Review: "Could a stranger use this without reading help?"

## 2. Show system status

**Rule.** Every action gets feedback. Anything that takes longer than 1s shows progress; the result is stated when it finishes.
**Why.** Nielsen 1, visibility of system status; Norman's feedback: without it people repeat the action or give up.
**Judge it.** `no-feedback` (browser): click each non-destructive button with the network held 1500ms; something must change, and past 1s a progress indicator (`role=progressbar`, `aria-busy`, skeleton, spinner or a busy label) must be visible. Review: "Trigger the success and the failure toast in the light theme: does it look like the page it is on?" (The `Toaster` must sit inside the app's theme provider.) "Did you open every dialog, sheet and menu, and stay silent in the console?" (`runtime-errors` does this pass; a missing provider only fails when the overlay opens.)

## 3. Respond in under 400ms

**Rule.** Something visible changes within 400ms of every input, even before the work finishes: a pressed or busy state, an optimistic update, a skeleton.
**Why.** The Doherty threshold: under 400ms the exchange feels like a conversation; over it, attention drifts.
**Judge it.** `slow-response` (browser): the first DOM change, busy state, live-region text or navigation after a click comes within 400ms. Run it against a production build: a dev server compiles a route or chunk on first use and adds latency that real users never see.

## 4. Speak the user's language

**Rule.** No system words, real-world conventions. Words, phrases and concepts are the user's, not the developer's.
**Why.** Nielsen 2, match between system and the real world.
**Judge it.** `system-words` (blocklist; it catches leaks only) and Review: "Would the user say these words?"

## 5. Always a way out

**Rule.** Undo, cancel, back. Escape closes any overlay, and every dialog also shows a visible Close or Cancel control.
**Why.** Nielsen 3, user control and freedom: people choose by mistake and need an emergency exit.
**Judge it.** `no-escape` (browser): every overlay opened by a trigger closes on Escape, and a dialog shows a visible close or cancel. Review: "Can the user back out of every step and every mistake?"

## 6. Consistency

**Rule.** Same word, same action, same place everywhere. One label per action across the whole product.
**Why.** Nielsen 4, consistency and standards; each new word is something to learn.
**Judge it.** `term-drift` (static): one label per action across files (Delete or Remove, Save or Update, Create or Add, Edit or Modify). It reports pairs for a human to settle and never changes anything. Review: "Does this action keep its name, look and place on every screen?"

## 7. Familiar beats clever

**Rule.** Work the way other products do. Spend novelty only where it earns something.
**Why.** Jakob's law: people spend most of their time in other products and expect yours to behave the same.
**Judge it.** Review: "Would a user who has never seen this product guess where this control is and what it does?"

## 8. Prevent errors before messaging them

**Rule.** Constraints, safe defaults, and destructive actions confirm (or do at once and offer Undo).
**Why.** Nielsen 5, error prevention; Norman's constraints: the best error message is the one never needed.
**Judge it.** `unconfirmed-destructive` (static): a destructive button whose handler neither opens a confirmation nor sits in an AlertDialog nor offers undo. Handlers written in another file are not judged: Review them.

## 9. Recognition over recall

**Rule.** Show the options. Never make users remember something from one screen to use on the next.
**Why.** Nielsen 6: recognising is cheap, recalling is expensive.
**Judge it.** Review: "Does anything on this screen ask the user to remember what they saw elsewhere?"

## 10. Fewer choices

**Rule.** Cut options. Reveal advanced ones progressively.
**Why.** Hick's law: decision time grows with the number of choices; Schwartz: more choice, less satisfaction.
**Judge it.** `emphasis` (one default action per main, dialog or card) and Review: "What can come out, and what can wait behind 'Advanced'?"

## 11. Big and close for frequent actions

**Rule.** Minimum 24×24 (WCAG 2.5.8) for every target; primary and frequent touch actions use a component size ≥ 44 (e.g. `lg`). Never meet a size target by overriding components, use their sizes. Frequent actions sit where attention already is, next to what they affect.
**Why.** Fitts's law: time to hit a target falls with its size and rises with its distance.
**Judge it.** `keyboard/small-target` (browser, `run.mjs keyboard`) fails a target under 24×24 that also fails the WCAG spacing exception and notes how many are under 44; `global-override` (static) bans forcing a size page-wide. Review for placement: "Is the most frequent action the nearest and largest thing to where the eye already is?"

## 12. Signifiers

**Rule.** Clickable looks clickable, and nothing else does.
**Why.** Norman: a signifier tells people where the action is; an affordance nobody can perceive is wasted.
**Judge it.** Review: "Is there anything that looks clickable and is not, or clickable and does not look it?"

## 13. Mapping

**Rule.** A control sits next to what it changes, in the same arrangement as the thing it controls.
**Why.** Norman: natural mapping needs no label and no memory.
**Judge it.** Review: "Does each control sit beside the thing it changes?"

## 14. Match the mental model

**Rule.** It works the way the user thinks it works, not the way the system is built.
**Why.** Norman, Cooper: users act on their model; when the system's differs, errors are the design's fault.
**Judge it.** Review: "Does the structure follow the user's task, or the database?"

## 15. Minimalism

**Rule.** Every element earns its place. Cut words in half, then cut again.
**Why.** Nielsen 8, aesthetic and minimalist design; Krug: every extra element competes with the one that matters.
**Judge it.** Review: "What can be removed without the user noticing?"

## 16. Never show the backend

**Rule.** No error codes, exception text, `error.message` or server responses on screen. The user always gets a human message: what happened in their terms, and what they can do next.
**Why.** Nielsen 9, help users recognise, diagnose and recover from errors: plain language, no codes, a constructive suggestion.
**Judge it.** `raw-error` (static), `system-words` on error strings, and `content/vague-error`. Log the error, render a written message. A message mapped from a code through the project's translate function is fine; rendering the code is not. Review: "If the server said something odd right now, what would the user read?"

## 17. Shortcuts for experts

**Rule.** Keyboard and bulk actions that never slow beginners down.
**Why.** Nielsen 7, flexibility and efficiency of use.
**Judge it.** Review: "Can a frequent user do the common task without the mouse, or in bulk, while a first-time user is not shown anything extra?"

## 18. Help in context

**Rule.** Hints where they are needed, not in a manual.
**Why.** Nielsen 10, help and documentation: when help is needed it should be searchable, short and tied to the task.
**Judge it.** Review: "Is the explanation at the field or step where the question arises?"

## 19. Peak and end

**Rule.** The key moment and the finish feel good. A success state is designed.
**Why.** The peak-end rule: people remember the most intense moment and the last one, not the average.
**Judge it.** Review: "Is the success moment designed, not just a toast?"

## 20. Respect effort

**Rule.** Never lose input. Keep drafts. Remember choices. An error never costs the user what they typed.
**Why.** Cooper: software should remember what the user told it and never make them do work twice.
**Judge it.** `lost-input` (browser): fill each form, answer every write with a 500, and every field must still hold its value. Password fields are not judged: clearing one on failure is a security convention. Review: "If the page reloaded now, what would the user have to redo?"

## 21. One view, one job

**Rule.** A view does one job. When a page holds many independent sections, or runs past about 3 screens on desktop or 6 on a phone, split it into views (tabs or sub-routes, each with its own URL) with persistent navigation that shows where the user is. An endless feed or results list is content, not several jobs: it is not split, but its navigation and primary action stay reachable (sticky), and any panel hidden on a phone has another path.
**Why.** NN/g on information architecture: group content by the user's tasks, not into one undifferentiated page; Krug's trunk test: at any page the user can tell where they are and what else is available.
**Judge it.** `page-length` (browser, `run.mjs page-length`): the document is taller than 3 screens on desktop or 6 on phone (`pageLengthDesktop`, `pageLengthPhone` in the config change the limits); skipped when one repeating list is over 60% of the height. Review: "What is the one job of this view, and does the navigation say which view I am in?"

## 22. Every destination within two interactions

**Rule.** From every page, at every breakpoint, the user reaches every page and feature in two interactions or fewer, with no long scroll to find the way: navigation that stays on screen (sticky or fixed bar, menu button), or a list that drills into a page with a back control. Responsive hiding never removes the only path to something.
**Why.** NN/g on navigation: people need to see where they can go and how to get back; Krug's trunk test: navigation must be findable from every page.
**Judge it.** `nav-reach` (browser, `run.mjs nav-reach`): on a 390×844 page taller than 2 screens, scrolled to the bottom, a navigation landmark or menu button must still be on screen; and every destination of the desktop navigation needs a visible link or a menu button at phone width. Review: "Can I get to any other page or feature in two taps, from the bottom of the page, on a phone?"

## 23. Navigation switches views

**Rule.** Main navigation switches views; it never scroll-jumps the page. In-page anchors belong only to one long document (a table of contents), with the current item marked.
**Why.** NN/g on navigation: a destination is a place with its own address, and a jump inside one page breaks that model and the back button.
**Judge it.** `anchor-nav` (browser, `run.mjs anchor-nav`): a nav, aside or navigation landmark whose links are mostly same-page `#hash` links (3 or more). Review: "Does choosing a navigation item change the view and the URL, and is the current item marked?"

## 24. Every action completes its task

**Rule.** No dead-end control. A consequential change opens a complete flow: the options, the current state marked, what changes and what it costs, a confirm, and feedback when it is done. A collection offers full management where it applies: add, edit, remove, set default; created items can be edited and deleted (confirm or undo), and a displayed count or summary leads to its list. A stub is a dead end: a handler that only toasts "coming soon", a button that changes nothing, a link whose target ignores its parameter (the URL changes and the page does not).
**Why.** Nielsen 3 and 7 (user control, efficiency) and Norman's gulf of execution: a control that promises a task and does not deliver it leaves the user stranded.
**Judge it.** `no-feedback` (browser, `run.mjs ux-flow`) fires on a button that changes nothing; its fix says to complete the flow. Review: click every control and assert something observable changed; "Does every button finish the job it names? Can I add, edit, remove and choose the default for each collection? Does every count lead to its list?"
