import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { RULE_IDS, scanSource, settingsFrom, run } = await load("static/tokens.mjs");
const { loadConfig } = await load("config.mjs");

const config = {
  root: ".", styles: ["app/globals.css", "styles/tokens.css"], sources: ["app", "components"], uiDir: "components/ui",
  literalAllowed: ["components/brand/mascot/mascot.css"],
  sharedControls: [{ file: "components/ui/questionnaire.tsx", names: ["checkboxControlClassName", "CheckboxMark"] }],
  retiredMotionExempt: ["lib/motion-names.ts", "components/brand/mascot/"],
};
const S = settingsFrom(config);
const PROBE = "components/ui/probe.tsx";
const ids = (src, rel = PROBE) => scanSource(rel, src, S).map((f) => f.rule);

describe("tokens: every rule fires", () => {
  const SAMPLES = {
    "hex-colour": 'const c = "#92C2FC";',
    "rgb-colour": "const c = `rgba(12, 34, 56, 0.4)`;",
    "arbitrary-font-size": '<p className="text-[13px]" />',
    "raw-mono-utility": '<code className="font-mono" />',
    "arbitrary-tracking": '<h1 className="tracking-[0.1em]" />',
    "composed-typography": '<p className="type-small font-semibold" />',
    "arbitrary-duration": '<div className="duration-[220ms]" />',
    "arbitrary-radius": '<div className="rounded-[14px]" />',
    "stock-palette": '<div className="bg-slate-500" />',
    "literal-bw": '<div className="bg-white" />',
    "state-colour-as-text": "color: var(--destructive)",
    "stock-duration": '<div className="duration-300" />',
    "arbitrary-easing": '<div className="ease-[cubic-bezier(0.1,0.2,0.3,0.4)]" />',
    "arbitrary-ring": '<div className="ring-[3px]" />',
    "arbitrary-spacing": '<div className="p-[17px]" />',
    "sub-pixel-spacing": '<div className="translate-y-[--spacing(0.45)]" />',
    "arbitrary-shadow": '<div className="shadow-[0_1px_2px_rgba(0,0,0,.2)]" />',
    "foreign-animation": '<div className="animate-bounce" />',
  };
  test("a sample exists for every declared rule, and vice versa", () => {
    assert.deepEqual([...RULE_IDS].sort(), Object.keys(SAMPLES).sort());
  });
  for (const [id, sample] of Object.entries(SAMPLES)) {
    test(`rule ${id} fires`, () => assert.ok(ids(sample).includes(id), `${id} did not fire on ${sample}`));
  }
  test("class form of state-colour-as-text fires too", () => {
    assert.ok(ids('<p className="text-destructive" />').includes("state-colour-as-text"));
  });
});

describe("tokens: the non-table rules fire", () => {
  test("untokenised-easing", () => assert.ok(ids("animation: fade 1s ease-in;").includes("untokenised-easing")));
  test("untokenised-duration", () => assert.ok(ids("animation: fade 300ms var(--ease-out);").includes("untokenised-duration")));
  test("unverifiable-motion", () => assert.ok(ids("const s = { animation: `x ${d}s ${e}` };").includes("unverifiable-motion")));
  test("composed-typography-call", () => {
    assert.ok(ids('const a = cva("type-small", { variants: { a: "data-active:font-medium" } });').includes("composed-typography-call"));
  });
  test("direct-lucide-jsx", () => {
    assert.ok(ids('import { Plus } from "lucide-react";\nexport const A = () => <Plus />;').includes("direct-lucide-jsx"));
  });
  test("retired-motion-name", () => assert.ok(ids('<div className="anim-jelly-in" />').includes("retired-motion-name")));
  test("duplicated-selection-control (config sharedControls)", () => {
    const f = scanSource("components/ui/questionnaire.tsx", "export const Q = 1;", S);
    assert.deepEqual(f.map((x) => x.rule), ["duplicated-selection-control", "duplicated-selection-control"]);
  });
});

