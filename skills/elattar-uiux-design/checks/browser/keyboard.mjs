// Keyboard and screen reader: drive the page with Tab, Enter and Escape and read the browser's own accessibility tree.
// WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7, 1.4.11, 2.4.11, 2.5.3, 2.5.8, 4.1.2, 1.1.1.
import { parseColour, ratio } from "../static/contrast.mjs";
import { compositeLayers } from "./contrast.mjs";
import { openRoute, routesFor, setTheme, THEMES, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";

export const CHECK = "keyboard";
export const RULE_IDS = [
  "focus-invisible", "focus-hidden", "focus-order", "keyboard-trap", "overlay-escape",
  "unnamed-control", "landmarks", "img-alt", "small-target", "route-unreachable",
];
export const MAX_STOPS = 200;
export const MAX_OVERLAYS = 10;
export const TARGET_MIN = 44;
export const WCAG_MIN = 24;
const FOCUS_NEED = 3;
const CAP = 15;

const FIX = {
  "focus-invisible": "give the control the system's focus ring (focus-visible ring token, never outline-none without a replacement) in a colour at least 3:1 against what it sits on; run `run.mjs contrast --fg <ring token> --bg <surface>`",
  "focus-hidden": "stop the sticky or fixed element covering the focused control: scroll-padding-top/bottom the height of the sticky bar, or move the control",
  "focus-order": "make DOM order match reading order; remove positive tabindex and visual reordering that moves focus backwards",
  "keyboard-trap": "let Tab and Shift+Tab leave the element; remove the key handler that swallows Tab, or wrap it in a modal that Escape closes",
  "overlay-escape": "use the system's Dialog/Popover/Menu (focus moves in, is trapped in a modal, Escape closes, focus returns to the trigger)",
  "unnamed-control": "give the control a visible text label, or aria-label that contains the visible text; icon-only controls need aria-label",
  "landmarks": "exactly one <main> and one <h1> per page; wrap the page content in <main> and keep one page title",
  "img-alt": "describe a meaningful image in alt; use alt=\"\" for a decorative one",
  "small-target": `make the control at least ${WCAG_MIN}x${WCAG_MIN}px, or space it so a ${WCAG_MIN}px circle on it touches no other target; use the component's own size variants, never an override; an inline text link inside a paragraph is exempt`,
};

/* ───────────────────────── in-page helpers (serialised: no closures) ───────────────────────── */

/** Installs window.__kbd. Runs in the page. */
export function install() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const ROOTS = "[role=dialog],[role=alertdialog],[role=menu],[role=listbox],dialog[open]";
  const TRIGGERS = "[aria-haspopup]:not([aria-haspopup=false]),[data-slot$=trigger],button[aria-expanded]";
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const slot = el.getAttribute("data-slot") ? `[data-slot=${el.getAttribute("data-slot")}]` : "";
    const cls = id || slot ? "" : [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const text = (el.innerText || el.getAttribute("aria-label") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 28);
    return `<${el.tagName.toLowerCase()}${id}${slot}${cls}>${text ? ` "${text}"` : ""}`;
  };
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  ctx.canvas.width = ctx.canvas.height = 1;
  const rgba = (css) => {
    if (/^rgba?\(\s*\d[\d.,\s/]*\)$/.test(css)) return css;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  };
  const alphaOf = (c) => {
    const parts = c.match(/rgba?\(([^)]+)\)/)?.[1].split(/[,/\s]+/).filter(Boolean) ?? [];
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  };
  const backdrop = (el) => {
    const layers = [];
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== "none" && s.backgroundImage.includes("url(")) return { image: true, layers };
      const c = rgba(s.backgroundColor);
      const a = alphaOf(c);
      if (a > 0) { layers.push(c); if (a >= 1) break; }
    }
    return { image: false, layers };
  };
  // split a computed box-shadow list on top-level commas
  const shadows = (v) => {
    const out = []; let depth = 0, cur = "";
    for (const ch of v) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const ringOf = (el) => {
    const s = getComputedStyle(el);
    const found = [];
    if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) {
      if (s.outlineStyle === "auto") found.push({ auto: true });
      else found.push({ colour: rgba(s.outlineColor), kind: "outline" });
    }
    if (s.boxShadow && s.boxShadow !== "none") {
      for (const sh of shadows(s.boxShadow)) {
        if (/\binset\b/.test(sh)) continue;
        const colourTok = sh.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8})/i)?.[1];
        const nums = sh.replace(colourTok ?? "", "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
        const [, , blur = 0, spread = 0] = nums;
        if (colourTok && (spread > 0 || blur > 0)) found.push({ colour: rgba(colourTok), kind: "ring" });
      }
    }
    return found;
  };
  const edges = (el) => {
    const s = getComputedStyle(el);
    return { border: rgba(s.borderTopColor), borderW: parseFloat(s.borderTopWidth), bg: rgba(s.backgroundColor) };
  };
  const ids = new WeakMap();
  let next = 1;
  const keyOf = (el) => { if (!ids.has(el)) ids.set(el, next++); return ids.get(el); };
  const paints = (n) => {
    const s = getComputedStyle(n);
    if (s.visibility === "hidden" || parseFloat(s.opacity) < 0.1) return false;
    if (alphaOf(rgba(s.backgroundColor)) > 0.5 || s.backgroundImage !== "none") return true;
    if (/^(img|svg|video|canvas|picture)$/i.test(n.tagName)) return true;
    for (const c of n.childNodes) if (c.nodeType === 3 && c.textContent.trim()) return true;
    return false;
  };
  const active = () => {
    const el = document.activeElement;
    return !el || el === document.body || el === document.documentElement ? null : el;
  };
  /** Everything the Tab walk needs to know about the focused element. */
  const stop = () => {
    const el = active();
    if (!el) return null;
    if (window.__isDev?.(el)) return { dev: true }; // the framework's dev overlay is not the page
    const r = el.getBoundingClientRect();
    const tiny = r.width <= 1 || r.height <= 1;
    let fixed = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") { fixed = true; break; }
    }
    // covered: something that paints, stacked above the control at the centre of its visible part
    const vx0 = Math.max(r.left, 0), vx1 = Math.min(r.right, innerWidth), vy0 = Math.max(r.top, 0), vy1 = Math.min(r.bottom, innerHeight);
    let covered = null;
    if (!tiny && vx1 > vx0 && vy1 > vy0) {
      const stack = document.elementsFromPoint((vx0 + vx1) / 2, (vy0 + vy1) / 2);
      for (const n of stack) {
        if (el.contains(n) || n.contains(el)) { if (el.contains(n)) break; continue; }
        if (paints(n)) { covered = describe(n); break; }
      }
    }
    const bd = backdrop(el);
    return {
      key: keyOf(el), name: describe(el), tiny, fixed, dir: getComputedStyle(el).direction,
      x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, covered,
      ring: ringOf(el), layers: bd.layers, image: bd.image, edges: edges(el),
    };
  };
  /** Border/fill that changes on focus counts as an indicator (blurs and refocuses the active element). */
  const focusDelta = () => {
    const el = active();
    if (!el) return null;
    const on = edges(el);
    el.blur();
    const off = edges(el);
    el.focus();
    return { on, off };
  };
  const overlayRoots = () => [...document.querySelectorAll(ROOTS)].filter((n) => visible(n) && !window.__isDev?.(n));
  const triggers = () => [...document.querySelectorAll(TRIGGERS)].filter((t) => visible(t) && !window.__isDev?.(t) && !t.matches(":disabled,[aria-disabled=true]") && !t.closest("[inert],[aria-hidden=true]"));
  window.__kbd = { visible, describe, stop, focusDelta, overlayRoots, triggers, active };
}

