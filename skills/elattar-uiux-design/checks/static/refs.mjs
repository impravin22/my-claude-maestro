/**
 * check: refs -- fails on references that resolve to NOTHING.
 *
 * `tokens` finds values written by hand that should have come from the system.
 * This finds the mirror-image failure: a class or a custom property that was
 * *named* but never *defined*. Both fail silently in the browser:
 *
 *   - Tailwind emits nothing for a class it does not recognise. No error, no
 *     warning; the element simply renders without the style.
 *   - CSS discards any declaration containing an undeclared `var()`. The whole
 *     declaration, not just the variable.
 *
 * Ported from the ViewSonic design system's check-refs guard and made
 * config-driven:
 *   config.sources              directories scanned
 *   config.styles               the stylesheets that DEFINE things (@utility, .type-*, --color-*),
 *                               concatenated in import order
 *   config.componentCss         component-owned CSS whose plain `.foo {}` classes count as defined
 *                               (default: every .css in the sources that is not one of config.styles)
 *   config.allowVars            custom properties something else declares at runtime
 *                               (each entry is a claim a reader can check)
 *   config.allowVarPrefixes     prefixes owned by a library that resolves them itself
 *   config.ownedPrefixes        the design system's utility namespaces (default below)
 *   config.deadUtilityExempt    files that record retired utilities on purpose (default: lib/motion-names.ts)
 */

import { projectFiles, readRel, stripComments, matches } from "../lib.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CHECK = "refs";

/** Rule ids, one per kind of dead reference. */
export const RULE_IDS = ["dead-utility", "dead-type", "dead-font", "dead-shadow", "dead-colour", "undeclared-var"];

/** Tailwind's own internals, which no project declares. Everything else is config.allowVars. */
const TAILWIND_INTERNAL_VARS = ["--spacing", "--radius", "--default-transition-duration"];
/** Set at runtime on Base UI positioners and popups (shadcn's Base UI build); no stylesheet declares them. */
const BASE_UI_RUNTIME_VARS = ["--anchor-width", "--anchor-height", "--available-width", "--available-height", "--transform-origin"];
const DEFAULT_RUNTIME_PREFIXES = ["--tw-", "--radix-"];
const DEFAULT_OWNED_PREFIXES = ["anim", "glow", "bloom", "foil", "sheen", "ramp", "glass", "press", "toggle-slide", "swap-roll"];

export function settingsFrom(config = {}) {
  return {
    runtimeDeclared: new Set([...TAILWIND_INTERNAL_VARS, ...BASE_UI_RUNTIME_VARS, ...(config.allowVars ?? [])]),
    runtimePrefixes: [...DEFAULT_RUNTIME_PREFIXES, ...(config.allowVarPrefixes ?? [])],
    ownedPrefixes: config.ownedPrefixes ?? DEFAULT_OWNED_PREFIXES,
    // The design system's own map of retired names lists them on purpose.
    deadUtilityExempt: config.deadUtilityExempt ?? ["lib/motion-names.ts"],
  };
}

/**
 * Find every dead reference.
 * input = { cssFiles: string[], componentCssTexts: string[], sources: [{ rel, text }] }
 * `sources[].text` must already have comments stripped (see stripComments).
 */
