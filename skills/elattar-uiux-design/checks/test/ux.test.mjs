import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => import(pathToFileURL(resolve(here, "..", p)).href);
const { scanFile, collectActions, driftFindings, systemWordIn, run, RULE_IDS, CHECK } = await load("static/ux.mjs");
const { resolveTypeScript } = await load("static/rules.mjs");
const { STATIC_CHECKS } = await load("registry.mjs");

const ts = resolveTypeScript(here);
const PAGE = "app/page.tsx";
const wrap = (body, pre = "") => `export function X() { ${pre} return (<>${body}</>); }\n`;

for (const [label, opts] of [["typescript AST pass", { ts }], ["regex fallback pass", { ts: null }]]) {
  describe(`ux (${label})`, () => {
    if (label.startsWith("typescript")) test("typescript resolves in this environment", () => assert.ok(ts));
    const rules = (body, pre, o = {}) => scanFile(PAGE, wrap(body, pre), { ...opts, ...o }).map((f) => f.rule);

    describe("raw-error", () => {
      const BAD = [
        ["<p>{error.message}</p>", ""],
        ["<p>{err.message}</p>", ""],
        ["<p>{err?.message}</p>", ""],
        ["<p>{response.statusText}</p>", ""],
        ["<p>{res.status === 500 ? res.statusText : ''}</p>", ""],
        ["<Alert description={error.message} />", ""],
        ["<p>{error.stack}</p>", ""],
        ["<p>{`Failed: ${err}`}</p>", "try {} catch (err) {}"],
        ["<p>{String(err)}</p>", "try {} catch (err) {}"],
        ["<pre>{JSON.stringify(error)}</pre>", "try {} catch (error) {}"],
        ["{toast(error.message)}", ""],
        ["{toast.error(err.message)}", ""],
        ["{toast.error('Could not save', { description: error.message })}", ""],
        ["{alert(e.message)}", ""],
        ["<button onClick={() => setError(err.message)}>Retry</button>", ""],
        ["<p>{result.error.message}</p>", ""],
        ["<p>{err.code}</p>", ""],
      ];
      for (const [body, pre] of BAD) test(`fires: ${body}`, () => assert.ok(rules(body, pre).includes("raw-error"), body));
      const GOOD = [
        ["<p>{t('save_failed')}</p>", ""],
        ["{toast.error(t('saveFailed'))}", ""],
        ["{toast.error('We could not save your changes. Check your connection and try again.')}", ""],
        ["<p>{t(error.code)}</p>", ""],
        ["<p>{friendlyMessage(error)}</p>", ""],
        ["<FieldError>{errors.email?.message}</FieldError>", ""],
        ["<FieldError>{fieldState.error?.message}</FieldError>", ""],
        ["<p>{form.formState.errors.name?.message}</p>", ""],
        ["<p>{error}</p>", "const [error] = useState('');"],
        ["<p>{message}</p>", "const message = 'Nothing here yet';"],
        ["<p>Saved</p>", "console.log(error.message);"],
        ["<p>Saved</p>", "try {} catch (err) { console.error(err.message); }"],
        ["<p>{item.message}</p>", ""],
        ["<p>{`Hello ${name}`}</p>", ""],
      ];
      for (const [body, pre] of GOOD) test(`silent: ${body}`, () => assert.ok(!rules(body, pre).includes("raw-error"), body));
      test("a thrown or logged error is not on screen", () => {
        assert.ok(!rules("<p>Saved</p>", "async function f(){ try {} catch (e) { throw new Error(e.message); } }").includes("raw-error"));
      });
      if (label.startsWith("typescript")) {
        test("must not fire: a record from a list (map, filter) is not a caught error", () => {
          assert.ok(!rules("<ul>{errors.map((error) => <li key={error.id}>{error.message}</li>)}</ul>", "").includes("raw-error"));
          assert.ok(!rules("<ul>{events.map((e) => <li key={e.id}>{e.message}</li>)}</ul>", "").includes("raw-error"));
          assert.ok(!rules("<ul>{suite.tests.map((test) => <li>{test.error.message}</li>)}</ul>", "").includes("raw-error"));
        });
        test("a caught error still fires inside a callback that is not a list method", () => {
          assert.ok(rules("<button onClick={() => fetchIt().catch((e) => toast.error(e.message))}>Go</button>", "").includes("raw-error"));
          assert.ok(rules("{toast.error(error.message)}", "").includes("raw-error"));
        });
      }
      // fix round 1: the shapes a real catch / fetch produces
      const fn = (inner) => `export function X() { async function go() { ${inner} } return <p />; }\n`;
      const raw = (inner) => scanFile(PAGE, fn(inner), opts).map((f) => f.rule).includes("raw-error");
      const FLOW_BAD = {
        "a catch bound to any name": "try { await f(); } catch (cause) { toast(cause.message); }",
        "a destructured catch": "try { await f(); } catch ({ message }) { toast(message); }",
        ".toString()": "try { await f(); } catch (e) { toast(e.toString()); }",
        'bracket access ["message"]': 'try { await f(); } catch (e) { toast(e["message"]); }',
        "json.message from a parsed response": "const res = await fetch(u); const json = await res.json(); toast.error(json.message);",
        "data.error from a parsed response": "const res = await fetch(u); const data = await res.json(); toast(data.error);",
        "res.statusText": "const res = await fetch(u); if (!res.ok) toast.error(res.statusText);",
        "an alias of e.message (one hop)": "try { await f(); } catch (e) { const m = e.message; toast(m); }",
        "an alias set into state": "try { await f(); } catch (e) { const m = e.message; setErrorText(m); }",
        "an alias through a ternary": "try { await f(); } catch (e) { const message = e instanceof Error ? e.message : 'Failed'; setError(message); }",
        "a destructured alias": "try { await f(); } catch (e) { const { message } = e; toast(message); }",
      };
      for (const [name, inner] of Object.entries(FLOW_BAD)) {
        if (label.startsWith("regex") && /destructured alias/.test(name)) continue; // the fallback does not follow destructuring
        test(`fires: ${name}`, () => assert.ok(raw(inner), inner));
      }
      test("fires: an alias that is rendered", () => {
        assert.ok(rules("<p>{m}</p>", "const m = error.message;").includes("raw-error"));
      });
      const FLOW_GOOD = {
        "a logged catch name": "try { await f(); } catch (cause) { console.log(cause.message); }",
        "a logged destructured catch": "try { await f(); } catch ({ message }) { console.log(message); }",
        "a written message": "try { await f(); } catch (cause) { toast(t('save_failed')); }",
        "a mapped code": "try { await f(); } catch (cause) { toast(t(cause.code)); }",
        "a parsed body used as data": "const res = await fetch(u); const data = await res.json(); setItems(data.items); toast('Loaded');",
        "a record that is not a server body": "const data = props.data; toast(data.message);",
        "an alias of a written string": "const m = 'We could not save that. Try again.'; toast(m);",
        "an error wrapped in a new Error": "try { await f(); } catch (cause) { const failure = cause instanceof Error ? cause : new Error(String(cause)); setError(failure); }",
        "an alias that is only logged": "try { await f(); } catch (e) { const m = e.message; console.error(m); }",
      };
      for (const [name, inner] of Object.entries(FLOW_GOOD)) test(`silent: ${name}`, () => assert.ok(!raw(inner), inner));
      test("the finding carries the rule's fix", () => {
        const [f] = scanFile(PAGE, wrap("<p>{error.message}</p>"), opts);
        assert.equal(f.check, CHECK);
        assert.match(f.fix, /human message/);
        assert.match(f.fix, /log the error/);
      });
    });

    describe("system-words", () => {
      const BAD = [
        "<p>Value is null</p>", "<p>undefined</p>", "<p>NaN items</p>", "<p>Invalid payload</p>", "<p>Endpoint unavailable</p>",
        "<p>Unhandled exception</p>", "<p>See the stack trace</p>", "<p>fetch failed</p>", "<p>timeout of 5000ms exceeded</p>",
        "<p>ERR_NETWORK_CHANGED</p>", "<p>500 Internal Server Error</p>", "<p>Error 404</p>", "<p>Bad status code</p>",
        "<p>Order a1b2c3d4-e5f6-7890</p>", "<p>Invalid JSON</p>", "<p>API error</p>",
        '<input placeholder="Paste JSON here" />', '<button aria-label="Call the API" />', '<img alt="uuid" src="x" />',
        "<Button>Retry endpoint</Button>", "<AlertDescription>Request failed with status code 500</AlertDescription>",
      ];
      for (const body of BAD) test(`fires: ${body}`, () => assert.ok(rules(body).includes("system-words"), body));
      const GOOD = [
        "<p>Save your changes</p>", "<p>Nobody is online</p>", "<p>3 of 450 results</p>", "<p>$1,500 per month</p>", "<p>Nan Lopez</p>",
        "<p>Order 500 items</p>", "<p>Your internet connection dropped</p>", "<p>Something did not work. Try again.</p>",
        "<p>Rapid growth</p>", "<p>Nullable</p>", "<p>Capital</p>",
        "<code>fetch failed</code>", "<pre>{`null`}</pre>", "<pre>Returns null</pre>",
        // real run on this repo: ordinary words and identifiers are not system words
        "<p>This is the one exception at 40px</p>", "<p>StackTrace</p>", "<p>See ToolStepCard for the stack layout</p>", "<p>Add an exception for this rule</p>",
      ];
      for (const body of GOOD) test(`silent: ${body}`, () => assert.ok(!rules(body).includes("system-words"), body));
      test("the runtime's phrasing of exception still fires", () => {
        assert.ok(rules("<p>Unhandled exception</p>").includes("system-words"));
        assert.ok(rules("<p>NullPointerException at line 4</p>").includes("system-words"));
      });
      // fix round 1: bare status, exception, timeout, but only where an error is on screen
      const ERR_BAD = [
        '{toast.error("Request failed with 500")}', '{toast("Server returned 502")}', '{toast.error("Operation timeout")}', '{toast("The request timed out")}',
        "<AlertDescription>Server returned 502</AlertDescription>", "<AlertDescription>Exception in save</AlertDescription>", "<FieldError>Timeout, try later</FieldError>",
        "<Alert><AlertTitle>Error 404</AlertTitle></Alert>",
      ];
      for (const body of ERR_BAD) test(`error string fires: ${body}`, () => assert.ok(rules(body).includes("system-words"), body));
      const ERR_GOOD = [
        "<p>Order 450 items</p>", "<p>Set how long the timeout is</p>", "<p>The one exception is the logo</p>", "<p>Server returned 502</p>",
        '{toast("Saved $450")}', '{toast.error("Saved 1,500 items, 2 failed")}', '{toast("Your 8 files are ready")}', "<AlertDescription>Nothing to show yet</AlertDescription>",
      ];
      for (const body of ERR_GOOD) test(`silent outside an error, or not a status: ${body}`, () => assert.ok(!rules(body).includes("system-words"), body));
      if (label.startsWith("typescript")) {
        test("alert(...) and setError(...) strings are error strings", () => {
          assert.ok(rules("<p>x</p>", "alert('Request failed with 500');").includes("system-words"));
          assert.ok(rules("<p>x</p>", "setError('Timeout');").includes("system-words"));
        });
      }
      test("allowSystemWords lists the words the product really uses", () => {
        assert.ok(rules("<p>Create an API key</p>").includes("system-words"));
        assert.ok(!rules("<p>Create an API key</p>", "", { allowSystemWords: ["API"] }).includes("system-words"));
        assert.ok(!rules("<p>Create an api key</p>", "", { allowSystemWords: ["API"] }).includes("system-words"));
        assert.ok(rules("<p>null result</p>", "", { allowSystemWords: ["API"] }).includes("system-words"), "other words still fire");
      });
      test("allowWords (kept capitals) never allows a system word", () => {
        assert.ok(rules("<p>Create an API key</p>", "", { allowWords: ["API"] }).includes("system-words"));
      });
      test("systemWordIn returns the matched word", () => {
        assert.equal(systemWordIn("Invalid payload"), "payload");
        assert.equal(systemWordIn("All good"), null);
        assert.equal(systemWordIn("Value {…} is null"), "null");
      });
    });

    describe("unconfirmed-destructive", () => {
      const BAD = [
        '<Button variant="destructive" onClick={() => removeProject(id)}>Archive</Button>',
        "<Button onClick={() => deleteProject(id)}>Delete project</Button>",
        "<Button onClick={() => api.remove(id)}>Remove member</Button>",
        "<Button onClick={() => reset()}>Reset settings</Button>",
        '<Button variant="outline" onClick={() => revoke(token)}>Revoke token</Button>',
        '<Button variant="destructive" size="icon" aria-label="Delete file" onClick={() => del(id)} />',
        "<DropdownMenuItem onSelect={() => deleteItem(id)}>Delete</DropdownMenuItem>",
        "<AlertDialogTrigger asChild><Button>Open</Button></AlertDialogTrigger><Button onClick={() => discard()}>Discard draft</Button>",
        '<Button onClick={() => { toast("Deleted"); remove(id); }}>Delete</Button>',
      ];
      for (const body of BAD) test(`fires: ${body.slice(0, 60)}`, () => assert.ok(rules(body).includes("unconfirmed-destructive"), body));
      const GOOD = [
        '<AlertDialog><AlertDialogTrigger asChild><Button variant="destructive">Delete project</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => deleteProject(id)}>Delete project</AlertDialogAction></AlertDialogContent></AlertDialog>',
        '<AlertDialog><AlertDialogContent><Button variant="destructive" onClick={() => deleteProject(id)}>Delete project</Button></AlertDialogContent></AlertDialog>',
        '<Button variant="destructive" onClick={() => setConfirmOpen(true)}>Delete project</Button>',
        '<Button onClick={() => setOpen(true)}>Delete account</Button>',
        '<Button onClick={() => { if (confirm("Delete?")) remove(id); }}>Delete</Button>',
        '<Button onClick={() => { remove(id); toast("Deleted", { action: { label: "Undo", onClick: () => restore(id) } }); }}>Delete</Button>',
        '<Button variant="destructive" onClick={() => router.push("/settings/delete")}>Delete account</Button>',
        "<Button onClick={() => save()}>Save changes</Button>",
        '<Button variant="destructive" onClick={onDelete}>Delete</Button>',
        '<Dialog><DialogContent><DialogTitle>Delete project?</DialogTitle><Button variant="outline">Cancel</Button><Button variant="destructive" onClick={() => deleteProject(id)}>Delete project</Button></DialogContent></Dialog>',
        "<Button>Delete</Button>",
      ];
      for (const body of GOOD) test(`silent: ${body.slice(0, 60)}`, () => assert.ok(!rules(body).includes("unconfirmed-destructive"), body));
      if (label.startsWith("typescript")) {
        test("must not fire: Reset that only sets component state; a destructive Reset or a Reset that calls out still fires", () => {
          assert.ok(!rules("<Button onClick={() => setXp(28)}>Reset</Button>").includes("unconfirmed-destructive"));
          assert.ok(!rules("<Button onClick={reset}>Reset</Button>", "const reset = () => { setStep(0); setDone(false); }; ").includes("unconfirmed-destructive"));
          assert.ok(rules('<Button variant="destructive" onClick={() => setXp(28)}>Reset</Button>').includes("unconfirmed-destructive"));
          assert.ok(rules("<Button onClick={() => { setXp(28); clearServer(); }}>Reset</Button>").includes("unconfirmed-destructive"));
          assert.ok(rules("<Button onClick={() => setItems([])}>Delete all</Button>").includes("unconfirmed-destructive"), "Delete is never a view reset");
        });
        test("a named handler is read from the same file", () => {
          const bad = "const handleDelete = () => { remove(id); }; ";
          const good = "const handleDelete = () => { setConfirm(true); }; ";
          const undo = "function handleDelete() { remove(id); toast('Gone', { action: { label: 'Undo', onClick: restore } }); } ";
          assert.ok(rules('<Button variant="destructive" onClick={handleDelete}>Delete</Button>', bad).includes("unconfirmed-destructive"));
          assert.ok(!rules('<Button variant="destructive" onClick={handleDelete}>Delete</Button>', good).includes("unconfirmed-destructive"));
          assert.ok(!rules('<Button variant="destructive" onClick={handleDelete}>Delete</Button>', undo).includes("unconfirmed-destructive"));
        });
        test("a handler wrapped in useCallback is read too", () => {
          const pre = "const handleDelete = useCallback(() => { remove(id); }, [id]); ";
          assert.ok(rules('<Button variant="destructive" onClick={handleDelete}>Delete</Button>', pre).includes("unconfirmed-destructive"));
        });
      }
    });
  });
}

