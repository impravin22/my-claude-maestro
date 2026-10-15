import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_CHECKS, BROWSER_CHECKS } from "../registry.mjs";
import { RULE_IDS as TOKEN_IDS, EXTRA_RULE_IDS } from "../static/tokens.mjs";
import { RULE_IDS as REFS_IDS } from "../static/refs.mjs";
import { CATEGORIES } from "../static/rules.mjs";
import { RULE_IDS as MOTION_STATIC_IDS } from "../static/motion.mjs";
import { RULE_IDS as MOTION_IDS } from "../browser/motion.mjs";
import { RULE_IDS as CONTENT_IDS } from "../static/content.mjs";
import { RULE_IDS as KEYBOARD_IDS } from "../browser/keyboard.mjs";
import { RULE_IDS as UX_IDS } from "../static/ux.mjs";
import { RULE_IDS as UX_FLOW_IDS } from "../browser/ux.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");
const map = readFileSync(join(skillDir, "checks", "map.md"), "utf8");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const has = (id) => map.includes(`\`${id}\``);

describe("checks/map.md", () => {
  test("names every tokens rule id", () => {
    for (const id of [...TOKEN_IDS, ...EXTRA_RULE_IDS]) assert.ok(has(id), `missing ${id}`);
  });
  test("names every rules category", () => {
    for (const c of CATEGORIES) assert.ok(has(c), `missing ${c}`);
  });
  test("names every refs rule id", () => {
    for (const id of REFS_IDS) assert.ok(has(id), `missing ${id}`);
  });
  test("names every registered check", () => {
    for (const c of [...STATIC_CHECKS, ...BROWSER_CHECKS]) assert.ok(has(c.name), `missing check ${c.name}`);
  });
  test("names every run.mjs mode", () => {
    for (const m of ["fast", "full", "install", "config"]) assert.ok(has(m), `missing mode ${m}`);
  });
  test("SKILL.md points at the map and asks before adding a value", () => {
    assert.ok(skill.includes("checks/map.md"));
    assert.ok(skill.includes("Ask before adding a new value"));
  });
  test("map says no check catches an unasked new token", () => {
    assert.match(map, /Ask before adding a new value/);
  });
});

