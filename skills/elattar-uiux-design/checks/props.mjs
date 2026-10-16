// What a ui component accepts, and the judge that compares a JSX usage with it. Shared by the ESLint rule
// (eslint/viewsonic-variants.mjs) and the after-edit hook (eslint/on-edit.mjs): one core, two front ends.
//
//   1. cva-backed props (variant, size, ...): the value must be one of the cva keys. Read from source, no TypeScript.
//   2. prop names: a prop the component's props type does not declare is reported with a nearest-name suggestion.
//   3. literal-union props (side: "top" | "bottom"): the value must be in the union.
//   4. TypeScript's own diagnostics on ui-component JSX (missing required props, wrong types): hook only.
// 2 to 4 need the project's `typescript`; without it only 1 runs. The type table is built once per change of the ui
// folder and cached in the user's own cache folder (maestro patch: not the shared OS temp folder), so the per-edit
// cost is a parse of one file.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, replaceFile, walkFiles } from "./maestro-guards.mjs";
import { invalidVariantMessage, isUiImport, loadVariants, uiDirFor } from "./variants.mjs";

/** The project's TypeScript compiler API, or null. */
export function resolveTs(root) {
  try { return createRequire(join(root, "package.json"))("typescript"); } catch { return null; }
}

const ALWAYS_OK = new Set(["key", "ref", "children", "className", "style"]);

/* ───────────────────────── the type table ───────────────────────── */

// maestro patch (not upstream): no links, capped (see maestro-guards.mjs walkFiles).
const uiFiles = (dir) => walkFiles(dir, /\.tsx$/);

function compilerOptions(ts, root) {
  const cfgPath = join(root, "tsconfig.json");
  let options = {};
  if (existsSync(cfgPath)) {
    const read = ts.readConfigFile(cfgPath, ts.sys.readFile);
    if (!read.error) options = ts.parseJsonConfigFileContent(read.config, ts.sys, root).options;
  }
  return { ...options, types: [], noResolve: false, noEmit: true, skipLibCheck: true, incremental: false, composite: false, tsBuildInfoFile: undefined, jsx: options.jsx ?? ts.JsxEmit.Preserve };
}

/** { Component: { open, names:[...], values:{prop:[...]}, required:[...] } } from the ui folder's exported components. */
export function buildPropTable(ts, root, uiDir) {
  const files = uiFiles(join(root, uiDir));
  const table = {};
  if (!files.length) return table;
  const program = ts.createProgram(files, compilerOptions(ts, root));
  const checker = program.getTypeChecker();
  for (const file of files) {
    const sf = program.getSourceFile(file);
    const mod = sf && checker.getSymbolAtLocation(sf);
    if (!mod) continue;
    for (let ex of checker.getExportsOfModule(mod)) {
      if (!/^[A-Z]/.test(ex.name) || table[ex.name]) continue;
      if (ex.flags & ts.SymbolFlags.Alias) ex = checker.getAliasedSymbol(ex);
      const type = checker.getTypeOfSymbolAtLocation(ex, sf);
      const sig = type.getCallSignatures()[0];
      if (!sig) continue;
      const p0 = sig.getParameters()[0];
      const entry = { open: false, names: [], values: {}, required: [] };
      table[ex.name] = entry;
      if (!p0) continue;
      const pt = checker.getTypeOfSymbolAtLocation(p0, sf);
      if ((pt.flags & ts.TypeFlags.Any) || pt.isUnion() || checker.getIndexInfosOfType(pt).length) { entry.open = true; continue; }
      for (const prop of pt.getProperties()) {
        entry.names.push(prop.name);
        if (!(prop.flags & ts.SymbolFlags.Optional)) entry.required.push(prop.name);
        const t = checker.getTypeOfSymbolAtLocation(prop, sf);
        const parts = (t.isUnion() ? t.types : [t]).filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
        if (parts.length && parts.every((x) => x.flags & ts.TypeFlags.StringLiteral)) entry.values[prop.name] = parts.map((x) => x.value);
      }
    }
  }
  return table;
}

function stampFor(ts, root, uiDir) {
  const h = createHash("sha1");
  h.update(`${ts.version}|${root}|${uiDir}`);
  for (const f of [...uiFiles(join(root, uiDir)), join(root, "tsconfig.json"), join(root, "package.json")]) {
    try { const s = statSync(f); h.update(`${f}:${s.mtimeMs}:${s.size}`); } catch { /* absent */ }
  }
  return h.digest("hex");
}

