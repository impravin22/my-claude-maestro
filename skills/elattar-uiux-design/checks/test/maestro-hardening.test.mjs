// Tests for maestro's hardening of the vendored checks (not upstream): the findings v1.19.0 deferred to upstream and
// fixed in v1.20.0. Each case builds a hostile repository and proves the fix holds; most would fail on the code before
// it. Listed in docs/2026-10-15-viewsonic-uiux-bundle.md; keep this file when syncing from upstream.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  baseUrlProblem, cacheDir, isInside, MAX_FILE_BYTES, MAX_WALK_FILES, replaceFile, routeProblem, walkFiles,
} from "../maestro-guards.mjs";
import { loadVariants, uiDirFor } from "../variants.mjs";
import { loadPropTable } from "../props.mjs";
import { loadConfig } from "../config.mjs";
import { reachable, withPages } from "../browser/lib.mjs";
import { shots } from "../browser/shots.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checks = resolve(here, "..");
const runMjs = join(checks, "run.mjs");
const onEdit = join(checks, "eslint", "on-edit.mjs");
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const scratch = (name = "maestro-harden-") => { const d = mkdtempSync(join(tmpdir(), name)); dirs.push(d); return d; };
const put = (base, files) => {
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), text); }
};
const BUTTON = `import { cva } from "class-variance-authority";
const buttonStyles = cva("x", { variants: { size: { sm: "", lg: "" } } });
export function Button(props) { return <button className={buttonStyles(props)} {...props} />; }
`;
const HEAD = `import { Button } from "@/components/ui/button";\n`;
/** A shadcn-shaped project with a cva Button, inside `base`. */
function uiProject(base, extra = {}) {
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
// The edited file is written first, then the hook gets its path, as Claude Code sends it after an Edit.
function edit(root, rel, text, env = {}) {
  if (text !== null) put(root, { [rel]: text });
  const r = spawnSync(process.execPath, [onEdit], {
    input: JSON.stringify({ cwd: root, tool_input: { file_path: join(root, rel) } }),
    encoding: "utf8", env: { ...process.env, NODE_PATH: "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const ON = { MAESTRO_UIUX_HOOK: "on" };
// A folder outside the project, standing in for the user's own files; any write, delete or new file shows.
function victimIn(base) {
  const victim = join(base, "victim");
  put(victim, { "thesis.txt": "mine\n", "sub/keys.txt": "mine too\n" });
  return victim;
}
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((rel) => {
  const p = join(dir, rel);
  return lstatSync(p).isDirectory() ? `${rel}/` : `${rel}=${readFileSync(p, "utf8")}`;
});
const victimIntact = (victim) => assert.deepEqual(snapshot(victim), ["sub/", "sub/keys.txt=mine too\n", "thesis.txt=mine\n"], "the outside folder is exactly as it was");

describe("guards: unit", () => {
  test("isInside: inside, outside, and a link that leads out", () => {
    const d = scratch();
    put(d, { "repo/a/x.txt": "", "out/y.txt": "" });
    symlinkSync(join(d, "out"), join(d, "repo", "exit"));
    assert.equal(isInside(join(d, "repo"), "a/x.txt"), true);
    assert.equal(isInside(join(d, "repo"), "a/not-yet/z.txt"), true, "a path that does not exist yet is judged by what does");
    assert.equal(isInside(join(d, "repo"), "../out/y.txt"), false);
    assert.equal(isInside(join(d, "repo"), "exit/y.txt"), false, "a link out is outside once resolved");
    assert.equal(isInside(join(d, "repo"), "exit/new/z.txt"), false, "even below a link, for a path that does not exist yet");
    assert.equal(isInside(join(d, "repo"), "..foo"), true, "a name that starts with two dots is not the parent");
  });

  test("baseUrlProblem: http and https URLs only; no line break, expression or credentials", () => {
    for (const ok of ["http://localhost:3000", "https://staging.example.com/app", "http://localhost:3000/a b;echo hi", "http://127.0.0.1:1/x?y='z'"]) assert.equal(baseUrlProblem(ok), null, ok);
    for (const bad of ["http://localhost:3000\n      - run: echo injected-step", "http://x/${{ github.event.pull_request.title }}", "javascript:void(0)", "file:///tmp/x", "http://u:p@localhost:3000", "localhost:3000", "http://x/ ", "", 42]) {
      assert.notEqual(baseUrlProblem(bad), null, JSON.stringify(bad));
    }
  });

  test("routeProblem: a single leading slash, printable, no backslash", () => {
    for (const ok of ["/", "/settings?state=empty", "/a#b", "/@scope/page"]) assert.equal(routeProblem(ok), null, ok);
    for (const bad of ["@evil.example/x", "//evil.example/x", "settings", "/a b", "/a\nb", "/a\\b", 7]) assert.notEqual(routeProblem(bad), null, JSON.stringify(bad));
  });

  test("walkFiles skips links, oversized files and node_modules, survives a dangling link, and stops at the cap", () => {
    const d = scratch();
    put(d, { "ui/a.tsx": "a", "ui/node_modules/n.tsx": "n", "ui/.hidden/h.tsx": "h", "out/secret.tsx": "s" });
    writeFileSync(join(d, "ui", "big.tsx"), "x".repeat(MAX_FILE_BYTES + 1));
    symlinkSync(join(d, "out"), join(d, "ui", "linked"));
    symlinkSync(join(d, "out", "secret.tsx"), join(d, "ui", "file-link.tsx"));
    symlinkSync(join(d, "nowhere"), join(d, "ui", "dangling.tsx"));
    assert.deepEqual(walkFiles(join(d, "ui"), /\.tsx$/).map((f) => f.slice(d.length + 1)), ["ui/a.tsx"]);
    const many = join(d, "many");
    mkdirSync(many);
    for (let i = 0; i <= MAX_WALK_FILES; i++) writeFileSync(join(many, `f${String(i).padStart(5, "0")}.tsx`), "");
    assert.equal(walkFiles(many, /\.tsx$/).length, MAX_WALK_FILES);
  });

  test("replaceFile writes a new file instead of through a link or hard link, and keeps an existing file's mode", () => {
    const d = scratch();
    const victim = victimIn(d);
    symlinkSync(join(victim, "thesis.txt"), join(d, "soft.txt"));
    linkSync(join(victim, "sub", "keys.txt"), join(d, "hard.txt"));
    replaceFile(join(d, "soft.txt"), "new\n");
    replaceFile(join(d, "hard.txt"), "new\n");
    victimIntact(victim);
    assert.equal(lstatSync(join(d, "soft.txt")).isSymbolicLink(), false);
    assert.equal(readFileSync(join(d, "hard.txt"), "utf8"), "new\n");
    writeFileSync(join(d, "own.txt"), "a");
    chmodSync(join(d, "own.txt"), 0o600);
    replaceFile(join(d, "own.txt"), "b");
    assert.equal(statSync(join(d, "own.txt")).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(d).filter((n) => n.endsWith(".tmp")), [], "no temporary file is left behind");
  });
});

describe("M3: the ui folder stays inside the repository", () => {
  test("a config uiDir, an alias or a link that leads out is ignored; one inside is kept", () => {
    const d = scratch();
    const root = uiProject(d, { "src/ui/x.tsx": "" });
    put(d, { "outside/button.tsx": BUTTON });
    const config = (uiDir) => writeFileSync(join(root, "viewsonic-ui.config.json"), JSON.stringify({ uiDir }));
    config("../outside");
    assert.equal(uiDirFor(root), "components/ui");
    symlinkSync(join(d, "outside"), join(root, "linked-ui"));
    config("linked-ui");
    assert.equal(uiDirFor(root), "components/ui", "a link out of the project is outside");
    config("src/ui");
    assert.equal(uiDirFor(root), "src/ui");
    rmSync(join(root, "viewsonic-ui.config.json"));
    writeFileSync(join(root, "components.json"), JSON.stringify({ aliases: { ui: "@/../outside" } }));
    assert.equal(uiDirFor(root), "components/ui");
  });

  test("in a git repository the boundary is its top level, so a monorepo's shared ui folder still counts", () => {
    const d = scratch();
    mkdirSync(join(d, ".git"));
    const app = join(d, "apps", "web");
    put(app, { "package.json": "{}", "components.json": "{}", "viewsonic-ui.config.json": JSON.stringify({ uiDir: "../../packages/ui/components" }) });
    put(d, { "packages/ui/components/button.tsx": BUTTON });
    assert.equal(uiDirFor(app), "../../packages/ui/components");
  });

  test("the after-edit check never reads a ui folder outside the project", () => {
    const d = scratch();
    const root = uiProject(d);
    rmSync(join(root, "components", "ui"), { recursive: true });
    put(d, { "outside/button.tsx": BUTTON.replace("sm:", "LEAKED_FROM_OUTSIDE:") });
    writeFileSync(join(root, "viewsonic-ui.config.json"), JSON.stringify({ uiDir: "../outside" }));
    const r = edit(root, "app/a.tsx", `import { Button } from "../../outside/button";\nexport const A = () => <Button size="md" />;\n`, ON);
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(r.err, /LEAKED_FROM_OUTSIDE/);
  });

  test("a dangling link in the ui folder no longer switches the check off", () => {
    const d = scratch();
    const root = uiProject(d);
    symlinkSync(join(d, "nowhere"), join(root, "components", "ui", "gone.tsx"));
    assert.deepEqual([...loadVariants(root).keys()], ["Button"]);
    const r = edit(root, "app/a.tsx", HEAD + `export const A = () => <Button size="md" />;\n`, ON);
    assert.equal(r.code, 2, r.err);
  });

  test("an edited file over 1 MiB is skipped, not parsed", () => {
    const root = uiProject(scratch());
    const r = edit(root, "app/big.tsx", HEAD + `export const A = () => <Button size="md" />;\n// ${"x".repeat(MAX_FILE_BYTES)}\n`, ON);
    assert.equal(r.code, 0, r.err);
  });
});

describe("M4: the cache and the notice marker live in the user's private cache folder", () => {
  const withCache = (fn) => {
    const xdg = scratch("maestro-xdg-");
    const was = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = xdg;
    try { return fn(join(xdg, "maestro-uiux")); } finally { if (was === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = was; }
  };
  const fakeTs = { version: "maestro-test" }; // an empty ui folder needs no compiler: the table is {}
  const cacheName = (root) => `viewsonic-props-${createHash("sha1").update(root).digest("hex").slice(0, 12)}.json`;

  test("the prop table is cached in a 0700 folder, mode 0600, and never in the OS temp folder", () => withCache((dir) => {
    const root = join(scratch(), "p");
    put(root, { "package.json": "{}", "components/ui/.keep": "" });
    rmSync(join(tmpdir(), cacheName(root)), { force: true });
    assert.deepEqual(loadPropTable(root, "components/ui", fakeTs), {});
    assert.equal(statSync(join(dir, cacheName(root))).mode & 0o777, 0o600);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(existsSync(join(tmpdir(), cacheName(root))), false);
  }));

  test("a link planted at the cache name is replaced, never written through", () => withCache((dir) => {
    const base = scratch();
    const victim = victimIn(base);
    const root = join(base, "p");
    put(root, { "package.json": "{}", "components/ui/.keep": "" });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    symlinkSync(join(victim, "thesis.txt"), join(dir, cacheName(root)));
    loadPropTable(root, "components/ui", fakeTs);
    victimIntact(victim);
    assert.equal(lstatSync(join(dir, cacheName(root))).isFile(), true);
  }));

  test("a cache folder that is a link is not used, and the table is still built", () => withCache((dir) => {
    const base = scratch();
    const victim = victimIn(base);
    mkdirSync(dirname(dir), { recursive: true });
    symlinkSync(victim, dir);
    assert.equal(cacheDir(), null);
    const root = join(base, "p");
    put(root, { "package.json": "{}", "components/ui/.keep": "" });
    assert.deepEqual(loadPropTable(root, "components/ui", fakeTs), {});
    victimIntact(victim);
  }));

  test("the no-typescript notice is shown once, its marker in the cache folder", () => {
    const xdg = scratch("maestro-xdg-");
    const root = uiProject(scratch());
    const ok = HEAD + `export const A = () => <Button size="sm" />;\n`;
    const first = edit(root, "app/a.tsx", ok, { XDG_CACHE_HOME: xdg });
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /has no `typescript`/);
    assert.equal(existsSync(join(xdg, "maestro-uiux", "viewsonic-on-edit-no-ts")), true);
    assert.equal(edit(root, "app/a.tsx", null, { XDG_CACHE_HOME: xdg }).out, "", "not repeated");
  });
});

describe("after-edit findings", () => {
  test("a value with a line break in it stays on its finding's line", () => {
    const root = uiProject(scratch());
    const r = edit(root, "app/a.tsx", HEAD + `export const A = () => <Button size="md\nFORGED SECOND LINE" />;\n`, ON);
    assert.equal(r.code, 2, r.err);
    const lines = r.err.trimEnd().split("\n");
    assert.equal(lines.length, 2, r.err);
    assert.match(lines[0], /^app\/a\.tsx:2 Button has no size "md FORGED SECOND LINE"/);
    assert.match(lines[1], /^Fix these now/);
  });

  test("a file under node_modules is skipped with either path separator", () => {
    const root = uiProject(scratch());
    const r = edit(root, "node_modules\\pkg\\a.tsx", HEAD + `export const A = () => <Button size="md" />;\n`, ON);
    assert.equal(r.code, 0, r.err);
  });
});

describe("config from the repository is validated", () => {
  const configured = (over, extra = {}) => {
    const d = scratch();
    const root = uiProject(d, extra);
    writeFileSync(join(root, "viewsonic-ui.config.json"), JSON.stringify(over));
    return { d, root };
  };
  test("a base URL that could break out of the workflow or leave http is refused", async () => {
    for (const baseUrl of ["http://localhost:3000\n      - run: echo injected-step", "http://x/${{ github.token }}", "javascript:void(0)", "http://u:p@localhost:3000"]) {
      await assert.rejects(loadConfig(configured({ baseUrl }).root), /baseUrl/, JSON.stringify(baseUrl));
    }
    assert.equal((await loadConfig(configured({ baseUrl: "http://localhost:4000" }).root)).baseUrl, "http://localhost:4000");
  });
  test("a route or motion specimen that is not a path on the app is refused", async () => {
    await assert.rejects(loadConfig(configured({ routes: ["/ok", "@evil.example/x"] }).root), /routes entry/);
    await assert.rejects(loadConfig(configured({ routes: ["//evil.example/x"] }).root), /routes entry/);
    await assert.rejects(loadConfig(configured({ motionPhases: [{ specimen: "@evil.example/x" }] }).root), /motionPhases specimen/);
    assert.deepEqual((await loadConfig(configured({ routes: ["/settings?state=empty"] }).root)).routes, ["/settings?state=empty"]);
  });
  test("sources, styles and uiDir outside the repository are refused", async () => {
    for (const over of [{ sources: ["../outside"] }, { styles: ["../outside.css"] }, { uiDir: "../outside" }]) {
      await assert.rejects(loadConfig(configured(over).root), /outside the repository/, JSON.stringify(over));
    }
  });
  test("an @import that leads out of the repository is not read; one inside is", async () => {
    const d = scratch();
    put(d, { "outside/evil.css": ":root { --stolen: 1px; }\n" });
    const root = uiProject(d, { "app/globals.css": `@import "./tokens.css";\n@import "../../outside/evil.css";\n`, "app/tokens.css": ":root{}\n" });
    assert.deepEqual((await loadConfig(root)).styles, ["app/globals.css", "app/tokens.css"]);
  });
  test("run.mjs refuses a --route that is not a path", () => {
    const root = uiProject(scratch());
    const r = spawnSync(process.execPath, [runMjs, "layout-shift", "--route", "@evil.example/x", "--cwd", root], { encoding: "utf8" });
    assert.equal(r.status, 64, r.stdout + r.stderr);
    assert.match(r.stderr, /--route "@evil\.example\/x" must start with a single \//);
  });
});

describe("browser checks only run against a local app", () => {
  test("a base that is not local is refused before anything is fetched or launched, unless allowRemote", async () => {
    let called = false;
    const config = { root: scratch(), baseUrl: "https://staging.example.com" };
    const refused = await withPages(config, {}, async () => { called = true; });
    assert.match(refused.skipped, /not a local app.*--allow-remote/);
    const allowed = await withPages(config, { allowRemote: true, base: "http://127.0.0.1:9" }, async () => { called = true; return {}; });
    assert.doesNotMatch(allowed.skipped ?? "", /not a local app/);
    assert.equal(called, false);
  });

  test("the reachability probe does not follow a redirect", async () => {
    let hits = 0;
    const target = createServer((_q, s) => { hits++; s.end("ok"); });
    await new Promise((r) => target.listen(0, "127.0.0.1", r));
    const hop = createServer((_q, s) => { s.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/` }); s.end(); });
    await new Promise((r) => hop.listen(0, "127.0.0.1", r));
    try {
      assert.equal(await reachable(`http://127.0.0.1:${hop.address().port}/`), true);
      assert.equal(hits, 0);
    } finally {
      hop.close();
      target.close();
    }
  });

  test("shots: the default folder ignores itself, and a committed link there is refused", async () => {
    const d = scratch();
    const root = uiProject(d);
    await shots({ root, baseUrl: "http://127.0.0.1:9" }, { routes: ["/"], base: "http://127.0.0.1:9" });
    assert.equal(readFileSync(join(root, ".viewsonic-ui", "shots", ".gitignore"), "utf8"), "*\n");
    const other = uiProject(join(d, "second"));
    const victim = victimIn(d);
    symlinkSync(victim, join(other, ".viewsonic-ui"));
    const r = await shots({ root: other, baseUrl: "http://127.0.0.1:9" }, { routes: ["/"], base: "http://127.0.0.1:9" });
    assert.match(r.skipped, /symbolic link/);
    victimIntact(victim);
  });
});

describe("installer: inputs and residual paths", () => {
  function sandbox() {
    const d = scratch("maestro-install-");
    const project = join(d, "project");
    cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: project });
    return { d, project, victim: victimIn(d) };
  }
  const install = (cwd, args = [], opts = {}) => {
    const r = spawnSync(process.execPath, [runMjs, "install", ...args], { cwd, encoding: "utf8", timeout: 20000, ...opts });
    return { code: r.status, out: r.stdout, err: r.stderr, signal: r.signal };
  };
  const workflowAt = (top) => join(top, ".github", "workflows", "viewsonic-ui.yml");

  test("a base URL with a line break or an Actions expression is refused, and no workflow is written", () => {
    for (const baseUrl of ["http://localhost:3000'\n      - run: echo injected-step\n#", "http://localhost:3000/${{ github.event.pull_request.title }}"]) {
      const { project } = sandbox();
      writeFileSync(join(project, "viewsonic-ui.config.json"), JSON.stringify({ baseUrl }));
      const r = install(project, ["--yes", "--cwd", project]);
      assert.equal(r.code, 1, r.out + r.err);
      assert.match(r.out, /Refusing to install: baseUrl in viewsonic-ui\.config\.json/);
      assert.equal(existsSync(workflowAt(project)), false);
    }
  });

  test("a monorepo folder whose name would run in the hook is refused", () => {
    const d = scratch("maestro-install-");
    spawnSync("git", ["init", "-q"], { cwd: d });
    const project = join(d, "a$(touch pwned)");
    cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
    const r = install(project, ["--yes", "--cwd", project]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /holds characters the generated hook and workflow cannot carry safely/);
    assert.equal(existsSync(join(project, ".githooks", "pre-commit")), false);
  });

  test("the workflow reads the repository only, and the plan names where it really goes", () => {
    const d = scratch("maestro-install-");
    spawnSync("git", ["init", "-q"], { cwd: d });
    const project = join(d, "apps", "web");
    cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
    const plan = install(project, ["--cwd", project]);
    assert.match(plan.out, /write {2}\.github\/workflows\/viewsonic-ui\.yml \(at the git top level\)/);
    assert.doesNotMatch(plan.out, /apps\/web\/\.github/);
    assert.equal(install(project, ["--yes", "--cwd", project]).code, 0);
    assert.match(readFileSync(workflowAt(d), "utf8"), /\npermissions:\n {2}contents: read\njobs:/);
  });

  test("a project folder reached through a committed link out of the repository is refused, by --cwd or by $PWD", () => {
    const d = scratch("maestro-install-");
    const repo = join(d, "repo");
    mkdirSync(join(repo, "packages"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: repo });
    const victim = victimIn(d); // beside the repository, not in it
    symlinkSync(victim, join(repo, "packages", "web"));
    const logical = join(repo, "packages", "web");
    const byFlag = install(repo, ["--yes", "--cwd", logical]);
    assert.equal(byFlag.code, 1, byFlag.out + byFlag.err);
    assert.match(byFlag.out, /leads through a symbolic link/);
    const byPwd = install(logical, ["--yes"], { env: { ...process.env, PWD: logical } });
    assert.equal(byPwd.code, 1, byPwd.out + byPwd.err);
    assert.match(byPwd.out, /leads through a symbolic link/);
    victimIntact(victim);
  });

  test(".viewsonic-ui as a plain file is refused with a message, not a stack trace", () => {
    const { project } = sandbox();
    writeFileSync(join(project, ".viewsonic-ui"), "not a folder\n");
    const r = install(project, ["--yes", "--cwd", project]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /Refusing to install: .*\.viewsonic-ui is not a folder/);
    assert.doesNotMatch(r.err, /\n\s+at /);
  });

  test("a FIFO where the config or package.json should be is refused at once, not read", () => {
    for (const name of ["viewsonic-ui.config.json", "package.json"]) {
      const { project } = sandbox();
      rmSync(join(project, name), { force: true });
      assert.equal(spawnSync("mkfifo", [join(project, name)]).status, 0, "mkfifo");
      const r = install(project, ["--cwd", project]);
      assert.equal(r.signal, null, `the dry run hung on the ${name} FIFO`);
      assert.equal(r.code, 1, r.out + r.err);
      assert.match(r.out, /is not a regular file/);
    }
  });

  test("a hard link at .gitattributes loses only its name; the file it shared is untouched", () => {
    const { project, victim } = sandbox();
    linkSync(join(victim, "thesis.txt"), join(project, ".gitattributes"));
    assert.equal(install(project, ["--yes", "--cwd", project]).code, 0);
    victimIntact(victim);
    assert.match(readFileSync(join(project, ".gitattributes"), "utf8"), /^mine\n\.githooks\/pre-commit text eol=lf\n$/);
  });
});
