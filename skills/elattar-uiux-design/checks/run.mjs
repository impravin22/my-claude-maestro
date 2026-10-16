#!/usr/bin/env node
// ONE entry for every check.
//
//   node <skill>/checks/run.mjs fast | full | <check> | config
//        [--base <url>] [--cwd <project dir>] [--config <viewsonic-ui.config.json>]
//
//   fast      every static check; in a git repo only files changed vs HEAD plus their importers (--all: everything)
//   full      fast + every browser check (needs a running app at baseUrl and Playwright); routes = --route, else
//             the changed pages plus "/" in a git repo, else (or with --all-routes) every route in the config
//   flags     --changed | --all  file scope · --route <r> (repeatable) | --all-routes  browser scope · --only a,b  subset
//   <check>   one check by name
//   config    print the discovered configuration as JSON
//   contrast  --fg <token> --bg <token> [--kind text|large|ui]   one pair, both themes, with suggestions
//   contrast-rendered [<route>...] [--route <r>]  measured contrast on the running app, both themes
//   layout-shift | rhythm | emphasis | keyboard | ux-flow | runtime-errors | page-length | anchor-nav | nested-radius | nav-reach | overlap | truncation | title-scale [<route>...] [--route <r>]  proportion, rhythm, emphasis, keyboard, title/description scale and console/page errors measured on the running app
//   content  microcopy: vague actions and errors, title case, exclamation marks, confirm buttons (static)
//   ux  raw errors, system words, unconfirmed destructive actions, term drift (static)
//   motion-static  every animated file has a motionPhases row and its phases hand off (static)
//   motion [--component <part of a path>]  sample each motionPhases row that has a specimen on the running app
//   ux-flow  ... [--allow-remote]  clicks and fills on the running app; refuses a base that is not local without --allow-remote
//            (maestro patch: every browser check and shots refuse a base that is not local without --allow-remote)
//   shots <route>... [--base <url>] [--out <dir>]  PNGs: light/dark x phone/desktop (not a check; exit 0)
//   install   [--yes] [--cwd <dir>]  hook, CI workflow, config, vendored checks (plan only without --yes)
//
// Output: one line per finding
//   BAD <check>/<rule> <file>:<line>: <why> → <fix>
// and a last line
//   N checks · X GOOD · Y BAD · Z SKIPPED
// Exit: 1 if anything is BAD; 2 if anything was SKIPPED and nothing is BAD; 64 on a usage
// error; otherwise 0. A skipped check is never reported as passing.

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeProblem } from "./maestro-guards.mjs";
import { computeScope, computeRoutes } from "./scope.mjs";

// Checks that compare files with each other: they read every file and only REPORT in the scoped ones.
const CROSS_FILE = new Set(["tokens", "refs", "ux"]);

const PLAYWRIGHT_HINT = "npm i -D @playwright/test && npx playwright install chromium";

/** Git Bash rewrites "/route" into "C:/Program Files/Git/route"; undo it. Other values pass through. */
export function fixRoute(a) {
  const m = /^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/.exec(a);
  return m ? "/" + m[1].replace(/\\/g, "/") : a;
}

const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();

/**
 * Run checks and return { lines, exitCode }. Pure apart from the checks themselves,
 * so it can be tested with an injected registry.
 */
