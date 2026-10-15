// UX flow, on the running app: does every action answer, can every overlay be left, does a failed submit keep what the user typed.
// rules/ux.md rules 2, 3, 5 and 20. Desktop, light theme; the theme does not change any of these.
//
//   no-feedback    a click changes nothing visible, or its work is still pending after 1s with no progress indicator
//   slow-response  the first visible change comes later than 400ms after the click
//   no-escape      an overlay does not close on Escape, or a dialog has no visible close / cancel control
//   lost-input     a mocked failing submit empties, resets or removes a field the user filled
//
// What is guaranteed, for the WHOLE run (loading, filling, opening overlays, clicking, submitting):
//   - Every request that is not GET, HEAD or OPTIONS is answered by the check (200 {} , held 1500ms while a button is
//     tried, 500 in the form test) and never reaches the app. Any origin.
//   - After a route has loaded, a GET whose URL looks like an API or action endpoint (/api, /trpc, /graphql, /rpc,
//     /action(s), or ?delete=, ?logout= and the like) is answered with 200 {} too.
//   - sendBeacon, WebSocket and EventSource are stubbed in the page and "ping" requests are aborted.
//   - Service workers are blocked, so no request bypasses the above.
//   - A navigation away from the route under test (location change, link, window.open popup) is aborted, and counts as
//     the page's visible change. Popups are closed at once.
//   - A base that is not local (localhost, 127.0.0.1, [::1], *.localhost, *.test) is refused unless --allow-remote.
// Not guaranteed: a plain GET that mutates and does not look like an endpoint; requests made by iframes; cookies the
// session already has. Run against a dev or test instance, never one holding data that matters.
// Buttons labelled Delete, Remove, Discard, Reset, Revoke, Sign out or Log out, and type=reset, are never clicked.
// At most 15 buttons per route are clicked.
import { routesFor, unreachableFinding, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";
import { install, openTrigger, pickTriggers } from "./keyboard.mjs";

export const CHECK = "ux-flow";
export const RULE_IDS = ["no-feedback", "slow-response", "no-escape", "lost-input", "route-unreachable"];
export const FEEDBACK_MS = 400;
export const PROGRESS_MS = 1000;
export const DELAY_MS = 1500;
export const MAX_CLICKS = 15;
export const MAX_FORMS = 5;
const WINDOW_MS = DELAY_MS + 600; // long enough to see the change that comes with the held response
const CAP = 15;

const FIX = {
  "no-feedback": "answer at once: mark the trigger busy (aria-busy, disabled), show a spinner or progress while it works, then say what happened; anything pending over 1s needs a progress indicator; a button that changes nothing is a stub: complete the flow (options, current state, consequence, confirm, feedback) or remove it",
  "slow-response": "change something visible within 400ms of the click, before the work finishes: an optimistic update, a pressed or busy state, a skeleton or a spinner",
  "no-escape": "use the system's Dialog, Sheet or Popover (Escape closes, focus returns to the trigger) and give a dialog a visible Close or Cancel control",
  "lost-input": "keep the field values when a submit fails: never reset or unmount the form on error; show the error beside the form and let the user retry",
};

/* ───────────────────────── in-page helpers (serialised: no closures) ───────────────────────── */

function installUx() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const labelOf = (el) => (el.getAttribute("aria-label") || el.innerText || el.textContent || el.value || el.title || "").replace(/\s+/g, " ").trim();
  const SKIP = /^\s*(?:delete|remove|discard|reset|revoke|sign[ -]?out|log[ -]?out|logout)\b/i;
  /** Buttons that are safe and meaningful to click, in document order. */
  const buttons = () =>
    [...document.querySelectorAll("button,[role=button]")].filter((el) => {
      if (!visible(el) || el.matches(":disabled,[aria-disabled=true]") || el.closest("[aria-hidden=true],[inert]") || window.__isDev?.(el)) return false;
      if (el.type === "reset" || (el.form && el.type === "submit")) return false; // forms are tried as forms
      // the option that is already chosen: clicking it changes nothing, rightly
      if (el.matches('[aria-selected="true"],[aria-current]:not([aria-current="false"]),[role=radio][aria-checked="true"],[role=tab][data-state=active],[role=radio][data-state=on],[data-active="true"]')) return false;
      if (SKIP.test(labelOf(el)) || el.getAttribute("data-variant") === "destructive") return false;
      return true;
    });
  const INDICATOR = '[role=progressbar],[aria-busy="true"],[data-slot=spinner],[data-slot=skeleton],[data-slot=progress],[class*="spinner" i],[class*="skeleton" i],[class*="animate-spin"],[class*="anim-spin"],[class*="anim-shimmer"],[class*="anim-progress"]';
  /** Visible things that say "working": progress roles, busy flags, skeletons, spinners, and any infinitely running animation. */
  const indicators = () => {
    const found = new Set([...document.querySelectorAll(INDICATOR)].filter(visible));
    for (const a of document.getAnimations()) {
      const t = a.effect?.target;
      if (t && a.playState === "running" && a.effect.getComputedTiming().iterations === Infinity && visible(t)) found.add(t);
    }
    return [...found];
  };
  window.__uxh = { visible, labelOf, buttons, indicators };
}

