import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checksDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === "node_modules" || n === "fixtures" ? [] : modules(p);
  return n.endsWith(".mjs") && !n.endsWith(".tmp.mjs") ? [p] : [];
});

// node --check parses without running, so the CLI entry points (run.mjs, install.mjs, hooks reading stdin) are covered too
test("every module under checks/ parses (a syntax error fails here, not in one check at run time)", () => {
  const all = modules(checksDir);
  assert.ok(all.length > 20, `found only ${all.length} modules`);
  for (const p of all) {
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    assert.equal(r.status, 0, `${p} does not parse: ${r.stderr.split("\n").slice(0, 4).join(" ")}`);
  }
});
