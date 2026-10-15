import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const runMjs = join(checksDir, "run.mjs");
const fx = (n) => join(here, "fixtures", n);
const cli = (...args) => {
  const r = spawnSync(process.execPath, [runMjs, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.trim().split(/\r?\n/) };
};
const { runChecks } = await import(pathToFileURL(runMjs).href);
const { STATIC_CHECKS, BROWSER_CHECKS } = await import(pathToFileURL(join(checksDir, "registry.mjs")).href);

describe("registry", () => {
  test("static checks are {name, load} entries; tokens, rules and refs are registered", () => {
    assert.deepEqual(STATIC_CHECKS.slice(0, 3).map((c) => c.name), ["tokens", "rules", "refs"]);
    for (const c of [...STATIC_CHECKS, ...BROWSER_CHECKS]) {
      assert.equal(typeof c.name, "string");
      assert.equal(typeof c.load, "function");
    }
  });
  test("every registered check loads and exports run()", async () => {
    for (const c of STATIC_CHECKS) assert.equal(typeof (await c.load()).run, "function", c.name);
  });
});

describe("run.mjs CLI", () => {
  test("fast on a clean project with no colour tokens: contrast is SKIPPED (never GOOD), exit 2", () => {
    const r = cli("fast", "--cwd", fx("consumer"));
    assert.equal(r.code, 2, r.out + r.err);
    assert.ok(r.lines.some((l) => l.startsWith("SKIPPED contrast - no contrast pairs could be resolved")), r.out);
    assert.match(r.lines.at(-1), /^7 checks · 6 GOOD · 0 BAD · 1 SKIPPED$/);
  });
  test("fast on a project with violations: BAD lines in the specified format, exit 1", () => {
    const r = cli("fast", "--cwd", fx("bad"));
    assert.equal(r.code, 1);
    const bad = r.lines.filter((l) => l.startsWith("BAD "));
    assert.ok(bad.length >= 3, r.out);
    for (const l of bad) assert.match(l, /^BAD [a-z-]+\/[a-z-]+ \S+:\d+ - .+ → .+$/, l);
    assert.ok(bad.some((l) => l.startsWith("BAD tokens/hex-colour components/bad.tsx:1 ")));
    assert.match(r.lines.at(-1), /^7 checks · \d+ GOOD · \d+ BAD · \d+ SKIPPED$/);
  });
  test("a single check by name", () => {
    const r = cli("tokens", "--cwd", fx("bad"));
    assert.equal(r.code, 1);
    assert.match(r.lines.at(-1), /^1 checks · 0 GOOD · 1 BAD · 0 SKIPPED$/);
    assert.ok(r.lines.filter((l) => l.startsWith("BAD ")).every((l) => l.startsWith("BAD tokens/")));
  });
  test("full runs the static checks, then SKIPS the browser check when Playwright or the app is missing", () => {
    const r = cli("full", "--cwd", fx("consumer"));
    assert.equal(r.code, 2);
    assert.ok(r.lines.some((l) => l.startsWith("SKIPPED contrast-rendered - ")), r.out);
    for (const n of ["layout-shift", "rhythm", "emphasis", "motion"]) assert.ok(r.lines.some((l) => l.startsWith(`SKIPPED ${n} - `)), r.out);
    const total = STATIC_CHECKS.length + BROWSER_CHECKS.length;
    assert.equal(r.lines.at(-1), `${total} checks · 6 GOOD · 0 BAD · ${BROWSER_CHECKS.length + 1} SKIPPED`);
  });
  test("--flag=value works like --flag value", () => {
    const r = cli("config", `--cwd=${fx("repo")}`);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(JSON.parse(r.out).root.split("\\").join("/"), fx("repo").split("\\").join("/"));
  });
  test("config prints the loaded config as JSON", () => {
    const r = cli("config", "--cwd", fx("repo"));
    assert.equal(r.code, 0);
    const c = JSON.parse(r.out);
    assert.equal(c.uiDir, "components/ui");
    assert.deepEqual(c.routes, ["/", "/design-system/colors", "/pricing"]);
  });
  test("--base overrides baseUrl", () => {
    const c = JSON.parse(cli("config", "--cwd", fx("consumer"), "--base", "http://localhost:9999").out);
    assert.equal(c.baseUrl, "http://localhost:9999");
  });
  test("unknown check name is a usage error", () => {
    const r = cli("nonsense", "--cwd", fx("consumer"));
    assert.equal(r.code, 64);
    assert.match(r.err, /unknown check/i);
  });
  test("not a shadcn project: message, non-zero, never a pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-bare-"));
    writeFileSync(join(dir, "package.json"), "{}");
    const r = cli("fast", "--cwd", dir);
    rmSync(dir, { recursive: true, force: true });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /Not a shadcn project|shadcn/);
  });
});

