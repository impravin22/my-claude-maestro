import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(resolve(here, "..", "..", "system", "motion.md"), "utf8");

// The recipe's state machine is tested as the very source the doc carries.
const src = /\/\/ reducer:start\n([\s\S]*?)\/\/ reducer:end/.exec(md)?.[1];

describe("system/motion.md presence recipe", () => {
  test("the doc carries the reducer source and the hook uses it", () => {
    assert.ok(src, "reducer markers");
    assert.match(md, /setState\(nextPresence\(state, open\)\)/);
  });
  test("tokenMs resolves through a probe and never returns NaN", () => {
    assert.match(md, /transitionDuration = `var\(\$\{name\}\)`/);
    assert.match(md, /Number\.isFinite\(ms\)/);
    assert.match(md, /console\.warn/);
  });
  test("state machine: open mounts in enter; close keeps it mounted in exit; re-open during exit continues as idle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-presence-"));
    try {
      const file = join(dir, "reducer.mts");
      writeFileSync(file, `type PresencePhase = "enter" | "idle" | "exit";\ntype PresenceState = { mounted: boolean; phase: PresencePhase };\n${src}`);
      const { nextPresence } = await import(pathToFileURL(file).href);
      assert.deepEqual(nextPresence({ mounted: false, phase: "exit" }, true), { mounted: true, phase: "enter" });
      assert.deepEqual(nextPresence({ mounted: true, phase: "idle" }, false), { mounted: true, phase: "exit" });
      assert.deepEqual(nextPresence({ mounted: true, phase: "exit" }, true), { mounted: true, phase: "idle" });
      assert.deepEqual(nextPresence({ mounted: true, phase: "enter" }, false), { mounted: true, phase: "exit" });
      assert.deepEqual(nextPresence({ mounted: false, phase: "exit" }, false), { mounted: false, phase: "exit" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
