import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { CATEGORIES, scanFile, resolveTypeScript, run } = await load("static/rules.mjs");
const { loadConfig } = await load("config.mjs");

const ts = resolveTypeScript(here);
const ROLES = new Set(["body", "small", "h1", "number-base"]);
const ctxAst = { ts, uiDir: "components/ui" };
const ctxRe = { ts: null, uiDir: "components/ui" };
const PAGE = "app/page.tsx";
const cats = (src, ctx, rel = PAGE) => scanFile(rel, src, ROLES, ctx).map((v) => v.category);

// Both passes must agree on the class-string and raw-element rules.
for (const [label, ctx] of [["typescript AST pass", ctxAst], ["regex fallback pass", ctxRe]]) {
  describe(`rules (${label})`, () => {
    if (label.startsWith("typescript")) {
      test("typescript resolves in this environment", () => assert.ok(ts, "typescript must be resolvable for the AST tests"));
    }
    const BAD = {
      typography: [
        '<p className="text-sm" />',
        '<p className="text-[13px]" />',
        '<p className="font-semibold" />',
        '<p className="font-mono" />',
        '<p className="tracking-tight" />',
        '<p className="leading-6" />',
        '<p className="uppercase" />',
        '<p className="type-nonexistent" />',
      ],
      colour: [
        '<div className="bg-slate-500" />',
        '<div className="bg-white" />',
        '<div className="bg-[#123456]" />',
      ],
      motion: [
        '<div className="duration-300" />',
        '<div className="delay-100" />',
        '<div className="ease-in-out" />',
        '<div className="animate-spin" />',
      ],
      alignment: [
        '<p className="type-body text-center" />',
        '<p className="text-center type-lead" />',
        '<p className="type-small md:text-center">A long sentence that explains the setting in full and clearly runs past one line of the container.</p>',
        '<p className={cn("type-body", "text-center")} />',
      ],
      hierarchy: [
        "export const A = () => <><h1>a</h1><h3>b</h3></>;",
        "export const A = () => <><h2>a</h2><h4>b</h4></>;",
        "export const A = () => <><h1>a</h1><h2>b</h2><h2>c</h2><h5>d</h5></>;",
      ],
      "global-override": [
        '<div className="[&_[data-slot=button]]:min-h-11!" />',
        '<div className="[&_button]:h-11 grid" />',
        '<div className="[&_[role=tab]]:rounded-none" />',
      ],
      components: [
        "export const A = () => <button>x</button>;",
        "export const A = () => <input />;",
        "export const A = () => <textarea />;",
      ],
    };
    test("a bad sample exists for every category", () => assert.deepEqual(Object.keys(BAD).sort(), CATEGORIES.filter((c) => !["interactive-div", "copied-chassis", "override-cluster"].includes(c)).sort()));
    for (const [cat, samples] of Object.entries(BAD)) {
      for (const s of samples) test(`${cat} fires: ${s}`, () => assert.ok(cats(s, ctx).includes(cat), s));
    }

    const GOOD = [
      '<div className="[&_svg]:size-4 [&_p]:mt-2" />',
      '<div className="[&_button]:text-muted" />',
      '<p className="type-body" />',
      '<p className="type-number-base" />',
      '<div className="bg-action text-action-ink rounded-lg p-4" />',
      '<div className="duration-fast ease-standard anim-enter" />',
      '<div className="bg-[var(--color-action)]" />',
      '<div className="text-[Canvas]" />',
      '<input type="file" />',
      "export const A = () => <Button>x</Button>;",
      '<div className="uppercase-not-a-class" />',
      // alignment: centred single short line passes; left-aligned reading text passes
      '<span className="type-small text-center whitespace-nowrap" />',
      // false positives found by scanning the repo: centred captions and empty-state lines
      '<p className="type-small text-center text-muted-foreground">{name}</p>',
      '<p className="type-small mt-3 text-center">Showing {start} of {total} packs</p>',
      '<p className={cn("py-6 text-center type-small", className)} />',
      '<p className={cn("w-full text-center type-small", x)}>No results found.</p>',
      '<span className="type-body text-center truncate" />',
      '<span className="type-small text-center line-clamp-1" />',
      '<span className="type-h1 text-center" />',
      '<p className="type-body text-left" />',
      '<p className="type-body text-centered-not-a-class" />',
      "export const A = () => <h2>Centred</h2>;",
      // hierarchy: sequential, repeated and going back up are all fine
      "export const A = () => <><h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3></>;",
      "export const A = () => <><h2>a</h2><h2>b</h2></>;",
      "export const A = () => <><h3>a</h3><h2>b</h2></>;",
      // lowercase/other tags that merely start with h
      "export const A = () => <><h1>a</h1><header /></>;",
    ];
    for (const s of GOOD) test(`silent: ${s}`, () => assert.deepEqual(cats(s, ctx), []));

    test("raw elements are allowed inside uiDir", () => {
      assert.deepEqual(cats("export const A = () => <button>x</button>;", ctx, "components/ui/button.tsx"), []);
    });
    test("cn() and cva() arguments are class contexts (AST) / className lines (fallback)", () => {
      assert.ok(cats('const c = cn("font-bold", x);', ctx).includes("typography"));
    });
  });
}

