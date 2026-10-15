// Movement, measured: continuity: no frame is a cut.
//
// For every row of `motionPhases` (viewsonic-ui.config.json) that names a `specimen` route, the check
// drives the component and samples what the user would see, frame by frame:
//   - it triggers the change, catches the animations that start on `target`, PAUSES them, and seeks
//     them from 0 to their end in 30 steps, reading opacity, scale and translate at each step;
//   - for leaving it clicks `dismiss` and watches in real time when the element goes away;
//   - for interruption it clicks `dismiss` a quarter of the way through arriving and compares the
//     frame before with the frame after;
//   - a second run with prefers-reduced-motion checks that arriving and leaving are still a crossfade.
//
// Row fields used: specimen, trigger (clicked to start `in`; omit if it animates on mount), dismiss
// (clicked to start `out`), target (the animated element), in / idle / out (N/A rows are skipped), and
// the optional `swap: { trigger }` (clicked to swap content inside the target; without it content-cut
// is not measured). A mode that cannot be measured for a row is listed in a NOTE, never counted GOOD.
import { unreachableFinding, waitForReady, withPages } from "./lib.mjs";

export const CHECK = "motion";
export const RULE_IDS = [
  "pops-in", "jumps", "phase-break", "vanishes", "not-interruptible", "late-start",
  "stop-start", "content-cut", "neighbours-snap", "reduced-motion", "selector-not-found", "route-unreachable",
];

/** One step may change at most this much; a bigger change in one step is a cut. */
export const TOL = { opacity: 0.25, scale: 0.15, translate: 24 };
export const LATE_MS = 34; // two frames between the input and the first frame of motion
export const STEPS = 30;
const INTERRUPT_AT = 0.25; // fraction of arriving at which dismiss is clicked

// ───────────────────────────── pure judging (unit tested) ─────────────────────────────

const PROPS = [
  ["opacity", "opacity", TOL.opacity],
  ["sx", "scale", TOL.scale],
  ["sy", "scale", TOL.scale],
  ["tx", "translate", TOL.translate],
  ["ty", "translate", TOL.translate],
];
const fmt = (n) => (Math.round(n * 100) / 100).toString();

/** The arriving state starts already at rest: fully opaque, unscaled, unmoved, and already its final size. */
export function popsIn(series) {
  const s = series[0], e = series.at(-1);
  return !!s && s.opacity >= 0.99 && Math.abs(s.sx - 1) < 0.01 && Math.abs(s.sy - 1) < 0.01 && Math.abs(s.tx) < 1 && Math.abs(s.ty) < 1
    && Math.abs(s.w - e.w) < 1 && Math.abs(s.h - e.h) < 1;
}

/** The first step-to-step change over tolerance, or null. */
export function jump(series) {
  for (let i = 1; i < series.length; i++) {
    for (const [k, label, tol] of PROPS) {
      const d = Math.abs(series[i][k] - series[i - 1][k]);
      if (d > tol) return { prop: k, label, from: series[i - 1][k], to: series[i][k], step: i };
    }
  }
  return null;
}

/** First property where two snapshots differ by more than one step's tolerance, or null. */
export function handoff(a, b) {
  if (!a || !b) return null;
  for (const [k, , tol] of PROPS) if (Math.abs(a[k] - b[k]) > tol) return { prop: k, a: a[k], b: b[k] };
  return null;
}

/** Speed of the last (or first) step, in tolerances per 100ms, over the worst property. */
export function speed(series, ms, where) {
  if (!series || series.length < 2 || !(ms > 0)) return 0;
  const [p, q] = where === "end" ? [series.at(-2), series.at(-1)] : [series[0], series[1]];
  return Math.max(...PROPS.map(([k, , tol]) => (Math.abs(q[k] - p[k]) / tol) * (100 / ms)));
}

