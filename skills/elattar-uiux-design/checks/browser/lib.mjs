// Shared plumbing for browser checks. Node built-ins only; Playwright comes from the PROJECT.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { isLocalBase } from "../maestro-guards.mjs";

export const PLAYWRIGHT_HINT = "npm i -D @playwright/test && npx playwright install chromium";
export const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
export const THEMES = ["light", "dark"];

/** chromium from the project's `playwright` or `@playwright/test`, or null. */
export function loadPlaywright(config) {
  const req = createRequire(join(config.root, "package.json"));
  for (const id of ["playwright", "@playwright/test"]) {
    try {
      const mod = req(id);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch { /* next */ }
  }
  return null;
}

/** options.routes (CLI) beats config.routes. */
export function routesFor(config, options = {}) {
  return options.routes?.length ? options.routes : (config.routes ?? []);
}

export async function reachable(url) {
  try {
    // maestro patch (not upstream): a redirect is an answer; following it would send a GET wherever it points.
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

/**
 * Dev-tool UI that is not the app: the Next.js dev overlay / indicator / error dialog, the Vercel toolbar, Vite and
 * webpack error overlays. A page you ship has none of it, so no browser check may measure or report it.
 * Every page opened through withPages carries `window.__isDev(el)`: true for such an element, or anything inside it
 * (shadow roots included). In-page code calls `window.__isDev?.(el)`; node-side code never needs to.
 */
export const DEV_OVERLAY_SELECTOR = [
  "nextjs-portal", "next-route-announcer", "[data-nextjs-dialog-overlay]", "[data-nextjs-dev-tools-button]", "[data-nextjs-toast]",
  "[data-next-badge-root]", "[data-vercel-toolbar]", "vercel-live-feedback", "#vercel-live-feedback", "vite-error-overlay",
  "#webpack-dev-server-client-overlay", "#__next-build-watcher", "#__next-prerender-indicator",
].join(",");

/** Serialised into every page (no closures). */
function devOverlayInit(selector) {
  const isDev = (el) => {
    for (let n = el; n; ) {
      if (n.nodeType === 1) {
        if (n.matches(selector)) return true;
        for (const a of n.attributes) if (/^data-(nextjs|vercel)/.test(a.name)) return true;
        n = n.parentElement ?? n.getRootNode()?.host ?? null;
      } else {
        n = n.getRootNode?.()?.host ?? null;
      }
    }
    return false;
  };
  Object.defineProperty(window, "__isDev", { value: isDev, configurable: true });
}

/** Runs in the page: has the framework finished hydrating? Always true for a page that is not a Next page. */
function hydrated() {
  const next = !!(window.next || document.querySelector('script[src*="/_next/"],#__next,next-route-announcer'));
  if (!next) return true;
  const marked = (n) => !!n && Object.keys(n).some((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
  const ok = marked(document) || marked(document.getElementById("__next")) || marked(document.body)
    || [...document.body.querySelectorAll("*")].slice(0, 400).some(marked);
  if (!ok) return false;
  const router = window.next?.router; // pages router: not ready while a route change or the first query parse is pending
  return !(router && router.isReady === false);
}

/**
 * The page is ready to be measured or acted on: loaded, hydrated (a Next page is a different page before its
 * handlers and client-rendered parts exist), the network quiet again afterwards, fonts in. Never throws and never
 * waits for ever: a page that stays un-hydrated is measured as it is (runtime-errors says why).
 */
export async function waitForReady(page, { hydrateMs = 10000, idleMs = 8000 } = {}) {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForFunction(hydrated, null, { timeout: hydrateMs }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: idleMs }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

/**
 * Launch chromium once and call fn(newPage, browser, base). Returns fn's result, or
 * { skipped: "<reason + fix>" } when Playwright, the browser or the app is not there.
 */
export async function withPages(config, options, fn) {
  const base = options.base ?? config.baseUrl;
  // maestro patch (not upstream): the base usually comes from the repository's config, and the checks
  // open it with the project's signed-in session, press keys and click. ux-flow already refused a base
  // that is not local; every browser check does now, before anything is fetched or launched.
  if (!isLocalBase(base) && !options.allowRemote) {
    return { skipped: `${base} is not a local app (localhost, 127.0.0.1, [::1], *.localhost, *.test); the browser checks open it with this project's session and press keys and click on its pages, so they only run against a local app. Pass --allow-remote if you are sure` };
  }
  const chromium = loadPlaywright(config);
  if (!chromium) return { skipped: `Playwright is not installed in this project; run: ${PLAYWRIGHT_HINT}` };
  if (!(await reachable(base))) {
    return { skipped: `nothing is answering at ${base}; start the app (e.g. npm run dev) or pass --base <url>` };
  }
  // A signed-in session: auth.storageState is a Playwright storage state file (cookies + localStorage), see map.md.
  let storageState;
  if (config.auth?.storageState) {
    storageState = isAbsolute(config.auth.storageState) ? config.auth.storageState : resolve(config.root, config.auth.storageState);
    if (!existsSync(storageState)) {
      return { skipped: `auth.storageState points at ${config.auth.storageState}, which does not exist; create it (npx playwright codegen --save-storage=<file> ${base}) or remove the key` };
    }
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    return { skipped: `could not launch chromium (${String(e.message).split("\n")[0]}); run: npx playwright install chromium` };
  }
  try {
    // service workers are blocked: their fetches would bypass page.route, and no check needs one
    const newPage = async (pageOptions = {}) => {
      const page = await browser.newPage({ serviceWorkers: "block", ...(storageState ? { storageState } : {}), ...pageOptions });
      await page.addInitScript(devOverlayInit, DEV_OVERLAY_SELECTOR);
      return page;
    };
    return await fn(newPage, browser, base);
  } finally {
    await browser.close();
  }
}

/** Light or dark: media query, the `dark` class and `data-theme` on <html>. */
export async function setTheme(page, theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((t) => {
    const root = document.documentElement;
    root.classList.toggle("dark", t === "dark");
    root.setAttribute("data-theme", t);
  }, theme);
  // Colours transition when the theme flips; measure the settled state, not a frame in between.
  // Transitions only: an entrance keyframe must still reach its end state, so finite animations are finished.
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" });
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite: leave it */ } }));
  // Let the app react to the flip (layout animations start a frame or two later), then finish what started.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite: leave it */ } }));
  }
}

/** Folder name for a route. A query string stays in the name (?state=empty is another screen), cut to safe characters. */
export const routeSlug = (route) => {
  const [path, ...rest] = String(route).split("#")[0].split("?");
  const base = path.replace(/^\/|\/$/g, "").replace(/\//g, "__").replace(/[^A-Za-z0-9_.-]+/g, "-") || "root";
  const query = rest.join("?").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return query ? `${base}--${query}`.slice(0, 120) : base;
};

/** Where `url` ended up when it is a different path than `route` (query and hash are ignored), else null. */
export function redirectedTo(route, url) {
  try {
    const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
    const want = norm(new URL(route, "http://x").pathname);
    const got = new URL(url);
    return norm(got.pathname) === want ? null : got.pathname + got.search;
  } catch {
    return null;
  }
}

/** The finding for a route that did not load (a page that did not load was not measured), or null when it did. */
export function unreachableFinding(check, route, res, finalUrl) {
  if (res && res.ok()) {
    const landed = redirectedTo(route, finalUrl ?? res.url());
    if (!landed) return null;
    const msg = `${route} redirects to ${landed}; the page behind it was not measured. If it is a sign-in page, set auth.storageState in viewsonic-ui.config.json to a signed-in Playwright session`;
    return { check, rule: "route-unreachable", file: route, line: 0, found: msg, why: msg, fix: "measure the final route instead, or sign in: set auth.storageState (a Playwright storage state file) in viewsonic-ui.config.json; a page that was not reached was not measured" };
  }
  const msg = `${route} returned ${res ? res.status() : "no response"}`;
  return { check, rule: "route-unreachable", file: route, line: 0, found: msg, why: msg, fix: "fix the route, or remove it from routes or the arguments; a page that did not load was not measured" };
}

/** Open `route`, wait for it to settle. Returns { page, problem }: problem is a route-unreachable finding or null. */
export async function openRoute(newPage, check, base, route, pageOptions) {
  const page = await newPage(pageOptions);
  try {
    const res = await page.goto(base + route, { waitUntil: "load" });
    let problem = unreachableFinding(check, route, res);
    if (!problem) {
      await waitForReady(page);
      problem = unreachableFinding(check, route, res, page.url()); // a client-side redirect after hydration
    }
    return { page, problem };
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}

/**
 * The shape shared by the views checks: open each route at each viewport, run `scan(arg)` in the page, turn what it
 * returns ({ found, fix, rule? }) into findings. `views` is [[label, viewport]...]; findings read "<label>: <found>".
 */
export async function scanRoutes(config, options, check, views, scan, arg) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    for (const route of routes) {
      for (const [label, viewport] of views) {
        const { page, problem } = await openRoute(newPage, check, base, route, { viewport, reducedMotion: "reduce" });
        try {
          if (problem) { findings.push(problem); break; }
          await page.waitForTimeout(200);
          for (const f of await page.evaluate(scan, arg)) {
            findings.push({ check, rule: f.rule ?? check, file: route, line: 0, found: `${label}: ${f.found}`, why: `${label}: ${f.found}`, fix: f.fix });
          }
        } finally {
          await page.close();
        }
      }
    }
    return findings;
  });
}