/** Runs in the page: images and landmarks the accessibility tree cannot tell us about. */
function auditInPage() {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  for (const img of document.querySelectorAll("img,input[type=image],[role=img]")) {
    if (img.closest("[aria-hidden=true]") || window.__isDev?.(img)) continue;
    const named = img.hasAttribute("alt") || img.getAttribute("aria-label")?.trim() || img.hasAttribute("aria-labelledby") || img.getAttribute("role") === "presentation" || img.getAttribute("role") === "none";
    const titled = img.getAttribute("title")?.trim();
    if (!named && !titled && (img.tagName !== "IMG" || visible(img))) {
      out.push({ rule: "img-alt", found: `${img.tagName.toLowerCase()} ${(img.getAttribute("src") ?? "").slice(0, 40) || "[role=img]"} has no alt attribute` });
    }
  }
  return out;
}

/**
 * Runs in the page. Interactive elements smaller than `min` in either dimension, except an inline text link
 * inside a paragraph (WCAG 2.5.8 inline exception) and visually hidden proxies (1px wide). The box counts as the
 * larger of the control and its label, since the label is clickable too. Exported so the UX check reuses it.
 * @returns {{ what: string, w: number, h: number }[]}
 */
export function targetsInPage(min) {
  const SEL = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=slider],[tabindex]:not([tabindex='-1'])";
  const box = (el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const shown = (el) => { const s = getComputedStyle(el); const b = box(el); return b.w > 0 && b.h > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const label = (el) => {
    const t = (el.innerText || el.getAttribute("aria-label") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 28);
    return `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}>${t ? ` "${t}"` : ""}`;
  };
  const all = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!shown(el) || el.matches(":disabled,[aria-disabled=true]") || el.closest("[aria-hidden=true],[inert]") || window.__isDev?.(el)) continue;
    let { w, h } = box(el);
    if (w <= 1 || h <= 1) continue; // visually hidden proxy for a styled control
    let r = el.getBoundingClientRect();
    let [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom];
    const lab = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
    if (lab && shown(lab)) { const l = box(lab); w = Math.max(w, l.w); h = Math.max(h, l.h); const lr = lab.getBoundingClientRect(); [x0, y0, x1, y1] = [Math.min(x0, lr.left), Math.min(y0, lr.top), Math.max(x1, lr.right), Math.max(y1, lr.bottom)]; }
    let inline = false;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") {
      const block = el.closest("p,li,dd,dt,td,th,blockquote,figcaption,label");
      const around = block ? (block.textContent ?? "").replace(el.textContent ?? "", "").trim() : "";
      if (block && around.length > 0) inline = true; // inline link in running text
    }
    all.push({ el, w, h, x0, y0, x1, y1, inline, small: w < min || h < min });
  }
  // WCAG 2.5.8 spacing: a 24px circle on an undersized target must not touch another target (or its circle if also undersized)
  const R = 12;
  const crowded = (t) => {
    const cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2;
    return all.some((o) => {
      if (o === t || t.el.contains(o.el) || o.el.contains(t.el)) return false;
      if (o.w < 24 || o.h < 24) return Math.hypot((o.x0 + o.x1) / 2 - cx, (o.y0 + o.y1) / 2 - cy) < 2 * R;
      const dx = Math.max(o.x0 - cx, 0, cx - o.x1), dy = Math.max(o.y0 - cy, 0, cy - o.y1);
      return Math.hypot(dx, dy) < R;
    });
  };
  const out = [];
  for (const t of all) {
    if (!t.small || t.inline) continue;
    out.push({ what: label(t.el), w: Math.round(t.w), h: Math.round(t.h), crowded: (t.w < 24 || t.h < 24) && crowded(t) });
  }
  return out;
}

