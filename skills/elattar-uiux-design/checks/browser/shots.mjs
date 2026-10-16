// Screenshots for the agent's review: light/dark x phone/desktop. Not a check: it never fails a build.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linkOnPath, linkUnder, replaceFile } from "../maestro-guards.mjs";
import { routeSlug, setTheme, THEMES, unreachableFinding, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";

/** A page taller than this many viewports is sliced only this far: past it, the full-page file is the record. */
export const MAX_SLICES = 8;

/** Returns { files, slices, errors } or { skipped }. Beside each full-page PNG that is taller than one viewport, up to
 *  MAX_SLICES viewport-tall slices `<route-slug>-<theme>-<device>-<n>.png`: a tall page downscales too far to judge whole.
 *  Default output: <root>/.viewsonic-ui/shots/<route-slug>/<theme>-<viewport>.png */
/**
 * maestro patch (not upstream): what is wrong with writing the screenshots, or null. The default folder is in the
 * repository, so neither it nor any route folder below it may be a committed link (or hold one), and a route whose
 * folder would be `.` or `..` is refused. Each PNG is then written by rename, never through whatever is at its name.
 */
function shotsProblem(config, outRoot, routes, isDefault) {
  if (isDefault) { const p = linkOnPath(config.root, ".viewsonic-ui/shots", "dir"); if (p) return p; }
  for (const route of routes) {
    const slug = routeSlug(route);
    if (slug === "." || slug === "..") return `the route ${JSON.stringify(route)} names no folder of its own`;
    const p = linkOnPath(outRoot, slug, "dir") ?? linkUnder(join(outRoot, slug));
    if (p) return p;
  }
  return null;
}

export async function shots(config, { routes, base, out, allowRemote = false, onFile = () => {} } = {}) {
  const outRoot = out ? resolve(out) : join(config.root, ".viewsonic-ui", "shots");
  const problem = shotsProblem(config, outRoot, routes, !out);
  if (problem) return { skipped: `refusing to write screenshots: ${problem}; replace it with a real folder, or pass --out <dir>` };
  const result = await withPages(config, { base, allowRemote }, async (newPage, _browser, url) => {
    // maestro patch: the default folder ignores itself, so a signed-in page's screenshots are never committed by
    // accident (a team that commits baselines passes --out). Made only once the browser is up.
    if (!out) {
      mkdirSync(outRoot, { recursive: true });
      try { writeFileSync(join(outRoot, ".gitignore"), "*\n", { flag: "wx" }); } catch (e) {
        if (e?.code !== "EEXIST") return { skipped: `could not write ${join(outRoot, ".gitignore")} (${e?.code ?? "error"}), so git would not ignore the screenshots; pass --out <dir>` };
      }
    }
    const files = [];
    const slices = [];
    const errors = [];
    for (const route of routes) {
      const dir = join(outRoot, routeSlug(route));
      mkdirSync(dir, { recursive: true });
      let broken = false;
      for (const theme of THEMES) {
        if (broken) break;
        for (const [name, viewport] of Object.entries(VIEWPORTS)) {
          const page = await newPage({ viewport, colorScheme: theme, reducedMotion: "reduce" });
          try {
            const res = await page.goto(url + route, { waitUntil: "load" });
            const problem = unreachableFinding("shots", route, res);
            if (problem) {
              errors.push(problem.found);
              broken = true;
              break;
            }
            await waitForReady(page);
            await setTheme(page, theme);
            const file = join(dir, `${theme}-${name}.png`);
            replaceFile(file, await page.screenshot({ fullPage: true })); // maestro patch: by rename
            files.push(file);
            onFile(file);
            const height = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)));
            const count = Math.min(MAX_SLICES, Math.ceil(height / viewport.height));
            if (count > 1) {
              for (let n = 0; n < count; n++) {
                const slice = join(dir, `${routeSlug(route)}-${theme}-${name}-${n + 1}.png`);
                replaceFile(slice, await page.screenshot({ fullPage: true, clip: { x: 0, y: n * viewport.height, width: viewport.width, height: Math.min(viewport.height, height - n * viewport.height) } }));
                slices.push(slice);
                onFile(slice);
              }
            }
          } finally {
            await page.close();
          }
        }
      }
    }
    return { files, slices, errors };
  });
  return result;
}