export async function runChecks({ mode, config, base, registry, onLine = () => {}, extra = {}, scopeFiles = null, only = null, routesNarrowed = false }) {
  registry ??= await import("./registry.mjs");
  const { STATIC_CHECKS, BROWSER_CHECKS } = registry;
  const lines = [];
  const emit = (l) => { lines.push(l); onLine(l); };

  let selected;
  if (mode === "fast") selected = STATIC_CHECKS.map((c) => ({ ...c, browser: false }));
  else if (mode === "full") {
    selected = [...STATIC_CHECKS.map((c) => ({ ...c, browser: false })), ...BROWSER_CHECKS.map((c) => ({ ...c, browser: true }))];
    if (BROWSER_CHECKS.length === 0) emit("0 browser checks registered");
  } else {
    const hit = [...STATIC_CHECKS.map((c) => ({ ...c, browser: false })), ...BROWSER_CHECKS.map((c) => ({ ...c, browser: true }))]
      .find((c) => c.name === mode);
    selected = hit ? [hit] : [];
  }

  if (only?.length) {
    const unknown = only.filter((n) => ![...STATIC_CHECKS, ...BROWSER_CHECKS].some((c) => c.name === n));
    if (unknown.length) {
      emit(`unknown check in --only: ${unknown.join(", ")}`);
      return { lines, exitCode: 64, counts: { good: 0, bad: 0, skipped: 0 } };
    }
    selected = selected.filter((c) => only.includes(c.name));
    if (!selected.length) emit(`--only ${only.join(",")}: none of those checks run in ${mode}`);
  }

  const scoped = Array.isArray(scopeFiles);
  const inScope = scoped ? new Set(scopeFiles) : null;
  const options = { base: base ?? config.baseUrl, note: (m) => emit(m), ...extra, ...(scoped ? { files: scopeFiles } : {}) };
  let good = 0, bad = 0, skipped = 0, dropped = 0;

  for (const c of selected) {
    if (c.browser && config.hasPlaywright === false) {
      skipped++;
      emit(`SKIPPED ${c.name} - Playwright is not installed in this project; run: ${PLAYWRIGHT_HINT}`);
      continue;
    }
    let result;
    try {
      const mod = await c.load();
      const cfg = scoped && !c.browser && !CROSS_FILE.has(c.name) ? { ...config, scopeFiles } : config;
      result = await mod.run(cfg, options);
    } catch (e) {
      skipped++;
      emit(`SKIPPED ${c.name} - could not run: ${oneLine(e?.message ?? e)}`);
      continue;
    }
    if (result && !Array.isArray(result) && result.skipped) {
      skipped++;
      emit(`SKIPPED ${c.name} - ${oneLine(result.skipped)}`);
      continue;
    }
    if (!Array.isArray(result)) {
      skipped++;
      emit(`SKIPPED ${c.name} - it returned no findings array, so nothing was judged`);
      continue;
    }
    if (scoped && !c.browser && CROSS_FILE.has(c.name)) {
      const kept = result.filter((f) => inScope.has(f.file));
      dropped += result.length - kept.length;
      result = kept;
    }
    if (result.length === 0) {
      good++;
      continue;
    }
    bad++;
    for (const f of result) {
      // maestro patch (not upstream): the file name is one line too, so a name with a line break cannot forge a GOOD.
      emit(`BAD ${f.check ?? c.name}/${f.rule} ${oneLine(f.file)}:${f.line} - ${oneLine(f.why)} → ${oneLine(f.fix)}`);
    }
  }

  if (dropped) emit(`scope: ${dropped} ${dropped === 1 ? "finding" : "findings"} outside the changed files ${dropped === 1 ? "was" : "were"} not reported (run with --all to see them)`);
  emit(`${selected.length} checks · ${good} GOOD · ${bad} BAD · ${skipped} SKIPPED${scoped || routesNarrowed ? " (scoped)" : ""}`);
  return { lines, exitCode: bad ? 1 : skipped ? 2 : 0, counts: { good, bad, skipped } };
}

/** `--route=/x` is `--route /x` (and a value after `=` is never rewritten by Git Bash). */
const splitEquals = (argv) => argv.flatMap((a) => {
  const m = /^(--(?:route|base|cwd|config|only|out|component|fg|bg|kind))=(.*)$/s.exec(a);
  return m ? [m[1], m[2]] : [a];
});

