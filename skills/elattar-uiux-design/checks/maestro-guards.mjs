// maestro patch (not upstream): the guards maestro adds to the vendored checks. Node built-ins only.
// Every export is used by a patched upstream module; docs/2026-10-15-viewsonic-uiux-bundle.md lists
// each patch. The repository being checked is untrusted input: these keep its config from pointing a
// read outside the repository, its paths from being written through, and its strings from reaching a
// shell line, a workflow or another origin.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** No single file the checks read on their own (a ui component, a config, the edited file) is bigger than this. */
export const MAX_FILE_BYTES = 1024 * 1024;
/** A walk of the ui folder stops after this many files or bytes, so a hostile `uiDir` cannot stall the hook. */
export const MAX_WALK_FILES = 2000;
export const MAX_WALK_BYTES = 32 * 1024 * 1024;
/** A walk also stops after looking at this many entries (files and folders, matched or not). */
export const MAX_WALK_ENTRIES = 50000;

const within = (base, abs) => {
  const r = relative(base, abs);
  return r === "" || !(r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r));
};

/**
 * Real path of `abs`, or of its deepest existing ancestor with the rest appended (a path that does not exist yet).
 * null when a part of it is a link that leads nowhere: where it would lead cannot be known, so it is never inside.
 */
function realish(abs) {
  const rest = [];
  for (let p = abs; ; p = dirname(p)) {
    try { return join(realpathSync(p), ...rest.reverse()); } catch { /* not there yet, or a dangling link */ }
    try { if (lstatSync(p).isSymbolicLink()) return null; } catch { /* not there at all */ }
    if (dirname(p) === p) return abs;
    rest.push(basename(p));
  }
}

/** The user's home folder, or null. A `.git` there (a home kept in git) is no project's repository. */
function homeFolder() {
  try { const h = homedir(); return h && isAbsolute(h) ? resolve(h) : null; } catch { return null; }
}

/** Is `p` the home folder or one of its ancestors? */
export function isHomeOrAbove(p) {
  const home = homeFolder();
  return Boolean(home) && within(resolve(p), home);
}

/**
 * The nearest folder at or above `dir` holding `.git`, or null. The search stops below the home folder, so a home
 * kept in git (dotfiles) never becomes a project's repository.
 */
function repoAt(dir) {
  const home = homeFolder();
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (home && within(d, home) && resolve(dir) !== home) return null; // reached the home folder (or above) from below
    if (existsSync(join(d, ".git"))) return d;
    if (dirname(d) === d) return null;
  }
}

/** The folder a project's paths must stay inside: its git repository (see repoAt), else `root` itself. */
export function boundaryOf(root) {
  return repoAt(root) ?? resolve(root);
}

/** Is `target` (absolute, or relative to `base`) inside `base`, both as written and once symbolic links are resolved? */
export function isInside(base, target) {
  const abs = resolve(base, target);
  if (!within(resolve(base), abs)) return false;
  const realBase = realish(resolve(base));
  const real = realish(abs);
  return realBase !== null && real !== null && within(realBase, real);
}

/**
 * What is wrong with `path` as a folder to write into, or null: a symbolic link on the way to it (the folder itself
 * included) that sits inside a git repository and leads out of it. A link above every repository (macOS /tmp, a
 * linked home or projects folder) is not judged: no repository says where it may lead.
 */
