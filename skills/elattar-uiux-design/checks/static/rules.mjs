/**
 * check: rules -- typography, colour, motion and components come from the system,
 * never hard-coded.
 *
 * Ported from the ViewSonic design system's check-rules guard and made
 * config-driven:
 *   config.sources   directories scanned
 *   config.styles    where the `.type-*` roles are defined (any of these files)
 *   config.uiDir     the one directory where raw elements and raw icons are allowed
 *
 * The scanner uses the project's own `typescript` (resolved from config.root). When
 * the project has none, a regex pass runs instead and one note line says so.
 * The rule ids are the six categories: typography, colour, motion, components,
 * alignment (centred reading text), hierarchy (heading levels skipping inside one file).
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { projectFiles, readRel, stripComments } from "../lib.mjs";

export const CHECK = "rules";

/** The project's TypeScript compiler API, or null when it cannot be resolved. */
export function resolveTypeScript(root) {
  try {
    return createRequire(join(root, "package.json"))("typescript");
  } catch {
    return null;
  }
}

/** `.type-<role>` classes defined in any of the system-defining stylesheets. */
function typeRoles(config) {
  const roles = new Set();
  for (const rel of config.styles) {
    let css;
    try { css = readRel(config, rel); } catch { continue; }
    for (const m of css.matchAll(/\.type-([a-z0-9-]+)\s*[,{]/g)) roles.add(m[1]);
  }
  return roles;
}

// ── class-string rules ──────────────────────────────────────────────────────
// A descendant/attribute selector variant (`[&_button]:`, `[&_[data-slot=button]]:`, `[&_[role=tab]]:`) that restyles the
// size, height, width, padding, radius, outline or ring of every control under it: the page-wide override that flattens a system.
const GLOBAL_OVERRIDE = /(?<![\w-])(?:[\w-]+:)*\[&[_>][^\s"'`]*?(?:button|input|select|textarea|data-slot|role=|type=|:focus)[^\s"'`]*?\]:(?:[\w-]+:)*!?(?:min-h|max-h|h|min-w|max-w|w|size|p[xytblrse]?|rounded(?:-[trbl]{1,2})?|outline|ring|inset-ring)(?:-[\w[\]().\/%-]+)?!?(?![\w-])/g;
const CLASS_RULES = {
  typography: [
    [/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g, "stock text size - use a .type-* role"],
    [/(?<![\w-])text-\[(?!CanvasText\]|Canvas\])[^\]]*\]/g, "arbitrary text size - use a .type-* role"],
    [/(?<![\w-])font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/g, "stock font weight - the .type-* role carries the weight"],
    [/(?<![\w-])font-(?:mono|sans|serif)(?![\w-])/g, "font family - the .type-* role carries the face"],
    [/(?<![\w-])font-\[[^\]]*\]/g, "arbitrary font - use a .type-* role"],
    [/(?<![\w-])tracking-[\w[\]().-]+/g, "letter-spacing - the .type-* role carries the tracking"],
    [/(?<![\w-])leading-[\w[\]().-]+/g, "line-height - the .type-* role carries the leading"],
    [/(?<![\w-:])(?:uppercase|lowercase|capitalize)(?![\w-])/g, "text-transform - not part of any .type-* role"],
  ],
  colour: [
    [/(?<![\w-])(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|divide|accent|caret|placeholder|inset-ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?(?![\w-])/g, "Tailwind stock palette - use a semantic colour token"],
    [/(?<![\w-])(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|divide|accent|caret|placeholder)-(?:white|black)(?:\/\d+)?(?![\w-])/g, "literal white/black - use a semantic colour token"],
    [/(?<![\w-])(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|divide|accent|caret|placeholder)-\[(?![^\]]*var\(--)[^\]]*(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\()[^\]]*\]/g, "arbitrary colour - use a semantic colour token"],
  ],
  motion: [
    [/(?<![\w-])duration-(?:\d+|\[[^\]]*\])(?![\w-])/g, "stock/arbitrary duration - use duration-fast|normal|slow|… from motion.css"],
    [/(?<![\w-])delay-(?:\d+|\[[^\]]*\])(?![\w-])/g, "stock/arbitrary delay - use a motion token"],
    [/(?<![\w-])ease-(?:linear|in|out|in-out|\[[^\]]*\])(?![\w-])/g, "stock/arbitrary easing - use ease-enter|exit|move|standard|… from motion.css"],
    [/(?<![\w-])animate-(?:spin|ping|pulse|bounce|\[[^\]]*\])(?![\w-])/g, "stock animation - use an anim-* utility from motion.css"],
  ],
};

