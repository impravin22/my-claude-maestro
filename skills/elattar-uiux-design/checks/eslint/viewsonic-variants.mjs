// ESLint flat-config plugin: `viewsonic/valid-variant`.
// A ui component used with a variant value its cva() does not define (Button size="md"), a prop it does not declare
// (colour for color) or a value outside a literal-union prop is an error, so a made-up API never ships. Reads the
// ui folder once per project (cached). Same judge as the after-edit hook (../props.mjs).
//
//   import viewsonic from "./.viewsonic-ui/checks/eslint/viewsonic-variants.mjs";
//   export default [{ plugins: { viewsonic }, rules: { "viewsonic/valid-variant": "error" } }];
import { isUiImport } from "../variants.mjs";
import { judgeUsage, loadTables } from "../props.mjs";

const cache = new Map();
const tablesFor = (root) => {
  if (!cache.has(root)) cache.set(root, loadTables(root));
  return cache.get(root);
};

/** Every string a JSX attribute value can be when written as literals, or null when it is not literal. */
function literals(node) {
  if (!node) return null;
  if (node.type === "Literal") return typeof node.value === "string" ? [node.value] : null;
  if (node.type === "JSXExpressionContainer" || node.type === "TSAsExpression" || node.type === "TSNonNullExpression") return literals(node.expression);
  if (node.type === "ConditionalExpression") return [...(literals(node.consequent) ?? []), ...(literals(node.alternate) ?? [])];
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return [node.quasis[0].value.cooked];
  if (node.type === "LogicalExpression") return node.operator === "&&" ? literals(node.right) : [...(literals(node.left) ?? []), ...(literals(node.right) ?? [])];
  return null;
}

const rule = {
  meta: {
    type: "problem",
    schema: [],
    docs: { description: "A ui component may only be given the props and variant values it defines" },
    messages: { invalid: "{{message}}" },
  },
  create(context) {
    const tables = tablesFor(context.cwd ?? process.cwd());
    const local = new Map(); // local name -> imported component name
    return {
      ImportDeclaration(node) {
        if (!isUiImport(node.source.value, tables.uiDir)) return;
        for (const s of node.specifiers) if (s.type === "ImportSpecifier") local.set(s.local.name, s.imported.name ?? s.imported.value);
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const component = local.get(node.name.name);
        if (!component) return;
        for (const attr of node.attributes) {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
          for (const message of judgeUsage(tables, { component, prop: attr.name.name, values: literals(attr.value) })) {
            context.report({ node: attr, messageId: "invalid", data: { message } });
          }
        }
      },
    };
  },
};

const plugin = { meta: { name: "viewsonic" }, rules: { "valid-variant": rule } };
export default plugin;
