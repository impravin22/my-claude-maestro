/**
 * check: tokens -- fails on hardcoded design values.
 *
 * Ported from the ViewSonic design system's check-tokens guard and made
 * config-driven. The system owns colour, typography, spacing, radius and motion;
 * anything that restates one of those by hand can drift away from the stylesheets
 * that define them (config.styles).
 *
 * Project specifics come from the loaded config, never from this file:
 *   config.sources              directories scanned
 *   config.styles               the files that DEFINE the system; they may hold literals
 *   config.literalAllowed       extra files that may hold literals (component-owned keyframes)
 *   config.sharedControls       [{ file, names }] names a file must use twice (compose, do not redraw)
 *   config.retiredMotionNames   retired motion vocabulary (default: the design system's list)
 *   config.retiredMotionExempt  files or "dir/" prefixes allowed to name retired identifiers (default: lib/motion-names.ts)
 *
 * There is no suppression marker, no allowlist and no exempt directory beyond the
 * definition files: a file either defines the system or consumes it.
 */

import { projectFiles, readRel, splitMsg, matches } from "../lib.mjs";

export const CHECK = "tokens";

const RULES = [
  {
    id: "hex-colour",
    // Six-digit hex anywhere, plus three-digit hex only where it is being used
    // as a value (after : " ' ( or =). Without that second guard, prose like a
    // card number, "Eclipse Vault · #044 of 250", reads as a colour.
    re: /(?<![\w&#])#[0-9a-fA-F]{6}\b(?![0-9a-fA-F])|(?<=[:"'(=]\s?)#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g,
    msg: "hardcoded hex colour - use a token: var(--color-*) or a Tailwind token utility",
  },
  {
    id: "rgb-colour",
    re: /\brgba?\(\s*\d/g,
    msg: "hardcoded rgb/rgba colour - use a token: var(--color-*)",
  },
  {
    id: "arbitrary-font-size",
    re: /\btext-\[(?!CanvasText|Canvas\b)[^\]]*\]/g,
    msg: "arbitrary font size - use a .type-* class or a text-<token> utility",
  },
  {
    id: "raw-mono-utility",
    re: /(?<![\w-])font-mono\b/g,
    msg: "use the named typography role: type-number-* for figures, type-identifier for codes people read back, type-code for literal code",
  },
  {
    id: "arbitrary-tracking",
    re: /\btracking-\[[^\]]*\]/g,
    msg: "arbitrary letter-spacing - use a .type-* class or tracking-<token>",
  },
  {
    /**
     * Typography assembled at the call site.
     *
     * A `.type-*` class carries a size, a line-height, a weight and sometimes a
     * transform -- the whole voice, under one name. Pairing it with a loose
     * `font-semibold` or `uppercase` puts an element's real typography half in
     * the stylesheet and half in a className three files away, and only one of
     * those halves moves when the scale does.
     *
     * The fix is never to write the weight by hand -- if no class says what you
     * mean, the class is the thing that is missing.
     */
    // The gap may not contain a comma. A className never needs one; a sentence
    // almost always does, and without this the rule flagged its own
    // documentation -- "keep .type-micro as the floor, and only for uppercase
    // labels" matched because both words sat inside one string.
    id: "composed-typography",
    re: /\btype-[a-z0-9-]+\b(?=[^"'`,]*\b(?:font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|uppercase|lowercase|capitalize)\b)/g,
    msg: "typography composed at the call site -- put the weight or transform in the .type-* class instead",
  },
  {
    id: "arbitrary-duration",
    re: /\bduration-\[[^\]]*\]/g,
    msg: "arbitrary duration - use duration-fast|normal|slow|overlay-enter|reward",
  },
  {
    id: "arbitrary-radius",
    // `rounded-[inherit]` is a CSS keyword, not an invented value.
    re: /\brounded-\[(?!inherit\])[^\]]*\]/g,
    msg: "arbitrary radius - use rounded-sm|md|lg|xl|2xl|3xl|pill",
  },
  {
    // Tailwind ships a full palette. Using any of it silently introduces a
    // second colour system alongside ours, and it will not follow a retheme.
    id: "stock-palette",
    re: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|fuchsia|pink|rose)-(?:50|\d00|950)\b/g,
    msg: "Tailwind's stock palette - use a semantic token (bg-card, text-muted-foreground, …) or a brand token",
  },
  {
    // `white` and `black` are literals wearing a utility's clothes. A scrim is a
    // dim of the page, so it is `bg-background/x`; an inner highlight belongs in
    // a shadow token in styles/tokens.css.
    id: "literal-bw",
    re: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|placeholder)-(?:white|black)(?:\/\d+)?\b/g,
    msg: "literal white/black - use a token (bg-background/15 for a scrim, --shadow-* for highlights)",
  },
  {
    /**
     * A raw state colour carrying text.
     *
     * Every other colour rule here catches a value from OUTSIDE the system.
     * This one catches the wrong end of a pair that is inside it, which is why
     * nothing saw it for so long: `destructive` is a real token,
     * `text-destructive` compiles, and `check:refs` resolves it happily.
     *
     * RULES §1 rule 3: only `-ink` may carry text, because `-ink` is the end of
     * the ramp that is legible in the theme you are actually in. `--destructive`
     * is one mid red in both themes and measures below AA as copy on dark;
     * `--color-warning` and `--color-info` are chosen against zinc 950 and
     * measure 1.67:1 and 1.81:1 on white (trap 12).
     *
     * The swap is free in both directions, which is why no legitimate exception
     * to this rule is known: `--destructive-ink` IS `--destructive` on light and
     * lifts it on dark, and `--success|warning|info-ink` ARE their raw tokens on
     * dark and deepen on light. `text-*-ink` therefore equals `text-*` in the
     * theme the raw token was chosen for, and improves the other.
     *
     * Fills, borders, rings and blooms are untouched and correct:
     * `bg-destructive/12`, `ring-destructive/20` and
     * `[--bloom-1:var(--color-success)]` all stay. Only `text-`.
     *
     * THIS HALF IS THE CLASS SPELLING ONLY, and it is skipped in the files that
     * may hold literals, along with every other literal rule. The declaration
     * spelling, `color: var(--color-warning)`, is checked by `checkInkOnText`
     * below, which runs everywhere including those stylesheets, because that is
     * where the declaration spelling actually occurs.
     */
    // The negative lookahead is load-bearing twice over: `\b` matches before a
    // hyphen, so a bare `\b` fires on `text-destructive-ink` (the fix itself)
    // and on `text-destructive-foreground` (a real, different token).
    id: "state-colour-as-text",
    re: /\btext-(?:destructive|success|warning|info)(?![\w-])/g,
    msg: "a raw state colour on text - use text-destructive-ink | text-success-ink | text-warning-ink | text-info-ink (rules/foundations.md, Colour)",
  },
  {
    // Tailwind's numeric duration scale is not our motion scale.
    //
    // Any bare number is wrong here whether or not Tailwind ships it, so the
    // rule matches the shape rather than a list of Tailwind's steps.
    id: "stock-duration",
    re: /\bduration-\d+\b/g,
    msg: "a numeric duration - use duration-tick|fast|normal|slow|overlay-enter|open|reward|bloom",
  },
  {
    // Easing is the other half of motion. A raw curve is a token duplicated as
    // a literal, which is precisely the drift this file exists to catch.
    id: "arbitrary-easing",
    re: /\bease-\[[^\]]*\]/g,
    msg: "arbitrary easing - use ease-emphasized|out|in|in-out|out-flex|settle|standard, or add a key to --ease-*",
  },
  {
    // The focus ring is 3px everywhere in this system and is written `ring-3`.
    // `ring-[3px]` is the same measurement: one value, two spellings, and only
    // one of them follows if it ever moves.
    id: "arbitrary-ring",
    re: /\bring-\[[^\]]*\]/g,
    msg: "arbitrary ring width - use ring-0|1|2|3",
  },
  {
    // Arbitrary spacing, sizing and position.
    //
    // Anything DERIVED is fine and is filtered out below, a calc() off a
    // token, a percentage, a viewport unit, Tailwind's own --spacing() helper,
    // because those track the system. A bare pixel or rem literal does not.
    // `p-[3px]` is the single most common way stock shadcn reintroduces its own
    // scale, and the spacing rules (§3) names that exact value.
    id: "arbitrary-spacing",
    re: /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|w|h|size|min-w|min-h|max-w|max-h|top|bottom|left|right|inset|basis|leading|z|delay)-\[[^\]]*\]/g,
    msg: "arbitrary spacing/size - use the 8-point scale, or derive it with calc()/var()/%/vh",
  },
  {
    // `--spacing()` finer than the 2px floor.
    //
    // `isDerived` forgives Tailwind's own `--spacing()` helper, and it is right
    // to for `--spacing(4)`, 16px that moves with the base. But the argument
    // is a free number, and stock shadcn's Questionnaire shipped
    // `translate-y-[--spacing(0.45)]`: 1.8px, which the spacing rules (§3) calls not a
    // decision but a mistake. The helper would otherwise launder it.
    //
    // Its own rule rather than a widening of `arbitrary-spacing` above, because
    // it has to fire on ANY utility, including prefixes that list does not
    // carry, such as `translate-y-[…]`. Matching the helper call itself is
    // prefix-blind.
    //
    // The floor is `--spacing(0.5)` = 2px; `0.49` and below are hits.
    id: "sub-pixel-spacing",
    re: /--spacing\(\s*0?\.[0-4]\d*\s*\)/g,
    msg: "--spacing() finer than 2px - the floor is --spacing(0.5) (rules/foundations.md, White space)",
  },
  {
    // Elevation is a named ladder. An inline box-shadow is a second one.
    id: "arbitrary-shadow",
    re: /\bshadow-\[[^\]]*\]/g,
    msg: "arbitrary shadow - use shadow-e1..e4|key|pressed|btn|chip|glow-action|glow-value",
  },
  {
    // Every animation is a styles/motion.css utility, exposed as `anim-*`. The
    // one exception is `animate-none`, which turns animation off rather than
    // defining one.
    id: "foreign-animation",
    re: /\banimate-(?!none\b)[a-z][a-z0-9-]*/g,
    msg: "animation defined outside the project's motion stylesheet - use anim-open/anim-close (overlays) or anim-enter/anim-exit (content)",
  },
];

