import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const skillDir = resolve(checksDir, "..");
const pagesDir = join(here, "fixtures", "pages");
const projectRoot = (() => {
  for (let d = here; ; d = dirname(d)) {
    if (existsSync(join(d, "node_modules", "playwright")) || existsSync(join(d, "node_modules", "@playwright", "test"))) return d;
    if (dirname(d) === d) return null;
  }
})();
const imp = (p) => import(pathToFileURL(join(checksDir, p)).href);
const kb = await imp("browser/keyboard.mjs");
const { loadPlaywright } = await imp("browser/lib.mjs");
const { BROWSER_CHECKS } = await imp("registry.mjs");

let server, base, canLaunch = false, why = "";
before(async () => {
  server = createServer((req, res) => {
    const name = (req.url ?? "/").split("?")[0].replace(/^\//, "") || "good";
    const file = join(pagesDir, `${name}.html`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (!projectRoot) { why = "no playwright installed above the skill"; return; }
  try { const b = await loadPlaywright({ root: projectRoot }).launch(); await b.close(); canLaunch = true; } catch (e) { why = `chromium cannot launch: ${String(e.message).split("\n")[0]}`; }
});
after(() => server?.close());

const config = () => ({ root: projectRoot, baseUrl: base, routes: [] });
const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };
const scan = async (route) => {
  const f = await kb.run(config(), { routes: [route], base });
  assert.ok(Array.isArray(f), JSON.stringify(f));
  return f;
};
const only = (f, rule) => f.filter((x) => x.rule === rule).map((x) => x.found).join("\n");

describe("pure judging", () => {
  const ring = (colour) => ({ tiny: false, name: "<button>", ring: colour ? [{ colour, kind: "outline" }] : [], layers: ["rgb(255, 255, 255)"], image: false });
  test("no ring fails, a dark ring passes, a pale ring fails, the browser's own ring passes", () => {
    assert.match(kb.judgeRing(ring(null)), /no focus indicator/);
    assert.equal(kb.judgeRing(ring("rgb(0, 0, 0)")), null);
    assert.match(kb.judgeRing(ring("rgb(238, 238, 238)")), /1\.\d\d:1/);
    assert.equal(kb.judgeRing({ ...ring(null), ring: [{ auto: true }] }), null);
  });
  test("a ring is measured against the backdrop in the dark theme too", () => {
    assert.equal(kb.judgeRing({ ...ring("rgb(255, 255, 255)"), layers: ["rgb(10, 10, 10)"] }), null);
    assert.ok(kb.judgeRing({ ...ring("rgb(40, 40, 40)"), layers: ["rgb(10, 10, 10)"] }));
  });
  test("a border that changes on focus is the indicator", () => {
    const delta = { on: { border: "rgb(0, 0, 0)", borderW: 2, bg: "rgb(255, 255, 255)" }, off: { border: "rgb(255, 255, 255)", borderW: 2, bg: "rgb(255, 255, 255)" } };
    assert.equal(kb.judgeRing(ring(null), delta), null);
  });
  const at = (y, x = 0, h = 40) => ({ name: `<b@${y}>`, x, y, w: 100, h, fixed: false, tiny: false, dir: "ltr" });
  test("order: going down passes; going up more than a row fails; sidebar to content is not a jump", () => {
    assert.equal(kb.judgeOrder(at(0), at(100)), null);
    assert.ok(kb.judgeOrder(at(500), at(100)));
    assert.equal(kb.judgeOrder(at(500, 0), at(100, 300)), null);
    assert.equal(kb.judgeOrder(at(110), at(100)), null);
    assert.equal(kb.judgeOrder({ ...at(500), fixed: true }, at(100)), null);
  });
  test("order: a same-row jump to the left fails in ltr, not rtl", () => {
    assert.ok(kb.judgeOrder(at(0, 300), at(0, 0)));
    assert.equal(kb.judgeOrder(at(0, 300), { ...at(0, 0), dir: "rtl" }), null);
  });
  test("keyboard is registered and exports a rule id for every finding", () => {
    assert.ok(BROWSER_CHECKS.some((c) => c.name === "keyboard"));
    for (const id of ["focus-invisible", "focus-hidden", "focus-order", "keyboard-trap", "overlay-escape", "unnamed-control", "landmarks", "img-alt", "small-target", "route-unreachable"]) {
      assert.ok(kb.RULE_IDS.includes(id), id);
    }
  });
});

describe("keyboard check on fixture pages", () => {
  test("clean page: silent (inline link, labelled controls, native dialog, accordion toggle)", async (t) => {
    if (!guard(t)) return;
    const f = await scan("/kbd-good");
    assert.deepEqual(f, [], JSON.stringify(f, null, 1));
  });
  test("every finding is shaped like the others", async (t) => {
    if (!guard(t)) return;
    const f = await scan("/kbd-trap");
    assert.ok(f.length > 0);
    for (const x of f) {
      assert.equal(x.check, "keyboard");
      assert.equal(x.file, "/kbd-trap");
      assert.equal(x.line, 0);
      assert.ok(kb.RULE_IDS.includes(x.rule));
      assert.ok(x.found && x.why && x.fix);
    }
  });
  test("a keyboard trap fires keyboard-trap", async (t) => {
    if (!guard(t)) return;
    const f = await scan("/kbd-trap");
    assert.match(only(f, "keyboard-trap"), /Stuck field/);
  });
  test("an invisible and a faint focus ring fire focus-invisible; a shadow ring and a border change do not", async (t) => {
    if (!guard(t)) return;
    const text = only(await scan("/kbd-ring"), "focus-invisible");
    assert.match(text, /light: <button\S*> "No ring at all" shows no focus indicator/);
    assert.match(text, /dark: <button\S*> "No ring at all"/);
    assert.match(text, /"Faint ring" focus ring is \d\.\d\d:1/);
    assert.doesNotMatch(text, /Shadow ring|Border-only/);
  });
  test("a sticky bar over the focused control fires focus-hidden", async (t) => {
    if (!guard(t)) return;
    const text = only(await scan("/kbd-hidden"), "focus-hidden");
    assert.match(text, /Under the banner/);
    assert.match(text, /Sticky banner/);
  });
  test("positive tabindex that runs bottom to top fires focus-order; sidebar then content does not", async (t) => {
    if (!guard(t)) return;
    assert.ok(only(await scan("/kbd-order"), "focus-order"));
    assert.equal(only(await scan("/kbd-columns"), "focus-order"), "");
  });
  test("overlays: Escape ignored, focus lost, Tab leaving a modal are each reported", async (t) => {
    if (!guard(t)) return;
    const f = only(await scan("/kbd-overlay-bad"), "overlay-escape");
    assert.match(f, /Escape does not close the overlay opened by <button#t1>/);
    assert.match(f, /focus is not returned to <button#t2>/);
    assert.match(f, /Tab leaves the open modal from <button#t3>/);
    assert.doesNotMatch(f, /returned to <button#t3>/);
  });
  test("unnamed controls and a name that drops the visible label fire unnamed-control", async (t) => {
    if (!guard(t)) return;
    const f = only(await scan("/kbd-unnamed"), "unnamed-control");
    assert.match(f, /button <button> has no accessible name/);
    assert.match(f, /textbox <input> has no accessible name/);
    assert.match(f, /link <a> has no accessible name/);
    assert.match(f, /named "Close" but shows "Save changes"/);
  });
  test("no main and two h1, and two mains, fire landmarks", async (t) => {
    if (!guard(t)) return;
    const none = only(await scan("/kbd-landmarks-none"), "landmarks");
    assert.match(none, /0 <main>/);
    assert.match(none, /2 <h1>/);
    const two = only(await scan("/kbd-landmarks-two"), "landmarks");
    assert.match(two, /2 <main>/);
  });
  test("an img without alt fires img-alt; alt=\"\" does not", async (t) => {
    if (!guard(t)) return;
    const f = (await scan("/kbd-img")).filter((x) => x.rule === "img-alt");
    assert.equal(f.length, 1, JSON.stringify(f));
  });
  test("a crowded 20px button fires small-target; an inline link, a spaced 20px button and a 32px button do not", async (t) => {
    if (!guard(t)) return;
    const f = only(await scan("/kbd-target"), "small-target");
    assert.match(f, /"x" is 20x20px: fails WCAG 2\.5\.8 \(24x24 minimum/);
    assert.doesNotMatch(f, /terms of use|Isolated|Medium/);
  });
  test("24 to 44px controls get a per-route NOTE, not a finding", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await kb.run(config(), { routes: ["/kbd-target"], base, note: (m) => notes.push(m) });
    assert.doesNotMatch(only(f, "small-target"), /Medium|Wrapped/);
    assert.ok(notes.some((n) => /controls are below 44px - fine for dense UI/.test(n)), notes.join(" | "));
  });
  test("a bad ring inside <main> is found even when 210 nav links come first", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await kb.run(config(), { routes: ["/kbd-longnav"], base, note: (m) => notes.push(m) });
    assert.match(only(f, "focus-invisible"), /"Hidden in main" shows no focus indicator/);
    assert.equal(only(f, "keyboard-trap"), "");
    assert.deepEqual(notes.filter((n) => /stopped after/.test(n)), []);
  });
  test("a prefilled aria-labelled field does not fire label-in-name; a visible label that disagrees does", async (t) => {
    if (!guard(t)) return;
    assert.equal(only(await scan("/kbd-labelname-ok"), "unnamed-control"), "");
    assert.match(only(await scan("/kbd-labelname-bad"), "unnamed-control"), /named "Address" but shows "Email"/);
  });
  test("a passing stop is never blurred: an onblur handler that runs only on script blur stays silent", async (t) => {
    if (!guard(t)) return;
    const f = await scan("/kbd-blur");
    assert.deepEqual(f, [], JSON.stringify(f));
  });
  test("measureTargets is exported for the UX check", async (t) => {
    if (!guard(t)) return;
    const browser = await loadPlaywright({ root: projectRoot }).launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${base}/kbd-target`);
      assert.ok((await kb.measureTargets(page, 44)).some((s) => s.w === 20 && s.h === 20));
      assert.equal((await kb.measureTargets(page, 10)).length, 0);
    } finally { await browser.close(); }
  });
  test("a route that does not load is route-unreachable", async (t) => {
    if (!guard(t)) return;
    const f = await scan("/nope");
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, "route-unreachable");
  });
});

describe("rules/accessibility.md", () => {
  const md = readFileSync(join(skillDir, "rules", "accessibility.md"), "utf8");
  test("names every rule id the keyboard check can fire", () => {
    for (const id of kb.RULE_IDS) assert.ok(md.includes("`" + id + "`") || id === "route-unreachable", `accessibility.md lacks ${id}`);
  });
  test("every item has Rule, Why, System tool, Judge it", () => {
    const sections = md.split(/^## /m).slice(1);
    assert.ok(sections.length >= 10);
    for (const s of sections) for (const p of ["**Rule.**", "**Why.**", "**System tool.**", "**Judge it.**"]) assert.ok(s.includes(p), `${s.split("\n")[0]} lacks ${p}`);
  });
  test("names the WCAG 2.2 success criteria it owns", () => {
    for (const sc of ["2.1.1", "2.1.2", "2.4.3", "2.4.7", "1.4.11", "2.4.11", "2.5.8", "4.1.2", "2.5.3", "4.1.3", "1.1.1"]) assert.ok(md.includes(sc), sc);
  });
});
