// The one list of checks. A later task adds a check by adding one line here.
// Each module exports `async function run(config, options) -> Finding[]`, where
//   Finding = { check, rule, file, line, found, why, fix }   (file relative to config.root, forward slashes)
// A check that cannot run may return { skipped: "reason" } instead of findings.

/** Pure file scans: no app, no browser. `fast` runs these. */
export const STATIC_CHECKS = [
  { name: "tokens", load: () => import("./static/tokens.mjs") },
  { name: "rules", load: () => import("./static/rules.mjs") },
  { name: "refs", load: () => import("./static/refs.mjs") },
  { name: "contrast", load: () => import("./static/contrast.mjs") },
  { name: "motion-static", load: () => import("./static/motion.mjs") },
  { name: "content", load: () => import("./static/content.mjs") },
  { name: "ux", load: () => import("./static/ux.mjs") },
];

/** Need a running app at baseUrl and Playwright. Only `full` (or the check's own name) runs these. */
export const BROWSER_CHECKS = [
  { name: "contrast-rendered", load: () => import("./browser/contrast.mjs") },
  { name: "layout-shift", load: () => import("./browser/layout-shift.mjs") },
  { name: "rhythm", load: () => import("./browser/rhythm.mjs") },
  { name: "emphasis", load: () => import("./browser/emphasis.mjs") },
  { name: "motion", load: () => import("./browser/motion.mjs") },
  { name: "keyboard", load: () => import("./browser/keyboard.mjs") },
  { name: "ux-flow", load: () => import("./browser/ux.mjs") },
  { name: "runtime-errors", load: () => import("./browser/runtime-errors.mjs") },
  { name: "page-length", load: () => import("./browser/page-length.mjs") },
  { name: "anchor-nav", load: () => import("./browser/anchor-nav.mjs") },
  { name: "nested-radius", load: () => import("./browser/nested-radius.mjs") },
  { name: "nav-reach", load: () => import("./browser/nav-reach.mjs") },
  { name: "overlap", load: () => import("./browser/overlap.mjs") },
  { name: "truncation", load: () => import("./browser/truncation.mjs") },
  { name: "title-scale", load: () => import("./browser/title-scale.mjs") },
];
