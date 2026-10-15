// UX, statically: the screen never shows the backend, never speaks system words, never destroys without a way back,
// and uses one label per action. The mechanical half of rules/ux.md rules 4, 6, 8 and 16.
//
// Rules:
//   raw-error                a rendered value reads .message / .stack / .statusText / .code of a caught error or response,
//                            or String(err), JSON.stringify(err), `${err}` (in JSX, a prop, toast(...), alert(...), setError(...))
//   system-words             user-visible text with null, undefined, NaN, payload, endpoint, exception, stack trace, fetch failed,
//                            "timeout of N", ERR_*, an HTTP error status, status code, uuid, json, api, or a raw id
//   unconfirmed-destructive  a destructive button (variant="destructive", or Delete/Remove/Discard/Reset/Revoke) whose handler
//                            neither opens a confirmation, nor sits in an AlertDialog, nor offers undo
//   term-drift               one action under different labels across files (Delete/Remove, Save/Update/Apply, Create/Add, Edit/Modify/Change)
//                            REPORT ONLY: severity "review"; the fix is a human choice of one label
//
// Config: `allowSystemWords` lists words the product really uses (e.g. "API", "JSON"). It is NOT `allowWords`
// (words that keep their capitals). Case-insensitive. Handlers that are not written in the same file are not judged.
// The scanner uses the project's own `typescript`; without it a regex pass runs and a note says so.
import { projectFiles, readRel } from "../lib.mjs";
import { resolveTypeScript } from "./rules.mjs";
import { GAP, scanItems, squash, stringHelpers } from "./content.mjs";

export const CHECK = "ux";
export const RULE_IDS = ["raw-error", "system-words", "unconfirmed-destructive", "term-drift"];

const FIX = {
  "raw-error": "show a human message: what happened in the user's terms + what to do next; log the error, don't render it",
  "system-words": "say it the way the user would: replace the system word with the thing it means to them (list a word the product really uses in allowSystemWords in viewsonic-ui.config.json)",
  "unconfirmed-destructive": "put the action behind an AlertDialog whose confirm button names the consequence, or do it at once and offer Undo in the toast (toast(..., { action }))",
  "term-drift": "pick one label for this action and use it everywhere; this is a review item, nothing is changed for you",
};
const WHY = {
  "raw-error": "renders text the backend or runtime produced",
  "system-words": "user-visible text uses a system word",
  "unconfirmed-destructive": "destructive action runs with no confirmation and no undo",
  "term-drift": "the same action has different labels in different places",
};

/* ───────────────────────── shared ───────────────────────── */

// An error-like name: a caught error, a response. `errors`, `fieldState`, `formState` are form validation (human text the schema wrote).
const ERR_NAME = /^(?:e|err|error|ex|exception|res|resp|response|\w*Error|\w*Err|\w*Exception|\w*Response)$/;
const SURE_ERR = /^(?:e|err|ex|exception)$/;
const FORM_ERR = new Set(["errors", "fieldState", "formState", "fieldError", "fieldErrors", "validationError", "validationErrors", "issues"]);
const LEAK_PROPS = new Set(["message", "stack", "statusText", "code"]);
const TRANSLATE = /^(?:t|\$t|translate|formatMessage|friendly\w*|human\w*|messageFor\w*|errorMessageFor\w*|explain\w*|describeError|toMessage|toUserMessage)$/;
const DISPLAY_CALL = /^(?:toast|notify|notification|alert|showToast|showError|showMessage|showNotification|displayError|enqueueSnackbar|set\w*(?:Error|Err|Message|Msg|Status|Toast|Notice|Feedback)\w*)$/;
const SKIP_ATTR = /^(?:key|ref|className|class|style|id|name|htmlFor|href|src|type|value|defaultValue|disabled|variant|size|asChild|data-.*|on[A-Z].*)$/;