/** Measure the small targets on an open page. The one measuring function; the UX check imports it. */
export async function measureTargets(page, min = TARGET_MIN) {
  return page.evaluate(targetsInPage, min);
}

/* ───────────────────────── node-side judging ───────────────────────── */

const fmt = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

/** Judge one focus stop's indicator. Pure. Returns null when it passes, or a "found" string. */
export function judgeRing(s, delta) {
  if (s.tiny) return null;
  if (s.ring.some((r) => r.auto)) return null; // the browser's own two-tone ring
  if (s.image) return null;
  const bg = compositeLayers(s.layers);
  let best = 0;
  for (const r of s.ring) {
    const c = parseColour(r.colour);
    if (c.a === 0) continue;
    best = Math.max(best, ratio(c, bg));
  }
  if (best >= FOCUS_NEED) return null;
  if (delta) {
    // a border that changes on focus is the indicator (inputs)
    if (delta.on.border !== delta.off.border && delta.on.borderW > 0) {
      const c = parseColour(delta.on.border);
      const r = ratio(c, bg);
      if (r >= FOCUS_NEED) return null;
      best = Math.max(best, r);
    }
    if (delta.on.bg !== delta.off.bg) {
      const r = ratio(parseColour(delta.on.bg), parseColour(delta.off.bg));
      if (r >= FOCUS_NEED) return null;
    }
  }
  return s.ring.length
    ? `${s.name} focus ring is ${best.toFixed(2)}:1 against ${fmt(bg)} (need ${FOCUS_NEED})`
    : `${s.name} shows no focus indicator (no outline or ring)`;
}