/** Arriving ends at a stop and the next motion starts fast. */
export function stopStart(inSeries, inStepMs, idle) {
  if (!idle?.series) return null;
  const end = speed(inSeries, inStepMs, "end");
  const start = speed(idle.series, idle.step, "start");
  return end < 0.15 && start > 0.15 && start > 3 * end ? { end, start } : null;
}

/** Neighbours: a sibling moved in one step by more than half of its whole travel, and more than the translate tolerance. */
export function neighbourSnap({ nbBefore, series, tail, sizeBefore }) {
  const seq = [nbBefore, ...series.map((s) => s.nb), tail].filter(Boolean);
  if (seq.length < 2) return null;
  const sizes = series.map((s) => [s.w, s.h]);
  const resized = sizeBefore
    ? sizes.some(([w, h]) => Math.abs(w - sizeBefore.w) > 1 || Math.abs(h - sizeBefore.h) > 1)
    : sizes.some(([w, h]) => w > 0 || h > 0);
  if (!resized) return null;
  const n = Math.min(...seq.map((x) => x.length));
  for (let j = 0; j < n; j++) {
    for (const axis of ["top", "left"]) {
      const vals = seq.map((x) => x[j][axis]);
      const range = Math.max(...vals) - Math.min(...vals);
      for (let i = 1; i < vals.length; i++) {
        const d = Math.abs(vals[i] - vals[i - 1]);
        if (d > TOL.translate && d > range / 2) return { axis, d, step: i - 1 };
      }
    }
  }
  return null;
}

/** Content swapped: no blank frame, and some motion. `swap` is { changed, noMotion, series:[{old,new}] }. */
export function contentCut(swap) {
  if (!swap || !swap.changed) return null;
  if (swap.noMotion) return { why: "the content was replaced in a single frame, with no animation" };
  const i = swap.series.findIndex((s) => s.old < 0.001 && s.new < 0.001);
  if (i >= 0) return { why: `at step ${i} of ${swap.series.length - 1} neither the old nor the new content is visible` };
  return null;
}

/** Reduced motion: arriving/leaving must still be an opacity crossfade, with no scale or travel. */
export function reducedMotion(res, what) {
  if (!res || !res.taken) return `${what} has no animation at all under reduced motion; keep an opacity crossfade`;
  if (res.end < 50) return `${what} lasts ${fmt(res.end)}ms under reduced motion, which is not a crossfade`;
  const op = res.series.map((s) => s.opacity);
  if (Math.max(...op) - Math.min(...op) < 0.5) return `${what} does not change opacity under reduced motion; keep an opacity crossfade`;
  if (res.series.some((s) => Math.abs(s.sx - 1) > 0.01 || Math.abs(s.sy - 1) > 0.01 || Math.abs(s.tx) > 0.5 || Math.abs(s.ty) > 0.5)) {
    return `${what} still scales or moves under reduced motion; drop the transform, keep the opacity`;
  }
  return null;
}

// ───────────────────────────── the page side ─────────────────────────────
// Serialised into the page: it must not reference anything outside itself.

