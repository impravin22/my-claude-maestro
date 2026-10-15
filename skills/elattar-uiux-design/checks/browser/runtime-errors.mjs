// Runtime errors: a page that builds can still throw. Per route, on the running app: console.error, uncaught
// exceptions (pageerror) and the framework's own error overlay (Next.js, Vite, webpack-dev-server). Any of them is BAD,
// with the message. Desktop, light theme: an error does not depend on either.
//
//   console-error   console.error during load and the first second after it (React warnings, failed hydration, 4xx/5xx assets)
//   page-error      an uncaught exception or unhandled rejection
//   dev-overlay     the framework's error overlay is on screen (a render, prerender or build error the page shows)
//
// After the load it also acts, because a provider that is missing only throws when the thing renders: it opens each
// overlay trigger (up to 10 distinct per route, closing each with Escape) and hovers and focuses each tooltip trigger
// (up to 10), and everything logged during that pass counts, with the control that caused it named.
//
// This is the check that catches what a green build hides: a Tooltip without its provider, searchParams read during
// prerender, a hydration mismatch. Run it on the changed routes, against the dev server and again on the production build.
import { routesFor, unreachableFinding, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";
import { openTrigger, pickTriggers } from "./keyboard.mjs";

export const CHECK = "runtime-errors";
export const RULE_IDS = ["console-error", "page-error", "dev-overlay", "route-unreachable"];
const CAP = 15;
const SETTLE_MS = 1000;

const FIX = {
  "console-error": "read the message and fix its cause (a missing provider, a bad prop, a hydration mismatch, a failing request); an error in the console is a defect even when the screen looks right",
  "page-error": "fix the exception: it stops the code after it from running, so a handler or a whole subtree may be dead",
  "dev-overlay": "open the route in the browser, read the overlay's message and fix its cause; run the production build too (`next build`): prerender errors only show there",
};

/** Messages that are not defects of the page under test. */
const IGNORED = [/favicon\.ico/i, /Download the React DevTools/i];

/** Runs in the page: the error overlay of the dev server, or null. Pierces the shadow root Next puts it in. */
function overlayInPage() {
  const SEL = "[data-nextjs-dialog],[data-nextjs-dialog-overlay],[data-nextjs-error-overlay],[data-nextjs-dialog-root],vite-error-overlay,#webpack-dev-server-client-overlay";
  const roots = [document];
  for (const el of document.querySelectorAll("nextjs-portal,vite-error-overlay")) if (el.shadowRoot) roots.push(el.shadowRoot);
  for (const root of roots) {
    const hit = root.querySelector(SEL);
    if (!hit) {
      // Next's devtools indicator is always on screen: only one that counts an issue is an error
      for (const ind of root.querySelectorAll("[data-nextjs-toast],[data-nextjs-dev-tools-button],[data-issues-count]")) {
        const attr = ind.getAttribute("data-issues-count") ?? ind.querySelector("[data-issues-count]")?.getAttribute("data-issues-count");
        const text = (ind.textContent ?? "").replace(/\s+/g, " ").trim();
        const label = `${text} ${ind.getAttribute("aria-label") ?? ""}`;
        const counted = attr !== null && attr !== undefined && /^\d+$/.test(attr.trim()) ? Number(attr)
          : ind.querySelector("[data-issues-count]") && /^\d+$/.test((ind.querySelector("[data-issues-count]").textContent ?? "").trim()) ? Number(ind.querySelector("[data-issues-count]").textContent.trim())
          : (label.match(/(\d+)\s+(?:issues?|errors?)/i)?.[1] ?? 0);
        if (Number(counted) > 0) return `the dev indicator reports ${counted} issue${Number(counted) === 1 ? "" : "s"}: ${text.slice(0, 200) || "open it to read them"}`;
      }
      continue;
    }
    const msg = (hit.querySelector("[data-nextjs-dialog-body],[data-nextjs-dialog-header],.message,pre")?.textContent ?? hit.textContent ?? "").replace(/\s+/g, " ").trim();
    return msg.slice(0, 300) || "an error overlay is open";
  }
  return null;
}

const TOOLTIPS = "[data-slot=tooltip-trigger],[data-tooltip-trigger]";

/** Open every overlay trigger and hover every tooltip trigger. `phase.now` names the control in play for the messages. */
async function interact(page, base, route, phase, note) {
  const { picked } = await pickTriggers(page);
  const names = await page.evaluate(() => window.__kbd.triggers().map((t) => window.__kbd.describe(t))).catch(() => []);
  for (const i of picked) {
    phase.now = ` (after opening ${names[i] ?? `trigger ${i + 1}`})`;
    const got = await openTrigger(page, i, base, route).catch(() => null);
    if (!got) continue;
    phase.now = ` (after opening ${got.trig?.name ?? `trigger ${i + 1}`})`;
    if (got.left) { await waitForReady(page); continue; }
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
    if (got.opened?.isOverlay || got.opened?.changed) {
      await page.goto(base + route, { waitUntil: "load" }).catch(() => {});
      await waitForReady(page);
    }
  }
  const tips = page.locator(TOOLTIPS);
  const n = Math.min(await tips.count().catch(() => 0), 10);
  for (let k = 0; k < n; k++) {
    phase.now = ` (after hovering tooltip trigger ${k + 1} of ${n})`;
    const t = tips.nth(k);
    await t.hover({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(300);
    await t.focus({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  phase.now = "";
  note?.(`NOTE runtime-errors ${route}: ${picked.length} overlay triggers opened, ${n} tooltip triggers hovered`);
}

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _browser, base) => {
    const findings = [];
    for (const route of routes) {
      const page = await newPage({ viewport: VIEWPORTS.desktop, colorScheme: "light", reducedMotion: "reduce" });
      const got = [];
      const phase = { now: "" };
      const add = (rule, found0) => {
        const found = found0 + phase.now;
        if (IGNORED.some((re) => re.test(found))) return;
        if (!got.some((g) => g.rule === rule && g.found === found)) got.push({ rule, found });
      };
      page.on("console", (m) => { if (m.type() === "error") add("console-error", m.text().replace(/\s+/g, " ").trim().slice(0, 300)); });
      page.on("pageerror", (e) => add("page-error", String(e?.message ?? e).replace(/\s+/g, " ").trim().slice(0, 300)));
      try {
        const res = await page.goto(base + route, { waitUntil: "load" });
        let problem = unreachableFinding(CHECK, route, res);
        if (!problem) {
          await waitForReady(page);
          await page.waitForTimeout(SETTLE_MS);
          problem = unreachableFinding(CHECK, route, res, page.url());
        }
        if (problem) { findings.push(problem); continue; }
        const overlay = await page.evaluate(overlayInPage);
        if (overlay) add("dev-overlay", overlay);
        try {
          await interact(page, base, route, phase, options.note);
        } catch (e) {
          options.note?.(`NOTE runtime-errors ${route}: the interaction pass stopped early (${String(e.message).split(String.fromCharCode(10))[0]})`);
        }
        await page.waitForTimeout(300);
        phase.now = "";
        const overlay2 = await page.evaluate(overlayInPage).catch(() => null);
        if (overlay2) add("dev-overlay", overlay2);
      } finally {
        await page.close().catch(() => {});
      }
      const shown = got.length > CAP ? CAP - 1 : got.length;
      for (const g of got.slice(0, shown)) findings.push({ check: CHECK, rule: g.rule, file: route, line: 0, found: g.found, why: g.found, fix: FIX[g.rule] });
      if (got.length > shown) {
        const more = `+${got.length - shown} more runtime errors on this route`;
        findings.push({ check: CHECK, rule: "console-error", file: route, line: 0, found: more, why: more, fix: "fix the findings above, then re-run to see the rest" });
      }
    }
    return findings;
  });
}
