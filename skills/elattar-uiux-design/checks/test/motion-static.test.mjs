import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const fx = join(here, "fixtures", "motion");
const { loadConfig } = await import(pathToFileURL(join(checksDir, "config.mjs")).href);
const { run, RULE_IDS } = await import(pathToFileURL(join(checksDir, "static", "motion.mjs")).href);

const GOOD_ROWS = [
  { component: "components/panel.tsx", in: "anim-enter", idle: "N/A: rests static", out: "anim-exit" },
  { component: "components/orphan.tsx", in: "anim-enter", idle: "N/A: rests static", out: "anim-exit" },
  { component: "components/springy.tsx", in: "N/A: spring set in JS", idle: "N/A: rests static", out: "N/A: never leaves" },
];
let base;
before(async () => { base = await loadConfig(fx); });
const withRows = (rows) => ({ ...base, motionPhases: rows });
const panel = (over) => [{ ...GOOD_ROWS[0], ...over }, GOOD_ROWS[1], GOOD_ROWS[2]];
const rules = (f) => f.map((x) => x.rule).sort();

describe("motion-static", () => {
  test("good rows: no findings; the ui folder needs no row", async () => {
    assert.deepEqual(await run(withRows(GOOD_ROWS)), []);
  });
  test("no-phase-row: an animated file outside the ui folder without a row, for each of anim-, useSpring( and <motion.", async () => {
    const f = await run(withRows([GOOD_ROWS[0]]));
    assert.deepEqual(f.map((x) => x.file).sort(), ["components/orphan.tsx", "components/springy.tsx"]);
    for (const x of f) {
      assert.equal(x.rule, "no-phase-row");
      assert.equal(x.check, "motion-static");
      assert.ok(x.line >= 1);
      assert.match(x.fix, /motionPhases/);
    }
  });
  test("a comment that names anim-enter does not make a file animated", async () => {
    const f = await run(withRows(GOOD_ROWS));
    assert.ok(!f.some((x) => x.file === "components/quiet.tsx"));
  });
  test("<motion. is recognised", async () => {
    const { animated } = await import(pathToFileURL(join(checksDir, "static", "motion.mjs")).href);
    assert.ok(animated("<motion.div animate={{}} />"));
    assert.ok(animated('className="anim-enter"'));
    assert.ok(animated("const x = useSpring(0)"));
    assert.ok(!animated("// anim-enter\nconst a = 1"));
  });
  test("unknown-phase: a name that is not an @utility in the stylesheets, or not a name at all", async () => {
    const f = await run(withRows(panel({ in: "anim-nope", out: "plain words" })));
    assert.deepEqual(rules(f), ["unknown-phase", "unknown-phase"]);
    assert.match(f.map((x) => x.found).join(" | "), /anim-nope/);
  });
  test("incomplete-row: a missing phase or an N/A without a reason", async () => {
    const f = await run(withRows(panel({ idle: undefined, out: "N/A:" })));
    assert.deepEqual(rules(f), ["incomplete-row", "incomplete-row"]);
  });
  test("stale-row: the component file is gone", async () => {
    const f = await run(withRows([...GOOD_ROWS, { component: "components/gone.tsx", in: "anim-enter", idle: "N/A: still", out: "anim-exit" }]));
    assert.deepEqual(rules(f), ["stale-row"]);
  });
  test("phase-break: in ends where idle does not start", async () => {
    const f = await run(withRows(panel({ idle: "anim-pulse-low" })));
    assert.deepEqual(rules(f), ["phase-break"]);
    assert.match(f[0].found, /opacity/);
    assert.deepEqual(await run(withRows(panel({ idle: "anim-pulse" }))), []);
  });
  test("phase-break: with no idle animation, in must end where out starts", async () => {
    const f = await run(withRows(panel({ in: "anim-half-enter" })));
    assert.deepEqual(rules(f), ["phase-break"]);
  });
  test("a reverse direction plays the keyframes backwards: enter then its own reverse is continuous", async () => {
    assert.deepEqual(await run(withRows(panel({ out: "anim-fold" }))), []);
  });
  test("slow-exit: out duration read from its --duration-* token is longer than in", async () => {
    const f = await run(withRows(panel({ in: "anim-half-enter", idle: "N/A: x", out: "anim-exit-slow" })));
    assert.ok(f.some((x) => x.rule === "slow-exit" && /400ms.*150ms|150ms/.test(x.found)), JSON.stringify(f));
    assert.deepEqual(rules(await run(withRows(panel({})))), []);
  });
  test("untokenised-phase: a duration literal in the phase utility", async () => {
    const f = await run(withRows(panel({ in: "anim-literal" })));
    assert.ok(f.some((x) => x.rule === "untokenised-phase" && x.found.includes("anim-literal")), JSON.stringify(f));
  });
  test("changes are checked too", async () => {
    const f = await run(withRows(panel({ changes: ["anim-nope"] })));
    assert.deepEqual(rules(f), ["unknown-phase"]);
  });
  test("componentCss: a plain class in a component stylesheet is a known phase", async () => {
    const rows = panel({ in: "anim-intro" });
    assert.deepEqual(rules(await run(withRows(rows))), ["unknown-phase"]);
    assert.deepEqual(rules(await run({ ...withRows(rows), componentCss: ["styles/component.css"] })), []);
  });
  test("every rule id is declared", () => {
    assert.deepEqual([...RULE_IDS].sort(), ["incomplete-row", "no-phase-row", "phase-break", "slow-exit", "stale-row", "unknown-phase", "untokenised-phase"]);
  });
});
