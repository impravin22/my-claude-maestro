// Rendered contrast: what the page actually paints, every route, both themes.
import { parseColour, ratio, verdict, needs } from "../static/contrast.mjs";
import { routesFor, setTheme, THEMES, unreachableFinding, waitForReady, withPages } from "./lib.mjs";

export const CHECK = "contrast-rendered";
export const RULE_IDS = ["rendered-text", "rendered-large", "rendered-ui", "route-unreachable"];
const CAP = 50;
const RULE = { text: "rendered-text", large: "rendered-large", ui: "rendered-ui" };

/** Runs in the page. Returns samples with the ancestor background layers (top first) normalised to rgba(). */
function sampleInPage() {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  ctx.canvas.width = ctx.canvas.height = 1;
  const rgba = (css) => {
    if (/^rgba?\(\s*\d[\d.,\s]*\)$/.test(css)) return css;
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
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && opacityOf(el) >= 0.01;
  };
  // What is painted under `el`: the elements stacked beneath it at its centre (so a sibling "selected" pill counts),
  // falling back to its ancestors when the centre cannot be hit-tested. skipSelf: ignore el's own fill (controls).
  const beneath = (el, skipSelf) => {
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const hit = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const first = hit.findIndex((n) => el.contains(n));
    let list = first >= 0 ? hit.slice(first) : null;
    if (list && skipSelf) list = list.filter((n) => !el.contains(n));
    if (list?.length) return list;
    const chain = [];
    for (let n = skipSelf ? el.parentElement : el; n; n = n.parentElement) chain.push(n);
    return chain;
  };
  const backdrop = (el, skipSelf = false) => {
    const layers = [];
    let gradient = false;
    for (const n of beneath(el, skipSelf)) {
      const s = getComputedStyle(n);
      const c = rgba(s.backgroundColor);
      if (s.backgroundImage !== "none") {
        // A decorative gradient on the page canvas is judged on its colour; anywhere else (or url()) it is image-backed.
        const canvasGradient = (n === document.body || n === document.documentElement) && !s.backgroundImage.includes("url(") && alphaOf(c) >= 1;
        if (!canvasGradient) return { image: true, layers };
        gradient = true;
      }
      const a = alphaOf(c);
      if (a > 0) {
        layers.push(c);
        if (a >= 1) break;
      }
    }
    return { image: false, layers, gradient };
  };
  const excluded = (el) => el.closest("[aria-hidden=true],[disabled],[aria-disabled=true],[inert],script,style,noscript") || window.__isDev?.(el);
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    const text = t.textContent?.replace(/\s+/g, " ").trim();
    if (!el || !text || !visible(el) || excluded(el)) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const bd = backdrop(el);
    out.push({
      what: text.slice(0, 40), fg: rgba(s.color), opacity: opacityOf(el), image: bd.image, layers: bd.layers, gradient: bd.gradient,
      kind: px >= 24 || (bold && px >= 18.66) ? "large" : "text",
    });
  }
  // WCAG 1.4.11: only what is needed to identify a control needs 3:1.
  //  - a control named by its own visible text (radio/button/tab/option...) needs no boundary; its selected state
  //    does, when it differs from the unselected items by fill alone
  //  - a text-entry field needs a boundary, which may come from a wrapping container of about its size
  //  - a checkbox/radio/switch indicator without text needs its own boundary
  const paint = (n) => {
    const s = getComputedStyle(n);
    const hasBorder = s.borderTopStyle !== "none" && parseFloat(s.borderTopWidth) > 0 && alphaOf(rgba(s.borderTopColor)) > 0;
    const fill = s.backgroundImage === "none" && alphaOf(rgba(s.backgroundColor)) > 0 ? rgba(s.backgroundColor) : null;
    const bd = backdrop(n, true);
    return { fg: hasBorder ? rgba(s.borderTopColor) : null, fill, image: bd.image, layers: bd.layers, gradient: bd.gradient };
  };
  const area = (n) => { const r = n.getBoundingClientRect(); return r.width * r.height; };
  const entrySel = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=file]),select,textarea,[contenteditable]:not([contenteditable=false])";
  const seen = new Set();
  for (const el of document.querySelectorAll(entrySel + ",input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]")) {
    if (!visible(el) || excluded(el) || el.matches(":disabled") || el.type === "hidden") continue;
    const tag = `<${el.tagName.toLowerCase()}>`;
    const isEntry = el.matches(entrySel);
    // Identified by its own content: a visible text label or an icon (svg/img) inside it.
    const labelled = !isEntry && !el.matches("[role=switch],[role=checkbox],input") && ((el.textContent ?? "").trim() !== "" || !!el.querySelector("svg,img"));
    if (labelled) {
      // Selected-state: exactly one selected item that differs from the others by fill alone.
      const group = el.closest("[role=radiogroup],[role=tablist],[role=group]");
      if (!group || seen.has(group)) continue;
      seen.add(group);
      const items = [...group.querySelectorAll("[role=" + (el.getAttribute("role") ?? "radio") + "]")].filter(visible);
      const on = (n) => n.getAttribute("aria-checked") === "true" || n.getAttribute("aria-selected") === "true";
      const selected = items.filter(on);
      const rest = items.filter((n) => !on(n));
      if (selected.length !== 1 || !rest.length) continue;
      const look = (n) => { const s = getComputedStyle(n); return [s.color, s.fontWeight, s.borderTopColor, s.borderTopWidth, s.textDecorationLine, s.fontStyle].join("|"); };
      if (look(selected[0]) !== look(rest[0])) continue;
      const sb = backdrop(selected[0], true), ub = backdrop(rest[0], true);
      out.push({
        what: `${tag} selected state`, kind: "ui", opacity: opacityOf(selected[0]), sel: sb.layers, layers: ub.layers,
        image: sb.image || ub.image, gradient: ub.gradient, fg: null, fill: null,
      });
      continue;
    }
    const alts = [paint(el)];
    if (isEntry) {
      let n = el.parentElement;
      for (let i = 0; i < 3 && n && n !== document.body; i++, n = n.parentElement) {
        if (area(n) <= area(el) * 1.5) alts.push(paint(n));
      }
    }
    out.push({ what: `${tag} boundary`, kind: "ui", opacity: opacityOf(el), alts, ...alts[0] });
  }
  return out;
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const fmt = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
});

