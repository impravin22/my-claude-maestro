// Shared fixtures for maestro's hardening tests (not upstream; not a test file itself). Each test builds a hostile
// repository in a fresh temp folder and checks that a folder outside it, standing in for the user's own files, is
// exactly as it was.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const checks = resolve(here, "..");
export const runMjs = join(checks, "run.mjs");
export const onEdit = join(checks, "eslint", "on-edit.mjs");

const dirs = [];
/** Pass to node:test's after(): removes every folder scratch() made. */
export const cleanup = () => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); };
export const scratch = (name = "maestro-harden-") => { const d = mkdtempSync(join(tmpdir(), name)); dirs.push(d); return d; };
export const put = (base, files) => {
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); }
};

export const BUTTON = `import { cva } from "class-variance-authority";
const buttonStyles = cva("x", { variants: { size: { sm: "", lg: "" } } });
export function Button(props) { return <button className={buttonStyles(props)} {...props} />; }
`;
export const HEAD = `import { Button } from "@/components/ui/button";\n`;

/** A shadcn-shaped project with a cva Button, at `<base>/project`. */
export function uiProject(base, extra = {}) {
  const root = join(base, "project");
  put(root, {
    "package.json": "{}",
    "components.json": JSON.stringify({ aliases: { ui: "@/components/ui" }, tailwind: { css: "app/globals.css" } }),
    "components/ui/button.tsx": BUTTON,
    "app/globals.css": ":root { --x: 1px; }\n",
    ...extra,
  });
  return root;
}

// Every hook run gets its own cache folder, so no test reads or writes the real ~/.cache.
const hookCache = () => scratch("maestro-xdg-");
/**
 * Write `text` at `rel` (unless null), then run the after-edit check on it as Claude Code would after an Edit.
 * The caller's MAESTRO_UIUX_HOOK never leaks in: a test sets the level it means.
 */
export function edit(root, rel, text, env = {}) {
  if (text !== null) put(root, { [rel]: text });
  const base = { ...process.env, NODE_PATH: "", XDG_CACHE_HOME: hookCache() };
  delete base.MAESTRO_UIUX_HOOK;
  const r = spawnSync(process.execPath, [onEdit], {
    input: JSON.stringify({ cwd: root, tool_input: { file_path: join(root, rel) } }),
    encoding: "utf8", env: { ...base, ...env }, timeout: 60000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
export const ON = { MAESTRO_UIUX_HOOK: "on" };

export function victimIn(base) {
  const victim = join(base, "victim");
  put(victim, { "thesis.txt": "mine\n", "sub/keys.txt": "mine too\n" });
  return victim;
}
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((rel) => {
  const p = join(dir, rel);
  return lstatSync(p).isDirectory() ? `${rel}/` : `${rel}=${readFileSync(p, "utf8")}`;
});
export const victimIntact = (victim) => assert.deepEqual(snapshot(victim), ["sub/", "sub/keys.txt=mine too\n", "thesis.txt=mine\n"], "the outside folder is exactly as it was");

/** Run `run.mjs` with `args` from `cwd`; a hang is a failure, not a stuck suite. */
export function run(cwd, args, opts = {}) {
  const r = spawnSync(process.execPath, [runMjs, ...args], { cwd, encoding: "utf8", timeout: 20000, ...opts });
  return { code: r.status, out: r.stdout, err: r.stderr, signal: r.signal };
}
