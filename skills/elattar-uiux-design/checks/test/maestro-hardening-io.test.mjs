// Tests for maestro's hardening of the vendored checks (not upstream), part 2: the browser checks, screenshots and the
// installer. Part 1 is maestro-hardening.test.mjs. Screenshots are taken through a stub Playwright planted in the
// project, so the writes run without a browser. Keep these files and maestro-helpers.mjs when syncing from upstream.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { reachable, withPages } from "../browser/lib.mjs";
import { shots } from "../browser/shots.mjs";
import { cleanup, here, put, run, scratch, uiProject, victimIn, victimIntact } from "./maestro-helpers.mjs";

after(cleanup);

const listen = (handler) => new Promise((done) => { const s = createServer(handler); s.listen(0, "127.0.0.1", () => done(s)); });

// Enough of Playwright for shots(): every page answers 200 at the URL it was sent to, is 100 px tall, and a
// screenshot is the bytes "PNG". Like the real one, a screenshot with a `path` writes there, through any link.
const STUB = `const fs = require("node:fs");
const calls = (globalThis.__maestroShots ??= []);
const page = () => ({
  addInitScript: async () => {}, waitForLoadState: async () => {}, waitForFunction: async () => {}, evaluate: async () => 100,
  emulateMedia: async () => {}, addStyleTag: async () => {}, waitForTimeout: async () => {}, close: async () => {},
  goto: async (url) => ({ ok: () => true, url: () => url, status: () => 200 }),
  screenshot: async (o = {}) => { calls.push(o); if (o.path) fs.writeFileSync(o.path, "PNG"); return Buffer.from("PNG"); },
});
module.exports = { chromium: { launch: async () => ({ newPage: async () => page(), close: async () => {} }) } };
`;
const withStubPlaywright = (root) => put(root, { "node_modules/playwright/package.json": `{"main":"index.js"}`, "node_modules/playwright/index.js": STUB });

