import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hook = resolve(here, "..", "eslint", "on-edit.mjs");
const hasTs = (() => { for (let d = here; ; d = dirname(d)) { if (existsSync(join(d, "node_modules", "typescript"))) return true; if (dirname(d) === d) return false; } })();

const UI = {
  "components/ui/button.tsx": `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
const buttonStyles = cva("x", { variants: { variant: { default: "", outline: "" }, size: { sm: "", default: "", lg: "" } } });
export function Button({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonStyles>) {
  return <button className={buttonStyles({ variant, size, className })} {...props} />;
}
`,
  "components/ui/tip.tsx": `export function Tip({ side = "top", label }: { side?: "top" | "bottom"; label: string }) {
  return <span data-side={side}>{label}</span>;
}
`,
};
const BASE = {
  "package.json": "{}",
  "components.json": JSON.stringify({ aliases: { ui: "@/components/ui" } }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { jsx: "preserve", strict: true, module: "esnext", moduleResolution: "bundler", target: "es2022", skipLibCheck: true, esModuleInterop: true, baseUrl: ".", paths: { "@/*": ["./*"] } } }),
  ...UI,
};
const head = `import { Button } from "@/components/ui/button";\nimport { Tip } from "@/components/ui/tip";\n`;

const dirs = [];
function project(base) {
  const d = mkdtempSync(join(base, ".viewsonic-hook-"));
  dirs.push(d);
  for (const [f, text] of Object.entries(BASE)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), text); }
  return d;
}
function edit(d, file, text, tool = "Edit") {
  mkdirSync(dirname(join(d, file)), { recursive: true });
  writeFileSync(join(d, file), text);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: d, tool_name: tool, tool_input: { file_path: join(d, file) } }), encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, ms: Date.now() - t0 };
}
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// inside the repo tree so `typescript`, `react` types and `class-variance-authority` resolve like in a real project
describe("on-edit hook (with the project's TypeScript)", { skip: hasTs ? false : "typescript is not installed above the skill" }, () => {
  let d;
  before(() => { d = project(resolve(here)); });
  test("an invalid variant value is reported with the allowed list and the line", () => {
    const r = edit(d, "app/a.tsx", head + `export const A = () => <Button size="md">Save</Button>;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /app\/a\.tsx:3 Button has no size "md"\. Use one of: sm, default, lg\./);
  });
  test("an unknown prop name gets a nearest-name suggestion", () => {
    const r = edit(d, "app/b.tsx", head + `export const A = () => <Button colour="red">Save</Button>;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /app\/b\.tsx:3 Button has no prop "colour"\. Did you mean "color"\?/);
  });
  test("a value outside a literal-union prop is reported", () => {
    const r = edit(d, "app/c.tsx", head + `export const A = () => <Tip side="left" label="x" />;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /Tip has no side "left"\. Use one of: top, bottom\./);
  });
  test("a bad ternary branch is reported, the good branch is not", () => {
    const r = edit(d, "app/t.tsx", head + `export const A = ({ big }: { big: boolean }) => <Button size={big ? "lg" : "huge"}>x</Button>;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /no size "huge"/);
    assert.doesNotMatch(r.err, /"lg"/);
  });
  test("TypeScript's own error on ui JSX comes through (a missing required prop)", () => {
    const r = edit(d, "app/d.tsx", head + `export const A = () => <Tip />;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /app\/d\.tsx:3 .*label/);
  });
  test("valid usage is silent, and a warm run is fast", () => {
    const code = head + `export const A = ({ s }: { s: "sm" | "lg" }) => <><Button size="sm" variant="outline" aria-label="x" data-x="1" onClick={() => {}}>Go</Button><Button size={s} /><Tip side="bottom" label="ok" /></>;\n`;
    const r = edit(d, "app/ok.tsx", code, "Write");
    assert.deepEqual([r.code, r.out, r.err], [0, "", ""]);
    const again = edit(d, "app/ok.tsx", code, "MultiEdit");
    assert.equal(again.code, 0);
    assert.ok(again.ms < 20000, `warm run took ${again.ms}ms`);
    console.log(`# on-edit warm run ${again.ms}ms, cold ${r.ms}ms`);
  });
});

describe("on-edit hook: what it ignores", () => {
  test("not a script file, a file in the ui folder, no ui project, a missing file, garbage input", () => {
    const d = project(tmpdir());
    assert.equal(edit(d, "notes.md", `<Button size="md" />`).code, 0);
    assert.equal(edit(d, "styles/a.css", `a{}`).code, 0);
    assert.equal(edit(d, "components/ui/other.tsx", head + `export const A = () => <Button size="md" />;\n`).code, 0, "the ui folder itself is exempt");
    const bare = mkdtempSync(join(tmpdir(), "viewsonic-bare-"));
    dirs.push(bare);
    assert.equal(edit(bare, "a.tsx", head + `export const A = () => <Button size="md" />;\n`).code, 0, "no components.json, no package.json");
    assert.equal(spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8" }).status, 0);
    assert.equal(spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: { file_path: join(d, "nope.tsx") } }), encoding: "utf8" }).status, 0);
  });
  test("without the project's TypeScript the variant check still works", () => {
    const d = project(tmpdir()); // outside the repo: `typescript` does not resolve
    const r = edit(d, "app/a.tsx", head + `export const A = () => <Button size="md">Save</Button>;\n`);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /app\/a\.tsx:3 Button has no size "md"\. Use one of: sm, default, lg\./);
    assert.equal(edit(d, "app/ok.tsx", head + `export const A = () => <Button size="sm" />;\n`).code, 0);
  });
});