function parseArgs(argv) {
  argv = splitEquals(argv);
  const args = { mode: null, cwd: process.cwd(), base: undefined, configPath: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") args.cwd = resolve(argv[++i] ?? ".");
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "--fix-hints") continue; // fixes are always printed
    else if (a === "--route") {
      // maestro patch (not upstream): a route is appended to the base, so it must be a path on it.
      const r = fixRoute(argv[++i] ?? "");
      const problem = routeProblem(r);
      if (problem) return { error: `--route ${JSON.stringify(r)} ${problem}` };
      (args.routes ??= []).push(r);
    }
    else if (a === "--changed") args.changed = true;
    else if (a === "--all") args.all = true;
    else if (a === "--all-routes") args.allRoutes = true;
    else if (a === "--only") args.only = String(argv[++i] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--allow-remote") args.allowRemote = true;
    else if (a === "--component") args.component = argv[++i];
    else if (a === "--fg" || a === "--bg" || a === "--kind") (args.extra ??= {})[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) return { error: `unknown flag ${a}` };
    else if (!args.mode) args.mode = a;
    else if (["shots", "contrast-rendered", "layout-shift", "rhythm", "emphasis", "keyboard", "ux-flow", "runtime-errors", "page-length", "anchor-nav", "nested-radius", "nav-reach", "overlap", "truncation", "title-scale"].includes(args.mode) && fixRoute(a).startsWith("/")) {
      const problem = routeProblem(fixRoute(a)); // maestro patch: the same rule as --route
      if (problem) return { error: `route ${JSON.stringify(fixRoute(a))} ${problem}` };
      (args.routes ??= []).push(fixRoute(a));
    }
    else return { error: `unexpected argument ${a}` };
  }
  return args;
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    console.error(`the checks need Node 22 or newer; this is Node ${process.versions.node}`);
    process.exit(64);
  }
  if (process.argv[2] === "install") {
    const { main: install } = await import("./install.mjs");
    process.exitCode = install(process.argv.slice(3));
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const registry = await import("./registry.mjs");
  const names = [...registry.STATIC_CHECKS, ...registry.BROWSER_CHECKS].map((c) => c.name);
  const usage = `usage: run.mjs fast | full | config | <check: ${names.join(" | ")}> | shots <route>... [--base <url>] [--cwd <dir>] [--config <file>]`;
  if (args.error || !args.mode) {
    console.error(`${args.error ?? "no mode given"}\n${usage}`);
    process.exit(64);
  }
  if (!["fast", "full", "config", "shots", ...names].includes(args.mode)) {
    console.error(`unknown check "${args.mode}"\n${usage}`);
    process.exit(64);
  }

  const { loadConfig } = await import("./config.mjs");
  let config;
  try {
    config = await loadConfig(args.cwd, { configPath: args.configPath });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.base) config.baseUrl = args.base;
  if (args.extra) {
    const { fg, bg, kind } = args.extra;
    if (args.mode !== "contrast" || !fg || !bg || (kind !== undefined && !["text", "large", "ui"].includes(kind))) {
      console.error(`--fg <token> --bg <token> [--kind text|large|ui] go with the contrast check only, and need both tokens\n${usage}`);
      process.exit(64);
    }
  }

  if (args.mode === "config") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  if (args.mode === "shots") {
    if (!args.routes?.length) {
      console.error(`shots needs at least one route
usage: run.mjs shots <route>... [--base <url>] [--out <dir>]`);
      process.exit(64);
    }
    const { shots } = await import("./browser/shots.mjs");
    const r = await shots(config, { routes: args.routes, base: args.base ?? config.baseUrl, out: args.out, allowRemote: Boolean(args.allowRemote), onFile: (f) => console.log(f) });
    for (const e of r.errors ?? []) console.log(`BAD shots/route-unreachable ${e.split(" ")[0]}:0 - ${e} → fix the route; nothing was captured for it`);
    if (r.errors?.length) process.exitCode = 1;
    if (r.skipped) {
      console.log(`SKIPPED shots - ${oneLine(r.skipped)}`);
      process.exitCode = 2;
    }
    return;
  }
  if (args.changed && args.all) {
    console.error(`--changed and --all contradict each other
${usage}`);
    process.exit(64);
  }
  const scoping = ["fast", "full"].includes(args.mode) || args.only;
  let scopeFiles = null;
  let routes = args.routes;
  let routesNarrowed = Boolean(args.routes?.length);
  if (scoping) {
    const scope = computeScope(config, args.mode, { all: args.all, changed: args.changed, only: args.only });
    scopeFiles = scope.files;
    console.log(scope.label);
    if (args.mode === "full") {
      const r = computeRoutes(config, { routes: args.routes, allRoutes: args.allRoutes || args.all });
      routes = r.routes;
      routesNarrowed = r.narrowed;
      console.log(r.label);
    }
  }
  const extra = { ...args.extra, ...(args.allowRemote ? { allowRemote: true } : {}), ...(routes ? { routes } : {}), ...(args.component ? { component: args.component } : {}) };
  const { exitCode } = await runChecks({ mode: args.mode, config, base: args.base, registry, extra, scopeFiles, only: args.only, routesNarrowed, onLine: (l) => console.log(l) });
  process.exitCode = exitCode;
}

// Real paths on both sides: on macOS a script under /var runs as /private/var.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
