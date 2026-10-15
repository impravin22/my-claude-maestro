import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { overrideClusters, CATEGORIES, scanFile } = await import(pathToFileURL(resolve(here, "..", "static/rules.mjs")).href);

const imp = 'import { Button } from "@/components/ui/button";\n';
const file = (rel, body) => ({ rel, src: imp + body });

describe("override-cluster", () => {
  test("is a rules category", () => assert.ok(CATEGORIES.includes("override-cluster")));
  test("the same override on one component 3 times fires once, with review severity and the fix", () => {
    const f = overrideClusters([
      file("app/a.tsx", '<Button className="min-h-11 px-2">a</Button>'),
      file("app/b.tsx", '<Button className="min-h-11">b</Button><Button className={cn("min-h-11", x)}>c</Button>'),
    ]);
    const hit = f.filter((x) => /min-h-11/.test(x.found));
    assert.equal(hit.length, 1, JSON.stringify(f));
    assert.equal(hit[0].rule, "override-cluster");
    assert.equal(hit[0].severity, "review");
    assert.match(hit[0].found, /<Button> is given `min-h-11` 3 times/);
    assert.match(hit[0].fix, /existing variant/);
  });
  test("two uses, spread utilities (gap, w-full), other components, and the ui folder itself stay silent", () => {
    assert.deepEqual(overrideClusters([
      file("app/a.tsx", '<Button className="min-h-11">a</Button><Button className="min-h-11">b</Button>'),
      file("app/b.tsx", '<Button className="w-full gap-2 h-full">a</Button><Button className="w-full gap-2 h-full">b</Button><Button className="w-full gap-2 h-full">c</Button>'),
      file("components/ui/x.tsx", '<Button className="min-h-11">a</Button><Button className="min-h-11">b</Button><Button className="min-h-11">c</Button>'),
      { rel: "app/c.tsx", src: '<Thing className="min-h-11" /><Thing className="min-h-11" /><Thing className="min-h-11" />' },
    ]), []);
  });
});

describe("global-override", () => {
  const ctx = { ts: null, uiDir: "components/ui" };
  const cats = (rel, body) => scanFile(rel, imp + body, new Set(), ctx).filter((v) => v.category === "global-override");
  test("important on a size utility of a system component fires; a plain size and a variant stay silent", () => {
    assert.equal(cats("app/a.tsx", '<Button className="min-h-11!">a</Button>').length, 1);
    assert.equal(cats("app/a.tsx", '<Button className="!h-11">a</Button>').length, 1);
    assert.equal(cats("app/a.tsx", '<Button size="lg" className="w-full">a</Button>').length, 0);
    assert.equal(cats("components/ui/x.tsx", '<Button className="min-h-11!">a</Button>').length, 0);
  });
});


describe("global-override: class strings anywhere, never inside the ui folder", () => {
  const ctx = { ts: null, uiDir: "components/ui" };
  const src = readFileSync(resolve(here, "fixtures/global-override/controls.ts.txt"), "utf8");
  const hits = (rel, text) => scanFile(rel, text, new Set(), ctx).filter((v) => v.category === "global-override");
  test("the old settings controls.ts array fires on every selector and important utility", () => {
    assert.ok(hits("components/settings/controls.ts", src).length >= 9);
  });
  test("the same content inside components/ui is silent", () => {
    assert.equal(hits("components/ui/button-group.tsx", src).length, 0);
  });
});