function pageSetup() {
  const mo = (window.__mo = { out: {}, inputAt: 0 });
  addEventListener("click", (e) => { mo.inputAt = e.timeStamp; }, true);

  const readStyle = (el) => {
    const cs = getComputedStyle(el);
    let sx = 1, sy = 1, tx = 0, ty = 0;
    if (cs.transform && cs.transform !== "none") {
      const m = new DOMMatrix(cs.transform);
      sx = Math.hypot(m.m11, m.m12); sy = Math.hypot(m.m21, m.m22); tx = m.m41; ty = m.m42;
    }
    if (cs.scale && cs.scale !== "none") { const p = cs.scale.split(/\s+/).map(parseFloat); sx *= p[0]; sy *= p[1] ?? p[0]; }
    if (cs.translate && cs.translate !== "none") { const p = cs.translate.split(/\s+/).map(parseFloat); tx += p[0] || 0; ty += p[1] || 0; }
    return { opacity: parseFloat(cs.opacity), sx, sy, tx, ty, w: el.offsetWidth, h: el.offsetHeight };
  };
  const pos = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left }; };
  const finite = (a) => a.effect.getComputedTiming().iterations !== Infinity;
  const timingOf = (a) => a.effect.getComputedTiming();
  const isGone = (e) => {
    if (!e || !e.isConnected) return true;
    const cs = getComputedStyle(e);
    return cs.display === "none" || cs.visibility === "hidden";
  };
  const leaves = (el) => [el, ...el.querySelectorAll("*")].filter((e) => (!e.firstElementChild && (e.textContent || "").trim()) || /^(IMG|SVG|CANVAS|VIDEO)$/i.test(e.tagName));
  const effOpacity = (e, root) => {
    let o = 1;
    for (let n = e; n; n = n.parentElement) {
      if (!n.isConnected) return 0;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= parseFloat(cs.opacity);
      if (n === root) break;
    }
    return o;
  };

  mo.arm = (name, sel, opts = {}) => {
    const el0 = document.querySelector(sel);
    const sub = !!opts.subtree;
    const before = new Set(el0 ? el0.getAnimations({ subtree: sub }) : []);
    const rects = new WeakMap();
    let n = 0;
    const root = document.body || document.documentElement;
    for (const e of root ? root.querySelectorAll("*") : []) { if (n++ > 4000) break; rects.set(e, pos(e)); }
    const A = opts.swap && el0 ? leaves(el0).map((e) => ({ e, text: e.textContent })) : [];
    const st = (mo.out[name] = {
      name, armedAt: performance.now(), taken: false, final: false, goneAt: null,
      hadEl: !!el0, elRef: el0, beforeSnap: el0 ? readStyle(el0) : null,
    });
    const nbOf = (t) => [t.previousElementSibling, t.nextElementSibling].filter((e) => e && rects.has(e));

    const take = (tgt, fresh) => {
      st.taken = true; st.detectedAt = performance.now(); st.inputAt = mo.inputAt;
      const T = fresh.map((a) => ({ a, t: timingOf(a) }));
      const fin = T.filter((x) => x.t.iterations !== Infinity);
      const inf = T.filter((x) => x.t.iterations === Infinity);
      st.end = Math.max(0, ...fin.map((x) => x.t.endTime));
      st.delay = T.length ? Math.min(...T.map((x) => x.t.delay)) : 0;
      st.kinds = [...new Set(fresh.map((a) => a.animationName || a.transitionProperty || "animation"))];
      fresh.forEach((a) => a.pause());
      const nbs = nbOf(tgt);
      st.nbBefore = nbs.map((e) => rects.get(e));
      // Sample the active part of the animation: from the earliest delay to the end. When there is a delay,
      // one extra sample at 0 shows what the user sees while waiting (a pop shows up there).
      const start = Math.max(0, Math.min(st.end, ...fin.map((x) => x.t.delay)));
      st.step = (st.end - start) / 30;
      const times = start > 0.5 ? [0] : [];
      for (let i = 0; i <= 30; i++) times.push(i === 30 ? Math.max(0, st.end - 0.01) : start + ((st.end - start) * i) / 30);
      st.series = [];
      for (const t of times) {
        fin.forEach((x) => { x.a.currentTime = t; });
        inf.forEach((x) => { x.a.currentTime = 0; });
        st.series.push({ t, ...readStyle(tgt), nb: nbs.filter((e) => e.isConnected).map(pos) });
      }
      if (opts.resume) {
        const now = performance.now() - st.detectedAt;
        fresh.forEach((a) => { try { a.currentTime = now; a.play(); } catch { /* gone */ } });
      } else {
        fin.forEach((x) => { try { x.a.finish(); } catch { /* ignore */ } });
        st.rest = readStyle(tgt);
        st.nbTail = nbs.filter((e) => e.isConnected).map(pos);
      }
      st.nbs = nbs;
    };

    const takeSwap = (tgt, fresh) => {
      st.taken = true; st.changed = true;
      const B = leaves(tgt);
      const oldNodes = A.map((x) => x.e);
      const newNodes = B.filter((e) => !oldNodes.includes(e));
      const shared = B.filter((e) => oldNodes.includes(e));
      const T = fresh.map((a) => ({ a, t: timingOf(a) }));
      const fin = T.filter((x) => x.t.iterations !== Infinity);
      st.noMotion = fresh.length === 0;
      st.end = Math.max(0, ...fin.map((x) => x.t.endTime));
      fresh.forEach((a) => a.pause());
      const sample = () => {
        const o = oldNodes.length ? Math.max(...oldNodes.map((e) => effOpacity(e, tgt))) : 0;
        const nw = newNodes.length ? Math.max(...newNodes.map((e) => effOpacity(e, tgt))) : (shared.length ? Math.max(...shared.map((e) => effOpacity(e, tgt))) : 0);
        return { old: o, new: nw };
      };
      st.series = [];
      for (let i = 0; i <= 30; i++) {
        const t = i === 30 ? Math.max(0, st.end - 0.01) : (st.end * i) / 30;
        fin.forEach((x) => { x.a.currentTime = t; });
        st.series.push(sample());
      }
    };

    const swapChanged = (tgt) => {
      const B = leaves(tgt);
      return B.length !== A.length || B.some((e, i) => e !== A[i].e || e.textContent !== A[i].text);
    };

    let obs;
    const check = () => {
      if (st.final) return;
      const tgt = st.elRef && st.elRef.isConnected ? st.elRef : document.querySelector(sel);
      if (st.hadEl && st.goneAt == null && isGone(st.elRef)) {
        st.goneAt = performance.now();
        if (st.nbs) st.nbAfter = st.nbs.filter((e) => e.isConnected).map(pos);
      }
      if (!st.taken && tgt) {
        if (opts.swap) {
          if (swapChanged(tgt)) takeSwap(tgt, tgt.getAnimations({ subtree: true }).filter((a) => !before.has(a)));
        } else {
          const fresh = tgt.getAnimations({ subtree: sub }).filter((a) => !before.has(a));
          if (fresh.length) take(tgt, fresh);
        }
      }
      if (st.taken && (!opts.watch || st.goneAt != null)) st.final = true;
      if (st.final) obs?.disconnect();
    };
    obs = new MutationObserver(check);
    obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => { check(); if (!st.final) requestAnimationFrame(tick); };
    tick();
  };

  /** Resolve when the armed capture is final, or after `ms`. */
  mo.settle = (name, ms, sel) => new Promise((done) => {
    const st = mo.out[name];
    st.sel = sel;
    const t0 = performance.now();
    const poll = () => {
      if (st.final || performance.now() - t0 > ms) {
        const target = sel ? document.querySelector(sel) : null;
        st.final = true;
        const { elRef, nbs: _nbs, ...plain } = st; void _nbs;
        plain.targetFound = !!(elRef || target);
        plain.timedOut = !st.taken;
        plain.inputAt = st.inputAt ?? mo.inputAt;
        done(plain);
        return;
      }
      setTimeout(poll, 16);
    };
    poll();
  });

  /** Wait until the target has no running finite animation. */
  mo.settled = async (sel, ms) => {
    const t0 = performance.now();
    let seen = false;
    while (performance.now() - t0 < ms) {
      const el = document.querySelector(sel);
      if (el) {
        seen = true;
        if (!el.getAnimations().some((a) => finite(a) && a.playState === "running")) break;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return seen || !!document.querySelector(sel);
  };

  /** Sample the looping animation on `sel` over its first iteration (at most 600ms). */
  mo.idle = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const as = el.getAnimations().filter((a) => !finite(a));
    if (!as.length) return { none: true };
    as.forEach((a) => a.pause());
    const T = as.map(timingOf);
    const delay = Math.min(...T.map((t) => t.delay));
    const span = Math.min(600, ...T.map((t) => t.duration));
    const series = [];
    for (let i = 0; i <= 30; i++) {
      as.forEach((a) => { a.currentTime = delay + (span * i) / 30; });
      series.push(readStyle(el));
    }
    return { series, step: span / 30 };
  };

  /** Click dismiss when arriving is `frac` of the way; return the frame before and the frame after. */
  mo.interrupt = async (sel, dismissSel, frac) => {
    const deadline = performance.now() + 2500;
    let el = null;
    while (performance.now() < deadline) {
      el = document.querySelector(sel);
      const as = el ? el.getAnimations().filter((a) => finite(a) && a.playState === "running") : [];
      if (as.length) {
        const end = Math.max(...as.map((a) => timingOf(a).endTime));
        const cur = Math.max(...as.map((a) => a.currentTime));
        if (cur >= frac * end) break;
      }
      el = null;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!el) return { none: true };
    const before = readStyle(el);
    const d = document.querySelector(dismissSel);
    if (!d) return { noDismiss: true };
    const known = new Set(el.getAnimations());
    d.click();
    // The framework flushes its state change after the click handler returns (a microtask, often a frame
    // later), so wait for it before reading. Then read the NEW animations at their first frame: a reversal
    // starts from the current value, a restart starts from the keyframe's first frame.
    await Promise.resolve();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el2 = el.isConnected ? el : document.querySelector(sel);
    if (!el2) return { before, gone: true };
    const fresh = el2.getAnimations().filter((a) => !known.has(a));
    if (!fresh.length) {
      const now = readStyle(el2);
      const same = ["opacity", "sx", "sy", "tx", "ty"].every((k) => Math.abs(now[k] - before[k]) < 0.001);
      return same ? { unobserved: true } : { before, after: now };
    }
    fresh.forEach((a) => { a.pause(); a.currentTime = 0; });
    return { before, after: readStyle(el2) };
  };
}