/**
 * THERE IS NO SUPPRESSION MARKER, AND THERE MUST NOT BE ONE.
 *
 * A marker an author could write beside a literal to have this guard skip the
 * line would not protect genuine exceptions. It would be where the unfixed
 * ones go to stop being visible.
 *
 * A rule which cannot be escaped is one a future author may route around by
 * deleting the rule. The answer to that is not a back door: deleting this guard
 * is a visible diff, and `test/foundation/token-source.test.ts` fails if the
 * stylesheets stop being the only place literals live. A suppression marker is
 * invisible by design, that is the whole difference.
 *
 * If you have found a value that genuinely cannot come from a token, the answer
 * is a token, an asset, or a different implementation. Not a marker.
 */
function isAllowed() {
  return false;
}

/**
 * True when an arbitrary value is COMPUTED rather than invented.
 *
 * `rounded-[calc(var(--radius)-3px)]` is derived from the radius scale and
 * moves with it, so it is not a hardcoded value in any meaningful sense. The
 * same goes for a proportion of the parent (`max-w-[85%]`), a share of the
 * viewport (`max-h-[80vh]`, `h-[min(88vh,52rem)]`), Tailwind's own spacing
 * helper, and the CSS system colours a native control has to match
 * (`bg-[Canvas]`).
 *
 * What this deliberately does NOT forgive is a bare literal: `p-[3px]`,
 * `w-[100px]`, `ring-[3px]`. Those are a second scale wearing an arbitrary
 * value's clothes, and they are how stock shadcn's geometry creeps back in.
 */