/** Judge consecutive stops for reading order. Pure. */
export function judgeOrder(prev, cur) {
  if (prev.fixed || cur.fixed || prev.tiny || cur.tiny) return null;
  const pcy = prev.y + prev.h / 2, ccy = cur.y + cur.h / 2;
  const row = Math.max(prev.h, cur.h);
  const overlapX = Math.min(prev.x + prev.w, cur.x + cur.w) - Math.max(prev.x, cur.x) > 0;
  if (pcy - ccy > row && overlapX) return `${cur.name} comes after ${prev.name} but sits ${Math.round(pcy - ccy)}px above it`;
  const sameRow = Math.abs(pcy - ccy) < Math.min(prev.h, cur.h) / 2;
  if (sameRow && cur.dir !== "rtl" && cur.x + cur.w <= prev.x) return `${cur.name} comes after ${prev.name} but sits to its left on the same row`;
  return null;
}

const INTERACTIVE = new Set([
  "button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "switch", "tab", "menuitem",
  "menuitemcheckbox", "menuitemradio", "slider", "spinbutton", "treeitem", "DisclosureTriangle", "PopUpButton",
]);
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The browser's accessibility tree: unnamed controls, names that drop the visible label, main and h1 counts. */
async function accessibilityFindings(page) {
  const found = [];
  const cdp = await page.context().newCDPSession(page);
  try {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const live = nodes.filter((n) => !n.ignored);
    const mains = live.filter((n) => n.role?.value === "main").length;
    const h1s = live.filter((n) => n.role?.value === "heading" && n.properties?.some((p) => p.name === "level" && Number(p.value?.value) === 1)).length;
    if (mains !== 1) found.push({ rule: "landmarks", found: `${mains} <main> landmarks (need exactly one)` });
    if (h1s !== 1) found.push({ rule: "landmarks", found: `${h1s} <h1> headings (need exactly one)` });
    let seen = 0;
    for (const n of live) {
      const role = n.role?.value;
      if (!INTERACTIVE.has(role) || !n.backendDOMNodeId || seen++ > 600) continue;
      const name = String(n.name?.value ?? "").trim();
      const { node } = await cdp.send("DOM.describeNode", { backendNodeId: n.backendDOMNodeId }).catch(() => ({}));
      if (!node || node.nodeName === "#document") continue;
      const attrs = Object.fromEntries((node.attributes ?? []).reduce((acc, v, i, a) => (i % 2 ? acc : [...acc, [v, a[i + 1]]]), []));
      const tag = node.nodeName.toLowerCase();
      if (tag === "input" && ["hidden"].includes(attrs.type)) continue;
      const dev = await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId })
        .then(({ object }) => (object?.objectId ? cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, returnByValue: true, functionDeclaration: "function(){return !!window.__isDev?.(this)}" }) : null))
        .then((r) => r?.result?.value === true)
        .catch(() => false);
      if (dev) continue; // the framework's dev overlay, not the page
      const nameOf = `<${tag}${attrs.id ? "#" + attrs.id : ""}${attrs["data-slot"] ? `[data-slot=${attrs["data-slot"]}]` : ""}>`;
      if (!name) {
        found.push({ rule: "unnamed-control", found: `${role} ${nameOf} has no accessible name` });
        continue;
      }
      if (attrs["aria-label"] || attrs["aria-labelledby"]) {
        const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId }).catch(() => ({}));
        if (!object?.objectId) continue;
        const { result } = await cdp.send("Runtime.callFunctionOn", {
          objectId: object.objectId, returnByValue: true,
          functionDeclaration: "function(){const field=/^(INPUT|SELECT|TEXTAREA)$/.test(this.tagName)&&!/^(button|submit|reset)$/.test(this.type);const raw=field?[...(this.labels||[])].map(l=>l.innerText).join(' '):(this.innerText||(this.tagName==='INPUT'?this.value:''));const t=raw.replace(/\\s+/g,' ').trim();const r=this.getBoundingClientRect();return r.width>0&&r.height>0?t:''}",
        }).catch(() => ({}));
        const visibleText = String(result?.value ?? "");
        if (/[\p{L}\p{N}]/u.test(visibleText) && !norm(name).includes(norm(visibleText))) {
          found.push({ rule: "unnamed-control", found: `${role} ${nameOf} is named "${name.slice(0, 40)}" but shows "${visibleText.slice(0, 40)}" (the name must contain the visible label)` });
        }
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  return found;
}

