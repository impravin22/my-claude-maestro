// Screenshots for the agent's review: light/dark x phone/desktop. Not a check: it never fails a build.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linkOnPath } from "../maestro-guards.mjs";
import { routeSlug, setTheme, THEMES, unreachableFinding, VIEWPORTS, waitForReady, withPages } from "./lib.mjs";

/** A page taller than this many viewports is sliced only this far: past it, the full-page file is the record. */
export const MAX_SLICES = 8;

/** Returns { files, slices, errors } or { skipped }. Beside each full-page PNG that is taller than one viewport, up to
 *  MAX_SLICES viewport-tall slices `<route-slug>-<theme>-<device>-<n>.png`: a tall page downscales too far to judge whole.
 *  Default output: <root>/.viewsonic-ui/shots/<route-slug>/<theme>-<viewport>.png */
export async function shots(config, { routes, base, out, allowRemote = false, onFile = () => {} } = {}) {
  const outRoot = out ? resolve(out) : join(config.root, ".viewsonic-ui", "shots");
  // maestro patch (not upstream): the default folder is in the repository, so it must not be a committed
  // link out of it, and it ignores itself, so a signed-in page's screenshots are never committed by accident.
  if (!out) {
    const problem = linkOnPath(config.root, ".viewsonic-ui/shots", "dir");
    if (problem) return { skipped: `refusing to write screenshots: ${problem}; replace it with a real folder, or pass --out <dir>` };
    mkdirSync(outRoot, { recursive: true });
    try { writeFileSync(join(outRoot, ".gitignore"), "*\n", { flag: "wx" }); } catch { /* already there */ }
  }
  const result = await withPages(config, { base, allowRemote }, async (newPage, _browser, url) => {
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
            await page.screenshot({ path: file, fullPage: true });
            files.push(file);
            onFile(file);
            const height = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)));
            const count = Math.min(MAX_SLICES, Math.ceil(height / viewport.height));
            if (count > 1) {
              for (let n = 0; n < count; n++) {
                const slice = join(dir, `${routeSlug(route)}-${theme}-${name}-${n + 1}.png`);
                await page.screenshot({ path: slice, fullPage: true, clip: { x: 0, y: n * viewport.height, width: viewport.width, height: Math.min(viewport.height, height - n * viewport.height) } });
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