describe("tokens: the sanctioned spelling is silent", () => {
  const OK = [
    '<div className="bg-action text-action-ink" />',
    '<p className="type-body" />',
    '<p className="text-small" />',
    '<span className="type-number-base" />',
    '<h1 className="tracking-tight" />',
    '<div className="duration-fast" />',
    '<div className="ease-standard" />',
    '<div className="rounded-pill" />',
    '<div className="p-4" />',
    '<div className="shadow-pressed" />',
    '<div className="anim-enter" />',
    '<div className="animate-none" />',
    '<div className="p-[--spacing(4)]" />',
    "color: var(--color-destructive-ink)",
    "border-radius: var(--radius-lg);",
    '<div className="rounded-[calc(var(--radius)-3px)]" />',
    "animation: fade var(--duration-fast) var(--ease-out);",
    'import { Plus } from "lucide-react";\nexport const A = () => <Icon icon={Plus} />;',
    "// never write text-[13px] or #ffffff by hand",
  ];
  for (const s of OK) test(`passes: ${s.split("\n").pop().slice(0, 50)}`, () => assert.deepEqual(ids(s), []));

  test("a documented allow-direct-icon exception passes", () => {
    assert.deepEqual(ids('import { Plus } from "lucide-react";\n// allow-direct-icon: legacy\nexport const A = () => <Plus />;'), []);
  });
  test("a declared dynamic animation passes", () => {
    assert.deepEqual(ids("const s = { animation: `x ${d}s ${e}` }; // allow-dynamic-motion: per-item stagger"), []);
  });
  test("retired names are allowed in the configured exempt files", () => {
    assert.deepEqual(ids('<div className="anim-jelly-in" />', "lib/motion-names.ts"), []);
    assert.deepEqual(ids('<div className="lift" />', "components/brand/mascot/mascot.tsx"), []);
  });
  test("a retired name that is an English word counts only where classes are written", () => {
    assert.deepEqual(ids('{ v: "The hover lift and transitions are turned off." }'), []);
    assert.deepEqual(ids('<div className="lift" />'), ["retired-motion-name"]);
    assert.deepEqual(ids('    "rounded-lg lift hover:shadow-e1",'), ["retired-motion-name"]);
    assert.deepEqual(ids('const a = "anim-jelly-in";'), ["retired-motion-name"]);
  });
  test("with no config the design system's own retired-name map is exempt", () => {
    const D = settingsFrom({});
    assert.deepEqual(scanSource("lib/motion-names.ts", '"lift", "anim-jelly-in",', D).map((f) => f.rule), []);
    assert.deepEqual(scanSource("lib/other.ts", 'cn("lift")', D).map((f) => f.rule), ["retired-motion-name"]);
  });
  test("shared control composition is satisfied when the names are used twice", () => {
    const src = "checkboxControlClassName CheckboxMark checkboxControlClassName CheckboxMark";
    assert.deepEqual(scanSource("components/ui/questionnaire.tsx", src, S), []);
  });
});

describe("tokens: no suppression marker, definition files are exempt from literals only", () => {
  test("allow-hardcoded does not save a violation", () => {
    assert.ok(ids('const c = "#92C2FC"; // allow-hardcoded: reason').includes("hex-colour"));
  });
  test("config.styles and literalAllowed hold literals; everything else does not", () => {
    const lit = "color: #92C2FC;";
    assert.deepEqual(scanSource("styles/tokens.css", lit, S), []);
    assert.deepEqual(scanSource("app/globals.css", lit, S), []);
    assert.deepEqual(scanSource("components/brand/mascot/mascot.css", lit, S), []);
    assert.ok(ids(lit).includes("hex-colour"));
  });
  test("the declaration-form ink rule still runs inside definition files", () => {
    assert.ok(scanSource("styles/tokens.css", "color: var(--destructive);", S).some((f) => f.rule === "state-colour-as-text"));
  });
});

describe("tokens: run(config)", () => {
  test("is clean on the consumer fixture", async () => {
    const c = await loadConfig(join(here, "fixtures", "consumer"));
    assert.deepEqual(await run(c, {}), []);
  });
  test("a bad file produces a well-formed finding", async () => {
    const c = await loadConfig(join(here, "fixtures", "bad"));
    const f = await run(c, {});
    const hex = f.find((x) => x.rule === "hex-colour");
    assert.ok(hex);
    assert.equal(hex.check, "tokens");
    assert.equal(hex.file, "components/bad.tsx");
    assert.equal(typeof hex.line, "number");
    for (const k of ["found", "why", "fix"]) assert.ok(hex[k] && typeof hex[k] === "string", k);
  });
});
