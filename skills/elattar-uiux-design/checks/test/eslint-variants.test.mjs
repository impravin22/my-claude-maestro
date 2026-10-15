import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checksDir = resolve(here, "..");
const imp = (p) => import(pathToFileURL(join(checksDir, p)).href);
const { default: plugin } = await imp("eslint/viewsonic-variants.mjs");
const vars = await imp("variants.mjs");

// The project's own ESLint, found by walking up from the skill
let Linter = null;
for (let d = here; ; d = dirname(d)) {
  if (existsSync(join(d, "node_modules", "eslint"))) { try { ({ Linter } = createRequire(join(d, "package.json"))("eslint")); } catch { /* none */ } break; }
  if (dirname(d) === d) break;
}
const skip = Linter ? false : "eslint is not installed above the skill: the rule is not exercised";

let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), "viewsonic-eslint-"));
  mkdirSync(join(tmp, "components", "ui"), { recursive: true });
  writeFileSync(join(tmp, "package.json"), "{}");
  writeFileSync(join(tmp, "components.json"), JSON.stringify({ aliases: { ui: "@/components/ui" } }));
  writeFileSync(join(tmp, "components", "ui", "button.tsx"), `const buttonStyles = cva("base", {
  variants: {
    variant: { default: "a", outline: "b", "ghost-x": "c" },
    size: { xs: "x", sm: "s", default: "d", "icon-sm": "i", lg: "l" },
  },
  defaultVariants: { variant: "default", size: "default" },
})`);
  writeFileSync(join(tmp, "components", "ui", "badge.tsx"), `export const badgeVariants = cva("b", { variants: { variant: { default: "", destructive: "" } } })`);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const lint = (code) => {
  const linter = new Linter({ cwd: tmp, configType: "flat" });
  return linter.verify(code, [{ files: ["**/*.jsx"], plugins: { viewsonic: plugin }, languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { "viewsonic/valid-variant": "error" } }], "page.jsx");
};
const head = `import { Button } from "@/components/ui/button";\nimport { Badge as Chip } from "@/components/ui/badge";\n`;

describe("viewsonic/valid-variant", () => {
  test("the loader reads every cva prop and value, quoted keys included", () => {
    const t = vars.loadVariants(tmp, "components/ui");
    assert.deepEqual(t.get("Button").get("size"), ["xs", "sm", "default", "icon-sm", "lg"]);
    assert.deepEqual(t.get("Button").get("variant"), ["default", "outline", "ghost-x"]);
    assert.deepEqual(t.get("Badge").get("variant"), ["default", "destructive"]);
  });
  test("invalid: Button size=\"md\" fires with the allowed list", { skip }, () => {
    const m = lint(head + `export const A = () => <Button size="md">Save</Button>;`);
    assert.equal(m.length, 1, JSON.stringify(m));
    assert.equal(m[0].message, 'Button has no size "md". Use one of: xs, sm, default, icon-sm, lg.');
    assert.equal(m[0].ruleId, "viewsonic/valid-variant");
  });
  test("invalid: an aliased import, an expression container and a template literal fire", { skip }, () => {
    const m = lint(head + "export const A = () => <><Chip variant={\"nope\"} /><Chip variant={`nope`} /><Button variant='solid' /></>;");
    assert.equal(m.length, 3, JSON.stringify(m));
    assert.match(m[0].message, /Badge has no variant "nope"/);
  });
  test("invalid: only the bad branch of a ternary fires", { skip }, () => {
    const m = lint(head + `export const A = ({ big }) => <Button size={big ? "lg" : "huge"}>x</Button>;`);
    assert.equal(m.length, 1, JSON.stringify(m));
    assert.match(m[0].message, /Button has no size "huge"/);
  });
  test("valid: real values, dynamic values, other props, other components, non-ui imports", { skip }, () => {
    const code = head + `import { Button as Other } from "./not-ui";
export const A = ({ s }) => <>
  <Button size="sm" variant="ghost-x" /><Button size={s} /><Button size={s ? "xs" : "lg"} className="size-md" type="button" />
  <Chip variant="destructive" /><Other size="md" /><Card size="md" />
</>;`;
    assert.deepEqual(lint(code), []);
  });
});

describe("viewsonic/valid-variant: prop names and union values (needs the project's TypeScript)", { skip: skip || (existsSync(join(here, "..", "..", "..", "..", "..", "..", "node_modules", "typescript")) ? false : "typescript is not installed above the skill") }, () => {
  let proj;
  before(() => {
    proj = mkdtempSync(join(here, ".viewsonic-lint-"));
    mkdirSync(join(proj, "components", "ui"), { recursive: true });
    writeFileSync(join(proj, "package.json"), "{}");
    writeFileSync(join(proj, "components.json"), JSON.stringify({ aliases: { ui: "@/components/ui" } }));
    writeFileSync(join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", strict: true, module: "esnext", moduleResolution: "bundler", target: "es2022", skipLibCheck: true, baseUrl: ".", paths: { "@/*": ["./*"] } } }));
    writeFileSync(join(proj, "components", "ui", "tip.tsx"), `export function Tip({ side = "top", label }: { side?: "top" | "bottom"; label: string }) { return <span data-side={side}>{label}</span>; }
`);
  });
  after(() => rmSync(proj, { recursive: true, force: true }));
  const lintIn = (code) => {
    const linter = new Linter({ cwd: proj, configType: "flat" });
    return linter.verify(code, [{ files: ["**/*.jsx"], plugins: { viewsonic: plugin }, languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { "viewsonic/valid-variant": "error" } }], "page.jsx");
  };
  const imp2 = `import { Tip } from "@/components/ui/tip";
`;
  test("an unknown prop name suggests the nearest", () => {
    const m = lintIn(imp2 + `export const A = () => <Tip lable="x" />;`);
    assert.equal(m.length, 1, JSON.stringify(m));
    assert.equal(m[0].message, 'Tip has no prop "lable". Did you mean "label"?');
  });
  test("a value outside the union fires; the union values, data- and aria- attributes do not", () => {
    const bad = lintIn(imp2 + `export const A = () => <Tip side="left" label="x" />;`);
    assert.equal(bad[0].message, 'Tip has no side "left". Use one of: top, bottom.');
    assert.deepEqual(lintIn(imp2 + `export const A = () => <Tip side="bottom" label="x" data-x="1" aria-hidden key="k" />;`), []);
  });
});
