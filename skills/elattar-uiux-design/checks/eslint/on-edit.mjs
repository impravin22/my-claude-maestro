#!/usr/bin/env node
// PostToolUse hook for Edit|Write|MultiEdit: after the agent writes a file, flag every ui component in it that is used
// with a variant value, prop name or union value the component does not define, plus TypeScript's own errors on that
// JSX (missing required props, wrong types). The agent sees the messages right after its edit, like an editor squiggle.
//
//   stdin   the hook JSON ({ cwd, tool_input: { file_path } })
//   exit 0  nothing to report (also: not a script file, a file in the ui folder, no ui project, any internal error)
//   exit 2  violations, one per line on stderr: <file>:<line> <message>   (PostToolUse feedback goes to the agent)
//
// Same judge as the ESLint rule (../props.mjs). The type table is cached in the user's cache folder, so an edit costs a
// parse of one file plus one TypeScript pass over that file's JSX. Without the project's `typescript` only the cva check
// runs, and the agent is told so once, except at MAESTRO_UIUX_HOOK=on (maestro patch below).
//
// maestro patches (not upstream): the check runs in a child process killed after DEADLINE_MS (all of its work is
// synchronous, so nothing else can stop a hostile file or folder that makes it run long); an edited file over 1 MiB
// is skipped; every finding is printed as one line (a value or file name with a newline in it cannot forge a second)
// and at most MAX_FINDINGS of them; and the "told so once" marker lives in the user's private cache folder, created
// exclusively, never in the shared OS temp folder.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheDir, oneLine, readSmallFile } from "../maestro-guards.mjs";
import { checkSource, diagnosticsFor, loadTables, resolveTs } from "../props.mjs";
import { invalidVariantMessage, isUiImport, uiDirFor } from "../variants.mjs";

const SCRIPT = /\.(?:tsx|jsx|ts|js)$/;
const DEADLINE_MS = 20000; // below the 30 s hook timeout in maestro's hooks.json
const MAX_FINDINGS = 50;
const MAX_OUTPUT_BYTES = 256 * 1024;
const CHILD = "MAESTRO_UIUX_ON_EDIT_CHILD";
const posix = (p) => p.split("\\").join("/");

function projectRootOf(file) {
  let fallback = null;
  for (let d = dirname(file); ; d = dirname(d)) {
    if (existsSync(join(d, "components.json"))) return d;
    if (!fallback && existsSync(join(d, "package.json"))) fallback = d;
    if (dirname(d) === d) return fallback;
  }
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  let input;
  try { input = JSON.parse(await readStdin()); } catch { return 0; }
  const raw = input?.tool_input?.file_path ?? input?.tool_input?.path;
  if (typeof raw !== "string" || !SCRIPT.test(raw)) return 0;
  const file = isAbsolute(raw) ? raw : resolve(input.cwd ?? process.cwd(), raw);
  if (!existsSync(file) || file.split(/[\\/]/).includes("node_modules")) return 0;
  const root = projectRootOf(file);
  if (!root) return 0;
  const uiDir = uiDirFor(root);
  const rel = posix(relative(root, file));
  if (rel.startsWith("..") || rel.startsWith(`${uiDir}/`)) return 0;

  // maestro patch (not upstream): resolving `typescript` loads it from the project, which is code
  // from that repository. Run through maestro's hooks/uiux-on-edit.sh, MAESTRO_UIUX_HOOK=on keeps
  // to the cva-only path and never loads it; only "full" does. Unset (run directly) is upstream's.
  // At "on" the "no typescript" notice is skipped too: typescript was left out on purpose.
  // Only unset (upstream's own use) or "full" allows it, so any other value fails safe.
  const level = process.env.MAESTRO_UIUX_HOOK;
  const projectCodeAllowed = level === undefined || level === "full";
  const ts = projectCodeAllowed ? resolveTs(root) : null;
  const tables = loadTables(root, { types: Boolean(ts) });
  if (!tables.cva.size) return 0;
  const src = readSmallFile(file);
  if (src === null) return 0;
  const found = ts ? checkSource(ts, rel, src, tables) : [];
  if (!ts) {
    // no TypeScript to parse with: the cva check still runs, through a small regex pass over literal attributes
    found.push(...regexFallback(src, tables));
  }
  if (ts) {
    const flagged = new Set(found.map((f) => f.line));
    try {
      for (const d of diagnosticsFor(ts, root, file, src, uiDir)) if (!flagged.has(d.line)) found.push(d);
    } catch { /* the type pass is best effort */ }
  }
  if (found.length) {
    found.sort((a, b) => a.line - b.line);
    const shown = found.slice(0, MAX_FINDINGS).map((f) => oneLine(`${rel}:${f.line} ${f.message}`));
    if (found.length > MAX_FINDINGS) shown.push(`(${found.length - MAX_FINDINGS} more findings in ${oneLine(rel)} not shown)`);
    process.stderr.write(shown.join("\n") + "\nFix these now: use a prop or value the component defines (read its file in the ui folder).\n");
    return 2;
  }
  if (!ts && projectCodeAllowed) {
    const dir = cacheDir();
    const marker = dir && join(dir, "viewsonic-on-edit-no-ts");
    // No usable cache folder: say nothing, rather than repeat the notice on every edit.
    if (marker && !existsSync(marker)) {
      try { writeFileSync(marker, "1", { flag: "wx", mode: 0o600 }); } catch { /* none */ }
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "elattar-uiux-design: this project has no `typescript`, so after-edit checks cover variant values only (not prop names, union values or required props)." } }));
    }
  }
  return 0;
}

function regexFallback(src, tables) {
  const local = new Map();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!isUiImport(m[2], tables.uiDir)) continue;
    for (const part of m[1].split(",")) {
      const [name, alias] = part.trim().split(/\s+as\s+/);
      if (name) local.set(alias ?? name, name);
    }
  }
  const out = [];
  for (const tag of src.matchAll(/<([A-Z]\w*)\b((?:[^<>{}]|\{[^{}]*\})*)>/g)) {
    const component = local.get(tag[1]);
    if (!component) continue;
    const line = src.slice(0, tag.index).split("\n").length;
    for (const a of tag[2].matchAll(/(\w+)=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\})/g)) {
      const message = invalidVariantMessage(tables.cva, component, a[1], a[2] ?? a[3]);
      if (message) out.push({ line, message });
    }
  }
  return out;
}

/**
 * maestro patch (not upstream): run main() in a child that is killed at the deadline, so a check that runs long
 * becomes a silent exit 0 (the contract for an internal error) instead of holding the agent until the hook timeout,
 * and its output is bounded. `MAESTRO_UIUX_ON_EDIT_DEADLINE_MS` can only shorten the deadline (tests use it).
 */
async function supervise() {
  let input;
  try { input = await readStdin(); } catch { return 0; }
  const asked = Number(process.env.MAESTRO_UIUX_ON_EDIT_DEADLINE_MS);
  const timeout = asked > 0 ? Math.min(asked, DEADLINE_MS) : DEADLINE_MS;
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    input, encoding: "utf8", timeout, maxBuffer: MAX_OUTPUT_BYTES, env: { ...process.env, [CHILD]: "1" },
  });
  if (r.error || r.status === null) return 0; // killed at the deadline, output over the bound, or no node: silent
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return r.status;
}

process.exitCode = process.env[CHILD] === "1" ? await main().catch(() => 0) : await supervise().catch(() => 0);
