import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { loadConfig } = await import(pathToFileURL(resolve(here, "..", "config.mjs")).href);
const fx = (name) => join(here, "fixtures", name);

describe("loadConfig: repo-shaped project", () => {
  test("finds root, styles (entry + recursive imports), sources, uiDir, routes", async () => {
    const c = await loadConfig(join(fx("repo"), "components", "ui"));
    assert.equal(c.root.split("\\").join("/"), fx("repo").split("\\").join("/"));
    assert.deepEqual(c.styles, [
      "app/globals.css",
      "styles/tokens.css",
      "styles/typeset.css",
      "styles/typeset-extra.css",
      "styles/motion.css",
      "styles/utilities.css",
    ]);
    assert.deepEqual(c.sources, ["app", "components", "lib", "hooks"]);
    assert.equal(c.uiDir, "components/ui");
    assert.deepEqual(c.routes, ["/", "/design-system/colors", "/pricing"]);
    assert.equal(c.baseUrl, "http://localhost:3000");
    assert.ok(c.motionPhases.length > 0 && c.motionPhases.every((r) => r.component && r.in && r.idle && r.out), "the repo fixture carries one phase row per animated file");
    assert.deepEqual(c.contrastPairs, []);
    assert.equal(typeof c.hasPlaywright, "boolean");
  });
});

describe("loadConfig: fresh shadcn consumer", () => {
  test("tokens inline in globals.css, no src/, no hooks/", async () => {
    const c = await loadConfig(fx("consumer"));
    assert.deepEqual(c.styles, ["app/globals.css"]);
    assert.deepEqual(c.sources, ["app", "components", "lib"]);
    assert.equal(c.uiDir, "components/ui");
    assert.deepEqual(c.routes, ["/"]);
  });
});

describe("loadConfig: edge cases", () => {
  const tmp = mkdtempSync(join(tmpdir(), "viewsonic-cfg-"));
  const w = (p, s) => { mkdirSync(dirname(join(tmp, p)), { recursive: true }); writeFileSync(join(tmp, p), s); };

  test("no components.json throws the shadcn init message", async () => {
    const bare = join(tmp, "bare"); mkdirSync(bare);
    writeFileSync(join(bare, "package.json"), "{}");
    await assert.rejects(loadConfig(bare), /Not a shadcn project - run npx shadcn@latest init first/);
  });

  test("src/ layout resolves aliases and routes under src/", async () => {
    const d = "src-app";
    w(`${d}/package.json`, "{}");
    w(`${d}/components.json`, JSON.stringify({ tailwind: { css: "src/app/globals.css" }, aliases: { components: "@/components", ui: "@/components/ui", lib: "@/lib" } }));
    w(`${d}/src/app/globals.css`, "@theme { --color-a: red; }");
    w(`${d}/src/app/page.tsx`, "export default () => null");
    w(`${d}/src/components/ui/x.tsx`, "export {}");
    w(`${d}/src/lib/u.ts`, "export {}");
    const c = await loadConfig(join(tmp, d));
    assert.deepEqual(c.styles, ["src/app/globals.css"]);
    assert.deepEqual(c.sources, ["src/app", "src/components", "src/lib"]);
    assert.equal(c.uiDir, "src/components/ui");
    assert.deepEqual(c.routes, ["/"]);
  });

  test("viewsonic-ui.config.json overrides any field and passes extra keys through", async () => {
    const d = "override";
    w(`${d}/package.json`, "{}");
    w(`${d}/components.json`, JSON.stringify({ tailwind: { css: "app/globals.css" }, aliases: { ui: "@/components/ui" } }));
    w(`${d}/app/globals.css`, "@theme { --color-a: red; }");
    w(`${d}/app/page.tsx`, "export default () => null");
    w(`${d}/viewsonic-ui.config.json`, JSON.stringify({ baseUrl: "http://localhost:4000", routes: ["/a", "/b"], motionPhases: [{ name: "x" }], allowVars: ["--font-geist-mono"] }));
    const c = await loadConfig(join(tmp, d));
    assert.equal(c.baseUrl, "http://localhost:4000");
    assert.deepEqual(c.routes, ["/a", "/b"]);
    assert.deepEqual(c.motionPhases, [{ name: "x" }]);
    assert.deepEqual(c.allowVars, ["--font-geist-mono"]);
    assert.deepEqual(c.styles, ["app/globals.css"]);
  });

  test("explicit configPath option wins over the project file", async () => {
    const d = "override";
    const alt = join(tmp, "alt.json");
    writeFileSync(alt, JSON.stringify({ baseUrl: "http://localhost:5000" }));
    const c = await loadConfig(join(tmp, d), { configPath: alt });
    assert.equal(c.baseUrl, "http://localhost:5000");
  });

  test("a wrongly typed override fails at once and names the key; auth.storageState passes through", async () => {
    const d = "override";
    const over = join(tmp, d, "viewsonic-ui.config.json");
    const original = readFileSync(over, "utf8");
    for (const [bad, msg] of [
      [{ routes: "/" }, /viewsonic-ui\.config\.json: routes must be an array/],
      [{ motionPhases: {} }, /motionPhases must be an array/],
      [{ baseUrl: 3000 }, /baseUrl must be a string/],
      [{ auth: "x" }, /auth must be an object/],
      [{ auth: { storageState: 5 } }, /auth\.storageState must be a path/],
      [{ contrastLevel: "A" }, /contrastLevel must be "AA" or "AAA" \(AA is the floor/],
      [[], /must be a JSON object/],
    ]) {
      writeFileSync(over, JSON.stringify(bad));
      await assert.rejects(loadConfig(join(tmp, d)), msg);
    }
    writeFileSync(over, JSON.stringify({ auth: { storageState: "e2e/.auth/user.json" } }));
    assert.equal((await loadConfig(join(tmp, d))).auth.storageState, "e2e/.auth/user.json");
    writeFileSync(over, original);
  });

  test("cleanup", () => { rmSync(tmp, { recursive: true, force: true }); });
});
