// Content, statically: the words on the screen say what happens, what went wrong and what to do next.
//
// Scans static text and string literals in Button, AlertDialogAction/Cancel, *Title, *Description,
// Empty*, Alert*, FieldError and toast(...) calls. Text that is computed at run time is never judged.
//
// Rules:
//   vague-action          an action label that says nothing (OK, Submit, Yes, No, Click here, Go, Continue alone)
//   vague-error           "Oops", a bare "Something went wrong" or a bare "Error"
//   title-case            3+ words with two or more capitalised after the first (sentence case is the rule)
//   exclamation           "!" in a label, title, description or error
//   confirm-without-verb  an AlertDialogAction whose label is not a verb phrase (Yes, OK, Confirm, Proceed ... or no leading verb)
//   vague-confirm-title   an AlertDialogTitle that names no consequence ("Are you sure?", "Confirm", "Warning")
//
// Pending labels ("Deleting...", "Please wait") are state labels, not actions: never judged as actions.
//
// Config: `properNouns` and `allowWords` are both words that keep their capitals (names, product terms,
// e.g. "GitHub Actions"); they have no other meaning. Both default to [].
// The scanner uses the project's own `typescript`; without it a regex pass runs and a note says so.
import { projectFiles, readRel } from "../lib.mjs";
import { resolveTypeScript } from "./rules.mjs";

export const CHECK = "content";
export const RULE_IDS = ["vague-action", "vague-error", "title-case", "exclamation", "confirm-without-verb", "vague-confirm-title"];

const FIX = {
  "vague-action": 'say what happens: verb + object, e.g. "Save changes"',
  "vague-error": "say what happened in the user's terms and what they can do next",
  "title-case": "use sentence case: capitalise only the first word and proper nouns (list names in properNouns in viewsonic-ui.config.json)",
  exclamation: "remove the exclamation mark and state the fact plainly",
  "confirm-without-verb": "start the button with the verb of the action, e.g. \"Delete files\" or \"Discard changes\"",
  "vague-confirm-title": "name the consequence in the title, e.g. \"Delete 3 files?\"",
};
const WHY = {
  "vague-action": "action label does not say what happens",
  "vague-error": "error gives no reason and no next step",
  "title-case": "label is not in sentence case",
  exclamation: "exclamation mark in interface text",
  "confirm-without-verb": "confirm button is not a verb phrase",
  "vague-confirm-title": "dialog title names no consequence",
};

export const GAP = "{…}"; // a computed part of a label
const VAGUE_ACTION = /^(?:ok|okay|submit|yes|no|click here|go|continue)$/i;
// the whole text, allowing trailing punctuation and a raw expression after it: "Error: {…}"
const VAGUE_ERROR = /^(?:oops|something went wrong|error)[.!:,\s]*(?:\{…\})?$/i;
const VAGUE_CONFIRM = /^(?:yes|no|ok|okay|confirm|sure|proceed|continue|submit)$/i;
const VAGUE_CONFIRM_TITLE = /^(?:are you sure|really|confirm|confirmation|please confirm|warning|alert|attention|caution)\s*[?.!:]*$/i;
const NONVERB_START = new Set(["the", "a", "an", "my", "your", "our", "this", "that", "these", "those", "all", "any", "some", "to", "for", "of", "in", "on", "at", "by", "with", "and", "or", "but", "not", "is", "are", "am", "be", "it", "i", "we", "you", "please", "yes", "no", "ok", "okay", "sure"]);
/** A state label ("Deleting...", "Please wait"), not an action. */
export const isPending = (t) => /(?:…|\.\.\.)$/.test(t) || /^[A-Za-z]{4,}ing\b/.test(t) || /^please wait/i.test(t);

const ACTION_TAG = /^(?:Button|AlertDialogAction|AlertDialogCancel)$/;
const TITLE_TAG = /^(?:Alert|AlertDialog|Dialog|Sheet|Drawer|Empty)Title$/;
const DESC_TAG = /^(?:Alert|AlertDialog|Dialog|Sheet|Drawer|Empty)Description$|^FieldError$/;
const LABEL_ATTR = new Set(["aria-label", "label", "title"]);

