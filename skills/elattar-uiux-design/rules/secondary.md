# The 6 secondary rules

Read at the Design pass (step 5) and the Review (step 8), after the 7 foundations in [foundations.md](foundations.md). Every screen and component is judged against all six. `<skill>` is this skill's base directory.

## Movement

**Rule.** Continuity: motion is one unbroken line from the user's action to the final resting state; at no frame does the user see a cut.
1. Every visible change moves: appearing, changing and disappearing all animate; no property changes in a single frame.
2. Response starts on the action frame: no dead time between the input and the first frame of motion.
3. Every moment has a state: arriving, holding, changing, leaving. A hold the user waits through shows it is alive; a hold at rest is still.
4. Handoffs are seamless: each state starts exactly where the last one is (position, size, opacity, colour) and never stops dead and restarts.
5. Leaving is motion, not deletion: the element stays until it has finished leaving.
6. Content that swaps morphs or crossfades in place: the old content never blinks out before the new arrives.
7. Neighbours move with it: when an element changes size, what surrounds it travels too; it does not snap.
8. Interruptions continue from where it is: reversing mid-way never restarts.

Timing: feedback about 100ms; arrive and leave 150-400ms; leaving no slower than arriving; only the motion scale's tokens.

**Why.** Material motion (enter 225ms, exit 195ms, over 400ms feels slow); web.dev easing guidance (200-500ms, ease-out by default); NN/g via W3C (about 100ms for feedback to feel immediate).

**System tool.** The motion scale (`duration-*`, `ease-*`, `anim-*`) in the project's motion stylesheet; a component stays mounted until its exit finishes (the project's `usePresence`, or the recipe in [system/motion.md](../system/motion.md)); a transition, not two keyframes, for anything that can reverse.

**Judge it.** `node <skill>/checks/run.mjs tokens` and `rules` (`motion`) catch untokenised durations and easings. `node <skill>/checks/run.mjs motion-static` checks the phase table (`motionPhases`): every animated file has a row, each phase exists, arriving ends where the next state starts, leaving is no slower than arriving. `node <skill>/checks/run.mjs motion` drives each row's specimen and samples the frames: pops in, jumps, breaks between phases, vanishes, cannot be interrupted, starts late, stops and restarts, cuts content, snaps neighbours, and the reduced-motion crossfade. Rows and recipe: [system/motion.md](../system/motion.md). Screenshots are still frames, so for anything the checks could not drive, trigger the change and watch it: "At any frame, does something jump, blink out, restart or snap? Did anything start late?"

## Proportion

**Rule.** Size follows importance. Sizes are scale steps. Media keeps a fixed aspect ratio so nothing shifts as it loads.

Concentric radius: a rounded surface inside another has radius = outer radius - the inset between them, never larger than the outer one (a selected pill in a segmented control, a button in a card header). Both radii are system radius tokens; pick the token at or below the result.

**Why.** The type scale (the project's type roles); Material and Apple HIG on nested corner radius (inner = outer minus padding); Core Web Vitals: cumulative layout shift of 0.1 or less is "good" ([web.dev: CLS](https://web.dev/articles/cls)).

**System tool.** `type-*` roles and the spacing scale; `aspect-*` or explicit width and height on media; skeletons of the final size for async content.

**Judge it.** `node <skill>/checks/run.mjs layout-shift` (CLS per route, phone and desktop) and `node <skill>/checks/run.mjs nested-radius` (an inner surface whose radius exceeds outer - inset + 1px). Screenshot: "Does each thing's size match its importance? Anything oversized or squeezed at phone width? Does any inner corner look rounder than the container around it?"

## Repetition

**Rule.** The same thing looks and behaves the same everywhere: one component, never a copy.

**Why.** Consistency lets people reuse what they learned on the last screen ([NN/g: consistency and standards](https://www.nngroup.com/articles/ten-usability-heuristics/)).

**System tool.** The project's `components/ui` set; the pattern for the page type.

**Judge it.** `node <skill>/checks/run.mjs rules` (`components`: hand-made copies of a shared component). Screenshot: "Do the same things look the same on every page you touched?"

## Rhythm

**Rule.** Repeated items (list rows, cards, stacked fields) are equally spaced; a stack uses one gap.

**Why.** An even beat is how the eye recognises items as a set; one odd gap reads as a mistake or as a group boundary nobody meant.

**System tool.** One spacing-scale gap per stack (`gap-*`, `space-y-*`). A deliberate group boundary is two stacks (Proximity), not one stack with a big gap.

**Judge it.** `node <skill>/checks/run.mjs rhythm` (equal gaps between siblings of every vertical stack of three or more children that are all the same tag, phone and desktop; no skip list. Stacks of mixed tags are not measured: judge them in the screenshot review). Screenshot: "Do repeated items keep one beat? Does any gap break the pattern without meaning a new group?"

## Emphasis

**Rule.** One emphasised thing per view, through one channel: size or weight or colour, not all three. At most one primary `Button` per region and one glow per view.

**Why.** Emphasis only works by contrast with what is not emphasised; two shouting things cancel out ([NN/g: Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)); the system rations glow.

**System tool.** Button `default` for the single primary action, `secondary` or `ghost` for the rest; glow utilities on one element only.

**Judge it.** `node <skill>/checks/run.mjs emphasis` (default Buttons per main, dialog or card; glows per view; routes in `emphasisExclude` of `viewsonic-ui.config.json` are skipped, for pages that show every variant side by side on purpose). Screenshot: "Squint: is exactly one thing shouting? Is it shouting through one channel?"

## Unity

**Rule.** The screen reads as one product: one type pair, one icon set, one radius family, role colours only.

**Why.** Mixed typefaces, icon styles or corner radii read as several products stitched together; the system's tokens exist so every screen draws from one set.

**System tool.** `type-*` roles, `<Icon>`, radius tokens, colour role tokens.

**Judge it.** `node <skill>/checks/run.mjs tokens` and `rules`. Screenshot: "Cover the logo: does it still read as one product?"
