import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { CATEGORIES, scanFile, resolveTypeScript, run, chassisFromSource } = await load("static/rules.mjs");

const ts = resolveTypeScript(here);
const ROLES = new Set(["body", "small"]);
const PAGE = "app/page.tsx";

const BUTTON_SRC = `
import { cva } from "class-variance-authority";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2 disabled:opacity-50",
  { variants: { variant: { default: "bg-action text-action-ink hover:bg-action/90", outline: "border border-input bg-background" } }, defaultVariants: { variant: "default" } },
);
export { buttonVariants };`;

for (const [label, tsMod] of [["typescript AST pass", ts], ["regex fallback pass", null]]) {
  describe(`hand-made components (${label})`, () => {
    const chassis = chassisFromSource("components/ui/button.tsx", BUTTON_SRC, tsMod);
    const ctx = { ts: tsMod, uiDir: "components/ui", chassis };
    const rules = (src, rel = PAGE) => scanFile(rel, src, ROLES, ctx).map((v) => v.category);

    test("the chassis is read with its component name", () => {
      assert.ok(chassis.length >= 1);
      assert.ok(chassis.every((c) => c.name === "Button"));
    });

    const DIV = [
      '<div onClick={go}>x</div>',
      '<span onKeyDown={k}>x</span>',
      '<li onClick={go}>x</li>',
      '<span role="checkbox" aria-checked={on} />',
      '<div role="button">x</div>',
      '<div role="switch" />',
      '<div role="tab" />',
      '<div role="menuitem" />',
      '<div role="radio" />',
      '<div tabIndex={0}>x</div>',
      '<div\n  className="x"\n  onClick={go}\n>x</div>',
    ];
    for (const s of DIV) test(`interactive-div fires: ${s.replace(/\n/g, " ")}`, () => assert.ok(rules(s).includes("interactive-div"), s));

    const QUIET = [
      "<Button onClick={go}>x</Button>",
      "<Trigger asChild><div onClick={go}>x</div></Trigger>",
      '<div className="p-4">x</div>',
      '<div role="dialog">x</div>',
      '<div role="presentation">x</div>',
      "<div tabIndex={-1}>x</div>",
      "<a onClick={go}>x</a>",
      '<div data-onclick="x">x</div>',
      // found by scanning the repo: containers that own a widget role, and a keyboard-scrollable region
      '<div role="group" onClick={stop} onKeyDown={stop} {...props}>x</div>',
      '<div role="tree" onKeyDown={move}>x</div>',
      '<div role="toolbar" onKeyDown={move}>x</div>',
      '<div className="h-52 overflow-y-scroll rounded-lg" tabIndex={0} aria-label="Activity">x</div>',
      '<div\n  className="overflow-auto"\n  tabIndex={0}\n>x</div>',
    ];
    for (const s of QUIET) test(`interactive-div silent: ${s}`, () => assert.ok(!rules(s).includes("interactive-div"), s));

    for (const r of ["menuitemcheckbox", "menuitemradio", "treeitem", "option", "link", "textbox"]) {
      test(`role=${r} with onClick still fires`, () => assert.ok(rules(`<div role="${r}" onClick={go}>x</div>`).includes("interactive-div")));
    }
    test("cn() result passed to a capitalised component is composing", () => {
      const src = 'const c = cn("inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2");\nexport const A = () => <Button className={c}>x</Button>;';
      assert.ok(!rules(src).includes("copied-chassis"));
    });
    test("a slider role with tabIndex still fires (the system has Slider)", () => {
      assert.ok(rules('<div role="slider" tabIndex={0} />').includes("interactive-div"));
    });
    test("tabIndex on a non-scrolling div still fires", () => {
      assert.ok(rules('<div className="p-4" tabIndex={0}>x</div>').includes("interactive-div"));
    });
    test("interactive-div is allowed inside uiDir", () => {
      assert.deepEqual(rules("<div onClick={go}>x</div>", "components/ui/thing.tsx"), []);
    });

    const COPIED = '<div className="inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2 bg-action text-action-ink">x</div>';
    test("copied-chassis fires on a redrawn Button and names it", () => {
      const v = scanFile(PAGE, COPIED, ROLES, ctx).find((x) => x.category === "copied-chassis");
      assert.ok(v);
      assert.match(v.why, /Button/);
    });
    test("copied-chassis fires through cn()", () => {
      const src = 'const c = cn("inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2", x);';
      assert.ok(rules(src).includes("copied-chassis"));
    });
    test("copied-chassis is silent when composing the component", () => {
      assert.ok(!rules("<Button variant=\"outline\">x</Button>").includes("copied-chassis"));
      assert.ok(!rules('<Button className="inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2">x</Button>').includes("copied-chassis"));
    });
    test("copied-chassis is silent below 5 shared classes or 80%", () => {
      assert.ok(!rules('<div className="inline-flex items-center justify-center gap-2">x</div>').includes("copied-chassis"));
      assert.ok(!rules('<div className="inline-flex items-center gap-2 rounded-md p-1 m-1 w-1 h-1 z-1">x</div>').includes("copied-chassis"));
    });
    test("copied-chassis is allowed inside uiDir", () => {
      assert.ok(!rules(COPIED, "components/ui/other.tsx").includes("copied-chassis"));
    });
    test("an asChild trigger hosting a button passes both rules", () => {
      const r = rules("<DialogTrigger asChild><Button>Open</Button></DialogTrigger>");
      assert.deepEqual(r, []);
    });
    test("existing raw-element rule is kept", () => {
      assert.ok(rules("export const A = () => <textarea />;").includes("components"));
    });
  });
}

describe("hand-made components: ids and run(config)", () => {
  test("both rules are in CATEGORIES", () => {
    assert.ok(CATEGORIES.includes("interactive-div"));
    assert.ok(CATEGORIES.includes("copied-chassis"));
  });
  test("run() reads cva strings from the project's ui folder at run time", async () => {
    const root = mkdtempSync(join(tmpdir(), "handmade-"));
    mkdirSync(join(root, "components/ui"), { recursive: true });
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"x"}');
    writeFileSync(join(root, "components/ui/button.tsx"), BUTTON_SRC);
    writeFileSync(join(root, "app/page.tsx"), 'export const A = () => <div onClick={go} className="inline-flex items-center justify-center gap-2 rounded-md type-small transition-colors focus-visible:ring-2">x</div>;\n');
    const config = { root, sources: ["app", "components"], styles: [], uiDir: "components/ui" };
    const f = (await run(config, { typescript: ts })).filter((x) => /interactive-div|copied-chassis/.test(x.rule));
    assert.deepEqual(f.map((x) => x.rule).sort(), ["copied-chassis", "interactive-div"]);
    const c = f.find((x) => x.rule === "copied-chassis");
    assert.match(c.why, /Button/);
    assert.ok(c.fix);
    assert.equal(c.file, "app/page.tsx");
    const g = (await run(config, { typescript: null, note: () => {} })).filter((x) => /interactive-div|copied-chassis/.test(x.rule));
    assert.deepEqual(g.map((x) => x.rule).sort(), ["copied-chassis", "interactive-div"]);
  });
});
