// Discovers the project the checks run against. Node built-ins only.
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { baseUrlProblem, boundaryOf, isInside, readSmallFile, routeProblem } from "./maestro-guards.mjs";

const posix = (p) => p.split("\\").join("/");

function findRoot(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(cwd);
    dir = up;
  }
}

// maestro patch (not upstream): only a small regular file is read, so a FIFO or a link to a device cannot hang the run.
const readJson = (p) => {
  const text = readSmallFile(p);
  if (text === null) throw new Error(`${JSON.stringify(p)} is not a regular file of at most 1 MiB`);
  return JSON.parse(text);
};
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/** "@/components/ui" -> "components/ui" (or "src/components/ui"), only if it exists inside `boundary` (maestro patch). */
function aliasDir(root, alias, boundary = root) {
  if (typeof alias !== "string") return null;
  const bare = alias.replace(/^[@~]\//, "").replace(/^\.?\//, "");
  for (const cand of [bare, `src/${bare}`]) if (isInside(boundary, join(root, cand)) && isDir(join(root, cand))) return cand;
  return null;
}

/** The entry stylesheet plus every relative @import, depth-first in import order. */
function collectStyles(root, entry, boundary = root) {
  const out = [];
  const seen = new Set();
  const visit = (rel) => {
    rel = posix(rel);
    if (seen.has(rel)) return;
    const abs = join(root, rel);
    // maestro patch (not upstream): an @import (or the entry) that leads outside the repository is not read.
    if (!isInside(boundary, abs)) return;
    const raw = readSmallFile(abs, 16 * 1024 * 1024); // maestro patch: a regular file only (a FIFO would hang)
    if (raw === null) return;
    seen.add(rel);
    out.push(rel);
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!/^\.{0,2}\//.test(spec) && !spec.endsWith(".css")) continue;
      if (/^(https?:)?\/\//.test(spec)) continue;
      const target = posix(relative(root, resolve(dirname(abs), spec)));
      visit(target);
    }
  };
  visit(entry);
  return out;
}

// maestro patch (not upstream): links are skipped (a dangling one threw, a loop threw ELOOP, and one could lead out
// of the repository), and a folder that cannot be read is skipped.
function pageFiles(dir, base = "") {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.isDirectory()) out.push(...pageFiles(join(dir, e.name), `${base}/${e.name}`));
    else if (e.isFile()) out.push({ seg: base, name: e.name });
  }
  return out;
}

