import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseColour, luminance, ratio, verdict, resolveTheme, PAIRS, checkPairs, suggest, run,
} from "../static/contrast.mjs";
import { STATIC_CHECKS } from "../registry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(here, "fixtures", "contrast", n), "utf8");
const runMjs = resolve(here, "..", "run.mjs");

describe("contrast maths (WCAG 2.2)", () => {
  test("black on white is 21:1", () => {
    assert.ok(Math.abs(ratio(parseColour("#000"), parseColour("#fff")) - 21) < 0.05);
    assert.ok(luminance(parseColour("#fff")) > 0.99);
  });
  test("#777 on white is 4.48:1 - fails text, passes large", () => {
    const r = ratio(parseColour("#777"), parseColour("#fff"));
    assert.ok(Math.abs(r - 4.48) < 0.005, String(r));
    assert.equal(verdict(r, "text"), "BAD");
    assert.equal(verdict(r, "large"), "GOOD");
    assert.equal(verdict(r, "ui"), "GOOD");
  });
  test("is symmetric", () => {
    const a = parseColour("hsl(217 91% 53%)"), b = parseColour("#fff");
    assert.ok(Math.abs(ratio(a, b) - ratio(b, a)) < 1e-6);
  });
  test("composites a translucent foreground onto its surface", () => {
    assert.ok(ratio(parseColour("rgb(0 0 0 / 0.5)"), parseColour("#fff")) < 21);
  });
});

describe("parseColour syntaxes", () => {
  const same = (a, b, tol = 1.5) => {
    const x = parseColour(a), y = parseColour(b);
    for (const k of ["r", "g", "b"]) assert.ok(Math.abs(x[k] - y[k]) <= tol, `${a} vs ${b} (${k}: ${x[k]} ${y[k]})`);
    assert.ok(Math.abs(x.a - y.a) < 0.01);
  };
  test("hex 3/4/6/8", () => {
    same("#abc", "#aabbcc");
    assert.ok(Math.abs(parseColour("#00000080").a - 0.502) < 0.01);
    assert.ok(Math.abs(parseColour("#0008").a - 0.533) < 0.01);
  });
  test("rgb comma and space, alpha and percentages", () => {
    same("rgb(10, 20, 30)", "rgb(10 20 30)");
    same("rgba(10,20,30,0.5)", "rgb(10 20 30 / 50%)");
    same("rgb(100% 0% 0%)", "#f00");
  });
  test("hsl comma and space, alpha", () => {
    same("hsl(0 100% 50%)", "#f00");
    same("hsla(120, 100%, 25%, 0.4)", "hsl(120 100% 25% / 0.4)");
    same("hsl(240 4% 40%)", "hsl(240, 4%, 40%)");
  });
  test("oklch and oklab", () => {
    same("oklch(1 0 0)", "#fff");
    same("oklch(0 0 0)", "#000");
    same("oklab(1 0 0)", "#fff");
    same("oklch(62.8% 0.2577 29.23)", "#f00", 3);
  });
  test("color-mix in srgb and oklab, with transparent", () => {
    same("color-mix(in srgb, #fff 50%, #000)", "rgb(127.5 127.5 127.5)");
    same("color-mix(in oklab, #fff, #fff)", "#fff");
    const m = parseColour("color-mix(in oklab, #3366ff 40%, transparent)");
    assert.ok(Math.abs(m.a - 0.4) < 0.01);
  });
  test("relative oklch", () => {
    same("oklch(from #fff l c h)", "#fff");
    same("oklch(from #888 0.5 calc(c * 0.4) h)", "oklch(0.5 0 0)", 2);
  });
  test("unparseable throws", () => {
    assert.throws(() => parseColour("lch(50% 10 10)"), /unparseable colour/);
    assert.throws(() => parseColour("var(--nope)"), /unparseable colour/);
  });
});