// ───────────────────────────── the Node side ─────────────────────────────

const isNA = (v) => typeof v !== "string" || /^N\/A\b/.test(v);

const FIX = {
  "pops-in": "start the arriving state at opacity 0 (and the scale or offset the keyframe uses) and animate it to rest: use the in utility, or mount it in its start state and flip to the open state a frame later",
  jumps: "spread the change over the whole duration: no step may change opacity by more than 0.25, scale by 0.15 or move more than 24px; check the keyframes and the easing",
  "phase-break": "align the endpoints: each state must start exactly where the last one ends (same opacity, scale, offset)",
  vanishes: "keep the element mounted until its exit has finished (usePresence, see system/motion.md), then unmount it",
  "not-interruptible": "animate with a transition on the same properties so reversing continues from the current value, instead of two keyframe animations that each restart",
  "late-start": "start the motion on the action frame: no timeout, await or animation delay between the input and the state change",
  "stop-start": "carry the velocity across the handoff: end arriving at the speed the next motion starts, or start the next one from rest on a matching curve",
  "content-cut": "crossfade or morph in place: keep the old content mounted until the new content is fully in",
  "neighbours-snap": "animate the size on a duration token so the neighbours travel with it, instead of changing it in one frame",
  "reduced-motion": "under prefers-reduced-motion keep an opacity crossfade of a normal duration and drop transform, scale and travel",
  "selector-not-found": "fix the selector in motionPhases, or the specimen route; nothing was measured for this row",
};