/* ───────────────────────── Tab walk ───────────────────────── */

/** One walk. from "top": Tab from the start of the page. from "main": focus the first control in <main>, then Tab on. */
async function walk(page, theme, from) {
  const findings = [];
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [];
  const byKey = new Map();
  let prev = null, wrapped = false, devRun = 0;
  for (let i = 0; i < MAX_STOPS; i++) {
    if (from === "main" && i === 0) {
      const ok = await page.evaluate(() => {
        const el = document.querySelector("main")?.querySelector("a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex='-1'])");
        el?.focus();
        return !!el && document.activeElement === el;
      });
      if (!ok) return { findings, wrapped: true };
    } else {
      await page.keyboard.press("Tab");
    }
    const s = await page.evaluate(() => window.__kbd.stop());
    if (!s) { wrapped = true; break; } // focus left the page
    if (s.dev) { if (++devRun > 12) { wrapped = true; break; } continue; } // dev overlay: not a stop, not a trap
    devRun = 0;
    if (byKey.has(s.key)) {
      if (s.key === stops[0]?.key) { wrapped = true; break; } // came back round to the start: no trap
      findings.push({ rule: "keyboard-trap", found: `focus is stuck at ${s.name}: Tab keeps returning to ${byKey.get(s.key).name} after ${stops.length} stops` });
      wrapped = true;
      break;
    }
    byKey.set(s.key, s);
    stops.push(s);
    // blur and refocus runs the page's own handlers, so it only happens for a stop that already failed
    let ring = judgeRing(s, null);
    if (ring && !s.tiny && !s.ring.some((r) => r.auto)) {
      ring = judgeRing(s, await page.evaluate(() => window.__kbd.focusDelta()));
    }
    if (ring) findings.push({ rule: "focus-invisible", found: `${theme}: ${ring}` });
    if (s.covered) findings.push({ rule: "focus-hidden", found: `${s.name} is covered by ${s.covered} when focused` });
    const order = prev && judgeOrder(prev, s);
    if (order) findings.push({ rule: "focus-order", found: order });
    prev = s;
  }
  return { findings, wrapped };
}

async function tabWalk(page, theme, note) {
  const first = await walk(page, theme, "top");
  const findings = [...first.findings];
  if (!first.wrapped) {
    // a long navigation before <main>: walk the content on its own, with its own order state
    const second = await walk(page, theme, "main");
    findings.push(...second.findings);
    if (!second.wrapped) note?.(`NOTE keyboard: stopped after ${MAX_STOPS} tab stops from the top and ${MAX_STOPS} more from <main> without reaching the end of the page`);
  }
  return findings;
}

