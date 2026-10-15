import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const runMjs = join(checksDir, "run.mjs");
const scope = await import(pathToFileURL(join(checksDir, "scope.mjs")).href);
const { runChecks } = await import(pathToFileURL(runMjs).href);

const GIT = ["-c", "user.email=t@t", "-c", "user.name=t"];
const sh = (cwd, ...a) => spawnSync("git", [...GIT, ...a], { cwd, encoding: "utf8" });
const put = (d, rel, text) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); };
const cli = (d, ...args) => {
  const r = spawnSync(process.execPath, [runMjs, ...args, "--cwd", d], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.trim().split(/\r?\n/) };
};
const commitAll = (d, msg) => { sh(d, "add", "-A"); sh(d, "commit", "-q", "-m", msg); };

/** A git repo: a imports b; c is unrelated; the home page imports a. Everything committed. */
function repo() {
  const d = mkdtempSync(join(tmpdir(), "scope-"));
  put(d, "package.json", "{}");
  put(d, "components.json", JSON.stringify({ aliases: { components: "@/components", ui: "@/components/ui" }, tailwind: { css: "app/globals.css" } }));
  put(d, "app/globals.css", "@theme { --color-primary: #fff; }\n");
  put(d, "components/b.tsx", "export const B = () => <div>b</div>;\n");
  put(d, "components/a.tsx", 'import { B } from "./b";\nexport const A = () => <B />;\n');
  put(d, "components/c.tsx", "export const C = () => <div>c</div>;\n");
  put(d, "app/page.tsx", 'import { A } from "@/components/a";\nexport default () => <A />;\n');
  put(d, "app/settings/page.tsx", "export default () => <div>s</div>;\n");
  sh(d, "init", "-q");
  commitAll(d, "init");
  return d;
}
const cfg = async (d) => (await import(pathToFileURL(join(checksDir, "config.mjs")).href)).loadConfig(d);
const cleanup = (d) => rmSync(d, { recursive: true, force: true });

