/**
 * check: contrast -- every foreground/surface token pair, in BOTH themes, against WCAG 2.2.
 *
 *   text  >= 4.5:1     large >= 3:1     ui (borders, rings, icons) >= 3:1
 *
 * Reads every stylesheet in config.styles, resolves each theme's custom
 * properties (`:root`, `.light`, `.dark`, `@theme`, nested `@media`/`@layer`,
 * `var()` chains) and measures each pair. A pair that cannot be measured is BAD,
 * never skipped. Pairs: the defaults below plus config.contrastPairs.
 *
 * Nothing here knows a colour or a font: the pairs are token NAMES and every
 * value is read from the project's own stylesheets, light and dark.
 *
 *   node <skill>/checks/run.mjs contrast
 *   node <skill>/checks/run.mjs contrast --fg <token> --bg <token> [--kind text|large|ui]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CHECK = "contrast";
/**
 * WCAG 2.2 bars per level. AA is the floor every project must clear; a project raises it to AAA with
 * `"contrastLevel": "AAA"` in viewsonic-ui.config.json. AAA has no stricter non-text bar (SC 1.4.11 is AA
 * only), so `ui` stays 3:1 at both levels.
 */
export const LEVELS = {
  AA: { text: 4.5, large: 3, ui: 3 },
  AAA: { text: 7, large: 4.5, ui: 3 },
};
export const NEED = LEVELS.AA;
/** The bars for a level name; anything but "AAA" is AA, the floor. */
export const needs = (level) => LEVELS[String(level ?? "AA").toUpperCase()] ?? LEVELS.AA;
export const RULE_IDS = ["contrast-text", "contrast-large", "contrast-ui"];
const THEMES = ["light", "dark"];

/* ─────────────────────────── colour parsing ─────────────────────────── */

const bad = (css) => new Error(`unparseable colour "${String(css).trim()}"`);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Split on top-level commas (mode "comma") or whitespace and "/" (mode "space"). */
function splitTop(s, mode) {
  const out = [];
  let depth = 0, buf = "";
  const push = () => { if (buf.trim()) out.push(buf.trim()); buf = ""; };
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && ((mode === "comma" && ch === ",") || (mode === "space" && (/\s/.test(ch) || ch === "/" || ch === ",")))) {
      push();
      if (mode === "space" && ch === "/") out.push("/");
    } else buf += ch;
  }
  push();
  return out;
}

/** Contents of `name( ... )` when the whole string is exactly that call. */
function callArgs(s, name) {
  const m = s.match(new RegExp(`^${name}\\(`, "i"));
  if (!m || !s.endsWith(")")) return null;
  let depth = 0;
  for (let i = name.length; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0 && i !== s.length - 1) return null;
  }
  return s.slice(name.length + 1, -1);
}

const num = (v, pct = 1) => {
  if (v === undefined) return NaN;
  if (v === "none") return 0;
  if (v.endsWith("%")) return (parseFloat(v) / 100) * pct;
  return Number(v);
};
const alphaOf = (v) => (v === undefined ? 1 : clamp01(num(v, 1)));