describe("rules: alignment and hierarchy details", () => {
  for (const [label, ctx] of [["AST", ctxAst], ["regex", ctxRe]]) {
    test(`${label}: centred button label (single line) is silent`, () => {
      assert.deepEqual(cats('<Button className="type-small text-center whitespace-nowrap">Save</Button>', ctx), []);
    });
    test(`${label}: heading state resets per file`, () => {
      const first = cats("export const A = () => <h1>a</h1>;", ctx, "app/a.tsx");
      const second = cats("export const B = () => <h3>b</h3>;", ctx, "app/b.tsx");
      assert.deepEqual([...first, ...second], []);
    });
    test(`${label}: heading skip is reported with both levels`, () => {
      const v = scanFile(PAGE, "export const A = () => <><h1>a</h1><h4>b</h4></>;", ROLES, ctx).find((x) => x.category === "hierarchy");
      assert.ok(v);
      assert.match(v.why, /h1.*h4/);
    });
    test(`${label}: a heading in a string or comment is not a heading`, () => {
      assert.deepEqual(cats('// <h1>a</h1> <h4>b</h4>\nconst s ="<h1>x</h1><h5>y</h5>";', ctx), []);
    });
  }
});

describe("rules (AST only)", () => {
  test("a raw element hosted by asChild is allowed", () => {
    assert.deepEqual(cats("export const A = () => <Trigger asChild><button>x</button></Trigger>;", ctxAst), []);
  });
  test("a lucide icon outside uiDir must go through Icon", () => {
    const src = 'import { Plus } from "lucide-react";\nexport const A = () => <Plus />;';
    assert.ok(cats(src, ctxAst).includes("components"));
    assert.deepEqual(cats(src, ctxAst, "components/ui/x.tsx"), []);
  });
  test("a documented allow-direct-icon exception passes", () => {
    const src = 'import { Plus } from "lucide-react";\n// allow-direct-icon: legacy\nexport const A = () => <Plus />;';
    assert.deepEqual(cats(src, ctxAst), []);
  });
  test("inline style objects are policed", () => {
    assert.ok(cats('<p style={{ fontSize: 14 }} />', ctxAst).includes("typography"));
    assert.ok(cats('<p style={{ color: "#ff0000" }} />', ctxAst).includes("colour"));
    assert.ok(cats('<p style={{ transition: "all 200ms ease" }} />', ctxAst).includes("motion"));
    assert.deepEqual(cats('<p style={{ color: "var(--color-action)" }} />', ctxAst), []);
  });
});

describe("rules (css)", () => {
  test("hard-coded typography, colour and timing in component CSS fire", () => {
    const css = ".a {\n  font-size: 14px;\n  color: #ff0000;\n  transition: opacity 200ms ease;\n}\n";
    assert.deepEqual(scanFile("components/a.css", css, ROLES, ctxAst).map((v) => v.category), ["typography", "colour", "motion"]);
  });
  test("tokens in component CSS are silent", () => {
    const css = ".a {\n  font-size: var(--text-sm);\n  color: var(--color-action);\n  transition: opacity var(--duration-fast) var(--ease-standard);\n}\n";
    assert.deepEqual(scanFile("components/a.css", css, ROLES, ctxAst), []);
  });
});

describe("rules: run(config)", () => {
  test("clean consumer fixture; type roles come from config.styles", async () => {
    const c = await loadConfig(join(here, "fixtures", "consumer"));
    assert.deepEqual(await run(c, { typescript: ts }), []);
  });
  test("a role defined in an imported stylesheet is a valid type-* class (repo fixture)", async () => {
    const c = await loadConfig(join(here, "fixtures", "repo"));
    assert.deepEqual(await run(c, { typescript: ts }), []);
  });
  test("bad fixture yields well-formed findings", async () => {
    const c = await loadConfig(join(here, "fixtures", "bad"));
    const f = await run(c, { typescript: ts });
    const colour = f.find((x) => x.rule === "colour");
    assert.ok(colour);
    assert.equal(colour.check, "rules");
    assert.equal(colour.file, "components/bad.tsx");
    for (const k of ["found", "why", "fix"]) assert.ok(colour[k] && typeof colour[k] === "string", k);
  });
  test("without typescript the regex pass runs and exactly one note line is emitted", async () => {
    const c = await loadConfig(join(here, "fixtures", "bad"));
    const notes = [];
    const f = await run(c, { typescript: null, note: (m) => notes.push(m) });
    assert.equal(notes.length, 1);
    assert.match(notes[0], /typescript/);
    assert.ok(f.some((x) => x.rule === "colour"));
  });
});
