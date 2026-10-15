# Motion: continuity, the scale, the phase table, presence

Read when the work moves anything: an element arriving, changing, leaving, or swapping content. The rule is in [rules/secondary.md](../rules/secondary.md) (Movement). `<skill>` is this skill's base directory.

## Continuity in short

Motion is one unbroken line from the user's action to the final resting state. At no frame is there a cut.

| # | Rule | The cut it prevents |
|---|---|---|
| 1 | Every visible change moves | a property changing in a single frame |
| 2 | Motion starts on the action frame | dead time between the input and the first frame |
| 3 | Every moment has a state: arriving, holding, changing, leaving | an element that is on screen but inert while the user waits |
| 4 | Each state starts exactly where the last one is | a handoff that jumps, or stops dead and restarts |
| 5 | Leaving is motion, not deletion | an element removed before its exit has played |
| 6 | Swapped content morphs or crossfades in place | the old content blinking out before the new arrives |
| 7 | Neighbours travel with an element that changes size | siblings snapping to their new place |
| 8 | An interruption continues from where it is | reversing mid-way restarting from the first frame |

Leaving is never slower than arriving. Under `prefers-reduced-motion` arriving and leaving stay an opacity crossfade of a normal duration; scale and travel are dropped.

## The scale: read it, never type it

Durations, easings, and the arrive/leave/change animations are the project's tokens and `anim-*` utilities, defined in its motion stylesheet (see `styles` in `node <skill>/checks/run.mjs config`). Open that stylesheet and use what it defines; do not copy numbers from this file. Timing targets: feedback about 100ms, arrive and leave 150-400ms, leaving no slower than arriving. A duration or curve the scale lacks is a step 4 ask (SKILL.md): name the closest token and why it does not fit, and wait for a yes.

## The phase table: `motionPhases`

One row per animated file outside the base components folder, in `viewsonic-ui.config.json`. `motion-static` fails when an animated file (an `anim-*` class, `useSpring(` or `<motion.`) has no row; `motion` samples every row that names a `specimen`.

```json
"motionPhases": [
  {
    "component": "components/panel.tsx",
    "specimen": "/components/panel",
    "trigger": "[data-demo=open]",
    "dismiss": "[data-demo=close]",
    "target": "[data-demo=panel]",
    "in": "anim-enter",
    "idle": "N/A: rests static",
    "out": "anim-exit",
    "changes": ["anim-change"],
    "swap": { "trigger": "[data-demo=next]" }
  }
]
```

| Field | Meaning |
|---|---|
| `component` | file path from the project root (required) |
| `in` / `idle` / `out` | arriving / holding / leaving: an `@utility` name from the motion stylesheet, or `"N/A: <reason>"`. Resting still is an idle: `"N/A: rests static"`. A skeleton has no out when it is replaced in place by a crossfade: say so |
| `changes` | optional: extra utility names for state changes while visible |
| `specimen` | route where the component can be driven; rows without one are listed in a NOTE and not sampled |
| `trigger` | selector clicked to start arriving (omit if it animates on mount) |
| `dismiss` | selector clicked to start leaving |
| `target` | selector of the animated element |
| `swap` | optional `{ "trigger": selector }` that swaps content inside the target; without it `content-cut` is reported as not measured |

## Judge it

| Command | Fires |
|---|---|
| `node <skill>/checks/run.mjs motion-static` | `no-phase-row`, `unknown-phase`, `incomplete-row`, `stale-row`, `phase-break` (keyframe endpoints), `slow-exit`, `untokenised-phase` |
| `node <skill>/checks/run.mjs motion` | `pops-in`, `jumps`, `phase-break`, `vanishes`, `not-interruptible`, `late-start`, `stop-start`, `content-cut`, `neighbours-snap`, `reduced-motion`, `selector-not-found` |

`motion` pauses the target's animations, seeks them from 0 to the end in 30 steps and reads opacity, scale and translate. Tolerances per step: opacity 0.25, scale 0.15, translate 24px; motion must start within 34ms of the input. A mode it cannot measure for a row is a NOTE, never a pass. `--component <part of a path>` samples one row.

## Fix order

Fix a failure with what exists, in this order:

