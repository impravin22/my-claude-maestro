// Proportion: media and async content must reserve their space. Cumulative Layout Shift per route, phone and desktop.
import { routesFor, unreachableFinding, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";

export const CHECK = "layout-shift";
export const RULE_IDS = ["layout-shift", "route-unreachable"];
export const LIMIT = 0.1; // Core Web Vitals "good"

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    for (const route of routes) {
      for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
        // The observer must exist before the page's own scripts run.
        const page = await newPage({ viewport });
        try {
          await page.addInitScript(() => {
            window.__cls = 0;
            window.__shifts = [];
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                if (e.hadRecentInput) continue;
                window.__cls += e.value;
                const src = e.sources?.[0]?.node;
                window.__shifts.push(src && src.nodeType === 1 ? src.tagName.toLowerCase() + (src.className && typeof src.className === "string" ? "." + src.className.split(" ")[0] : "") : "?");
              }
            }).observe({ type: "layout-shift", buffered: true });
          });
          const res = await page.goto(base + route, { waitUntil: "load" });
          const problem = unreachableFinding(CHECK, route, res);
          if (problem) { if (vp === "phone") findings.push(problem); continue; }
          await waitForReady(page);
          await page.waitForTimeout(1000);
          const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
          if (cls > LIMIT) {
            const who = [...new Set(shifts)].slice(0, 3).join(", ");
            const found = `${vp}: CLS ${cls.toFixed(3)} (max ${LIMIT}); shifted: ${who}`;
            findings.push({ check: CHECK, rule: "layout-shift", file: route, line: 0, found, why: found, fix: "give media a width/height or aspect-ratio; reserve space (skeleton of the final size) for content that arrives later; never insert above existing content" });
          }
        } finally {
          await page.close();
        }
      }
    }
    return findings;
  });
}