/** Choose button `idx`, scroll to it, arm the recorder. Returns where to click, or why not. */
function arm(idx) {
  const h = window.__uxh;
  const el = h.buttons()[idx];
  if (!el) return { skip: "gone" };
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  if (!top || !(el.contains(top) || top.contains(el))) return { skip: "covered" };
  const label = h.labelOf(el).slice(0, 40);
  window.__uxBtn = el;
  window.__uxLabel = h.labelOf(el);
  window.__uxBase = new WeakSet(h.indicators());
  window.__ux = { t0: null, first: null, kind: null };
  const mark = (kind) => {
    const u = window.__ux;
    if (u.t0 !== null && u.first === null) { u.first = performance.now() - u.t0; u.kind = kind; }
  };
  // Radix-style controls open on pointerdown, before the click: the clock starts at the first event of the pointer sequence,
  // and the observer below is already running, so a change anywhere in pointerdown, pointerup or click counts.
  const start = () => { if (window.__ux.t0 === null) window.__ux.t0 = performance.now(); };
  for (const type of ["pointerdown", "mousedown", "click"]) window.addEventListener(type, start, { capture: true, once: true });
  new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && window.__isDev?.(t)) continue;
      if (m.type === "attributes" && /^data-(?:focus|hover|highlighted)/.test(m.attributeName ?? "")) continue;
      mark("dom");
      return;
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  return { x, y, label, tag: `<${el.tagName.toLowerCase()}>${label ? ` "${label}"` : ""}` };
}

/** Is there something that says "working" now: a new indicator, or the busy words in the button or a live region? */
function progressNow() {
  const h = window.__uxh;
  const WORDS = /(?:…|\.\.\.|\b\w+ing\b|please wait)/i;
  if (h.indicators().some((el) => !window.__uxBase.has(el))) return true;
  const btn = window.__uxBtn;
  if (btn?.isConnected) {
    if (btn.getAttribute("aria-busy") === "true") return true;
    const now = h.labelOf(btn);
    if (now !== window.__uxLabel && WORDS.test(now)) return true;
  }
  for (const live of document.querySelectorAll("[role=status],[aria-live=polite],[aria-live=assertive]")) {
    if (h.visible(live) && WORDS.test(live.innerText || "")) return true;
  }
  return false;
}

