import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const pagesDir = join(here, "fixtures", "pages");
// The "project" is the repo that has playwright installed (walk up to the nearest node_modules/playwright).
const projectRoot = (() => {
  for (let d = here; ; d = dirname(d)) {
    if (existsSync(join(d, "node_modules", "playwright")) || existsSync(join(d, "node_modules", "@playwright", "test"))) return d;
    if (dirname(d) === d) return null;
  }
})();
const imp = (p) => import(pathToFileURL(join(checksDir, p)).href);
const { run: contrastRun, judge, compositeLayers } = await imp("browser/contrast.mjs");
const { shots } = await imp("browser/shots.mjs");
const { loadPlaywright, routesFor } = await imp("browser/lib.mjs");
const { fixRoute } = await imp("run.mjs");

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
  const chromium = loadPlaywright({ root: projectRoot });
  try { const b = await chromium.launch(); await b.close(); canLaunch = true; } catch (e) { why = `chromium cannot launch: ${String(e.message).split("\n")[0]}`; }
});
after(() => server?.close());

const config = () => ({ root: projectRoot, baseUrl: base, routes: [] });
const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };

describe("pure judging", () => {
  test("translucent layers composite onto the layer below", () => {
    const c = compositeLayers(["rgba(255, 255, 255, 0.500)", "rgb(17, 17, 17)"]);
    assert.ok(Math.abs(c.r - 136) < 1);
  });
  test("opacity lowers the effective foreground", () => {
    const base = { fg: "rgb(0, 0, 0)", image: false, layers: ["rgb(255, 255, 255)"], kind: "text", what: "x" };
    assert.equal(judge([{ ...base, opacity: 1 }]).bad.length, 0);
    assert.equal(judge([{ ...base, opacity: 0.3 }]).bad.length, 1);
  });
  test("image samples are counted, not judged", () => {
    const j = judge([{ fg: "rgb(200,200,200)", image: true, layers: [], kind: "text", what: "x", opacity: 1 }]);
    assert.deepEqual([j.bad.length, j.images], [0, 1]);
  });
});

