#!/usr/bin/env node
// Installs the checks into a project: vendored copy, pre-commit hook, CI workflow, config skeleton.
//
//   node <skill>/checks/install.mjs [--yes] [--cwd <dir>]     (or: run.mjs install ...)
//
// Without --yes it prints the plan and writes nothing. Re-running is safe: files are only
// rewritten when their content differs, the config is never overwritten.
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VENDOR = ".viewsonic-ui/checks";
const HOOK = ".githooks/pre-commit";
const WORKFLOW = ".github/workflows/viewsonic-ui.yml";
const CONFIG = "viewsonic-ui.config.json";
const PLAYWRIGHT_HINT = "npm i -D @playwright/test && npx playwright install chromium";

export const CONFIG_SKELETON = { baseUrl: "http://localhost:3000", allowWords: [], allowSystemWords: [], properNouns: [], motionPhases: [], contrastPairs: [] };

/** The pre-commit hook. `rel` is the project folder relative to the git top level ("" when they are the same). */
export function hookScript(rel = "") {
  return `#!/bin/sh
# Installed by elattar-uiux-design. Runs the static UI checks before every commit.
cd "$(git rev-parse --show-toplevel)${rel ? `/${rel}` : ""}" || exit 1
node "${VENDOR}/run.mjs" fast --changed --cwd .
status=$?
# 2 = a check was skipped (for example Playwright is missing): reported above, never blocks.
if [ "$status" -ne 0 ] && [ "$status" -ne 2 ]; then
  echo "Commit blocked: the UI checks above found BAD items (exit $status). Fix them (each line says how) and commit again." >&2
  exit 1
fi
exit 0
`;
}
export const HOOK_SCRIPT = hookScript("");

/** Package manager of the project, from its lockfile. `lock` is null when there is none (then npm). */
export function detectPackageManager(...dirs) {
  const locks = [["pnpm", "pnpm-lock.yaml"], ["yarn", "yarn.lock"], ["bun", "bun.lockb"], ["bun", "bun.lock"], ["npm", "package-lock.json"], ["npm", "npm-shrinkwrap.json"]];
  for (const d of dirs) for (const [pm, lock] of locks) if (existsSync(join(d, lock))) return { pm, lock };
  return { pm: "npm", lock: null };
}

/** Single-quote a value for sh. */
const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

const PM = {
  npm: { exec: "npx", run: (c) => `npm run ${c}`, install: (lock) => (lock ? "npm ci" : "npm install"), cache: "npm" },
  pnpm: { exec: "pnpm exec", run: (c) => `pnpm run ${c}`, install: () => "pnpm install --frozen-lockfile", cache: "pnpm" },
  yarn: { exec: "yarn", run: (c) => `yarn ${c}`, install: () => "yarn install --frozen-lockfile", cache: "yarn" },
  bun: { exec: "bunx", run: (c) => `bun run ${c}`, install: () => "bun install --frozen-lockfile", cache: null },
};

/** The CI workflow. opts: { pm, lock, rel } from detectPackageManager and the project's folder inside the git repo. */
export function workflow(baseUrl, { pm = "npm", lock = null, rel = "" } = {}) {
  const m = PM[pm];
  const dir = rel ? rel + "/" : "";
  const setup = [];
  if (pm === "pnpm") setup.push("      - uses: pnpm/action-setup@v4  # uses the packageManager field of package.json; add `with: { version: <n> }` if it has none");
  if (pm === "bun") setup.push("      - uses: oven-sh/setup-bun@v2");
  const nodeWith = ["          node-version: 22"];
  if (m.cache && (lock || pm !== "npm")) {
    nodeWith.push(`          cache: ${m.cache}`);
    if (rel && lock) nodeWith.push(`          cache-dependency-path: ${dir}${lock}`);
  }
  const NL = String.fromCharCode(10);
  const setupSteps = setup.length ? setup.join(NL) + NL : "";
  return `# Installed by elattar-uiux-design. Runs every UI check, static and in the browser.
name: viewsonic-ui
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ui-checks:
    runs-on: ubuntu-latest${rel ? `
    defaults:
      run:
        working-directory: ${rel}` : ""}
    steps:
      - uses: actions/checkout@v4
${setupSteps}      - uses: actions/setup-node@v4
        with:
${nodeWith.join(NL)}
      - run: ${m.install(lock)}
      - run: ${m.exec} playwright install --with-deps chromium
      - name: Build and start the app
        run: |
          ${m.run("build")}
          ${m.run("start")} &
          for i in $(seq 1 60); do
            curl -sf ${shq(baseUrl)} > /dev/null && exit 0
            sleep 2
          done
          echo ${shq(`app did not start at ${baseUrl}`)} >&2
          exit 1
      - run: node ${VENDOR}/run.mjs full --all --all-routes
`;
}