describe("runChecks (injected registry)", () => {
  const config = { root: ".", baseUrl: "http://localhost:3000", hasPlaywright: true };
  const mk = (name, result) => ({ name, load: async () => ({ run: async () => (typeof result === "function" ? result() : result) }) });
  const finding = (check) => ({ check, rule: "r", file: "a.tsx", line: 2, found: "x", why: "because", fix: "do y" });

  test("counts GOOD, BAD and SKIPPED per check; BAD wins the exit code", async () => {
    const r = await runChecks({
      mode: "fast", config,
      registry: { STATIC_CHECKS: [mk("a", []), mk("b", [finding("b"), finding("b")]), mk("c", { skipped: "no playwright" })], BROWSER_CHECKS: [] },
    });
    assert.equal(r.lines.at(-1), "3 checks · 1 GOOD · 1 BAD · 1 SKIPPED");
    assert.ok(r.lines.includes("BAD b/r a.tsx:2 - because → do y"));
    assert.ok(r.lines.some((l) => l.startsWith("SKIPPED c")));
    assert.equal(r.exitCode, 1);
  });
  test("exit 2 when something was skipped and nothing is bad", async () => {
    const r = await runChecks({
      mode: "fast", config,
      registry: { STATIC_CHECKS: [mk("a", []), mk("c", { skipped: "no playwright" })], BROWSER_CHECKS: [] },
    });
    assert.equal(r.exitCode, 2);
    assert.equal(r.lines.at(-1), "2 checks · 1 GOOD · 0 BAD · 1 SKIPPED");
  });
  test("a check that returns no findings array is SKIPPED, later checks still run, nothing crashes", async () => {
    for (const bogus of [undefined, null, {}, "x", 3]) {
      const r = await runChecks({
        mode: "fast", config,
        registry: { STATIC_CHECKS: [mk("a", bogus), mk("b", [finding("b")])], BROWSER_CHECKS: [] },
      });
      assert.ok(r.lines.some((l) => /^SKIPPED a - it returned no findings array/.test(l)), String(bogus));
      assert.ok(r.lines.some((l) => l.startsWith("BAD b/r")), "the next check ran");
      assert.equal(r.lines.at(-1), "2 checks · 0 GOOD · 1 BAD · 1 SKIPPED");
      assert.equal(r.exitCode, 1);
    }
  });
  test("a check that throws is SKIPPED with its reason, never GOOD", async () => {
    const r = await runChecks({
      mode: "fast", config,
      registry: { STATIC_CHECKS: [mk("a", () => { throw new Error("boom"); })], BROWSER_CHECKS: [] },
    });
    assert.equal(r.exitCode, 2);
    assert.ok(r.lines.some((l) => /^SKIPPED a - .*boom/.test(l)));
  });
  test("full skips browser checks with the install hint when Playwright is missing", async () => {
    const r = await runChecks({
      mode: "full", config: { ...config, hasPlaywright: false },
      registry: { STATIC_CHECKS: [mk("a", [])], BROWSER_CHECKS: [mk("shots", [])] },
    });
    assert.equal(r.exitCode, 2);
    assert.ok(r.lines.some((l) => /^SKIPPED shots - .*playwright install/i.test(l)));
    assert.equal(r.lines.at(-1), "2 checks · 1 GOOD · 0 BAD · 1 SKIPPED");
  });
  test("a browser check runs on full, receives the base url, and can be run by name", async () => {
    let seen;
    const shots = { name: "shots", load: async () => ({ run: async (cfg, opts) => { seen = opts.base; return []; } }) };
    const registry = { STATIC_CHECKS: [mk("a", [])], BROWSER_CHECKS: [shots] };
    const full = await runChecks({ mode: "full", config, base: "http://localhost:1234", registry });
    assert.equal(seen, "http://localhost:1234");
    assert.equal(full.lines.at(-1), "2 checks · 2 GOOD · 0 BAD · 0 SKIPPED");
    const one = await runChecks({ mode: "shots", config, registry });
    assert.equal(one.lines.at(-1), "1 checks · 1 GOOD · 0 BAD · 0 SKIPPED");
  });
  test("fast never loads browser checks", async () => {
    let loaded = false;
    const shots = { name: "shots", load: async () => { loaded = true; return { run: async () => [] }; } };
    await runChecks({ mode: "fast", config, registry: { STATIC_CHECKS: [mk("a", [])], BROWSER_CHECKS: [shots] } });
    assert.equal(loaded, false);
  });
});
