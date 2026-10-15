import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
const M = await imp("browser/motion.mjs");
const { loadPlaywright } = await imp("browser/lib.mjs");

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
const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };

const row = (query, over = {}) => ({
  component: "components/lab.tsx", specimen: `/motion-lab?${query}`, trigger: "#open", dismiss: "#close", target: "#panel",
  in: "anim-enter", idle: "N/A: rests static", out: "anim-exit", ...over,
});
const NA_OUT = { out: "N/A: not under test", dismiss: undefined };
const go = async (rows, note) => M.run({ root: projectRoot, baseUrl: base, motionPhases: rows }, { base, note });
const rulesOf = (f) => [...new Set(f.map((x) => x.rule))].sort();

describe("pure judging", () => {
  const S = (o) => ({ opacity: 1, sx: 1, sy: 1, tx: 0, ty: 0, w: 10, h: 10, ...o });
  test("popsIn: only when the first frame is already at rest and full size", () => {
    assert.equal(M.popsIn([S({}), S({})]), true);
    assert.equal(M.popsIn([S({ opacity: 0 }), S({})]), false);
    assert.equal(M.popsIn([S({ sx: 0.9, sy: 0.9 }), S({})]), false);
    assert.equal(M.popsIn([S({ ty: 12 }), S({})]), false);
    assert.equal(M.popsIn([S({ h: 0 }), S({ h: 100 })]), false, "a size animation is not a pop");
  });
  test("jump: opacity 0.25, scale 0.15, translate 24px per step", () => {
    assert.equal(M.jump([S({ opacity: 0 }), S({ opacity: 0.2 })]), null);
    assert.equal(M.jump([S({ opacity: 0 }), S({ opacity: 0.3 })]).label, "opacity");
    assert.equal(M.jump([S({}), S({ sx: 1.2 })]).label, "scale");
    assert.equal(M.jump([S({}), S({ ty: 25 })]).label, "translate");
  });
  test("handoff compares with the same tolerances", () => {
    assert.equal(M.handoff(S({ opacity: 0.5 }), S({ opacity: 0.6 })), null);
    assert.equal(M.handoff(S({ opacity: 0.5 }), S({ opacity: 1 })).prop, "opacity");
  });
  test("stopStart: stops dead, next starts fast", () => {
    const stopped = Array.from({ length: 31 }, (_, i) => S({ ty: 20 * (1 - Math.min(1, i / 28)) }));
    const fast = { step: 10, series: [S({}), S({ ty: 5 })] };
    assert.ok(M.stopStart(stopped, 10, fast));
    assert.equal(M.stopStart(stopped, 10, { step: 10, series: [S({}), S({})] }), null);
    const moving = Array.from({ length: 31 }, (_, i) => S({ ty: -i }));
    assert.equal(M.stopStart(moving, 10, fast), null);
  });
  test("neighbourSnap: one-step jump fires, smooth travel and unchanged size do not", () => {
    const mk = (tops, h) => tops.map((top) => ({ ...S({ h }), nb: [{ top, left: 0 }] }));
    const hard = M.neighbourSnap({ nbBefore: [{ top: 0, left: 0 }], series: mk([100, 100, 100], 100), sizeBefore: S({ h: 0 }) });
    assert.ok(hard && hard.d === 100);
    const smooth = M.neighbourSnap({ nbBefore: [{ top: 0, left: 0 }], series: mk([10, 30, 60, 90, 100], 100), sizeBefore: S({ h: 0 }) });
    assert.equal(smooth, null);
    assert.equal(M.neighbourSnap({ nbBefore: [{ top: 0, left: 0 }], series: mk([100, 100], 10), sizeBefore: S({ h: 10 }) }), null);
  });
  test("contentCut: instant swap and blank frame fire, a crossfade does not", () => {
    assert.ok(M.contentCut({ changed: true, noMotion: true, series: [] }));
    assert.ok(M.contentCut({ changed: true, series: [{ old: 0, new: 0 }, { old: 0, new: 1 }] }));
    assert.equal(M.contentCut({ changed: true, series: [{ old: 1, new: 0 }, { old: 0.5, new: 0.5 }, { old: 0, new: 1 }] }), null);
    assert.equal(M.contentCut({ changed: false }), null);
  });
  test("reducedMotion: needs an opacity crossfade and no transform", () => {
    const ok = { taken: true, end: 200, series: [S({ opacity: 0 }), S({ opacity: 1 })] };
    assert.equal(M.reducedMotion(ok, "arriving"), null);
    assert.match(M.reducedMotion({ taken: false }, "arriving"), /no animation at all/);
    assert.match(M.reducedMotion({ ...ok, end: 0.01 }, "arriving"), /not a crossfade/);
    assert.match(M.reducedMotion({ ...ok, series: [S({ opacity: 0, sx: 0.9 }), S({})] }, "leaving"), /still scales/);
  });
});

