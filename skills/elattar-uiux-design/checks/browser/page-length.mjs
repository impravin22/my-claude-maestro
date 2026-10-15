// Page length: one view, one job (rules/ux.md rule 21). A document taller than 3 screens on desktop or 6 on a phone
// holds several jobs: split it into views. Limits: pageLengthDesktop, pageLengthPhone in viewsonic-ui.config.json.
// Skipped when one repeating list (a feed, results) is over 60% of the page height.
import { scanRoutes, VIEWPORTS } from "./lib.mjs";

export const CHECK = "page-length";
export const RULE_IDS = ["page-length", "route-unreachable"];
export const DEFAULTS = { desktop: 3, phone: 6 };

/** Runs in the page. */
function scan(limit) {
  const phone = innerWidth < 768;
  const max = phone ? limit.phone : limit.desktop;
  const screens = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) / innerHeight;
  if (screens <= max) return [];
  // An endless feed or results list is content, not several jobs: when one repeating list is most of the page, it is
  // not judged by length (nav-reach still asks that navigation stays reachable).
  const total = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  for (const el of [...document.body.querySelectorAll("*")].slice(0, 3000)) {
    if (el.children.length < 6) continue;
    const key = (c) => c.tagName + "." + (typeof c.className === "string" ? c.className.trim().split(/\s+/)[0] : "");
    const counts = {};
    for (const c of el.children) counts[key(c)] = (counts[key(c)] ?? 0) + 1;
    if (Math.max(...Object.values(counts)) / el.children.length >= 0.8 && el.getBoundingClientRect().height / total > 0.6) return [];
  }
  return [{
    found: `the page is ${screens.toFixed(1)} screens tall (limit ${max})`,
    fix: "split it into views: tabs or sub-routes (one URL each) with persistent navigation that shows where the user is; one view, one job",
  }];
}

export function run(config, options = {}) {
  const limit = { desktop: config.pageLengthDesktop ?? DEFAULTS.desktop, phone: config.pageLengthPhone ?? DEFAULTS.phone };
  return scanRoutes(config, options, CHECK, [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]], scan, limit);
}