/** Next app router page.* files -> URLs. Dynamic and parallel-slot routes are not visitable and are skipped. */
function appRoutes(root) {
  for (const app of ["app", "src/app"]) {
    if (!isDir(join(root, app))) continue;
    const urls = [];
    for (const { seg, name } of pageFiles(join(root, app))) {
      if (!/^page\.(tsx|jsx|ts|js|mdx)$/.test(name)) continue;
      const segs = seg.split("/").filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
      if (segs.some((s) => /^[[@]/.test(s))) continue;
      urls.push("/" + segs.join("/"));
    }
    return [...new Set(urls)].sort();
  }
  if (isDir(join(root, "pages"))) {
    const urls = [];
    for (const { seg, name } of pageFiles(join(root, "pages"))) {
      const m = name.match(/^(.+)\.(tsx|jsx|ts|js)$/);
      if (!m || m[1].startsWith("_") || seg.startsWith("/api") || /\[/.test(seg + m[1])) continue;
      const path = m[1] === "index" ? seg : `${seg}/${m[1]}`;
      urls.push(path || "/");
    }
    return [...new Set(urls)].sort();
  }
  return [];
}

function detectPlaywright(root) {
  const req = createRequire(join(root, "package.json"));
  for (const id of ["@playwright/test", "playwright"]) {
    try { req.resolve(id); return true; } catch { /* next */ }
  }
  return false;
}

/** The override file's shape, checked up front so a wrong type fails here with the key's name, not deep inside a check. */
const ARRAYS = ["routes", "allowWords", "allowSystemWords", "properNouns", "motionPhases", "contrastPairs", "emphasisExclude", "sources", "styles"];
// maestro patch: keys a repository's config may not set. `root` would move every read and write out of the
// repository; the others would reach the config object's prototype through Object.assign.
const FORBIDDEN = ["root", "__proto__", "constructor", "prototype"];
/** maestro patch: the config keys that hold paths, all of which must stay inside the repository. */
const PATH_KEYS = ["sources", "styles", "componentCss"];
function pathProblem(config, root) {
  const boundary = boundaryOf(root);
  const paths = [...PATH_KEYS.flatMap((k) => config[k] ?? []), ...("uiDir" in config ? [config.uiDir] : [])];
  for (const p of paths) {
    if (typeof p !== "string") return `sources, styles, componentCss and uiDir hold paths (strings); got ${JSON.stringify(p)}`;
    if (!isInside(boundary, join(root, p))) return `${JSON.stringify(p)} leads outside the repository; sources, styles, componentCss and uiDir must stay inside it`;
  }
  return null;
}

function validateOverride(over, name, root = null) {
  const fail = (m) => { throw new Error(`${name}: ${m}`); };
  if (over === null || typeof over !== "object" || Array.isArray(over)) fail("must be a JSON object");
  for (const k of FORBIDDEN) if (Object.prototype.hasOwnProperty.call(over, k)) fail(`${k} cannot be set here`);
  if ("componentCss" in over && !Array.isArray(over.componentCss)) fail("componentCss must be an array");
  for (const k of ARRAYS) if (k in over && !Array.isArray(over[k])) fail(`${k} must be an array`);
  if ("baseUrl" in over && typeof over.baseUrl !== "string") fail("baseUrl must be a string");
  // maestro patch (not upstream): the file comes from the repository. Its base URL reaches the browser
  // and the generated CI workflow, its routes are appended to that base, and its folders are read.
  if ("baseUrl" in over) { const p = baseUrlProblem(over.baseUrl); if (p) fail(`baseUrl ${p}`); }
  for (const r of over.routes ?? []) { const p = routeProblem(r); if (p) fail(`routes entry ${JSON.stringify(r)} ${p}`); }
  for (const row of over.motionPhases ?? []) {
    // a row without a specimen (or an empty one) is not sampled, as upstream treats it
    if (row && typeof row === "object" && row.specimen) { const p = routeProblem(row.specimen); if (p) fail(`motionPhases specimen ${JSON.stringify(row.specimen)} ${p}`); }
  }
  if (root) { const p = pathProblem(over, root); if (p) fail(p); }
  if ("contrastLevel" in over && !["AA", "AAA"].includes(String(over.contrastLevel).toUpperCase())) {
    fail(`contrastLevel must be "AA" or "AAA" (AA is the floor; there is no lower level)`);
  }
  if ("auth" in over) {
    if (over.auth === null || typeof over.auth !== "object" || Array.isArray(over.auth)) fail("auth must be an object, e.g. { \"storageState\": \"e2e/.auth/user.json\" }");
    if ("storageState" in over.auth && typeof over.auth.storageState !== "string") fail("auth.storageState must be a path (string) to a Playwright storage state file");
  }
}

/**
 * Find the project and describe it.
 * `viewsonic-ui.config.json` (project root, or options.configPath) overrides any field.
 */
export async function loadConfig(cwd = process.cwd(), options = {}) {
  const root = findRoot(cwd);
  const componentsPath = join(root, "components.json");
  if (!existsSync(componentsPath)) {
    throw new Error("Not a shadcn project - run npx shadcn@latest init first");
  }
  const components = readJson(componentsPath);
  const aliases = components.aliases ?? {};

  const boundary = boundaryOf(root);
  const entry = components.tailwind?.css;
  const styles = entry ? collectStyles(root, entry, boundary) : [];

  const app = ["app", "src/app"].find((d) => isDir(join(root, d))) ?? (isDir(join(root, "pages")) ? "pages" : null);
  const dirs = [app, ...["components", "ui", "lib", "hooks"].map((k) => aliasDir(root, aliases[k], boundary))].filter(Boolean);
  const unique = [...new Set(dirs)];
  // Drop directories nested inside another scanned directory (components/ui is inside components).
  const sources = unique.filter((d) => !unique.some((o) => o !== d && d.startsWith(o + "/")));

  const config = {
    root,
    styles,
    sources,
    uiDir: aliasDir(root, aliases.ui, boundary) ?? "components/ui",
    routes: appRoutes(root),
    baseUrl: "http://localhost:3000",
    allowWords: [],
    allowSystemWords: [],
    properNouns: [],
    motionPhases: [],
    contrastPairs: [],
    contrastLevel: "AA",
    hasPlaywright: detectPlaywright(root),
  };

  const overridePath = options.configPath
    ? (isAbsolute(options.configPath) ? options.configPath : resolve(options.configPath))
    : join(root, "viewsonic-ui.config.json");
  if (existsSync(overridePath)) {
    const over = readJson(overridePath);
    validateOverride(over, "viewsonic-ui.config.json", root);
    Object.assign(config, over);
  }
  // maestro patch: the folders found by default (app, pages, components/ui) are held to the same rule, so a
  // committed link out of the repository at one of them is refused too.
  const problem = pathProblem(config, root);
  if (problem) throw new Error(`viewsonic-ui: ${problem}`);
  return config;
}
