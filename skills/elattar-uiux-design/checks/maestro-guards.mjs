// maestro patch (not upstream): the guards maestro adds to the vendored checks. Node built-ins only.
// Every export is used by a patched upstream module; docs/2026-10-15-viewsonic-uiux-bundle.md lists
// each patch. The repository being checked is untrusted input: these keep its config from pointing a
// read outside the repository, its paths from being written through, and its strings from reaching a
// shell line, a workflow or another origin.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** No single file the checks read on their own (a ui component, a config, the edited file) is bigger than this. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** A walk of the ui folder stops after this many files or bytes, so a hostile `uiDir` cannot stall the hook. */
export const MAX_WALK_FILES = 2000;
export const MAX_WALK_BYTES = 32 * 1024 * 1024;

const within = (base, abs) => {
  const r = relative(base, abs);
  return r === "" || !(r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r));
};

/** Real path of `abs`, or of its deepest existing ancestor with the rest appended (a path that does not exist yet). */
function realish(abs) {
  const rest = [];
  for (let p = abs; ; p = dirname(p)) {
    try { return join(realpathSync(p), ...rest.reverse()); } catch { /* not there yet */ }
    if (dirname(p) === p) return abs;
    rest.push(basename(p));
  }
}

/** The folder a project's paths must stay inside: the nearest folder at or above `root` holding `.git`, else `root`. */
export function boundaryOf(root) {
  for (let d = resolve(root); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return d;
    if (dirname(d) === d) return resolve(root);
  }
}

/** Is `target` (absolute, or relative to `base`) inside `base`, both as written and once symbolic links are resolved? */
export function isInside(base, target) {
  const abs = resolve(base, target);
  if (!within(resolve(base), abs)) return false;
  return within(realish(resolve(base)), realish(abs));
}

/** Text of a regular file no bigger than `max`, else null (missing, a folder, a FIFO or device, too big, unreadable). */
export function readSmallFile(path, max = MAX_FILE_BYTES) {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > max) return null;
    return readFileSync(path, "utf8");
  } catch { return null; }
}

/**
 * Files under `dir` whose name matches `pattern`, sorted, skipping node_modules, dot folders and every symbolic link
 * (a link can lead out of the project or into a loop). Stops at MAX_WALK_FILES files or MAX_WALK_BYTES bytes, and
 * leaves out any file over MAX_FILE_BYTES. Never throws: an entry it cannot read is skipped.
 */
export function walkFiles(dir, pattern, out = [], budget = { files: MAX_WALK_FILES, bytes: MAX_WALK_BYTES }) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (budget.files <= 0 || budget.bytes <= 0) break;
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, pattern, out, budget);
    else if (e.isFile() && pattern.test(e.name)) {
      let size;
      try { size = statSync(full).size; } catch { continue; }
      if (size > MAX_FILE_BYTES) continue;
      budget.files -= 1;
      budget.bytes -= size;
      out.push(full);
    }
  }
  return out;
}

/**
 * The checks' own cache folder, private to this user: $XDG_CACHE_HOME/maestro-uiux, else ~/.cache/maestro-uiux, mode
 * 0700. null when it cannot be made safe (a link, a file, another user's folder), so callers just skip caching.
 * Never the shared OS temp folder, where another local user can plant a link at a predictable name.
 */
export function cacheDir() {
  try {
    const xdg = process.env.XDG_CACHE_HOME;
    const dir = join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".cache"), "maestro-uiux");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = lstatSync(dir);
    if (!st.isDirectory()) return null;
    if (typeof process.getuid === "function") {
      if (st.uid !== process.getuid()) return null;
      if (st.mode & 0o077) chmodSync(dir, 0o700);
    }
    return dir;
  } catch { return null; }
}

/**
 * Replace the file at `path` with `data`: written to a new, randomly named file beside it (exclusive create, which
 * never follows a link), then renamed over it. A link or hard link at `path` loses only its name; whatever it pointed
 * at is never written. Without `mode`, a regular file already there keeps its permissions, and a new one gets the
 * default (0666 less the umask).
 */
