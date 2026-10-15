import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");
const evalsDir = join(skillDir, "evals");
const data = JSON.parse(readFileSync(join(evalsDir, "evals.json"), "utf8"));

describe("evals", () => {
  test("matches skill-creator's evals.json shape", () => {
    const skillName = /^name:\s*(.+)$/m.exec(readFileSync(join(skillDir, "SKILL.md"), "utf8"))[1].trim();
    assert.equal(data.skill_name, skillName);
    assert.ok(Array.isArray(data.evals));
    const ids = new Set();
    for (const e of data.evals) {
      assert.ok(Number.isInteger(e.id) && !ids.has(e.id), `unique integer id: ${e.id}`);
      ids.add(e.id);
      assert.equal(typeof e.prompt, "string");
      assert.ok(e.prompt.length > 20);
      assert.equal(typeof e.expected_output, "string");
      assert.ok(Array.isArray(e.files));
      assert.ok(Array.isArray(e.expectations));
      for (const x of e.expectations) assert.equal(typeof x, "string");
    }
  });

  test("has at least 10 evals, each with at least one objective assertion", () => {
    assert.ok(data.evals.length >= 10);
    for (const e of data.evals) assert.ok(e.expectations.length >= 1, `eval ${e.id} has no assertion`);
  });

  test("every eval asserts run.mjs full, the design pass, screenshots and the no-new-token rule", () => {
    for (const e of data.evals) {
      const all = e.expectations.join("\n");
      assert.match(all, /run\.mjs` full|run\.mjs full/, `eval ${e.id}`);
      assert.match(all, /design-pass/i, `eval ${e.id}`);
      assert.match(all, /screenshots/i, `eval ${e.id}`);
      assert.match(all, /without asking/i, `eval ${e.id}`);
    }
  });

  test("carried prompts exist: failed data call and creative direction", () => {
    const failed = data.evals.find((e) => e.name === "failed-data-call");
    assert.ok(failed, "failed data call eval");
    assert.match(failed.expectations.join("\n"), /raw error/i);
    const creative = data.evals.find((e) => e.name === "creative-direction");
    assert.ok(creative, "creative direction eval");
    assert.match(creative.expectations.join("\n"), /patterns\/.*(not|No file)|No file under `patterns\/`/);
  });

  test("README and rubric exist, README keeps its Results section, rubric links resolve", () => {
    const readme = readFileSync(join(evalsDir, "README.md"), "utf8");
    assert.match(readme, /## Results/);
    assert.match(readme, /Pending: filled after the first eval run\./);
    const rubric = readFileSync(join(evalsDir, "rubric.md"), "utf8");
    for (const f of ["foundations", "secondary", "content", "accessibility", "ux"]) {
      const rel = `../rules/${f}.md`;
      assert.ok(rubric.includes(`(${rel})`), `rubric links ${rel}`);
      assert.ok(existsSync(resolve(evalsDir, rel)), `${rel} exists`);
    }
    assert.ok(rubric.includes("(evals.json)") && existsSync(join(evalsDir, "evals.json")));
  });
});