export function linkOutOfRepo(path) {
  for (let p = resolve(path); dirname(p) !== p; p = dirname(p)) {
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (!st.isSymbolicLink()) continue;
    const repo = repoAt(dirname(p));
    // a home kept in git says nothing about where a link in it (a linked ~/projects) may lead
    if (repo && !isHomeOrAbove(repo) && !isInside(repo, p)) return `${p} is a symbolic link inside the repository at ${repo} that leads out of it`;
  }
  return null;
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
export function walkFiles(dir, pattern, out = [], budget = { files: MAX_WALK_FILES, bytes: MAX_WALK_BYTES, entries: MAX_WALK_ENTRIES }) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (budget.files <= 0 || budget.bytes <= 0 || budget.entries <= 0) break;
    budget.entries -= 1;
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

/** `dir`, made if missing, when it is a real folder this user owns (then tightened to 0700); else null. */
function privateFolder(dir) {
  try {
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
 * The checks' own cache folder, private to this user: $XDG_CACHE_HOME/maestro-uiux, else ~/.cache/maestro-uiux, else
 * (no usable home) maestro-uiux-<uid> in the OS temp folder; mode 0700 and owned by this user, or it is not used.
 * null when none is safe (a link, a file, another user's folder), so callers just skip caching. A name in the shared
 * temp folder is predictable, which is why a folder another user made there, or a link, is refused, not entered.
 */
export function cacheDir() {
  const xdg = process.env.XDG_CACHE_HOME;
  let home = null;
  try { home = homedir(); } catch { /* no home */ }
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  const candidates = [
    xdg && isAbsolute(xdg) ? join(xdg, "maestro-uiux") : null,
    home && isAbsolute(home) && home !== "/" ? join(home, ".cache", "maestro-uiux") : null,
    join(tmpdir(), `maestro-uiux-${uid}`),
  ];
  for (const dir of candidates) {
    const ok = dir && privateFolder(dir);
    if (ok) return ok;
  }
  return null;
}

/**
 * Replace the file at `path` with `data`: written to a new, randomly named file beside it (exclusive create, which
 * never follows a link), then renamed over it. A link or hard link at `path` loses only its name; whatever it pointed
 * at is never written. Without `mode`, a regular file already there keeps its permissions, and a new one gets the
 * default (0666 less the umask).
 */
export function replaceFile(path, data, mode, { replaceReadOnly = false } = {}) {
  let keep = null;
  try {
    const st = lstatSync(path);
    // A read-only file stays read-only, as a plain write would have failed on it (unless it is ours to refresh).
    if (st.isFile() && !(st.mode & 0o200) && !replaceReadOnly) throw Object.assign(new Error(`${path} is read-only`), { code: "EACCES" });
    if (st.isFile() && mode === undefined) keep = st.mode & 0o777;
  } catch (e) { if (e?.code === "EACCES") throw e; /* new file */ }
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, data, { flag: "wx", mode: mode ?? 0o666 });
    if (keep !== null) { try { chmodSync(tmp, keep); } catch { /* a file system without modes */ } }
    renameSync(tmp, path);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* keep the first error */ }
    throw e;
  }
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

/** What is wrong with overwriting `path`, or null: a regular file there must be writable. */
export function readOnly(path) {
  try { const st = lstatSync(path); return st.isFile() && !(st.mode & 0o200) ? `${path} is read-only` : null; } catch { return null; }
}

/** What is wrong with reading `path` (following links), or null: it must be missing or a regular file. */
export function notRegular(path) {
  try { return statSync(path).isFile() ? null : `${path} is not a regular file`; } catch (e) {
    return MISSING.has(e?.code) ? null : inspectError(path, e);
  }
}

/* ─────────────── strings that reach a URL, a shell line or a workflow ─────────────── */

// Control and format characters (C0, DEL, C1, bidi and zero-width marks, tag characters, the BOM), the Unicode line
// and paragraph separators, variation selectors and the invisible Hangul fillers: anything that can end a line, or
// hide or reorder text.
const INVISIBLE = "\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\\u034f\\u115f\\u1160\\u3164\\uffa0\\ufe00-\\ufe0f\\u{e0100}-\\u{e01ef}";
const BREAKS = new RegExp(`[${INVISIBLE}]`, "u");

/**
 * What is wrong with `value` as a base URL, or null. Only http and https, no credentials, no line breaks. The
 * installer single-quotes it into a shell line of a YAML block, so the characters that matter are a line break
 * (it would end the block and start a new workflow step) and `${{` (GitHub expands an expression before the shell
 * sees the quotes); a quote or space is safe there.
 */
export function baseUrlProblem(value) {
  if (typeof value !== "string" || value === "") return "must be a non-empty string";
  if (BREAKS.test(value)) return "must not hold a line break, a control character or an invisible character";
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
  if (BREAKS.test(value) || /\s/.test(value) || value.includes("\\")) return "must not hold spaces, backslashes, control or invisible characters";
  return null;
}

/** True for an address that is this machine or a reserved development name. */
export const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|::1|[^/]*\.localhost|[^/]*\.test)$/i;
export const isLocalBase = (base) => { try { return LOCAL_HOST.test(new URL(base).hostname); } catch { return false; } };

/**
 * One line, however its quoted names were written: control, format and invisible characters (see INVISIBLE), which
 * can end a line or hide or reorder text, become a space. Other Unicode (a path like app/café.tsx) is kept;
 * maestro's hook wrapper narrows to ASCII on its own.
 */
const INVISIBLE_RUNS = new RegExp(`[${INVISIBLE}]+`, "gu");
export const oneLine = (s) => String(s).replace(INVISIBLE_RUNS, " ");

/**
 * `text` without its block comments, in one pass (the lazy `/\/\*[\s\S]*?\*\//g` was quadratic on an unterminated
 * one). An unterminated comment is left as it is, as that pattern left it. `blank` keeps the comment's newlines and
 * turns the rest into spaces, so line numbers still match.
 */
export function stripBlockComments(text, blank = false) {
  let out = "";
  let i = 0;
  for (;;) {
    const start = text.indexOf("/*", i);
    const end = start < 0 ? -1 : text.indexOf("*/", start + 2);
    if (end < 0) return out + text.slice(i);
    out += text.slice(i, start) + (blank ? text.slice(start, end + 2).replace(/[^\n]/g, " ") : "");
    i = end + 2;
  }
}

/** `s` cut to `max` characters, marked when cut, so a hostile name cannot make one message huge. */
export const shorten = (s, max) => { const t = String(s); return t.length > max ? `${t.slice(0, max)}...` : t; };
/** A list for a message: at most `items` entries, each clipped, with a count of the rest. */
export function shortList(list, items = 20, max = 40) {
  const shown = list.slice(0, items).map((x) => shorten(x, max));
  return list.length > items ? `${shown.join(", ")} and ${list.length - items} more` : shown.join(", ");
}