describe("term-drift", () => {
  const actions = (files) => files.flatMap(([rel, body]) => collectActions(rel, wrap(body), { ts }));
  const drift = (files) => driftFindings(actions(files));
  test("Delete project vs Remove project across files is reported once, at the rarer label, as a review item", () => {
    const f = drift([
      ["app/a.tsx", "<Button>Delete project</Button><Button>Delete project</Button>"],
      ["app/b.tsx", "<Button>Remove project</Button>"],
    ]);
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, "term-drift");
    assert.equal(f[0].severity, "review");
    assert.equal(f[0].file, "app/b.tsx");
    assert.match(f[0].found, /Remove project.*b\.tsx.*Delete project.*a\.tsx/);
    assert.match(f[0].fix, /pick one label/);
    assert.match(f[0].fix, /review item/);
  });
  test("Save/Update/Apply on the same object", () => {
    const f = drift([["a.tsx", "<Button>Save profile</Button>"], ["b.tsx", "<Button>Update profile</Button>"], ["c.tsx", "<Button>Apply profile</Button>"]]);
    assert.equal(f.length, 2);
  });
  test("bare verbs are paired by the handler's name", () => {
    const f = drift([["a.tsx", "<Button onClick={handleSave}>Save</Button>"], ["b.tsx", "<Button onClick={handleSave}>Update</Button>"]]);
    assert.equal(f.length, 1);
  });
  test("a handler named after the object pairs with a label that names it", () => {
    const f = drift([["a.tsx", "<Button onClick={() => deleteProject()}>Delete project</Button>"], ["b.tsx", "<Button onClick={handleRemoveProject}>Remove</Button>"]]);
    assert.equal(f.length, 1);
  });
  test("must not fire: one label everywhere", () => {
    assert.deepEqual(drift([["a.tsx", "<Button>Delete project</Button>"], ["b.tsx", "<Button>Delete project</Button>"]]), []);
  });
  test("must not fire: different objects, different families, bare verbs without a handler", () => {
    assert.deepEqual(drift([["a.tsx", "<Button>Delete project</Button>"], ["b.tsx", "<Button>Remove member</Button>"]]), []);
    assert.deepEqual(drift([["a.tsx", "<Button>Save project</Button>"], ["b.tsx", "<Button>Delete project</Button>"]]), []);
    assert.deepEqual(drift([["a.tsx", "<Button>Save</Button>"], ["b.tsx", "<Button>Update</Button>"]]), []);
  });
  test("must not fire: pending labels and computed labels", () => {
    assert.deepEqual(drift([["a.tsx", "<Button>Deleting project…</Button>"], ["b.tsx", "<Button>Remove project</Button>"]]), []);
    assert.deepEqual(drift([["a.tsx", "<Button>Delete {name}</Button>"], ["b.tsx", "<Button>Remove {name}</Button>"]]), []);
  });
});