export async function run(config, options = {}) {
  let rows = config.motionPhases ?? [];
  if (options.component) rows = rows.filter((r) => String(r.component).includes(options.component));
  const sampled = rows.filter((r) => r.specimen && r.target);
  if (!sampled.length) {
    return { skipped: `no motionPhases row has a specimen route and a target in viewsonic-ui.config.json (${rows.length} row(s)); add specimen, trigger, dismiss and target to the rows you want sampled` };
  }
  const unsampled = rows.length - sampled.length;
  if (unsampled > 0) options.note?.(`NOTE motion: ${unsampled} components have no specimen route - not sampled`);

  return withPages(config, options, async (newPage, _browser, base) => {
    const findings = [];
    const notMeasured = new Map(); // mode -> [{ component, reason }]
    for (const row of sampled) {
      const out = await measureRow(newPage, base, row);
      findings.push(...out.findings);
      for (const [mode, reason] of out.notMeasured) {
        if (!notMeasured.has(mode)) notMeasured.set(mode, []);
        notMeasured.get(mode).push({ component: row.component, reason });
      }
    }
    for (const [mode, list] of notMeasured) {
      const reasons = [...new Set(list.map((x) => x.reason))].slice(0, 3).join("; ");
      const who = list.slice(0, 3).map((x) => x.component.split("/").slice(-2).join("/")).join(", ");
      options.note?.(`NOTE motion: ${mode} not measured for ${list.length} of ${sampled.length} sampled rows (${reasons}): ${who}${list.length > 3 ? ", …" : ""}`);
    }
    return findings;
  });
}