const kindOf = (tag) => (ACTION_TAG.test(tag) ? "action" : TITLE_TAG.test(tag) ? "title" : DESC_TAG.test(tag) ? "description" : null);
export const squash = (s) => s.replace(/\s+/g, " ").trim();
const bare = (s) => s.split(GAP).join("").trim();
const edge = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// ── judging one item ────────────────────────────────────────────────────────
// item = { kind: "action"|"title"|"description"|"label", tag, text, line, confirm?: boolean, described?: boolean }
function titleCaseHit(text, skip) {
  let t = text.split(GAP).join(" ");
  for (const p of [...skip].sort((a, b) => b.length - a.length)) if (p) t = t.split(p).join(" ");
  const raw = t.split(/\s+/).filter(Boolean);
  if (raw.length < 3) return false;
  let caps = 0;
  raw.forEach((w, i) => {
    if (i === 0) return;
    if (/[.?!:]$/.test(raw[i - 1])) return; // a new sentence starts with a capital
    const core = w.replace(edge, "");
    if (/^[A-Z][a-z]/.test(core) && core !== "I") caps++;
  });
  return caps >= 2;
}
export function judge(rel, item, opts = {}) {
  const skip = [...(opts.properNouns ?? []), ...(opts.allowWords ?? [])];
  const text = squash(item.text);
  const out = [];
  const add = (rule) => out.push({ check: CHECK, rule, file: rel, line: item.line, found: text, why: WHY[rule], fix: FIX[rule] });
  if (!bare(text)) return out;
  const pending = isPending(text);
  if ((item.kind === "action" || item.kind === "label") && !pending && !text.includes(GAP) && VAGUE_ACTION.test(text.replace(/[.!]+$/, ""))) add("vague-action");
  // A heading is not the whole error: "Something went wrong" over a written description is judged by that description.
  const headingOverText = item.kind === "title" && item.described;
  if ((VAGUE_ERROR.test(text) && !headingOverText) || /\boops\b/i.test(text)) add("vague-error");
  if (item.kind !== "description" && titleCaseHit(text, skip)) add("title-case");
  if (text.includes("!")) add("exclamation");
  if (item.confirm && !pending && !text.startsWith("{")) {
    const first = text.split(/\s+/)[0].replace(edge, "").toLowerCase();
    if (VAGUE_CONFIRM.test(text.replace(/[.!]+$/, "")) || NONVERB_START.has(first) || /^\d/.test(first)) add("confirm-without-verb");
  }
  if (item.tag === "AlertDialogTitle" && VAGUE_CONFIRM_TITLE.test(text)) add("vague-confirm-title");
  return out;
}

/** The two string readers every scanner needs, bound to the project's `typescript`. Exported so the UX check reuses them. */
export function stringHelpers(ts) {
  const strOf = (e) => {
    if (!e) return null;
    if (ts.isParenthesizedExpression(e)) return strOf(e.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map((s) => GAP + s.literal.text).join("");
    return null;
  };
  // every string literal a conditional / && / || can produce
  const leaves = (e, out = []) => {
    if (!e) return out;
    if (ts.isParenthesizedExpression(e)) return leaves(e.expression, out);
    if (ts.isConditionalExpression(e)) { leaves(e.whenTrue, out); leaves(e.whenFalse, out); return out; }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return leaves(e.right, out);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) { leaves(e.left, out); return leaves(e.right, out); }
    }
    const s = strOf(e);
    if (s !== null) out.push(s);
    return out;
  };
  return { strOf, leaves };
}