1. **Presence.** A conditional unmount (`{open && <X/>}`) is a cut. Keep the element mounted through the exit with the presence recipe below (`vanishes`, `pops-in` on re-open).
2. **Transition instead of reversible keyframes.** If it can reverse (open/close, hover, toggle), animate it with a `transition` on the same properties, so reversing continues from the current value (`not-interruptible`).
3. **Align keyframe endpoints** in the motion stylesheet so each state starts where the last ends (`phase-break`, `jumps`).
4. **Ask** before a new duration or curve (SKILL.md step 4).

## Presence: stay mounted until the exit finishes

Use the project's `usePresence` if it exists: search for it (`grep -rn "usePresence" --include=*.ts --include=*.tsx .`) and follow how its callers use it. If there is none, add this hook beside the component you are building (for example `use-presence.ts`):

```tsx
"use client";

import { useEffect, useState } from "react";

export type PresencePhase = "enter" | "idle" | "exit";
export type PresenceState = { mounted: boolean; phase: PresencePhase };

// reducer:start
/** What happens when `open` changes. Re-opening while still mounted (during an exit) continues from where
 *  the element is: "idle", never "enter", so nothing restarts from the start state. */
export function nextPresence(s: PresenceState, open: boolean): PresenceState {
  if (open) return { mounted: true, phase: s.mounted ? "idle" : "enter" };
  return { mounted: s.mounted, phase: "exit" };
}
// reducer:end

/**
 * Read a duration token (e.g. "--duration-fast") as milliseconds. Never type the number. A probe element
 * resolves var() and calc() chains. If the token does not resolve to a positive number, warn in development
 * and return `fallback`: a NaN delay would unmount the element at once, which is the cut this hook prevents.
 */
export function tokenMs(name: string, fallback = 300): number {
  if (typeof document === "undefined") return fallback; // the server plays nothing
  const probe = document.createElement("div");
  probe.style.transitionDuration = `var(${name})`;
  document.body.appendChild(probe);
  const raw = getComputedStyle(probe).transitionDuration.split(",")[0].trim();
  probe.remove();
  const ms = raw.endsWith("ms") ? parseFloat(raw) : parseFloat(raw) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn(`tokenMs: ${name} did not resolve to a duration ("${raw}"); using ${fallback}ms`);
    }
    return fallback;
  }
  return ms;
}

/**
 * Renders while `mounted`. `phase` is "enter" for two frames after opening (the start state is painted,
 * so a transition has something to run from), then "idle"; it is "exit" from the moment `open` becomes
 * false, and `mounted` only turns false `exitMs` later. Re-opening during the exit goes straight to
 * "idle" and cancels the pending unmount, so the element continues from its current state.
 */
export function usePresence(open: boolean, exitMs: number): PresenceState {
  const [state, setState] = useState<PresenceState>({ mounted: open, phase: open ? "enter" : "exit" });
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    // Adjust during render so no frame is painted with the old phase.
    setPrevOpen(open);
    setState(nextPresence(state, open));
  }

  const { mounted, phase } = state;
  useEffect(() => {
    if (!mounted) return;
    if (phase === "enter") {
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setState((s) => ({ ...s, phase: "idle" })));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    if (phase === "exit") {
      // The cleanup clears this timer when the phase changes again (re-open), so a stale unmount never fires.
      const id = window.setTimeout(() => setState({ mounted: false, phase: "exit" }), exitMs);
      return () => window.clearTimeout(id);
    }
  }, [mounted, phase, exitMs]);

  return state;
}
```

Use it so the element carries the phase and the stylesheet does the moving:

```tsx
const { mounted, phase } = usePresence(open, tokenMs("--duration-fast"));
if (!mounted) return null;
return <div data-phase={phase} className="…">{children}</div>;
```

Style the three phases with tokens only: `data-[phase=enter]:` is the start state (for example opacity 0), `data-[phase=idle]:` the rest state, `data-[phase=exit]:` the leaving state, with `transition-*` classes using the scale's `duration-*` and `ease-*`. Or put the project's `anim-*` utilities on `phase === "enter"` and `phase === "exit"`. Pass the exit utility's own duration token to `tokenMs` so the unmount waits exactly as long as the exit plays.