/* ───────────────────────── overlays ───────────────────────── */

/** Focus trigger number `i`, press Enter, and report what opened. Exported so the UX check opens overlays the same way. */
export async function openTrigger(page, i, base, route) {
  await page.evaluate(install);
  const trig = await page.evaluate((idx) => {
    const t = window.__kbd.triggers()[idx];
    if (!t) return null;
    t.scrollIntoView({ block: "center" });
    t.focus();
    window.__trigger = t;
    window.__before = new Set(window.__kbd.overlayRoots());
    window.__expanded = t.getAttribute("aria-expanded");
    return { name: window.__kbd.describe(t), role: t.getAttribute("role") ?? "", focused: document.activeElement === t };
  }, i);
  if (!trig || !trig.focused) return null;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  if (!page.url().startsWith(base + route.split("#")[0])) { await page.goto(base + route, { waitUntil: "load" }); return { trig, left: true }; }
  const opened = await page.evaluate(() => {
    const fresh = window.__kbd.overlayRoots().filter((r) => !window.__before.has(r));
    window.__root = fresh[0] ?? null;
    const t = window.__trigger;
    const root = window.__root;
    // modal: says so (aria-modal, alertdialog, showModal) or the rest of the page was hidden from assistive tech or made inert
    const hides = !!document.querySelector("[data-aria-hidden=true],[inert]");
    const modal = !!root && (root.getAttribute("aria-modal") === "true" || root.getAttribute("role") === "alertdialog" || (root.tagName === "DIALOG" && root.matches(":modal")) || (root.getAttribute("role") === "dialog" && root.getAttribute("aria-modal") !== "false" && hides));
    return {
      isOverlay: !!root, modal, changed: t.getAttribute("aria-expanded") !== window.__expanded,
      focusInside: !!root && root.contains(document.activeElement),
      focusables: root ? root.querySelectorAll("a[href],button,input,select,textarea,[tabindex]").length : 0,
    };
  });
  return { trig, opened };
}

/** Number the visible, enabled overlay triggers on the page, keeping one per distinct kind (up to `cap`). */
export async function pickTriggers(page, cap = MAX_OVERLAYS) {
  await page.evaluate(install);
  const list = await page.evaluate(() => window.__kbd.triggers().map((t, i) => ({ i, key: `${t.tagName}|${t.getAttribute("aria-haspopup") ?? ""}|${(t.innerText || t.getAttribute("aria-label") || "").trim()}` })));
  const picked = [], keys = new Set();
  for (const t of list) if (!keys.has(t.key) && picked.length < cap) { keys.add(t.key); picked.push(t.i); }
  return { total: list.length, picked };
}

async function overlayFindings(page, base, route, note) {
  const found = [];
  let tested = 0, opened_ = 0;
  const { total, picked } = await pickTriggers(page);
  for (const i of picked) {
    const got = await openTrigger(page, i, base, route);
    if (!got) continue;
    tested++;
    if (got.left) continue;
    const { trig, opened } = got;
    if (opened.isOverlay) {
      const where = trig.name;
      const combobox = trig.role === "combobox";
      if (!opened.focusInside && !combobox) found.push({ rule: "overlay-escape", found: `${where} opens an overlay but focus stays outside it` });
      if (opened.modal && opened.focusInside) {
        let leaked = null;
        for (let k = 0; k < Math.min(opened.focusables + 3, 15) && !leaked; k++) {
          await page.keyboard.press("Tab");
          leaked = await page.evaluate(() => {
            const a = window.__kbd.active();
            return a && !window.__root.contains(a) ? window.__kbd.describe(a) : null;
          });
        }
        if (leaked) found.push({ rule: "overlay-escape", found: `Tab leaves the open modal from ${where}: focus reached ${leaked}` });
        // Escape is judged from inside the overlay, wherever Tab left focus
        await page.evaluate(() => { if (!window.__root.contains(document.activeElement)) window.__root.querySelector("button,[href],input,select,textarea,[tabindex]")?.focus(); });
      }
      await page.keyboard.press("Escape");
      let closed = false;
      for (let k = 0; k < 10 && !closed; k++) {
        await page.waitForTimeout(100);
        closed = await page.evaluate(() => { const r = window.__root; return !r.isConnected || !window.__kbd.visible(r) || r.getAttribute("aria-hidden") === "true"; });
      }
      if (!closed) found.push({ rule: "overlay-escape", found: `Escape does not close the overlay opened by ${where}` });
      else {
        await page.waitForTimeout(100);
        const back = await page.evaluate(() => {
          const a = document.activeElement, t = window.__trigger;
          return a === t || t.contains(a) ? null : (a && a !== document.body ? window.__kbd.describe(a) : "nothing (the page body)");
        });
        if (back) found.push({ rule: "overlay-escape", found: `focus is not returned to ${where} after Escape; it is on ${back}` });
      }
    }
    if (opened.isOverlay) opened_++;
    if (opened.isOverlay || opened.changed) await page.goto(base + route, { waitUntil: "load" }).then(() => waitForReady(page));
  }
  note?.(`NOTE keyboard ${route}: ${total} triggers, ${tested} tried (cap ${MAX_OVERLAYS} distinct), ${opened_} opened an overlay`);
  return found;
}

