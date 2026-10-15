#!/usr/bin/env node
// PostToolUse hook for Edit|Write|MultiEdit: after the agent writes a file, flag every ui component in it that is used
// with a variant value, prop name or union value the component does not define, plus TypeScript's own errors on that
// JSX (missing required props, wrong types). The agent sees the messages right after its edit, like an editor squiggle.
//
//   stdin   the hook JSON ({ cwd, tool_input: { file_path } })
//   exit 0  nothing to report (also: not a script file, a file in the ui folder, no ui project, any internal error)
//   exit 2  violations, one per line on stderr: <file>:<line> <message>   (PostToolUse feedback goes to the agent)
//
// Same judge as the ESLint rule (../props.mjs). The type table is cached in the OS temp folder, so an edit costs a parse
// of one file plus one TypeScript pass over that file's JSX. Without the project's `typescript` only the cva check runs,
// and the agent is told so once, except at MAESTRO_UIUX_HOOK=on (maestro patch below).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { checkSource, diagnosticsFor, loadTables, resolveTs } from "../props.mjs";
import { invalidVariantMessage, isUiImport, uiDirFor } from "../variants.mjs";

const SCRIPT = /\.(?:tsx|jsx|ts|js)$/;
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
  if (!existsSync(file) || file.split(/[\/]/).includes("node_modules")) return 0;
  const root = projectRootOf(file);
  if (!root) return 0;
  const uiDir = uiDirFor(root);
  const rel = posix(relative(root, file));
  if (rel.startsWith("..") || rel.startsWith(`${uiDir}/`)) return 0;

  // maestro patch (not upstream): resolving `typescript` loads it from the project, which is code
  // from that repository. Run through maestro's hooks/uiux-on-edit.sh, MAESTRO_UIUX_HOOK=on keeps
  // to the cva-only path and never loads it; only "full" does. Unset (run directly) is upstream's.
  // At "on" the "no typescript" notice is skipped too: typescript was left out on purpose.
  const projectCodeAllowed = process.env.MAESTRO_UIUX_HOOK !== "on";
  const ts = projectCodeAllowed ? resolveTs(root) : null;
  const tables = loadTables(root, { types: Boolean(ts) });
  if (!tables.cva.size) return 0;
  const src = readFileSync(file, "utf8");
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
    process.stderr.write(found.map((f) => `${rel}:${f.line} ${f.message}`).join("\n") + "\nFix these now: use a prop or value the component defines (read its file in the ui folder).\n");
    return 2;
  }
  if (!ts && projectCodeAllowed) {
    const marker = join(tmpdir(), "viewsonic-on-edit-no-ts");
    if (!existsSync(marker)) {
      try { writeFileSync(marker, "1"); } catch { /* none */ }
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

process.exitCode = await main().catch(() => 0);
