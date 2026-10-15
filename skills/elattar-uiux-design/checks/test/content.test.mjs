import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..", "..");
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { scanFile, run, RULE_IDS, CHECK } = await load("static/content.mjs");
const { resolveTypeScript } = await load("static/rules.mjs");
const { STATIC_CHECKS } = await load("registry.mjs");

const ts = resolveTypeScript(here);
const PAGE = "app/page.tsx";
const tsx = (body) => `export function X() { return (<>${body.startsWith("toast") ? `{${body}}` : body}</>); }
`;

// The same samples must behave the same in both passes.
for (const [label, opts] of [["typescript AST pass", { ts }], ["regex fallback pass", { ts: null }]]) {
  describe(`content (${label})`, () => {
    if (label.startsWith("typescript")) test("typescript resolves in this environment", () => assert.ok(ts));
    const rules = (body, o = {}) => scanFile(PAGE, tsx(body), { ...opts, ...o }).map((f) => f.rule);

    const BAD = {
      "vague-action": [
        "<Button asChild><Link href=\"/x\">OK</Link></Button>",
        "<Button label='Go' />",
        "<Button aria-label=\"Submit\" />",
        "<Button>OK</Button>",
        "<Button>Submit</Button>",
        "<Button>Yes</Button>",
        "<Button>No</Button>",
        "<Button>Click here</Button>",
        "<Button>Go</Button>",
        "<Button>Continue</Button>",
        '<Button aria-label="Submit">Save</Button>',
        "<Button>{pending ? \"Wait\" : \"OK\"}</Button>",
      ],
      "vague-error": [
        "<AlertDescription>Oops</AlertDescription>",
        "<AlertTitle>Something went wrong.</AlertTitle>",
        "<AlertDescription>Error</AlertDescription>",
        "<FieldError>Oops, that did not work. Try again.</FieldError>",
        'toast.error("Something went wrong")',
      ],
      "title-case": [
        "<Button>Save Changes Now</Button>",
        "<DialogTitle>Create New Project</DialogTitle>",
        "<EmptyTitle>No Members Yet</EmptyTitle>",
        '<Button aria-label="Open Your Settings">Open</Button>',
        'toast("Project Created Successfully")',
      ],
      exclamation: [
        "<AlertTitle>Saved!</AlertTitle>",
        "<Button>Save now!</Button>",
        "<EmptyDescription>Nothing here yet!</EmptyDescription>",
        'toast.success("Project created!")',
        "<FieldError>Enter a valid email!</FieldError>",
      ],
      "confirm-without-verb": [
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>Confirm</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>Yes</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>OK</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>Proceed</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>The files</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction asChild><Button>Yes</Button></AlertDialogAction></AlertDialogContent></AlertDialog>",
      ],
      "vague-confirm-title": [
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogAction>Delete files</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Confirm</AlertDialogTitle><AlertDialogAction>Delete files</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Warning</AlertDialogTitle><AlertDialogAction>Delete files</AlertDialogAction></AlertDialogContent></AlertDialog>",
      ],
    };
    const GOOD = [
      "<Button>Save changes</Button>",
      "<Button>Create project</Button>",
      "<Button variant=\"outline\">Cancel</Button>",
      '<Button aria-label="Search members">Search</Button>',
      "<Button>{pending ? \"Creating project\" : \"Create project\"}</Button>",
      "<Button><Icon name=\"plus\" />Add member</Button>",
      "<Button>{label}</Button>",
      "<AlertTitle>3 fields need attention</AlertTitle>",
      "<AlertDescription>Could not save your changes. Check your connection, then try again.</AlertDescription>",
      "<FieldError>Enter an email like name@example.com</FieldError>",
      "<EmptyTitle>No members yet</EmptyTitle><EmptyDescription>Add the first member to start sharing access.</EmptyDescription>",
      "<DialogTitle>Rename file</DialogTitle>",
      'toast("Project created")',
      'toast.error("Could not save. Check your connection, then try again.")',
      "<Button>Delete {count} files</Button>",
      "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Delete files</AlertDialogAction></AlertDialogContent></AlertDialog>",
      "<AlertDialog><AlertDialogContent><AlertDialogTitle>{name} will be removed</AlertDialogTitle><AlertDialogAction>Remove</AlertDialogAction></AlertDialogContent></AlertDialog>",
      "<AlertDialog><AlertDialogContent><AlertDialogTitle>Sign out of this device?</AlertDialogTitle><AlertDialogAction>Sign out</AlertDialogAction></AlertDialogContent></AlertDialog>",
      "<AlertDialog><AlertDialogContent><AlertDialogTitle>Deleting this project?</AlertDialogTitle><AlertDialogAction>Delete project</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Unsaved changes</AlertDialogTitle><AlertDialogAction>Discard changes</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete project?</AlertDialogTitle><AlertDialogAction>{p ? \"Please wait\" : \"Delete project\"}</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete project?</AlertDialogTitle><AlertDialogAction>{p ? \"Deleting…\" : \"Delete project\"}</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete project?</AlertDialogTitle><AlertDialogAction>Deleting project</AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete project?</AlertDialogTitle><AlertDialogAction asChild><Button>Delete project</Button></AlertDialogAction></AlertDialogContent></AlertDialog>",
        "<Button asChild><Link href=\"/x\">Open settings</Link></Button>",
        "<Button>Please wait</Button>",
        "<Button>Saving…</Button>",
        "<Alert><AlertTitle>Could not save</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>",
      // acronyms, a pronoun and a new sentence are not title case
      "<Button>Export to PDF</Button>",
      "<AlertTitle>Saved. Next, share it with I.T.</AlertTitle>",
      // a computed title or label cannot be judged
      "<AlertDialog><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogAction>{verb}</AlertDialogAction></AlertDialogContent></AlertDialog>",
      // text outside the scanned components is not judged
      "<p>Oops!</p>",
    ];

    if (label.startsWith("typescript")) { globalThis.__contentSamples = [...Object.values(BAD).flat(), ...GOOD]; }
    for (const [rule, samples] of Object.entries(BAD)) {
      for (const s of samples) {
        test(`${rule} fires on ${s.slice(0, 70)}`, () => {
          const r = rules(s);
          assert.ok(r.includes(rule), `got [${r}]`);
        });
      }
    }
    for (const s of GOOD) {
      test(`silent on ${s.slice(0, 70)}`, () => assert.deepEqual(rules(s), []));
    }

    test("every finding has check, rule, file, line, found, why and a fix", () => {
      for (const s of Object.values(BAD).flat()) {
        for (const f of scanFile(PAGE, tsx(s), opts)) {
          assert.equal(f.check, CHECK);
          assert.ok(RULE_IDS.includes(f.rule));
          assert.equal(f.file, PAGE);
          assert.ok(f.line >= 1);
          assert.ok(f.found && f.why && f.fix, JSON.stringify(f));
        }
      }
    });

    test("each dialog is judged on its own: one bad confirm among good ones fires once", () => {
      const good = "<AlertDialog><AlertDialogContent><AlertDialogTitle>Delete 3 files?</AlertDialogTitle><AlertDialogAction>Delete files</AlertDialogAction></AlertDialogContent></AlertDialog>";
      const noun = "<AlertDialog><AlertDialogContent><AlertDialogTitle>Unsaved changes</AlertDialogTitle><AlertDialogAction>Discard changes</AlertDialogAction></AlertDialogContent></AlertDialog>";
      const bad = "<AlertDialog><AlertDialogContent><AlertDialogTitle>Archive this order?</AlertDialogTitle><AlertDialogAction>Yes</AlertDialogAction></AlertDialogContent></AlertDialog>";
      assert.deepEqual(rules(good + noun), []);
      const f = scanFile(PAGE, tsx(good + bad + noun), opts).filter((x) => x.rule === "confirm-without-verb");
      assert.deepEqual(f.map((x) => x.found), ["Yes"]);
    });

    test("pending labels are state labels, never actions", () => {
      for (const t of ["Please wait", "Deleting…", "Deleting...", "Saving changes"]) {
        assert.deepEqual(rules(`<Button>${t}</Button>`), [], t);
        assert.deepEqual(rules(`<AlertDialogAction>${t}</AlertDialogAction>`), [], t);
      }
    });

    test("an error phrase as the whole heading is vague even with punctuation or a raw expression", () => {
      for (const t of ["Error: {message}", "Error.", "Something went wrong!", "Oops: {message}"]) {
        assert.ok(rules(`<AlertTitle>${t}</AlertTitle>`).includes("vague-error"), t);
      }
      assert.ok(!rules("<AlertTitle>Error saving your changes</AlertTitle>").includes("vague-error"));
    });

    test("toast object form and toast.promise are scanned", () => {
      assert.ok(rules('toast({ title: "Saved!", description: "Your changes are live." })').includes("exclamation"));
      assert.ok(rules('toast({ title: "Saved", description: "Oops" })').includes("vague-error"));
      assert.ok(rules('toast.promise(save(), { loading: "Saving…", success: "Saved!", error: "Something went wrong" })').includes("exclamation"));
      assert.ok(rules('toast.promise(save(), { loading: "Saving…", success: "Saved", error: "Something went wrong" })').includes("vague-error"));
      assert.deepEqual(rules('toast.promise(save(), { loading: "Saving changes", success: "Changes saved", error: "Could not save. Try again." })'), []);
    });

    test("properNouns and allowWords keep their capitals", () => {
      assert.ok(rules("<Button>Connect GitHub Actions</Button>").includes("title-case"));
      assert.deepEqual(rules("<Button>Connect GitHub Actions</Button>", { properNouns: ["GitHub Actions"] }), []);
      assert.deepEqual(rules("<DialogTitle>Open Acme Cloud</DialogTitle>", { allowWords: ["Acme Cloud"] }), []);
      // allowWords has one meaning: kept capitals. It never exempts an action label.
      assert.ok(rules("<Button>Continue</Button>", { allowWords: ["Continue"] }).includes("vague-action"));
    });

    test("must not fire: a heading over a written description is judged by the description", () => {
      assert.deepEqual(rules("<Alert><AlertTitle>Something went wrong</AlertTitle><AlertDescription>Could not load orders. Try again.</AlertDescription></Alert>"), []);
      assert.ok(rules("<Alert><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>").includes("vague-error"));
      assert.ok(rules("<Alert><AlertTitle>Oops</AlertTitle><AlertDescription>Could not load orders. Try again.</AlertDescription></Alert>").includes("vague-error"));
      assert.ok(rules("<AlertDescription>Something went wrong</AlertDescription>").includes("vague-error"));
    });

    test("must not fire: lower-case words, numbers and acronyms in a label", () => {
      assert.deepEqual(rules("<Button>Delete 3 files from API v2</Button>"), []);
      assert.deepEqual(rules("<AlertTitle>Updated 2 hours ago</AlertTitle>"), []);
    });

    test("reports the line of the element", () => {
      const src = "export function X() {\n  return (\n    <div>\n      <Button>OK</Button>\n    </div>\n  );\n}\n";
      assert.equal(scanFile(PAGE, src, opts)[0].line, 4);
    });

    test("a multi-line label is read as one label", () => {
      assert.deepEqual(rules("<Button>\n  Save\n  changes\n</Button>"), []);
      assert.ok(rules("<Button>\n  Save\n  Changes\n  Now\n</Button>").includes("title-case"));
    });
  });
}