/* ───────────────────────── entry ───────────────────────── */

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  return withPages(config, options, async (newPage, _browser, base) => {
    const findings = [];
    for (const route of routes) {
      const seen = new Set();
      const perRoute = [];
      const add = (f) => {
        const key = `${f.rule}|${f.found}`;
        if (!seen.has(key)) { seen.add(key); perRoute.push(f); }
      };
      for (const theme of THEMES) {
        const { page, problem } = await openRoute(newPage, CHECK, base, route, { viewport: VIEWPORTS.desktop, colorScheme: theme, reducedMotion: "reduce" });
        try {
          if (problem) { if (theme === "light") findings.push(problem); continue; }
          await setTheme(page, theme);
          await page.evaluate(install);
          for (const f of await tabWalk(page, theme, options.note && ((m) => options.note(m.replace('NOTE keyboard:', `NOTE keyboard ${route} (${theme}):`))))) add(f);
          if (theme !== "light") continue;
          for (const f of await page.evaluate(auditInPage)) add(f);
          for (const f of await accessibilityFindings(page)) add(f);
          const small = await measureTargets(page);
          for (const t of small) {
            if (t.w >= WCAG_MIN && t.h >= WCAG_MIN) continue; // 24 to 44px is allowed; the route note below says how many
            if (!t.crowded) continue; // under 24 but with the 2.5.8 spacing exception
            add({ rule: "small-target", found: `${t.what} is ${t.w}x${t.h}px: fails WCAG 2.5.8 (${WCAG_MIN}x${WCAG_MIN} minimum, and too close to another target for the spacing exception)`, fix: FIX["small-target"] });
          }
          const below = small.filter((t) => t.w >= WCAG_MIN && t.h >= WCAG_MIN).length;
          if (below) options.note?.(`NOTE keyboard ${route}: ${below} controls are below ${TARGET_MIN}px - fine for dense UI; make sure the page's primary touch actions use a size >= ${TARGET_MIN}, e.g. lg`);
          for (const f of await overlayFindings(page, base, route, options.note)) add(f);
        } finally {
          await page.close();
        }
      }
      // the cap is per rule, so a long list of small targets cannot hide a keyboard trap
      const byRule = new Map();
      for (const f of perRoute) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
      for (const [rule, list] of byRule) {
        const shown = list.length > CAP ? CAP - 1 : list.length;
        for (const f of list.slice(0, shown)) findings.push({ check: CHECK, rule, file: route, line: 0, found: f.found, why: f.found, fix: f.fix ?? FIX[rule] });
        if (list.length > shown) {
          const more = `+${list.length - shown} more ${rule} failures on this route`;
          findings.push({ check: CHECK, rule, file: route, line: 0, found: more, why: more, fix: "fix the findings above, then re-run to see the rest" });
        }
      }
    }
    return findings;
  });
}