/** `--spacing(0.45)` and finer, 1.8px and below. The floor is 2px, §3. */
const SUB_2PX_SPACING = /--spacing\(\s*0?\.[0-4]\d*\s*\)/;

function isDerived(hit) {
  // TRACKING IS NEVER DERIVED BY ITS UNIT.
  //
  // The relative-unit clause below exists for sizes, `max-w-[85%]`, `w-[10ch]`
  //, which really are a proportion of something else. Letter-spacing is the
  // one place `em` means the opposite: `tracking-[0.1em]` is a value somebody
  // chose, and `em` is simply how tracking is spelled.
  //
  // Otherwise the example the documentation uses would pass: `AGENTS.md` and
  // the rules documentation (§6) names `tracking-[0.1em]` as the canonical forbidden value,
  // and the `1em` inside would trip the relative-unit escape.
  // `test/foundation/token-guard.test.ts` asserts that every declared rule
  // fires, which is the argument for testing a guard rather than trusting that
  // it is green.
  if (/^tracking-/.test(hit)) {
    return hit.includes("var(--") || hit.includes("calc(");
  }

  return (
    hit.includes("var(--") ||
    hit.includes("calc(") ||
    // Tailwind's own spacing helper tracks the base, so `--spacing(4)` is a
    // derivation. It does not launder an argument below the 2px floor, see
    // `sub-pixel-spacing` above for the value that shipped behind this clause.
    (hit.includes("--spacing(") && !SUB_2PX_SPACING.test(hit)) ||
    hit.includes("min(") ||
    hit.includes("max(") ||
    hit.includes("clamp(") ||
    // No \b after the unit: `%` and `]` are both non-word characters, so a word
    // boundary never matches at the end of `max-w-[85%]`. Relative units are
    // derived by definition, a
    // proportion of the parent or the viewport tracks whatever it is inside.
    /\d(?:%|vh|vw|dvh|dvw|svh|lvh|fr|ch|ex|em)/.test(hit) ||
    /\[(?:Canvas|CanvasText|ButtonFace|ButtonText|Field|FieldText|inherit|auto|none|full)\]/.test(hit)
  );
}

/** True if the line, or the comment block immediately above it, is marked. */
/**
 * A runtime-composed `animation:` string, declared as such.
 *
 * This is not a literal exemption. It says "this value is computed, so no
 * static check can see it, here is why it has to be".
 */
const DYNAMIC_MOTION = /allow-dynamic-motion/;

/** True if the line, or the contiguous comment block above it, carries `marker`. */
function isMarked(lines, i, marker) {
  if (marker.test(lines[i])) return true;
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (!t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")) break;
    if (marker.test(t)) return true;
  }
  return false;
}

