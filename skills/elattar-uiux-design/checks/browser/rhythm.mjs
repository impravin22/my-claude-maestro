// Rhythm: repeated items are equally spaced. In every vertical list or stack with 3+ visible children,
// the gaps between consecutive children are equal (within 1px). Only stacks of one kind of child (all <li>, all <div>...)
// are repeated items; a mix of tags is a composition, judged by Proximity in the screenshots. An uneven gap that is deliberate is a group
// boundary (Proximity): split the stack into two in the markup. There is no skip list; every one is reported.
import { openRoute, routesFor, VIEWPORTS, withPages } from "./lib.mjs";

export const CHECK = "rhythm";
export const RULE_IDS = ["uneven-gap", "route-unreachable"];
const CAP = 30;

/** Runs in the page. */
function scan() {
  const out = [];
  const stacks = document.querySelectorAll("ul, ol, [role=list], [data-slot$=-group], [class~=flex-col], [class~=grid], [class~=space-y-1],[class*=space-y-]");
  for (const s of stacks) {
    const style = getComputedStyle(s);
    if (style.display === "none" || style.visibility === "hidden" || window.__isDev?.(s)) continue;
    const kids = [...s.children].filter((k) => {
      const cs = getComputedStyle(k);
      return k.offsetHeight > 0 && cs.position !== "absolute" && cs.position !== "fixed" && cs.display !== "none";
    });
    if (kids.length < 3) continue;
    // Repeated items are one kind of thing. A card's own composition (title row, text, chips) is mixed on purpose: its gaps are Proximity.
    if (new Set(kids.map((k) => k.tagName)).size > 1) continue;
    const r = kids.map((k) => k.getBoundingClientRect());
    if (!r.every((b, i) => i === 0 || b.top >= r[i - 1].bottom - 1)) continue; // not a vertical stack
    const gaps = r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom));
    if (Math.max(...gaps) - Math.min(...gaps) > 1) {
      const cls = typeof s.className === "string" ? s.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "";
      out.push({ sel: `${s.tagName.toLowerCase()}${cls ? "." + cls : ""}`, gaps: gaps.join("/"), n: kids.length });
    }
  }
  return out;
}

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    for (const route of routes) {
      const seen = new Set();
      const perRoute = [];
      for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
        const { page, problem } = await openRoute(newPage, CHECK, base, route, { viewport, reducedMotion: "reduce" });
        try {
          if (problem) { if (vp === "phone") findings.push(problem); continue; }
          await page.waitForTimeout(300);
          for (const u of await page.evaluate(scan)) {
            const key = `${u.sel}|${u.gaps}`;
            if (seen.has(key)) continue;
            seen.add(key);
            perRoute.push({ vp, ...u });
          }
        } finally {
          await page.close();
        }
      }
      const shown = perRoute.length > CAP ? CAP - 1 : perRoute.length;
      for (const u of perRoute.slice(0, shown)) {
        const found = `${u.vp}: <${u.sel}> ${u.n} items, gaps ${u.gaps}px`;
        findings.push({ check: CHECK, rule: "uneven-gap", file: route, line: 0, found, why: found, fix: "give the stack one gap token; if the uneven gap is a deliberate group boundary, split it into two stacks (Proximity), do not skip it" });
      }
      if (perRoute.length > CAP) {
        const more = `+${perRoute.length - shown} more uneven stacks on this route`;
        findings.push({ check: CHECK, rule: "uneven-gap", file: route, line: 0, found: more, why: more, fix: "fix the findings above, then re-run to see the rest" });
      }
    }
    return findings;
  });
}
