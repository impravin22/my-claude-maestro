// What a real dev server does to the browser checks: its overlay, its sockets, late hydration, redirects to sign-in,
// a signed-in session, query-string routes, runtime errors, and a toggle whose selected pill ignores the pointer.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
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
const lib = await imp("browser/lib.mjs");
const kb = await imp("browser/keyboard.mjs");
const ux = await imp("browser/ux.mjs");
const rt = await imp("browser/runtime-errors.mjs");
const contrast = await imp("browser/contrast.mjs");
const { shots } = await imp("browser/shots.mjs");
const { BROWSER_CHECKS } = await imp("registry.mjs");

let server, base, canLaunch = false, why = "";
const writes = [];
const upgrades = [];
before(async () => {
  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET") writes.push(`${req.method} ${req.url}`);
    if (url === "/redir") { res.writeHead(302, { location: "/login" }).end(); return; }
    if (url === "/login") { res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Sign in</title><main><h1>Sign in</h1></main>"); return; }
    if (url === "/gated") {
      if (!String(req.headers.cookie ?? "").includes("session=ok")) { res.writeHead(302, { location: "/login" }).end(); return; }
      res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Account</title><main><h1>Account</h1></main>");
      return;
    }
    const name = url.replace(/^\//, "") || "rt-good";
    const file = join(pagesDir, `${name}.html`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(file));
  });
  server.on("upgrade", (req, socket) => { upgrades.push(req.url); socket.destroy(); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (!projectRoot) { why = "no playwright installed above the skill"; return; }
  try { const b = await lib.loadPlaywright({ root: projectRoot }).launch(); await b.close(); canLaunch = true; } catch (e) { why = `chromium cannot launch: ${String(e.message).split("\n")[0]}`; }
});
after(() => server?.close());

const config = (extra = {}) => ({ root: projectRoot, baseUrl: base, routes: [], ...extra });
const guard = (t) => { if (!canLaunch) { t.skip(why); return false; } return true; };
const rules = (f) => f.map((x) => `${x.rule}: ${x.found}`).join("\n");

describe("pure helpers", () => {
  test("routeSlug keeps a sanitised query string, so each state gets its own folder", () => {
    assert.equal(lib.routeSlug("/"), "root");
    assert.equal(lib.routeSlug("/a/b/"), "a__b");
    assert.equal(lib.routeSlug("/settings?state=empty"), "settings--state-empty");
    assert.equal(lib.routeSlug("/settings?tab=a&state=b#top"), "settings--tab-a-state-b");
    assert.notEqual(lib.routeSlug("/x?state=a"), lib.routeSlug("/x?state=b"));
    assert.doesNotMatch(lib.routeSlug("/x?q=<>:|*\"?"), /[<>:|*"?\\/]/);
  });
  test("redirectedTo ignores query, hash and a trailing slash, and names the other path", () => {
    assert.equal(lib.redirectedTo("/a", "http://h/a"), null);
    assert.equal(lib.redirectedTo("/a?x=1", "http://h/a/"), null);
    assert.equal(lib.redirectedTo("/", "http://h/"), null);
    assert.equal(lib.redirectedTo("/a", "http://h/login?next=%2Fa"), "/login?next=%2Fa");
  });
  test("runtime-errors is registered", () => {
    assert.ok(BROWSER_CHECKS.some((c) => c.name === "runtime-errors"));
    assert.deepEqual(rt.RULE_IDS, ["console-error", "page-error", "dev-overlay", "route-unreachable"]);
  });
});

describe("dev-tool overlay is not the page (keyboard, ux-flow, contrast-rendered)", () => {
  test("keyboard: a Next.js portal with a tiny unnamed button and a light-DOM dialog overlay raise nothing", async (t) => {
    if (!guard(t)) return;
    const f = await kb.run(config(), { routes: ["/dev-overlay"], base });
    assert.deepEqual(f, [], rules(f));
  });
  test("control: the same markup under a name that is not a dev tool IS reported (the fixture is not vacuous)", async (t) => {
    if (!guard(t)) return;
    const f = await kb.run(config(), { routes: ["/dev-overlay-control"], base });
    assert.match(rules(f), /unnamed-control/);
  });
  test("ux-flow and contrast-rendered also ignore it", async (t) => {
    if (!guard(t)) return;
    const a = await ux.run(config(), { routes: ["/dev-overlay"], base });
    assert.deepEqual(a, [], rules(a));
    const b = await contrast.run(config(), { routes: ["/dev-overlay"], base });
    assert.deepEqual(b, [], rules(b));
  });
});

describe("dev-server sockets and hydration (ux-flow)", () => {
  test("same-origin dev channel is a real WebSocket; any other socket is stubbed and never reaches the server", async (t) => {
    if (!guard(t)) return;
    upgrades.length = 0;
    const notes = [];
    const f = await ux.run(config(), { routes: ["/ws-dev"], base, note: (m) => notes.push(m) });
    assert.ok(Array.isArray(f), JSON.stringify(f));
    assert.ok(upgrades.includes("/_next/webpack-hmr"), `the HMR socket never connected: ${upgrades.join(", ") || "nothing"}`);
    assert.ok(!upgrades.some((u) => u.startsWith("/app-socket")), `an app socket got through: ${upgrades.join(", ")}`);
    assert.equal(ux.DEV_CHANNEL.test("/_next/webpack-hmr"), true);
    assert.equal(ux.DEV_CHANNEL.test("/_next/turbopack-hmr"), true);
    assert.equal(ux.DEV_CHANNEL.test("/__nextjs_original-stack-frames"), true);
    assert.equal(ux.DEV_CHANNEL.test("/ws"), false);
    assert.equal(ux.DEV_CHANNEL.test("/api/stream"), false);
  });

  test("a page that hydrates late: ux-flow waits, then finds its form and its button", async (t) => {
    if (!guard(t)) return;
    writes.length = 0;
    const notes = [];
    const f = await ux.run(config(), { routes: ["/hydrate-late"], base, note: (m) => notes.push(m) });
    assert.ok(Array.isArray(f), JSON.stringify(f));
    const text = notes.join("\n");
    assert.match(text, /1 forms, 1 submitted/, text);
    assert.match(text, /[1-9] buttons, [1-9] clicked/, text);
    assert.deepEqual(writes, [], "the mocked writes never reach the server");
  });

  test("waitForReady returns for a page that is not a Next page, and waits for one that is", async (t) => {
    if (!guard(t)) return;
    await lib.withPages(config(), { base }, async (newPage) => {
      const plain = await newPage();
      await plain.goto(base + "/rt-good");
      const t0 = Date.now();
      await lib.waitForReady(plain);
      assert.ok(Date.now() - t0 < 3000, "a plain page is ready at once");
      await plain.close();
      const late = await newPage();
      await late.goto(base + "/hydrate-late");
      assert.equal(await late.locator("form").count(), 0, "the form does not exist yet");
      await lib.waitForReady(late);
      assert.equal(await late.locator("form").count(), 1, "ready means hydrated");
      await late.close();
    });
  });
});

describe("a route that redirects is one finding, not a skipped run", () => {
  test("ux-flow: the redirecting route is reported with its target; the next route is still measured", async (t) => {
    if (!guard(t)) return;
    const notes = [];
    const f = await ux.run(config(), { routes: ["/redir", "/hydrate-late"], base, note: (m) => notes.push(m) });
    assert.ok(Array.isArray(f), JSON.stringify(f));
    assert.equal(f.length, 1, rules(f));
    assert.equal(f[0].rule, "route-unreachable");
    assert.equal(f[0].file, "/redir");
    assert.match(f[0].found, /\/redir redirects to \/login/);
    assert.match(f[0].fix, /auth\.storageState/);
    assert.match(notes.join("\n"), /\/hydrate-late: \d+ forms/, "the second route ran");
  });
  test("keyboard, contrast-rendered and runtime-errors report it too, never the login page's own findings", async (t) => {
    if (!guard(t)) return;
    for (const [name, run] of [["keyboard", kb.run], ["contrast-rendered", contrast.run], ["runtime-errors", rt.run]]) {
      const f = await run(config(), { routes: ["/redir"], base });
      assert.equal(f.length, 1, `${name}: ${rules(f)}`);
      assert.equal(f[0].rule, "route-unreachable");
      assert.match(f[0].found, /redirects to \/login/);
    }
  });
  test("shots reports it as an error and captures nothing", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-redir-"));
    try {
      const r = await shots(config(), { routes: ["/redir"], base, out });
      assert.equal(r.files.length, 0);
      assert.match(r.errors[0], /\/redir redirects to \/login/);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe("auth.storageState signs the checks in", () => {
  test("with a session the gated route loads; without it, it redirects", async (t) => {
    if (!guard(t)) return;
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-auth-"));
    try {
      const state = join(dir, "state.json");
      writeFileSync(state, JSON.stringify({ cookies: [{ name: "session", value: "ok", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] }));
      assert.match(rules(await rt.run(config(), { routes: ["/gated"], base })), /redirects to \/login/);
      assert.deepEqual(await rt.run(config({ auth: { storageState: state } }), { routes: ["/gated"], base }), []);
      assert.deepEqual(await kb.run(config({ auth: { storageState: state } }), { routes: ["/gated"], base }), [], "every browser check uses it");
      const r = await lib.withPages({ ...config(), auth: { storageState: join(dir, "missing.json") } }, { base }, async () => "ran");
      assert.match(r.skipped, /auth\.storageState points at .*missing\.json, which does not exist/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("shots accepts query-string routes", () => {
  test("each query gets its own folder of four images", async (t) => {
    if (!guard(t)) return;
    const out = mkdtempSync(join(tmpdir(), "viewsonic-shots-q-"));
    try {
      const r = await shots(config(), { routes: ["/rt-good?state=empty", "/rt-good?state=full"], base, out });
      assert.deepEqual(r.errors, []);
      assert.equal(r.files.length, 8);
      assert.deepEqual(readdirSync(out).sort(), ["rt-good--state-empty", "rt-good--state-full"]);
      assert.deepEqual(readdirSync(join(out, "rt-good--state-empty")).sort(), ["dark-desktop.png", "dark-phone.png", "light-desktop.png", "light-phone.png"]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
});

describe("runtime-errors", () => {
  const run = (route) => rt.run(config(), { routes: [route], base });
  test("a quiet page (console.log and warn only) is GOOD", async (t) => {
    if (!guard(t)) return;
    assert.deepEqual(await run("/rt-good"), []);
  });
  test("a console.error is BAD with its message", async (t) => {
    if (!guard(t)) return;
    const f = await run("/rt-console");
    assert.equal(f.length, 1, rules(f));
    assert.equal(f[0].rule, "console-error");
    assert.equal(f[0].check, "runtime-errors");
    assert.equal(f[0].file, "/rt-console");
    assert.match(f[0].found, /Tooltip must be used within TooltipProvider/);
    assert.ok(f[0].why && f[0].fix);
  });
  test("an uncaught exception is BAD with its message", async (t) => {
    if (!guard(t)) return;
    const f = await run("/rt-throw");
    assert.match(rules(f), /page-error: Cannot read properties of undefined/);
  });
  test("the framework's error overlay is BAD with the overlay's message; its indicator button alone is not", async (t) => {
    if (!guard(t)) return;
    const f = await run("/rt-overlay");
    assert.match(rules(f), /dev-overlay: .*used searchParams during prerendering/);
    assert.deepEqual(await run("/rt-indicator"), []);
  });
  test("the dev indicator is BAD only when it counts an issue: 0 issues is silent, 1 Issue is reported", async (t) => {
    if (!guard(t)) return;
    assert.deepEqual(await run("/rt-indicator-zero"), []);
    const f = await run("/rt-indicator-issue");
    assert.match(rules(f), /dev-overlay: the dev indicator reports 1 issue/);
  });
  test("a crash that only happens when a dialog opens is BAD, naming the trigger; the same page is clean before the pass", async (t) => {
    if (!guard(t)) return;
    const f = await run("/rt-open-throws");
    assert.equal(f.length, 1, rules(f));
    assert.equal(f[0].rule, "page-error");
    assert.match(f[0].found, /`Tooltip` must be used within `TooltipProvider` \(after opening .*Delete account/);
  });
  test("a console error on tooltip hover is BAD; overlays and tooltips that behave are silent", async (t) => {
    if (!guard(t)) return;
    const f = await run("/rt-tooltip-throws");
    assert.match(rules(f), /console-error: Tooltip content rendered without TooltipProvider \(after hovering tooltip trigger 1 of 1\)/);
    assert.deepEqual(await run("/rt-open-ok"), []);
  });
  test("a route that 404s is route-unreachable", async (t) => {
    if (!guard(t)) return;
    const f = await run("/nope");
    assert.equal(f[0].rule, "route-unreachable");
  });
  test("no routes: skipped, never passed", async () => {
    const r = await rt.run({ root: projectRoot ?? here, baseUrl: base, routes: [] }, {});
    assert.match(r.skipped, /no routes/);
  });
});

describe("contrast-rendered: a selected toggle painted by a sibling pill", () => {
  test("text on an absolutely positioned pill that ignores the pointer is measured against the pill", async (t) => {
    if (!guard(t)) return;
    const f = await contrast.run(config(), { routes: ["/toggle-pill"], base });
    assert.deepEqual(f, [], rules(f));
  });
});