const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const readIf = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function hasPlaywright(root) {
  const req = createRequire(join(root, "package.json"));
  return ["@playwright/test", "playwright"].some((id) => { try { req.resolve(id); return true; } catch { return false; } });
}

function listFiles(dir, base = "") {
  return readdirSync(dir).flatMap((n) => {
    const rel = base ? `${base}/${n}` : n;
    if (!base && n === "test") return [];
    return statSync(join(dir, n)).isDirectory() ? listFiles(join(dir, n), rel) : [rel];
  });
}

// maestro patch (not upstream): never write through a symbolic link. A repository can commit
// any install target (`.viewsonic-ui/checks` above all) as a link to a folder outside the
// project, and following it would overwrite files there and delete the rest. These return
// the first link found, or null.
function linkOnPath(base, rel) {
  let p = base;
  for (const part of rel.split("/")) {
    if (!part) continue;
    p = join(p, part);
    let st;
    try { st = lstatSync(p); } catch { return null; } // missing: nothing below it exists yet
    if (st.isSymbolicLink()) return p;
  }
  return null;
}
function linkUnder(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) return p;
    if (e.isDirectory()) { const found = linkUnder(p); if (found) return found; }
  }
  return null;
}

/** Writes `content` unless the file already holds it. Returns "written" | "unchanged". */
function putFile(path, content) {
  if (readIf(path) === content) return "unchanged";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return "written";
}

const ESLINT_FILES = ["eslint.config.mjs", "eslint.config.js", "eslint.config.ts", "eslint.config.mts"];
const ESLINT_IMPORT = `import viewsonicVariants from "./${VENDOR}/eslint/viewsonic-variants.mjs";`;
const ESLINT_RULE = `{ plugins: { viewsonic: viewsonicVariants }, rules: { "viewsonic/valid-variant": "error" } },`;
const ESLINT_IGNORE_DIR = ".viewsonic-ui/**"; // the vendored checks and the shots are not the project's source
const ESLINT_IGNORE = `{ ignores: ["${ESLINT_IGNORE_DIR}"] },`;

/** Index of the `]` that closes the array whose `[` is at `open`; strings, templates and comments are skipped. */
function closeBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) return -1;
      i++;
    } else if (c === "[" || c === "(" || c === "{") depth++;
    else if (c === "]" || c === ")" || c === "}") { if (--depth === 0) return c === "]" ? i : -1; }
  }
  return -1;
}

/**
 * Wire the variant rule into the project's flat ESLint config. Returns { file, state, text? }, state being
 * "none" (no config), "unchanged" (already wired), "unrecognised" (shape not understood) or "update" (text is the new content).
 */