function hueDeg(v) {
  if (v === "none") return 0;
  const m = v.match(/^(-?[\d.]+)(deg|turn|rad|grad)?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "turn" ? n * 360 : m[2] === "rad" ? (n * 180) / Math.PI : m[2] === "grad" ? n * 0.9 : n;
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => 255 * clamp01(c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function rgbToOklab({ r, g, b }) {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const NAMED = { white: "#fff", black: "#000", transparent: "rgb(0 0 0 / 0)" };

/** Evaluate `calc()` / numeric channel expressions with l, c, h bound. */
function evalChannel(expr, vars) {
  let e = expr.trim();
  if (e === "none") return 0;
  e = e.replace(/\b([lch])\b/g, (_, k) => String(vars[k]));
  e = e.replace(/(-?[\d.]+)%/g, (_, n) => `(${parseFloat(n) / 100})`);
  e = e.replace(/(-?[\d.]+)deg/g, "$1").replace(/calc\(/g, "(");
  if (!/^[\d\s.+\-*/()e]+$/i.test(e)) return NaN;
  try { return Number(Function(`"use strict";return (${e})`)()); } catch { return NaN; }
}

/** `color-mix(in <space>, a [p%], b [p%])` */
function mix(inner, whole) {
  const parts = splitTop(inner, "comma");
  const sp = parts[0]?.match(/^in\s+([\w-]+)/i);
  if (!sp || parts.length !== 3) throw bad(whole);
  const space = sp[1].toLowerCase();
  if (space !== "srgb" && space !== "oklab") throw bad(whole);
  const item = (s) => {
    const lead = s.match(/^([\d.]+)%\s+(.*)$/s);
    if (lead) return { col: parseColour(lead[2]), p: parseFloat(lead[1]) };
    const trail = s.match(/^(.*?)(?:\s+([\d.]+)%)?$/s);
    return { col: parseColour(trail[1]), p: trail[2] === undefined ? undefined : parseFloat(trail[2]) };
  };
  let [x, y] = [item(parts[1]), item(parts[2])];
  if (x.p === undefined && y.p === undefined) { x.p = 50; y.p = 50; }
  else if (x.p === undefined) x.p = 100 - y.p;
  else if (y.p === undefined) y.p = 100 - x.p;
  const sum = x.p + y.p;
  if (sum <= 0) throw bad(whole);
  const [wx, wy] = [x.p / sum, y.p / sum];
  const alpha = (x.col.a * wx + y.col.a * wy) * Math.min(1, sum / 100);
  const ax = x.col.a * wx, ay = y.col.a * wy;
  const total = ax + ay;
  if (total === 0) return { r: 0, g: 0, b: 0, a: 0 };
  if (space === "srgb") {
    return {
      r: (x.col.r * ax + y.col.r * ay) / total,
      g: (x.col.g * ax + y.col.g * ay) / total,
      b: (x.col.b * ax + y.col.b * ay) / total,
      a: alpha,
    };
  }
  const [ox, oy] = [rgbToOklab(x.col), rgbToOklab(y.col)];
  const rgb = oklabToRgb(
    (ox.L * ax + oy.L * ay) / total,
    (ox.a * ax + oy.a * ay) / total,
    (ox.b * ax + oy.b * ay) / total,
  );
  return { ...rgb, a: alpha };
}

/** Parse a CSS colour into { r, g, b (0-255), a (0-1) }. Throws "unparseable colour" otherwise. */
export function parseColour(css) {
  const s = String(css).trim();
  const lower = s.toLowerCase();
  if (NAMED[lower]) return parseColour(NAMED[lower]);
  let m = s.match(/^#([\da-f]{3,8})$/i);
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }

  let inner;
  if ((inner = callArgs(s, "rgba") ?? callArgs(s, "rgb")) !== null) {
    const t = splitTop(inner, "space");
    const slash = t.indexOf("/");
    const chans = slash >= 0 ? t.slice(0, slash) : t.slice(0, 4);
    const a = slash >= 0 ? t[slash + 1] : t[3];
    if (chans.length < 3 || chans.some((c) => c === "/")) throw bad(s);
    const c = chans.slice(0, 3).map((v) => Math.min(255, Math.max(0, num(v, 255))));
    if (c.some(Number.isNaN)) throw bad(s);
    return { r: c[0], g: c[1], b: c[2], a: alphaOf(a) };
  }
  if ((inner = callArgs(s, "hsla") ?? callArgs(s, "hsl")) !== null) {
    const t = splitTop(inner, "space");
    const slash = t.indexOf("/");
    const chans = slash >= 0 ? t.slice(0, slash) : t.slice(0, 4);
    const a = slash >= 0 ? t[slash + 1] : t[3];
    if (chans.length < 3) throw bad(s);
    const h = hueDeg(chans[0]);
    const pct = (v) => (v === "none" ? 0 : parseFloat(v) / 100); // saturation and lightness are percentages
    const sFrac = pct(chans[1]), lFrac = pct(chans[2]);
    if ([h, sFrac, lFrac].some(Number.isNaN)) throw bad(s);
    return { ...hslToRgb(((h % 360) + 360) % 360, sFrac, lFrac), a: alphaOf(a) };
  }
  if ((inner = callArgs(s, "oklch")) !== null || (inner = callArgs(s, "oklab")) !== null) {
    const isLch = /^oklch/i.test(s);
    let t = splitTop(inner, "space");
    let base = null;
    if (t[0] === "from") {
      // relative colour: oklch(from <colour> L C H [/ A]), the origin is the first token(s) up to the channels
      const origin = originOf(inner.trim().slice(4).trim(), s);
      base = parseColour(origin.colour);
      t = splitTop(origin.rest, "space");
    }
    const slash = t.indexOf("/");
    const chans = slash >= 0 ? t.slice(0, slash) : t.slice(0, 4);
    const a = slash >= 0 ? t[slash + 1] : t[3];
    if (chans.length < 3) throw bad(s);
    let L, C, H, A_, B_;
    if (base) {
      const lab = rgbToOklab(base);
      const bl = { l: lab.L, c: Math.hypot(lab.a, lab.b), h: ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360 };
      if (isLch) {
        [L, C, H] = [evalChannel(chans[0], bl), evalChannel(chans[1], bl), evalChannel(chans[2], bl)];
      } else {
        throw bad(s);
      }
    } else if (isLch) {
      L = num(chans[0], 1); C = num(chans[1], 0.4); H = hueDeg(chans[2]);
    } else {
      L = num(chans[0], 1); A_ = num(chans[1], 0.4); B_ = num(chans[2], 0.4);
    }
    const alpha = base && a === undefined ? base.a : alphaOf(a);
    if (isLch) {
      if ([L, C, H].some(Number.isNaN)) throw bad(s);
      const hr = (H * Math.PI) / 180;
      return { ...oklabToRgb(L, C * Math.cos(hr), C * Math.sin(hr)), a: alpha };
    }
    if ([L, A_, B_].some(Number.isNaN)) throw bad(s);
    return { ...oklabToRgb(L, A_, B_), a: alpha };
  }
  if ((inner = callArgs(s, "color-mix")) !== null) return mix(inner, s);
  throw bad(s);
}

/** For `from <origin> rest...`: the origin (a colour token or function call) and the remainder. */
function originOf(str, whole) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") depth--;
    else if (depth === 0 && /\s/.test(str[i]) && i > 0) return { colour: str.slice(0, i), rest: str.slice(i + 1) };
  }
  throw bad(whole);
}

/* ───────────────────────────── the maths ───────────────────────────── */

export function luminance({ r, g, b }) {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };

/** WCAG ratio. A translucent surface is composited onto `base` (default white), then the foreground onto that. */
export function ratio(fg, bg, base = WHITE) {
  const solidBg = bg.a < 1 ? over(bg, base) : bg;
  const solidFg = fg.a < 1 ? over(fg, solidBg) : fg;
  const [hi, lo] = [luminance(solidFg), luminance(solidBg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const verdict = (r, kind, level = "AA") => (r >= needs(level)[kind] ? "GOOD" : "BAD");

/* ───────────────────────── theme resolution ───────────────────────── */

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/**
 * One selector part to a scope { theme: "light"|"dark"|"both" }, or null when the part is
 * not a theme context (a component selector, or any `data-*` scope other than data-theme).
 *   :root / html                         { both }
 *   .dark, [data-theme=dark]             { dark }
 */
function classifyPart(part) {
  let p = part.trim();
  if (!p) return null;
  let theme = null, root = false;
  const DATA_THEME = /\[data-theme(?:\s*=\s*["']?([^"'\]]+?)["']?)?\s*\]/g;
  p = p.replace(DATA_THEME, (m, value) => {
    if (/^dark$/i.test(value ?? "")) theme = "dark";
    else if (/^light$/i.test(value ?? "")) theme = "light";
    else return m;
    return " ";
  });
  p = p.replace(/(^|[\s>+~])(?:html|:root|body)(?=[\s.>+~[]|$)/g, (m, lead) => { root = true; return `${lead} `; });
  p = p.replace(/\.dark(?![\w-])/g, () => { theme = "dark"; return " "; });
  p = p.replace(/\.light(?![\w-])/g, () => { theme = theme ?? "light"; return " "; });
  if (p.replace(/[\s>+~]/g, "") !== "") return null;
  if (!theme && !root) return null;
  return { theme: theme ?? "both" };
}

/** A rule prelude to the list of scopes its selector parts declare into ([] = none). */
function classify(prelude, inDarkMedia) {
  const p = prelude.trim();
  if (/^@theme\b/.test(p)) return [{ theme: "both" }];
  if (p.startsWith("@")) return [];
  const seen = new Set();
  const out = [];
  // Top-level commas only: `:is(.dark, .x) [data-slot=card]` is one selector, not two.
  for (const part of splitTop(p, "comma")) {
    const k = classifyPart(part);
    if (!k) continue;
    const scope = inDarkMedia && k.theme === "both" ? { theme: "dark" } : k;
    const key = scope.theme;
    if (!seen.has(key)) { seen.add(key); out.push(scope); }
  }
  return out;
}

/** Walk one file: calls onDecl(scope, name, value, line) in source order. */
function walkCss(text, onDecl) {
  const css = stripComments(text);
  const nl = []; for (let k = 0; k < css.length; k++) if (css.charCodeAt(k) === 10) nl.push(k);
  const line = (i) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < i) lo = mid + 1; else hi = mid; } return lo + 1; };

  function body(start, end, scope, darkMedia) {
    let i = start, buf = "", bufStart = start, paren = 0;
    const flushDecl = (stop) => {
      const d = buf.trim();
      if (scope?.length && d.startsWith("--")) {
        const c = d.indexOf(":");
        if (c > 0) {
          const name = d.slice(0, c).trim();
          const value = d.slice(c + 1).trim().replace(/\s*!important$/i, "");
          const at = line(bufStart + buf.indexOf(d.slice(0, 2)));
          for (const sc of scope) onDecl(sc, name, value, at);
        }
      }
      buf = ""; bufStart = stop;
    };
    while (i < end) {
      const ch = css[i];
      if (ch === "(") paren++;
      else if (ch === ")") paren--;
      if (ch === "{" && paren <= 0) {
        const prelude = buf.trim();
        let depth = 1, j = i + 1;
        while (j < end && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
        const isDarkMedia = darkMedia || (/^@media/.test(prelude) && /prefers-color-scheme\s*:\s*dark/.test(prelude));
        // @media / @layer / @supports pass the current scope through; @theme is both themes
        const childScope = prelude.startsWith("@")
          ? (/^@theme\b/.test(prelude)
            ? [{ theme: "both" }]
            : /^@(media|layer|supports|container)\b/.test(prelude)
              ? (isDarkMedia && scope ? scope.map((sc) => (sc.theme === "both" ? { ...sc, theme: "dark" } : sc)) : scope)
              : null)
          : classify(prelude, darkMedia);
        body(i + 1, j - 1, childScope, isDarkMedia);
        i = j; buf = ""; bufStart = i;
        continue;
      }
      if (ch === ";" && paren <= 0) { flushDecl(i + 1); i++; continue; }
      if (buf === "") bufStart = i;
      buf += ch;
      i++;
    }
    flushDecl(end);
  }
  body(0, css.length, null, false);
}

const toFiles = (css) => (typeof css === "string" ? [{ file: "", text: css }] : css.map((f) => (typeof f === "string" ? { file: "", text: f } : f)));

/**
 * The custom properties in force for one theme.
 *   get(name)    the final value with every var() substituted, or undefined
 *   raw(name)    the declared value, un-substituted
 *   has(name)    declared at all (in either theme)
 *   where(name)  { file, line } of the declaration that wins in this theme
 *   names()      every declared property name
 * `css` is a string, or an array of { file, text }. Light is `:root`/`.light`/`@theme`;
 * dark is that, overlaid with `.dark` (and `:root` inside `prefers-color-scheme: dark`).
 */
export function resolveTheme(css, theme) {
  const vars = new Map();
  const origin = new Map();
  const known = new Set();
  const set = (d) => { vars.set(d.name, d.value); origin.set(d.name, { file: d.file, line: d.line }); };
  const decls = [];
  for (const { file, text } of toFiles(css)) walkCss(text, (scope, name, value, line) => decls.push({ ...scope, name, value, file, line }));
  for (const d of decls) known.add(d.name);
  // Base "both" first then the theme overlay, regardless of source order across blocks.
  const layers = [
    (d) => d.theme === "both",
    (d) => d.theme === theme,
  ];
  for (const inLayer of layers) for (const d of decls) if (inLayer(d)) set(d);

  const substitute = (value, depth, seen) => {
    let out = "", i = 0;
    while (i < value.length) {
      const at = value.indexOf("var(", i);
      if (at < 0) { out += value.slice(i); break; }
      out += value.slice(i, at);
      let depthP = 1, j = at + 4;
      while (j < value.length && depthP) { if (value[j] === "(") depthP++; else if (value[j] === ")") depthP--; j++; }
      const inner = value.slice(at + 4, j - 1);
      const comma = inner.indexOf(",");
      const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
      const got = name.startsWith("--") ? get(name, depth + 1, seen) : undefined;
      const sub = got ?? (fallback !== undefined ? substitute(fallback, depth + 1, seen) : undefined);
      if (sub === undefined) return undefined;
      out += sub;
      i = j;
    }
    return out;
  };
  function get(name, depth = 0, seen = new Set()) {
    if (depth > 30 || seen.has(name)) return undefined;
    const v = vars.get(name);
    if (v === undefined) return undefined;
    return substitute(v, depth, new Set([...seen, name]));
  }
  return {
    theme,
    get: (name) => get(name),
    raw: (name) => vars.get(name),
    has: (name) => known.has(name),
    where: (name) => origin.get(name),
    names: () => [...known],
  };
}

/* ─────────────────────────────── pairs ─────────────────────────────── */

/** fg token on bg token, and the bar it must clear. Extend with config.contrastPairs. */
export const PAIRS = [
  ...["background", "card", "popover", "muted"].flatMap((bg) => [
    { fg: "--foreground", bg: `--${bg}`, kind: "text" },
    { fg: "--muted-foreground", bg: `--${bg}`, kind: "text" },
    ...["action", "value", "success", "warning", "info", "destructive"].map((r) => ({ fg: `--${r}-ink`, bg: `--${bg}`, kind: "text" })),
  ]),
  { fg: "--card-foreground", bg: "--card", kind: "text" },
  { fg: "--popover-foreground", bg: "--popover", kind: "text" },
  { fg: "--primary-foreground", bg: "--primary", kind: "text" },
  { fg: "--secondary-foreground", bg: "--secondary", kind: "text" },
  { fg: "--accent-foreground", bg: "--accent", kind: "text" },
  { fg: "--destructive-foreground", bg: "--destructive", kind: "text" },
  { fg: "--sidebar-foreground", bg: "--sidebar", kind: "text" },
  { fg: "--sidebar-primary-foreground", bg: "--sidebar-primary", kind: "text" },
  { fg: "--sidebar-accent-foreground", bg: "--sidebar-accent", kind: "text" },
  { fg: "--input", bg: "--background", kind: "ui" },
  { fg: "--ring", bg: "--background", kind: "ui" },
  { fg: "--primary", bg: "--background", kind: "ui" },
];

const pairKey = (p) => `${p.fg}|${p.bg}`;

/** PAIRS merged with project pairs (a project pair replaces a default one with the same fg+bg). */
export function mergePairs(extra = []) {
  const m = new Map(PAIRS.map((p) => [pairKey(p), { ...p, source: "default" }]));
  for (const p of extra) m.set(pairKey(p), { kind: "text", ...p, source: "config" });
  return [...m.values()];
}

/**
 * Measure every pair in both themes.
 * @returns {{theme, fg, bg, kind, ratio, need, verdict: "GOOD"|"BAD"|"SKIPPED", why?, value?, source}[]}
 * A default pair whose tokens the project never declares is SKIPPED (the project has no such token);
 * a pair named in config.contrastPairs, or one whose token is declared but cannot be measured, is BAD.
 */
/** The theme name, as findings print it. */
export const label = (theme) => theme;

export function checkPairs(css, { pairs = mergePairs(), level = "AA" } = {}) {
  const bar = needs(level);
  const themes = THEMES.map((t) => resolveTheme(css, t));
  const out = [];
  for (const t of themes) {
    const baseTok = t.get("--background");
    let base = WHITE;
    try { if (baseTok) { const b = parseColour(baseTok); if (b.a === 1) base = b; } } catch { /* white */ }
    for (const p of pairs) {
      const { fg, bg } = p;
      const kind = p.kind ?? "text";
      const row = { theme: t.theme, fg, bg, kind, ratio: 0, need: bar[kind], source: p.source ?? "config" };
      const f = t.get(fg), b = t.get(bg);
      if (f === undefined || b === undefined) {
        const missing = [f === undefined ? fg : null, b === undefined ? bg : null].filter(Boolean);
        if (row.source === "default" && missing.some((m) => !t.has(m))) {
          out.push({ ...row, verdict: "SKIPPED", why: `${missing.join(", ")} not declared in this project` });
        } else {
          out.push({ ...row, verdict: "BAD", why: `unresolved token ${missing.join(", ")}` });
        }
        continue;
      }
      try {
        const r = ratio(parseColour(f), parseColour(b), base);
        out.push({ ...row, ratio: r, verdict: verdict(r, kind, level) });
      } catch {
        out.push({ ...row, verdict: "BAD", why: "unparseable colour", value: `${fg}: ${f} | ${bg}: ${b}` });
      }
    }
  }
  return out;
}

const textOf = (css) => toFiles(css).map((f) => f.text).join("\n");

/**
 * Existing foreground tokens that clear the bar on this surface IN BOTH THEMES, closest role
 * first (same role family as the failing token), then best worst-case ratio. [] = nothing passes: ask the owner.
 * @param opts.need  override the bar (tests)
 */
export function suggest(fgToken, bgToken, kind, css, opts = {}) {
  const need = opts.need ?? needs(opts.level)[kind];
  const themes = THEMES.map((t) => resolveTheme(css, t));
  const candidates = [...new Set([...stripComments(textOf(css)).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))]
    .filter((n) => /-(ink|foreground|bright|dark)$/.test(n) && !n.startsWith("--color-") && n !== fgToken && n !== bgToken);
  const family = fgToken.replace(/^--/, "").split("-")[0];
  return candidates
    .map((name) => {
      const ratios = themes.map((t) => {
        const f = t.get(name), b = t.get(bgToken);
        try { return f && b ? ratio(parseColour(f), parseColour(b)) : 0; } catch { return 0; }
      });
      return { name, worst: Math.min(...ratios), sameFamily: name.startsWith(`--${family}`) };
    })
    .filter((c) => c.worst >= need)
    .sort((a, b) => Number(b.sameFamily) - Number(a.sameFamily) || b.worst - a.worst)
    .slice(0, 5);
}

/* ───────────────────────── the check contract ───────────────────────── */

function readStyles(config) {
  const files = [];
  for (const rel of config.styles ?? []) {
    const abs = join(config.root, rel);
    if (existsSync(abs)) files.push({ file: rel.split("\\").join("/"), text: readFileSync(abs, "utf8") });
  }
  return files;
}

const fmt = (n) => n.toFixed(2);

/** run(config, options) -> Finding[]. options.fg/bg/kind probe a single pair and print every row via options.note. */
export async function run(config, options = {}) {
  const files = readStyles(config);
  if (files.length === 0) return { skipped: "no stylesheet in config.styles could be read" };
  const probe = options.fg || options.bg;
  const kind0 = options.kind ?? "text";
  if (probe) {
    if (!options.fg || !options.bg) throw new Error("contrast probe needs both --fg and --bg");
    if (!NEED[kind0]) throw new Error(`--kind must be one of ${Object.keys(NEED).join(", ")}`);
  }
  const pairs = probe
    ? [{ fg: options.fg, bg: options.bg, kind: kind0, source: "config" }]
    : mergePairs(config.contrastPairs);
  const level = String(config.contrastLevel ?? "AA").toUpperCase();
  const rows = checkPairs(files, { pairs, level });
  const note = options.note ?? (() => {});
  const findings = [];
  const firstFile = config.styles?.[0] ?? "";
  const resolved = new Map();
  const tHere = (theme) => {
    const key = label(theme);
    if (!resolved.has(key)) resolved.set(key, resolveTheme(files, theme));
    return resolved.get(key);
  };

  let skippedPairs = 0;
  for (const r of rows) {
    const at = label(r.theme);
    if (r.verdict === "SKIPPED") { skippedPairs++; if (!probe) note(`SKIPPED pair ${r.fg} on ${r.bg} (${at}): ${r.why}`); continue; }
    const alts = r.verdict === "BAD" ? suggest(r.fg, r.bg, r.kind, files, { level }) : [];
    if (probe) {
      note(`${r.verdict}  ${at.padEnd(5)}  ${fmt(r.ratio).padStart(5)}:1 (need ${r.need})  ${r.fg} on ${r.bg}${r.why ? `  [${r.why}]` : ""}`);
    }
    if (r.verdict !== "BAD") continue;
    const where = tHere(r.theme).where(r.fg);
    const unparseable = r.why === "unparseable colour";
    findings.push({
      check: CHECK,
      rule: `contrast-${r.kind}`,
      file: where?.file || firstFile,
      line: where?.line ?? 1,
      found: unparseable ? `${at} ${r.fg} on ${r.bg} = unmeasurable (${r.value})` : r.why
        ? `${at} ${r.fg} on ${r.bg} = ${r.why}`
        : `${at} ${r.fg} on ${r.bg} = ${fmt(r.ratio)}:1 (need ${r.need}, WCAG ${level})`,
      why: unparseable
        ? "unparseable colour"
        : r.why
          ? `${at}: ${r.why}; the pair cannot be measured`
          : `${at} ${r.fg} on ${r.bg} is ${fmt(r.ratio)}:1, below the ${r.need}:1 that ${r.kind} needs at WCAG ${level}; the design is not done until it passes`,
      fix: unparseable
        ? `declare it as hex, rgb(), hsl(), oklch() or color-mix(in srgb|oklab, …) so it can be measured (${r.value})`
        : r.why
          ? `declare ${r.fg} and ${r.bg} in config.styles, or drop the pair from contrastPairs`
          : alts.length
            ? `try: ${alts.map((a) => `${a.name} (${fmt(a.worst)}:1)`).join(", ")}`
            : `NO EXISTING TOKEN PASSES on ${r.bg} - ask the user for a new value`,
    });
  }
  const measured = rows.length - skippedPairs;
  if (measured === 0) {
    return { skipped: "no contrast pairs could be resolved - declare the tokens or add contrastPairs to viewsonic-ui.config.json" };
  }
  if (skippedPairs) note(`contrast: ${measured} pair-themes measured, ${skippedPairs} skipped (tokens not declared)`);
  if (probe && findings.length) {
    const alts = suggest(options.fg, options.bg, kind0, files, { level });
    note(alts.length
      ? `        try: ${alts.map((a) => `${a.name} (${fmt(a.worst)}:1)`).join(", ")}`
      : `        NO EXISTING TOKEN PASSES on ${options.bg} - ask the user for a new value`);
  }
  return findings;
}