describe("content: the two passes agree", () => {
  test("AST and regex return the same findings for every sample", () => {
    const samples = globalThis.__contentSamples;
    assert.ok(samples && samples.length > 40);
    const key = (f) => `${f.rule}|${f.found}`;
    for (const sample of samples) {
      const a = scanFile(PAGE, tsx(sample), { ts }).map(key).sort();
      const r = scanFile(PAGE, tsx(sample), { ts: null }).map(key).sort();
      assert.deepEqual(r, a, sample);
    }
  });
});

describe("content: AST only precision", () => {
  const f = (body) => scanFile(PAGE, tsx(body), { ts }).map((x) => x.rule);
  test("a string expression child is the label", () => assert.deepEqual(f('<Button>{"OK"}</Button>'), ["vague-action"]));
  test("a template with a computed part is not vague", () => assert.deepEqual(f("<Button>{`Delete ${n} files`}</Button>"), []));
  test("a nested span is part of the label", () => assert.deepEqual(f("<Button><span>OK</span></Button>"), ["vague-action"]));
  test("toast description and action label are judged", () => {
    assert.deepEqual(f('toast("Project created", { description: "Saved!", action: { label: "Undo", onClick } })'), ["exclamation"]);
    assert.deepEqual(f('toast("Order archived", { action: { label: "OK", onClick } })'), ["vague-action"]);
  });
  test("non-tsx files are not scanned", () => assert.deepEqual(scanFile("a.css", "Oops!", { ts }), []));
});

