import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "fixtures") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const mdFiles = walk(skillDir).filter((f) => f.endsWith(".md"));
const inside = (p) => { const r = relative(skillDir, p); return r && !r.startsWith("..") && !r.includes(`..${sep}`); };

// Relative link targets of a markdown file (no urls, no pure anchors, fenced code ignored).
function links(file) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const out = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const raw = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) continue;
    out.push(raw.split("#")[0]);
  }
  return out;
}

describe("skill shape", () => {
  test("SKILL.md is at most 150 lines", () => {
    assert.ok(readFileSync(join(skillDir, "SKILL.md"), "utf8").split(/\r?\n/).length <= 150);
  });

  test("every relative link in every .md resolves to a file inside the skill", () => {
    for (const f of mdFiles) {
      for (const l of links(f)) {
        const target = resolve(dirname(f), l);
        assert.ok(inside(target), `${relative(skillDir, f)} links outside the skill: ${l}`);
        assert.ok(existsSync(target), `${relative(skillDir, f)} has a broken link: ${l}`);
      }
    }
  });

  test("no markdown file names the repo's rules document, scripts/ or ../../ paths", () => {
    for (const f of mdFiles) {
      const text = readFileSync(f, "utf8");
      assert.doesNotMatch(text, /RULE[S].md|\]\(\.\.\/\.\.\/|npm run (check|verify)/, relative(skillDir, f));
    }
  });

  test("no markdown file carries this repo's internal names", () => {
    const deny = ["platform-contract", "component-docs/", "/design-system/", "docs/audits", "DS_GROUPS", "globals.css", "--port 3100"];
    for (const f of mdFiles) {
      const text = readFileSync(f, "utf8");
      for (const d of deny) assert.ok(!text.includes(d), `${relative(skillDir, f)} mentions ${d}`);
    }
  });

  test("system/traps.md Contents lists every trap, one entry per heading", () => {
    const text = readFileSync(join(skillDir, "system", "traps.md"), "utf8").replace(/\r/g, "");
    const headings = [...text.matchAll(/^## (\d+)\. /gm)].map((m) => +m[1]);
    const contents = text.split(/^## Contents$/m)[1].split(/^## 1\. /m)[0];
    const entries = [...contents.matchAll(/^(\d+)\. \[/gm)].map((m) => +m[1]);
    assert.ok(headings.length > 0);
    assert.deepEqual(entries, headings);
  });

  test("every file in rules/, system/ and patterns/ is reachable from SKILL.md", () => {
    const seen = new Set();
    const queue = [join(skillDir, "SKILL.md")];
    while (queue.length) {
      const f = queue.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      if (!f.endsWith(".md")) continue;
      for (const l of links(f)) {
        const t = resolve(dirname(f), l);
        if (existsSync(t) && statSync(t).isFile()) queue.push(t);
      }
    }
    for (const dir of ["rules", "system", "patterns"]) {
      for (const f of walk(join(skillDir, dir))) {
        assert.ok(seen.has(f), `${relative(skillDir, f)} is not linked from SKILL.md or a file it links`);
      }
    }
  });
});
