// Motion, statically: every animated product file declares its phases, and the phases hand off.
//
// The phase table is `motionPhases` in viewsonic-ui.config.json, one row per animated file:
//   { component, specimen?, trigger?, dismiss?, target, in, idle, out, changes? }
// in / idle / out are @utility names from the project's stylesheets, or "N/A: <reason>".
// The base components in config.uiDir are governed by the design system itself and need no row.
// A phase is an @utility in config.styles, or a plain class in a stylesheet listed in config.componentCss.
//
// Rules:
//   no-phase-row      a file outside uiDir uses an anim-* class, useSpring( or <motion. and has no row
//   unknown-phase     a named phase is not an @utility in config.styles
//   incomplete-row    in, idle or out is missing, or an N/A has no reason
//   stale-row         the row's component file does not exist
//   phase-break       in ends where idle does not start (or, with no idle animation, where out does not start)
//   slow-exit         out is slower than in (durations read from their --duration-* tokens)
//   untokenised-phase a phase utility whose duration is not read from a --duration-* token
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projectFiles, readRel, stripComments, toPosix } from "../lib.mjs";

export const CHECK = "motion-static";
export const RULE_IDS = ["no-phase-row", "unknown-phase", "incomplete-row", "stale-row", "phase-break", "slow-exit", "untokenised-phase"];

const ANIMATED = /\banim-[a-z][\w-]*|\buseSpring\(|<motion\.\w*/;
/** True when the source text (comments ignored) animates. Exported for tests. */
export const animated = (text) => ANIMATED.test(stripComments(text));

const isNA = (v) => typeof v === "string" && /^N\/A\b/.test(v);
const hasReason = (v) => /^N\/A:\s*\S/.test(v);

/** Inner text of the {} block whose "{" is at `open`, and the index after its "}". */
function block(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
  }
  return { body: text.slice(open + 1), end: text.length };
}

/** name -> body for every `<at> name { … }` (first definition wins). */
function namedBlocks(css, at) {
  const out = new Map();
  const re = new RegExp(`@${at}\\s+([\\w-]+)\\s*\\{`, "g");
  let m;
  while ((m = re.exec(css))) {
    const { body, end } = block(css, m.index + m[0].length - 1);
    if (!out.has(m[1])) out.set(m[1], body);
    re.lastIndex = end;
  }
  return out;
}

/** The frames of a @keyframes body: [{ at: "from"|"to"|"50%"…, decl }] */
function frames(body) {
  const out = [];
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(body))) {
    const { body: decl, end } = block(body, m.index + m[0].length - 1);
    for (const at of m[1].split(",").map((s) => s.trim().toLowerCase())) out.push({ at, decl });
    re.lastIndex = end;
  }
  return out;
}

