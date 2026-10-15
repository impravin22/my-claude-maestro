// Tests for maestro's local patches to the vendored checks (not upstream). Each patch is
// listed in docs/2026-10-15-viewsonic-uiux-bundle.md; re-apply them, and keep this file,
// when syncing from upstream.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runMjs = join(resolve(here, ".."), "run.mjs");
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
const victimIntact = (victim) => {
  assert.equal(readFileSync(join(victim, "thesis.txt"), "utf8"), "mine\n");
  assert.equal(readFileSync(join(victim, "sub", "keys.txt"), "utf8"), "mine too\n");
  assert.ok(!existsSync(join(victim, "run.mjs")), "nothing was copied into the victim folder");
};

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

  test("a project with no links still installs", () => {
    const { project } = sandbox();
    const r = install(project, "--yes");
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(existsSync(join(project, ".viewsonic-ui", "checks", "run.mjs")));
  });
});