// ── alignment: centred reading text ─────────────────────────────────────────
// `text-center` (any variant prefix) on the same class string as a reading role.
// `type-body` and `type-lead` are always reading text. `type-small` is the caption
// role: a centred caption or empty-state line is normal, so it only counts when the
// element visibly holds long static text (LONG_TEXT characters or more) -- the
// repo scan found only one-line captions without this. A single line is exempt: `whitespace-nowrap`,
// `text-nowrap`, `truncate` or `line-clamp-1` on the same string proves it is one
// line (button label, badge, number). Tokens are matched whole, so
// `text-centered` or `type-body-x` never count.
const CENTRED = /^(?:[\w[\]:-]+:)?text-center$/;
const READING = /^(?:[\w[\]:-]+:)?type-(?:body|lead)$/;
const READING_SMALL = /^(?:[\w[\]:-]+:)?type-small$/;
export const LONG_TEXT = 80;
const ONE_LINE = /^(?:[\w[\]:-]+:)?(?:whitespace-nowrap|text-nowrap|truncate|line-clamp-1)$/;
const ALIGN_WHY = "centred reading text - left-align; centre only a single short line (button, badge, number)";

/** `[found, offset]` pairs for one class string; empty when nothing is wrong. `longText`: the element holds long static text. */
export function alignmentHits(text, longText = false) {
  const toks = [...text.matchAll(/[^\s"'`]+/g)];
  const has = (re) => toks.some((t) => re.test(t[0]));
  if (!has(CENTRED) || !(has(READING) || (longText && has(READING_SMALL))) || has(ONE_LINE)) return [];
  const centred = toks.find((t) => CENTRED.test(t[0]));
  return [[centred[0], centred.index]];
}

// ── literal rules for any string, inline style and component CSS ───────────
const COLOUR_LITERAL = /(?:^|[:(,]\s*)#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*[\d.]/;
const TIMING_LITERAL = /\b\d+(?:\.\d+)?m?s\b|cubic-bezier\(|\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/;
const NAMED_COLOUR = /^(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|cyan|magenta)$/i;

const STYLE_PROPS = {
  typography: /^(?:fontSize|fontWeight|fontFamily|letterSpacing|lineHeight|textTransform|font)$/,
  colour: /^(?:color|background|backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|outlineColor|fill|stroke|boxShadow|textShadow|caretColor|accentColor)$/,
  motion: /^(?:transition|transitionDuration|transitionTimingFunction|transitionDelay|animation|animationDuration|animationTimingFunction)$/,
};

// Elements the system already provides as components (components/ui defines them).
const RAW_ELEMENTS = {
  button: "Button (or a DS trigger)",
  select: "Select / NativeSelect",
  textarea: "Textarea",
  label: "Label",
  kbd: "Kbd",
  table: "Table",
  hr: "Separator",
  progress: "Progress",
  dialog: "Dialog",
};
const RAW_INPUT_OK = /^(?:file|hidden|range|color)$/;

// ── hand-made interactive elements and copied chassis ──────────────────────
const INTERACTIVE_TAGS = /^(?:div|span|li)$/;
const INTERACTIVE_ROLES = /^(?:button|checkbox|radio|switch|tab|menuitem)$/;
const INTERACTIVE_ATTRS = new Set(["onClick", "onKeyDown"]);
const INTERACTIVE_WHY = (what) => `hand-made interactive ${what} - use the system component (Button, Toggle, Checkbox, Switch, Tabs, a menu item)`;
export const CHASSIS_SHARE = 0.8;
export const CHASSIS_MIN = 5;

// A div whose role is a non-interactive container (an explicit list) holds a widget; treeitem, option, link, menuitem*, tab… are controls and stay flagged.
// `slider` stays flagged: the system has Slider. A scrollable region takes tabIndex={0} so the keyboard can scroll it.
const CONTAINER_ROLE = /^(?:group|region|list|tree|treegrid|grid|toolbar|tablist|radiogroup|menu|menubar|listbox|presentation|none)$/;
const SCROLLABLE = /(?<![\w-])overflow-(?:[xy]-)?(?:auto|scroll)(?![\w-])/;

const classTokens = (text) => text.split(/\s+/).filter(Boolean);
const pascal = (s) => s.replace(/(?:^|[-_])([a-z0-9])/g, (_, c) => c.toUpperCase());

/** `buttonVariants` -> `Button`; no variable name -> the file's name. */
function chassisName(varName, rel) {
  const base = varName ? varName.replace(/(?:Variants?|Styles?|Classes)$/, "") : "";
  if (base) return base[0].toUpperCase() + base.slice(1);
  return pascal(rel.split("/").pop().replace(/\.[a-z]+$/, ""));
}

/** Sets of class tokens a `cva()` call can produce: the base, the base with each variant, each variant alone. */
function chassisSets(name, rel, base, variants) {
  const sets = [];
  const add = (...texts) => {
    const set = new Set(texts.flatMap(classTokens));
    if (set.size >= CHASSIS_MIN) sets.push({ name, file: rel, classes: set });
  };
  add(base);
  for (const v of variants) { add(base, v); add(v); }
  return sets;
}

/**
 * Class sets of every `cva(` in one component file: [{ name, file, classes:Set }].
 * AST when `ts` is given, otherwise a regex pass over the string literals of the call.
 */
export function chassisFromSource(rel, src, ts) {
  const out = [];
  if (ts) {
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const str = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ") : null);
    const strings = (n, acc = []) => { const t = str(n); if (t !== null) acc.push(t); else ts.forEachChild(n, (c) => strings(c, acc)); return acc; };
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(sf) === "cva") {
        const decl = node.parent && ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(sf) : "";
        const base = node.arguments[0] ? strings(node.arguments[0]).join(" ") : "";
        const variants = [];
        const cfg = node.arguments[1];
        if (cfg && ts.isObjectLiteralExpression(cfg)) {
          for (const p of cfg.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const key = p.name.getText(sf).replace(/["']/g, "");
            if (key === "variants" || key === "compoundVariants") variants.push(...strings(p.initializer));
          }
        }
        out.push(...chassisSets(chassisName(decl, rel), rel, base, variants));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }
  for (const m of src.matchAll(/(?:(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*)?\bcva\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      } else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const body = src.slice(start, i);
    const lits = [...body.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((x) => x[2]).filter((t) => /\s/.test(t.trim()) || /-/.test(t));
    const [base = "", ...variants] = lits;
    out.push(...chassisSets(chassisName(m[1], rel), rel, base, variants));
  }
  return out;
}

/** Chassis of every component file in the project's ui folder, read at run time. */
export function loadChassis(config, ts) {
  const uiDir = config.uiDir ?? "components/ui";
  const out = [];
  for (const rel of projectFiles(config, { withStyles: false })) {
    if (!rel.startsWith(`${uiDir}/`) || !/\.tsx?$/.test(rel)) continue;
    const src = readRel(config, rel);
    if (!src.includes("cva(")) continue;
    out.push(...chassisFromSource(rel, src, ts));
  }
  return out;
}

/** The chassis a class string redraws (highest share of its classes present, at least CHASSIS_SHARE and CHASSIS_MIN), or null. */
export function copiedChassis(text, chassis) {
  if (!chassis?.length) return null;
  const have = new Set(classTokens(text));
  let best = null;
  for (const c of chassis) {
    let shared = 0;
    for (const t of c.classes) if (have.has(t)) shared++;
    const share = shared / c.classes.size;
    if (shared >= CHASSIS_MIN && share >= CHASSIS_SHARE && (!best || share > best.share || (share === best.share && shared > best.shared))) {
      best = { name: c.name, share, shared, of: c.classes.size };
    }
  }
  return best;
}
const chassisWhy = (hit) => `this redraws <${hit.name}> - compose <${hit.name}> instead`;
const chassisFound = (hit) => `${hit.shared} of ${hit.of} ${hit.name} classes`;

function scanTs(rel, src, out, roles, ctx) {
  const { ts, uiDir } = ctx;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const seen = new Set();
  const push = (category, node, found, why, offset = 0) => {
    const key = `${category}:${node.getStart(sf) + offset}:${found}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ category, file: rel, line: at(node), found, why });
  };

  const CLASS_CALLEES = new Set(["cn", "cva", "clsx", "twMerge", "tv"]);
  const CODE_PROPS = new Set(["className", "class", "code", "source", "classes", "classNames"]);

  const classText = (node, joiner = " ") => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(joiner);
    return null;
  };

  // Static text of the JSX element that owns this node (JSX text and string literals), 0 when none.
  const ownerTextLength = (node) => {
    let el = node;
    while (el && !ts.isJsxElement(el)) el = el.parent;
    if (!el) return 0;
    let n = 0;
    const walk = (c) => {
      if (ts.isJsxText(c)) n += c.text.trim().length;
      else if (ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c)) n += c.text.length;
      else if (ts.isTemplateExpression(c)) n += c.head.text.length + c.templateSpans.reduce((a, s) => a + s.literal.text.length, 0);
      ts.forEachChild(c, walk);
    };
    el.children.forEach(walk);
    return n;
  };

  const checkClassString = (node, text) => {
    for (const [category, rules] of Object.entries(CLASS_RULES)) {
      for (const [re, why] of rules) for (const m of text.matchAll(re)) push(category, node, m[0], why, m.index);
    }
    for (const m of text.matchAll(/(?<![\w-])type-([a-z0-9-]+)(?![\w-])/g)) {
      if (!roles.has(m[1])) push("typography", node, m[0], "not one of the current .type-* roles", m.index);
    }
    for (const [found, at] of alignmentHits(text, ownerTextLength(node) >= LONG_TEXT)) push("alignment", node, found, ALIGN_WHY, at);
  };

  // Strings inside class contexts: className attributes, cn/cva/… calls, and code/source sample props.
  const walkClassContext = (node) => {
    const text = classText(node);
    if (text !== null) checkClassString(node, text);
    ts.forEachChild(node, walkClassContext);
  };

  // Names imported from lucide-react, which outside components/ui render through Icon.
  const lucide = new Set();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.moduleSpecifier.text !== "lucide-react") continue;
    for (const el of stmt.importClause?.namedBindings?.elements ?? []) lucide.add(el.name.text);
  }

  // Heading levels, in document order, for this file only.
  let lastHeading = 0;

  const visit = (node) => {
    // className / code sample attributes
    if (ts.isJsxAttribute(node) && CODE_PROPS.has(node.name.getText(sf)) && node.initializer) {
      walkClassContext(node.initializer);
    }
    // object properties named like class/code samples: { className: "…" }, { code: `…` }, cva variants
    if (ts.isPropertyAssignment(node) && CODE_PROPS.has(node.name.getText(sf).replace(/["']/g, ""))) {
      walkClassContext(node.initializer);
    }
    if (ts.isCallExpression(node) && CLASS_CALLEES.has(node.expression.getText(sf))) {
      node.arguments.forEach(walkClassContext);
      // arguments of one call are one class list: "type-body", cond && "text-center"
      const texts = [];
      const collect = (n) => { const t = classText(n); if (t !== null) texts.push(t); else ts.forEachChild(n, collect); };
      node.arguments.forEach(collect);
      const long = ownerTextLength(node) >= LONG_TEXT;
      if (!texts.some((t) => alignmentHits(t, long).length)) {
        for (const [found] of alignmentHits(texts.join(" "), long)) push("alignment", node, found, ALIGN_WHY);
      }
    }

    // a class list that redraws a ui component
    if (ctx.chassis?.length && !rel.startsWith(`${uiDir}/`)) {
      const insideHolder = (n) => {
        for (let p = n.parent; p; p = p.parent) {
          if (ts.isJsxAttribute(p) && CODE_PROPS.has(p.name.getText(sf))) return true;
          if (ts.isPropertyAssignment(p) && CODE_PROPS.has(p.name.getText(sf).replace(/["']/g, ""))) return true;
          if (ts.isStatement(p)) return false;
        }
        return false;
      };
      const isHolder = (ts.isJsxAttribute(node) && CODE_PROPS.has(node.name.getText(sf)) && node.initializer)
        || (ts.isPropertyAssignment(node) && CODE_PROPS.has(node.name.getText(sf).replace(/["']/g, "")))
        || (ts.isCallExpression(node) && CLASS_CALLEES.has(node.expression.getText(sf)) && !insideHolder(node));
      if (isHolder) {
        const root = ts.isJsxAttribute(node) || ts.isPropertyAssignment(node) ? node.initializer : node;
        const owner = ts.isJsxAttribute(node) ? node.parent?.parent : null;
        const composes = owner && /^[A-Z]/.test(owner.tagName?.getText(sf) ?? "");
        const named = ts.isCallExpression(node) && node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : null;
        const passedOn = named && new RegExp(String.raw`<[A-Z][\w.]*\b[^>]*\b(?:className|class)=\{\s*${named}\s*\}`).test(sf.text);
        if (!composes && !passedOn) {
          const texts = [];
          const collect = (n) => { const t = classText(n); if (t !== null) texts.push(t); else ts.forEachChild(n, collect); };
          collect(root);
          const hit = copiedChassis(texts.join(" "), ctx.chassis);
          if (hit) push("copied-chassis", node, chassisFound(hit), chassisWhy(hit));
        }
      }
    }

    // inline style={{ … }}
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "style" && node.initializer && ts.isJsxExpression(node.initializer)) {
      const obj = node.initializer.expression;
      if (obj && ts.isObjectLiteralExpression(obj)) {
        for (const p of obj.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = p.name.getText(sf).replace(/["']/g, "");
          const value = classText(p.initializer, "--x") ?? (ts.isNumericLiteral(p.initializer) ? p.initializer.text : null);
          if (value === null) continue;
          const v = value.replace(/var\(--[\w-]*\)/g, "");
          if (STYLE_PROPS.typography.test(key) && /[\da-z]/i.test(v) && !/^\s*(?:inherit|normal|none|initial|unset)\s*$/.test(v)) {
            push("typography", p, `${key}: ${value}`, "inline typography - use a .type-* role");
          }
          if (STYLE_PROPS.colour.test(key) && (COLOUR_LITERAL.test(v) || v.trim().split(/\s+/).some((w) => NAMED_COLOUR.test(w)))) {
            push("colour", p, `${key}: ${value}`, "inline colour - use a colour token");
          }
          if (STYLE_PROPS.motion.test(key) && TIMING_LITERAL.test(v)) {
            push("motion", p, `${key}: ${value}`, "inline timing - use var(--duration-*) and var(--ease-*)");
          }
        }
      }
    }

    // colour literals anywhere in code strings (not comments)
    const lit = classText(node);
    const plain = lit === null ? null : lit.replace(/--[\w-]+\s*:\s*[^;}\n]+/g, "");
    if (plain !== null && COLOUR_LITERAL.test(plain) && !/^(?:https?:|data:|\/)/.test(plain)) {
      push("colour", node, plain.match(COLOUR_LITERAL)[0].trim(), "hard-coded colour value - use a colour token");
    }

    // heading levels never skip inside one file
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^h[1-6]$/.test(node.tagName.getText(sf))) {
      const level = +node.tagName.getText(sf)[1];
      if (lastHeading && level > lastHeading + 1) {
        push("hierarchy", node, `<h${level}>`, `heading skips from h${lastHeading} to h${level} - use h${lastHeading + 1}, then style with a .type-* role`);
      }
      lastHeading = level;
    }

    // raw elements where the system has a component
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !rel.startsWith(`${uiDir}/`)) {
      const tag = node.tagName.getText(sf);
      const attrs = node.attributes.properties;
      const attr = (name) => attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);
      const parent = node.parent && ts.isJsxElement(node.parent) ? node.parent.parent : node.parent;
      const parentOpening = parent && ts.isJsxElement(parent) ? parent.openingElement : null;
      const hostedByTrigger = parentOpening?.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "asChild");
      if (RAW_ELEMENTS[tag] && !hostedByTrigger) {
        push("components", node, `<${tag}>`, `raw <${tag}> - use ${RAW_ELEMENTS[tag]}`);
      }
      // A documented exception sits on the line above: `// allow-direct-icon: <reason>`.
      const lineAbove = sf.text.slice(0, node.getStart(sf)).split("\n").slice(-2).join("\n");
      if (lucide.has(tag) && !lineAbove.includes("allow-direct-icon")) {
        push("components", node, `<${tag}>`, `raw Lucide icon - use <Icon icon={${tag}} />`);
      }
      if (INTERACTIVE_TAGS.test(tag) && !hostedByTrigger) {
        let why = null;
        const roleAttr = attr("role");
        const roleVal = roleAttr?.initializer ? classText(ts.isJsxExpression(roleAttr.initializer) && roleAttr.initializer.expression ? roleAttr.initializer.expression : roleAttr.initializer) : null;
        const classAttr = attr("className") ?? attr("class");
        const scrollable = classAttr?.initializer ? (() => { const t = []; const c = (n) => { const x = classText(n); if (x !== null) t.push(x); else ts.forEachChild(n, c); }; c(classAttr.initializer); return SCROLLABLE.test(t.join(" ")); })() : false;
        for (const a of attrs) {
          if (roleVal !== null && CONTAINER_ROLE.test(roleVal)) break;
          if (!ts.isJsxAttribute(a)) continue;
          const name = a.name.getText(sf);
          const val = a.initializer;
          const lit = val ? classText(ts.isJsxExpression(val) && val.expression ? val.expression : val) : null;
          if (INTERACTIVE_ATTRS.has(name)) why = name;
          else if (name === "role" && lit !== null && INTERACTIVE_ROLES.test(lit)) why = `role="${lit}"`;
          else if (name === "tabIndex" && !scrollable && val && /^(?:\{\s*0\s*\}|"0")$/.test(val.getText(sf))) why = "tabIndex={0}";
          if (why) break;
        }
        if (why) push("interactive-div", node, `<${tag} ${why}>`, INTERACTIVE_WHY(`<${tag}>`));
      }
      if (tag === "input" && !hostedByTrigger) {
        const type = attr("type");
        const t = type && type.initializer ? classText(type.initializer) : null;
        if (!t || !RAW_INPUT_OK.test(t)) push("components", node, `<input${t ? ` type="${t}"` : ""}>`, "raw <input> - use Input, Checkbox, RadioGroup, Switch or Slider");
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function scanCss(rel, src, out) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const lines = clean.split("\n");
  lines.forEach((line, i) => {
    const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;{}]+);?/);
    if (!decl || decl[1].startsWith("--")) return;
    const [, prop, value] = decl;
    const add = (category, why) => out.push({ category, file: rel, line: i + 1, found: `${prop}: ${value.trim()}`, why });
    if (/^(?:font-size|font-weight|font-family|letter-spacing|line-height|text-transform|font)$/.test(prop) && !/var\(--/.test(value) && !/^\s*(?:inherit|normal|none|initial)\s*$/.test(value)) {
      add("typography", "hard-coded typography in CSS - use a .type-* role or var(--text-*)");
    }
    if (/(?:^|-)(?:color|background|fill|stroke|shadow)$|^background$|^border(?:-\w+)?$|^outline$/.test(prop) && (COLOUR_LITERAL.test(value) || value.trim().split(/\s+/).some((w) => NAMED_COLOUR.test(w)))) {
      add("colour", "hard-coded colour in CSS - use a colour token");
    }
    if (/^(?:transition|transition-duration|transition-timing-function|transition-delay|animation|animation-duration|animation-timing-function|animation-delay)$/.test(prop)) {
      const raw = value.replace(/var\(--[\w-]+\)/g, "");
      if (/\b\d+(?:\.\d+)?m?s\b/.test(raw) || /cubic-bezier\(|\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/.test(raw)) {
        add("motion", "hard-coded timing in CSS - use var(--duration-*) and var(--ease-*)");
      }
    }
  });
}

/**
 * Regex pass for projects without a resolvable `typescript`. Weaker than the AST
 * pass (no `asChild` host detection, no inline-style object analysis, no Lucide
 * import tracking) but it keeps every class-string rule and the raw-element rule.
 */
function scanTsFallback(rel, src, out, roles, ctx) {
  const lines = src.split(/\r?\n/);
  const outsideUi = !rel.startsWith(`${ctx.uiDir}/`);
  let lastHeading = 0;
  if (outsideUi) {
    // multi-line opening tags: scan the whole source with comments blanked
    const clean = stripComments(src);
    for (const m of clean.matchAll(/<(div|span|li)\b((?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*)>/g)) {
      const a = m[2];
      const role = a.match(/\brole=["']([^"']+)["']/)?.[1];
      if (role && CONTAINER_ROLE.test(role)) continue;
      const scrollable = SCROLLABLE.test(a);
      if (/asChild/.test(clean.slice(Math.max(0, m.index - 200), m.index).split("\n").slice(-2).join("\n"))) continue;
      const hit = a.match(/\b(onClick|onKeyDown)=/)?.[1]
        ?? (a.match(/\brole=["'](button|checkbox|radio|switch|tab|menuitem)["']/) ? `role="${a.match(/\brole=["']([^"']+)/)[1]}"` : null)
        ?? (!scrollable && /\btabIndex=(?:\{\s*0\s*\}|"0")/.test(a) ? "tabIndex={0}" : null);
      if (hit) out.push({ category: "interactive-div", file: rel, line: clean.slice(0, m.index).split("\n").length, found: `<${m[1]} ${hit}>`, why: INTERACTIVE_WHY(`<${m[1]}>`) });
    }
  }
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    const add = (category, found, why) => out.push({ category, file: rel, line: i + 1, found, why });
    for (const m of line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').matchAll(/<h([1-6])(?=[\s>/])/g)) {
      const level = +m[1];
      if (lastHeading && level > lastHeading + 1) {
        add("hierarchy", `<h${level}>`, `heading skips from h${lastHeading} to h${level} - use h${lastHeading + 1}, then style with a .type-* role`);
      }
      lastHeading = level;
    }
    if (/\b(?:className|class|cn|cva|clsx|twMerge|tv)\b/.test(line)) {
      for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
        for (const [category, rules] of Object.entries(CLASS_RULES)) {
          for (const [re, why] of rules) for (const hit of m[2].matchAll(re)) add(category, hit[0], why);
        }
        for (const hit of m[2].matchAll(/(?<![\w-])type-([a-z0-9-]+)(?![\w-])/g)) {
          if (!roles.has(hit[1])) add("typography", hit[0], "not one of the current .type-* roles");
        }
        for (const [found] of alignmentHits(m[2])) add("alignment", found, ALIGN_WHY);
      }
    }
    if (/\b(?:className|class|cn|cva|clsx|twMerge|tv)\b/.test(line)) {
      const joined = [...line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]).join(" ");
      const long = [...line.matchAll(/>([^<>{}]+)</g)].some((m) => m[1].trim().length >= LONG_TEXT);
      for (const [found] of alignmentHits(joined, long)) add("alignment", found, ALIGN_WHY);
    }
    if (outsideUi && ctx.chassis?.length && /\b(?:className|class|cn|cva|clsx|twMerge|tv)\b/.test(line) && !/<[A-Z]\w*\b[^>]*\b(?:className|class)=/.test(line)) {
      const joined = [...line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]).join(" ");
      const hit = copiedChassis(joined, ctx.chassis);
      const named = line.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:cn|clsx|twMerge|tv)\(/)?.[1];
      const passedOn = named && new RegExp(String.raw`<[A-Z][\w.]*\b[^>]*\b(?:className|class)=\{\s*${named}\s*\}`).test(src);
      if (hit && !passedOn) add("copied-chassis", chassisFound(hit), chassisWhy(hit));
    }
    if (outsideUi && !/asChild/.test(line)) {
      for (const m of line.matchAll(/<(button|select|textarea|label|kbd|table|hr|progress|dialog)(?=[\s>/])/g)) {
        add("components", `<${m[1]}>`, `raw <${m[1]}> - use ${RAW_ELEMENTS[m[1]]}`);
      }
      for (const m of line.matchAll(/<input\b([^>]*)/g)) {
        const type = m[1].match(/\btype=["']([^"']+)["']/);
        if (!type || !RAW_INPUT_OK.test(type[1])) {
          add("components", `<input${type ? ` type="${type[1]}"` : ""}>`, "raw <input> - use Input, Checkbox, RadioGroup, Switch or Slider");
        }
      }
    }
  });
}

export const CATEGORIES = ["typography", "colour", "motion", "components", "alignment", "hierarchy", "interactive-div", "copied-chassis", "override-cluster", "global-override"];

/** Scan one file's source. `ctx` = { ts (or null), uiDir }. Exported for the self-tests. */
export function scanFile(rel, src, roles, ctx) {
  const out = [];
  if (rel.endsWith(".css")) scanCss(rel, src, out);
  else if (ctx.ts) scanTs(rel, src, out, roles, ctx);
  else scanTsFallback(rel, src, out, roles, ctx);
  if (/\.(tsx?|jsx?)$/.test(rel) && !rel.startsWith(`${ctx.uiDir}/`)) out.push(...globalOverrides(rel, src));
  return out;
}

// `!` (important) on a size/height/width/padding/radius/outline/ring utility of a system component's own className:
// it wins over every variant, so the component's sizes stop working. Reported as a global-override.
const IMPORTANT_CLASS = /^(?:[a-z-]+:)*(?:!(?:min-h|max-h|h|min-w|max-w|w|size|p[xytblrse]?|rounded(?:-[trbl]{1,2})?|outline|ring|inset-ring)(?:-[\w[\]().\/%-]+)?|(?:min-h|max-h|h|min-w|max-w|w|size|p[xytblrse]?|rounded(?:-[trbl]{1,2})?|outline|ring|inset-ring)(?:-[\w[\]().\/%-]+)?!)$/;
const GLOBAL_WHY = "Don't override system components page-wide - use their variants/sizes";
function globalOverrides(rel, src) {
  const out = [], seen = new Set();
  const clean = stripComments(src);
  const add = (line, found) => { const k = `${line}|${found}`; if (!seen.has(k)) { seen.add(k); out.push({ category: "global-override", file: rel, line, found, why: GLOBAL_WHY }); } };
  const lineAt = (i) => clean.slice(0, i).split("\n").length;
  // class-shaped string literals anywhere (an exported array of class strings, joined and applied later), not only className/cn
  for (const lit of clean.matchAll(/(["'`])((?:\.|(?!\1)[^\n])*)\1/g)) {
    const text = lit[2];
    for (const m of text.matchAll(GLOBAL_OVERRIDE)) add(lineAt(lit.index), m[0]);
    for (const m of text.matchAll(/[^\s"'`]+/g)) if (IMPORTANT_CLASS.test(m[0])) add(lineAt(lit.index), m[0]);
  }
  return out;
}

/** Why each category's finding is wrong is in `why`; this is the one-line remedy. */
const FIX = {
  typography: "use a .type-* role",
  colour: "use a semantic colour token",
  motion: "use the motion tokens (duration-*, ease-*, anim-*)",
  components: "use the design-system component",
  alignment: "left-align reading text; centre only one short line",
  hierarchy: "use the next heading level and style it with a .type-* role",
  "interactive-div": "use the system component",
  "copied-chassis": "compose the system component instead",
  "global-override": "use the component's variants and sizes; never restyle components page-wide or force them with !",
  "override-cluster": "use an existing variant of the component, or ask before adding one (a component-owned value); do not override it by hand",
};


// ── override-cluster ────────────────────────────────────────────────────────
// The same system component given the same size/height/radius/padding utility in three or more places is the agent
// fighting the component: it is missing a variant, or the wrong one is in use. Review severity: a human decides.
export const OVERRIDE_MIN = 3;
// Components whose API is the className: a placeholder or glyph is sized to what it stands for.
const SIZED_BY_DESIGN = new Set(["Skeleton", "Icon"]);
const OVERRIDE_CLASS = /^(?:[a-z-]+:)*(?:min-h|max-h|h|size|rounded(?:-[trbl]{1,2})?|p[xytblrse]?)-(?!full$|auto$|fit$|screen$)[\w[\]().\/%-]+$/;

/** Opening tags `<Name ...>` of the components this file imports from a `/ui/` folder, with their class tokens. */
function uiTags(src, withSized = false) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*\/ui\/[^"']*["']/g)) {
    for (const n of m[1].split(",")) { const id = n.trim().split(/\s+as\s+/).pop(); if (/^[A-Z]/.test(id) && (withSized || !SIZED_BY_DESIGN.has(id))) names.add(id); }
  }
  const out = [];
  if (!names.size) return out;
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)(?![A-Za-z0-9])/g)) {
    if (!names.has(m[1])) continue;
    let i = m.index + m[0].length, depth = 0, quote = "";
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0 && src[i - 1] !== "=") break;
    }
    const tag = src.slice(m.index, i);
    const cls = [...tag.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)].map((x) => x[1] ?? x[2]).join(" ");
    const tokens = [...cls.matchAll(/[A-Za-z][\w:[\]().\/%-]*/g)].map((x) => x[0]).filter((t) => OVERRIDE_CLASS.test(t));
    const important = [...cls.matchAll(/[A-Za-z!][\w:[\]().\/%!-]*/g)].map((x) => x[0]).filter((t) => IMPORTANT_CLASS.test(t));
    out.push({ name: m[1], tokens: [...new Set(tokens)], important: [...new Set(important)], line: src.slice(0, m.index).split(/\r?\n/).length });
  }
  return out;
}

/** files: [{ rel, src }]. Returns Finding[] (severity "review"), one per component + utility used OVERRIDE_MIN+ times. */
export function overrideClusters(files, uiDir = "components/ui") {
  const groups = new Map();
  for (const { rel, src } of files) {
    if (rel.startsWith(uiDir + "/") || !/\.(tsx|jsx)$/.test(rel)) continue;
    for (const t of uiTags(stripComments(src))) {
      for (const tok of t.tokens) {
        const k = `${t.name} ${tok}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(`${rel}:${t.line}`);
      }
    }
  }
  const out = [];
  for (const [k, at] of groups) {
    if (at.length < OVERRIDE_MIN) continue;
    const [name, tok] = k.split(" ");
    const [file, line] = at[0].split(/:(?=\d+$)/);
    out.push({
      check: CHECK, rule: "override-cluster", severity: "review", file, line: +line,
      found: `<${name}> is given \`${tok}\` ${at.length} times (${at.slice(0, 3).join(", ")}${at.length > 3 ? ", ..." : ""})`,
      why: "the same override repeated on a system component means it lacks a variant or the wrong one is used",
      fix: FIX["override-cluster"],
    });
  }
  return out;
}

/** Scan the project described by `config`. Returns Finding[]. `options.note(msg)` receives the fallback note. */
export async function run(config, options = {}) {
  const ts = "typescript" in options ? options.typescript : resolveTypeScript(config.root);
  const ctx = { ts, uiDir: config.uiDir ?? "components/ui" };
  if (!ts) {
    (options.note ?? ((m) => console.log(m)))(
      "NOTE rules: `typescript` is not installed in this project - used the regex fallback (no asChild, inline-style or Lucide-import analysis)",
    );
  }
  ctx.chassis = loadChassis(config, ts);
  const roles = typeRoles(config);
  const out = [];
  const read = [];
  for (const rel of projectFiles(config, { withStyles: false })) {
    const src = readRel(config, rel);
    read.push({ rel, src });
    for (const v of scanFile(rel, src, roles, ctx)) {
      out.push({
        check: CHECK,
        rule: v.category,
        file: v.file,
        line: v.line,
        found: v.found,
        why: v.why.split(" - ")[0],
        fix: v.why.includes(" - ") ? v.why.split(" - ").slice(1).join(" - ") : FIX[v.category],
      });
    }
  }
  out.push(...overrideClusters(read, ctx.uiDir));
  return out;
}