describe("contrast-rendered", () => {
  test("bad page: BAD findings in both themes, with the route, kind and numbers", async (t) => {
    if (!guard(t)) return;
    const f = await contrastRun(config(), { routes: ["/bad"], base });
    assert.ok(Array.isArray(f), JSON.stringify(f));
    assert.ok(f.length >= 3, JSON.stringify(f, null, 1));
    for (const x of f) {
      assert.equal(x.check, "contrast-rendered");
      assert.equal(x.file, "/bad");
      assert.equal(x.line, 0);
      assert.match(x.found, /^(light|dark) ".+" \d+\.\d\d:1 \(need [\d.]+\) fg=rgb\(.+\) bg=rgb\(.+\)$/);
      assert.match(x.fix, /run\.mjs contrast --fg/);
    }
    const found = f.map((x) => x.found).join("\n");
    assert.match(found, /light "Low contrast text"/);
    assert.match(found, /dark "Low contrast text"/);
    assert.match(found, /"Text on a translucent overlay"/);
    assert.match(found, /"Dimmed by opacity"/);
    assert.ok(f.some((x) => x.rule === "rendered-ui" && /<input> boundary/.test(x.found)), "form-control border");
    assert.doesNotMatch(found, /Disabled is exempt|Hidden from assistive/);
    assert.ok(f.some((x) => x.rule === "rendered-ui" && /<button> boundary/.test(x.found) && /1\.00:1/.test(x.found)), "unbordered, unfilled switch is an invisible boundary");
  });
  test("good page: a filled borderless switch passes; an entrance colour animation is measured at its end state; effective opacity 0 is not judged", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await contrastRun(config(), { routes: ["/good"], base, note: (m) => notes.push(m) });
    assert.deepEqual(f, [], JSON.stringify(f));
  });
  test("WCAG scope: text toggles are exempt, a wrapped textarea passes, a fill-only selection is measured, a bare textarea fails", async (t) => {
    if (!guard(t)) return;
    const good = await contrastRun(config(), { routes: ["/good"], base });
    assert.deepEqual(good, [], "text toggle (bold selection) and bordered composer are fine");
    const bad = (await contrastRun(config(), { routes: ["/bad"], base })).map((x) => x.found).join(" | ");
    assert.match(bad, /"<button> selected state" 1\.\d\d:1/);
    assert.match(bad, /"<textarea> boundary" 1\.00:1/);
  });
  test("judge: wrapper boundary and selected state", () => {
    const L = ["rgb(255, 255, 255)"];
    const entry = { what: "<textarea> boundary", kind: "ui", opacity: 1, alts: [
      { fg: null, fill: null, layers: L }, { fg: "rgb(85, 85, 85)", fill: null, layers: L } ] };
    assert.equal(judge([entry]).bad.length, 0);
    assert.equal(judge([{ ...entry, alts: [entry.alts[0]] }]).bad.length, 1);
    const sel = (pill) => ({ what: "<button> selected state", kind: "ui", opacity: 1, sel: [pill], layers: L });
    assert.equal(judge([sel("rgb(17, 17, 17)")]).bad.length, 0);
    assert.equal(judge([sel("rgb(238, 238, 238)")]).bad.length, 1);
  });
  test("a route that does not load is a route-unreachable finding, never GOOD", async (t) => {
    if (!guard(t)) return;
    const f = await contrastRun(config(), { routes: ["/nope"], base });
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, "route-unreachable");
    assert.equal(f[0].found, "/nope returned 404");
  });
  test("page-canvas gradient fallbacks are counted in a note", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    await contrastRun(config(), { routes: ["/canvas"], base, note: (m) => notes.push(m) });
    assert.ok(notes.some((n) => /samples judged against the base colour of a page-canvas gradient/.test(n)), notes.join(" | "));
  });
  test("good page: no findings", async (t) => {
    if (!guard(t)) return;
    const f = await contrastRun(config(), { routes: ["/good"], base });
    assert.deepEqual(f, []);
  });
  test("text over a background image is a note, not a finding", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await contrastRun(config(), { routes: ["/image"], base, note: (m) => notes.push(m) });
    assert.deepEqual(f, []);
    assert.ok(notes.some((n) => /\d+ samples over images → review in screenshots/.test(n)), notes.join("\n"));
  });
  test("routes fall back to config.routes; --routes wins", () => {
    assert.deepEqual(routesFor({ routes: ["/a"] }, {}), ["/a"]);
    assert.deepEqual(routesFor({ routes: ["/a"] }, { routes: ["/b"] }), ["/b"]);
  });
  test("Playwright missing in the project: skipped with the install command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-noplaywright-"));
    try {
      const r = await contrastRun({ root: dir, baseUrl: base, routes: ["/good"] }, { base });
      assert.match(r.skipped, /Playwright is not installed.*npm i -D @playwright\/test/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("unreachable baseUrl: skipped with a fix", async (t) => {
    if (!projectRoot) return t.skip(why);
    const r = await contrastRun({ root: projectRoot, routes: ["/good"] }, { base: "http://127.0.0.1:1" });
    assert.match(r.skipped, /nothing is answering at http:\/\/127\.0\.0\.1:1.*--base/);
  });
});

