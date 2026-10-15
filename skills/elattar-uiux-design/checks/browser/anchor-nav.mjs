// Anchor navigation: main navigation switches views, it never jump-scrolls (rules/ux.md rule 23). A nav, aside or
// [role=navigation] whose links are mostly same-page #hash links (three or more) is a page that should be views.
// A table of contents for one long document is the exception: judge it in Review.
import { scanRoutes, VIEWPORTS } from "./lib.mjs";

export const CHECK = "anchor-nav";
export const RULE_IDS = ["anchor-nav", "route-unreachable"];

/** Runs in the page. */
function scan() {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const out = [];
  for (const nav of document.querySelectorAll("nav, aside, [role=navigation]")) {
    if (!visible(nav) || window.__isDev?.(nav)) continue;
    const links = [...nav.querySelectorAll("a[href]")].filter(visible);
    const same = links.filter((a) => {
      const raw = a.getAttribute("href") ?? "";
      if (raw.startsWith("#")) return raw.length > 1;
      try {
        const u = new URL(a.href);
        return u.hash.length > 1 && u.origin === location.origin && u.pathname === location.pathname && u.search === location.search;
      } catch { return false; }
    });
    if (same.length >= 3 && same.length > links.length / 2) {
      const name = nav.getAttribute("aria-label") ? ` "${nav.getAttribute("aria-label")}"` : "";
      out.push({
        found: `<${nav.tagName.toLowerCase()}>${name} has ${same.length} of ${links.length} links that jump to #sections on the same page`,
        fix: "main navigation should switch views, not jump-scroll: make each section its own view (tab or sub-route with its own URL); keep #anchors only for a table of contents on one long document",
      });
    }
  }
  return out;
}

export function run(config, options = {}) {
  return scanRoutes(config, options, CHECK, [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]], scan);
}
