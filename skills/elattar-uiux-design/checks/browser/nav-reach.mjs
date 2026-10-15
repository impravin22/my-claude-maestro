// Navigation reach on a phone (rules/ux.md rule 22): scroll to the bottom of a page taller than two screens; some
// navigation (a nav landmark, tab list or menu button outside the footer) must still be on screen. Phone, 390x844.
// A page with no navigation at all has nothing to reach and is not judged. Second half: every destination of the
// main navigation at desktop width needs a visible link on the phone, or a menu button that can hold it; responsive
// hiding must never remove the only path to a page.
import { openRoute, routesFor, scanRoutes, VIEWPORTS, withPages } from "./lib.mjs";

export const CHECK = "nav-reach";
export const RULE_IDS = ["nav-reach", "route-unreachable"];
const CAP = 6;

/** Runs in the page. */
async function scan() {
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
      && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const isMenu = (b) => /\b(menu|navigation|navigate)\b/i.test(b.getAttribute("aria-label") || b.textContent || "")
    || (b.hasAttribute("aria-expanded") && /menu|nav/i.test(b.getAttribute("aria-controls") || ""));
  const navs = [...document.querySelectorAll("nav, [role=navigation], [role=tablist], [role=menubar]")];
  const menus = [...document.querySelectorAll("button, [role=button]")].filter(isMenu);
  const all = [...navs, ...menus].filter((e) => !window.__isDev?.(e));
  if (!all.length) return [];
  const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  if (height <= innerHeight * 2) return [];
  scrollTo(0, height);
  await new Promise((r) => setTimeout(r, 250));
  if (all.some((e) => shown(e) && !e.closest("footer"))) return [];
  return [{
    found: `after scrolling to the bottom of a ${(height / innerHeight).toFixed(1)}-screen page no navigation or menu button is on screen`,
    fix: "navigation not reachable without scrolling back: make it sticky or fixed (a header with a menu button, a bottom tab bar), or turn the page into a list that drills down to a page with a back control",
  }];
}

/** Runs in the page: paths of the links in navigation landmarks and asides (not the footer) that are on screen. */
function destinations() {
  const shown = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const path = (a) => { try { const u = new URL(a.href); return u.origin === location.origin ? u.pathname : null; } catch { return null; } };
  const out = {};
  for (const nav of document.querySelectorAll("nav, [role=navigation], aside")) {
    if (!shown(nav) || nav.closest("footer") || window.__isDev?.(nav)) continue;
    for (const a of nav.querySelectorAll("a[href]")) {
      const p = path(a);
      if (p && shown(a) && p !== location.pathname) out[p] = (a.textContent || a.getAttribute("aria-label") || p).trim().split(/\s+/).join(" ").slice(0, 24);
    }
  }
  return out;
}

/** Runs in the page, phone width: which of `dests` have a visible link, and is there a menu button that can hold the rest. */
function phoneHas(dests) {
  const shown = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const seen = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    try { const u = new URL(a.href); if (shown(a)) seen.add(u.pathname); } catch { /* not a URL */ }
  }
  const menu = [...document.querySelectorAll("button, [role=button]")].some((b) => shown(b) && (/\b(menu|navigation|navigate)\b/i.test(b.getAttribute("aria-label") || b.textContent || "") || (b.hasAttribute("aria-expanded") && /menu|nav/i.test(b.getAttribute("aria-controls") || ""))));
  return { menu, missing: Object.keys(dests).filter((p) => !seen.has(p)).map((p) => dests[p] + " (" + p + ")") };
}

export async function run(config, options = {}) {
  const reach = await scanRoutes(config, options, CHECK, [["phone", VIEWPORTS.phone]], scan);
  if (!Array.isArray(reach)) return reach;
  const routes = routesFor(config, options);
  const lost = await withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    for (const route of routes) {
      const open = async (viewport) => openRoute(newPage, CHECK, base, route, { viewport, reducedMotion: "reduce" });
      const d = await open(VIEWPORTS.desktop);
      let dests = {};
      try { if (d.problem) continue; dests = await d.page.evaluate(destinations); } finally { await d.page.close(); }
      if (!Object.keys(dests).length) continue;
      const p = await open(VIEWPORTS.phone);
      try {
        if (p.problem) continue;
        const { menu, missing } = await p.page.evaluate(phoneHas, dests);
        if (menu || !missing.length) continue; // a menu button holds what the bar hides
        findings.push({
          check: CHECK, rule: CHECK, file: route, line: 0,
          found: `phone: ${missing.length} destination${missing.length > 1 ? "s" : ""} of the desktop navigation have no path at phone width: ${missing.slice(0, CAP).join(", ")}`,
          why: `phone: ${missing.length} destination${missing.length > 1 ? "s" : ""} of the desktop navigation have no path at phone width: ${missing.slice(0, CAP).join(", ")}`,
          fix: "navigation not reachable at phone width: every destination needs a visible link or a menu button that opens a list of them; never hide the only path with a breakpoint",
        });
      } finally { await p.page.close(); }
    }
    return findings;
  });
  return Array.isArray(lost) ? [...reach, ...lost] : [...reach];
}