export function wireEslint(root) {
  const file = ESLINT_FILES.find((f) => existsSync(join(root, f)));
  if (!file) return { file: null, state: "none" };
  const text = readFileSync(join(root, file), "utf8");
  const needRule = !text.includes("viewsonic-variants.mjs");
  const needIgnore = !text.includes(ESLINT_IGNORE_DIR);
  if (!needRule && !needIgnore) return { file, state: "unchanged" };
  let open = -1;
  const direct = /export\s+default\s+(?:[\w.]+\s*\(\s*)?\[/.exec(text);
  if (direct) open = direct.index + direct[0].length - 1;
  else {
    const named = /export\s+default\s+([\w$]+)\s*;?/.exec(text);
    const decl = named && new RegExp(String.raw`(?:const|let|var)\s+` + named[1].replace(/\$/g, "[$]") + String.raw`\s*=\s*(?:[\w.]+\s*\(\s*)?\[`).exec(text);
    if (decl) open = decl.index + decl[0].length - 1;
  }
  const close = open < 0 ? -1 : closeBracket(text, open);
  if (close < 0) return { file, state: "unrecognised" };
  const before = text.slice(0, close).replace(/\s+$/, "");
  const comma = before.endsWith(",") || before.endsWith("[") ? "" : ",";
  const entries = [needIgnore && ESLINT_IGNORE, needRule && ESLINT_RULE].filter(Boolean).join("\n  ");
  let next = `${before}${comma}\n  ${entries}\n${text.slice(close)}`;
  if (!needRule) return { file, state: "update", text: next };
  const imports = [...next.matchAll(/^import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm)];
  const last = imports.at(-1);
  next = last ? `${next.slice(0, last.index + last[0].length)}\n${ESLINT_IMPORT}${next.slice(last.index + last[0].length)}` : `${ESLINT_IMPORT}\n${next}`;
  return { file, state: "update", text: next };
}

const toPosix = (p) => p.split(sep).join("/");

/**
 * A hook setup that `core.hooksPath=<ours>` would switch off. Returns null when there is none, else
 * { why, howto: [lines] }: what is there and how to add our command to it instead.
 */
export function existingHookManager({ root, top, hooksPath, wantedHooksPath, hookRel }) {
  const call = `sh ${hookRel}`;
  const has = (...names) => [root, top].some((d) => names.some((n) => existsSync(join(d, n))));
  if (has(".husky")) return { why: "husky is set up", howto: [`Add this line to .husky/pre-commit:  ${call}`] };
  if (has("lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml")) {
    return { why: "lefthook is set up", howto: ["Add this under pre-commit in your lefthook.yml, then run: npx lefthook install", "  pre-commit:", "    commands:", "      viewsonic-ui:", `        run: ${call}`] };
  }
  if (has(".pre-commit-config.yaml")) {
    return { why: "the pre-commit framework is set up", howto: ["Add this local hook to .pre-commit-config.yaml:", "  - repo: local", "    hooks:", "      - id: viewsonic-ui", "        name: viewsonic-ui", `        entry: ${call}`, "        language: system", "        pass_filenames: false"] };
  }
  for (const d of [root, top]) {
    try {
      const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf8"));
      if (pkg["simple-git-hooks"] || pkg.devDependencies?.["simple-git-hooks"] || pkg.dependencies?.["simple-git-hooks"]) {
        return { why: "simple-git-hooks is set up", howto: [`Append  && ${call}  to the "pre-commit" command under "simple-git-hooks" in package.json, then run: npx simple-git-hooks`] };
      }
    } catch { /* no package.json */ }
  }
  if (hooksPath && hooksPath !== wantedHooksPath) {
    return { why: `core.hooksPath is ${hooksPath}`, howto: [`Call it from the pre-commit hook in ${hooksPath}:  ${call}`, `Or switch to ours:  git config core.hooksPath ${wantedHooksPath}  (git then stops running the hooks in ${hooksPath})`] };
  }
  if (!hooksPath) {
    const g = spawnSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf8" }).stdout.trim();
    const dir = g ? resolve(root, g) : null;
    if (dir && existsSync(dir)) {
      const own = readdirSync(dir).filter((n) => !n.endsWith(".sample"));
      if (own.length) {
        return { why: `.git/hooks already has ${own.join(", ")}`, howto: [`Call ours from .git/hooks/pre-commit (create it if only other hooks exist):  ${call}`, `Or switch to ours:  git config core.hooksPath ${wantedHooksPath}  (git then stops running ${own.join(", ")})`] };
      }
    }
  }
  return null;
}

export function install({ cwd = process.cwd(), yes = false } = {}) {
  const out = [];
  const log = (l = "") => out.push(l);
  const root = resolve(cwd);
  const configPath = join(root, CONFIG);
  const existingConfig = existsSync(configPath);
  let baseUrl = CONFIG_SKELETON.baseUrl;
  if (existingConfig) { try { baseUrl = JSON.parse(readFileSync(configPath, "utf8")).baseUrl ?? baseUrl; } catch { /* keep default */ } }

  const isRepo = git(root, "rev-parse", "--git-dir").status === 0;
  // The project may sit below the git top level (monorepo): hooks and workflows are the top level's, the checks run in the project.
  const top = isRepo ? resolve(git(root, "rev-parse", "--show-toplevel").stdout.trim() || root) : root;
  // git prints the real path (macOS: /var is /private/var), so compare real paths.
  const rel = isRepo ? toPosix(relative(realpathSync(top), realpathSync(root))) : "";
  const hookRel = posix.join(rel, HOOK); // the hook, as seen from the git top level
  const wantedHooksPath = posix.join(rel, ".githooks");
  const hooksPath = isRepo ? git(root, "config", "--get", "core.hooksPath").stdout.trim() : "";
  const manager = isRepo ? existingHookManager({ root, top, hooksPath, wantedHooksPath, hookRel }) : null;
  const hooksBlocked = manager?.why ?? null;
  const { pm, lock } = detectPackageManager(root, top);

  const eslint = wireEslint(root);

  // maestro patch: refuse before planning or writing anything (see linkOnPath).
  const targets = [[root, VENDOR], [root, HOOK], [root, ".gitattributes"], [root, CONFIG], [top, WORKFLOW]];
  if (eslint.file) targets.push([root, eslint.file]);
  const link = targets.map(([base, target]) => linkOnPath(base, target)).find(Boolean) ?? linkUnder(join(root, VENDOR));
  if (link) {
    log(`Refusing to install: ${link} is a symbolic link, so writing there could change files outside this project. Replace it with a real folder or file, then run setup again.`);
    return { lines: out, exitCode: 1 };
  }

  if (!yes) {
    log(`Plan for ${root} (nothing is written until you re-run with --yes):`);
    log(`  copy   ${VENDOR}/  the checks, without their tests; refreshed on every install`);
    log(`  write  .gitattributes  line "${HOOK} text eol=lf" (appended if missing)`);
    log(`  write  ${HOOK}  runs "${VENDOR}/run.mjs fast --changed"; blocks the commit on BAD`);
    log(hooksBlocked ? `  skip   git config core.hooksPath ${wantedHooksPath}  (${hooksBlocked}; instructions are printed instead)` : `  run    git config core.hooksPath ${wantedHooksPath}`);
    if (eslint.state === "update") log(`  write  ${eslint.file}  add the viewsonic/valid-variant rule (an unknown variant value such as Button size="md" becomes a lint error)`);
    else if (eslint.state === "unchanged") log(`  keep   ${eslint.file}  (viewsonic/valid-variant is already wired)`);
    else if (eslint.state === "unrecognised") log(`  skip   ${eslint.file}  (its shape is not recognised; instructions are printed instead)`);
    else log("  note   no eslint.config.* found; instructions for viewsonic/valid-variant are printed instead");
    log(`  write  ${posix.join(rel, WORKFLOW)}  (${pm}${lock ? "" : ", no lockfile"}) push to main and pull requests: build, start, "${VENDOR}/run.mjs full --all --all-routes"`);
    log(existingConfig ? `  keep   ${CONFIG}  (exists, never overwritten)` : `  write  ${CONFIG}  skeleton: ${JSON.stringify(CONFIG_SKELETON)}`);
    if (!hasPlaywright(root)) log(`  note   Playwright is not installed; you will need: ${PLAYWRIGHT_HINT}`);
    log("Re-run with --yes to apply.");
    return { lines: out, exitCode: 0 };
  }

  const summary = [];
  const vendorDir = join(root, VENDOR);
  // Refresh the vendored copy: copy what differs, drop files an older copy had that no longer exist.
  const files = listFiles(here);
  let changed = 0;
  for (const f of files) {
    const dest = join(vendorDir, f);
    if (existsSync(dest) && readFileSync(dest).equals(readFileSync(join(here, f)))) continue;
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(here, f), dest);
    changed++;
  }
  if (existsSync(vendorDir)) {
    for (const f of listFiles(vendorDir)) if (!files.includes(f)) { rmSync(join(vendorDir, f)); changed++; }
  }
  summary.push(`${changed ? "refreshed" : "unchanged"} ${VENDOR}/ (${files.length} files${changed ? `, ${changed} changed` : ""})`);

  summary.push(`${putFile(join(root, HOOK), hookScript(rel))} ${HOOK}`);
  try { chmodSync(join(root, HOOK), 0o755); } catch { /* best effort */ }
  // Only if the hook is already tracked: record the executable bit. New files are never staged.
  if (isRepo && git(root, "ls-files", "--error-unmatch", HOOK).status === 0) git(root, "update-index", "--chmod=+x", HOOK);

  const attrs = join(root, ".gitattributes");
  const attrLine = `${HOOK} text eol=lf`;
  const attrText = readIf(attrs);
  if (attrText === null) { writeFileSync(attrs, attrLine + "\n"); summary.push("written .gitattributes (hook keeps LF endings)"); }
  else if (!attrText.split(/\r?\n/).includes(attrLine)) {
    writeFileSync(attrs, attrText + (attrText === "" || attrText.endsWith("\n") ? "" : "\n") + attrLine + "\n");
    summary.push("appended hook LF rule to .gitattributes");
  } else summary.push("unchanged .gitattributes");

  if (hooksBlocked) {
    summary.push(`skipped git config core.hooksPath (${hooksBlocked})`);
    log(`The hook was written to ${HOOK} but git will not run it, because ${hooksBlocked}. Nothing of yours was changed.`);
    for (const l of manager.howto) log(`  ${l}`);
  } else if (!isRepo) {
    summary.push(`skipped git config core.hooksPath (not a git repository; run git init, then: git config core.hooksPath ${wantedHooksPath})`);
  } else if (hooksPath === wantedHooksPath) {
    summary.push("unchanged git config core.hooksPath");
  } else {
    git(root, "config", "core.hooksPath", wantedHooksPath);
    summary.push(`set git config core.hooksPath ${wantedHooksPath}`);
  }

  // GitHub only reads workflows at the repository's top level.
  const wfPath = join(top, WORKFLOW);
  summary.push(`${putFile(wfPath, workflow(baseUrl, { pm, lock, rel }))} ${posix.join(rel, WORKFLOW) === WORKFLOW ? WORKFLOW : WORKFLOW + " (at the git top level)"}`);

  if (eslint.state === "update") {
    writeFileSync(join(root, eslint.file), eslint.text);
    summary.push(`updated ${eslint.file} (viewsonic/valid-variant)`);
  } else if (eslint.state === "unchanged") summary.push(`unchanged ${eslint.file}`);
  else {
    summary.push(eslint.state === "none" ? "skipped eslint (no eslint.config.* found)" : `skipped ${eslint.file} (shape not recognised)`);
    log("To make an unknown variant value (Button size=\"md\") a lint error, add to your flat ESLint config:");
    log(`  ${ESLINT_IMPORT}`);
    log(`  ${ESLINT_IGNORE}`);
    log(`  ${ESLINT_RULE}   // both inside the exported array`);
  }

  if (existingConfig) summary.push(`kept ${CONFIG} (exists)`);
  else {
    writeFileSync(configPath, JSON.stringify(CONFIG_SKELETON, null, 2) + "\n");
    summary.push(`written ${CONFIG}`);
  }

  if (!hasPlaywright(root)) {
    log("Playwright is not installed in this project, so the browser checks will be skipped. Install it with:");
    log(`  ${PLAYWRIGHT_HINT}`);
  }
  log("Summary:");
  for (const s of summary) log(`  ${s}`);
  return { lines: out, exitCode: 0 };
}

export function main(argv) {
  let cwd = process.cwd();
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--yes") yes = true;
    else if (argv[i] === "--cwd") cwd = resolve(argv[++i] ?? ".");
    else { console.error(`unknown argument ${argv[i]}\nusage: install [--yes] [--cwd <dir>]`); return 64; }
  }
  const { lines, exitCode } = install({ cwd, yes });
  for (const l of lines) console.log(l);
  return exitCode;
}

// Real paths on both sides: on macOS a script under /var runs as /private/var.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