/** The visible Close / Cancel control inside the overlay opened last by openTrigger (window.__root). */
function closeControlIn() {
  const root = window.__root;
  const role = root.getAttribute("role") ?? "";
  const dialogLike = role === "dialog" || role === "alertdialog" || root.tagName === "DIALOG";
  if (!dialogLike) return { dialogLike: false, has: true };
  const NAME = /\b(?:close|cancel|dismiss|done|back|keep|got it|not now|no thanks|stay)\b|^[×✕✖xX]$/i;
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const has = [...root.querySelectorAll("button,[role=button],a[href],[data-slot$=close],[data-slot$=cancel],[data-radix-dialog-close]")].some((el) => {
    if (!shown(el)) return false;
    const name = (el.getAttribute("aria-label") || el.innerText || el.textContent || el.title || "").replace(/\s+/g, " ").trim();
    return NAME.test(name) || /(?:close|cancel)$/.test(el.getAttribute("data-slot") ?? "") || el.hasAttribute("data-radix-dialog-close");
  });
  return { dialogLike: true, has };
}

/** Forms worth trying: visible, writing (not GET), with something to fill. Returns document.forms indices. */
function formsToTry() {
  const h = window.__uxh;
  const FIELDS = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=image]),select,textarea";
  return [...document.forms]
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => h.visible(f) && !f.closest("[aria-hidden=true],[inert]") && !window.__isDev?.(f) && (f.getAttribute("method") ?? "post").toLowerCase() !== "get" && f.getAttribute("role") !== "search" && [...f.querySelectorAll(FIELDS)].some((e) => h.visible(e) && !e.disabled && !e.readOnly))
    .map(({ i }) => i);
}

/** Describe the fillable fields of form `i` and how it is submitted. */
function describeForm(i) {
  const h = window.__uxh;
  const f = document.forms[i];
  const FIELDS = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=image]),select,textarea";
  const fields = [...f.querySelectorAll(FIELDS)].map((e, k) => ({ e, k })).filter(({ e }) => h.visible(e) && !e.disabled && !e.readOnly)
    .map(({ e, k }) => ({ k, tag: e.tagName.toLowerCase(), type: (e.type || "").toLowerCase(), min: e.minLength > 0 ? e.minLength : 0, pattern: !!e.pattern, key: e.name || e.id || `#${k}` }));
  const submit = [...f.querySelectorAll("button,input[type=submit]")].find((b) => h.visible(b) && !b.disabled && (b.type === "submit" || (b.tagName === "BUTTON" && !b.getAttribute("type"))));
  const label = submit ? h.labelOf(submit) : "";
  return { fields, label, destructive: /^\s*(?:delete|remove|discard|reset|revoke|sign[ -]?out|log[ -]?out)\b/i.test(label) || submit?.getAttribute("data-variant") === "destructive" };
}

/** What the user typed, by field key, for form `i`. */
function readForm(i) {
  const f = document.forms[i];
  if (!f || !f.isConnected) return null;
  const FIELDS = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=image]),select,textarea";
  return {
    url: location.href,
    values: [...f.querySelectorAll(FIELDS)].map((e, k) => ({ key: e.name || e.id || `#${k}`, type: (e.type || "").toLowerCase(), value: e.value, checked: !!e.checked })),
  };
}

/* ───────────────────────── node side ───────────────────────── */

const fieldValue = (f) => {
  const long = f.min > 0 ? "Test value ".repeat(Math.ceil(f.min / 10) + 1).trim() : "Test value";
  switch (f.type) {
    case "email": return "test@example.com";
    case "number": case "range": return "5";
    case "url": return "https://example.com";
    case "tel": return "5551234567";
    case "date": return "2030-01-02";
    case "time": return "10:30";
    case "datetime-local": return "2030-01-02T10:30";
    case "month": return "2030-01";
    case "week": return "2030-W02";
    case "color": return "#336699";
    case "password": return "Passw0rd!xyz";
    default: return long;
  }
};