async function measureRow(newPage, base, row) {
  const findings = [];
  const notMeasured = [];
  const add = (rule, found) => findings.push({
    check: CHECK, rule, file: row.component, line: 0,
    found: `${row.specimen}: ${found}`, why: `${row.specimen}: ${found}`, fix: FIX[rule],
  });
  const skip = (mode, reason) => notMeasured.push([mode, reason]);
  const inNA = isNA(row.in), idleNA = isNA(row.idle), outNA = isNA(row.out);

  /** Open the specimen, optionally armed at document start. Returns { page } or { problem }. */
  async function open(pageOptions, armOnLoad) {
    const page = await newPage({ viewport: { width: 1440, height: 900 }, ...pageOptions });
    try {
      await page.addInitScript(pageSetup);
      if (armOnLoad) await page.addInitScript((a) => window.__mo.arm(a.name, a.sel, a.opts), armOnLoad);
      const res = await page.goto(base + row.specimen, { waitUntil: "load" });
      const problem = unreachableFinding(CHECK, row.specimen, res);
      if (problem) { await page.close(); return { problem: { ...problem, file: row.component } }; }
      await waitForReady(page, { idleMs: 2500 });
      await page.waitForTimeout(350); // settle after hydration
      return { page };
    } catch (e) {
      await page.close().catch(() => {});
      throw e;
    }
  }
  const click = async (page, sel, what) => {
    try { await page.click(sel, { timeout: 4000 }); return true; }
    catch { add("selector-not-found", `${what} "${sel}" could not be clicked`); return false; }
  };
  const arm = (page, name, opts) => page.evaluate((a) => window.__mo.arm(a.name, a.sel, a.opts), { name, sel: row.target, opts });
  const settle = (page, name, ms) => page.evaluate((a) => window.__mo.settle(a.name, a.ms, a.sel), { name, ms, sel: row.target });
  const reach = async (page) => {
    if (row.trigger && !(await click(page, row.trigger, "trigger"))) return false;
    const seen = await page.evaluate((a) => window.__mo.settled(a.sel, 3500), { sel: row.target });
    if (!seen) { add("selector-not-found", `target "${row.target}" is not on the page${row.trigger ? " after the trigger" : ""}`); return false; }
    return true;
  };

  /** Pass: arrive. */
  async function passIn(reduced) {
    const opened = await open({ reducedMotion: reduced ? "reduce" : "no-preference" }, row.trigger ? null : { name: "in", sel: row.target, opts: {} });
    if (opened.problem) { findings.push(opened.problem); return null; }
    const { page } = opened;
    try {
      if (row.trigger) {
        await arm(page, "in", {});
        if (!(await click(page, row.trigger, "trigger"))) return null;
      }
      const res = await settle(page, "in", 1800);
      if (!res.taken && !res.targetFound) { add("selector-not-found", `target "${row.target}" never appeared${row.trigger ? " after the trigger" : ""}`); return null; }
      return res;
    } finally { await page.close(); }
  }

  // ── arriving
  let inRes = null;
  if (!inNA) {
    inRes = await passIn(false);
    if (inRes) {
      if (!inRes.taken) {
        add("pops-in", `"${row.target}" appeared with no animation running on it`);
      } else {
        if (popsIn(inRes.series)) add("pops-in", `the first frame of "${row.target}" is already fully visible (opacity ${fmt(inRes.series[0].opacity)}, scale ${fmt(inRes.series[0].sx)})`);
        const j = jump(inRes.series);
        if (j) add("jumps", `arriving changes ${j.label} from ${fmt(j.from)} to ${fmt(j.to)} in one step (${fmt(inRes.step)}ms steps over ${fmt(inRes.end)}ms)`);
        const b = handoff(inRes.series.at(-1), inRes.rest);
        if (b) add("phase-break", `arriving ends at ${b.prop} ${fmt(b.a)} but the resting state is ${fmt(b.b)}`);
        const n = neighbourSnap({ nbBefore: inRes.nbBefore, series: inRes.series, tail: inRes.nbTail, sizeBefore: inRes.beforeSnap });
        if (n) add("neighbours-snap", `the size of "${row.target}" changes and a neighbour moves ${fmt(n.d)}px (${n.axis}) in one step`);
        if (row.trigger) {
          const lateOf = (r) => (r.inputAt >= r.armedAt ? r.detectedAt - r.inputAt + Math.max(0, r.delay) : 0);
          let late = lateOf(inRes);
          if (late > LATE_MS) {
            // A slow first frame is not a late start: look again and keep the better of the two.
            const again = await passIn(false);
            if (again?.taken) late = Math.min(late, lateOf(again));
          }
          if (late > LATE_MS) add("late-start", `arriving starts ${Math.round(late)}ms after the click (limit ${LATE_MS}ms)`);
        } else skip("late-start", "animates on mount, there is no input event");
      }
    }
  }

  // ── holding: handoff into the idle motion
  if (!inNA && !idleNA && inRes?.taken) {
    const opened = await open({}, null);
    if (opened.problem) findings.push(opened.problem);
    else {
      const { page } = opened;
      try {
        if (await reach(page)) {
          const idle = await page.evaluate((s) => window.__mo.idle(s), row.target);
          if (idle.series) {
            const b = handoff(inRes.series.at(-1), idle.series[0]);
            if (b) add("phase-break", `arriving ends at ${b.prop} ${fmt(b.a)} but the idle motion starts at ${fmt(b.b)}`);
            const s = stopStart(inRes.series, inRes.step, idle);
            if (s) add("stop-start", `arriving comes to a stop (speed ${fmt(s.end)}) and the idle motion starts fast (${fmt(s.start)}) per 100ms`);
          } else skip("stop-start", "no looping animation was found on the target once it settled");
        }
      } finally { await page.close(); }
    }
  } else if (!idleNA && !inNA) skip("stop-start", "arriving was not sampled");

  // ── leaving
  if (!outNA) {
    if (!row.dismiss) {
      for (const m of ["vanishes", "not-interruptible"]) skip(m, "the row has no dismiss selector");
    } else {
      const opened = await open({}, null);
      if (opened.problem) findings.push(opened.problem);
      else {
        const { page } = opened;
        try {
          if (await reach(page)) {
            await arm(page, "out", { watch: true, resume: true });
            if (await click(page, row.dismiss, "dismiss")) {
              const res = await settle(page, "out", 2200);
              const gone = res.goneAt != null ? res.goneAt - res.inputAt : null;
              if (gone == null) skip("vanishes", "the target was still on the page 2s after dismiss");
              else if (!res.taken || res.end === 0) add("vanishes", `"${row.target}" was removed ${Math.max(0, Math.round(gone))}ms after dismiss with no leaving animation running`);
              else if (gone < res.end * 0.8) add("vanishes", `"${row.target}" was removed ${Math.round(gone)}ms after dismiss, in the middle of a ${Math.round(res.end)}ms exit`);
              if (res.taken) {
                const j = jump(res.series);
                if (j) add("jumps", `leaving changes ${j.label} from ${fmt(j.from)} to ${fmt(j.to)} in one step`);
                const b = handoff(res.beforeSnap, res.series[0]);
                if (b) add("phase-break", `the hold ends at ${b.prop} ${fmt(b.a)} but leaving starts at ${fmt(b.b)}`);
                const n = neighbourSnap({ nbBefore: res.nbBefore, series: res.series, tail: res.nbAfter, sizeBefore: res.beforeSnap });
                if (n) add("neighbours-snap", `the size of "${row.target}" changes and a neighbour moves ${fmt(n.d)}px (${n.axis}) in one step`);
                const late = res.detectedAt - res.inputAt + Math.max(0, res.delay);
                if (late > LATE_MS) add("late-start", `leaving starts ${Math.round(late)}ms after the click (limit ${LATE_MS}ms)`);
              }
            }
          }
        } finally { await page.close(); }
      }
      // interruption
      if (!inNA && row.trigger) {
        const o = await open({}, null);
        if (o.problem) findings.push(o.problem);
        else {
          const { page } = o;
          try {
            if (await click(page, row.trigger, "trigger")) {
              const r = await page.evaluate((a) => window.__mo.interrupt(a.sel, a.dismiss, a.frac), { sel: row.target, dismiss: row.dismiss, frac: INTERRUPT_AT });
              if (r.none) skip("not-interruptible", "no arriving animation was running to interrupt");
              else if (r.unobserved) skip("not-interruptible", "dismiss changed nothing the check could observe");
              else if (r.gone) add("not-interruptible", `reversing a quarter of the way in removed "${row.target}" at once`);
              else if (r.before && r.after) {
                const h = handoff(r.before, r.after);
                if (h) add("not-interruptible", `reversing a quarter of the way in jumps ${h.prop} from ${fmt(h.a)} to ${fmt(h.b)}; it restarted instead of continuing`);
              }
            }
          } finally { await page.close(); }
        }
      } else if (!inNA) skip("not-interruptible", "animates on mount, there is no trigger to reverse");
    }
  }

  // ── content swap
  if (row.swap?.trigger) {
    const opened = await open({}, null);
    if (opened.problem) findings.push(opened.problem);
    else {
      const { page } = opened;
      try {
        if (await reach(page)) {
          await arm(page, "swap", { subtree: true, swap: true });
          if (await click(page, row.swap.trigger, "swap trigger")) {
            const res = await settle(page, "swap", 1500);
            if (!res.changed) skip("content-cut", "the swap trigger changed no content inside the target");
            else {
              const c = contentCut(res);
              if (c) add("content-cut", c.why);
            }
          }
        }
      } finally { await page.close(); }
    }
  } else skip("content-cut", "the row has no swap.trigger");

  // ── reduced motion
  for (const [phase, isNa, fn] of [["arriving", inNA, async () => passIn(true)], ["leaving", outNA || !row.dismiss, null]]) {
    if (isNa) continue;
    let res;
    if (fn) res = await fn();
    else {
      const o = await open({ reducedMotion: "reduce" }, null);
      if (o.problem) continue;
      const { page } = o;
      try {
        if (await reach(page)) {
          await arm(page, "out", { watch: true, resume: true });
          if (await click(page, row.dismiss, "dismiss")) res = await settle(page, "out", 2200);
        }
      } finally { await page.close(); }
    }
    if (!res) continue;
    const msg = reducedMotion(res, phase);
    if (msg) add("reduced-motion", msg);
  }

  // one finding per rule and message
  const seen = new Set();
  return { findings: findings.filter((f) => !seen.has(f.rule + f.found) && seen.add(f.rule + f.found)), notMeasured };
}
