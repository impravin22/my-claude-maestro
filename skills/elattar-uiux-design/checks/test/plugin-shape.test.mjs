// Adapted for the maestro bundle. Upstream (FDP-design-system) ships this skill as its
// own plugin under plugins/elattar-uiux-design/; maestro bundles it as a second skill of
// the maestro plugin, so the plugin root is two levels above the skill, the marketplace
// sits at that same root with source "./", the four commands are commands/uiux-*.md,
// and the after-edit hook runs through hooks/uiux-on-edit.sh. Every assertion upstream
// makes is kept; only the paths and names they point at changed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");
const pluginDir = resolve(skillDir, "..", "..");
const repoRoot = pluginDir;
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const CHECK = "skills/elattar-uiux-design/checks/eslint/on-edit.mjs";
const COMMANDS = ["uiux-check-full.md", "uiux-check.md", "uiux-review.md", "uiux-setup.md"];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("plugin shape", () => {
  test("hooks/hooks.json runs on-edit.mjs after Edit, Write and MultiEdit through ${CLAUDE_PLUGIN_ROOT}", () => {
    const h = readJson(join(pluginDir, "hooks", "hooks.json"));
    const entry = h.hooks.PostToolUse.find((e) => e.hooks.some((x) => x.command.includes("uiux-on-edit.sh")));
    assert.ok(entry, "no PostToolUse entry runs hooks/uiux-on-edit.sh");
    for (const tool of ["Edit", "Write", "MultiEdit"]) assert.ok(new RegExp(`^(?:${entry.matcher})$`).test(tool), tool);
    const cmd = entry.hooks[0].command;
    assert.equal(entry.hooks[0].type, "command");
    assert.ok(cmd.includes("${CLAUDE_PLUGIN_ROOT}"));
    const target = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/)[1];
    assert.ok(existsSync(join(pluginDir, target)), `${target} exists`);
    // The assignment line itself, not the header comment that names the same path.
    assert.match(readFileSync(join(pluginDir, target), "utf8"), new RegExp(`^CHECK="\\$CLAUDE_PLUGIN_ROOT/${CHECK}"$`, "m"), `${target} runs ${CHECK}`);
    assert.ok(existsSync(join(pluginDir, CHECK)), `${CHECK} exists`);
  });

  test("plugin.json parses and bundles the skill", () => {
    const m = readJson(join(pluginDir, ".claude-plugin", "plugin.json"));
    assert.equal(m.name, "maestro");
    assert.match(m.version, /^\d+\.\d+\.\d+$/);
    assert.ok(m.description);
    assert.ok(existsSync(join(pluginDir, "skills", "elattar-uiux-design", "SKILL.md")));
  });

  test("marketplace.json lists the plugin with an existing source", () => {
    const mk = readJson(join(repoRoot, ".claude-plugin", "marketplace.json"));
    assert.ok(mk.name && mk.owner?.name);
    const entry = mk.plugins.find((p) => p.name === "maestro");
    assert.ok(entry, "plugin not listed");
    assert.ok(existsSync(resolve(repoRoot, entry.source, ".claude-plugin", "plugin.json")));
  });

  test("SKILL.md frontmatter name and description", () => {
    const text = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(fm, "no frontmatter");
    assert.match(fm[1], /^name:\s*elattar-uiux-design\s*$/m);
    assert.match(fm[1], /^description:\s*\S+/m);
  });

  test("SKILL.md has the nine steps and no TODO/TBD", () => {
    const text = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    const heads = [...text.matchAll(/^## (?:\d+\.\s*)?(.+)$/gm)].map((m) => m[1].trim());
    assert.equal(heads.length, 9, heads.join(" | "));
    assert.ok(text.split(/\r?\n/).length <= 150);
    assert.doesNotMatch(text, /\b(TODO|TBD)\b/);
  });

  test("nothing in the skill or its commands references paths outside them", () => {
    const banned = ["../../..", "RULES.md", "scripts/check-", ".claude/skills/"];
    const self = join(here, "plugin-shape.test.mjs");
    const files = [...walk(skillDir), ...COMMANDS.map((f) => join(pluginDir, "commands", f))];
    for (const f of files) {
      if (f === self || !/\.(md|mjs)$/.test(f)) continue;
      const text = readFileSync(f, "utf8");
      for (const b of banned) assert.ok(!text.includes(b), `${f} references ${b}`);
    }
  });

  test("exactly four uiux commands, each with a description that runs checks/run.mjs", () => {
    const dir = join(pluginDir, "commands");
    const files = readdirSync(dir).filter((f) => f.startsWith("uiux-")).sort();
    assert.deepEqual(files, COMMANDS);
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      assert.ok(fm, `${f}: no frontmatter`);
      assert.match(fm[1], /^description:\s*\S+/m, `${f}: no description`);
      assert.ok(text.includes("${CLAUDE_PLUGIN_ROOT}/skills/elattar-uiux-design/checks/run.mjs"), `${f}: does not run run.mjs via CLAUDE_PLUGIN_ROOT`);
      if (f !== "uiux-setup.md") assert.match(text, /Do not change any file/, `${f}: must say it changes no file`);
      // With no tools pre-approved, this line and the permission prompt are the only gates before `install --yes`.
      else assert.match(text, /Only after the user says yes, run it again with `--yes`\./, `${f}: must wait for a yes before --yes`);
    }
  });
});