const API_LIKE = /\/(?:api|trpc|graphql|rpc|actions?|_actions|mutations?)(?:\/|$)|[?&](?:delete|remove|logout|signout|unsubscribe|revoke)=/i;
export const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|::1|[^/]*\.localhost|[^/]*\.test)$/i;
/** True for an address that is this machine or a reserved development name. */
export const isLocalBase = (base) => { try { return LOCAL_HOST.test(new URL(base).hostname); } catch { return false; } };

/**
 * The dev server's own channels, same origin only: Next (webpack, turbopack, /__nextjs*), Vite (`vite-hmr` protocol,
 * /@vite), webpack-dev-server (sockjs). They carry hot reload and hydration of the page under test, never app data,
 * so they must work; every other socket is stubbed.
 */
export const DEV_CHANNEL = /^\/(?:_next\/(?:webpack-hmr|turbopack-hmr|hmr)|__nextjs|@vite|__vite_ping|sockjs-node)/;

// Runs in every page before its own scripts (serialised, so no closures): nothing can open an app socket or fire a beacon.
function stubs(devChannel) {
  const dev = new RegExp(devChannel);
  const sameOriginDev = (url, protocols) => {
    try {
      const u = new URL(String(url), location.href);
      if (u.host !== location.host) return false;
      return dev.test(u.pathname) || [].concat(protocols ?? []).some((p) => /^vite-(?:hmr|ping)$/.test(p));
    } catch {
      return false;
    }
  };
  class Dead {
    constructor() { this.readyState = 3; }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  const guard = (Real) => new Proxy(Real, { construct: (target, args, newTarget) => (sameOriginDev(args[0], args[1]) ? Reflect.construct(target, args, newTarget) : new Dead()) });
  try { navigator.sendBeacon = () => true; } catch { /* read-only */ }
  window.WebSocket = guard(window.WebSocket);
  window.EventSource = guard(window.EventSource);
}

/**
 * The sandbox, installed on the whole context (so popups are covered too).
 * state.mode: "off" (writes answered 200), "delay" (reads and writes held 1500ms), "fail" (writes get a 500).
 * state.loading: true while a route is loading, so the page can read its own data; state.routePath: the only document allowed.
 */
/** A popup's first request is issued before its frame exists: that one is a main-frame navigation too. */
function mainFrame(req) {
  try { return !req.frame().parentFrame(); } catch { return true; }
}

async function sandbox(context, state) {
  await context.addInitScript(stubs, DEV_CHANNEL.source);
  context.on("page", (p) => { if (p !== state.page) p.close().catch(() => {}); });
  const hold = async () => {
    const held = { at: Date.now() };
    state.held.add(held);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    state.held.delete(held);
  };
  await context.route("**/*", async (route) => {
    const req = route.request();
    const type = req.resourceType();
    const method = req.method();
    const done = (fn) => fn().catch(() => {});
    if (type === "ping") return done(() => route.abort());
    if (["websocket", "eventsource"].includes(type)) {
      const u = new URL(req.url());
      return u.origin.replace(/^ws/, "http") === state.origin && DEV_CHANNEL.test(u.pathname) ? done(() => route.continue()) : done(() => route.abort());
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (state.mode === "delay") await hold();
      if (state.mode === "fail") { state.failHits = (state.failHits ?? 0) + 1; return done(() => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"mocked failure"}' })); }
      return done(() => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    }
    const url = new URL(req.url());
    if (type === "document" && req.isNavigationRequest() && mainFrame(req)) {
      if (url.origin + url.pathname.replace(/\/$/, "") === state.origin + state.routePath.replace(/\/$/, "")) return done(() => route.continue());
      state.blockedAt = Date.now();
      state.blockedUrl = url.pathname + url.search;
      return done(() => route.abort());
    }
    if (["fetch", "xhr"].includes(type)) {
      if (state.mode === "delay") await hold();
      if (!state.loading && API_LIKE.test(url.pathname + url.search)) return done(() => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    }
    return done(() => route.continue());
  });
}

async function reload(page, base, route, state) {
  state.loading = true;
  try {
    await page.goto(base + route, { waitUntil: "load" });
    await waitForReady(page, { idleMs: 6000 });
  } finally {
    state.loading = false;
  }
  await page.evaluate(installUx);
}

/** Click button `idx` under the delay mock and report what the user would have seen. */
async function tryButton(page, base, route, idx, state) {
  state.mode = "off";
  await reload(page, base, route, state);
  const armed = await page.evaluate(arm, idx);
  if (armed.skip) return { skipped: armed.skip };
  state.mode = "delay";
  state.held.clear();
  state.blockedAt = 0;
  const seen = { nav: null, dialog: null, popup: null };
  const t0 = Date.now();
  const since = () => Date.now() - t0;
  const onNav = (f) => { if (f === page.mainFrame()) seen.nav ??= since(); };
  const onDialog = (d) => { seen.dialog ??= since(); d.dismiss().catch(() => {}); };
  const onPopup = (p) => { seen.popup ??= since(); p.close().catch(() => {}); };
  page.on("framenavigated", onNav);
  page.on("dialog", onDialog);
  page.on("popup", onPopup);
  try {
    await page.mouse.click(armed.x, armed.y);
    const clickedAt = Date.now() - 20;
    await page.waitForTimeout(PROGRESS_MS - 40);
    const pending = [...state.held].some((h) => h.at >= clickedAt);
    const progress = await page.evaluate(progressNow).catch(() => true); // a navigation destroyed the page: that is a change
    await page.waitForTimeout(Math.max(0, WINDOW_MS - PROGRESS_MS));
    const rec = await page.evaluate(() => window.__ux).catch(() => null);
    const blocked = state.blockedAt ? state.blockedAt - t0 : null; // a navigation the sandbox stopped is still what the user would see
    const times = [rec?.first, seen.nav, seen.dialog, seen.popup, blocked].filter((t) => typeof t === "number");
    return { tag: armed.tag, first: times.length ? Math.min(...times) : null, pending, progress };
  } finally {
    page.off("framenavigated", onNav);
    page.off("dialog", onDialog);
    page.off("popup", onPopup);
    state.mode = "off";
  }
}

async function feedbackFindings(page, base, route, state, note) {
  const found = [];
  await page.evaluate(installUx);
  const list = await page.evaluate(() => window.__uxh.buttons().map((el, i) => ({ i, key: `${el.getAttribute("role") ?? "button"}|${window.__uxh.labelOf(el)}` })));
  const picked = [], keys = new Set();
  for (const b of list) if (!keys.has(b.key) && picked.length < MAX_CLICKS) { keys.add(b.key); picked.push(b.i); }
  let clicked = 0, covered = 0;
  for (const i of picked) {
    const r = await tryButton(page, base, route, i, state);
    if (r.skipped) { covered++; continue; }
    clicked++;
    if (r.first === null) {
      found.push({ rule: "no-feedback", found: r.pending ? `${r.tag} sends a request and shows nothing while it waits: no change, busy state or progress within ${WINDOW_MS}ms` : `${r.tag} shows no visible change within ${WINDOW_MS}ms: no DOM change, busy state, live-region text or navigation` });
      continue;
    }
    if (r.first > FEEDBACK_MS) found.push({ rule: "slow-response", found: `${r.tag} first changes the screen ${Math.round(r.first)}ms after the click (limit ${FEEDBACK_MS}ms)` });
    if (r.pending && !r.progress) found.push({ rule: "no-feedback", found: `${r.tag} is still working after ${PROGRESS_MS / 1000}s and shows no progress indicator (no progressbar, aria-busy, skeleton, spinner or busy label)` });
  }
  note?.(`NOTE ux-flow ${route}: ${list.length} buttons, ${clicked} clicked (cap ${MAX_CLICKS} distinct)${covered ? `, ${covered} not clickable (covered or gone)` : ""}; reads held ${DELAY_MS}ms, writes answered 200 without reaching the server`);
  return found;
}

async function escapeFindings(page, base, route, state, note) {
  const found = [];
  state.mode = "off";
  await reload(page, base, route, state);
  const { total, picked } = await pickTriggers(page);
  let opened = 0;
  for (const i of picked) {
    const got = await openTrigger(page, i, base, route);
    if (!got || got.left) { if (got?.left) await reload(page, base, route, state); continue; }
    if (got.opened.isOverlay) {
      opened++;
      const where = got.trig.name;
      const close = await page.evaluate(closeControlIn);
      if (close.dialogLike && !close.has) found.push({ rule: "no-escape", found: `the dialog opened by ${where} has no visible Close or Cancel control (Escape alone is not a way out for a mouse or touch user)` });
      await page.keyboard.press("Escape");
      let closed = false;
      for (let k = 0; k < 10 && !closed; k++) {
        await page.waitForTimeout(100);
        closed = await page.evaluate(() => { const r = window.__root; return !r.isConnected || !window.__kbd.visible(r) || r.getAttribute("aria-hidden") === "true"; });
      }
      if (!closed) found.push({ rule: "no-escape", found: `Escape does not close the overlay opened by ${where}` });
    }
    if (got.opened.isOverlay || got.opened.changed) await reload(page, base, route, state);
  }
  note?.(`NOTE ux-flow ${route}: ${total} overlay triggers, ${picked.length} tried (cap 10 distinct), ${opened} opened an overlay`);
  return found;
}

async function inputFindings(page, base, route, state, note) {
  const found = [];
  state.mode = "off";
  await reload(page, base, route, state);
  const forms = (await page.evaluate(formsToTry)).slice(0, MAX_FORMS);
  let tried = 0, blocked = 0, noRequest = 0;
  for (const i of forms) {
    state.mode = "off";
    await reload(page, base, route, state);
    const info = await page.evaluate(describeForm, i);
    if (!info.fields.length || info.destructive) continue;
    const form = page.locator("form").nth(i);
    const FIELDS = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=image]), select, textarea";
    for (const f of info.fields) {
      const loc = form.locator(FIELDS).nth(f.k);
      try {
        if (f.tag === "select") await loc.selectOption({ index: 1 }, { timeout: 1500 }).catch(() => loc.selectOption({ index: 0 }, { timeout: 1500 }));
        else if (f.type === "checkbox" || f.type === "radio") await loc.check({ timeout: 1500 });
        else await loc.fill(fieldValue(f), { timeout: 1500 });
      } catch { /* a field the check cannot drive is not judged */ }
    }
    const before = await page.evaluate(readForm, i);
    const valid = await page.evaluate((k) => document.forms[k].checkValidity(), i);
    if (!valid) { blocked++; continue; }
    tried++;
    state.mode = "fail";
    state.failHits = 0;
    await page.evaluate((k) => {
      const f = document.forms[k];
      const submit = [...f.querySelectorAll("button,input[type=submit]")].find((b) => b.type === "submit" && !b.disabled);
      f.requestSubmit(submit ?? undefined);
    }, i);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(readForm, i).catch(() => null);
    state.mode = "off";
    if (!state.failHits) { noRequest++; continue; } // nothing was sent: there is no failure to survive
    const name = `the form ${info.label ? `"${info.label.slice(0, 30)}"` : `#${i + 1}`}`;
    if (!after) { found.push({ rule: "lost-input", found: `${name} is gone after a failed submit: everything the user typed is lost` }); continue; }
    if (after.url !== before.url) { found.push({ rule: "lost-input", found: `${name} left the page after a failed submit (${new URL(before.url).pathname} to ${new URL(after.url).pathname})` }); continue; }
    const lost = before.values.filter((b) => b.type !== "password" && (b.value !== "" || b.checked)).filter((b) => {
      const a = after.values.find((x) => x.key === b.key);
      return !a || a.value !== b.value || a.checked !== b.checked;
    });
    if (lost.length) found.push({ rule: "lost-input", found: `${name} loses ${lost.map((l) => l.key).slice(0, 4).join(", ")}${lost.length > 4 ? ` and ${lost.length - 4} more` : ""} after a failed submit` });
  }
  if (noRequest) note?.(`NOTE ux-flow ${route}: ${noRequest} form${noRequest === 1 ? "" : "s"} sent no network request on submit, so there is no failure path to test: add a failure state (an error shown beside the form that keeps what was typed)`);
  note?.(`NOTE ux-flow ${route}: ${forms.length} forms, ${tried} submitted with a mocked 500${blocked ? `, ${blocked} not submittable with generated values` : ""}; passwords are not judged (clearing one on failure is a security convention)`);
  return found;
}

/* ───────────────────────── entry ───────────────────────── */

export async function run(config, options = {}) {
  const routes = routesFor(config, options);
  if (!routes.length) return { skipped: "no routes: pass them (--route /x) or set routes in viewsonic-ui.config.json" };
  const target = options.base ?? config.baseUrl;
  if (!isLocalBase(target) && !options.allowRemote) {
    return { skipped: `ux-flow clicks buttons and submits forms, so it only runs against a local app (localhost, 127.0.0.1, [::1], *.localhost, *.test); ${target} is not local. Its sandbox stops writes, beacons, sockets and navigations, but a remote instance may hold real data: pass --allow-remote if you are sure` };
  }
  return withPages(config, options, async (newPage, _browser, base) => {
    const findings = [];
    for (const route of routes) {
      const page = await newPage({ viewport: VIEWPORTS.desktop, colorScheme: "light", reducedMotion: "no-preference" });
      const state = { mode: "off", held: new Set(), loading: true, blockedAt: 0, page, origin: new URL(base).origin, routePath: new URL(base + route).pathname };
      await sandbox(page.context(), state);
      let res = null;
      let problem = null;
      try {
        res = await page.goto(base + route, { waitUntil: "load" });
      } catch (e) {
        // The sandbox aborts a navigation away from the route: that is a redirect (sign-in?), reported for this route only.
        if (!state.blockedUrl) {
          await page.close().catch(() => {});
          throw e;
        }
        problem = unreachableFinding(CHECK, route, { ok: () => true, url: () => base + state.blockedUrl });
      }
      if (!problem) {
        await waitForReady(page);
        problem = unreachableFinding(CHECK, route, res, page.url());
      }
      state.loading = false;
      if (problem) { findings.push(problem); await page.close().catch(() => {}); continue; }
      const perRoute = [];
      const seen = new Set();
      const add = (f) => { const key = `${f.rule}|${f.found}`; if (!seen.has(key)) { seen.add(key); perRoute.push(f); } };
      try {
        await page.evaluate(installUx);
        await page.evaluate(install);
        const note = options.note;
        for (const run1 of [feedbackFindings, escapeFindings, inputFindings]) {
          try {
            for (const f of await run1(page, base, route, state, note)) add(f);
          } catch (e) {
            note?.(`NOTE ux-flow ${route}: ${run1.name} stopped early (${String(e.message).split("\n")[0]})`);
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
      const byRule = new Map();
      for (const f of perRoute) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
      for (const [rule, list] of byRule) {
        const shown = list.length > CAP ? CAP - 1 : list.length;
        for (const f of list.slice(0, shown)) findings.push({ check: CHECK, rule, file: route, line: 0, found: f.found, why: f.found, fix: FIX[rule] });
        if (list.length > shown) {
          const more = `+${list.length - shown} more ${rule} failures on this route`;
          findings.push({ check: CHECK, rule, file: route, line: 0, found: more, why: more, fix: "fix the findings above, then re-run to see the rest" });
        }
      }
    }
    return findings;
  });
}
