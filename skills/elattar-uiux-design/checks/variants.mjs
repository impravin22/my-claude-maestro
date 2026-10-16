// The design language's vocabulary, read from the project: every `cva(...)` in the ui folder gives a component, its
// variant props and the values each allows. Used by the ESLint plugin (eslint/viewsonic-variants.mjs). Node built-ins only.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { boundaryOf, isInside, readSmallFile, walkFiles } from "./maestro-guards.mjs";

/** `buttonStyles`, `badgeVariants`, `navigationMenuTriggerStyle` -> `Button`, `Badge`, `NavigationMenuTrigger`. */
export function componentNameFor(varName) {
  const stem = String(varName).replace(/(?:Variants|Styles|Style)$/, "");
  return stem ? stem[0].toUpperCase() + stem.slice(1) : "";
}

/** Index just past the `)` that closes the call whose `(` is at `open`. Strings and template literals are skipped. */
function closeParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2);
      if (i < 0) return src.length;
      i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return src.length;
}

/** { prop: [keys] } for the object literal whose `{` is at `open`: keys of keys, e.g. variants: { size: { xs: "..", sm: ".." } }. */
function readTwoLevels(body, open) {
  const props = {};
  let depth = 0;
  let expectKey = false;
  let prop = null;
  for (let i = open; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let j = i + 1;
      for (; j < body.length && body[j] !== q; j++) if (body[j] === "\\") j++;
      if (expectKey && (depth === 1 || depth === 2) && q !== "`") {
        const text = body.slice(i + 1, j);
        if (/^\s*:/.test(body.slice(j + 1))) {
          if (depth === 1) { prop = text; props[prop] ??= []; } else if (prop) props[prop].push(text);
          expectKey = false;
        }
      }
      i = j;
    } else if (c === "/" && body[i + 1] === "/") {
      while (i < body.length && body[i] !== "\n") i++;
    } else if (c === "/" && body[i + 1] === "*") {
      i = body.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else if (c === "{" || c === "(" || c === "[") {
      depth++;
      expectKey = c === "{" && depth <= 2;
    } else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) break;
      expectKey = false;
    } else if (c === ",") {
      expectKey = depth === 1 || depth === 2;
    } else if (expectKey && (depth === 1 || depth === 2) && /[A-Za-z_$]/.test(c)) {
      const m = /^[\w$-]*/.exec(body.slice(i))[0];
      if (/^\s*:/.test(body.slice(i + m.length))) {
        if (depth === 1) { prop = m; props[prop] ??= []; } else if (prop) props[prop].push(m);
        expectKey = false;
      }
      i += m.length - 1;
    } else if (expectKey && depth === 2 && /\d/.test(c)) {
      const m = /^\d+/.exec(body.slice(i))[0];
      if (prop) props[prop].push(m);
      expectKey = false;
      i += m.length - 1;
    }
  }
  return props;
}

/** Every cva() in a source file: [{ component, props: { prop: [values] } }]. Calls without a `variants` object are skipped. */
export function variantsFromSource(src) {
  const out = [];
  for (const m of src.matchAll(/(?:(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*)?\bcva\s*\(/g)) {
    if (!m[1]) continue;
    const open = m.index + m[0].length - 1;
    const body = src.slice(open, closeParen(src, open));
    const v = /(?<![\w$])variants\s*:\s*\{/.exec(body);
    if (!v) continue;
    const props = readTwoLevels(body, v.index + v[0].length - 1);
    for (const k of Object.keys(props)) if (!props[k].length) delete props[k];
    if (Object.keys(props).length) out.push({ component: componentNameFor(m[1]), props });
  }
  return out;
}

// maestro patch (not upstream): the walk skips links and is capped (see maestro-guards.mjs walkFiles),
// because a repository's `uiDir` decides where it starts and the after-edit hook runs it on every edit.
const walkUi = (dir) => walkFiles(dir, /\.tsx?$/);

/** Map component -> Map prop -> string[] for every cva in `<root>/<uiDir>`. Read from disk each call; callers cache. */
export function loadVariants(root, uiDir = "components/ui") {
  const table = new Map();
  for (const file of walkUi(join(root, uiDir))) {
    const src = readSmallFile(file);
    if (!src?.includes("cva(")) continue;
    for (const { component, props } of variantsFromSource(src)) {
      const entry = table.get(component) ?? new Map();
      for (const [prop, values] of Object.entries(props)) entry.set(prop, [...new Set([...(entry.get(prop) ?? []), ...values])]);
      table.set(component, entry);
    }
  }
  return table;
}

/** Does an import specifier point into the ui folder (`@/components/ui/button`, `../ui/badge`)? */
export function isUiImport(spec, uiDir = "components/ui") {
  const tail = String(uiDir).replace(/^src\//, "").replace(/^\.?\//, "");
  const s = String(spec);
  return s.includes(`/${tail}/`) || s.endsWith(`/${tail}`) || (tail.endsWith("/ui") && /(^|\/)ui\//.test(s));
}

/** null when `value` is allowed (or the component or prop is not a cva variant), else the message for the finding. */
export function invalidVariantMessage(table, component, prop, value) {
  const props = table.get(component);
  const allowed = props?.get(prop);
  if (!allowed || allowed.includes(value)) return null;
  return `${component} has no ${prop} "${value}". Use one of: ${allowed.join(", ")}.`;
}

/** ui folder of the project at `root`, without the async config: components.json alias, else components/ui. */
export function uiDirFor(root) {
  // maestro patch (not upstream): both files come from the repository, so a value that leads outside
  // it (`../outside`, an absolute path, a link out) is ignored, and neither file is read unless it is a
  // small regular file (a FIFO would hang the hook).
  const boundary = boundaryOf(root);
  const contained = (p) => isInside(boundary, join(root, p));
  let uiDir = "components/ui";
  try {
    const alias = JSON.parse(readSmallFile(join(root, "components.json"))).aliases?.ui;
    if (typeof alias === "string") {
      const bare = alias.replace(/^[@~]\//, "").replace(/^\.?\//, "");
      for (const cand of [bare, `src/${bare}`]) if (contained(cand) && existsSync(join(root, cand))) { uiDir = cand; break; }
    }
  } catch { /* default */ }
  try {
    const over = JSON.parse(readSmallFile(join(root, "viewsonic-ui.config.json"))).uiDir;
    if (typeof over === "string" && contained(over)) uiDir = over;
  } catch { /* none */ }
  return uiDir;
}
