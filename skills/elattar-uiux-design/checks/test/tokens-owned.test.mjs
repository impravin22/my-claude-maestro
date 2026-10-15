import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { scanSource, scanOwned, settingsFrom, EXTRA_RULE_IDS } = await import(
  pathToFileURL(resolve(here, "..", "static/tokens.mjs")).href
);
const S = settingsFrom({ root: ".", styles: [], sources: [] });
const ids = (rel, src) => scanSource(rel, src, S).map((f) => f.rule);
const owned = (files) => scanOwned(files.map(([file, source]) => ({ file, source }))).map((f) => `${f.rule}@${f.file}`);

const MARK = "/* owned: the design asks for a 3px track, approved 2026-10-11 */";

describe("component-owned values", () => {
  test("rule ids are declared", () => {
    for (const id of ["owned-value-unmarked", "owned-value-leak", "owned-value-reused"]) assert.ok(EXTRA_RULE_IDS.includes(id), id);
  });

  test("a marked class declaration passes, and its literal is not a hardcoded value", () => {
    const src = `${"{"}/* owned: track height from the design, approved 2026-10-11 */}\n<div className="[--meter-track:13px] h-(--meter-track)" />`;
    assert.deepEqual(ids("components/ui/meter.tsx", src), []);
  });

  test("a marked style declaration passes", () => {
    const src = `${MARK}\nconst s = { "--meter-track": "13px" };`;
    assert.deepEqual(ids("components/ui/meter.tsx", src), []);
  });

  test("a marked CSS-style declaration passes", () => {
    assert.deepEqual(ids("components/ui/meter.css", `${MARK}\n.meter { --meter-track: 13px; }`), []);
  });

  test("unmarked fires owned-value-unmarked", () => {
    assert.ok(ids("components/ui/meter.tsx", '<div className="[--meter-track:13px]" />').includes("owned-value-unmarked"));
    assert.ok(ids("components/ui/meter.tsx", 'const s = { "--meter-track": "13px" };').includes("owned-value-unmarked"));
  });

  test("a comment without a reason and date does not count", () => {
    assert.ok(ids("components/ui/meter.tsx", '/* owned: */\n<div className="[--meter-track:13px]" />').includes("owned-value-unmarked"));
  });

  test("the component is the file's base name, kebab-cased; index uses the folder", () => {
    const src = `${MARK}\n<div className="[--date-picker-gap:13px]" />`;
    assert.deepEqual(ids("components/ui/DatePicker.tsx", src), []);
    assert.deepEqual(ids("components/ui/date-picker/index.tsx", src), []);
  });

  test("a custom property that is not the file's own is not owned: its literal still fails", () => {
    const f = ids("components/ui/meter.tsx", `${MARK}\n<div className="[--other-gap:13px]" />`);
    assert.ok(!f.includes("owned-value-unmarked"));
  });

  test("a literal anywhere else still fails as today", () => {
    assert.ok(ids("components/ui/meter.tsx", `${MARK}\n<div className="[--meter-track:13px] p-[13px]" />`).includes("arbitrary-spacing"));
  });

  test("leak: another file reads the owned property", () => {
    const meter = `${MARK}\n<div className="[--meter-track:13px]" />`;
    const page = '<div style={{ height: "var(--meter-track)" }} />';
    assert.deepEqual(owned([["components/ui/meter.tsx", meter], ["app/page.tsx", page]]), ["owned-value-leak@app/page.tsx"]);
  });

  test("the declaring file reading its own property is not a leak", () => {
    const meter = `${MARK}\n<div className="[--meter-track:13px] h-[var(--meter-track)]" />`;
    assert.deepEqual(owned([["components/ui/meter.tsx", meter]]), []);
  });

  test("reused: the same literal owned by two components", () => {
    const a = `${MARK}\n<div className="[--meter-track:13px]" />`;
    const b = `${MARK}\n<div className="[--gauge-bar:13px]" />`;
    assert.deepEqual(owned([["components/ui/meter.tsx", a], ["components/ui/gauge.tsx", b]]).sort(),
      ["owned-value-reused@components/ui/gauge.tsx", "owned-value-reused@components/ui/meter.tsx"]);
  });

  test("a token alias is not an invented literal: no comment needed", () => {
    const src = '<div className="[--card-spacing:--spacing(4)] gap-(--card-spacing)" />';
    assert.deepEqual(ids("components/ui/card.tsx", src), []);
  });

  test("page.tsx uses its folder as the component, so --page-* in a doc sample is not owned", () => {
    assert.deepEqual(ids("app/docs/meter/page.tsx", "const code = ':root { --page-glow: hsl(240 30% 98%); }';"), []);
  });

  test("a token-driven calc() is an alias and passes", () => {
    assert.deepEqual(ids("components/ui/meter.tsx", '<div className="[--meter-track:calc(var(--space-2)+13px)]" />'), []);
    assert.deepEqual(ids("components/ui/meter.tsx", '<div className="[--meter-track:calc(var(--radius)-2px)]" />'), []);
  });

  test("a hex inside a token-driven value still fires hex-colour", () => {
    const f = ids("components/ui/meter.tsx", '<div className="[--meter-bg:color-mix(in_oklab,var(--primary)_40%,#ff0000)]" />');
    assert.ok(f.includes("hex-colour"), f.join());
  });

  test("a value with no token at all needs the mark", () => {
    assert.ok(ids("components/ui/meter.tsx", '<div className="[--meter-track:13px]" />').includes("owned-value-unmarked"));
  });

  test("the mark needs a date", () => {
    assert.ok(ids("components/ui/meter.tsx", `/* owned: because, approved x */
<div className="[--meter-track:13px]" />`).includes("owned-value-unmarked"));
  });

  test("a token-driven calc() is an alias and passes", () => {
    assert.deepEqual(ids("components/ui/meter.tsx", '<div className="[--meter-track:calc(var(--space-2)+13px)]" />'), []);
    assert.deepEqual(ids("components/ui/meter.tsx", '<div className="[--meter-track:calc(var(--radius)-2px)]" />'), []);
  });

  test("a hex inside a token-driven value still fires hex-colour", () => {
    const f = ids("components/ui/meter.tsx", '<div className="[--meter-bg:color-mix(in_oklab,var(--primary)_40%,#ff0000)]" />');
    assert.ok(f.includes("hex-colour"), f.join());
  });

  test("a value with no token at all needs the mark", () => {
    assert.ok(ids("components/ui/meter.tsx", '<div className="[--meter-track:13px]" />').includes("owned-value-unmarked"));
  });

  test("the mark needs a date", () => {
    assert.ok(ids("components/ui/meter.tsx", '/* owned: because, approved x */\n<div className="[--meter-track:13px]" />').includes("owned-value-unmarked"));
  });

  test("different literals in two components are fine", () => {
    const a = `${MARK}\n<div className="[--meter-track:13px]" />`;
    const b = `${MARK}\n<div className="[--gauge-bar:14px]" />`;
    assert.deepEqual(owned([["components/ui/meter.tsx", a], ["components/ui/gauge.tsx", b]]), []);
  });
});