describe("ux (wiring)", () => {
  test("registered as a static check named ux; ids are the four rules", () => {
    assert.equal(CHECK, "ux");
    assert.deepEqual(RULE_IDS, ["raw-error", "system-words", "unconfirmed-destructive", "term-drift"]);
    assert.ok(STATIC_CHECKS.some((c) => c.name === "ux"));
  });
  test("run() reads allowSystemWords (not allowWords) from config; no ts prints one note", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "ux-"));
    mkdirSync(join(root, "app"));
    writeFileSync(join(root, "app", "page.tsx"), wrap("<p>Create an API key</p><p>{error.message}</p>"));
    const notes = [];
    const base = { root, sources: ["app"], styles: [] };
    const a = await run({ ...base, allowSystemWords: [] }, { typescript: ts });
    assert.deepEqual(a.map((f) => f.rule).sort(), ["raw-error", "system-words"]);
    const b = await run({ ...base, allowSystemWords: ["API"], allowWords: [] }, { typescript: ts });
    assert.deepEqual(b.map((f) => f.rule), ["raw-error"]);
    const c = await run({ ...base, allowWords: ["API"] }, { typescript: null, note: (m) => notes.push(m) });
    assert.ok(c.some((f) => f.rule === "system-words"));
    assert.equal(notes.length, 1);
    assert.match(notes[0], /regex fallback/);
  });
});
