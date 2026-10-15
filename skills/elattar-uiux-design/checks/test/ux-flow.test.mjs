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
const ux = await imp("browser/ux.mjs");
const { loadPlaywright } = await imp("browser/lib.mjs");
const { BROWSER_CHECKS } = await imp("registry.mjs");

let server, base, canLaunch = false, why = "";
const writes = [];
const stray = []; // anything that is not a plain page load

before(async () => {
  server = createServer((req, res) => {
    if (req.method !== "GET") writes.push(`${req.method} ${req.url}`); // must stay empty: the mock answers every write
    if (/^\/(?:api|beacon|ws|save)/.test(req.url ?? "")) stray.push(`${req.method} ${req.url}`);
    const name = (req.url ?? "/").split("?")[0].replace(/^\//, "") || "ux-good";
    const file = join(pagesDir, `${name}.html`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(file));
  });
  server.on("upgrade", (req, socket) => { stray.push(`UPGRADE ${req.url}`); socket.destroy(); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (!projectRoot) { why = "no playwright installed above the skill"; return; }
  try { const b = await loadPlaywright({ root: projectRoot }).launch(); await b.close(); canLaunch = true; } catch (e) { why = `chromium cannot launch: ${String(e.message).split("\n")[0]}`; }
});
after(() => server?.close());

const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };
const scan = async (route) => {
  const notes = [];
  const f = await ux.run({ root: projectRoot, baseUrl: base, routes: [] }, { routes: [route], base, note: (m) => notes.push(m) });
  assert.ok(Array.isArray(f), JSON.stringify(f));
  return { f, notes };
};
const of = (f, rule) => f.filter((x) => x.rule === rule).map((x) => x.found);

describe("ux-flow check", { timeout: 240000 }, () => {
  test("registered as a browser check named ux-flow; ids", () => {
    assert.ok(BROWSER_CHECKS.some((c) => c.name === "ux-flow"));
    assert.equal(ux.CHECK, "ux-flow");
    assert.deepEqual(ux.RULE_IDS, ["no-feedback", "slow-response", "no-escape", "lost-input", "route-unreachable"]);
  });

  test("good page: silent (busy label, close button, Escape, a form that keeps its values; password may clear)", async (t) => {
    if (!guard(t)) return;
    const { f, notes } = await scan("/ux-good");
    assert.deepEqual(f, []);
    assert.ok(notes.some((n) => /2 buttons|1 buttons/.test(n) || /buttons, \d clicked/.test(n)));
    assert.ok(notes.some((n) => /1 forms, 1 submitted/.test(n)), notes.join("\n"));
  });

  test("no-feedback and slow-response: a dead button, a silent slow one, a slow one; the fast one and the destructive one are not reported", async (t) => {
    if (!guard(t)) return;
    const { f, notes } = await scan("/ux-bad-feedback");
    const nf = of(f, "no-feedback").join("\n");
    const sl = of(f, "slow-response").join("\n");
    assert.match(nf, /"Do nothing" shows no visible change/);
    assert.match(nf, /"Slow save" is still working after 1s and shows no progress indicator/);
    assert.match(nf, /"Instant but silent" is still working after 1s/);
    assert.match(sl, /"Slow save" first changes the screen \d+ms after the click \(limit 400ms\)/);
    assert.doesNotMatch(nf + sl, /"Fast"|"Styled"/);
    assert.doesNotMatch(f.map((x) => x.found).join("\n"), /Current choice|Active tab|Overview/, "the option already chosen cannot be a dead button");
    assert.doesNotMatch(sl, /"Instant but silent"|"Do nothing"/);
    assert.doesNotMatch(f.map((x) => x.found).join("\n"), /Delete everything/);
    assert.ok(notes.some((n) => /5 buttons, 5 clicked/.test(n)), `destructive button must not be clicked: ${notes.join(" | ")}`);
    for (const x of f) { assert.equal(x.check, "ux-flow"); assert.equal(x.file, "/ux-bad-feedback"); assert.ok(x.fix.length > 20); }
    assert.equal(writes.length, 0, `a write reached the server: ${writes.join(", ")}`);
  });

  test("no-escape: no Escape, no close control, both; a menu needs no close button; the working dialog is silent", async (t) => {
    if (!guard(t)) return;
    const { f } = await scan("/ux-bad-overlay");
    const ne = of(f, "no-escape").join("\n");
    assert.match(ne, /Escape does not close the overlay opened by <button#a>/);
    assert.match(ne, /dialog opened by <button#a>.*has no visible Close or Cancel control/);
    assert.match(ne, /dialog opened by <button#b>.*has no visible Close or Cancel control/);
    assert.doesNotMatch(ne, /Escape does not close the overlay opened by <button#b>/);
    assert.match(ne, /Escape does not close the overlay opened by <button#c>/);
    assert.doesNotMatch(ne, /dialog opened by <button#c>/);
    assert.doesNotMatch(ne, /<button#d>/);
    assert.equal(f.filter((x) => x.rule !== "no-escape" && x.rule !== "no-feedback" && x.rule !== "slow-response").length, 0);
  });

  test("lost-input: a form that resets and a form that is replaced both fire; the reset names the fields", async (t) => {
    if (!guard(t)) return;
    const a = await scan("/ux-bad-form-reset");
    assert.match(of(a.f, "lost-input").join("\n"), /loses name, email after a failed submit/);
    const b = await scan("/ux-bad-form-gone");
    assert.match(of(b.f, "lost-input").join("\n"), /"Post note" is gone after a failed submit/);
    assert.equal(writes.length, 0, `a write reached the server: ${writes.join(", ")}`);
  });

  test("lost-input: a form whose submit sends no request is a NOTE (no failure path to test), never BAD", async (t) => {
    if (!guard(t)) return;
    const { f, notes } = await scan("/ux-no-request");
    assert.deepEqual(of(f, "lost-input"), []);
    assert.ok(notes.some((n) => /sent no network request.*no failure path to test: add a failure state/.test(n)), notes.join("\n"));
  });

  test("no-feedback: a menu that opens on pointerdown (before the click) counts as feedback", async (t) => {
    if (!guard(t)) return;
    const { f } = await scan("/ux-pointerdown");
    assert.deepEqual(of(f, "no-feedback"), []);
  });

  test("no-feedback: a Select trigger (opens on pointerdown) and Tabs triggers (switch on mousedown) are silent", async (t) => {
    if (!guard(t)) return;
    assert.deepEqual(of((await scan("/ux-radix-select")).f, "no-feedback"), []);
    assert.deepEqual(of((await scan("/ux-radix-tabs")).f, "no-feedback"), []);
  });

  test("the sandbox: autosave on input, a beacon, a WebSocket, a navigation, a popup and a GET to an action endpoint never reach the server", async (t) => {
    if (!guard(t)) return;
    const { f } = await scan("/ux-sandbox");
    assert.deepEqual([writes, stray], [[], []], `reached the server: ${[...writes, ...stray].join(", ")}`);
    assert.ok(Array.isArray(f));
  });

  test("a base that is not local is refused unless --allow-remote", async () => {
    assert.equal(ux.isLocalBase("http://localhost:3000"), true);
    assert.equal(ux.isLocalBase("http://127.0.0.1:1"), true);
    assert.equal(ux.isLocalBase("http://[::1]:3000"), true);
    assert.equal(ux.isLocalBase("http://app.localhost:3000"), true);
    assert.equal(ux.isLocalBase("https://staging.example.com"), false);
    const r = await ux.run({ root: projectRoot ?? here, baseUrl: "https://staging.example.com", routes: ["/"] }, {});
    assert.match(r.skipped, /only runs against a local app/);
    assert.match(r.skipped, /--allow-remote/);
  });

  test("an unreachable route is reported, not measured", async (t) => {
    if (!guard(t)) return;
    const { f } = await scan("/nope");
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, "route-unreachable");
  });

  test("without routes the check is skipped, not passed", async () => {
    const r = await ux.run({ root: projectRoot ?? here, baseUrl: "http://127.0.0.1:1", routes: [] }, {});
    assert.match(r.skipped, /no routes/);
  });
});