const SYSTEM_WORDS = new RegExp(
  [
    String.raw`\b(?:null|undefined|payload|endpoint|stack ?trace|fetch failed|status code|uuid|json|api)\b`,
    // "exception" is an ordinary noun ("one exception"); only the runtime's phrasing is a system word
    String.raw`\b(?:unhandled|uncaught|runtime|fatal|unexpected)\s+exception\b|\bexception\s+(?:was\s+thrown|occurred)\b|\b[A-Za-z]+Exception\b`,
    String.raw`\btimeout of \d+`,
    // an HTTP error status is a finding only when it is named as one ("500 error", "status 404"), never a bare number
    String.raw`\b(?:http\s*)?[45]\d\d\s+(?:error|not found|internal server error|bad gateway|service unavailable|unauthorized|forbidden|bad request)\b`,
    String.raw`\b(?:error|status|code|http)\s*[:#]?\s*[45]\d\d\b`,
    String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-`,
  ].join("|"),
  "gi",
);
const SYSTEM_CASE = /\bNaN\b|\bERR_[A-Z_]+\b/g; // case-sensitive: "Nan" is a name

// Words that are ordinary elsewhere ("one exception", "Order 450 items", "set a timeout") but are leaks inside an error,
// a toast or an alert: a bare HTTP status, exception, timeout.
const ERROR_ONLY = /(?<![\d,.$#-])[45]\d\d(?![\d,.%])|\bexceptions?\b|\btimeout\b|\btimed out\b/gi;

/**
 * The first system word in `text`, or null. `allow` = lower-case words the product really uses.
 * `inError`: the text is an error, toast or alert string, where a bare status code, exception or timeout is a leak too.
 */
export function systemWordIn(text, allow = [], inError = false) {
  const t = text.split(GAP).join(" ");
  const ok = new Set(allow.map((w) => String(w).toLowerCase()));
  for (const re of inError ? [SYSTEM_WORDS, SYSTEM_CASE, ERROR_ONLY] : [SYSTEM_WORDS, SYSTEM_CASE]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (ok.has(m[0].toLowerCase())) continue;
      // a component or type name in running text (StackTrace, ToolStepCard) is not a sentence word
      const token = /\S*$/.exec(t.slice(0, m.index))[0] + m[0] + /^\S*/.exec(t.slice(m.index + m[0].length))[0];
      if (re !== SYSTEM_CASE && /[a-z][A-Z]/.test(token) && !/Exception$/.test(m[0])) continue;
      return m[0];
    }
  }
  return null;
}

const SKIP_TEXT_TAG = /^(?:code|pre|kbd|samp|var|script|style|textarea|Code\w*|Snippet\w*|Terminal\w*|Highlight\w*|SyntaxHighlighter)$/;

/* ───────────────────────── TypeScript pass ───────────────────────── */

function parse(ts, rel, src) {
  return ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function calleeNames(ts, call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return [e.text];
  if (ts.isPropertyAccessExpression(e)) {
    const names = [e.name.text];
    let r = e.expression;
    while (ts.isPropertyAccessExpression(r)) r = r.expression;
    if (ts.isIdentifier(r)) names.push(r.text);
    return names;
  }
  return [];
}

function chainNames(ts, e) {
  const names = [];
  for (;;) {
    if (ts.isPropertyAccessExpression(e)) { names.push(e.name.text); e = e.expression; }
    else if (ts.isElementAccessExpression(e) || ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    else if (ts.isIdentifier(e)) { names.push(e.text); break; }
    else break;
  }
  return names;
}

/** Names bound by a catch clause or an error callback around `node`. */
function caughtAround(ts, sf, node) {
  const names = new Set();
  const fields = new Set(); // catch ({ message }): the bound pieces of the error
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isCatchClause(n) && n.variableDeclaration) {
      const b = n.variableDeclaration.name;
      if (ts.isIdentifier(b)) names.add(b.text);
      else if (ts.isObjectBindingPattern(b)) for (const el of b.elements) if (ts.isIdentifier(el.name)) fields.add(el.name.text);
    }
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
      const p = n.parent;
      const viaCall = ts.isCallExpression(p) && /(?:^|\.)(?:catch|onError|onerror)$/.test(p.expression.getText(sf));
      const viaProp = ts.isPropertyAssignment(p) && /^(?:onError|onerror|error)$/.test(p.name.getText(sf));
      if (viaCall || viaProp) for (const prm of n.parameters) if (ts.isIdentifier(prm.name)) names.add(prm.name.text);
    }
  }
  return { names, fields };
}

const ITER = new Set(["map", "filter", "forEach", "flatMap", "find", "some", "every", "reduce"]);
/** `name` is the parameter of a .map(...)-style callback around `node`: a record from a list, not a caught error. */
function boundByIteration(ts, node, name) {
  for (let n = node.parent; n; n = n.parent) {
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) {
      const p = n.parent;
      return ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ITER.has(p.expression.name.text);
    }
  }
  return false;
}

// What a parsed server response calls its human-unfriendly text. `json.message` is the server's, not ours.
const RESP_PROPS = new Set(["message", "error", "errorMessage", "detail", "details", "msg", "statusText"]);
const RESP_NAME = /^(?:res|resp|response)\w*$|^\w*Response$/;
const RESP_BODY = /^(?:json|data|body|result|payload)$/;
const FROM_SERVER = /\.json\(\)|\bawait\s+(?:fetch|axios)\b|\bawait\s+\w+\.(?:get|post|put|patch|delete|request)\(/;

/**
 * The leaking sub-expressions of `expr` (a value that ends up on screen).
 * ctx = { strings: names held in useState, tainted: names assigned from a leak, bodies: names holding a parsed server response }
 */
function findLeaks(ts, sf, expr, ctx) {
  const out = [];
  const caught = caughtAround(ts, sf, expr);
  const sureIdent = (x) => ts.isIdentifier(x) && (SURE_ERR.test(x.text) || caught.names.has(x.text)) && !boundByIteration(ts, x, x.text);
  // String(error) / JSON.stringify(error): an `error` that is not a string held in state is an error object
  const objectIdent = (x) => sureIdent(x) || (ts.isIdentifier(x) && x.text === "error" && !ctx.strings.has(x.text));
  /** obj.prop or obj["prop"] */
  const member = (n, obj, prop) => {
    const names = chainNames(ts, obj);
    if (!names.length || names.some((x) => FORM_ERR.has(x))) return false;
    const root = names[names.length - 1];
    if (boundByIteration(ts, n, root)) return false;
    if (LEAK_PROPS.has(prop) && (ERR_NAME.test(names[0]) || ERR_NAME.test(root) || caught.names.has(root))) return true;
    if (RESP_PROPS.has(prop) && (RESP_NAME.test(names[0]) || RESP_NAME.test(root) || (RESP_BODY.test(names[0]) && ctx.bodies.has(names[0])) || (RESP_BODY.test(root) && ctx.bodies.has(root)))) return true;
    return false;
  };
  const visit = (n) => {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    if (ts.isNewExpression(n)) return; // new Error(String(cause)) builds an error; it does not show one
    if (ts.isCallExpression(n)) {
      const names = calleeNames(ts, n);
      if (names.some((x) => TRANSLATE.test(x))) return; // t(error.code): mapped to a written message
      if (names[0] === "String" && n.arguments.length === 1 && objectIdent(n.arguments[0])) out.push(n);
      if (n.expression.getText(sf) === "JSON.stringify" && n.arguments[0] && ts.isIdentifier(n.arguments[0]) && (objectIdent(n.arguments[0]) || RESP_NAME.test(n.arguments[0].text))) out.push(n);
      // e.toString()
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "toString" && objectIdent(n.expression.expression)) { out.push(n); return; }
    }
    if (ts.isTemplateSpan(n) && sureIdent(n.expression)) out.push(n);
    if (ts.isPropertyAccessExpression(n) && member(n, n.expression, n.name.text)) { out.push(n); return; }
    if (ts.isElementAccessExpression(n) && n.argumentExpression && ts.isStringLiteralLike(n.argumentExpression) && member(n, n.expression, n.argumentExpression.text)) { out.push(n); return; }
    // catch ({ message }) { ... message ... } and const m = e.message; ... m ...
    if (ts.isIdentifier(n) && (caught.fields.has(n.text) || ctx.tainted.has(n.text))) {
      const p = n.parent;
      const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || ts.isBindingElement(p) || ts.isVariableDeclaration(p) || ts.isParameter(p);
      if (!isName) out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return out;
}

function rawErrorsTs(ts, rel, src) {
  const sf = parse(ts, rel, src);
  const ctx = { strings: new Set(), tainted: new Set(), bodies: new Set() };
  // pass 1: names held in useState (strings the app wrote); names that hold a parsed server response
  const pre = (n) => {
    if (ts.isVariableDeclaration(n)) {
      if (ts.isArrayBindingPattern(n.name) && n.initializer?.getText(sf).startsWith("useState")) {
        const first = n.name.elements[0];
        if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) ctx.strings.add(first.name.text);
      }
      if (ts.isIdentifier(n.name) && n.initializer && FROM_SERVER.test(n.initializer.getText(sf))) ctx.bodies.add(n.name.text);
    }
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent && ts.isCallExpression(n.parent) && ts.isPropertyAccessExpression(n.parent.expression) && n.parent.expression.name.text === "then" && /\.json\(\)|\bfetch\(|\baxios\b/.test(n.parent.expression.expression.getText(sf))) {
      for (const prm of n.parameters) if (ts.isIdentifier(prm.name)) ctx.bodies.add(prm.name.text);
    }
    ts.forEachChild(n, pre);
  };
  pre(sf);
  // pass 2, one hop: a variable assigned from a leak is itself a leak where it is shown
  const taint = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isIdentifier(n.name) && findLeaks(ts, sf, n.initializer, ctx).length) ctx.tainted.add(n.name.text);
      else if (ts.isObjectBindingPattern(n.name) && ts.isIdentifier(n.initializer) && findLeaks(ts, sf, n.initializer, ctx).length + (SURE_ERR.test(n.initializer.text) || caughtAround(ts, sf, n.initializer).names.has(n.initializer.text) ? 1 : 0)) {
        for (const el of n.name.elements) if (ts.isIdentifier(el.name) && LEAK_PROPS.has((el.propertyName ?? el.name).getText(sf))) ctx.tainted.add(el.name.text);
      }
    }
    ts.forEachChild(n, taint);
  };
  taint(sf);
  const found = new Map();
  const report = (nodes) => {
    for (const n of nodes) {
      const at = n.getStart(sf);
      if (!found.has(at)) found.set(at, { line: sf.getLineAndCharacterOfPosition(at).line + 1, text: squash(n.getText(sf)).slice(0, 70) });
    }
  };
  const visit = (node) => {
    if (ts.isJsxExpression(node) && node.expression) {
      const p = node.parent;
      if (ts.isJsxElement(p) || ts.isJsxFragment(p)) report(findLeaks(ts, sf, node.expression, ctx));
      else if (ts.isJsxAttribute(p) && !SKIP_ATTR.test(p.name.getText(sf))) report(findLeaks(ts, sf, node.expression, ctx));
    }
    if (ts.isCallExpression(node) && calleeNames(ts, node).some((x) => DISPLAY_CALL.test(x))) {
      for (const a of node.arguments) report(findLeaks(ts, sf, a, ctx));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found.values()];
}

function rawErrorsRegex(src) {
  const out = [];
  const lines = src.split("\n");
  const caught = [...src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((m) => m[1]);
  const fields = [...src.matchAll(/\bcatch\s*\(\s*\{([^}]*)\}\s*\)/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(":").pop().trim()).filter(Boolean));
  const names = ["e", "err", "error", "ex", "exception", "res", "response", "\\w+Error", "\\w+Err", ...caught].join("|");
  const fromServer = /\.json\(\)|\bawait\s+(?:fetch|axios)\b/.test(src);
  const parts = [
    `\\b(?:${names})\\??\\.(?:message|stack|statusText|code)\\b`,
    `\\b(?:${names})\\??\\[\\s*["'](?:message|stack|statusText|code)["']\\s*\\]`,
    `\\b(?:${names})\\??\\.toString\\(\\)`,
    "\\bString\\(\\s*(?:e|err|error)\\s*\\)",
    "\\bJSON\\.stringify\\(\\s*(?:e|err|error|res|response)\\b",
    "\\$\\{\\s*(?:e|err)\\s*\\}",
    "\\b(?:res|resp|response)\\w*\\??\\.(?:message|error|detail|details|statusText)\\b",
  ];
  if (fromServer) parts.push("\\b(?:json|data|body|result)\\??\\.(?:message|error|errorMessage|detail|details|msg)\\b");
  if (fields.length) parts.push(`(?<![\\w.])(?:${fields.join("|")})(?![\\w:])`);
  const LEAK = new RegExp(parts.join("|"), "g");
  // one hop: const m = e.message; ... {m}
  const aliases = [];
  lines.forEach((line) => {
    for (const d of line.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*)/g)) if (new RegExp(LEAK.source).test(d[2])) aliases.push(d[1]);
  });
  const ALIAS = aliases.length ? new RegExp(`(?<![\\w.$])(?:${aliases.join("|")})(?![\\w$])`, "g") : null;
  const DISPLAY = /\btoast(?:\.\w+)?\(|\balert\(|\bset\w*(?:Error|Err|Message|Msg|Status)\w*\(|>\s*\{[^}]*$|\b(?:title|description|label|message|placeholder|aria-label|error|text|helperText)=\{[^}]*$|\b(?:description|title|message)\s*:\s*[^,]*$/;
  lines.forEach((line, i) => {
    const hits = [...line.matchAll(LEAK)];
    if (ALIAS) hits.push(...[...line.matchAll(ALIAS)].filter((a) => !/\b(?:const|let|var)\s+$/.test(line.slice(0, a.index))));
    for (const m of hits) {
      const before = line.slice(0, m.index);
      const chain = line.slice(Math.max(0, m.index - 40), m.index + m[0].length);
      if (/\b(?:fieldState|formState|errors)\b/.test(chain)) continue;
      if (/\b(?:t|translate|formatMessage)\(\s*$/.test(before)) continue;
      if (/\bconsole\.|\blogger\.|\bthrow\b|new \w*Error\(|\bif\s*\([^)]*$|[=!]==?\s*$|\?\?\s*$/.test(before)) continue;
      const near = lines.slice(Math.max(0, i - 3), i).join(" ") + " " + before;
      if (DISPLAY.test(before) || (/\btoast(?:\.\w+)?\(/.test(near) && !/\bconsole\./.test(before))) out.push({ line: i + 1, text: m[0] });
    }
  });
  return out;
}

/* system-words: every user-visible string */
const TEXT_ATTRS = new Set(["aria-label", "title", "placeholder", "alt", "label"]);

function visibleTexts(ts, rel, src) {
  // toast(...), Alert*, FieldError and alert(...) / setError(...) strings are the error strings
  const errTag = (tag) => tag === "toast" || tag === "FieldError" || /^Alert(?!Dialog)\w*$/.test(tag);
  const items = scanItems(rel, src, ts).map((i) => ({ text: i.text, line: i.line, err: errTag(i.tag) }));
  if (ts) {
    const sf = parse(ts, rel, src);
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const inCode = (n) => {
      for (let p = n.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && SKIP_TEXT_TAG.test(p.openingElement.tagName.getText(sf))) return true;
      }
      return false;
    };
    const { strOf } = stringHelpers(ts);
    const visit = (node) => {
      if (ts.isCallExpression(node) && calleeNames(ts, node).some((x) => /^(?:alert|showError|displayError|set\w*(?:Error|Err)\w*)$/.test(x))) {
        for (const a of node.arguments) { const v = strOf(a); if (v) items.push({ text: squash(v), line: lineOf(a), err: true }); }
      }
      if (ts.isJsxText(node)) {
        const t = squash(node.text);
        if (/\p{L}/u.test(t) && !inCode(node)) items.push({ text: t, line: lineOf(node) });
      } else if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const v = ts.isStringLiteral(node.initializer) ? node.initializer.text : ts.isJsxExpression(node.initializer) && node.initializer.expression && (ts.isStringLiteral(node.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(node.initializer.expression)) ? node.initializer.expression.text : null;
        if (v && !inCode(node)) items.push({ text: squash(v), line: lineOf(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  } else {
    const lineAt = (i) => src.slice(0, i).split("\n").length;
    const clean = src.replace(/<(code|pre|kbd|samp)\b[\s\S]*?<\/\1>/g, (m) => m.replace(/[^\n]/g, " "));
    for (const m of clean.matchAll(/>([^<>{}]*\p{L}[^<>{}]*)</gu)) items.push({ text: squash(m[1]), line: lineAt(m.index) });
    for (const m of src.matchAll(/(?<![\w-])(aria-label|title|placeholder|alt|label)=(?:"([^"]*)"|'([^']*)')/g)) items.push({ text: m[2] ?? m[3], line: lineAt(m.index) });
  }
  return items;
}

/* unconfirmed-destructive */
const DESTRUCTIVE_VERB = /^(?:delete|remove|discard|reset|revoke)\b/i;
const BUTTONISH = /^(?:Button|button|DropdownMenuItem|ContextMenuItem|MenubarItem|MenuItem)$/;
const CONFIRM_ANCESTOR = /^(?:AlertDialog|Confirm)\w*$/;
const DIALOG_ANCESTOR = /^(?:Dialog|Popover|Sheet|Drawer|Modal)\w*$/;
const OPENS_CONFIRM = /^(?:confirm|setOpen|setShow|setIsOpen|openDialog|openConfirm\w*|showConfirm\w*|set\w*(?:Confirm|Dialog|Modal|Pending|Target|ToDelete|Deleting)\w*|navigate|redirect)$/;
const UNDO_KEYS = new Set(["action", "undo", "onUndo"]);

function destructiveTs(ts, rel, src) {
  const sf = parse(ts, rel, src);
  const out = [];
  const decls = new Map(); // name -> function-like node
  const collect = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) decls.set(n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let init = n.initializer;
      if (ts.isCallExpression(init) && /^(?:useCallback|useEffectEvent)$/.test(init.expression.getText(sf)) && init.arguments[0]) init = init.arguments[0];
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) decls.set(n.name.text, init);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const tagOf = (el) => (el.openingElement ?? el).tagName.getText(sf);
  const attrsOf = (el) => (el.openingElement ?? el).attributes.properties.filter((a) => ts.isJsxAttribute(a));
  const attr = (el, name) => attrsOf(el).find((a) => a.name.getText(sf) === name);
  const attrStr = (a) => (a?.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : null);
  const labelOf = (el) => {
    const aria = attrStr(attr(el, "aria-label"));
    let text = "";
    const walk = (kids) => {
      for (const c of kids) {
        if (ts.isJsxText(c)) text += c.text;
        else if (ts.isJsxExpression(c)) text += c.expression && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression)) ? c.expression.text : GAP;
        else if (ts.isJsxElement(c) && /^[a-z]/.test(tagOf(c))) walk(c.children);
        else if (ts.isJsxFragment(c)) walk(c.children);
      }
    };
    if (ts.isJsxElement(el)) walk(el.children);
    return squash(text) || aria || "";
  };
  const textIn = (n) => n.getText(sf);
  const hasCancelIn = (el) => {
    let hit = false;
    const v = (n) => {
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && n !== el) {
        const t = tagOf(n);
        if (/(?:Cancel|Close)$/.test(t) || (BUTTONISH.test(t) && /^(?:cancel|keep|back|no\b|close)/i.test(labelOf(n)))) hit = true;
      }
      ts.forEachChild(n, v);
    };
    v(el);
    return hit;
  };
  const guarded = (el) => {
    for (let p = el.parent; p; p = p.parent) {
      if (!(ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p))) continue;
      const t = tagOf(p);
      if (CONFIRM_ANCESTOR.test(t)) return true;
      if (DIALOG_ANCESTOR.test(t) && hasCancelIn(p)) return true;
    }
    return false;
  };
  /** true = the handler asks first or offers undo; false = it destroys outright; null = not written in this file. */
  const handlerSafe = (expr, viewReset = false) => {
    let fn = null;
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) fn = expr;
    else if (ts.isIdentifier(expr)) fn = decls.get(expr.text) ?? null;
    if (!fn) return null;
    let safe = false;
    const v = (n) => {
      if (ts.isCallExpression(n)) {
        const names = calleeNames(ts, n);
        if (names.some((x) => OPENS_CONFIRM.test(x) || /undo|restore/i.test(x))) safe = true;
        if (/^(?:push|replace)$/.test(names[0]) && names.includes("router")) safe = true; // leaves for a page that asks
        if (names.includes("toast") || names.includes("showToast")) {
          const hasUndo = (o) => {
            if (!o) return false;
            let h = false;
            const w = (x) => { if (ts.isPropertyAssignment(x) && UNDO_KEYS.has(x.name.getText(sf).replace(/["']/g, ""))) h = true; if (ts.isShorthandPropertyAssignment(x) && UNDO_KEYS.has(x.name.text)) h = true; ts.forEachChild(x, w); };
            w(o);
            return h;
          };
          if (n.arguments.some(hasUndo)) safe = true;
        }
      }
      ts.forEachChild(n, v);
    };
    v(fn.body ?? fn);
    // "Reset" that only sets component state puts a view back as it was; it discards no data
    if (viewReset) {
      let calls = 0, setters = 0;
      const c = (n) => { if (ts.isCallExpression(n)) { calls++; if (ts.isIdentifier(n.expression) && /^set[A-Z]/.test(n.expression.text)) setters++; } ts.forEachChild(n, c); };
      c(fn.body ?? fn);
      if (calls > 0 && calls === setters) safe = true;
    }
    return safe;
  };

  const visit = (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && BUTTONISH.test(tagOf(node))) {
      const handler = attr(node, "onClick") ?? attr(node, "onSelect");
      const label = labelOf(node);
      const variant = attrStr(attr(node, "variant"));
      const destructive = variant === "destructive" || DESTRUCTIVE_VERB.test(label);
      if (destructive && handler?.initializer && ts.isJsxExpression(handler.initializer) && handler.initializer.expression && !guarded(node)) {
        if (handlerSafe(handler.initializer.expression, variant !== "destructive" && /^reset\b/i.test(label)) === false) {
          out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: `<${tagOf(node)}>${label ? ` "${label.slice(0, 40)}"` : ""} runs ${textIn(handler.name)} with no confirmation or undo` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function destructiveRegex(src) {
  const out = [];
  const ATTR = String.raw`(?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*`;
  const TAGS = "Button|button|DropdownMenuItem|ContextMenuItem|MenuItem";
  const pairs = new RegExp(String.raw`<(${TAGS})\b(${ATTR})>([\s\S]*?)<\/\1>`, "g");
  const selfClosing = new RegExp(String.raw`<(${TAGS})\b(${ATTR})\/>`, "g");
  const judge = (m, text) => {
    const aria = /aria-label=["']([^"']*)["']/.exec(m[2])?.[1] ?? "";
    const label = squash(text.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "")) || aria;
    const destructive = /variant=["']destructive["']/.test(m[2]) || DESTRUCTIVE_VERB.test(label);
    const click = /\bon(?:Click|Select)=\{\s*(\(\)\s*=>[\s\S]*)\}\s*$/.exec(m[2]);
    if (!destructive || !click) return;
    const before = src.slice(0, m.index);
    if ((before.match(/<AlertDialog\b/g) ?? []).length - (before.match(/<\/AlertDialog>/g) ?? []).length > 0) return;
    const dialogAt = before.lastIndexOf("<Dialog");
    if (dialogAt > before.lastIndexOf("</Dialog>")) {
      const end = src.indexOf("</Dialog>", dialogAt);
      if (/Cancel|Close|Keep|Back/.test(src.slice(dialogAt, end < 0 ? src.length : end))) return;
    }
    if (/\bconfirm\(|\bset\w*(?:Confirm|Dialog|Open|Modal|Pending|Target)\w*\(|\bopen\w*(?:Dialog|Confirm)|\b(?:router\.push|navigate)\(|\bundo\b|\baction\s*:/i.test(click[1])) return;
    out.push({ line: before.split("\n").length, text: `<${m[1]}>${label ? ` "${label.slice(0, 40)}"` : ""} runs its onClick with no confirmation or undo` });
  };
  for (const m of src.matchAll(pairs)) judge(m, m[3]);
  for (const m of src.matchAll(selfClosing)) judge(m, "");
  return out;
}

/* ───────────────────────── term-drift ───────────────────────── */

const FAMILIES = [
  ["save", "update", "apply"],
  ["delete", "remove"],
  ["create", "add"],
  ["edit", "modify", "change"],
];
const familyOf = (verb) => FAMILIES.findIndex((f) => f.includes(verb));
const STOP = new Set(["the", "a", "an", "your", "this", "my", "new"]);

/** [{ rel, line, label, verb, family, key }] for the action labels of one file. */
export function collectActions(rel, src, opts = {}) {
  const out = [];
  for (const it of scanItems(rel, src, opts.ts ?? null)) {
    if (it.kind !== "action" || it.text.includes(GAP) || /(?:…|\.\.\.)$/.test(it.text)) continue;
    const words = squash(it.text).replace(/[.!?]+$/, "").split(" ").filter(Boolean);
    if (!words.length || words.length > 4) continue;
    const verb = words[0].toLowerCase();
    const family = familyOf(verb);
    if (family < 0) continue;
    const object = words.slice(1).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w)).join(" ").replace(/s$/, "");
    let key = object;
    if (!key && it.handler) {
      const rest = it.handler.replace(/^(?:handle|on|do)/i, "").replace(new RegExp("^(?:" + FAMILIES.flat().join("|") + ")", "i"), "");
      key = rest ? rest.toLowerCase().replace(/s$/, "") : `@${it.handler.toLowerCase()}`;
    }
    if (key) out.push({ rel, line: it.line, label: squash(it.text), verb, family, key });
  }
  return out;
}

/** Pairs of labels for one action, from the actions of every file. */
export function driftFindings(actions) {
  const out = [];
  const groups = new Map();
  for (const a of actions) {
    const k = `${a.family}|${a.key}`;
    if (!groups.has(k)) groups.set(k, new Map());
    const byVerb = groups.get(k);
    byVerb.set(a.verb, [...(byVerb.get(a.verb) ?? []), a]);
  }
  for (const byVerb of groups.values()) {
    if (byVerb.size < 2) continue;
    const verbs = [...byVerb.entries()].sort((x, y) => y[1].length - x[1].length);
    const [main, ...others] = verbs;
    const place = (list) => [...new Set(list.map((a) => `${a.rel}:${a.line}`))].slice(0, 3).join(", ");
    for (const [, list] of others) {
      const a = list[0];
      const found = `"${a.label}" (${place(list)}) vs "${main[1][0].label}" (${place(main[1])})`;
      out.push({ check: CHECK, rule: "term-drift", severity: "review", file: a.rel, line: a.line, found, why: WHY["term-drift"], fix: FIX["term-drift"] });
    }
  }
  return out;
}

/* ───────────────────────── entry ───────────────────────── */

/** Scan one file for raw-error, system-words and unconfirmed-destructive. `opts` = { ts (or null), allowSystemWords }. */
export function scanFile(rel, src, opts = {}) {
  if (!/\.tsx?$/.test(rel)) return [];
  const out = [];
  const seen = new Set();
  const add = (rule, line, found) => {
    const key = `${rule}:${line}:${found}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ check: CHECK, rule, file: rel, line, found, why: WHY[rule], fix: FIX[rule] });
  };
  for (const r of opts.ts ? rawErrorsTs(opts.ts, rel, src) : rawErrorsRegex(src)) add("raw-error", r.line, r.text);
  const allow = opts.allowSystemWords ?? [];
  for (const t of visibleTexts(opts.ts ?? null, rel, src)) {
    const w = systemWordIn(t.text, allow, !!t.err);
    if (w) add("system-words", t.line, `"${t.text.slice(0, 60)}" (${w})`);
  }
  for (const r of opts.ts ? destructiveTs(opts.ts, rel, src) : destructiveRegex(src)) add("unconfirmed-destructive", r.line, r.text);
  return out;
}

/** Scan the project described by `config`. Returns Finding[]. `options.note(msg)` receives the fallback note. */
export async function run(config, options = {}) {
  const ts = "typescript" in options ? options.typescript : resolveTypeScript(config.root);
  if (!ts) {
    (options.note ?? ((m) => console.log(m)))("NOTE ux: `typescript` is not installed in this project - used the regex fallback (error flow and handlers are judged less precisely)");
  }
  const opts = { ts, allowSystemWords: config.allowSystemWords ?? [] };
  const out = [];
  const actions = [];
  for (const rel of projectFiles(config, { withStyles: false })) {
    const src = readRel(config, rel);
    out.push(...scanFile(rel, src, opts));
    if (/\.tsx$/.test(rel)) actions.push(...collectActions(rel, src, opts));
  }
  out.push(...driftFindings(actions));
  return out;
}
