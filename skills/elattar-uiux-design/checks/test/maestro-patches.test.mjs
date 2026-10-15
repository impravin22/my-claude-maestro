// Tests for maestro's local patches to the vendored checks (not upstream). Each patch is
// listed in docs/2026-10-15-viewsonic-uiux-bundle.md; re-apply them, and keep this file,
// when syncing from upstream.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, readdirSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runMjs = join(resolve(here, ".."), "run.mjs");
const onEdit = join(resolve(here, ".."), "eslint", "on-edit.mjs");
const dirs = [];

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), "maestro-patch-"));
  dirs.push(d);
  const project = join(d, "project");
  cpSync(join(here, "fixtures", "consumer"), project, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: project });
  // A folder outside the project, standing in for the user's own files.
  const victim = join(d, "victim");
  mkdirSync(join(victim, "sub"), { recursive: true });
  writeFileSync(join(victim, "thesis.txt"), "mine\n");
  writeFileSync(join(victim, "sub", "keys.txt"), "mine too\n");
  return { project, victim };
}
const install = (d, ...args) => {
  const r = spawnSync(process.execPath, [runMjs, "install", "--cwd", d, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
// Every path and file content under the outside folder: any write, delete or new file shows.
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((rel) => {
  const p = join(dir, rel);
  return lstatSync(p).isDirectory() ? `${rel}/` : `${rel}=${readFileSync(p, "utf8")}`;
});
const BEFORE = ["sub/", "sub/keys.txt=mine too\n", "thesis.txt=mine\n"];
const victimIntact = (victim) => assert.deepEqual(snapshot(victim), BEFORE, "the outside folder is exactly as it was");

after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe("install refuses to write through a symbolic link (maestro patch)", () => {
  test("a committed .viewsonic-ui/checks link to an outside folder: refused, outside files untouched", () => {
    const { project, victim } = sandbox();
    mkdirSync(join(project, ".viewsonic-ui"));
    symlinkSync(victim, join(project, ".viewsonic-ui", "checks"));
    const r = install(project, "--yes");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /Refusing to install: .*\.viewsonic-ui[\\/]checks is a symbolic link/);
    victimIntact(victim);
  });

  test("the dry run reports the refusal too, before anyone says yes", () => {
    const { project, victim } = sandbox();
    symlinkSync(victim, join(project, ".viewsonic-ui"));
    const r = install(project);
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /Refusing to install: .*\.viewsonic-ui is a symbolic link/);
    assert.doesNotMatch(r.out, /Re-run with --yes/);
    victimIntact(victim);
  });

  test("a link deeper inside the vendored folder is refused", () => {
    const { project, victim } = sandbox();
    mkdirSync(join(project, ".viewsonic-ui", "checks"), { recursive: true });
    symlinkSync(victim, join(project, ".viewsonic-ui", "checks", "static"));
    const r = install(project, "--yes");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /checks[\\/]static is a symbolic link/);
    victimIntact(victim);
  });

  test("a linked hook folder, workflow folder or config file is refused", () => {
    const cases = [[".githooks", "folder"], [".github", "folder"], ["viewsonic-ui.config.json", "file"], [".gitattributes", "file"]];
    for (const [target, kind] of cases) {
      const { project, victim } = sandbox();
      symlinkSync(kind === "file" ? join(victim, "thesis.txt") : victim, join(project, target));
      const r = install(project, "--yes");
      assert.equal(r.code, 1, `${target}: ${r.out}${r.err}`);
      assert.match(r.out, /is a symbolic link/, target);
      victimIntact(victim);
    }
  });

  test("a dangling link is refused, and nothing is created at its target", () => {
    const { project, victim } = sandbox();
    symlinkSync(join(victim, "new.txt"), join(project, "viewsonic-ui.config.json"));
    const r = install(project, "--yes");
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.out, /viewsonic-ui\.config\.json is a symbolic link/);
    victimIntact(victim);
  });

  test("a project with no links still installs", () => {
    const { project } = sandbox();
    const r = install(project, "--yes");
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(existsSync(join(project, ".viewsonic-ui", "checks", "run.mjs")));
  });
});

describe("the after-edit check loads project code only at MAESTRO_UIUX_HOOK=full (maestro patch)", () => {
  // A project whose own `typescript` package, if anything requires it, leaves a marker file.
  function plantedProject() {
    const d = mkdtempSync(join(tmpdir(), "maestro-patch-ts-"));
    dirs.push(d);
    mkdirSync(join(d, "components", "ui"), { recursive: true });
    mkdirSync(join(d, "app"), { recursive: true });
    mkdirSync(join(d, "node_modules", "typescript"), { recursive: true });
    writeFileSync(join(d, "package.json"), '{"name":"fixture","private":true}\n');
    writeFileSync(join(d, "components.json"), '{"aliases":{"ui":"@/components/ui"}}\n');
    writeFileSync(join(d, "components", "ui", "button.tsx"),
      'import { cva } from "class-variance-authority";\n' +
      'export const buttonVariants = cva("btn", { variants: { size: { sm: "s", lg: "l" } } });\n' +
      'export function Button({ size }: { size?: "sm" | "lg" }) { return <button className={buttonVariants({ size })} />; }\n');
    writeFileSync(join(d, "app", "page.tsx"), 'import { Button } from "@/components/ui/button";\nexport default function Page() { return <Button size="md" />; }\n');
    const marker = join(d, "project-code-ran");
    writeFileSync(join(d, "node_modules", "typescript", "package.json"), '{"name":"typescript","version":"5.9.3","main":"index.js"}\n');
    writeFileSync(join(d, "node_modules", "typescript", "index.js"), `require("fs").writeFileSync(${JSON.stringify(marker)}, "1"); module.exports = {};\n`);
    return { d, marker };
  }
  const edit = (d, toggle) => {
    const env = { ...process.env };
    if (toggle === undefined) delete env.MAESTRO_UIUX_HOOK; else env.MAESTRO_UIUX_HOOK = toggle;
    const input = JSON.stringify({ cwd: d, tool_name: "Edit", tool_input: { file_path: join(d, "app", "page.tsx") } });
    return spawnSync(process.execPath, [onEdit], { input, env, encoding: "utf8" });
  };

  test("on: the project's typescript is never loaded, and the cva check still flags the variant", () => {
    const { d, marker } = plantedProject();
    const r = edit(d, "on");
    assert.ok(!existsSync(marker), "project code ran at MAESTRO_UIUX_HOOK=on");
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /has no size "md"/);
  });

  test("full: the project's typescript is loaded, as upstream does", () => {
    const { d, marker } = plantedProject();
    edit(d, "full");
    assert.ok(existsSync(marker), "full should load the project's typescript");
  });

  test("unset (run directly, as upstream's own tests do): upstream behaviour", () => {
    const { d, marker } = plantedProject();
    edit(d, undefined);
    assert.ok(existsSync(marker));
  });
});