describe("resolveTheme", () => {
  test("light/dark blocks, @media :root, @theme, nested braces, var chains", () => {
    const light = resolveTheme(fx("good.css"), "light");
    const dark = resolveTheme(fx("good.css"), "dark");
    assert.equal(light.get("--background"), "hsl(0 0% 100%)");
    assert.equal(dark.get("--background"), "hsl(240 10% 3.9%)");
    assert.equal(light.get("--action-ink"), "hsl(224 76% 33%)");
    assert.match(dark.get("--action-ink"), /^color-mix\(/);
    assert.equal(light.get("--text-body"), "1rem");
    assert.equal(dark.get("--color-brand"), "hsl(224 76% 33%)");
    assert.equal(light.get("--missing"), undefined);
  });
  test("var() with fallback, inside a larger value", () => {
    const css = ":root{--a: var(--b, #123456);--c: color-mix(in srgb, var(--a) 50%, #fff);} .dark{--b:#fff;}";
    assert.equal(resolveTheme(css, "light").get("--a"), "#123456");
    assert.equal(resolveTheme(css, "dark").get("--a"), "#fff");
    assert.equal(resolveTheme(css, "light").get("--c"), "color-mix(in srgb, #123456 50%, #fff)");
  });
  test("comments are ignored; prefers-color-scheme: dark :root is dark", () => {
    const css = "/* :root{--x:#000} */ :root{--x:#111} @media (prefers-color-scheme: dark){ :root{--x:#222} }";
    assert.equal(resolveTheme(css, "light").get("--x"), "#111");
    assert.equal(resolveTheme(css, "dark").get("--x"), "#222");
  });
  test("where() reports the declaring file and line", () => {
    const t = resolveTheme([{ file: "a.css", text: ":root{\n--x:#111;\n}" }], "light");
    assert.deepEqual(t.where("--x"), { file: "a.css", line: 2 });
  });
});

describe("checkPairs / suggest", () => {
  const goodPairs = [
    { fg: "--foreground", bg: "--background", kind: "text" },
    { fg: "--muted-foreground", bg: "--muted", kind: "text" },
    { fg: "--action-ink", bg: "--background", kind: "text" },
  ];
  test("every declared pair is GOOD in both themes on the GOOD fixture", () => {
    const rows = checkPairs(fx("good.css"), { pairs: goodPairs });
    assert.equal(rows.length, 6);
    const bad = rows.filter((r) => r.verdict === "BAD");
    assert.deepEqual(bad, [], bad.map((p) => `${p.theme} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}`).join("\n"));
  });
  test("a failing pair is BAD with the ratio and bar", () => {
    const rows = checkPairs(fx("bad.css"), { pairs: [{ fg: "--muted-foreground", bg: "--background", kind: "text" }] });
    const light = rows.find((r) => r.theme === "light");
    const dark = rows.find((r) => r.theme === "dark");
    assert.equal(light.verdict, "BAD");
    assert.equal(light.need, 4.5);
    assert.ok(light.ratio > 2 && light.ratio < 3);
    assert.equal(dark.verdict, "BAD");
  });
  test("unparseable colour is BAD, undeclared token is not silently GOOD", () => {
    const rows = checkPairs(fx("bad.css"), {
      pairs: [{ fg: "--odd", bg: "--background", kind: "text" }, { fg: "--ghost", bg: "--background", kind: "text" }],
    });
    const odd = rows.find((r) => r.fg === "--odd" && r.theme === "light");
    assert.equal(odd.verdict, "BAD");
    assert.equal(odd.why, "unparseable colour");
    const ghost = rows.find((r) => r.fg === "--ghost" && r.theme === "light");
    assert.notEqual(ghost.verdict, "GOOD");
  });
  test("suggest returns a token that passes in BOTH themes", () => {
    const alts = suggest("--muted-foreground", "--background", "text", fx("bad.css"));
    assert.ok(alts.some((a) => a.name === "--muted-foreground-ink"), JSON.stringify(alts));
    assert.equal(alts[0].name, "--muted-foreground-ink", "same role family first");
    assert.ok(alts.every((a) => a.worst >= 4.5));
    assert.ok(!alts.some((a) => a.name === "--muted-foreground"));
  });
  test("suggest returns [] when nothing can pass", () => {
    assert.deepEqual(suggest("--muted-foreground", "--background", "text", fx("bad.css"), { need: 22 }), []);
  });
  test("default PAIRS is a list of {fg,bg,kind}", () => {
    assert.ok(PAIRS.length > 20);
    for (const p of PAIRS) assert.ok(p.fg.startsWith("--") && p.bg.startsWith("--") && ["text", "large", "ui"].includes(p.kind));
  });
});

describe("theme scopes", () => {
  test("a comma inside :is() does not split the selector: a nested component scope is not a theme", () => {
    const nested = `:root { --foreground: #111111; --background: #ffffff; }
.dark { --foreground: #eeeeee; --background: #111111; }
:is(.dark, .x) :is(.bg-tint) :is(.bg-card, [data-slot="card"], .bg-popover) { --foreground: var(--undeclared); }`;
    assert.equal(resolveTheme(nested, "light").get("--foreground"), "#111111");
    assert.equal(resolveTheme(nested, "dark").get("--foreground"), "#eeeeee");
  });
});

describe("levels: AA is the floor, AAA raises the bar", () => {
  // 5.74:1: passes AA text (4.5) and fails AAA text (7).
  const css = ":root { --background: #ffffff; --foreground: #666666; } .dark { --background: #ffffff; --foreground: #666666; }";
  const pair = [{ fg: "--foreground", bg: "--background", kind: "text", source: "config" }];

  test("the same pair passes at AA and fails at AAA", () => {
    assert.ok(checkPairs(css, { pairs: pair }).every((r) => r.verdict === "GOOD" && r.need === 4.5));
    assert.ok(checkPairs(css, { pairs: pair, level: "AAA" }).every((r) => r.verdict === "BAD" && r.need === 7));
  });

  test("AAA raises text to 7:1 and large to 4.5:1; non-text stays 3:1 (SC 1.4.11 is AA only)", () => {
    assert.equal(verdict(6.9, "text", "AAA"), "BAD");
    assert.equal(verdict(7, "text", "AAA"), "GOOD");
    assert.equal(verdict(4.4, "large", "AAA"), "BAD");
    assert.equal(verdict(3, "ui", "AAA"), "GOOD");
  });

  test("run() reads contrastLevel from the config and names the level and that the design is not done", async () => {
    const root = mkdtempSync(join(tmpdir(), "viewsonic-level-"));
    try {
      mkdirSync(join(root, "styles"), { recursive: true });
      writeFileSync(join(root, "styles", "tokens.css"), css);
      const config = { root, styles: ["styles/tokens.css"], contrastPairs: pair, contrastLevel: "AAA" };
      const f = (await run(config, {})).filter((x) => x.found.includes("--foreground on --background"));
      assert.equal(f.length, 2);
      assert.match(f[0].found, /\(need 7, WCAG AAA\)$/);
      assert.match(f[0].why, /the design is not done until it passes/);
      assert.deepEqual((await run({ ...config, contrastLevel: "AA" }, {})).filter((x) => x.found.includes("--foreground on --background")), []);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("run(config, options) and the CLI probe", () => {
  const mk = (css) => {
    const root = mkdtempSync(join(tmpdir(), "contrast-"));
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "styles", "tokens.css"), css);
    writeFileSync(join(root, "viewsonic-ui.config.json"), JSON.stringify({ styles: ["styles/tokens.css"] }));
    writeFileSync(join(root, "components.json"), JSON.stringify({ tailwind: { css: "styles/tokens.css" }, aliases: {} }));
    return root;
  };
  test("registered as a static check", () => {
    assert.ok(STATIC_CHECKS.some((c) => c.name === "contrast"));
  });
  test("one finding per BAD pair, with file, line, found, why, fix", async () => {
    const root = mk(fx("bad.css"));
    try {
      const config = { root, styles: ["styles/tokens.css"], contrastPairs: [{ fg: "--muted-foreground", bg: "--background", kind: "text" }] };
      const findings = await run(config, {});
      const f = findings.filter((x) => x.found.includes("--muted-foreground on --background"));
      assert.equal(f.length, 2);
      const l = f.find((x) => x.found.startsWith("light"));
      assert.equal(l.check, "contrast");
      assert.equal(l.rule, "contrast-text");
      assert.equal(l.file, "styles/tokens.css");
      assert.equal(l.line, 4);
      assert.match(l.found, /^light --muted-foreground on --background = \d+\.\d\d:1 \(need 4\.5, WCAG AA\)$/);
      assert.match(l.fix, /^try: --muted-foreground-ink/);
      assert.ok(l.why.length > 5);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("NO EXISTING TOKEN PASSES when nothing can", async () => {
    const root = mk(":root{--background:#fff;--foreground:#eee;} .dark{--background:#000;--foreground:#111;}");
    try {
      const config = { root, styles: ["styles/tokens.css"], contrastPairs: [{ fg: "--foreground", bg: "--background", kind: "text" }] };
      const findings = await run(config, {});
      assert.ok(findings.length >= 2);
      assert.match(findings[0].fix, /NO EXISTING TOKEN PASSES on --background - ask the user for a new value/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("all default pairs undeclared -> run() returns skipped, never []", async () => {
    const root = mk(":root{--zzz:#fff;}");
    try {
      const res = await run({ root, styles: ["styles/tokens.css"], contrastPairs: [] }, {});
      assert.ok(!Array.isArray(res));
      assert.match(res.skipped, /no contrast pairs could be resolved/);
      const r = spawnSync(process.execPath, [runMjs, "contrast", "--cwd", root, "--config", join(root, "viewsonic-ui.config.json")], { encoding: "utf8" });
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, /1 checks · 0 GOOD · 0 BAD · 1 SKIPPED/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("partial: measured pairs are judged, skipped count is reported", async () => {
    const root = mk(":root{--background:#fff;--foreground:#111;} .dark{--background:#000;--foreground:#eee;}");
    try {
      const notes = [];
      const res = await run({ root, styles: ["styles/tokens.css"], contrastPairs: [] }, { note: (m) => notes.push(m) });
      assert.deepEqual(res, []);
      assert.ok(notes.some((n) => /measured, \d+ skipped/.test(n)), notes.join(", "));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("a config pair on an undeclared token is BAD, not skipped", async () => {
    const root = mk(":root{--background:#fff;} .dark{--background:#000;}");
    try {
      const res = await run({ root, styles: ["styles/tokens.css"], contrastPairs: [{ fg: "--ghost", bg: "--background", kind: "large" }] }, {});
      assert.ok(res.length >= 2);
      assert.equal(res[0].rule, "contrast-large");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("rgb channels are clamped to 0-255", () => {
    assert.equal(parseColour("rgb(300 0 0)").r, 255);
  });
  test("CLI probe prints ratio, GOOD/BAD per theme and suggestions", () => {
    const root = mk(fx("bad.css"));
    try {
      const r = spawnSync(process.execPath, [runMjs, "contrast", "--cwd", root, "--config", join(root, "viewsonic-ui.config.json"), "--fg", "--muted-foreground", "--bg", "--background"], { encoding: "utf8" });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /BAD\s+light\s+\d+\.\d\d:1 \(need 4\.5\)\s+--muted-foreground on --background/);
      assert.match(r.stdout, /try: --muted-foreground-ink/);
      const g = spawnSync(process.execPath, [runMjs, "contrast", "--cwd", root, "--config", join(root, "viewsonic-ui.config.json"), "--fg", "--foreground", "--bg", "--background", "--kind", "ui"], { encoding: "utf8" });
      assert.equal(g.status, 0, g.stdout);
      assert.match(g.stdout, /GOOD\s+light/);
      assert.match(g.stdout, /GOOD\s+dark/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("probe with only --fg is a usage error", () => {
    const r = spawnSync(process.execPath, [runMjs, "contrast", "--fg", "--x"], { encoding: "utf8" });
    assert.equal(r.status, 64);
  });
});

describe("map.md", () => {
  test("names the contrast check, its rule ids and the fix loop", () => {
    const map = readFileSync(join(here, "..", "map.md"), "utf8");
    assert.match(map, /`contrast`/);
    for (const id of ["contrast-text", "contrast-large", "contrast-ui"]) assert.ok(map.includes(`\`${id}\``), id);
    assert.match(map, /contrast fix loop/i);
    assert.match(map, /NO EXISTING TOKEN PASSES/);
  });
});
