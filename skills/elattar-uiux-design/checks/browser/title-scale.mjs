// Title scale: a description is always set SMALLER than the title it describes. Never the same size,
// never bigger. Measured on the rendered page, at phone and desktop width, because type roles are
// responsive and a pair can be fine at one width and equal at the other.
//
// A pair is found two ways, with no component list and no font preset:
//   1. slots:    an element with data-slot="<x>-title" and the nearest data-slot="<x>-description"
//                that shares its component (Card, Dialog, Alert, any shadcn-style part)
//   2. headings: an h1-h6 (or role=heading) and the paragraph directly after it
// Weight, colour and opacity do not count: only the computed font-size does.
import { openRoute, routesFor, withPages } from "./lib.mjs";

export const CHECK = "title-scale";
export const RULE_IDS = ["description-not-smaller", "route-unreachable"];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

/** Runs in the page. */
function scan() {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const px = (e) => parseFloat(getComputedStyle(e).fontSize);
  const text = (e) => (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
  const out = [];
  const seen = new Set();
  const judge = (title, desc, how) => {
    if (!visible(title) || !visible(desc) || window.__isDev?.(title)) return;
    const key = `${how}|${text(title)}|${text(desc)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const t = px(title), d = px(desc);
    if (d >= t) out.push({ how, title: text(title), desc: text(desc), t, d });
  };

  // 1. <x>-title with its <x>-description, inside the same component
  for (const title of document.querySelectorAll("[data-slot$='-title']")) {
    const part = title.getAttribute("data-slot").slice(0, -"-title".length);
    let scope = title.parentElement, desc = null;
    for (let i = 0; scope && i < 4 && !desc; i++, scope = scope.parentElement) {
      desc = [...scope.querySelectorAll(`[data-slot='${part}-description']`)].find(visible) ?? null;
    }
    if (desc) judge(title, desc, `${part}-title / ${part}-description`);
  }

  // 2. a heading and the paragraph directly after it
  for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")) {
    const next = h.nextElementSibling;
    if (next && next.tagName === "P") judge(h, next, `<${h.tagName.toLowerCase()}> / <p>`);
  }
  return out;
}

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _b, base) => {
    const findings = [];
    const reported = new Set();
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        const { page, problem } = await openRoute(newPage, CHECK, base, route, {
          viewport: { width: vp.width, height: vp.height },
          reducedMotion: "reduce",
        });
        try {
          if (problem) {
            if (!reported.has(`${route}|unreachable`)) { reported.add(`${route}|unreachable`); findings.push(problem); }
            break;
          }
          await page.waitForTimeout(200);
          for (const f of await page.evaluate(scan)) {
            const found = `${vp.name}: ${f.how} "${f.title}" ${f.t}px, description "${f.desc}" ${f.d}px`;
            const key = `${route}|${f.how}|${f.title}|${f.desc}|${vp.name}`;
            if (reported.has(key)) continue;
            reported.add(key);
            findings.push({
              check: CHECK, rule: "description-not-smaller", file: route, line: 0, found,
              why: `the description is ${f.d === f.t ? "the same size as" : "bigger than"} its title (${f.d}px vs ${f.t}px), so the two read as equals and the title stops leading`,
              fix: "give the description a smaller type role than the title (or the title a larger one); never the same role, never a larger one",
            });
          }
        } finally {
          await page.close();
        }
      }
    }
    return findings;
  });
}