export function analyse({ cssFiles, componentCssTexts, sources }, settings) {
const RUNTIME_DECLARED = settings.runtimeDeclared;
const RUNTIME_PREFIXES = settings.runtimePrefixes;
const css = cssFiles.join("\n");
const allText = sources.map((s) => s.text).join("\n");

/* ── What the system defines ───────────────────────────────────────────────── */

/** `@utility foo { … }` in the canonical stylesheets. */
const utilities = new Set([...css.matchAll(/@utility\s+([a-z0-9-]+)/g)].map((m) => m[1]));

/**
 * Plain `.foo { … }` classes in the component-owned CSS files above: a
 * component's own keyframe classes and the docs site's landing-intro / instrument
 * keyframes are real definitions, just not `@utility` ones, so rule 1
 * (dead-utility) would otherwise flag every one of them as unresolved.
 */
for (const text of componentCssTexts) {
  for (const m of text.matchAll(/^\s*\.([a-z0-9-]+)\s*[,{]/gm)) utilities.add(m[1]);
}

/**
 * The type scale: `.type-body { … }` in styles/typeset.css.
 *
 * These are plain classes rather than `@utility`, which is why they needed a
 * rule of their own, and why they went unguarded longest. `type-h5` is the
 * shape of the bug: `type-h1` through `type-h4` exist, the fifth never did, and
 * a component asking for it got no size, no weight and no line-height while
 * both guards stayed green. That is trap 1 happening inside the one class
 * family the rules talk about most.
 */
const typeClasses = new Set(
  [...css.matchAll(/^\s*\.(type-[a-z0-9-]+)\s*(?:,|\{)/gm)].map((m) => m[1]),
);

/** Every `--x:` declaration, wherever it is written. */
const declaredVars = new Set([
  // the canonical stylesheets and any other scanned file
  ...[...allText.matchAll(/(?:^|[;{\s])(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  // Tailwind arbitrary property syntax in a className: `[--cell-size:…]`
  ...[...allText.matchAll(/\[(--[a-z0-9-]+):/g)].map((m) => m[1]),
  // React style objects: `{ "--skeleton-width": width }`
  ...[...allText.matchAll(/["'](--[a-z0-9-]+)["']\s*:/g)].map((m) => m[1]),
]);

/* ── What the code asks for ────────────────────────────────────────────────── */

const findings = [];

/**
 * A class in one of our own namespaces. Tailwind's built-ins are excluded by
 * listing the namespaces WE own, anything matching these prefixes has to have
 * come from the canonical stylesheets, so an unmatched one is definitionally
 * dead.
 */
/*
 * `(?<![\w-])` is load-bearing. A plain `\b` matches after a hyphen, so
 * `--star-glow-size` contained a "match" for `glow-size` and `value-foil-drift`
 * one for `foil-drift`. Requiring that nothing word-ish OR hyphen-ish precedes
 * the namespace is what makes this find whole class names rather than tails of
 * longer identifiers.
 */
const OURS = new RegExp(`(?<![\\w-])(${settings.ownedPrefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})-[a-z0-9-]+`, "g");
/** Tailwind ships these and they are not ours to define. */
const TAILWIND_OWNED = new Set(["animate-in", "animate-out", "animate-none"]);

/**
 * Colour utilities, and the names that are legitimately not colours.
 *
 * `text-`, `border-`, `ring-`, `fill-` and friends are overloaded, the same
 * prefix carries a size, a width, an alignment or a colour depending on what
 * follows. So rather than guess, this checks a name only when it is not one of
 * the many CSS keywords and scale steps those prefixes also accept. Anything
 * left has to resolve to a `--color-*` key or a shadcn semantic token.
 */
const COLOUR_UTILITY =
  /(?<![\w-])(bg|text|border|ring|fill|stroke|divide|outline|decoration|placeholder|caret|from|via|to)-([a-z][a-z0-9-]*(?:\/[\d.]+)?)/g;

const NON_COLOUR_KEYWORDS = new Set([
  // shared keywords
  "current", "transparent", "inherit", "auto", "none", "initial",
  // text-*: alignment, wrapping, transform, decoration, overflow
  "left", "center", "right", "justify", "start", "end", "wrap", "nowrap",
  "balance", "pretty", "ellipsis", "clip", "top", "middle", "bottom",
  "baseline", "sub", "super", "wrap-normal",
  // border-* / divide-* / outline-*: style and sides
  "solid", "dashed", "dotted", "double", "hidden", "collapse", "separate",
  "x", "y", "s", "e", "t", "r", "b", "l",
  // decoration-*
  "underline", "overline", "line-through", "no-underline", "wavy",
  // from-/via-/to- gradient positions
  "0%", "50%", "100%",
  // our own type scale, text-<size> is a font size, not a colour. One key per
  // role in the twenty-one-role contract, plus Tailwind's own steps.
  "display", "h1", "h2", "h3", "h4", "h5", "lead", "body", "small", "nav", "badge", "micro", "caption", "cta",
  "code", "identifier", "number-sm", "number-base", "number-md", "number-lg",
  "number-xl",
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl",
  // CSS values that appear as bare strings in style objects, e.g.
  // `{ boxSizing: "border-box" }`, a value, not a class.
  "box", "content-box", "padding-box", "border-box",
  // `stroke-*` SVG presentation attributes that are not a colour: an arbitrary
  // `transition-[stroke-dashoffset]` (status-mark.tsx's progress ring) reads
  // exactly like a `stroke-` colour utility to this regex, the same
  // `transition-[font-weight,…]` false positive `FONT_NON_FAMILY` above
  // exists to avoid, just for the `stroke` prefix instead of `font`.
  "dashoffset", "dasharray", "linecap", "linejoin", "miterlimit",
]);

/**
 * Pull the quoted strings from a line that are plausibly class lists.
 *
 * The test is that EVERY whitespace-separated token looks like a utility. That
 * is a stricter filter than it sounds: one capital letter, one word ending in a
 * comma or a full stop, and the string is prose rather than a className. It has
 * to be strict, because hyphenated English, "text-safe", "text-entry",
 * "border-radius", is indistinguishable from a utility in isolation.
 */
const CLASS_TOKEN = /^[a-z0-9!@*&>[\]:/._-]+$/;

/**
 * A looser token test, used by the type rule ONLY.
 *
 * `CLASS_TOKEN` rejects `(`, `=`, `$` and `,`, which means any string holding a
 * variant like `data-[state=open]:…`, an arbitrary value like
 * `bg-[color-mix(…)]`, or a `${}` interpolation is skipped whole, and that is
 * most of the class strings in the vendored components.
 *
 * Widening it for `type-*` is safe in a way that widening it for the colour
 * rule is not. Tried and rejected: allowing those characters everywhere makes
 * the colour rule read CSS property names out of `transition-[…]` and report
 * `border-color`, and it flags real Tailwind utilities like `bg-clip-padding`.
 * `type-` is a distinctive prefix that does not occur inside arbitrary values,
 * so it can afford the wider net.
 */
const CLASS_TOKEN_LOOSE = /^[a-z0-9!@*&>[\]:/._,()=$%{}-]+$/;

/**
 * Everything `font-*` means that is NOT a family.
 *
 * Tailwind's weight scale, its numeric weight steps, the two `font-variant`
 * shortcuts it ships, and the `font-stretch-*` family (matched by prefix at the
 * call site). Anything else after `font-` has to resolve to a `--font-*` token.
 */
const FONT_NON_FAMILY = new Set([
  "thin", "extralight", "light", "normal", "medium", "semibold", "bold",
  "extrabold", "black",
  "100", "200", "300", "400", "500", "600", "700", "800", "900",
  "stretch",
  // CSS PROPERTY NAMES, not classes. `transition-[font-weight,transform]` and
  // tailwind-merge's own `"font-size"` group key are both indistinguishable
  // from a utility once the string is split into tokens, and both were
  // reported by the first draft of this rule. A `--font-size` token would be a
  // pathological name for a typeface anyway.
  "size", "weight", "family", "style", "variant", "face", "display",
  "kerning", "synthesis", "smoothing", "feature-settings",
  "variation-settings", "optical-sizing",
]);

function classStrings(line, token = CLASS_TOKEN) {
  const out = [];
  for (const m of line.matchAll(/["'`]([^"'`]{2,})["'`]/g)) {
    const body = m[1].trim();
    if (!body) continue;
    const tokens = body.split(/\s+/);
    if (tokens.every((tok) => token.test(tok))) out.push(body);
  }
  return out;
}

/**
 * The motion vocabulary map, Motion Vocabulary Parity.
 *
 * Its `before` fields and `RETIRED_MOTION_NAMES`/`RETIRED_KEYFRAME_PREFIXES`
 * arrays are the migration record: they exist specifically to name utilities
 * that no longer resolve, so rule 1 (dead-utility) would otherwise flag every
 * retired class the map documents. That's not a real dead reference, it's
 * the whole point of the file. Mirrors the same exemption in
 * `check-tokens.mjs`'s `retired-motion-name` guard (`MOTION_NAMES_FILE`),
 * which skips this file for the same reason.
 */

/** Every colour name the theme actually defines. */
const colourNames = new Set([
  // `--color-x: …` in the @theme blocks
  ...[...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  // shadcn semantic tokens, declared bare in the theme blocks
  ...[...css.matchAll(/^\s{2}(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1].slice(2)),
]);

for (const { rel, text } of sources) {
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    const t = line.trim();
    // Prose about a class is not a use of it.
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;

    // 1. Utilities in our own namespaces.
    // Skip lib/motion-names.ts here: its retired-name strings (`before`
    // fields, `RETIRED_MOTION_NAMES`) are history, not live references, see
    // config.deadUtilityExempt above.
    for (const hit of matches(rel, settings.deadUtilityExempt) ? [] : (line.match(OURS) ?? [])) {
      if (TAILWIND_OWNED.has(hit) || utilities.has(hit)) continue;
      // `bloom-1` / `bloom-2` are custom properties, not utilities.
      if (declaredVars.has(`--${hit}`)) continue;
      findings.push({
        file: rel,
        line: i + 1,
        kind: "dead-utility",
        hit,
        msg: `no \`@utility ${hit}\` in the project's token stylesheets - Tailwind emits nothing for it`,
        snippet: t.slice(0, 110),
      });
    }

    // 2. The type scale must name a class the stylesheet defines.
    //
    // `text-*` is deliberately whitelisted out of the colour rule below (the
    // prefix carries a size as often as a colour), so until this rule existed
    // nothing was looking at typography at all.
    //
    // Class strings only, for the same reason rule 3 does it, the first draft
    // read whole lines and immediately flagged `.type-num-*` out of a sentence
    // in the rules documentation. Documentation about a class is not a use
    // of it.
    for (const cls of classStrings(line, CLASS_TOKEN_LOOSE)) {
      // `(?<![\w.-])` also rules out `.type-num-*` written as a CSS selector in
      // documentation, the first draft of this rule flagged one out of a
      // sentence in the rules documentation.
      for (const hit of cls.match(/(?<![\w.-])type-[a-z0-9-]+/g) ?? []) {
        if (typeClasses.has(hit)) continue;
        // `--type-*` custom properties are not classes.
        if (declaredVars.has(`--${hit}`)) continue;
        findings.push({
          file: rel,
          line: i + 1,
          kind: "dead-type",
          hit,
          msg: `no \`.${hit}\` in the project's type stylesheet - the element gets no size, weight or line-height`,
          snippet: t.slice(0, 110),
        });
      }
    }

    // 2b. Font-family utilities must name a real --font-* token.
    //
    // This is trap 1 again, and it shipped again: `--font-heading` was deleted
    // with the seventeen-role contract while seven vendored components still
    // carried `font-heading` on their titles. Tailwind emits nothing for a
    // `font-*` family it cannot resolve, verified by grepping the built
    // stylesheet, which had zero occurrences of it, so seven dialog and card
    // titles were carrying a class that did nothing, on a green build.
    //
    // `font-*` is overloaded exactly like `text-*`: the same prefix carries a
    // weight, a stretch, a style and a family. The weights and the other
    // keywords are listed out so anything left has to be a family.
    for (const cls of classStrings(line, CLASS_TOKEN_LOOSE)) {
      // Whole tokens only, variants stripped. Matching anywhere in the string
      // reads CSS property names out of `transition-[font-weight,…]`.
      for (const token of cls.split(/\s+/)) {
        const bare = token.replace(/^.*:/, "").replace(/^!/, "");
        const m = bare.match(/^font-([a-z0-9][a-z0-9-]*)$/);
        if (!m) continue;
        const hit = bare;
        const key = m[1];
        if (FONT_NON_FAMILY.has(key) || key.startsWith("stretch-")) continue;
        if (declaredVars.has(`--font-${key}`)) continue;
        findings.push({
          file: rel,
          line: i + 1,
          kind: "dead-font",
          hit,
          msg: `no \`--font-${key}\` token in the project's token stylesheets - Tailwind emits nothing for it and the element keeps whatever face it inherited`,
          snippet: t.slice(0, 110),
        });
      }
    }

    // 3. Shadows must name a real --shadow-* token.
    for (const hit of line.match(/\bshadow-[a-z0-9-]+/g) ?? []) {
      const key = hit.slice("shadow-".length);
      if (/^(none|sm|md|lg|xl|2xl|inner|initial)$/.test(key)) continue;
      if (declaredVars.has(`--shadow-${key}`)) continue;
      // shadow-<colour>/<alpha> and arbitrary values are check-tokens' problem.
      if (key.includes("[") || key.includes("/")) continue;
      if (declaredVars.has(`--color-${key}`) || /^(foreground|background|border|ring|input|primary|card|popover|muted|accent)$/.test(key)) continue;
      findings.push({
        file: rel,
        line: i + 1,
        kind: "dead-shadow",
        hit,
        msg: `no \`--shadow-${key}\` token - the class resolves to nothing`,
        snippet: t.slice(0, 110),
      });
    }

    // 3. Colour utilities must name a colour the theme defines.
    //
    // This was the gap that let `fill-gold` survive the gold→value rename in
    // `icon-swap-demo.tsx`. `check-tokens` did not flag it, "gold" is not one
    // of Tailwind's stock palette names, so its stock-palette rule never
    // matched, and the first version of THIS script only looked at our own
    // effect namespaces. The heart icon simply stopped being filled.
    //
    // Scanned only inside CLASS STRINGS, never raw source. A first attempt read
    // whole lines and reported fifty violations that were almost all English:
    // "the text-safe end", "every text-entry shape", "text-shadow, so it only
    // works on text". Prose is full of hyphenated words that look exactly like
    // utilities, so the only reliable filter is to check where classes actually
    // live.
    for (const cls of classStrings(line)) {
      for (const m of cls.matchAll(COLOUR_UTILITY)) {
        // `bg-blend-*` and `mix-blend-*` are blend modes, not colours.
        if (/^(bg|mix)-blend-/.test(m[0])) continue;
        let name = m[2].replace(/\/[\d.]+$/, "");
        // A leading side or axis is part of the property, not the colour:
        // border-t-transparent, divide-x-border, border-b-0.
        name = name.replace(/^([trblse]|[xy])-/, "");
        if (colourNames.has(name) || NON_COLOUR_KEYWORDS.has(name)) continue;
        // Width and size utilities share these prefixes: border-2, ring-3.
        if (/^\d/.test(name) || /^[trblxyse]$/.test(name)) continue;
        if (/^\[|^\(/.test(name)) continue;
        findings.push({
          file: rel,
          line: i + 1,
          kind: "dead-colour",
          hit: m[0],
          msg: `no \`--color-${name}\` token and no semantic \`--${name}\` - the class resolves to nothing`,
          snippet: t.slice(0, 110),
        });
      }
    }

    // 4. Every var() must reach a declaration.
    for (const m of line.matchAll(/var\((--[a-z0-9-]+)\s*(,)?/g)) {
      const name = m[1];
      // var(--x, fallback) is valid without a declaration: the fallback applies.
      if (m[2]) continue;
      if (declaredVars.has(name)) continue;
      if (RUNTIME_DECLARED.has(name)) continue;
      if (RUNTIME_PREFIXES.some((p) => name.startsWith(p))) continue;
      findings.push({
        file: rel,
        line: i + 1,
        kind: "undeclared-var",
        hit: name,
        msg: `\`${name}\` is never declared - the whole declaration is dropped`,
        snippet: t.slice(0, 110),
      });
    }
  });
}

  return findings;
}

const FIX = {
  "dead-utility": "define the @utility in the stylesheet that owns it, or fix the name",
  "dead-type": "use a .type-* role the type stylesheet defines, or add the role",
  "dead-font": "define the --font-* token, or use a font that exists",
  "dead-shadow": "use a --shadow-* token that exists, or define it",
  "dead-colour": "use a colour token that exists (--color-* or a semantic token), or define it",
  "undeclared-var": "declare the custom property, or add it to allowVars in viewsonic-ui.config.json with the library that sets it",
};

/** Scan the project described by `config`. Returns Finding[]. */
export async function run(config) {
  const read = (rel) => readFileSync(join(config.root, rel), "utf8");
  const input = {
    cssFiles: config.styles.filter((f) => existsSync(join(config.root, f))).map(read),
    // Unset: every stylesheet in the sources that is not a token stylesheet is component-owned CSS.
    componentCssTexts: (config.componentCss ?? projectFiles(config, { all: true }).filter((f) => f.endsWith(".css") && !config.styles.includes(f)))
      .filter((f) => existsSync(join(config.root, f))).map(read),
    sources: projectFiles(config).map((rel) => ({ rel, text: stripComments(readRel(config, rel)) })),
  };
  return analyse(input, settingsFrom(config)).map((f) => ({
    check: CHECK,
    rule: f.kind,
    file: f.file,
    line: f.line,
    found: f.hit,
    why: f.msg,
    fix: FIX[f.kind],
  }));
}