describe("scope helpers", () => {
  test("changedFiles lists staged, unstaged and untracked; null outside a git root", () => {
    const d = repo();
    try {
      assert.deepEqual(scope.changedFiles(d), []);
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      put(d, "components/new.tsx", "export const N = 1;\n");
      assert.deepEqual(scope.changedFiles(d), ["components/b.tsx", "components/new.tsx"]);
      assert.equal(scope.changedFiles(join(d, "components")), null);
    } finally { cleanup(d); }
  });
  test("computeScope: the changed file plus its importers one hop away, not further", async () => {
    const d = repo();
    try {
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      const s = scope.computeScope(await cfg(d), "fast", {});
      assert.deepEqual(s.files, ["components/a.tsx", "components/b.tsx"]);
      assert.match(s.label, /^scope: 2 files \(changed vs HEAD/);
    } finally { cleanup(d); }
  });
  test("alias importers count; --all means every file; a changed stylesheet means every file", async () => {
    const d = repo();
    try {
      put(d, "components/a.tsx", 'import { B } from "./b";\nexport const A = () => <B />; // edit\n');
      const c = await cfg(d);
      assert.ok(scope.computeScope(c, "fast", {}).files.includes("app/page.tsx"));
      assert.equal(scope.computeScope(c, "fast", { all: true }).files, null);
      assert.equal(scope.computeScope(c, "full", {}).files, null);
      put(d, "app/globals.css", "@theme { --color-primary: #000; }\n");
      assert.equal(scope.computeScope(c, "fast", {}).files, null);
    } finally { cleanup(d); }
  });
  test("a project that is not a git root scans everything", async () => {
    const d = mkdtempSync(join(tmpdir(), "scope-"));
    try {
      put(d, "package.json", "{}");
      put(d, "components.json", "{}");
      put(d, "components/x.tsx", "export const X = 1;\n");
      assert.equal(scope.computeScope(await cfg(d), "fast", {}).files, null);
    } finally { cleanup(d); }
  });
});

describe("deleted and renamed files", () => {
  test("a deleted file puts its importers in scope", async () => {
    const d = repo();
    try {
      sh(d, "rm", "-q", "components/b.tsx");
      const s = scope.computeScope(await cfg(d), "fast", {});
      assert.deepEqual(s.files, ["components/a.tsx"]);
      assert.match(s.label, /1 deleted or renamed/);
    } finally { cleanup(d); }
  });
  test("a rename counts both sides; the importer of the old path is in scope", async () => {
    const d = repo();
    try {
      sh(d, "mv", "components/b.tsx", "components/b2.tsx");
      assert.deepEqual(scope.changedFiles(d), ["components/b.tsx", "components/b2.tsx"]);
      assert.deepEqual(scope.computeScope(await cfg(d), "fast", {}).files, ["components/a.tsx", "components/b2.tsx"]);
    } finally { cleanup(d); }
  });
  test("a deleted page never maps to a route", async () => {
    const d = repo();
    try {
      sh(d, "rm", "-q", "app/settings/page.tsx");
      assert.deepEqual(scope.computeRoutes(await cfg(d), {}).routes, ["/"]);
    } finally { cleanup(d); }
  });
  test("a repo with no commit yet treats every file as changed", () => {
    const d = mkdtempSync(join(tmpdir(), "scope-"));
    try {
      put(d, "package.json", "{}");
      put(d, "components/x.tsx", "export const X = 1;\n");
      sh(d, "init", "-q");
      sh(d, "add", "components/x.tsx");
      put(d, "components/y.tsx", "export const Y = 1;\n");
      assert.deepEqual(scope.changedFiles(d), ["components/x.tsx", "components/y.tsx", "package.json"]);
    } finally { cleanup(d); }
  });
});

describe("route widening", () => {
  test("a component used by two pages, a layout, or a stylesheet means every route", async () => {
    const d = repo();
    try {
      put(d, "app/settings/page.tsx", 'import { A } from "@/components/a";\nexport default () => <A />;\n');
      commitAll(d, "two pages use a");
      const c = await cfg(d);
      put(d, "components/a.tsx", 'import { B } from "./b";\nexport const A = () => <B />; // edit\n');
      const r = scope.computeRoutes(c, {});
      assert.equal(r.routes, undefined);
      assert.match(r.label, /^routes: all \(shared file changed: components\/a\.tsx\)$/);
      commitAll(d, "x");
      put(d, "app/layout.tsx", "export default ({ children }) => children;\n");
      assert.match(scope.computeRoutes(c, {}).label, /layout\.tsx/);
      commitAll(d, "y");
      put(d, "app/globals.css", "@theme { --color-primary: #000; }\n");
      assert.match(scope.computeRoutes(c, {}).label, /globals\.css/);
    } finally { cleanup(d); }
  });
  test("a component used by one page: that page's route plus /", async () => {
    const d = repo();
    try {
      put(d, "components/d.tsx", "export const D = 1;\n");
      put(d, "app/settings/page.tsx", 'import { D } from "@/components/d";\nexport default () => <div>{D}</div>;\n');
      commitAll(d, "d");
      put(d, "components/d.tsx", "export const D = 2;\n");
      const r = scope.computeRoutes(await cfg(d), {});
      assert.deepEqual(r.routes, ["/", "/settings"]);
      assert.equal(r.narrowed, true);
    } finally { cleanup(d); }
  });
});

describe("transitive importers", () => {
  test("leaf -> component -> 2 pages widens to every route", async () => {
    const d = repo();
    try {
      put(d, "app/settings/page.tsx", 'import { A } from "@/components/a";\nexport default () => <A />;\n');
      commitAll(d, "two pages use a");
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      const r = scope.computeRoutes(await cfg(d), {});
      assert.equal(r.routes, undefined);
      assert.match(r.label, /shared file changed: components\/b\.tsx/);
    } finally { cleanup(d); }
  });
  test("leaf -> intermediate -> 1 page selects that page", async () => {
    const d = repo();
    try {
      put(d, "components/m.tsx", 'import { B } from "./b";\nexport const M = () => <B />;\n');
      put(d, "app/settings/page.tsx", 'import { M } from "@/components/m";\nexport default () => <M />;\n');
      commitAll(d, "chain");
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      // b is also reached by the home page through a, so use a fresh leaf instead
      put(d, "components/leaf.tsx", "export const L = 1;\n");
      put(d, "components/m.tsx", 'import { B } from "./b";\nimport { L } from "./leaf";\nexport const M = () => <B />;\n');
      commitAll(d, "leaf");
      put(d, "components/leaf.tsx", "export const L = 2;\n");
      const r = scope.computeRoutes(await cfg(d), {});
      assert.deepEqual(r.routes, ["/", "/settings"]);
      assert.equal(r.narrowed, true);
    } finally { cleanup(d); }
  });
  test("a changed file no page reaches widens to every route", async () => {
    const d = repo();
    try {
      put(d, "components/c.tsx", "export const C = () => <div>c2</div>;\n");
      const r = scope.computeRoutes(await cfg(d), {});
      assert.equal(r.routes, undefined);
      assert.match(r.label, /no page imports components\/c\.tsx - checking all routes/);
    } finally { cleanup(d); }
  });
});

describe("routes", () => {
  test("page files map to URLs; groups drop out; dynamic segments and non-pages are skipped", () => {
    assert.equal(scope.routeOfPageFile("app/page.tsx"), "/");
    assert.equal(scope.routeOfPageFile("app/settings/page.tsx"), "/settings");
    assert.equal(scope.routeOfPageFile("src/app/(shop)/cart/page.jsx"), "/cart");
    assert.equal(scope.routeOfPageFile("app/blog/[slug]/page.tsx"), null);
    assert.equal(scope.routeOfPageFile("app/settings/layout.tsx"), null);
    assert.equal(scope.routeOfPageFile("pages/about.tsx"), "/about");
    assert.equal(scope.routeOfPageFile("pages/index.tsx"), "/");
  });
  test("changedRoutes: changed pages plus /", () => {
    assert.deepEqual(scope.changedRoutes(["app/settings/page.tsx", "components/a.tsx"]), ["/", "/settings"]);
    assert.deepEqual(scope.changedRoutes([]), ["/"]);
  });
  test("computeRoutes: --route wins, --all-routes means the config's, else changed pages", async () => {
    const d = repo();
    try {
      const c = await cfg(d);
      assert.deepEqual(scope.computeRoutes(c, { routes: ["/x"] }).routes, ["/x"]);
      assert.equal(scope.computeRoutes(c, { allRoutes: true }).routes, undefined);
      put(d, "app/settings/page.tsx", "export default () => <div>s2</div>;\n");
      assert.deepEqual(scope.computeRoutes(c, {}).routes, ["/", "/settings"]);
    } finally { cleanup(d); }
  });
});

describe("runChecks scoping", () => {
  const registry = (seen) => ({
    STATIC_CHECKS: [
      { name: "tokens", load: async () => ({ run: async (c, o) => { seen.push({ files: o.files, scope: c.scopeFiles }); return [{ rule: "r", file: "a.tsx", line: 1, why: "w", fix: "f" }, { rule: "r", file: "z.tsx", line: 1, why: "w", fix: "f" }]; } }) },
      { name: "two", load: async () => ({ run: async () => [] }) },
    ],
    BROWSER_CHECKS: [{ name: "br", load: async () => ({ run: async (c, o) => { seen.push({ routes: o.routes }); return []; } }) }],
  });
  test("findings outside the scope are dropped; options.files is passed", async () => {
    const seen = [];
    const r = await runChecks({ mode: "fast", config: { hasPlaywright: true }, registry: registry(seen), scopeFiles: ["a.tsx"] });
    assert.deepEqual(seen[0].files, ["a.tsx"]);
    assert.equal(r.lines.filter((l) => l.startsWith("BAD")).length, 1);
    assert.match(r.lines.find((l) => l.startsWith("BAD")), /a\.tsx/);
    assert.ok(r.lines.includes("scope: 1 finding outside the changed files was not reported (run with --all to see them)"), r.lines.join("\n"));
    assert.match(r.lines.at(-1), /\(scoped\)$/);
  });
  test("--only runs the subset; an unknown name is a usage error", async () => {
    const seen = [];
    const r = await runChecks({ mode: "full", config: { hasPlaywright: true }, registry: registry(seen), only: ["br"], extra: { routes: ["/s"] } });
    assert.deepEqual(seen, [{ routes: ["/s"] }]);
    assert.match(r.lines.at(-1), /^1 checks · 1 GOOD/);
    const bad = await runChecks({ mode: "fast", config: {}, registry: registry([]), only: ["nope"] });
    assert.equal(bad.exitCode, 64);
  });
});

describe("CLI", () => {
  test("fast in a git repo prints the scope first; --all scans everything; --changed with --all is a usage error", () => {
    const d = repo();
    try {
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      const r = cli(d, "fast", "--only", "rules,tokens");
      assert.match(r.lines[0], /^scope: 2 files \(changed vs HEAD/, r.out);
      assert.equal(cli(d, "fast", "--only", "rules,tokens", "--all").lines[0], "scope: all files");
      assert.equal(cli(d, "fast", "--changed", "--all").code, 64);
    } finally { cleanup(d); }
  });
  test("a violation in an unchanged file is not reported by the default fast, but is by --all", () => {
    const d = repo();
    try {
      put(d, "components/c.tsx", 'export const C = () => <div style={{ color: "#123456" }}>c</div>;\n');
      commitAll(d, "bad");
      put(d, "components/b.tsx", "export const B = () => <div>b2</div>;\n");
      const scoped = cli(d, "fast", "--only", "tokens,rules");
      assert.ok(!scoped.lines.some((l) => l.includes("c.tsx")), scoped.out);
      const all = cli(d, "fast", "--only", "tokens,rules", "--all");
      assert.ok(all.lines.some((l) => l.startsWith("BAD") && l.includes("c.tsx")), all.out);
    } finally { cleanup(d); }
  });
});