// ── TypeScript pass ─────────────────────────────────────────────────────────
function scanTs(ts, rel, src) {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const items = [];
  const seen = new Set();
  const push = (node, kind, tag, text, confirm = null, described = false) => {
    const key = `${node.getStart(sf)}:${kind}:${text}`;
    if (seen.has(key) || !bare(squash(text))) return;
    seen.add(key);
    items.push({ kind, tag, text, line: lineOf(node), confirm, described, handler: handlerOf(node) });
  };
  // the function an element runs on click/submit/select: onClick={handleSave} or onClick={() => handleSave(x)}
  const handlerOf = (node) => {
    let n = node;
    while (n && !ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) n = ts.isJsxElement(n) ? n.openingElement : n.parent;
    if (!n) return null;
    for (const a of n.attributes.properties) {
      if (!ts.isJsxAttribute(a) || !/^on(?:Click|Submit|Select)$/.test(a.name.getText(sf)) || !a.initializer?.expression) continue;
      let e = a.initializer.expression;
      if (ts.isIdentifier(e)) return e.text;
      if ((ts.isArrowFunction(e) || ts.isFunctionExpression(e)) && ts.isCallExpression(e.body) && ts.isIdentifier(e.body.expression)) return e.body.expression.text;
    }
    return null;
  };

  const { strOf, leaves } = stringHelpers(ts);

  const tagOf = (n) => (n.openingElement ?? n).tagName.getText(sf);
  const hasAsChild = (n) => (n.openingElement ?? n).attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "asChild");
  // The text of an element: [main label, ...alternatives from conditionals].
  // Plain tags (span, strong) are read through; under asChild the wrapped component (Link, Button) is too.
  const labelsOf = (el) => {
    const extras = [];
    let main = "";
    const walk = (kids, deep) => {
      for (const c of kids) {
        if (ts.isJsxText(c)) main += c.text;
        else if (ts.isJsxExpression(c)) {
          if (!c.expression) continue;
          const s = strOf(c.expression);
          if (s !== null) main += s;
          else {
            const ls = leaves(c.expression);
            if (ls.length) extras.push(...ls);
            main += GAP;
          }
        } else if (ts.isJsxElement(c)) {
          if (deep || /^[a-z]/.test(tagOf(c))) walk(c.children, deep || hasAsChild(c));
        } else if (ts.isJsxFragment(c)) walk(c.children, deep);
      }
    };
    walk(el.children ?? [], hasAsChild(el));
    return [main, ...extras].map(squash);
  };

  // a sibling *Description whose text is written out (not computed)
  const hasWrittenDescription = (el) =>
    (el.parent?.children ?? []).some((c) => ts.isJsxElement(c) && c !== el && DESC_TAG.test(tagOf(c)) && labelsOf(c).some((t) => bare(t).length > 0));

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = node.openingElement ?? node;
      const tag = tagOf(node);
      const kind = kindOf(tag);
      // the child of a scanned asChild parent is read as part of the parent
      const parent = ts.isJsxElement(node.parent) ? node.parent : null;
      const underAsChild = parent && kindOf(tagOf(parent)) && hasAsChild(parent);
      if (kind && !underAsChild) {
        for (const a of opening.attributes.properties) {
          if (!ts.isJsxAttribute(a) || !LABEL_ATTR.has(a.name.getText(sf)) || !a.initializer) continue;
          const v = ts.isJsxExpression(a.initializer) ? a.initializer.expression : a.initializer;
          const s = strOf(v);
          if (s !== null) push(a, kind === "action" ? "action" : "label", tag, s);
        }
        if (ts.isJsxElement(node)) {
          const confirm = tag === "AlertDialogAction";
          const described = kind === "title" && hasWrittenDescription(node);
          for (const t of labelsOf(node)) push(node, kind, tag, t, confirm, described);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : null;
      if (name === "toast") {
        const propName = (p) => p.name.getText(sf).replace(/["']/g, "");
        const fromObject = (o, map) => {
          for (const p of o.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const key = propName(p);
            if (map[key]) for (const s of leaves(p.initializer)) push(p, map[key], "toast", s);
            if (key === "action" && ts.isObjectLiteralExpression(p.initializer)) {
              for (const q of p.initializer.properties) {
                if (ts.isPropertyAssignment(q) && propName(q) === "label") for (const s of leaves(q.initializer)) push(q, "action", "toast", s);
              }
            }
          }
        };
        const a0 = node.arguments[0];
        const a1 = node.arguments[1];
        const first = strOf(a0);
        if (first !== null) push(a0, "title", "toast", first);
        if (a0 && ts.isObjectLiteralExpression(a0)) fromObject(a0, { title: "title", description: "description" });
        if (a1 && ts.isObjectLiteralExpression(a1)) {
          const isPromise = ts.isPropertyAccessExpression(callee) && callee.name.text === "promise";
          fromObject(a1, isPromise ? { loading: "title", success: "title", error: "title", description: "description" } : { description: "description" });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return items;
}

// ── regex fallback ──────────────────────────────────────────────────────────
function scanRegex(rel, src) {
  const items = [];
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  const quoted = (s) => [...s.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  const ATTR = String.raw`(?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*`;
  const re = new RegExp(String.raw`<(Button|AlertDialogAction|AlertDialogCancel|(?:Alert|AlertDialog|Dialog|Sheet|Drawer|Empty)(?:Title|Description)|FieldError)\b(${ATTR})>([\s\S]*?)<\/\1>`, "g");
  // text of a child list: [main, ...alternatives]
  const textOf = (body) => {
    let main = "";
    const extras = [];
    for (const piece of body.split(/(\{(?:[^{}]|\{[^{}]*\})*\})/)) {
      if (piece.startsWith("{")) {
        const inner = piece.slice(1, -1).trim();
        if (!inner || /^\/\*[\s\S]*\*\/$/.test(inner)) continue;
        if (/^(["'`])(?:\\.|(?!\1).)*\1$/.test(inner)) main += quoted(inner)[0];
        else { extras.push(...quoted(inner)); main += GAP; }
      } else main += piece.replace(/<[^>]*>/g, "");
    }
    return [main, ...extras].map(squash);
  };
  const found = [...src.matchAll(re)];
  // [start, end) of every scanned asChild element: what is inside it is read as part of it
  const asChildRanges = found.filter((m) => /\basChild\b/.test(m[2])).map((m) => [m.index, m.index + m[0].length]);
  const inside = (i) => asChildRanges.some(([a, b]) => i > a && i < b);
  const owned = found.filter((m) => !inside(m.index));
  for (const m of owned) {
    const tag = m[1];
    const kind = kindOf(tag);
    const line = lineAt(m.index);
    const confirm = tag === "AlertDialogAction";
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 300);
    const described = kind === "title" && /^\s*<(?:Alert|AlertDialog|Dialog|Sheet|Drawer|Empty)Description\b[^>]*>\s*[^<{\s]/.test(after);
    const handler = /\bon(?:Click|Submit|Select)=\{\s*(?:\(\)\s*=>\s*)?([A-Za-z_$][\w$]*)\s*(?:\(|\})/.exec(m[2])?.[1] ?? null;
    for (const t of textOf(m[3])) if (bare(t)) items.push({ kind, tag, text: t, line, confirm, described, handler });
  }
  // label / aria-label / title props on every opening tag, self-closing or not
  const open = new RegExp(String.raw`<(Button|AlertDialogAction|AlertDialogCancel|(?:Alert|AlertDialog|Dialog|Sheet|Drawer|Empty)(?:Title|Description)|FieldError)\b(${ATTR})\/?>`, "g");
  for (const m of src.matchAll(open)) {
    if (inside(m.index)) continue;
    const kind = kindOf(m[1]);
    const line = lineAt(m.index);
    for (const a of m[2].matchAll(/(?<![\w-])(aria-label|label|title)=(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])((?:\\.|(?!\4).)*)\4\s*\})/g)) {
      items.push({ kind: kind === "action" ? "action" : "label", tag: m[1], text: a[2] ?? a[3] ?? a[5], line, confirm: false });
    }
  }
  // toast("…"), toast({ title, description }), toast.promise(p, { loading, success, error })
  const parenBody = (i) => {
    let depth = 0;
    for (let k = i; k < src.length; k++) {
      if (src[k] === "(") depth++;
      else if (src[k] === ")" && --depth === 0) return src.slice(i + 1, k);
    }
    return src.slice(i + 1);
  };
  for (const m of src.matchAll(/\btoast(\.\w+)?\(/g)) {
    const line = lineAt(m.index);
    const body = parenBody(m.index + m[0].length - 1);
    const lead = /^\s*(["'`])((?:\\.|(?!\1).)*)\1/.exec(body);
    if (lead) items.push({ kind: "title", tag: "toast", text: lead[2], line, confirm: false });
    const keys = m[1] === ".promise" ? "title|description|loading|success|error|label" : "title|description|label";
    for (const k of body.matchAll(new RegExp("(?<!["+"\\w-])(" + keys + ")\\s*:\\s*([\"'`])((?:\\\\.|(?!\\2).)*)\\2", "g"))) {
      const kind = k[1] === "label" ? "action" : k[1] === "description" ? "description" : "title";
      items.push({ kind, tag: "toast", text: k[3], line, confirm: false });
    }
  }
  return items;
}

/** Every judged piece of text in a file, before any rule is applied: { kind, tag, text, line, handler }. Exported for the UX check. */
export function scanItems(rel, src, ts) {
  if (!/\.tsx?$/.test(rel)) return [];
  return ts ? scanTs(ts, rel, src) : scanRegex(rel, src);
}

/** Scan one file's source. `opts` = { ts (or null), properNouns, allowWords }. Exported for the self-tests. */
export function scanFile(rel, src, opts = {}) {
  if (!/\.tsx?$/.test(rel)) return [];
  const items = opts.ts ? scanTs(opts.ts, rel, src) : scanRegex(rel, src);
  const out = [];
  const seen = new Set();
  for (const item of items) {
    for (const f of judge(rel, item, opts)) {
      const key = `${f.rule}:${f.line}:${f.found}`;
      if (!seen.has(key)) { seen.add(key); out.push(f); }
    }
  }
  return out;
}

/** Scan the project described by `config`. Returns Finding[]. `options.note(msg)` receives the fallback note. */
export async function run(config, options = {}) {
  const ts = "typescript" in options ? options.typescript : resolveTypeScript(config.root);
  if (!ts) {
    (options.note ?? ((m) => console.log(m)))("NOTE content: `typescript` is not installed in this project - used the regex fallback (labels with nested tags or computed parts are judged less precisely)");
  }
  const opts = { ts, properNouns: config.properNouns ?? [], allowWords: config.allowWords ?? [] };
  const out = [];
  for (const rel of projectFiles(config, { withStyles: false })) {
    out.push(...scanFile(rel, readRel(config, rel), opts));
  }
  return out;
}
