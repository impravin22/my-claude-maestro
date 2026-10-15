# The completion gate

The gate is SKILL.md steps 7 to 9: scoped checks while building, `full` on the
changed routes, `shots`, the thirteen rules, content, keyboard and UX questions,
then an honest report. This file holds the **operational** parts: techniques,
snippets and known ways of going wrong. Which check enforces which rule:
[map.md](map.md). What has shipped green and wrong: [../system/traps.md](../system/traps.md).

## Reading a computed style from a pane that is not displayed

The page is not compositing, so a value read mid-transition can come back
stale: the pre-transition value, or an interpolated one. Read after the
transition would have settled, or trigger the state and read on the next frame.
An agent nearly filed a bug against its own working component this way.

## Measuring a colour that is mixed or blended

`color-mix(in oklab, …)` computes to `oklab()`. `getComputedStyle` hands it back
in that form, and a regex expecting `rgb()` grabs the wrong numbers, which is
why a broken contrast check reports ratios in the millions rather than failing
outright. Rasterise it: paint the computed value into a 1×1 canvas and read the pixel.

```js
const c = document.createElement('canvas'); c.width = c.height = 1;
const ctx = c.getContext('2d', { willReadFrequently: true });
ctx.fillStyle = getComputedStyle(el).backgroundColor;  // resolves the mix
ctx.fillRect(0, 0, 1, 1);
const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;   // real sRGB bytes
```

`run.mjs contrast-rendered` does this for you. Use the canvas for a probe of your own.
A page that prints a live ratio should measure a token against its surface at
runtime and re-measure on theme change, so it cannot go stale.

## Proving a check works

If you add a rule to a check, **inject a violation, watch it fail, remove it,
watch it pass.** A rule nobody has seen fail is a rule nobody knows works; checks
have shipped rules that silently matched nothing. Two traps when writing one:

- **Scan class strings, not raw lines.** English is full of hyphenated words that
  look like utilities ("the text-safe end", "every text-entry shape").
- **`\b` matches after a hyphen.** `--star-glow-size` contains a "match" for
  `glow-size`. Use `(?<![\w-])` so you match whole names, not tails of longer names.

## The built stylesheet is the only authority on whether a class resolves

Grepping a source stylesheet only answers "is this string written somewhere", not
whether Tailwind generated the class or whether the declaration that uses it
survived (an unresolved `var()` drops the whole declaration silently; see
[traps 1 and 13](../system/traps.md)). Build the app or run the dev server and
read the class out of the served CSS, or read `getComputedStyle` on the rendered
element, before concluding a class is live or dead.

## The one motion escape hatch

An `animation:` shorthand composed at runtime needs `allow-dynamic-motion` **with
a reason**. That is a different claim from `allow-hardcoded`: not "this literal is
fine" but "this is computed, and here is why it cannot be a class".

## Console and reduced motion

Before signing off, run `node <skill>/checks/run.mjs runtime-errors <route>...`
(console errors, uncaught exceptions, the framework's error overlay) on every
changed route, and the project's production build (`next build` or the build
script): prerender errors, such as `searchParams` read at build time, only show there.
Then read the browser error log after a fresh navigation.
Hydration mismatches often look correct after React repairs them; locale-sensitive
dates, generated IDs and theme-dependent server markup are the first suspects.
Separate dependency deprecation warnings from application errors, but record
rather than silently discard them.

The blanket reduced-motion rule collapses animations to one frame, which is
correct for most. Any keyframe that *ends* at `opacity: 0` freezes to nothing and
needs its own handling. Turn reduced motion on and look; nothing else detects this.