describe("content: the project run", () => {
  test("registered as a static check named content", () => {
    assert.ok(STATIC_CHECKS.some((c) => c.name === "content"));
  });
  test("run() reads properNouns and allowWords from config; no ts prints one note", async () => {
    // A private copy: a project the whole suite reads in parallel is shared state, and this file must not depend on it.
    const dir = mkdtempSync(join(tmpdir(), "viewsonic-content-"));
    try {
      cpSync(join(here, "fixtures", "bad"), dir, { recursive: true });
      const { loadConfig } = await load("config.mjs");
      const config = await loadConfig(dir);
      const notes = [];
      const base = await run(config, { typescript: null, note: (m) => notes.push(m) });
      assert.equal(notes.length, 1);
      assert.match(notes[0], /^NOTE content:/);
      assert.ok(Array.isArray(base));
      assert.ok(base.every((x) => x.check === "content" && x.fix));
      assert.deepEqual(config.properNouns, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rules/content.md", () => {
  const md = readFileSync(join(skillDir, "rules", "content.md"), "utf8");
  test("states each check's rule and the never-show-the-backend rule", () => {
    for (const id of RULE_IDS) assert.ok(md.includes("`" + id + "`"), `content.md lacks ${id}`);
    assert.match(md, /Never show the backend/);
    assert.match(md, /error\.message/);
  });
  test("every rule has a Do and a Don't", () => {
    const sections = md.split(/^## /m).slice(1).filter((s) => !s.startsWith("Judge it"));
    assert.ok(sections.length >= 8);
    for (const s of sections) {
      assert.ok(/\*\*Do\.\*\*/.test(s) && /\*\*Don't\.\*\*/.test(s), `${s.split("\n")[0]} lacks Do/Don't`);
    }
  });
  test("generic examples only", () => assert.doesNotMatch(md, /\btwitter\b|\byoutube\b|buy button|price card/i));
});