/** Composite layers (top first) onto the page canvas; returns an opaque colour. */
export function compositeLayers(layers, canvas = WHITE) {
  let acc = canvas;
  for (const l of [...layers].reverse()) acc = over(parseColour(l), acc);
  return acc;
}

/** Judge raw samples. Pure, so it can be tested without a browser. */
export function judge(samples, level = "AA") {
  const bad = [];
  let images = 0, gradients = 0;
  for (const s of samples) {
    // Selected-state sample: the selected item's backdrop (with its pill) against an unselected item's.
    if (s.sel) {
      if (s.image) { images++; continue; }
      if (s.gradient) gradients++;
      const bg = compositeLayers(s.layers);
      const pill = compositeLayers(s.sel);
      const r = ratio({ ...pill, a: 1 }, bg);
      if (verdict(r, s.kind, level) === "BAD") bad.push({ ...s, r, solid: pill, bg });
      continue;
    }
    const parts = (s.alts ?? [s]).filter((p) => !p.image);
    if (!parts.length) { images++; continue; }
    if (parts.some((p) => p.gradient)) gradients++;
    // A control's boundary is its border OR its fill (or its wrapper's); with none, nothing separates it from the backdrop (ratio 1).
    let r = 1, solid = null, bgBest = null;
    for (const p of parts) {
      const bg = compositeLayers(p.layers);
      bgBest ??= bg;
      for (const css of [p.fg, p.fill]) {
        if (!css) continue;
        const c0 = parseColour(css);
        const c = { ...c0, a: c0.a * s.opacity };
        const rr = ratio(c, bg);
        if (!solid || rr > r) { r = rr; solid = over(c, bg); bgBest = bg; }
      }
    }
    if (verdict(r, s.kind, level) === "BAD") bad.push({ ...s, r, solid: solid ?? bgBest, bg: bgBest });
  }
  return { bad, images, gradients };
}

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  const level = String(config.contrastLevel ?? "AA").toUpperCase();
  return withPages(config, options, async (newPage, _browser, base) => {
    const findings = [];
    for (const route of routes) {
      const seen = new Set();
      const perRoute = [];
      let images = 0, gradients = 0;
      for (const theme of THEMES) {
        const page = await newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
        try {
          const res = await page.goto(base + route, { waitUntil: "load" });
          const problem = unreachableFinding(CHECK, route, res);
          if (problem) {
            if (!seen.has("unreachable")) {
              seen.add("unreachable");
              findings.push(problem);
            }
            continue;
          }
          await waitForReady(page);
          await setTheme(page, theme);
          // elementsFromPoint skips pointer-events:none, but a sliding "selected" pill is often exactly that and is still painted
          const open = await page.addStyleTag({ content: "*,*::before,*::after{pointer-events:auto!important}" });
          const j = judge(await page.evaluate(sampleInPage), level);
          await open.evaluate((n) => n.remove()).catch(() => {});
          images += j.images;
          gradients += j.gradients;
          for (const b of j.bad) {
            const key = `${theme}|${b.what}|${b.fg}|${fmt(b.bg)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            perRoute.push({ theme, b });
          }
        } finally {
          await page.close();
        }
      }
      const shown = perRoute.length > CAP ? CAP - 1 : perRoute.length;
      for (const { theme, b } of perRoute.slice(0, shown)) {
        const found = `${theme} "${b.what}" ${b.r.toFixed(2)}:1 (need ${needs(level)[b.kind]}, WCAG ${level}) fg=${fmt(b.solid)} bg=${fmt(b.bg)}`;
        findings.push({
          check: CHECK, rule: RULE[b.kind], file: route, line: 0, found, why: found,
          fix: "find the token on this element; run `run.mjs contrast --fg <token> --bg <surface>` and swap to a suggested token; ask the user only if none passes",
        });
      }
      if (perRoute.length > CAP) {
        const more = `+${perRoute.length - shown} more rendered-contrast failures on this route`;
        findings.push({ check: CHECK, rule: RULE.text, file: route, line: 0, found: more, why: more, fix: "fix the findings above, then re-run to see the rest" });
      }
      if (gradients) options.note?.(`NOTE contrast-rendered ${route}: ${gradients} samples judged against the base colour of a page-canvas gradient`);
      if (images) options.note?.(`NOTE contrast-rendered ${route}: ${images} samples over images → review in screenshots (run.mjs shots ${route})`);
    }
    return findings;
  });
}