/**
 * Every `animation:` shorthand in the codebase, wherever it is written.
 *
 * It runs on every file, because some files assemble the shorthand at runtime
 * in a template literal: a component that animates many parts may compose
 * `part-${name} ${duration}s ${easing}` per part, because each part needs a
 * name, a duration and a stagger computed from a recipe, and that
 * combinatorial space cannot be utility classes.
 *
 * It checks three things:
 *
 *   1. **Easing is a token.** `linear` and `steps()` pass: a constant drift and
 *      a stepped ratchet are intentionally uneased.
 *   2. **Duration is a token.** A bare `300ms` or `.4s` is the motion scale
 *      restated by hand.
 *   3. **Interpolation is declared.** `${...}` cannot be resolved statically,
 *      the value could be anything at runtime. Rather than pretend otherwise,
 *      the line must carry `allow-dynamic-motion` and a reason: not "this
 *      literal is fine", but "this is computed, and here is why it cannot be a
 *      class".
 */
function checkAnimation(rel, lines, findings, { durationsAreDefinitions = false } = {}) {
  // Match the offence directly rather than allow-listing what is acceptable.
  const RAW_EASING =
    /(?:^|[\s,`])(cubic-bezier\([^)]*\)|ease-in-out|ease-out|ease-in|ease)(?=[\s,;`]|$)/;
  // A time that is not coming from a token and not interpolated.
  const RAW_DURATION = /(?:^|[\s`])(\d*\.?\d+m?s)(?=[\s,;`]|$)/;

  lines.forEach((line, i) => {
    const t = line.trim();
    // Anchoring to the start of the line missed the shorthand whenever it was
    // not the first thing on it, `? { animation: \`…\` }` in a ternary, for one,
    // which is exactly how the avatar writes its cross-fade. Match the property
    // anywhere, and skip comment-only lines so prose about animation is not
    // mistaken for a use of it.
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    if (!/\banimation:/.test(t)) return;

    const report = (rule, msg, hits) =>
      findings.push({ file: rel, line: i + 1, rule, msg, hits, snippet: t.slice(0, 110) });

    const dynamic = t.includes("${");
    const declared = DYNAMIC_MOTION.test(line) || isMarked(lines, i, DYNAMIC_MOTION);

    if (!/var\(--ease-/.test(t) && !/\blinear\b|\bsteps\(/.test(t)) {
      const bad = t.match(RAW_EASING);
      if (bad) {
        report("untokenised-easing",
          "animation easing must be a var(--ease-*) token so it follows the motion scale", bad[1]);
      } else if (dynamic && !declared) {
        report("unverifiable-motion",
          "easing is interpolated and cannot be checked - mark the line `allow-dynamic-motion` with a reason", "${…}");
      }
    }

    // In the canonical stylesheets a duration literal IS the definition,
    // `anim-pop-in`'s
    // 0.55s defines what pop-in is, the same way --shadow-e1's offsets define
    // e1. Two of the animations there are also genuinely off the control scale
    // and should be: the cosmic bloom drifts for 18 seconds and the foil for
    // 11, and a scale whose slowest step is 1000ms has nothing to say about
    // ambient texture. Outside that file, a literal duration is drift.
    if (!durationsAreDefinitions && !/var\(--duration-/.test(t)) {
      const bad = t.match(RAW_DURATION);
      if (bad) {
        report("untokenised-duration",
          "animation duration must be a var(--duration-*) token", bad[1]);
      } else if (dynamic && !declared) {
        report("unverifiable-motion",
          "duration is interpolated and cannot be checked - mark the line `allow-dynamic-motion` with a reason", "${…}");
      }
    }
  });
}

/**
 * §1 rule 3, in the spelling a stylesheet uses, and it runs EVERYWHERE.
 *
 * The class-form rule above lives in `RULES`, so the stylesheets that may hold
 * literals skip it along with every other literal rule. That would leave the
 * rule unable to fire in the files that write `color:` declarations, for
 * example `.cn-toast [data-icon]` painting a toast glyph `var(--color-success)`
 * measures 2.54:1 on `--popover` in light.
 *
 * So this follows `checkAnimation`'s precedent exactly, a check that has to see
 * the stylesheets runs before the exemption rather than inside it.
 *
 * Scope:
 *
 *   - The `color` property ONLY. `background-color`, `border-color`,
 *     `caret-color`, `outline-color` and `text-decoration-color` are fills and
 *     hairlines, where the raw hue is correct, hence the `(?<![\w-])`.
 *   - A custom-property declaration is never a hit. `--destructive-ink:
 *     var(--destructive)` IS the definition, and `--bloom-1: var(--destructive)`
 *     is a light source, not text.
 *   - `fill:` and `stroke:` are deliberately NOT covered. A chart bar filled
 *     `var(--color-success)` is correct and a glyph filled the same is not, and
 *     nothing in the declaration distinguishes them. That gap is real; see the
 *     traps doc.
 */
const INK_ON_TEXT =
  /(?<![\w-])color:\s*["']?var\(--(?:color-)?(?:destructive|success|warning|info)\)|(?<![\w-])color:\s*["']?var\(--color-(?:action|value)-(?:bright|dark)\)/g;

function checkInkOnText(rel, lines, findings) {
  lines.forEach((line, i) => {
    // No exception is available here, or anywhere else, see `isAllowed`.
    if (isAllowed()) return;
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    INK_ON_TEXT.lastIndex = 0;
    const hits = line.match(INK_ON_TEXT) ?? [];
    if (!hits.length) return;
    findings.push({
      file: rel,
      line: i + 1,
      rule: "state-colour-as-text",
      msg: "a raw state or brand-end colour on `color:` - use var(--destructive-ink) | --success-ink | --warning-ink | --info-ink | --action-ink | --value-ink (rules/foundations.md, Colour)",
      snippet: t.length > 110 ? `${t.slice(0, 110)}…` : t,
      hits: [...new Set(hits)].join(", "),
    });
  });
}

/**
 * `composed-typography`, widened from one string to one whole class expression.
 *
 * The line-scoped rule catches `type-small font-semibold` inside a single
 * className, which is the obvious shape of the mistake. It cannot see the
 * shape the mistake actually takes in a real component: a `cva()` whose base
 * string sets `data-active:font-medium` and whose size variants, twelve lines
 * below, set `.type-nav`. Same element, same call, two string literals, and
 * the element's real typography now lives half in the stylesheet and half in
 * the component, where only one of the halves moves when the scale is retuned.
 *
 * So the unit is the enclosing `cn(…)` / `cva(…)` call rather than the line.
 *
 * NOT file-scoped, because that flags a
 * `<strong className="font-semibold">` sitting in a file that uses `.type-*`
 * somewhere else entirely. That element composes nothing, it carries no
 * `.type-*` class at all, and forcing it to invent one would be the guard
 * inventing work rather than catching a bug.
 *
 * SIZES ARE DELIBERATELY NOT MATCHED. The typography rules (§2.1) are explicit that
 * `text-xs` / `text-sm` / `text-base` / `text-lg` are not violations, because
 * `styles/tokens.css` repoints Tailwind's own four steps at ours, which is what
 * puts the sixty vendored components already on this scale. A guard that
 * outlawed them would contradict the law it exists to enforce. Weight has no
 * such carve-out anywhere in RULES, and a `.type-*` class always carries one.
 */
const STOCK_WEIGHT =
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;

/** Every balanced `cn(…)` / `cva(…)` call in the text, with its start offset. */
function classCalls(text) {
  const out = [];
  const open = /\b(?:cn|cva)\(/g;
  let m;
  while ((m = open.exec(text))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ start: m.index, body: text.slice(m.index, i + 1) });
    open.lastIndex = i + 1;
  }
  return out;
}

/** Block and line comments removed, so prose inside a call is not read as a use. */
function withoutComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function checkComposedAcrossCall(rel, lines, findings) {
  const text = lines.join("\n");
  for (const { start, body } of classCalls(text)) {
    const clean = withoutComments(body);
    if (!/\btype-[a-z0-9-]+\b/.test(clean)) continue;
    STOCK_WEIGHT.lastIndex = 0;
    const hits = clean.match(STOCK_WEIGHT) ?? [];
    if (!hits.length) continue;

    const line = text.slice(0, start).split("\n").length - 1;
    if (isAllowed()) continue;
    findings.push({
      file: rel,
      line: line + 1,
      rule: "composed-typography-call",
      msg:
        "a .type-* class and a hand-written font weight in the same cn()/cva() call - " +
        "the .type-* class already carries a weight; if none says what you mean, add the class",
      snippet: lines[line].trim().slice(0, 110),
      hits: [...new Set(hits)].join(", "),
    });
  }
}

function checkSharedControlComposition(rel, lines, findings, settings) {
  const source = lines.join("\n");
  for (const entry of settings.sharedControls) {
    if (rel !== entry.file) continue;
    for (const name of entry.names) {
      const uses = source.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
      if (uses.length >= 2) continue;
      findings.push({
        file: rel,
        line: 1,
        rule: "duplicated-selection-control",
        msg: entry.msg ?? "this file must compose the shared control chassis and mark; do not redraw them locally",
        snippet: `missing shared ${name}`,
        hits: name,
      });
    }
  }
}

function checkDirectLucideJsx(rel, lines, findings) {
  const source = lines.join("\n");
  const imports = [
    ...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/gs),
  ];

  for (const imported of imports) {
    for (const part of imported[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (!name) continue;
      const jsx = new RegExp(`<${name}(?=\\s|/|>)`);
      const lineIndex = lines.findIndex((line) => jsx.test(line));
      if (lineIndex < 0 || isMarked(lines, lineIndex, /allow-direct-icon/)) continue;
      findings.push({
        file: rel,
        line: lineIndex + 1,
        rule: "direct-lucide-jsx",
        msg: "render Lucide through <Icon icon={...}> so size, tone and accessibility stay centralized",
        snippet: lines[lineIndex].trim(),
        hits: name,
      });
    }
  }
}

/**
 * Retired motion vocabulary.
 *
 * Duplicated from the design system's motion-names map: `RETIRED_MOTION_NAMES` /
 * `RETIRED_KEYFRAME_PREFIXES` rather than imported: this guard is plain ESM
 * run with plain `node`, and the source of truth is a `.ts` module. Keep the
 * two lists in sync by hand, `test/foundation/motion-names.test.ts` is what
 * actually proves the map and the stylesheets agree; this list only needs to
 * be wide enough to catch a call site regressing back to an old name.
 */
const DEFAULT_RETIRED_MOTION_NAMES = [
  // First rename
  "anim-jelly-in", "anim-jelly-out", "anim-jelly", "anim-spring-up", "anim-pop-in",
  "anim-ratchet", "anim-sign-on", "anim-pulse-live", "anim-unfold", "anim-fold",
  "--duration-jelly", "--duration-base", "--duration-overlay", "--ease-spring",
  // Second rename. Utilities:
  "anim-fade-up", "anim-entrance", "anim-spring-entrance", "anim-reveal", "anim-swap-in",
  "anim-row-in", "anim-row-out", "anim-panel-in", "anim-fade-in", "anim-confirm-in",
  "anim-confirm-out", "anim-blur-in", "anim-blur-out", "anim-state-change",
  "anim-check-draw", "anim-dash-draw", "anim-dot-pop", "anim-loading-shimmer",
  "anim-live-pulse", "anim-discrete-progress", "anim-text-reveal",
  "click-spring", "press-spring", "press-key", "btn-spring", "lift", "slide-pill",
  // Keyframes:
  "ds-fade-up", "ds-entrance", "ds-spring-entrance", "ds-reveal", "ds-swap-in",
  "ds-row-in", "ds-row-out", "ds-panel-in", "ds-fade-in", "ds-confirm-in",
  "ds-confirm-out", "ds-blur-in", "ds-blur-out", "ds-state-change", "ds-collapse",
  "check-draw", "dash-draw", "dot-pop", "ds-loading-shimmer", "ds-live-pulse",
  "ds-discrete-progress", "ds-text-reveal",
  // Duration tokens nothing reads any more:
  "--duration-pop-in", "--duration-spring-up", "--duration-sign-on",
  "--duration-check-draw", "--duration-dash-draw", "--duration-dot-pop",
  "--duration-ratchet", "--duration-press-spring-up", "--duration-reward",
];
const DEFAULT_RETIRED_KEYFRAME_PREFIXES = ["pulls-"];

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CLASS_CONTEXT = /\bclass(?:Name)?\s*=|\b(?:cn|cva|clsx|twMerge)\(|@apply\b|classList\./;

/** True when `word` sits in a quoted string that reads as classes (lower-case tokens, no sentence punctuation). */
function inClassString(line, word) {
  for (const m of line.matchAll(/(["'`])((?:(?!\1).)*)\1/g)) {
    const tokens = m[2].trim().split(/\s+/);
    if (!tokens.includes(word)) continue;
    if (tokens.every((t) => /^[a-z0-9!@*&>[\]():_./%#=-]+$/.test(t) && !/[.,;]$/.test(t))) return true;
  }
  return false;
}

function checkRetiredMotionName(rel, lines, findings, settings) {
  if (matches(rel, settings.retiredMotionExempt)) return;
  const { nameRe, prefixRe } = settings;

  lines.forEach((line, i) => {
    const t = line.trim();
    // Prose about a retired name is documentation, not a live reference.
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    if (isAllowed()) return;

    const nameHit = nameRe && line.match(nameRe);
    const prefixHit = prefixRe && line.match(prefixRe);
    const hit = nameHit?.[1] ?? prefixHit?.[1];
    if (!hit) return;
    if (!prefixHit && settings.wordNames?.has(hit) && !CLASS_CONTEXT.test(line) && !inClassString(line, hit)) return;

    findings.push({
      file: rel,
      line: i + 1,
      rule: "retired-motion-name",
      msg: "retired motion name - use the current ds-* / anim-* vocabulary in the motion stylesheet",
      snippet: t.length > 110 ? `${t.slice(0, 110)}…` : t,
      hits: hit,
    });
  });
}

/**
 * Scan ONE file's source and return every literal that escaped the system.
 *
 * Pure, and exported, so the guard can be tested on itself. A guard nobody exercises is a
 * guard nobody knows the state of: `test/foundation/token-guard.test.ts` proves
 * every rule below fires on a sample that breaks it, AND that the sanctioned
 * spelling of the same thing does not. The second half matters more than the
 * first, a rule with a false positive is a rule that gets deleted by whoever
 * it blocks.
 */
export function scanSource(rel, source, settings) {
  const findings = [];

  const lines = source.split(/\r?\n/);

  const comp = componentName(rel);

  checkSharedControlComposition(rel, lines, findings, settings);
  checkDirectLucideJsx(rel, lines, findings);
  checkRetiredMotionName(rel, lines, findings, settings);

  // Motion is checked EVERYWHERE, including in the one file exempt from the
  // literal rules and including the three components that build the shorthand
  // in a template literal. An animation that stops following the scale is
  // silent, nothing errors, it just drifts, so this runs before the exemption
  // rather than inside it.
  checkAnimation(rel, lines, findings, {
    durationsAreDefinitions: settings.literalAllowed.has(rel),
  });

  // §1 rule 3 in declaration form, for the same reason: `styles/*.css` is where
  // a `color:` declaration actually lives, so a check that skipped it would be
  // a rule that cannot fire where it is broken.
  checkInkOnText(rel, lines, findings);

  // The four styles/*.css files define the system, so literals are expected
  // there. Skip only the literal rules; the two checks above have already run.
  if (settings.literalAllowed.has(rel)) return findings;

  lines.forEach((line, i) => {
    if (isAllowed()) return;
    // Skip comment-only lines, prose about a value is not a use of it.
    const t = line.trim();
    if (isCommentLine(t)) return;

    // The component's own declared values: marked ones are not hardcoded
    // values, unmarked ones are reported once, here, instead of by the literal rules.
    let scanLine = line;
    for (const d of ownedOnLine(line, comp)) {
      // Only a pure-literal declaration is hidden from the literal rules. A
      // token-driven one (calc(var(--x)+2px)) still gets them, so a hex inside it fires.
      if (d.literal) scanLine = scanLine.replace(d.text, " ");
      if (d.literal && !ownedMarkAbove(lines, i)) {
        findings.push({
          file: rel, line: i + 1, rule: "owned-value-unmarked",
          msg: "component-owned value without its comment - put `/* owned: <why>, approved <date> */` on the line above",
          snippet: t.length > 110 ? `${t.slice(0, 110)}…` : t, hits: `${d.name}: ${d.value}`,
        });
      }
    }

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const hits = (scanLine.match(rule.re) ?? []).filter((h) => !isDerived(h));
      if (hits.length) {
        findings.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          msg: rule.msg,
          snippet: t.length > 110 ? `${t.slice(0, 110)}…` : t,
          hits: [...new Set(hits)].join(", "),
        });
      }
    }
  });

  checkComposedAcrossCall(rel, lines, findings);
  return findings;
}


/* ------------------------------------------------------------------ */
/* Component-owned values (system/tokens.md, "Component-owned values") */
/* ------------------------------------------------------------------ */

/** `components/ui/DatePicker.tsx` and `components/ui/date-picker/index.tsx` are both "date-picker". */
export function componentName(rel) {
  const parts = rel.split("/");
  let base = parts[parts.length - 1].replace(/\.[^.]+$/, "");
  if (/^(index|page|layout|route)$/.test(base) && parts.length > 1) base = parts[parts.length - 2];
  return base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
}

/** A value built from tokens (`var(--x)`, `--spacing(4)`, `theme(…)`) is an alias, not an invented literal. */
const TOKEN_VALUE = /var\(\s*--|--spacing\(|theme\(/;
const OWNED_MARK = /owned:\s*[^,*]*\S[^,*]*,\s*approved\s+\d/;
const OWNED_FORMS = [
  /\[(--[a-z][\w-]*):([^\]]*)\]/g, // Tailwind arbitrary property
  /(["']?)(--[a-z][\w-]*)\1\s*:\s*(["'`])([^"'`]*)\3/g, // style={{ "--x": "value" }}
  /(--[a-z][\w-]*)\s*:\s*([^;}"'`]+)/g, // CSS declaration
];

function isCommentLine(t) {
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

/**
 * The component's own `--<component>-*` declarations on one line.
 * Returns { name, value, text } -- `text` is the span to blank before the literal rules run.
 */
function ownedOnLine(line, comp) {
  const out = [];
  let rest = line;
  const take = (name, value, text) => {
    if (!name.startsWith(`--${comp}-`)) return;
    const v = value.trim().replace(/\s+/g, " ");
    out.push({ name, value: v, text, literal: !TOKEN_VALUE.test(v) });
    rest = rest.replace(text, " ");
  };
  for (const re of OWNED_FORMS) {
    re.lastIndex = 0;
    for (const m of [...rest.matchAll(re)]) {
      if (re === OWNED_FORMS[0]) take(m[1], m[2], m[0]);
      else if (re === OWNED_FORMS[1]) take(m[2], m[4], m[0]);
      else take(m[1], m[2], m[0]);
    }
  }
  return out;
}

/** True when the line directly above carries `owned: <why>, approved <date>`. */
function ownedMarkAbove(lines, i) {
  let j = i - 1;
  while (j >= 0 && !lines[j].trim()) j--;
  return j >= 0 && isCommentLine(lines[j].trim()) && OWNED_MARK.test(lines[j]);
}

/** Every owned declaration in a file: [{ name, value, line, marked }]. */
export function ownedDeclarations(rel, source) {
  const comp = componentName(rel);
  const lines = source.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line.trim())) return;
    for (const d of ownedOnLine(line, comp)) out.push({ ...d, line: i + 1, marked: ownedMarkAbove(lines, i) });
  });
  return out;
}

/**
 * Project-level owned-value rules. `entries` is [{ file, source }].
 *   owned-value-leak    a file other than the declaring one reads the property
 *   owned-value-reused  the same literal is owned by two or more components
 */
export function scanOwned(entries) {
  const findings = [];
  const declaredBy = new Map(); // name -> Set(file)
  const byValue = new Map(); // value -> [{file, line, name}]
  for (const { file, source } of entries) {
    for (const d of ownedDeclarations(file, source)) {
      if (!declaredBy.has(d.name)) declaredBy.set(d.name, new Set());
      declaredBy.get(d.name).add(file);
      if (!d.literal) continue;
      if (!byValue.has(d.value)) byValue.set(d.value, []);
      byValue.get(d.value).push({ file, line: d.line, name: d.name });
    }
  }
  for (const { file, source } of entries) {
    source.split(/\r?\n/).forEach((line, i) => {
      if (isCommentLine(line.trim())) return;
      for (const m of line.matchAll(/\(\s*(--[a-z][\w-]*)/g)) {
        const owners = declaredBy.get(m[1]);
        if (owners && !owners.has(file)) {
          findings.push({ file, line: i + 1, rule: "owned-value-leak", hits: m[1],
            msg: `${m[1]} is owned by ${[...owners][0]} - only that component may read it; if you need the value, ask to promote it to a token` });
        }
      }
    });
  }
  for (const [value, uses] of byValue) {
    if (new Set(uses.map((u) => u.file)).size < 2) continue;
    for (const u of uses) {
      findings.push({ file: u.file, line: u.line, rule: "owned-value-reused", hits: `${u.name}: ${value}`,
        msg: `${value} is owned by more than one component - promote it to a token` });
    }
  }
  return findings;
}

/** Every rule id this guard declares, so the self-test can enumerate them. */
export const RULE_IDS = RULES.map((r) => r.id);


/** Rule ids that live outside the RULES table (declaration-form and structural rules). */
export const EXTRA_RULE_IDS = [
  "untokenised-easing",
  "untokenised-duration",
  "unverifiable-motion",
  "composed-typography-call",
  "duplicated-selection-control",
  "direct-lucide-jsx",
  "retired-motion-name",
  "owned-value-unmarked",
  "owned-value-leak",
  "owned-value-reused",
];

/** What each rule's finding tells the author to do, when the message does not already say. */
const FIX = {
  "untokenised-easing": "use a var(--ease-*) token",
  "untokenised-duration": "use a var(--duration-*) token",
  "unverifiable-motion": "mark the line `allow-dynamic-motion` with the reason it is computed",
  "composed-typography-call": "put the weight in the .type-* class, or add the class that says what you mean",
  "duplicated-selection-control": "compose the shared control chassis and mark instead of redrawing them",
  "direct-lucide-jsx": "render the icon through <Icon icon={...} />",
  "retired-motion-name": "use the current anim-* / ds-* vocabulary",
  "owned-value-unmarked": "add `/* owned: <why>, approved <date> */` on the line above, or use a token",
  "owned-value-leak": "read it only inside its component, or ask to promote it to a token",
  "owned-value-reused": "promote the value to a system token",
  "state-colour-as-text": "use the -ink token for text (destructive-ink, success-ink, warning-ink, info-ink)",
};

/** Resolve the per-project settings from a loaded config. */
export function settingsFrom(config) {
  const names = config.retiredMotionNames ?? DEFAULT_RETIRED_MOTION_NAMES;
  const prefixes = config.retiredMotionPrefixes ?? DEFAULT_RETIRED_KEYFRAME_PREFIXES;
  return {
    literalAllowed: new Set([...(config.styles ?? []), ...(config.literalAllowed ?? [])]),
    sharedControls: config.sharedControls ?? [],
    // The design system's own map of retired names lists them on purpose.
    retiredMotionExempt: config.retiredMotionExempt ?? ["lib/motion-names.ts"],
    nameRe: names.length ? new RegExp(`(?<![\\w-])(${names.map(reEscape).join("|")})(?![\\w-])`) : null,
    // A retired name that is also an English word ("lift") only counts where classes are written.
    wordNames: new Set(names.filter((n) => /^[a-z]+$/.test(n))),
    prefixRe: prefixes.length ? new RegExp(`(?<![\\w-])(${prefixes.map(reEscape).join("|")})`) : null,
  };
}

/** Scan the project described by `config`. Returns Finding[]. */
export async function run(config) {
  const settings = settingsFrom(config);
  const out = [];
  const entries = [];
  for (const rel of projectFiles(config)) {
    const source = readRel(config, rel);
    if (!settings.literalAllowed.has(rel)) entries.push({ file: rel, source });
    for (const f of scanSource(rel, source, settings)) {
      const { why, fix } = splitMsg(f.msg, FIX[f.rule]);
      out.push({
        check: CHECK,
        rule: f.rule,
        file: f.file,
        line: f.line,
        found: f.hits ?? f.snippet,
        why,
        fix: FIX[f.rule] && !f.msg.includes(" - ") ? FIX[f.rule] : fix,
      });
    }
  }
  for (const f of scanOwned(entries)) {
    const { why, fix } = splitMsg(f.msg, FIX[f.rule]);
    out.push({ check: CHECK, rule: f.rule, file: f.file, line: f.line, found: f.hits, why, fix: FIX[f.rule] && !f.msg.includes(" - ") ? FIX[f.rule] : fix });
  }
  return out;
}