describe("shots", () => {
  test("writes light/dark x phone/desktop PNGs for one route", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-"));
    try {
      const seen = [];
      const r = await shots(config(), { routes: ["/good"], base, out, onFile: (f) => seen.push(f) });
      assert.equal(r.files.length, 4);
      assert.deepEqual(seen, r.files);
      for (const n of ["light-phone", "light-desktop", "dark-phone", "dark-desktop"]) {
        const f = join(out, "good", `${n}.png`);
        assert.ok(existsSync(f), f);
        assert.ok(statSync(f).size > 500, `${n} is empty`);
      }
      // phone is 390 wide, desktop 1440 (PNG IHDR width at byte 16)
      assert.equal(readFileSync(join(out, "good", "light-phone.png")).readUInt32BE(16), 390);
      assert.equal(readFileSync(join(out, "good", "dark-desktop.png")).readUInt32BE(16), 1440);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  test("a tall page also yields viewport-tall slices beside the full-page file; a short one yields none", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-tall-"));
    try {
      const seen = [];
      const r = await shots(config(), { routes: ["/tall"], base, out, onFile: (f) => seen.push(f) });
      assert.equal(r.files.length, 4);
      // 2700px+ of content: 4 slices at both the 844px phone and the 900px desktop
      const count = (n) => r.slices.filter((s) => s.includes(`tall-${n}-`)).length;
      assert.equal(count("light-phone"), 4, r.slices.join("\n"));
      assert.equal(count("dark-desktop"), 4, r.slices.join("\n"));
      for (const s of r.slices) assert.ok(existsSync(s) && statSync(s).size > 300, s);
      assert.ok(existsSync(join(out, "tall", "tall-light-phone-1.png")));
      assert.equal(readFileSync(join(out, "tall", "tall-light-phone-1.png")).readUInt32BE(20), 844);
      assert.ok(seen.includes(r.slices[0]), "slice paths are reported too");
      const short = await shots(config(), { routes: ["/good"], base, out });
      assert.deepEqual(short.slices, []);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  test("a route that returns 404 reports an error and writes no PNG", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-404-"));
    try {
      const r = await shots(config(), { routes: ["/nope"], base, out });
      assert.deepEqual(r.files, []);
      assert.deepEqual(r.errors, ["/nope returned 404"]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  test("unreachable app: skipped, nothing written", async (t) => {
    if (!projectRoot) return t.skip(why);
    const r = await shots({ root: projectRoot }, { routes: ["/x"], base: "http://127.0.0.1:1" });
    assert.match(r.skipped, /nothing is answering/);
  });
});

describe("Git Bash path mangling", () => {
  test("fixRoute undoes the MSYS rewrite and leaves real routes alone", () => {
    assert.equal(fixRoute("C:/Program Files/Git/design-system/colors"), "/design-system/colors");
    assert.equal(fixRoute(String.raw`C:\Program Files\Git\good`), "/good");
    assert.equal(fixRoute("D:/tools/Git/usr/x"), "/usr/x");
    assert.equal(fixRoute("/design-system"), "/design-system");
  });
});

describe("run.mjs shots", () => {
  test("prints each path, exit 0; no route is a usage error", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-cli-"));
    const cfg = join(here, "fixtures", "repo", "viewsonic-ui.config.json");
    try {
      // async spawn: the fixture server lives in this process and must keep answering
      const run = (...a) => new Promise((done) => {
        const c = spawn(process.execPath, [join(checksDir, "run.mjs"), ...a, "--cwd", projectRoot, "--config", cfg, "--base", base]);
        let stdout = "", stderr = "";
        c.stdout.on("data", (d) => (stdout += d));
        c.stderr.on("data", (d) => (stderr += d));
        c.on("close", (status) => done({ status, stdout, stderr }));
      });
      const ok = await run("shots", "/good", "--out", out);
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      assert.equal(ok.stdout.trim().split(/\r?\n/).filter((l) => l.endsWith(".png")).length, 4);
      assert.equal((await run("shots")).status, 64);
      const mangled = await run("shots", "C:/Program Files/Git/good", "--out", out);
      assert.equal(mangled.status, 0, mangled.stdout + mangled.stderr);
      const missing = await run("shots", "/nope", "--out", out);
      assert.equal(missing.status, 1, missing.stdout + missing.stderr);
      assert.match(missing.stdout, /BAD shots\/route-unreachable \/nope:0 - \/nope returned 404/);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe("layout-shift, rhythm, emphasis", () => {
  const checks = {};
  before(async () => {
    checks.shift = (await imp("browser/layout-shift.mjs")).run;
    checks.rhythm = (await imp("browser/rhythm.mjs")).run;
    checks.emphasis = (await imp("browser/emphasis.mjs")).run;
  });
  const go = (name, route, cfg = {}) => checks[name]({ ...config(), ...cfg }, { routes: [route], base });

  test("layout-shift: an unsized image inserted late fires; reserved space stays silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("shift", "/shift-bad");
    assert.ok(bad.length >= 1, JSON.stringify(bad));
    assert.equal(bad[0].check, "layout-shift");
    assert.equal(bad[0].rule, "layout-shift");
    assert.match(bad[0].found, /^(phone|desktop): CLS \d\.\d{3} \(max 0\.1\)/);
    assert.deepEqual(await go("shift", "/shift-good"), []);
  });
  test("rhythm: uneven list gaps fire with the gaps; equal gaps, rows, and varied heights stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("rhythm", "/rhythm-bad");
    assert.ok(bad.length >= 1, JSON.stringify(bad));
    assert.equal(bad[0].rule, "uneven-gap");
    assert.match(bad[0].found, /<ul> 4 items, gaps 8\/8\/32px/);
    assert.ok(bad.some((f) => /<div.flex-col> 3 items, gaps 4.24px/.test(f.found)), "same-tag div stack fires: " + JSON.stringify(bad));
    assert.deepEqual(await go("rhythm", "/rhythm-good"), []);
  });
  test("emphasis: two primaries and two glows fire; one per region and one glow stay silent", async (t) => {
    if (!guard(t)) return;
    const bad = await go("emphasis", "/emphasis-bad");
    assert.deepEqual(bad.map((f) => f.rule).sort(), ["multiple-glow", "multiple-primary"]);
    assert.match(bad.find((f) => f.rule === "multiple-primary").found, /main has 2 primary buttons: "Save", "Publish"/);
    assert.deepEqual(await go("emphasis", "/emphasis-good"), []);
  });
  test("title-scale: a description the same size as or bigger than its title fires at both widths; smaller stays silent", async (t) => {
    if (!guard(t)) return;
    const run = (await imp("browser/title-scale.mjs")).run;
    const bad = await run(config(), { routes: ["/title-scale-bad"], base });
    assert.ok(bad.every((f) => f.rule === "description-not-smaller"), JSON.stringify(bad));
    assert.ok(bad.some((f) => /^phone: card-title \/ card-description "Plan" 14px, description "Same size as its title" 14px$/.test(f.found)), JSON.stringify(bad));
    assert.ok(bad.some((f) => /^desktop: <h2> \/ <p> "Billing" 16px, description "Bigger than its heading" 18px$/.test(f.found)), JSON.stringify(bad));
    assert.equal(bad.length, 4, JSON.stringify(bad));
    assert.deepEqual(await run(config(), { routes: ["/title-scale-good"], base }), []);
  });
  test("emphasis: emphasisExclude skips a route prefix (specimen pages)", async (t) => {
    if (!guard(t)) return;
    const r = await go("emphasis", "/emphasis-bad", { emphasisExclude: ["/emphasis-"] });
    assert.match(r.skipped, /all routes are excluded by emphasisExclude/);
  });
  test("all three: a 404 route is route-unreachable, never GOOD", async (t) => {
    if (!guard(t)) return;
    for (const n of ["shift", "rhythm", "emphasis"]) {
      const f = await go(n, "/nope");
      assert.equal(f.length, 1, n);
      assert.equal(f[0].rule, "route-unreachable");
      assert.equal(f[0].found, "/nope returned 404");
    }
  });
  test("all three: Playwright missing is skipped with the install hint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-noplaywright-"));
    try {
      for (const n of ["shift", "rhythm", "emphasis"]) {
        const r = await checks[n]({ root: dir, baseUrl: base, routes: ["/good"] }, { base });
        assert.match(r.skipped, /Playwright is not installed/);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