describe("the 7 foundations", () => {
  const foundations = readFileSync(join(skillDir, "rules", "foundations.md"), "utf8");
  const NAMES = ["Alignment", "Contrast", "Balance", "Hierarchy", "Colour", "White space", "Proximity"];
  test("rules/foundations.md has exactly the seven sections, in order", () => {
    const heads = [...foundations.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    assert.deepEqual(heads, NAMES);
  });
  test("every section has Rule, Why, System tool and Judge it", () => {
    const sections = foundations.split(/^## /m).slice(1);
    for (const s of sections) {
      for (const part of ["**Rule.**", "**Why.**", "**System tool.**", "**Judge it.**"]) {
        assert.ok(s.includes(part), `${s.split("\n")[0]} lacks ${part}`);
      }
    }
  });
  test("the grouping example is generic, not the image/title/price/button card", () => {
    assert.doesNotMatch(foundations, /\bprice\b|buy button/i);
  });
  test("SKILL.md has a Design pass (thirteen lines, no build) and a screenshot Review using shots", () => {
    assert.match(skill, /## 5\. Design pass/);
    assert.match(skill, /No thirteen lines, no build/);
    assert.match(skill, /## 8\. Review/);
    assert.match(skill, /Screenshot review/);
    assert.match(skill, /checks\/run\.mjs shots/);
    assert.match(skill, /rules\/foundations\.md/);
    assert.match(skill, /never judged by eye/);
  });
  test("SKILL.md keeps nine numbered steps and stays within 150 lines", () => {
    assert.deepEqual([...skill.matchAll(/^## (\d+)\./gm)].map((m) => +m[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(skill.split("\n").length <= 150);
  });
  test("every command the foundations name exists as a mode", () => {
    for (const m of ["contrast", "contrast-rendered", "shots", "rules", "tokens", "title-scale"]) assert.ok(map.includes(`\`${m}`), `map lacks ${m}`);
    for (const m of foundations.matchAll(/run\.mjs ([a-z-]+)/g)) {
      assert.ok(["contrast", "contrast-rendered", "shots", "rules", "tokens", "title-scale"].includes(m[1]), `unknown mode ${m[1]}`);
    }
  });
});

describe("the 6 secondary rules", () => {
  const secondary = readFileSync(join(skillDir, "rules", "secondary.md"), "utf8");
  test("rules/secondary.md has the six sections, in order, each with Rule, Why, System tool, Judge it", () => {
    const heads = [...secondary.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    assert.deepEqual(heads, ["Movement", "Proportion", "Repetition", "Rhythm", "Emphasis", "Unity"]);
    for (const s of secondary.split(/^## /m).slice(1)) {
      for (const part of ["**Rule.**", "**Why.**", "**System tool.**", "**Judge it.**"]) assert.ok(s.includes(part), `${s.split("\n")[0]} lacks ${part}`);
    }
  });
  test("Movement carries all eight continuity points and the timing", () => {
    const m = secondary.split(/^## /m).find((s) => s.startsWith("Movement"));
    assert.equal([...m.matchAll(/^[1-8]\. /gm)].length, 8);
    assert.match(m, /feedback about 100ms/);
  });
  test("no owner examples in the secondary rules", () => {
    assert.doesNotMatch(secondary, /\bprice\b|buy button|check mark|loader/i);
  });
  test("every command the secondary rules name is a registered mode and is in the map", () => {
    const names = [...STATIC_CHECKS, ...BROWSER_CHECKS].map((c) => c.name);
    for (const m of secondary.matchAll(/run\.mjs ([a-z-]+)/g)) {
      assert.ok(names.includes(m[1]), `unknown mode ${m[1]}`);
      assert.ok(map.includes(`\`${m[1]}\``), `map lacks ${m[1]}`);
    }
    for (const c of ["layout-shift", "rhythm", "emphasis"]) assert.ok(secondary.includes(`run.mjs ${c}`), c);
  });
  test("SKILL.md routes to rules/secondary.md and asks for thirteen lines", () => {
    assert.match(skill, /rules\/secondary\.md/);
    assert.match(skill, /thirteen in all/);
  });
});

describe("movement: continuity", () => {
  const motion = readFileSync(join(skillDir, "system", "motion.md"), "utf8");
  const secondary = readFileSync(join(skillDir, "rules", "secondary.md"), "utf8");
  const ids = [...MOTION_STATIC_IDS, ...MOTION_IDS];
  test("map names every motion-static and motion rule id", () => {
    for (const id of ids) assert.ok(has(id), `map lacks ${id}`);
  });
  test("system/motion.md names every rule id the two checks can fire", () => {
    for (const id of ids.filter((i) => i !== "route-unreachable")) assert.ok(motion.includes("`" + id + "`"), `motion.md lacks ${id}`);
  });
  test("system/motion.md has the phase-row schema, the fix order and the presence recipe with full code", () => {
    for (const f of ["component", "specimen", "trigger", "dismiss", "target", "swap", "changes"]) assert.ok(motion.includes("| `" + f + "`"), `schema lacks ${f}`);
    assert.ok(motion.includes("| `in` / `idle` / `out`"));
    assert.match(motion, /Use the project's `usePresence` if it exists/);
    assert.match(motion, /export function usePresence\(open: boolean, exitMs: number\)/);
    assert.match(motion, /PresenceState = { mounted: boolean; phase: PresencePhase }/);
    const order = ["**Presence.**", "**Transition instead of reversible keyframes.**", "**Align keyframe endpoints**", "**Ask**"].map((s) => motion.indexOf(s));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "fix order");
  });
  test("system/motion.md prose hard-codes no easing", () => {
    const prose = motion.replace(/```[\s\S]*?```/g, "");
    assert.doesNotMatch(prose, /cubic-bezier/);
    assert.doesNotMatch(motion, /\bprice\b|buy button|check mark|loader/i);
  });
  test("Movement names both motion commands and the doc", () => {
    const m = secondary.split(/^## /m).find((s) => s.startsWith("Movement"));
    assert.ok(m.includes("run.mjs motion-static") && m.includes("run.mjs motion`"));
    assert.ok(m.includes("system/motion.md"));
  });
  test("SKILL.md routes to system/motion.md", () => {
    assert.match(skill, /system\/motion\.md/);
  });
});

describe("content", () => {
  const content = readFileSync(join(skillDir, "rules", "content.md"), "utf8");
  test("map names every content rule id and the check", () => {
    for (const id of CONTENT_IDS) assert.ok(has(id), `map lacks ${id}`);
    assert.ok(has("content"));
  });
  test("rules/content.md names every content rule id", () => {
    for (const id of CONTENT_IDS) assert.ok(content.includes("`" + id + "`"), `content.md lacks ${id}`);
  });
  test("SKILL.md routes to rules/content.md, asks the content question at Review and keeps 9 steps within 150 lines", () => {
    assert.match(skill, /rules\/content\.md/);
    const review = /## 8\.[^\n]*\n([\s\S]*?)\n## 9\./.exec(skill)[1];
    assert.match(review, /every word on the screen/);
    assert.match(review, /next step/);
    const design = /## 5\.[^\n]*\n([\s\S]*?)\n## 6\./.exec(skill)[1];
    assert.match(design, /content intent/);
    assert.ok(skill.split("\n").length <= 150);
    assert.equal(skill.split("\n").filter((l) => /^## \d+\./.test(l)).length, 9);
  });
});

describe("keyboard and screen reader", () => {
  const a11y = readFileSync(join(skillDir, "rules", "accessibility.md"), "utf8");
  const ids = KEYBOARD_IDS.filter((id) => id !== "route-unreachable");
  test("map names every keyboard rule id and the check", () => {
    for (const id of [...ids, "keyboard"]) assert.ok(has(id), `map lacks ${id}`);
  });
  test("rules/accessibility.md names every keyboard rule id", () => {
    for (const id of ids) assert.ok(a11y.includes("`" + id + "`"), `accessibility.md lacks ${id}`);
  });
  test("SKILL.md routes to rules/accessibility.md, asks accessibility intent at the Design pass and a keyboard walk at Review", () => {
    assert.match(skill, /rules\/accessibility\.md/);
    const design = /## 5\.[^\n]*\n([\s\S]*?)\n## 6\./.exec(skill)[1];
    assert.match(design, /accessibility intent/);
    const review = /## 8\.[^\n]*\n([\s\S]*?)\n## 9\./.exec(skill)[1];
    assert.match(review, /keyboard walk/);
    assert.match(review, /checks\/run\.mjs keyboard/);
    assert.ok(skill.split("\n").length <= 150);
    assert.equal(skill.split("\n").filter((l) => /^## \d+\./.test(l)).length, 9);
  });
  test("every command accessibility.md names is a registered check", () => {
    for (const m of a11y.matchAll(/run\.mjs (\w[\w-]*)/g)) assert.ok(has(m[1]), `${m[1]} is not in the map`);
  });
});

describe("the 24 UX rules", () => {
  const ux = readFileSync(join(skillDir, "rules", "ux.md"), "utf8");
  const sections = ux.split(/^## /m).slice(1);
  const ids = [...UX_IDS, ...UX_FLOW_IDS].filter((id) => id !== "route-unreachable");
  test("rules/ux.md has twenty-four numbered sections, each with Rule, Why and Judge it", () => {
    const heads = [...ux.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => +m[1]);
    assert.deepEqual(heads, Array.from({ length: 24 }, (_, i) => i + 1));
    assert.equal(sections.length, 24);
    for (const s of sections) for (const part of ["**Rule.**", "**Why.**", "**Judge it.**"]) assert.ok(s.includes(part), `${s.split("\n")[0]} lacks ${part}`);
  });
  test("the owner's wording of rules 4, 11 and 16 is kept", () => {
    const at = (n) => sections.find((s) => s.startsWith(n + ". "));
    assert.match(at(4), /No system words, real-world conventions/);
    assert.match(at(4), /Would the user say these words\?/);
    assert.match(at(11), /Minimum 24×24 \(WCAG 2\.5\.8\) for every target.*Never meet a size target by overriding components.*Frequent actions sit where attention already is, next to what they affect/);
    assert.match(at(11), /keyboard\/small-target/);
    assert.match(at(16), /No error codes, exception text, `error\.message` or server responses on screen\. The user always gets a human message: what happened in their terms, and what they can do next/);
    assert.match(at(16), /content\/vague-error/);
  });
  test("every ux and ux-flow rule id is named in ux.md and in the map; both checks are in the map", () => {
    for (const id of ids) { assert.ok(ux.includes("`" + id + "`"), `ux.md lacks ${id}`); assert.ok(has(id), `map lacks ${id}`); }
    assert.ok(has("ux") && has("ux-flow") && has("allowSystemWords"));
  });
  test("every command ux.md names is a registered check", () => {
    const names = [...STATIC_CHECKS, ...BROWSER_CHECKS].map((c) => c.name);
    for (const m of ux.matchAll(/run\.mjs ([a-z-]+)/g)) assert.ok(names.includes(m[1]), `${m[1]} is not a check`);
  });
  test("no rule is judged by a check id that does not exist", () => {
    for (const m of ux.matchAll(/`(?:ux|keyboard)\/([a-z-]+)`/g)) assert.ok([...KEYBOARD_IDS, ...ids].includes(m[1]), `unknown id ${m[1]}`);
  });
  test("no owner examples in the UX rules", () => {
    assert.doesNotMatch(ux, /twitter|youtube|buy button|price card|\bprice\b/i);
  });
  test("SKILL.md routes to rules/ux.md at the Design pass and the Review, and keeps 9 steps within 150 lines", () => {
    assert.match(skill, /rules\/ux\.md/);
    const design = /## 5\.[^\n]*\n([\s\S]*?)\n## 6\./.exec(skill)[1];
    assert.match(design, /rules\/ux\.md/);
    const review = /## 8\.[^\n]*\n([\s\S]*?)\n## 9\./.exec(skill)[1];
    assert.match(review, /rules\/ux\.md/);
    assert.match(review, /Review\*\* question/);
    assert.match(review, /checks\/run\.mjs ux-flow/);
    assert.ok(skill.split("\n").length <= 150);
    assert.equal(skill.split("\n").filter((l) => /^## \d+\./.test(l)).length, 9);
  });
});
