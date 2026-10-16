// Shared helpers for the static checks. Node built-ins only.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

export const toPosix = (p) => p.split("\\").join("/");

/** Every .ts/.tsx/.css file under `dir` (absolute), skipping node_modules and dot-dirs. */
// maestro patch (not upstream): symbolic links and special files are skipped (a dangling link threw and stopped the
// whole run, a loop threw ELOOP, a link could lead out of the repository, a FIFO would hang the read).
export function walk(dir, exts = /\.(tsx?|css)$/, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, out);
    else if (e.isFile() && exts.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * The files to scan, as root-relative posix paths: every file under config.sources
 * plus the stylesheets that define the system, deduplicated, sources first.
 */
export function projectFiles(config, { withStyles = true, all = false } = {}) {
  const seen = new Set();
  const out = [];
  const add = (abs) => {
    const rel = toPosix(relative(config.root, abs));
    if (seen.has(rel)) return;
    seen.add(rel);
    out.push(rel);
  };
  for (const dir of config.sources) walk(join(config.root, dir)).forEach(add);
  if (withStyles) for (const f of config.styles) if (existsSync(join(config.root, f))) add(join(config.root, f));
  // config.scopeFiles is set by run.mjs for a scoped run; `all` is for cross-file passes
  if (config.scopeFiles && !all) { const s = new Set(config.scopeFiles); return out.filter((f) => s.has(f)); }
  return out;
}

export const readRel = (config, rel) => readFileSync(join(config.root, rel), "utf8");

/** Blank out comment bodies, keeping every newline so line numbers still match. */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** Split "what is wrong: what to do" into { why, fix }. */
export function splitMsg(msg, fallbackFix = "use the system's token") {
  const i = msg.indexOf(" - ");
  if (i < 0) return { why: msg, fix: fallbackFix };
  return { why: msg.slice(0, i), fix: msg.slice(i + 3) };
}

export const matches = (rel, list = []) =>
  list.some((p) => (p.endsWith("/") ? rel.startsWith(p) : rel === p));
