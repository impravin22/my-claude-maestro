import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");
const repo = resolve(skillDir, "..", "..", "..", "..");
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { loadConfig } = await load("config.mjs");
const tokens = await load("static/tokens.mjs");
const rules = await load("static/rules.mjs");
const refs = await load("static/refs.mjs");
const content = await load("static/content.mjs");

const PATTERNS = ["form", "settings", "list-detail", "dashboard", "data-table", "first-run"];
const dir = join(skillDir, "patterns");
const read = (n) => readFileSync(join(dir, n), "utf8");
const FALLBACK = "only if the user gave no design information";

const SECTIONS = [
  /^## Use when/m,
  /^## Anatomy/m,
  /^## The 13-line design pass/m,
  /^## States/m,
  /^## Skeleton code/m,
  /^## Common failures/m,
];

const blocks = (text) => [...text.matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) => m[1]);

describe("patterns: shape", () => {
  for (const p of PATTERNS) {
    test(`${p}.md has the six sections in order`, () => {
      const text = read(`${p}.md`);
      let at = -1;
      for (const re of SECTIONS) {
        const m = re.exec(text);
        assert.ok(m, `${p}: missing ${re}`);
        assert.ok(m.index > at, `${p}: ${re} out of order`);
        at = m.index;
      }
      assert.match(text, /\*\*Don't use when\*\*/, `${p}: Use when / Don't use when`);
      assert.ok(blocks(text).length >= 1, `${p}: needs a tsx block`);
    });
    test(`${p}.md design pass has thirteen lines`, () => {
      const sec = /## The 13-line design pass[^\n]*\n([\s\S]*?)\n## /.exec(read(`${p}.md`))[1];
      const lines = sec.split("\n").filter((l) => /^\d+\. /.test(l));
      assert.equal(lines.length, 13, `${p}: ${lines.length} lines`);
    });
    test(`${p}.md states cover loading, empty, error, partial, success`, () => {
      const sec = /## States\n([\s\S]*?)\n## /.exec(read(`${p}.md`))[1].toLowerCase();
      for (const s of ["loading", "empty", "error", "partial", "success"]) assert.ok(sec.includes(s), `${p}: ${s}`);
    });
    test(`${p}.md has 3 to 5 common failures`, () => {
      const sec = /## Common failures\n([\s\S]*)$/.exec(read(`${p}.md`))[1];
      const n = sec.split("\n").filter((l) => /^- /.test(l)).length;
      assert.ok(n >= 3 && n <= 5, `${p}: ${n}`);
    });
  }
  test("only the six patterns and the README exist", () => {
    assert.deepEqual(readdirSync(dir).sort(), ["README.md", ...PATTERNS.map((p) => `${p}.md`)].sort());
  });
});

describe("patterns: README", () => {
  const readme = () => read("README.md");
  test("states the fallback rule on its top line", () => {
    const top = readme().split("\n").slice(0, 8).join("\n");
    assert.ok(top.includes(FALLBACK));
  });
  test("routing table names every pattern", () => {
    for (const p of PATTERNS) assert.ok(readme().includes(`(${p}.md)`), p);
  });
  test("says how patterns combine", () => assert.match(readme(), /dashboard \+ data-table/));
  test("SKILL.md step 3 carries the fallback rule and routes to patterns/README.md", () => {
    const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    const step = /## 3\.[^\n]*\n([\s\S]*?)\n## 4\./.exec(skill);
    assert.ok(step);
    assert.ok(skill.split("\n").find((l) => l.startsWith("## 3.")).includes(FALLBACK));
    assert.ok(step[1].includes("patterns/README.md"));
    assert.ok(skill.split("\n").length <= 150);
    assert.equal(skill.split("\n").filter((l) => /^## \d+\./.test(l)).length, 9);
  });
  test("checks/map.md says patterns are never checked", () => {
    assert.match(readFileSync(join(skillDir, "checks", "map.md"), "utf8"), /Patterns are never checked/);
  });
});

describe("patterns: skeleton code passes the static checks", () => {
  let tmp, config;
  const snippets = [];
  for (const p of PATTERNS) blocks(read(`${p}.md`)).forEach((code, i) => snippets.push({ p, i, code }));

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), "viewsonic-patterns-"));
    cpSync(join(repo, "styles"), join(tmp, "styles"), { recursive: true });
    mkdirSync(join(tmp, "app"));
    cpSync(join(repo, "app", "globals.css"), join(tmp, "app", "globals.css"));
    cpSync(join(repo, "components.json"), join(tmp, "components.json"));
    writeFileSync(join(tmp, "package.json"), "{}");
    mkdirSync(join(tmp, "snippets"));
    for (const { p, i, code } of snippets) writeFileSync(join(tmp, "snippets", `${p}-${i}.tsx`), code);
    config = await loadConfig(tmp, { configPath: join(here, "fixtures", "repo", "viewsonic-ui.config.json") });
    config.sources = ["snippets"];
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test("there are snippets", () => assert.ok(snippets.length >= PATTERNS.length));
  test("tokens: zero findings", async () => assert.deepEqual(await tokens.run(config), []));
  test("rules: zero findings", async () => {
    const ts = rules.resolveTypeScript(repo);
    assert.ok(ts, "typescript must resolve for the AST pass");
    assert.deepEqual(await rules.run(config, { typescript: ts, note() {} }), []);
  });
  test("content: zero findings", async () => {
    const ts = rules.resolveTypeScript(repo);
    assert.ok(ts, "typescript must resolve for the AST pass");
    assert.deepEqual(await content.run(config, { typescript: ts, note() {} }), []);
  });
  test("content: zero findings in the regex fallback too", async () => assert.deepEqual(await content.run(config, { typescript: null, note() {} }), []));
  test("content: the States tables carry no flagged copy", () => {
    for (const p of PATTERNS) {
      const sec = /## States\n([\s\S]*?)\n## /.exec(read(`${p}.md`))[1];
      for (const q of sec.matchAll(/"([^"]+)"/g)) {
        assert.ok(!q[1].includes("!"), `${p}: exclamation in "${q[1]}"`);
        assert.doesNotMatch(q[1], /\boops\b|^something went wrong\.?$/i, `${p}: vague error "${q[1]}"`);
      }
    }
  });
  // The real stylesheets declare some vars from component files that are not copied here; only the snippets are judged.
  test("refs: zero findings in the snippets", async () => assert.deepEqual((await refs.run(config)).filter((f) => f.file.startsWith("snippets/")), []));

  test("every ui component in the snippets uses only props and variant values it defines", async () => {
    const { checkSource, loadTables, resolveTs } = await load("props.mjs");
    const ts = resolveTs(repo);
    assert.ok(ts, "typescript must resolve for the prop pass");
    const tables = loadTables(repo);
    assert.ok(tables.cva.size > 0, "the repo's ui components must be readable");
    const bad = [];
    for (const { p, i, code } of snippets) {
      for (const f of checkSource(ts, `snippets/${p}-${i}.tsx`, code, tables)) bad.push(`${p}#${i}:${f.line} ${f.message}`);
    }
    assert.deepEqual(bad, []);
  });

  test("every @/components/ui import names a real export", () => {
    for (const { p, i, code } of snippets) {
      for (const m of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@\/components\/ui\/([\w-]+)"/g)) {
        const file = join(repo, "components", "ui", `${m[2]}.tsx`);
        assert.ok(existsSync(file), `${p}#${i}: no components/ui/${m[2]}.tsx`);
        const src = readFileSync(file, "utf8");
        for (const name of m[1].split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean)) {
          const exported = new RegExp(String.raw`export\s+(?:async\s+)?(?:function|const|class|type)\s+${name}\b|export\s*\{[^}]*\b${name}\b[^}]*\}`).test(src);
          assert.ok(exported, `${p}#${i}: ${name} is not exported by components/ui/${m[2]}.tsx`);
        }
      }
    }
  });
});
