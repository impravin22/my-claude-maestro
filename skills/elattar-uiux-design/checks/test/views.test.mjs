import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const pagesDir = join(here, "fixtures", "pages");
const projectRoot = (() => {
  for (let d = here; ; d = dirname(d)) {
    if (existsSync(join(d, "node_modules", "playwright")) || existsSync(join(d, "node_modules", "@playwright", "test"))) return d;
    if (dirname(d) === d) return null;
  }
})();
const imp = (p) => import(pathToFileURL(join(checksDir, p)).href);
const { loadPlaywright } = await imp("browser/lib.mjs");
const mods = {
  "page-length": await imp("browser/page-length.mjs"),
  "anchor-nav": await imp("browser/anchor-nav.mjs"),
  "nested-radius": await imp("browser/nested-radius.mjs"),
  "nav-reach": await imp("browser/nav-reach.mjs"),
  overlap: await imp("browser/overlap.mjs"),
  truncation: await imp("browser/truncation.mjs"),
};

let server, base, canLaunch = false, why = "";
before(async () => {
  server = createServer((req, res) => {
    const file = join(pagesDir, `${(req.url ?? "/").split("?")[0].replace(/^\//, "") || "good"}.html`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (!projectRoot) { why = "no playwright installed above the skill"; return; }
  try { const b = await loadPlaywright({ root: projectRoot }).launch(); await b.close(); canLaunch = true; } catch (e) { why = `chromium cannot launch: ${String(e.message).split("\n")[0]}`; }
});
after(() => server?.close());

const go = (name, route, cfg = {}) => mods[name].run({ root: projectRoot, baseUrl: base, routes: [], ...cfg }, { routes: [route], base });
const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };

describe("views and navigation checks", () => {
  test("page-length: a 4200px page fires on desktop only; a short one and a raised limit stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("page-length", "/views-long");
    assert.deepEqual(bad.map((f) => f.rule), ["page-length"]);
    assert.match(bad[0].found, /^desktop: the page is 4\.\d screens tall \(limit 3\)/);
    assert.match(bad[0].fix, /split it into views/);
    assert.deepEqual(await go("page-length", "/views-short"), []);
    assert.deepEqual(await go("page-length", "/views-long", { pageLengthDesktop: 6 }), []);
    const phone = await go("page-length", "/views-long", { pageLengthDesktop: 6, pageLengthPhone: 2 });
    assert.match(phone[0].found, /^phone: /);
  });
  test("anchor-nav: a nav of #links fires; real routes and a stray aside stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("anchor-nav", "/anchor-bad");
    assert.ok(bad.length >= 1 && bad.every((f) => f.rule === "anchor-nav"), JSON.stringify(bad));
    assert.match(bad[0].found, /3 of 4 links that jump to #sections/);
    assert.match(bad[0].fix, /switch views, not jump-scroll/);
    assert.deepEqual(await go("anchor-nav", "/anchor-good"), []);
  });
  test("nested-radius: a pill rounder than its track fires with both radii and the inset; concentric, pill-in-pill and far-from-corner stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("nested-radius", "/radius-bad");
    assert.ok(bad.length >= 1, JSON.stringify(bad));
    assert.match(bad[0].found, /radius 12px inside <div\.track> with radius 8px, inset 4px/);
    assert.match(bad[0].fix, /inner radius = outer radius - inset: 8 - 4 = 4px/);
    assert.deepEqual(await go("nested-radius", "/radius-good"), []);
  });
  test("overlap: a badge sitting on a label fires; a spaced badge, a negative-margin stack and stacked lines stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("overlap", "/overlap-bad");
    assert.ok(bad.length >= 1 && bad.every((f) => f.rule === "overlap"), JSON.stringify(bad));
    assert.match(bad[0].found, /"10".*overlaps.*"Notifications"|"Notifications".*overlaps.*"10"/);
    const pill = await go("overlap", "/overlap-pill-bad");
    assert.ok(pill.length >= 1 && pill.every((f) => f.rule === "overlap"), "a badge over the label of a painted pill: " + JSON.stringify(pill));
    assert.deepEqual(await go("overlap", "/overlap-btn-good"), [], "a badge beside the label of a bordered button");
    assert.deepEqual(await go("overlap", "/overlap-good"), []);
  });
  test("truncation: clipped text and a too-wide placeholder fire; ellipsis, line clamp and a fitting placeholder stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("truncation", "/trunc-bad");
    assert.ok(bad.length && bad.every((f) => f.rule === "truncation"), JSON.stringify(bad));
    assert.ok(bad.some((f) => /overflow hidden and no ellipsis/.test(f.found)), JSON.stringify(bad));
    assert.ok(bad.some((f) => /placeholder "Search posts and people" is [0-9]+px wide in a [0-9]+px field/.test(f.found)), JSON.stringify(bad));
    assert.deepEqual(await go("truncation", "/trunc-good"), []);
  });
  test("nav-reach: a nav that scrolls away fires on a tall phone page; sticky nav, a fixed menu button, no nav and a short page stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("nav-reach", "/nav-bad");
    assert.deepEqual(bad.map((f) => f.rule), ["nav-reach"]);
    assert.match(bad[0].found, /^phone: after scrolling to the bottom/);
    assert.match(bad[0].fix, /navigation not reachable without scrolling back/);
    for (const r of ["/nav-good", "/nav-menu-good", "/nav-none", "/views-short"]) assert.deepEqual(await go("nav-reach", r), [], r);
  });
  test("page-length: an endless feed (one repeating list over 60% of the page) is not judged by length", async (t) => {
    if (!guard(t)) return;
    assert.deepEqual(await go("page-length", "/feed"), []);
    assert.deepEqual(await go("nav-reach", "/feed"), [], "its sticky nav is reachable");
  });
  test("nav-reach: a desktop destination hidden at phone width fires; a visible nav and a menu button stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("nav-reach", "/nav-hidden-bad");
    assert.deepEqual(bad.map((f) => f.rule), ["nav-reach"]);
    assert.match(bad[0].found, /^phone: 3 destinations of the desktop navigation have no path at phone width: Alpha \(\/a\), Beta \(\/b\), Gamma \(\/c\)/);
    assert.match(bad[0].fix, /never hide the only path with a breakpoint/);
    for (const r of ["/nav-hidden-menu", "/nav-hidden-ok"]) assert.deepEqual(await go("nav-reach", r), [], r);
  });
  test("all four: a 404 route is route-unreachable, never GOOD", async (t) => {
    if (!guard(t)) return;
    for (const n of Object.keys(mods)) {
      const f = await go(n, "/nope");
      assert.equal(f.length, 1, n);
      assert.equal(f[0].rule, "route-unreachable");
    }
  });
});
