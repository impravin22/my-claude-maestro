import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const runMjs = join(checksDir, "run.mjs");
const dirs = [];

function project({ git = true } = {}) {
  const d = mkdtempSync(join(tmpdir(), "viewsonic-install-"));
  dirs.push(d);
  cpSync(join(here, "fixtures", "consumer"), d, { recursive: true });
  if (git) spawnSync("git", ["init", "-q"], { cwd: d });
  return d;
}
const install = (d, ...args) => {
  const r = spawnSync(process.execPath, [runMjs, "install", "--cwd", d, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const hooksPath = (d) => spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: d, encoding: "utf8" }).stdout.trim();
const read = (d, p) => readFileSync(join(d, p), "utf8");

after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe("install", () => {
  test("without --yes prints a plan and writes nothing", () => {
    const d = project();
    const r = install(d);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /pre-commit/);
    assert.match(r.out, /viewsonic-ui\.yml/);
    assert.match(r.out, /viewsonic-ui\.config\.json/);
    assert.match(r.out, /--yes/);
    for (const p of [".githooks", ".github", ".viewsonic-ui", "viewsonic-ui.config.json"]) assert.equal(existsSync(join(d, p)), false, p);
    assert.equal(hooksPath(d), "");
  });

  test("--yes writes hook, workflow, config and vendored checks", () => {
    const d = project();
    writeFileSync(join(d, "package-lock.json"), "{}");
    const r = install(d, "--yes");
    assert.equal(r.code, 0, r.err);
    const hook = read(d, ".githooks/pre-commit");
    assert.ok(hook.startsWith("#!/bin/sh"));
    assert.ok(!hook.includes("\r"), "LF only");
    assert.match(hook, /\.viewsonic-ui\/checks\/run\.mjs/);
    assert.match(hook, /fast/);
    assert.match(hook, /exit 1/);
    assert.equal(hooksPath(d), ".githooks");
    const wf = read(d, ".github/workflows/viewsonic-ui.yml");
    assert.match(wf, /pull_request/);
    assert.match(wf, /node-version: 22/);
    assert.match(wf, /npm ci/);
    assert.match(wf, /playwright install/);
    assert.match(wf, /\.viewsonic-ui\/checks\/run\.mjs full/);
    assert.match(wf, /localhost:3000/);
    const cfg = JSON.parse(read(d, "viewsonic-ui.config.json"));
    assert.deepEqual(cfg, { baseUrl: "http://localhost:3000", allowWords: [], allowSystemWords: [], properNouns: [], motionPhases: [], contrastPairs: [] });
    assert.ok(existsSync(join(d, ".viewsonic-ui/checks/run.mjs")));
    assert.ok(existsSync(join(d, ".viewsonic-ui/checks/static/tokens.mjs")));
    assert.equal(existsSync(join(d, ".viewsonic-ui/checks/test")), false);
    assert.match(r.out, /Playwright/);
    assert.match(r.out, /npm i -D @playwright\/test && npx playwright install chromium/);
  });

  test("never overwrites an existing config", () => {
    const d = project();
    writeFileSync(join(d, "viewsonic-ui.config.json"), '{"baseUrl":"http://localhost:4000"}');
    install(d, "--yes");
    assert.equal(read(d, "viewsonic-ui.config.json"), '{"baseUrl":"http://localhost:4000"}');
  });

  test("does not override a different core.hooksPath", () => {
    const d = project();
    spawnSync("git", ["config", "core.hooksPath", ".other"], { cwd: d });
    const r = install(d, "--yes");
    assert.equal(hooksPath(d), ".other");
    assert.match(r.out, /core\.hooksPath/);
    assert.match(r.out, /\.githooks\/pre-commit/);
  });

  test("does not override a husky setup", () => {
    const d = project();
    mkdirSync(join(d, ".husky"));
    const r = install(d, "--yes");
    assert.equal(hooksPath(d), "");
    assert.match(r.out, /husky/i);
  });

  test("second run changes nothing", () => {
    const d = project();
    install(d, "--yes");
    const files = [".githooks/pre-commit", ".github/workflows/viewsonic-ui.yml", "viewsonic-ui.config.json", ".viewsonic-ui/checks/run.mjs"];
    const before = files.map((f) => read(d, f));
    const r = install(d, "--yes");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(files.map((f) => read(d, f)), before);
    assert.equal(hooksPath(d), ".githooks");
    assert.match(r.out, /unchanged|skipped/i);
  });

  test("vendored copy runs standalone", () => {
    const d = project();
    install(d, "--yes");
    const r = spawnSync(process.execPath, [join(d, ".viewsonic-ui/checks/run.mjs"), "fast", "--cwd", d], { encoding: "utf8" });
    assert.ok([0, 1, 2].includes(r.status), r.stderr);
    assert.match(r.stdout, /\d+ checks · /);
  });

  test("hook exit code follows the checks: 0 ok, 2 skipped ok, anything else blocks", () => {
    const d = project();
    install(d, "--yes");
    for (const [code, want] of [[0, 0], [2, 0], [1, 1], [127, 1]]) {
      writeFileSync(join(d, ".viewsonic-ui/checks/run.mjs"), `process.exit(${code});`);
      const sh = spawnSync("sh", [join(d, ".githooks/pre-commit")], { cwd: d, encoding: "utf8" });
      assert.equal(sh.status, want, `stub exit ${code}`);
    }
  });

  test("hook is executable on POSIX and .gitattributes pins LF, once", { skip: process.platform === "win32" }, () => {
    const d = project();
    install(d, "--yes");
    assert.ok(statSync(join(d, ".githooks/pre-commit")).mode & 0o111);
  });

  test(".gitattributes is created or appended to, idempotently", () => {
    const d = project();
    writeFileSync(join(d, ".gitattributes"), "* text=auto");
    install(d, "--yes");
    install(d, "--yes");
    assert.equal(read(d, ".gitattributes"), "* text=auto\n.githooks/pre-commit text eol=lf\n");
    const e = project();
    install(e, "--yes");
    assert.equal(read(e, ".gitattributes"), ".githooks/pre-commit text eol=lf\n");
  });

  test("a tracked hook gets the executable bit recorded; an untracked one is never staged", () => {
    const d = project();
    install(d, "--yes");
    const staged = spawnSync("git", ["ls-files", "--stage"], { cwd: d, encoding: "utf8" }).stdout;
    assert.equal(staged.includes(".githooks"), false, "install must not stage files");
    spawnSync("git", ["add", ".githooks/pre-commit"], { cwd: d });
    spawnSync("git", ["update-index", "--chmod=-x", ".githooks/pre-commit"], { cwd: d });
    install(d, "--yes");
    assert.match(spawnSync("git", ["ls-files", "--stage", ".githooks/pre-commit"], { cwd: d, encoding: "utf8" }).stdout, /^100755/);
  });

  test("the vendored folder is never scanned, and config passes the override keys through", async () => {
    const d = project();
    install(d, "--yes");
    writeFileSync(join(d, "viewsonic-ui.config.json"), JSON.stringify({ allowWords: ["x"], allowSystemWords: ["y"], motionPhases: ["m"], contrastPairs: [["a", "b"]] }));
    const { loadConfig } = await import(pathToFileURL(join(checksDir, "config.mjs")).href);
    const { projectFiles } = await import(pathToFileURL(join(checksDir, "lib.mjs")).href);
    const cfg = await loadConfig(d);
    assert.deepEqual([cfg.allowWords, cfg.allowSystemWords, cfg.motionPhases, cfg.contrastPairs], [["x"], ["y"], ["m"], [["a", "b"]]]);
    writeFileSync(join(d, "viewsonic-ui.config.json"), "{}");
    const bare = await loadConfig(d);
    assert.deepEqual([bare.allowWords, bare.allowSystemWords, bare.motionPhases, bare.contrastPairs], [[], [], [], []]);
    const files = projectFiles({ ...bare, sources: ["."] });
    assert.ok(files.length > 0);
    assert.equal(files.some((f) => f.includes(".viewsonic-ui")), false);
  });

  test("monorepo: the project is below the git top level - hook path, hooksPath and the hook's cwd all follow it", () => {
    const top = mkdtempSync(join(tmpdir(), "viewsonic-mono-"));
    dirs.push(top);
    spawnSync("git", ["init", "-q"], { cwd: top });
    const d = join(top, "apps", "web");
    mkdirSync(d, { recursive: true });
    cpSync(join(here, "fixtures", "consumer"), d, { recursive: true });
    const r = install(d, "--yes");
    assert.equal(r.code, 0, r.err);
    assert.equal(spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: top, encoding: "utf8" }).stdout.trim(), "apps/web/.githooks");
    assert.match(read(d, ".githooks/pre-commit"), /show-toplevel\)\/apps\/web"/);
    assert.ok(existsSync(join(top, ".github/workflows/viewsonic-ui.yml")), "workflows live at the git top level");
    assert.match(readFileSync(join(top, ".github/workflows/viewsonic-ui.yml"), "utf8"), /working-directory: apps\/web/);
    // a stub for the checks that records where it ran; the hook must find it from the top level and from a subfolder
    writeFileSync(join(d, ".viewsonic-ui/checks/run.mjs"), `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(join(top, "ran.txt"))}, process.cwd() + " " + process.argv.slice(2).join(" ")); process.exit(Number(process.env.STUB_EXIT ?? 0));`);
    const commit = (env) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-q", "-m", "x"], { cwd: top, encoding: "utf8", env: { ...process.env, ...env } });
    const ok = commit({ STUB_EXIT: "0" });
    assert.equal(ok.status, 0, ok.stderr);
    const ran = readFileSync(join(top, "ran.txt"), "utf8");
    assert.ok(ran.split(String.fromCharCode(92)).join("/").toLowerCase().includes("apps/web fast --changed --cwd ."), ran);
    const blocked = commit({ STUB_EXIT: "1" });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Commit blocked/);
  });

  test("monorepo with a root-level husky: not overridden", () => {
    const top = mkdtempSync(join(tmpdir(), "viewsonic-mono-"));
    dirs.push(top);
    spawnSync("git", ["init", "-q"], { cwd: top });
    mkdirSync(join(top, ".husky"));
    const d = join(top, "apps", "web");
    mkdirSync(d, { recursive: true });
    cpSync(join(here, "fixtures", "consumer"), d, { recursive: true });
    const r = install(d, "--yes");
    assert.equal(spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: top, encoding: "utf8" }).stdout.trim(), "");
    assert.match(r.out, /husky/i);
    assert.match(r.out, /sh apps\/web\/\.githooks\/pre-commit/);
  });

  describe("existing hook managers are never overridden, and the output says how to add the command", () => {
    const cases = [
      ["lefthook.yml", "pre-commit:\n", /lefthook/i, /run: sh \.githooks\/pre-commit/],
      [".pre-commit-config.yaml", "repos: []\n", /pre-commit framework/i, /entry: sh \.githooks\/pre-commit/],
      ["package.json", JSON.stringify({ name: "x", "simple-git-hooks": { "pre-commit": "npx lint-staged" } }), /simple-git-hooks/i, /sh \.githooks\/pre-commit/],
      [".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n", /\.git\/hooks already has pre-commit/, /sh \.githooks\/pre-commit/],
    ];
    for (const [file, body, why, howto] of cases) {
      test(file, () => {
        const d = project();
        mkdirSync(dirname(join(d, file)), { recursive: true });
        writeFileSync(join(d, file), body);
        const r = install(d, "--yes");
        assert.equal(r.code, 0, r.err);
        assert.equal(hooksPath(d), "", "core.hooksPath untouched");
        assert.match(r.out, why);
        assert.match(r.out, howto);
        assert.ok(existsSync(join(d, ".githooks/pre-commit")), "the hook file is still written, to be called");
        assert.match(install(d).out, /skip/);
      });
    }
    test("sample hooks in .git/hooks do not count", () => {
      const d = project();
      install(d, "--yes");
      assert.equal(hooksPath(d), ".githooks");
    });
  });

  describe("CI workflow follows the project's package manager", () => {
    const cases = [
      ["pnpm-lock.yaml", [/pnpm\/action-setup/, /cache: pnpm/, /pnpm install --frozen-lockfile/, /pnpm run build/, /pnpm run start &/, /pnpm exec playwright install/], [/npm ci/, /(?<![a-z])npm run/]],
      ["yarn.lock", [/cache: yarn/, /yarn install --frozen-lockfile/, /yarn build/, /yarn start &/], [/npm ci/, /(?<![a-z])npm run/]],
      ["bun.lockb", [/oven-sh\/setup-bun/, /bun install --frozen-lockfile/, /bun run build/, /bunx playwright install/], [/npm ci/, /cache:/]],
      ["package-lock.json", [/cache: npm/, /npm ci/, /npm run build/], [/pnpm/, /yarn/]],
      [null, [/npm install/, /npm run build/], [/npm ci/, /cache:/]],
    ];
    for (const [lock, want, notWant] of cases) {
      test(lock ?? "no lockfile", () => {
        const d = project();
        for (const l of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]) rmSync(join(d, l), { force: true });
        if (lock) writeFileSync(join(d, lock), "");
        install(d, "--yes");
        const wf = read(d, ".github/workflows/viewsonic-ui.yml");
        for (const re of want) assert.match(wf, re);
        for (const re of notWant) assert.doesNotMatch(wf, re);
      });
    }
    test("baseUrl is shell-quoted, even with odd characters", () => {
      const d = project();
      writeFileSync(join(d, "viewsonic-ui.config.json"), JSON.stringify({ baseUrl: "http://localhost:3000/a b;echo hi" }));
      install(d, "--yes");
      const wf = read(d, ".github/workflows/viewsonic-ui.yml");
      assert.ok(wf.includes("curl -sf 'http://localhost:3000/a b;echo hi'"), wf);
      assert.ok(wf.includes("echo 'app did not start at http://localhost:3000/a b;echo hi'"), wf);
    });
  });

  describe("eslint wiring (viewsonic/valid-variant)", () => {
    const repoShape = `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**"]),
]);

export default eslintConfig;
`;
    const wired = (d) => read(d, "eslint.config.mjs");
    const syntax = (d) => spawnSync(process.execPath, ["--check", join(d, "eslint.config.mjs")], { encoding: "utf8" });

    test("dry run says what it will do and writes nothing", () => {
      const d = project();
      writeFileSync(join(d, "eslint.config.mjs"), repoShape);
      const r = install(d);
      assert.match(r.out, /write\s+eslint\.config\.mjs\s+add the viewsonic\/valid-variant rule/);
      assert.equal(wired(d), repoShape);
    });
    test("--yes adds the import and the rule entry, valid JavaScript, once", () => {
      const d = project();
      writeFileSync(join(d, "eslint.config.mjs"), repoShape);
      install(d, "--yes");
      const text = wired(d);
      assert.match(text, /import viewsonicVariants from "\.\/\.viewsonic-ui\/checks\/eslint\/viewsonic-variants\.mjs";/);
      assert.match(text, /plugins: \{ viewsonic: viewsonicVariants \}, rules: \{ "viewsonic\/valid-variant": "error" \}/);
      assert.equal(syntax(d).status, 0, syntax(d).stderr);
      assert.ok(existsSync(join(d, ".viewsonic-ui/checks/eslint/viewsonic-variants.mjs")));
      assert.ok(existsSync(join(d, ".viewsonic-ui/checks/variants.mjs")));
      install(d, "--yes");
      assert.equal(wired(d), text, "second run changes nothing");
      assert.match(install(d).out, /keep\s+eslint\.config\.mjs/);
    });
    test("--yes also ignores the vendored folder, once; a config wired before this gets the ignore on a re-run", () => {
      const d = project();
      writeFileSync(join(d, "eslint.config.mjs"), repoShape);
      install(d, "--yes");
      const text = wired(d);
      assert.equal(text.split(`ignores: [".viewsonic-ui/**"]`).length - 1, 1);
      assert.equal(syntax(d).status, 0, syntax(d).stderr);
      const old = text.replace(`
  { ignores: [".viewsonic-ui/**"] },`, "");
      assert.ok(!old.includes("ignores: [\".viewsonic-ui"));
      writeFileSync(join(d, "eslint.config.mjs"), old);
      install(d, "--yes");
      const again = wired(d);
      assert.equal(again.split(`ignores: [".viewsonic-ui/**"]`).length - 1, 1);
      assert.equal(again.split("viewsonic-variants.mjs").length - 1, 1, "the rule is not wired twice");
      assert.equal(syntax(d).status, 0, syntax(d).stderr);
    });
    test("a plain exported array works too", () => {
      const d = project();
      writeFileSync(join(d, "eslint.config.mjs"), `import js from "@eslint/js";\nexport default [\n  js.configs.recommended\n];\n`);
      install(d, "--yes");
      assert.equal(syntax(d).status, 0, syntax(d).stderr);
      assert.match(wired(d), /js\.configs\.recommended,\n  \{ ignores: .*\n  \{ plugins/);
    });
    test("an unrecognised shape is left alone and the instructions are printed", () => {
      const d = project();
      const odd = `module.exports = makeConfig();\n`;
      writeFileSync(join(d, "eslint.config.js"), odd);
      const r = install(d, "--yes");
      assert.equal(read(d, "eslint.config.js"), odd);
      assert.match(r.out, /shape not recognised/);
      assert.match(r.out, /viewsonic\/valid-variant/);
    });
    test("no eslint config: instructions only", () => {
      const d = project();
      const r = install(d, "--yes");
      assert.match(r.out, /no eslint\.config/);
      assert.equal(existsSync(join(d, "eslint.config.mjs")), false);
    });
  });
});
