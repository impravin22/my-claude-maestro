// Concentric radius (rules/secondary.md, Proportion): an inner rounded surface near the corner of an outer one has
// radius = outer radius - the inset between them, never larger than the outer. For every visible element with its
// own background or border and a radius, inside the nearest ancestor that has the same: when the element sits within
// the ancestor's padding box and its radius exceeds outer - inset + 1px, that is BAD. Only a corner closer to the
// outer corner than the outer radius is judged (further in, the curve is nowhere near). Radii are capped at half the
// shorter side, so a pill inside a pill is judged by what is painted.
import { scanRoutes, VIEWPORTS } from "./lib.mjs";

export const CHECK = "nested-radius";
export const RULE_IDS = ["nested-radius", "route-unreachable"];

/** Runs in the page. */
function scan() {
  const SLACK = 1;
  const CAP = 12;
  const CORNERS = [["borderTopLeftRadius", "left", "top"], ["borderTopRightRadius", "right", "top"], ["borderBottomRightRadius", "right", "bottom"], ["borderBottomLeftRadius", "left", "bottom"]];
  const surface = (s) => {
    const bg = s.backgroundColor;
    const hasBg = bg && bg !== "transparent" && !/,\s*0\)$/.test(bg);
    return hasBg || ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(s["border" + k + "Width"]) > 0 && s["border" + k + "Style"] !== "none");
  };
  const radii = (s, r) => {
    const cap = Math.min(r.width, r.height) / 2;
    return CORNERS.map(([k]) => {
      const raw = s[k].split(" ")[0];
      const v = raw.endsWith("%") ? (parseFloat(raw) / 100) * r.width : parseFloat(raw);
      return Math.min(Number.isFinite(v) ? v : 0, cap);
    });
  };
  const label = (e) => {
    const c = typeof e.className === "string" ? e.className.trim().split(/\s+/)[0] : "";
    return "<" + e.tagName.toLowerCase() + (c ? "." + c : "") + ">";
  };
  const info = new Map();
  const read = (e) => {
    if (info.has(e)) return info.get(e);
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const vis = r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    const v = { s, r, vis, surf: vis && surface(s), rad: vis ? radii(s, r) : [0, 0, 0, 0] };
    info.set(e, v);
    return v;
  };
  const seen = new Set();
  const out = [];
  for (const el of [...document.body.querySelectorAll("*")].slice(0, 4000)) {
    if (out.length >= CAP) break;
    if (window.__isDev?.(el)) continue;
    const c = read(el);
    if (!c.surf || Math.max(...c.rad) <= 0 || c.r.width < 6 || c.r.height < 6) continue;
    let anc = el.parentElement;
    let a = null;
    while (anc && anc !== document.body) {
      const v = read(anc);
      if (v.surf) { a = v; break; }
      anc = anc.parentElement;
    }
    if (!a) continue;
    const b = (k) => parseFloat(a.s["border" + k + "Width"]) || 0;
    const inset = {
      left: c.r.left - (a.r.left + b("Left")), right: a.r.right - b("Right") - c.r.right,
      top: c.r.top - (a.r.top + b("Top")), bottom: a.r.bottom - b("Bottom") - c.r.bottom,
    };
    if (Object.values(inset).some((n) => n < -0.5)) continue; // not inside the padding box
    CORNERS.forEach(([, hx, hy], i) => {
      const outer = a.rad[i];
      const ix = Math.max(0, inset[hx]);
      const iy = Math.max(0, inset[hy]);
      if (outer <= 0 || Math.max(ix, iy) >= outer) return; // the outer curve is not near this corner
      const d = Math.min(ix, iy);
      const inner = c.rad[i];
      if (inner <= outer - d + SLACK) return;
      const key = [label(el), label(anc), Math.round(inner), Math.round(outer), Math.round(d)].join("|");
      if (seen.has(key) || out.length >= CAP) return;
      seen.add(key);
      out.push({
        found: `${label(el)} has radius ${Math.round(inner)}px inside ${label(anc)} with radius ${Math.round(outer)}px, inset ${Math.round(d)}px`,
        fix: `inner radius = outer radius - inset: ${Math.round(outer)} - ${Math.round(d)} = ${Math.max(0, Math.round(outer - d))}px; use the radius token at or below that, never larger than the container's`,
      });
    });
  }
  return out;
}

export function run(config, options = {}) {
  return scanRoutes(config, options, CHECK, [["desktop", VIEWPORTS.desktop], ["phone", VIEWPORTS.phone]], scan);
}