const PROPS = ["opacity", "transform", "scale", "translate"];
const IDENTITY = /^(none|scale\(1\)|scale3d\(1,\s*1,\s*1\)|translate(x|y)?\(0(px)?\)|translate\(0(px)?,\s*0(px)?\)|translate3d\(0(px)?,\s*0(px)?,\s*0(px)?\))$/;
function norm(prop, v) {
  const s = v.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/ !important$/, "");
  return (prop === "transform" || prop === "scale" || prop === "translate") && IDENTITY.test(s) ? "none" : s;
}
function frameProps(kf, which) {
  const at = which === "start" ? ["from", "0%"] : ["to", "100%"];
  const out = {};
  for (const f of kf) {
    if (!at.includes(f.at)) continue;
    for (const p of PROPS) {
      const m = new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+)`).exec(f.decl);
      if (m) out[p] = norm(p, m[1]);
    }
  }
  return out;
}

const KEYWORDS = new Set(["both", "forwards", "backwards", "none", "infinite", "normal", "reverse", "alternate", "alternate-reverse", "running", "paused", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);
/** The keyframes name a utility body animates, or null. */
function keyframesOf(body) {
  const sh = /animation(?:-name)?\s*:\s*([^;]+)/.exec(body);
  if (!sh) return null;
  const first = sh[1].split(/,(?![^(]*\))/)[0];
  for (const tok of first.match(/[\w-]+(?:\([^)]*\))?/g) ?? []) {
    if (tok.includes("(") || KEYWORDS.has(tok) || /^[0-9]/.test(tok)) continue;
    return tok;
  }
  return null;
}

const REVERSED = /animation(?:-direction)?\s*:[^;]*\breverse\b/;
/** True when the utility plays its keyframes backwards (animation-direction: reverse). */
const reversed = (body) => REVERSED.test(body);

const msOf = (v, n, u) => (u === "s" ? n * 1000 : n);
/** { token, ms } for a utility body: the first var(--duration-*) it reads. ms is null when the token cannot be resolved. */
function durationOf(body, tokens) {
  const m = /var\(\s*(--duration-[\w-]+)/.exec(body);
  if (!m) return { token: null, ms: null };
  return { token: m[1], ms: tokenMs(m[1], tokens) };
}
function tokenMs(token, tokens, depth = 0) {
  const v = tokens.get(token);
  if (v == null || depth > 4) return null;
  const lit = /^([\d.]+)(ms|s)$/.exec(v.trim());
  if (lit) return msOf(v, parseFloat(lit[1]), lit[2]);
  const ref = /^var\(\s*(--[\w-]+)/.exec(v.trim());
  return ref ? tokenMs(ref[1], tokens, depth + 1) : null;
}

/** name -> body for every top-level `.name { … }` rule (a plain class counts as a motion utility in component stylesheets). */
function classBlocks(css) {
  const out = new Map();
  const re = /(^|[\s}])\.([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const { body, end } = block(css, m.index + m[0].length - 1);
    if (!out.has(m[2])) out.set(m[2], body);
    re.lastIndex = end;
  }
  return out;
}

function readStyles(config) {
  const read = (files) => files
    .filter((f) => existsSync(join(config.root, f)))
    .map((f) => readRel(config, f).replace(/\/\*[\s\S]*?\*\//g, ""))
    .join("\n");
  const css = read(config.styles ?? []);
  const own = read(config.componentCss ?? []); // component stylesheets: plain classes count as phases too
  const all = css + "\n" + own;
  const tokens = new Map();
  for (const m of all.matchAll(/(--duration-[\w-]+)\s*:\s*([^;]+);/g)) if (!tokens.has(m[1])) tokens.set(m[1], m[2]);
  const utilities = namedBlocks(css, "utility");
  for (const [k, v] of [...namedBlocks(own, "utility"), ...classBlocks(own)]) if (!utilities.has(k)) utilities.set(k, v);
  return { utilities, keyframes: namedBlocks(all, "keyframes"), tokens };
}

const PHASES = ["in", "idle", "out"];

export async function run(config) {
  const findings = [];
  const add = (rule, file, line, found, fix, why = found) => findings.push({ check: CHECK, rule, file, line, found, why, fix });
  const rows = config.motionPhases ?? [];
  const { utilities, keyframes, tokens } = readStyles(config);
  const rowsFile = "viewsonic-ui.config.json";

  // 1. every animated product file has a row
  const covered = new Set(rows.map((r) => r.component));
  const uiPrefix = (config.uiDir ?? "components/ui").replace(/\/$/, "") + "/";
  for (const rel of projectFiles(config, { withStyles: false })) {
    if (!/\.(tsx?|jsx?)$/.test(rel) || rel.startsWith(uiPrefix) || covered.has(rel)) continue;
    const text = stripComments(readRel(config, rel));
    const m = ANIMATED.exec(text);
    if (!m) continue;
    const line = text.slice(0, m.index).split("\n").length;
    add("no-phase-row", rel, line, `${m[0].trim()} used, but ${rel} has no row in motionPhases`,
      `add a row for ${rel} to motionPhases in ${rowsFile} with in, idle and out (anim-* names, or "N/A: <reason>")`);
  }

  // 2. each row
  for (const row of rows) {
    const file = row.component ?? rowsFile;
    if (row.component && !existsSync(join(config.root, row.component))) {
      add("stale-row", rowsFile, 0, `${row.component} is in motionPhases but the file does not exist`, "delete the row or fix the path");
      continue;
    }
    let complete = true;
    for (const k of PHASES) {
      const v = row[k];
      if (typeof v !== "string" || !v.trim()) { complete = false; add("incomplete-row", file, 0, `${file}: "${k}" is missing`, `set ${k} to an anim-* name or "N/A: <reason>"`); }
      else if (isNA(v) && !hasReason(v)) { complete = false; add("incomplete-row", file, 0, `${file}: ${k} is "${v}" with no reason`, `write "N/A: <why ${k} does not apply>"`); }
    }
    const named = [...PHASES.map((k) => [k, row[k]]), ...(row.changes ?? []).map((c) => ["changes", c])]
      .filter(([, v]) => typeof v === "string" && v.trim() && !isNA(v));
    const known = [];
    for (const [k, v] of named) {
      if (!utilities.has(v)) {
        add("unknown-phase", file, 0, `${file}: ${k} "${v}" is not an @utility in the project's stylesheets`,
          `use a utility the motion stylesheet defines, or write "N/A: <reason>"; do not invent a motion name`);
        continue;
      }
      known.push([k, v]);
      if (!durationOf(utilities.get(v), tokens).token) {
        add("untokenised-phase", file, 0, `${file}: ${k} "${v}" does not read its duration from a --duration-* token`,
          `define ${v} with var(--duration-*) in the motion stylesheet (ask before adding a new duration)`);
      }
    }
    if (!complete) continue;
    const ok = (k) => known.find(([kk]) => kk === k)?.[1];
    const body = (name) => utilities.get(name);

    // phase-break: in's last frame is where the next state's first frame is
    const next = ok("idle") ? ["idle", ok("idle")] : ok("out") ? ["out", ok("out")] : null;
    if (ok("in") && next) {
      const a = keyframesOf(body(ok("in"))), b = keyframesOf(body(next[1]));
      const ka = a && keyframes.get(a), kb = b && keyframes.get(b);
      if (ka && kb) {
        // a `reverse` direction plays the keyframes backwards: its first frame is the keyframes' last
        const end = frameProps(frames(ka), reversed(body(ok("in"))) ? "start" : "end");
        const start = frameProps(frames(kb), reversed(body(next[1])) ? "end" : "start");
        for (const p of Object.keys(end)) {
          if (p in start && start[p] !== end[p]) {
            add("phase-break", file, 0, `${file}: ${ok("in")} ends ${p} ${end[p]}, ${next[1]} (${next[0]}) starts ${p} ${start[p]}`,
              `make the keyframe endpoints equal: ${ok("in")}'s last frame and ${next[1]}'s first frame must hold the same ${p}`);
          }
        }
      }
    }
    // slow-exit
    if (ok("in") && ok("out")) {
      const i = durationOf(body(ok("in")), tokens), o = durationOf(body(ok("out")), tokens);
      if (i.ms != null && o.ms != null && o.ms > i.ms) {
        add("slow-exit", file, 0, `${file}: out ${ok("out")} takes ${o.ms}ms, in ${ok("in")} takes ${i.ms}ms`,
          "leaving is never slower than arriving: use a faster duration token for out");
      }
    }
  }
  return findings.map((f) => ({ ...f, file: toPosix(f.file) }));
}