/** The cached type table for the project, built on first use after the ui folder changes. null without TypeScript. */
export function loadPropTable(root, uiDir = uiDirFor(root), ts = resolveTs(root)) {
  if (!ts) return null;
  const stamp = stampFor(ts, root, uiDir);
  // maestro patch (not upstream): a predictable name in a shared temp folder could be a link another
  // local user planted, so the cache lives in a folder only this user can write, and is replaced by
  // rename rather than written through whatever is at its name.
  const dir = cacheDir();
  const cache = dir && join(dir, `viewsonic-props-${createHash("sha1").update(root).digest("hex").slice(0, 12)}.json`);
  if (cache) {
    try {
      const hit = JSON.parse(readFileSync(cache, "utf8"));
      if (hit.stamp === stamp) return hit.table;
    } catch { /* cold */ }
  }
  const table = buildPropTable(ts, root, uiDir);
  if (cache) { try { replaceFile(cache, JSON.stringify({ stamp, table }), 0o600); } catch { /* read-only cache: just slower */ } }
  return table;
}

/* ───────────────────────── judging ───────────────────────── */

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

export function nearest(name, candidates) {
  let best = null;
  let bestD = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const c of candidates) {
    const d = distance(name.toLowerCase(), c.toLowerCase());
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/**
 * One JSX usage -> messages. usage = { component, prop, values: string[] | null }, values being the literal strings the
 * attribute can take (null: not a literal, or no value). tables = { cva: Map, types: object | null }.
 */
export function judgeUsage({ cva, types }, usage) {
  const { component, prop, values } = usage;
  const out = [];
  const entry = types?.[component];
  if (entry && !entry.open && !ALWAYS_OK.has(prop) && !/^(?:data|aria)-/.test(prop) && !entry.names.includes(prop)) {
    const guess = nearest(prop, entry.names);
    out.push(`${component} has no prop "${prop}".${guess ? ` Did you mean "${guess}"?` : ""}`);
    return out;
  }
  for (const v of values ?? []) {
    const viaCva = invalidVariantMessage(cva, component, prop, v);
    if (viaCva) { out.push(viaCva); continue; }
    const union = entry?.values[prop];
    if (union && !cva.get(component)?.has(prop) && !union.includes(v)) out.push(`${component} has no ${prop} "${v}". Use one of: ${union.join(", ")}.`);
  }
  return out;
}

export function loadTables(root, { types = true } = {}) {
  const uiDir = uiDirFor(root);
  return { uiDir, cva: loadVariants(root, uiDir), types: types ? loadPropTable(root, uiDir) : null };
}

/* ───────────────────────── TypeScript front end (the hook) ───────────────────────── */

function literalStrings(ts, node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || (ts.isTypeAssertionExpression?.(node))) return literalStrings(ts, node.expression);
  if (ts.isConditionalExpression(node)) return [...(literalStrings(ts, node.whenTrue) ?? []), ...(literalStrings(ts, node.whenFalse) ?? [])];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...(literalStrings(ts, node.left) ?? []), ...(literalStrings(ts, node.right) ?? [])];
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return literalStrings(ts, node.right);
  }
  return null;
}

/** Every attribute of every ui component in a source: [{ component, prop, values, line, tagStart, tagEnd }]. */
export function usagesFromSource(ts, rel, src, uiDir) {
  const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.jsx$/.test(rel) ? ts.ScriptKind.JSX : /\.ts$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
  const local = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !isUiImport(st.moduleSpecifier.text, uiDir)) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) local.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  const out = [];
  const spans = [];
  if (!local.size) return { usages: out, sf, spans };
  const visit = (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && local.has(node.tagName.text)) {
      spans.push({ tagStart: node.getStart(sf), tagEnd: node.getEnd() });
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a) || !ts.isIdentifier(a.name)) continue;
        const init = a.initializer;
        const values = !init ? null : ts.isStringLiteral(init) ? [init.text] : ts.isJsxExpression(init) ? literalStrings(ts, init.expression) : null;
        out.push({ component: local.get(node.tagName.text), prop: a.name.text, values, line: sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1, tagStart: node.getStart(sf), tagEnd: node.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { usages: out, sf, spans };
}

/** Messages for one file: [{ line, message }]. Rules 1 to 3 from the tables. */
export function checkSource(ts, rel, src, tables) {
  const { usages } = usagesFromSource(ts, rel, src, tables.uiDir);
  const found = [];
  for (const u of usages) for (const message of judgeUsage(tables, u)) found.push({ line: u.line, message });
  return found;
}

/** Rule 4: TypeScript's semantic errors that sit inside the JSX of a ui component. [{ line, message }]. */
export function diagnosticsFor(ts, root, abs, src, uiDir) {
  const { spans, sf } = usagesFromSource(ts, abs, src, uiDir);
  if (!spans.length) return [];
  const program = ts.createProgram([abs], compilerOptions(ts, root));
  const file = program.getSourceFile(abs);
  const out = [];
  for (const d of program.getSemanticDiagnostics(file)) {
    if (d.start == null || !spans.some((s) => d.start >= s.tagStart && d.start < s.tagEnd)) continue;
    out.push({ line: sf.getLineAndCharacterOfPosition(d.start).line + 1, message: ts.flattenDiagnosticMessageText(d.messageText, " ").replace(/\s+/g, " ") });
  }
  return out;
}
