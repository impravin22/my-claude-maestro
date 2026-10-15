// Overlap: two pieces of text that paint on top of each other ("10Notifications": a count badge sitting on a label).
// Every visible element that owns text is measured by the boxes its text actually occupies (a badge or pill, by its own
// painted box). Two such boxes from unrelated elements (not ancestor and descendant) that intersect by more than 2px
// in both axes, where both really are on top at the overlap point, are BAD. Intentional stacks are exempt: an element
// that, or whose nearest three ancestors, use a negative margin (avatar groups, overlapped chips).
import { scanRoutes, VIEWPORTS } from "./lib.mjs";

export const CHECK = "overlap";
export const RULE_IDS = ["overlap", "route-unreachable"];

/** Runs in the page. */
function scan() {
  const MIN = 2;
  const CAP = 12;
  const label = (e) => {
    const t = ([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim() || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
    return `<${e.tagName.toLowerCase()}> "${t}"`;
  };
  const stacked = (e) => {
    for (let a = e, i = 0; a && a !== document.body && i < 4; a = a.parentElement, i++) {
      const s = getComputedStyle(a);
      if (["marginLeft", "marginRight", "marginTop", "marginBottom"].some((k) => parseFloat(s[k]) < 0)) return true;
    }
    return false;
  };
  const items = [];
  for (const el of [...document.body.querySelectorAll("*")].slice(0, 5000)) {
    if (window.__isDev?.(el)) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "OPTION", "TEXTAREA"].includes(el.tagName.toUpperCase())) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const bg = s.backgroundColor;
    const painted = (bg && bg !== "transparent" && !/,\s*0\)$/.test(bg)) || ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(s["border" + k + "Width"]) > 0 && s["border" + k + "Style"] !== "none");
    // the glyph boxes of every text-owning element, painted or not; a painted one also stands as its box (a badge, a pill)
    const rects = [];
    for (const n of own) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1) rects.push(q);
    }
    const st = stacked(el);
    if (rects.length) items.push({ el, rects, painted: false, stacked: st });
    if (painted) items.push({ el, rects: [box], painted: true, stacked: st });
  }
  const entries = [];
  items.forEach((it, i) => it.rects.forEach((r) => entries.push({ i, r })));
  entries.sort((a, b) => a.r.left - b.r.left);
  const seen = new Set();
  const out = [];
  const onTop = (it, x, y) => document.elementsFromPoint(x, y).some((e) => it.el === e || it.el.contains(e));
  for (let p = 0; p < entries.length && out.length < CAP; p++) {
    const a = entries[p];
    for (let q = p + 1; q < entries.length && entries[q].r.left < a.r.right - MIN; q++) {
      const b = entries[q];
      if (a.i === b.i) continue;
      const A = items[a.i], B = items[b.i];
      if (A.el === B.el) continue;
      // a painted box (a card, a pill) contains its children by design; text is always measured by its own glyph boxes, so a badge inside a label still counts, painted label or not
      if ((A.painted && A.el.contains(B.el)) || (B.painted && B.el.contains(A.el)) || A.stacked || B.stacked) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= MIN || h <= MIN) continue;
      const x = Math.max(a.r.left, b.r.left) + w / 2, y = Math.max(a.r.top, b.r.top) + h / 2;
      const onScreen = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
      if (onScreen && (!onTop(A, x, y) || !onTop(B, x, y))) continue; // one of them is covered or clipped there
      const key = [label(A.el), label(B.el)].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        found: `${label(A.el)} overlaps ${label(B.el)} by ${Math.round(w)}x${Math.round(h)}px`,
        fix: "give them room: space or gap between them, or move the badge or counter out of the label's box (position it against the icon, not the text); never let two pieces of text paint on one another",
      });
      if (out.length >= CAP) break;
    }
  }
  return out;
}

export function run(config, options = {}) {
  return scanRoutes(config, options, CHECK, [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]], scan);
}
