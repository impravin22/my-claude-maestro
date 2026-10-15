// Emphasis: one emphasised thing per view. At most one default (primary) Button per main, dialog or card
// region, and at most one element carrying a glow. Routes that show every variant side by side on purpose
// (component specimen pages) are excluded by prefix in `emphasisExclude` of viewsonic-ui.config.json.
import { openRoute, routesFor, withPages } from "./lib.mjs";

export const CHECK = "emphasis";
export const RULE_IDS = ["multiple-primary", "multiple-glow", "route-unreachable"];

/** Runs in the page. */
function scan() {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const REGION = "main, [role=dialog], [data-slot=card]";
  const out = [];
  for (const r of document.querySelectorAll(REGION)) {
    if (!visible(r) || window.__isDev?.(r)) continue;
    const own = [...r.querySelectorAll("[data-slot=button][data-variant=default]")].filter((b) => visible(b) && b.closest(REGION) === r);
    if (own.length > 1) {
      const names = own.slice(0, 3).map((b) => `"${(b.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24)}"`).join(", ");
      out.push({ rule: "multiple-primary", found: `${r.tagName.toLowerCase()} has ${own.length} primary buttons: ${names}` });
    }
  }
  const glows = [...document.querySelectorAll("[class*='glow-']")].filter((g) => visible(g) && !window.__isDev?.(g));
  if (glows.length > 1) {
    const names = glows.slice(0, 3).map((g) => g.tagName.toLowerCase()).join(", ");
    out.push({ rule: "multiple-glow", found: `${glows.length} glows on one view (${names})` });
  }
  return out;
}

export async function run(config, options = {}) {
  const exclude = config.emphasisExclude ?? [];
  const all = routesFor(config, options);
  const routes = all.filter((r) => !exclude.some((p) => r.startsWith(p)));
  if (all.length && !routes.length) return { skipped: "all routes are excluded by emphasisExclude in viewsonic-ui.config.json" };
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    for (const route of routes) {
      const { page, problem } = await openRoute(newPage, CHECK, base, route, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      try {
        if (problem) { findings.push(problem); continue; }
        await page.waitForTimeout(300);
        for (const f of await page.evaluate(scan)) {
          findings.push({
            check: CHECK, rule: f.rule, file: route, line: 0, found: f.found, why: f.found,
            fix: f.rule === "multiple-primary"
              ? "keep one default Button per region; make the others outline or secondary, and say why the one you kept is the primary action"
              : "ration the glow: keep it on the single most important element and remove it elsewhere",
          });
        }
      } finally {
        await page.close();
      }
    }
    return findings;
  });
}