describe("motion (browser)", () => {
  test("good: transition-based fade and scale in, kept mounted until out finishes, reversible, crossfade swap, reduced motion keeps opacity", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await go([row("v=good&s=good", { swap: { trigger: "#swap" } })], (m) => notes.push(m));
    assert.deepEqual(f, [], JSON.stringify(f, null, 1));
    assert.ok(!notes.some((n) => /content-cut not measured/.test(n)), "swap was measured");
  });
  test("pops-in: appears with no animation", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=pop", NA_OUT)]);
    assert.ok(rulesOf(f).includes("pops-in"), JSON.stringify(f));
    assert.equal(f.find((x) => x.rule === "pops-in").check, "motion");
    assert.equal(f.find((x) => x.rule === "pops-in").file, "components/lab.tsx");
  });
  test("jumps: opacity goes 0 to 1 within a step", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=jump", NA_OUT)]);
    assert.ok(f.some((x) => x.rule === "jumps" && /opacity/.test(x.found)), JSON.stringify(f));
  });
  test("a long animation-delay is sampled over the active part: fill-backwards is fine, visible-while-waiting pops", async (t) => {
    if (!guard(t)) return;
    const ok = await go([row("v=delay", NA_OUT)]);
    assert.ok(!ok.some((x) => x.rule === "jumps" || x.rule === "pops-in"), JSON.stringify(ok));
    const bad = await go([row("v=delay-bad", NA_OUT)]);
    assert.ok(bad.some((x) => x.rule === "pops-in"), JSON.stringify(bad));
  });
  test("phase-break: arriving ends at 0.5 and the resting state is 1", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=break", NA_OUT)]);
    assert.ok(f.some((x) => x.rule === "phase-break" && /opacity/.test(x.found)), JSON.stringify(f));
  });
  test("vanishes: removed at once, and removed in the middle of the exit", async (t) => {
    if (!guard(t)) return;
    for (const v of ["vanish", "vanish-mid"]) {
      const f = await go([row(`v=${v}`)]);
      assert.ok(f.some((x) => x.rule === "vanishes"), `${v}: ${JSON.stringify(f)}`);
    }
  });
  test("not-interruptible: leaving restarts at full opacity a quarter of the way into arriving", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=interrupt")]);
    assert.ok(f.some((x) => x.rule === "not-interruptible"), JSON.stringify(f));
    assert.ok(!f.some((x) => x.rule === "vanishes"), "the exit itself is kept mounted");
  });
  test("interruption is read after a React-like deferred flush: a restart is detected, a reversal is not", async (t) => {
    if (!guard(t)) return;
    const bad = await go([row("v=interrupt-defer")]);
    assert.ok(bad.some((x) => x.rule === "not-interruptible"), JSON.stringify(bad));
    const good = await go([row("v=good-defer")]);
    assert.ok(!good.some((x) => x.rule === "not-interruptible"), JSON.stringify(good));
  });
  test("late-start: a 120ms timeout between the click and the change", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=late")]);
    assert.ok(f.some((x) => x.rule === "late-start" && /ms after the click/.test(x.found)), JSON.stringify(f));
  });
  test("stop-start: arriving eases to a stop, then a linear idle motion starts fast", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=stopstart", { idle: "anim-float", ...NA_OUT })]);
    assert.ok(f.some((x) => x.rule === "stop-start"), JSON.stringify(f));
  });
  test("content-cut: a hard swap, and a swap that blanks between old and new", async (t) => {
    if (!guard(t)) return;
    for (const s of ["hard", "blank"]) {
      const f = await go([row(`v=good&s=${s}`, { swap: { trigger: "#swap" }, in: "N/A: x", ...NA_OUT })]);
      assert.deepEqual(rulesOf(f), ["content-cut"], `${s}: ${JSON.stringify(f)}`);
    }
  });
  test("neighbours-snap: height changes in one frame; a height transition travels", async (t) => {
    if (!guard(t)) return;
    const grow = (g) => ({ component: "components/grow.tsx", specimen: `/motion-lab?g=${g}`, trigger: "#toggle", target: "#grow", in: "anim-grow", idle: "N/A: x", out: "N/A: x" });
    const bad = await go([grow("bad")]);
    assert.ok(bad.some((x) => x.rule === "neighbours-snap"), JSON.stringify(bad));
    const good = await go([grow("good")]);
    assert.ok(!good.some((x) => x.rule === "neighbours-snap" || x.rule === "pops-in"), JSON.stringify(good));
  });
  test("reduced-motion: a scale that is not removed under prefers-reduced-motion", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=rm-bad")]);
    assert.ok(f.some((x) => x.rule === "reduced-motion" && /still scales/.test(x.found)), JSON.stringify(f));
  });
  test("a selector that is not on the page is selector-not-found, never GOOD", async (t) => {
    if (!guard(t)) return;
    const f = await go([row("v=good", { trigger: "#nope" })]);
    assert.ok(f.some((x) => x.rule === "selector-not-found"), JSON.stringify(f));
  });
  test("a specimen that 404s is route-unreachable", async (t) => {
    if (!guard(t)) return;
    const f = await go([{ ...row("v=good"), specimen: "/nope" }]);
    assert.equal(f[0].rule, "route-unreachable");
    assert.equal(f[0].found, "/nope returned 404");
  });
  test("rows with no specimen are counted in a note; with none sampled the check is skipped", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    await go([row("v=good"), { component: "components/x.tsx", in: "anim-enter", idle: "N/A: x", out: "anim-exit" }], (m) => notes.push(m));
    assert.ok(notes.some((n) => /1 components have no specimen route - not sampled/.test(n)), notes.join("\n"));
    assert.ok(notes.some((n) => /content-cut not measured for 1 of 1 sampled rows \(the row has no swap\.trigger\)/.test(n)), notes.join("\n"));
    const r = await go([{ component: "components/x.tsx", in: "anim-enter", idle: "N/A: x", out: "anim-exit" }]);
    assert.match(r.skipped, /no motionPhases row has a specimen route/);
  });
  test("Playwright missing in the project: skipped with the install command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-noplaywright-"));
    try {
      const r = await M.run({ root: dir, baseUrl: base, motionPhases: [row("v=good")] }, { base });
      assert.match(r.skipped, /Playwright is not installed/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