export function replaceFile(path, data, mode) {
  let keep = null;
  if (mode === undefined) { try { const st = lstatSync(path); if (st.isFile()) keep = st.mode & 0o777; } catch { /* new file */ } }
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, data, { flag: "wx", mode: mode ?? 0o666 });
    if (keep !== null) chmodSync(tmp, keep);
    renameSync(tmp, path);
  } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

/* ─────────────── what may be written into a project ─────────────── */

// Only "it does not exist" counts as safe: any other error is reported, so a path the guard cannot
// inspect is never written blind.
const MISSING = new Set(["ENOENT", "ENOTDIR"]);
const inspectError = (p, e) => `${p} cannot be inspected (${e?.code ?? "unknown error"})`;

/**
 * What is wrong with writing `rel` below `base`, or null. Refuses a symbolic link anywhere on the path, a path part
 * that is not a folder, and a final part that is not a regular file (`kind` "file") or folder (`kind` "dir").
 */
export function linkOnPath(base, rel, kind = "file") {
  const parts = rel.split("/").filter(Boolean);
  let p = base;
  for (const [i, part] of parts.entries()) {
    p = join(p, part);
    let st;
    try { st = lstatSync(p); } catch (e) {
      if (MISSING.has(e?.code)) return null; // missing: nothing below it exists yet
      return inspectError(p, e);
    }
    if (st.isSymbolicLink()) return `${p} is a symbolic link`;
    const last = i === parts.length - 1;
    if ((!last || kind === "dir") && !st.isDirectory()) return `${p} is not a folder`;
    if (last && kind === "file" && !st.isFile()) return `${p} is not a regular file`;
  }
  return null;
}

/** The first symbolic link or special file (FIFO, socket, device) anywhere under `dir`, or null. */
export function linkUnder(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) {
    if (MISSING.has(e?.code)) return null;
    return inspectError(dir, e);
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) return `${p} is a symbolic link`;
    if (e.isDirectory()) { const found = linkUnder(p); if (found) return found; }
    else if (!e.isFile()) return `${p} is not a regular file`;
  }
  return null;
}

/** What is wrong with reading `path` (following links), or null: it must be missing or a regular file. */
export function notRegular(path) {
  try { return statSync(path).isFile() ? null : `${path} is not a regular file`; } catch (e) {
    return MISSING.has(e?.code) ? null : inspectError(path, e);
  }
}

/* ─────────────── strings that reach a URL, a shell line or a workflow ─────────────── */

/**
 * What is wrong with `value` as a base URL, or null. Only http and https, no credentials, printable ASCII. The
 * installer single-quotes it into a shell line of a YAML block, so the characters that matter are a line break
 * (it would end the block and start a new workflow step) and `${{` (GitHub expands an expression before the shell
 * sees the quotes); a quote or space is safe there.
 */
export function baseUrlProblem(value) {
  if (typeof value !== "string") return "must be a string";
  if (!/^[\x20-\x7e]+$/.test(value)) return "may only hold printable ASCII characters (no line breaks or other control characters)";
  if (value.includes("${{")) return "must not hold a GitHub Actions expression (${{ ... }})";
  let url;
  try { url = new URL(value); } catch { return "must be a full URL such as http://localhost:3000"; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "must start with http:// or https://";
  if (url.username || url.password) return "must not hold a user name or password";
  return null;
}

/** What is wrong with `value` as a route, or null. It is appended to the base URL, so it must be a path on that origin. */
export function routeProblem(value) {
  if (typeof value !== "string") return "must be a string";
  if (!value.startsWith("/") || value.startsWith("//")) return "must start with a single /, a path on the app (not a host)";
  if (!/^[\x21-\x7e]*$/.test(value) || value.includes("\\")) return "may only hold printable characters, with no spaces or backslashes";
  return null;
}

/** True for an address that is this machine or a reserved development name. */
export const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|::1|[^/]*\.localhost|[^/]*\.test)$/i;
export const isLocalBase = (base) => { try { return LOCAL_HOST.test(new URL(base).hostname); } catch { return false; } };

/** Printable ASCII only, so one finding stays one line however its quoted names were written. */
export const oneLine = (s) => String(s).replace(/[^\x20-\x7e]+/g, " ");