describe("browser checks only run against a local app", () => {
  test("a base that is not local is refused before anything is fetched or launched, unless allowRemote", async () => {
    const root = uiProject(scratch());
    withStubPlaywright(root);
    let launched = false;
    const config = { root, baseUrl: "https://staging.example.com" };
    const refused = await withPages(config, {}, async () => { launched = true; return []; });
    assert.match(refused.skipped, /not a local app.*--allow-remote/);
    assert.equal(launched, false, "the stub browser would have launched");
    const app = await listen((_q, s) => s.end("ok"));
    try {
      const base = `http://127.0.0.1:${app.address().port}`;
      assert.deepEqual(await withPages({ root, baseUrl: base }, {}, async () => { launched = true; return []; }), []);
      assert.equal(launched, true, "a local base runs");
    } finally { app.close(); }
  });

  test("the reachability probe does not follow a redirect", async () => {
    let hits = 0;
    const target = await listen((_q, s) => { hits++; s.end("ok"); });
    const hop = await listen((_q, s) => { s.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/` }); s.end(); });
    try {
      assert.equal(await reachable(`http://127.0.0.1:${hop.address().port}/`), true);
      assert.equal(hits, 0);
    } finally {
      hop.close();
      target.close();
    }
  });
});

describe("shots write only inside their own folder", () => {
  const withApp = async (fn) => {
    const app = await listen((_q, s) => s.end("ok"));
    try { return await fn(`http://127.0.0.1:${app.address().port}`); } finally { app.close(); }
  };

  test("screenshots are written by rename, and the default folder ignores itself", () => withApp(async (base) => {
    const root = uiProject(scratch());
    withStubPlaywright(root);
    globalThis.__maestroShots = [];
    const r = await shots({ root, baseUrl: base }, { routes: ["/"], base });
    assert.equal(r.skipped, undefined, r.skipped);
    assert.equal(r.files.length, 4);
    assert.equal(readFileSync(join(root, ".viewsonic-ui", "shots", "root", "light-phone.png"), "utf8"), "PNG");
    assert.equal(readFileSync(join(root, ".viewsonic-ui", "shots", ".gitignore"), "utf8"), "*\n");
    assert.equal(globalThis.__maestroShots.some((o) => "path" in o), false, "Playwright never writes the file itself");
  }));

  test("a committed link at the folder, at a route folder or at a screenshot is refused; the outside is untouched", () => withApp(async (base) => {
    const d = scratch();
    const victim = victimIn(d);
    const cases = [
      [".viewsonic-ui", victim],
      [".viewsonic-ui/shots/root", victim],
      [".viewsonic-ui/shots/root/light-phone.png", join(victim, "thesis.txt")],
    ];
    for (const [i, [at, target]] of cases.entries()) {
      const root = uiProject(join(d, `case${i}`));
      withStubPlaywright(root);
      mkdirSync(join(root, at, ".."), { recursive: true });
      symlinkSync(target, join(root, at));
      const r = await shots({ root, baseUrl: base }, { routes: ["/"], base });
      assert.match(r.skipped ?? "", /refusing to write screenshots: .*symbolic link/, at);
    }
    victimIntact(victim);
  }));

  test("a route whose folder would be . or .. is refused", async () => {
    const root = uiProject(scratch());
    for (const route of ["/..", "/."]) {
      const r = await shots({ root, baseUrl: "http://127.0.0.1:9" }, { routes: [route], base: "http://127.0.0.1:9" });
      assert.match(r.skipped ?? "", /names no folder of its own/, route);
    }
    assert.equal(existsSync(join(root, ".viewsonic-ui")), false, "nothing is made before the checks pass");
  });
});

describe("installer: inputs and residual paths", () => {
  function sandbox(base = scratch("maestro-install-")) {
    const project = join(base, "project");
    cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: project });
    return { project, victim: victimIn(base) };
  }
  const install = (cwd, args = [], opts = {}) => run(cwd, ["install", ...args], opts);
  const workflowAt = (top) => join(top, ".github", "workflows", "viewsonic-ui.yml");
  const gitRepo = (dir) => { mkdirSync(dir, { recursive: true }); spawnSync("git", ["init", "-q"], { cwd: dir }); return dir; };

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

  test("a monorepo folder whose name would run in the hook is refused; one in another script is not", () => {
    const top = gitRepo(scratch("maestro-install-"));
    const hostile = join(top, "a$(touch pwned)");
    cpSync(join(here, "fixtures", "consumer"), hostile, { recursive: true });
    const r = install(hostile, ["--yes", "--cwd", hostile]);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /holds characters the generated hook and workflow cannot carry safely/);
    assert.equal(existsSync(join(hostile, ".githooks", "pre-commit")), false);
    const named = join(top, "apps", "wéb");
    cpSync(join(here, "fixtures", "consumer"), named, { recursive: true });
    assert.equal(install(named, ["--yes", "--cwd", named]).code, 0);
    assert.match(readFileSync(workflowAt(top), "utf8"), /working-directory: apps\/wéb/);
  });

  test("the workflow reads the repository only, and the plan names where it really goes", () => {
    const top = gitRepo(scratch("maestro-install-"));
    const project = join(top, "apps", "web");
    cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
    const plan = install(project, ["--cwd", project]);
    assert.match(plan.out, /write {2}\.github\/workflows\/viewsonic-ui\.yml \(at the git top level\)/);
    assert.doesNotMatch(plan.out, /apps\/web\/\.github/);
    assert.equal(install(project, ["--yes", "--cwd", project]).code, 0);
    assert.match(readFileSync(workflowAt(top), "utf8"), /\npermissions:\n {2}contents: read\njobs:/);
  });

  test("a project folder reached through a committed link out of the repository is refused, however it is named", () => {
    const d = scratch("maestro-install-");
    const repo = gitRepo(join(d, "repo"));
    mkdirSync(join(repo, "packages"));
    const victim = victimIn(d); // beside the repository, not in it
    const otherRepo = gitRepo(join(d, "other"));
    symlinkSync(victim, join(repo, "packages", "web"));
    symlinkSync(otherRepo, join(repo, "packages", "admin"));
    const web = join(repo, "packages", "web");
    const ways = [
      ["--cwd", install(repo, ["--yes", "--cwd", web])],
      ["$PWD", install(web, ["--yes"], { env: { ...process.env, PWD: web } })],
      ["--cwd .", install(web, ["--yes", "--cwd", "."], { env: { ...process.env, PWD: web } })],
      ["a link to another repository", install(repo, ["--yes", "--cwd", join(repo, "packages", "admin")])],
    ];
    for (const [how, r] of ways) {
      assert.equal(r.code, 1, `${how}: ${r.out}${r.err}`);
      assert.match(r.out, /is a symbolic link inside the repository at .* that leads out of it/, how);
    }
    victimIntact(victim);
    assert.equal(existsSync(join(otherRepo, ".githooks")), false, "nothing written into the other repository");
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
