// Truncation: text that is cut off without anyone meaning it to be.
//   clipped text   an element that owns text, clips its overflow (hidden or clip) and whose content is wider than its box
//                  (scrollWidth > clientWidth + 1), with no text-overflow: ellipsis and no line-clamp, loses letters silently
//   placeholder    an input whose placeholder is wider than the field's content box ("Search posts an"); measured with
//                  canvas measureText in the field's own computed font
// Truncate on purpose (ellipsis or line-clamp, with the full text reachable) or make room.
import { scanRoutes, VIEWPORTS } from "./lib.mjs";

export const CHECK = "truncation";
export const RULE_IDS = ["truncation", "route-unreachable"];

/** Runs in the page. */
function scan() {
  const CAP = 12;
  const out = [];
  const seen = new Set();
  const add = (key, found, fix) => { if (!seen.has(key) && out.length < CAP) { seen.add(key); out.push({ found, fix }); } };
  const short = (t, n = 30) => { const v = t.replace(/\s+/g, " ").trim(); return v.length > n ? `${v.slice(0, n)}…` : v; };
  const ctx = document.createElement("canvas").getContext("2d");
  for (const el of [...document.body.querySelectorAll("*")].slice(0, 5000)) {
    if (out.length >= CAP) break;
    if (window.__isDev?.(el)) continue;
    const tag = el.tagName.toUpperCase();
    if (["SCRIPT", "STYLE", "SVG", "SELECT", "OPTION"].includes(tag)) continue;
    if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue; // sr-only and collapsed things
    const s = getComputedStyle(el);
    if (tag === "INPUT") {
      if (!["text", "search", "email", "url", "tel", "password", "number"].includes((el.type || "text").toLowerCase())) continue;
      const ph = el.getAttribute("placeholder");
      if (!ph || el.value) continue;
      const content = r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth);
      const ps = getComputedStyle(el, "::placeholder"); // a ::placeholder rule may change the font
      ctx.font = `${ps.fontStyle} ${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
      const ls = parseFloat(ps.letterSpacing) || 0;
      const w = ctx.measureText(ph).width + ls * ph.length;
      if (w > content + 1) add("p|" + ph + "|" + Math.round(content), `the placeholder "${short(ph, 40)}" is ${Math.round(w)}px wide in a ${Math.round(content)}px field: it reads cut off`, "shorten the placeholder to what fits, or widen the field; the label carries the full meaning, the placeholder is only a hint");
      continue;
    }
    if (!["hidden", "clip"].includes(s.overflowX)) continue;
    if (!([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
    if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none") || s.display === "-webkit-box") continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      const t = el.innerText || el.textContent || "";
      add("c|" + short(t), `<${tag.toLowerCase()}> "${short(t)}" is ${el.scrollWidth}px of text in ${el.clientWidth}px with overflow hidden and no ellipsis: letters are cut off`, "let the text wrap or give the box room; if truncation is intended, use the truncate token (ellipsis) or a line clamp and keep the full text reachable (title, tooltip or detail view)");
    }
  }
  return out;
}

export function run(config, options = {}) {
  return scanRoutes(config, options, CHECK, [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]], scan);
}
