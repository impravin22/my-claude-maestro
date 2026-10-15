import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { analyse, settingsFrom, RULE_IDS, run } = await load("static/refs.mjs");
const { loadConfig } = await load("config.mjs");

const CSS = [
  "@theme {",
  "  --color-action: oklch(0.6 0.2 260);",
  "  --color-value: oklch(0.7 0.15 150);",
  "  --shadow-e1: 0 1px 2px oklch(0 0 0 / 0.2);",
  "  --font-sans: Inter;",
  "  --background: white;",
  "  --border: gray;",
  "}",
  "@utility anim-enter { animation: none; }",
  "@utility glow-action { box-shadow: none; }",
  ".type-body { font-size: 1rem; }",
  ".type-h1 {",
  "  font-weight: 600;",
  "}",
  ".type-h2 { font-weight: 600; }",
].join("\n");

const S = settingsFrom({ allowVars: ["--font-geist-mono"], allowVarPrefixes: ["--sonner-"], deadUtilityExempt: ["lib/motion-names.ts"] });
const kinds = (code, rel = "components/x.tsx", settings = S, extra = {}) =>
  analyse({ cssFiles: [CSS], componentCssTexts: [], sources: [{ rel: "app/globals.css", text: CSS }, { rel, text: code }], ...extra }, settings).map((f) => f.kind);

describe("refs: every rule fires on a dead reference", () => {
  const BAD = {
    "dead-utility": '<div className="anim-missing" />',
    "dead-type": '<p className="type-h9" />',
    "dead-font": '<p className="font-heading" />',
    "dead-shadow": '<div className="shadow-btn-gold" />',
    "dead-colour": '<div className="fill-gold" />',
    "undeclared-var": ".a { color: var(--color-foreground-subtle); }",
  };
  test("a sample exists for every rule id", () => assert.deepEqual([...RULE_IDS].sort(), Object.keys(BAD).sort()));
  for (const [id, code] of Object.entries(BAD)) {
    test(`${id} fires`, () => assert.ok(kinds(code).includes(id), code));
  }
});

describe("refs: the resolving spelling is silent", () => {
  const OK = [
    '<div className="anim-enter glow-action" />',
    '<p className="type-body type-h1 type-h2" />',
    '<p className="font-sans font-semibold" />',
    '<div className="shadow-e1" />',
    '<div className="shadow-none shadow-md" />',
    '<div className="bg-action text-value border-border bg-background/50" />',
    '<div className="border-2 ring-3 text-left bg-transparent" />',
    '<div className="animate-in animate-out" />',
    ".a { color: var(--color-action); }",
    '.a { font-family: var(--font-geist-mono); }',
    ".a { gap: var(--sonner-offset); width: var(--radix-popover-trigger-width); margin: var(--tw-x); }",
    "// the class anim-missing was retired\nconst a = 1;",
    '/* type-h9 and var(--nope) are only prose here */\nconst a = 1;',
    '<div style={{ "--cell": 1 }} className="p-[var(--cell)]" />',
  ];
  for (const code of OK) test(`passes: ${code.split("\n").pop().slice(0, 60)}`, () => assert.deepEqual(kinds(code), []));

  test("a custom property declared in a scanned source resolves", () => {
    assert.deepEqual(kinds('const a = { "--skeleton-width": w }; const b = "[--x:1] var(--skeleton-width)";'), []);
  });
  test("bloom-1 style custom properties are not utilities", () => {
    assert.deepEqual(kinds(".a { --bloom-1: red; } .b { x: bloom-1 }", "components/a.css"), []);
  });
});

describe("refs: config-driven allow-lists", () => {
  test("allowVars: an unlisted runtime var is flagged, a listed one is not", () => {
    assert.ok(kinds(".a { x: var(--font-geist-mono); }", "components/a.css", settingsFrom({})).includes("undeclared-var"));
    assert.deepEqual(kinds(".a { x: var(--font-geist-mono); }"), []);
  });
  test("allowVarPrefixes", () => {
    assert.ok(kinds(".a { x: var(--sonner-w); }", "components/a.css", settingsFrom({})).includes("undeclared-var"));
  });
  test("deadUtilityExempt: a migration-record file may name retired utilities", () => {
    assert.deepEqual(kinds('const before = "anim-jelly-in";', "lib/motion-names.ts"), []);
    assert.ok(kinds('const before = "anim-jelly-in";', "lib/other.ts").includes("dead-utility"));
  });
  test("component-owned CSS classes count as defined utilities", () => {
    assert.deepEqual(kinds('<div className="anim-landing-intro" />', "components/x.tsx", S, { componentCssTexts: [".anim-landing-intro { opacity: 1; }"] }), []);
  });
  test("a var() with a fallback is never dropped, so it is not flagged", () => {
    assert.deepEqual(kinds(".a { width: min(var(--toast-w, 22rem), 100%); }", "components/a.css", settingsFrom({})), []);
    assert.ok(kinds(".a { width: var(--toast-w); }", "components/a.css", settingsFrom({})).includes("undeclared-var"));
  });
  test("Base UI's runtime positioner vars count as declared with no config", () => {
    assert.deepEqual(kinds(".a { width: var(--anchor-width); max-height: var(--available-height); }", "components/a.css", settingsFrom({})), []);
  });
  test("with no config the design system's retired-name map is exempt from dead-utility", () => {
    assert.deepEqual(kinds('const before = "anim-jelly-in";', "lib/motion-names.ts", settingsFrom({})), []);
  });
  test("ownedPrefixes can be overridden", () => {
    const s = settingsFrom({ ownedPrefixes: ["zap"] });
    assert.ok(kinds('<div className="zap-missing" />', "components/x.tsx", s).includes("dead-utility"));
    assert.deepEqual(kinds('<div className="anim-missing" />', "components/x.tsx", s), []);
  });
});

describe("refs: run(config)", () => {
  test("repo-shaped fixture resolves everything (imports followed)", async () => {
    const c = await loadConfig(join(here, "fixtures", "repo"));
    assert.deepEqual(await run(c, {}), []);
  });
  test("consumer fixture resolves everything", async () => {
    const c = await loadConfig(join(here, "fixtures", "consumer"));
    assert.deepEqual(await run(c, {}), []);
  });
  test("findings use the shared shape", async () => {
    const c = await loadConfig(join(here, "fixtures", "bad"));
    const f = await run(c, {});
    const dead = f.find((x) => x.rule === "dead-colour" || x.rule === "dead-type" || x.rule === "dead-utility");
    assert.ok(dead, JSON.stringify(f));
    assert.equal(dead.check, "refs");
    assert.equal(typeof dead.line, "number");
    for (const k of ["file", "found", "why", "fix"]) assert.ok(dead[k] && typeof dead[k] === "string", k);
  });
});
