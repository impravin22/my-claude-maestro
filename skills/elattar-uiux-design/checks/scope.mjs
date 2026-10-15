// Scoping: which files the static checks scan, and which routes the browser checks visit.
// Node built-ins only.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, posix } from "node:path";
import { projectFiles, toPosix, readRel } from "./lib.mjs";

const git = (root, args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });

/** True when `root` is itself the top of a git work tree (a fixture inside another repo is not). */
export function isGitRoot(root) {
  if (!existsSync(join(root, ".git"))) return false;
  const r = git(root, ["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) return false;
  // git prints the real path (macOS: /var is /private/var), so compare real paths.
  try { return realpathSync(r.stdout.trim()) === realpathSync(root); } catch { return false; }
}

/**
 * Files changed vs HEAD (staged, unstaged, untracked), root-relative posix. Deleted files and both sides of a
 * rename are listed (no rename detection). null when git cannot say. With no HEAD yet, every file counts as changed.
 */
export function changedFiles(root) {
  if (!isGitRoot(root)) return null;
  const set = new Set();
  const hasHead = git(root, ["rev-parse", "--verify", "-q", "HEAD"]).status === 0;
  const cmds = hasHead
    ? [["diff", "--no-renames", "--name-only", "HEAD"], ["ls-files", "--others", "--exclude-standard"]]
    : [["ls-files", "--cached", "--others", "--exclude-standard"]];
  for (const c of cmds) {
    const r = git(root, ["-c", "core.quotepath=off", ...c]);
    if (r.status !== 0) return null;
    r.stdout.split(/\r?\n/).filter(Boolean).forEach((f) => set.add(toPosix(f)));
  }
  return [...set].sort();
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const EXT = /\.(tsx?|jsx?|mjs|css)$/;

const bareOf = (f) => f.replace(EXT, "");

/** Project file `rel` -> the root-relative paths it imports (relative specs and "@/" or "~/" aliases). */
function importsOf(config, rel, byBare) {
  let text;
  try { text = readRel(config, rel); } catch { return []; }
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    let base;
    if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(rel), spec));
    else if (/^[@~]\//.test(spec)) base = spec.slice(2);
    else continue;
    for (const cand of [base, `src/${base}`]) {
      for (const hit of [cand, `${cand}/index`]) {
        const f = byBare.get(bareOf(hit)) ?? byBare.get(hit);
        if (f) out.push(f);
      }
    }
  }
  return out;
}

/** Map of project file -> files it imports. `gone` (deleted or renamed-away paths) can still be import targets. */
function importGraph(config, files, gone = []) {
  const byBare = new Map();
  for (const f of [...files, ...gone]) byBare.set(bareOf(f), f);
  const graph = new Map();
  for (const f of files) graph.set(f, importsOf(config, f, byBare));
  return graph;
}

/** Changed files (existing or gone) plus every project file that imports one of them (one hop). */
export function withImporters(config, changed, files, gone = []) {
  const want = new Set([...changed, ...gone]);
  const out = new Set(changed);
  for (const [f, targets] of importGraph(config, files, gone)) if (!want.has(f) && targets.some((t) => want.has(t))) out.add(f);
  return [...out].sort();
}

/**
 * Decide the file scope. Returns { files: string[] | null, label }.
 * files === null means every file. mode: "fast" | "full" | other; flags: { all, changed }.
 */
export function computeScope(config, mode, flags = {}) {
  const everything = { files: null, label: "scope: all files" };
  if (flags.all) return everything;
  if (!(flags.changed || mode === "fast")) return everything;
  const changed = changedFiles(config.root);
  if (!changed) return flags.changed ? { files: null, label: "scope: all files (no git work tree at the project root)" } : everything;
  const all = projectFiles(config);
  const known = new Set(all);
  const styles = new Set(config.styles ?? []);
  // a changed stylesheet or config can change every verdict
  if (changed.some((f) => styles.has(f) || f === "viewsonic-ui.config.json")) return { files: null, label: "scope: all files (a stylesheet or the config changed)" };
  const inProject = changed.filter((f) => known.has(f));
  const gone = changed.filter((f) => !existsSync(join(config.root, f)) && EXT.test(f));
  const files = withImporters(config, inProject, all, gone);
  const extra = files.length - inProject.length;
  return { files, label: `scope: ${files.length} files (changed vs HEAD${extra ? `, ${extra} importing` : ""}${gone.length ? `, ${gone.length} deleted or renamed` : ""})` };
}

/** URL of an app/pages page file, or null when it is not a visitable page. */
export function routeOfPageFile(rel) {
  let m = /^(?:src\/)?app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(rel);
  if (m) {
    const segs = m[1].split("/").filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
    if (segs.some((s) => /^[[@]/.test(s))) return null;
    return "/" + segs.join("/");
  }
  m = /^(?:src\/)?pages\/(.+)\.(?:tsx|jsx|ts|js)$/.exec(rel);
  if (m && !/^(api\/|_)/.test(m[1]) && !/\[/.test(m[1])) return "/" + m[1].replace(/(^|\/)index$/, "");
  return null;
}

/** Routes of the changed page files that still exist, plus "/" . */
export function changedRoutes(changed) {
  const set = new Set(["/"]);
  for (const f of changed ?? []) { const r = routeOfPageFile(f); if (r !== null) set.add(r === "" ? "/" : r); }
  return [...set].sort();
}

/** Pages (files with a route) that reach `start` by importing it, directly or through other files. */
function pagesReaching(start, reverse) {
  const seen = new Set([start]);
  const pages = new Set();
  const queue = [start];
  while (queue.length) {
    const f = queue.shift();
    for (const imp of reverse.get(f) ?? []) {
      if (seen.has(imp)) continue;
      seen.add(imp);
      if (routeOfPageFile(imp) !== null) pages.add(imp);
      queue.push(imp);
    }
  }
  return pages;
}

function reverseGraph(graph) {
  const reverse = new Map();
  for (const [f, targets] of graph) for (const t of targets) (reverse.get(t) ?? reverse.set(t, new Set()).get(t)).add(f);
  return reverse;
}

/** Why every route must be visited (a sentence), or null when the changed pages and the pages reaching a changed file are enough. */
export function widenReason(config, changed, files, gone) {
  const styles = new Set(config.styles ?? []);
  for (const f of changed) {
    if (styles.has(f) || f === "viewsonic-ui.config.json" || /(^|\/)(layout|template)\.[a-z]+$/.test(f)) return `shared file changed: ${f}`;
  }
  const known = new Set(files);
  const reverse = reverseGraph(importGraph(config, files, gone));
  for (const f of new Set([...changed.filter((x) => known.has(x)), ...gone])) {
    if (routeOfPageFile(f) !== null) continue;
    const n = pagesReaching(f, reverse).size;
    if (n === 0) return `no page imports ${f} - checking all routes`;
    if (n >= 2) return `shared file changed: ${f}`;
  }
  return null;
}

/**
 * Routes for browser checks. Returns { routes: string[] | undefined, label, narrowed }.
 * undefined means "let each check use config.routes".
 */
export function computeRoutes(config, { routes, allRoutes, changed }) {
  const allLabel = `routes: all (${config.routes?.length ?? 0})`;
  if (routes?.length) return { routes, label: `routes: ${routes.join(", ")}`, narrowed: true };
  if (allRoutes) return { routes: undefined, label: allLabel, narrowed: false };
  changed ??= changedFiles(config.root);
  if (!changed) return { routes: undefined, label: allLabel, narrowed: false };
  const files = projectFiles(config);
  const known = new Set(files);
  const gone = changed.filter((f) => !existsSync(join(config.root, f)) && EXT.test(f));
  const why = widenReason(config, changed, files, gone);
  if (why) return { routes: undefined, label: `routes: all (${why})`, narrowed: false };
  const reverse = reverseGraph(importGraph(config, files, gone));
  const live = changed.filter((f) => known.has(f));
  const reached = [...live, ...gone].flatMap((f) => [...pagesReaching(f, reverse)]);
  const r = changedRoutes([...live, ...reached]);
  return { routes: r, label: `routes: ${r.join(", ")} (changed pages, pages reaching a changed file, and /)`, narrowed: true };
}
