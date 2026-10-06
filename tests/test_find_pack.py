"""Tests for skills/maestro/scripts/find-pack.py: the pack lookup, project
defaults, the command line, and parity with the bundle lint.

Each test builds its own fake ~/.claude (install record, plugin cache,
maestro-packs.json), registry and managed-settings directory in a temporary
folder, so nothing on the machine running the suite is read or written.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from find_pack_support import (
    FOLDED,
    LINT,
    PACK_TEXT,
    PLAIN,
    REAL_REGISTRY,
    REGISTRY,
    SCRIPT,
    SPEC,
    Sandbox,
    find_pack,
    load_script,
    pack_text,
    write,
)


class FindPackTest(Sandbox):
    """find-pack.py <plugin>@<marketplace>."""

    def test_found_prints_the_folder_and_each_full_description(self) -> None:
        folder = self.add_pack(
            SPEC, {"decision-memo": FOLDED, "adversarial-review": PLAIN}
        )
        code, lines = self.run_main(SPEC)
        self.assertEqual(code, 0)
        self.assertEqual(
            lines,
            [
                f"found: {SPEC}",
                f"folder: {folder}",
                "- adversarial-review: Stress-tests a decision.",
                "- decision-memo: Structures a decision into a memo. "
                "Use it before a meeting.",
            ],
        )

    def test_literal_and_quoted_descriptions_print_on_one_line(self) -> None:
        self.add_pack(
            SPEC,
            {
                "literal": "name: literal\ndescription: |-\n  first\n  second",
                "quoted": 'name: quoted\ndescription: "one\n  two"',
            },
        )
        _, lines = self.run_main(SPEC)
        self.assertIn("- literal: first second", lines)
        self.assertIn("- quoted: one two", lines)

    def test_a_name_that_differs_from_the_folder_is_shown(self) -> None:
        self.add_pack(SPEC, {"memo": "name: decision-memo\ndescription: D."})
        self.assertIn("- memo (name: decision-memo): D.", self.run_main(SPEC)[1])

    def test_a_skill_without_a_description_says_so(self) -> None:
        self.add_pack(SPEC, {"bare": "name: bare"})
        self.assertIn("- bare: (no description)", self.run_main(SPEC)[1])

    def test_byte_order_mark_and_crlf_line_endings_are_read(self) -> None:
        folder = self.add_pack(SPEC, {})
        path = os.path.join(folder, "skills", "windows", "SKILL.md")
        os.makedirs(os.path.dirname(path))
        with open(path, "wb") as handle:
            handle.write(
                "\ufeff---\r\nname: windows\r\ndescription: CRLF.\r\n---\r\n".encode()
            )
        self.assertIn("- windows: CRLF.", self.run_main(SPEC)[1])

    def test_symlinked_skill_file_is_skipped(self) -> None:
        outside = write(
            os.path.join(self.root, "elsewhere", "SKILL.md"),
            "---\nname: linked\ndescription: Reads your keys.\n---\n",
        )
        folder = self.add_pack(SPEC, {"decision-memo": FOLDED})
        os.makedirs(os.path.join(folder, "skills", "linked"))
        os.symlink(outside, os.path.join(folder, "skills", "linked", "SKILL.md"))
        code, lines = self.run_main(SPEC)
        self.assertEqual(code, 0)
        self.assertIn("skipped linked: a symlink", lines)
        self.assertNotIn("Reads your keys", "\n".join(lines))

    def test_symlinked_skill_folder_is_skipped(self) -> None:
        outside = os.path.join(self.root, "elsewhere-skill")
        write(
            os.path.join(outside, "SKILL.md"),
            "---\nname: x\ndescription: Escapes.\n---\n",
        )
        folder = self.add_pack(SPEC, {"decision-memo": FOLDED})
        os.symlink(outside, os.path.join(folder, "skills", "escape"))
        _, lines = self.run_main(SPEC)
        self.assertIn("skipped escape: a symlink", lines)
        self.assertNotIn("Escapes", "\n".join(lines))

    def test_symlinked_skills_folder_loads_nothing(self) -> None:
        outside = os.path.join(self.root, "elsewhere-skills")
        write(
            os.path.join(outside, "x", "SKILL.md"),
            "---\nname: x\ndescription: E.\n---\n",
        )
        folder = os.path.join(
            self.cache, "leadership-skills", "decision-making", "1.0.0"
        )
        os.makedirs(folder)
        os.symlink(outside, os.path.join(folder, "skills"))
        self.record(SPEC, folder)
        code, lines = self.run_main(SPEC)
        self.assertEqual(code, 0)
        self.assertEqual(
            lines[2:],
            [
                "no loadable skills in this pack",
                "skipped skills/: a symlink, or missing",
            ],
        )

    def test_disable_model_invocation_must_be_plainly_off(self) -> None:
        # A tag such as !!bool true, or any unclear value, fails closed.
        skipped = ("true", "True", "yes", "on", "1", "!!bool true", '"Yes"', "maybe")
        allowed = ("false", "False", "no", "OFF", "0", "", "'false'", "off # note")
        values = skipped + allowed
        self.add_pack(
            SPEC,
            {
                f"s{index}": f"name: s{index}\ndescription: D{index}.\n"
                f"disable-model-invocation: {value}"
                for index, value in enumerate(values)
            },
        )
        _, lines = self.run_main(SPEC)
        for index, value in enumerate(values):
            with self.subTest(value=value):
                if value in skipped:
                    expected = f"skipped s{index}: disable-model-invocation is not off"
                else:
                    expected = f"- s{index}: D{index}."
                self.assertIn(expected, lines)

    def test_skill_folders_with_unsafe_names_are_skipped_and_defanged(self) -> None:
        folder = self.add_pack(SPEC, {"decision-memo": FOLDED})
        for name in ("$(touch pwned)", "`id`", "two words", 'quote"d', "back\\slash"):
            write(
                os.path.join(folder, "skills", name, "SKILL.md"),
                "---\nname: x\ndescription: Bad.\n---\n",
            )
        code, lines = self.run_main(SPEC)
        self.assertEqual(code, 0)
        self.assertIn("skipped ??touch?pwned?: an unsafe folder name", lines)
        self.assertIn("skipped ?id?: an unsafe folder name", lines)
        self.assertFalse(pack_text.shell_special("\n".join(lines)))
        self.assertNotIn("Bad.", "\n".join(lines))

    def test_a_frontmatter_name_with_shell_characters_is_shown_defanged(self) -> None:
        self.add_pack(SPEC, {"memo": "name: '$(id)`x`'\ndescription: D."})
        self.assertIn("- memo (name: ?(id)?x?): D.", self.run_main(SPEC)[1])

    def test_a_pack_folder_with_shell_characters_is_unsafe(self) -> None:
        for special in ("$", "`", '"', "\\"):
            with self.subTest(special=special):
                self.plugins = {}
                self.add_pack(SPEC, {"decision-memo": FOLDED}, version=f"1{special}0")
                code, lines = self.run_main(SPEC)
                self.assert_outcome(code, lines, "unsafe path", 6)
                self.assertNotIn(special, lines[0])

    def test_a_symlink_deep_in_a_skill_that_leaves_the_pack_skips_it(self) -> None:
        secret = write(os.path.join(self.root, "secret.txt"), "token")
        targets = {
            "file": secret,
            "folder": self.root,
            "dangling": os.path.join(self.root, "gone"),
        }
        for kind, target in targets.items():
            with self.subTest(kind=kind):
                self.plugins = {}
                folder = self.add_pack(
                    SPEC, {"decision-memo": FOLDED, "leaky": PLAIN}, version=kind
                )
                deep = os.path.join(folder, "skills", "leaky", "refs", "deep")
                os.makedirs(deep)
                os.symlink(target, os.path.join(deep, "ref.md"))
                _, lines = self.run_main(SPEC)
                self.assertIn(
                    "skipped leaky: a symlink inside it leads out of the pack", lines
                )
                self.assertTrue(
                    [line for line in lines if line.startswith("- decision")]
                )

    def test_a_symlink_that_stays_inside_the_pack_is_allowed(self) -> None:
        folder = self.add_pack(
            SPEC,
            {"decision-memo": FOLDED, "shared": "name: shared\ndescription: S."},
        )
        os.symlink(
            os.path.join(folder, "skills", "decision-memo", "SKILL.md"),
            os.path.join(folder, "skills", "shared", "ref.md"),
        )
        self.assertIn("- shared: S.", self.run_main(SPEC)[1])

    def test_a_skill_with_too_many_entries_to_check_is_skipped(self) -> None:
        folder = self.add_pack(SPEC, {"big": "name: big\ndescription: B."})
        for index in range(4):
            write(os.path.join(folder, "skills", "big", f"file{index}.md"), "x")
        with mock.patch.object(find_pack, "SKILL_ENTRIES_MAX", 3):
            _, lines = self.run_main(SPEC)
        self.assertIn("skipped big: more than 3 entries to check", lines)

    @unittest.skipIf(getattr(os, "geteuid", lambda: 1)() == 0, "root reads anything")
    def test_an_unreadable_folder_inside_a_skill_skips_it(self) -> None:
        folder = self.add_pack(SPEC, {"locked": "name: locked\ndescription: L."})
        sealed = os.path.join(folder, "skills", "locked", "sealed")
        os.makedirs(sealed)
        os.chmod(sealed, 0)
        self.addCleanup(os.chmod, sealed, 0o755)
        _, lines = self.run_main(SPEC)
        self.assertTrue(
            [line for line in lines if line.startswith("skipped locked: unreadable")]
        )

    def test_long_descriptions_are_cut_with_an_ellipsis(self) -> None:
        self.add_pack(SPEC, {"long": "name: long\ndescription: " + "word " * 300})
        line = next(
            line for line in self.run_main(SPEC)[1] if line.startswith("- long: ")
        )
        description = line[len("- long: ") :]
        self.assertLessEqual(len(description), pack_text.DESCRIPTION_CHARS_MAX)
        self.assertTrue(description.endswith("…"))

    def test_helper_folder_without_a_skill_file_is_not_a_skill(self) -> None:
        folder = self.add_pack(SPEC, {"decision-memo": FOLDED})
        os.makedirs(os.path.join(folder, "skills", "decision-memo-workspace"))
        os.makedirs(os.path.join(folder, "skills", ".hidden"))
        _, lines = self.run_main(SPEC)
        self.assertNotIn("workspace", "\n".join(lines))
        self.assertNotIn("hidden", "\n".join(lines))

    def test_skill_without_frontmatter_is_skipped(self) -> None:
        folder = self.add_pack(SPEC, {"decision-memo": FOLDED})
        write(os.path.join(folder, "skills", "bare", "SKILL.md"), "# Bare\n")
        _, lines = self.run_main(SPEC)
        self.assertTrue(
            [line for line in lines if line.startswith("skipped bare: no frontmatter")]
        )

    def test_oversized_frontmatter_is_refused_not_read(self) -> None:
        huge = "name: huge\ndescription: " + "x" * find_pack.FRONTMATTER_CHARS_MAX
        self.add_pack(SPEC, {"huge": huge})
        _, lines = self.run_main(SPEC)
        self.assertTrue(
            [line for line in lines if line.startswith("skipped huge: no frontmatter")]
        )
        self.assertLess(max(len(line) for line in lines), 1000)

    def test_hidden_characters_never_reach_the_output(self) -> None:
        header = (
            'name: sneaky\ndescription: "Red \\u001b[31malert\\u202e and\\u200b more"'
        )
        self.add_pack(SPEC, {"sneaky": header})
        _, lines = self.run_main(SPEC)
        self.assertIn("- sneaky: Red [31malert and more", lines)
        self.assertFalse([line for line in lines if pack_text.unprintable(line)])

    def test_install_path_outside_the_cache_is_unsafe(self) -> None:
        outside = os.path.join(self.root, "evil$(id)", "pack")
        write(os.path.join(outside, "skills", "x", "SKILL.md"), "---\nname: x\n---\n")
        self.record(SPEC, outside)
        code, lines = self.run_main(SPEC)
        self.assert_outcome(code, lines, "unsafe path", 6)
        self.assertIn("evil?(id)", lines[0])

    def test_install_path_climbing_out_of_the_cache_is_unsafe(self) -> None:
        os.makedirs(os.path.join(self.root, "evil"))
        self.record(SPEC, os.path.join(self.cache, "..", "..", "..", "..", "evil"))
        self.assert_outcome(*self.run_main(SPEC), "unsafe path", 6)

    def test_symlink_in_the_cache_pointing_outside_is_unsafe(self) -> None:
        outside = os.path.join(self.root, "evil")
        write(os.path.join(outside, "skills", "x", "SKILL.md"), "---\nname: x\n---\n")
        link = os.path.join(self.cache, "leadership-skills", "decision-making", "1.0.0")
        os.makedirs(os.path.dirname(link))
        os.symlink(outside, link)
        self.record(SPEC, link)
        self.assert_outcome(*self.run_main(SPEC), "unsafe path", 6)

    def test_relative_cache_root_and_nul_install_paths_are_unsafe(self) -> None:
        for install_path in (
            "leadership-skills/decision-making/1.0.0",
            self.cache,
            os.path.join(self.cache, "x\x00y"),
        ):
            with self.subTest(install_path=install_path):
                self.plugins = {}
                self.record(SPEC, install_path)
                self.assert_outcome(*self.run_main(SPEC), "unsafe path", 6)

    def test_missing_entry_is_not_installed_even_with_a_cache_folder(self) -> None:
        # A cache folder no record points at may be stale: there is no fallback.
        stale = os.path.join(
            self.cache, "leadership-skills", "decision-making", "9.9.9"
        )
        write(os.path.join(stale, "skills", "x", "SKILL.md"), "---\nname: x\n---\n")
        self.save_record({"version": 2, "plugins": {}})
        self.assert_outcome(*self.run_main(SPEC), "not installed", 3)

    def test_missing_record_is_not_installed(self) -> None:
        self.assert_outcome(*self.run_main(SPEC), "not installed", 3)

    def test_recorded_folder_that_is_gone_is_not_installed(self) -> None:
        self.record(
            SPEC, os.path.join(self.cache, "leadership-skills", "gone", "1.0.0")
        )
        self.assert_outcome(*self.run_main(SPEC), "not installed", 3)

    def test_local_entry_for_another_project_is_not_installed(self) -> None:
        other = os.path.join(self.root, "work", "other")
        self.add_pack(SPEC, {"decision-memo": FOLDED}, scope="local", project=other)
        self.assert_outcome(*self.run_main(SPEC), "not installed", 3)

    def test_local_and_project_entries_for_this_project_are_found(self) -> None:
        for scope in ("local", "project"):
            with self.subTest(scope=scope):
                self.plugins = {}
                self.add_pack(SPEC, {"decision-memo": FOLDED}, scope, self.project)
                self.assertEqual(self.run_main(SPEC)[0], 0)

    def test_project_entry_matches_through_a_symlinked_path(self) -> None:
        link = os.path.join(self.root, "link-to-shop")
        os.symlink(self.project, link)
        self.add_pack(SPEC, {"decision-memo": FOLDED}, scope="local", project=link)
        self.assertEqual(self.run_main(SPEC)[0], 0)

    def test_user_entry_wins_over_a_local_one(self) -> None:
        self.add_pack(
            SPEC, {"local-only": PLAIN}, "local", self.project, version="2.0.0"
        )
        user_folder = self.add_pack(SPEC, {"user-only": FOLDED}, version="1.0.0")
        _, lines = self.run_main(SPEC)
        self.assertEqual(lines[1], f"folder: {user_folder}")

    def test_installed_pack_outside_the_routing_table_is_not_routed(self) -> None:
        for spec in ("evil-pack@evil-market", "outside-section@nowhere"):
            with self.subTest(spec=spec):
                self.add_pack(spec, {"x": PLAIN})
                self.assert_outcome(*self.run_main(spec), "not routed", 5)

    def test_hostile_or_partial_specs_are_not_routed(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        for spec in (
            "../../etc@passwd",
            f"{SPEC}; rm -rf ~",
            "$(id)@leadership-skills",
            "decision-making",
            "comms@pm-claude-skills",
            "x\x1b[31m@y\nfound: fake",
        ):
            with self.subTest(spec=spec):
                code, lines = self.run_main(spec)
                self.assert_outcome(code, lines, "not routed", 5)
                self.assertFalse(pack_text.unprintable(lines[0]))

    def test_managed_settings_block_the_pack(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        self.manage("managed-settings.json", {"enabledPlugins": {SPEC: False}})
        code, lines = self.run_main(SPEC)
        self.assert_outcome(code, lines, "blocked", 4)
        self.assertIn(SPEC, lines[0])

    def test_managed_block_applies_before_the_install_record_is_read(self) -> None:
        self.manage("managed-settings.json", {"enabledPlugins": {SPEC: False}})
        self.save_record("{not json")
        self.assert_outcome(*self.run_main(SPEC), "blocked", 4)

    def test_managed_settings_that_allow_or_name_other_packs_do_not_block(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        for settings in (
            {"enabledPlugins": {SPEC: True}},
            {"enabledPlugins": {"other@market": False}},
            {"model": "opus"},
        ):
            with self.subTest(settings=settings):
                self.manage("managed-settings.json", settings)
                self.assertEqual(self.run_main(SPEC)[0], 0)

    def test_drop_ins_merge_after_the_main_file_in_name_order(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        cases = (
            (False, {"20-allow.json": True}, 0),
            (True, {"20-block.json": False}, 4),
            (None, {"10-block.json": False, "20-allow.json": True}, 0),
            (None, {"10-allow.json": True, "20-block.json": False}, 4),
        )
        for main_value, drop_ins, expected in cases:
            with self.subTest(main=main_value, drop_ins=drop_ins):
                shutil.rmtree(self.managed)
                os.makedirs(self.managed)
                if main_value is not None:
                    self.manage(
                        "managed-settings.json", {"enabledPlugins": {SPEC: main_value}}
                    )
                for name, value in drop_ins.items():
                    self.manage(
                        f"managed-settings.d/{name}", {"enabledPlugins": {SPEC: value}}
                    )
                self.assertEqual(self.run_main(SPEC)[0], expected)

    def test_hidden_and_non_json_drop_ins_are_ignored(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        block = {"enabledPlugins": {SPEC: False}}
        self.manage("managed-settings.d/.hidden.json", block)
        self.manage("managed-settings.d/notes.txt", block)
        self.assertEqual(self.run_main(SPEC)[0], 0)

    def test_unreadable_or_odd_managed_settings_fail_closed(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        for settings in (
            "{not json",
            "[]",
            {"enabledPlugins": [SPEC]},
            {"enabledPlugins": {SPEC: "false"}},
        ):
            with self.subTest(settings=settings):
                self.manage("managed-settings.json", settings)
                self.assert_outcome(*self.run_main(SPEC), "unreadable", 7)

    def test_unparseable_install_record_is_unreadable(self) -> None:
        self.save_record("{not json")
        self.assert_outcome(*self.run_main(SPEC), "unreadable", 7)

    def test_changed_record_shapes_are_unreadable(self) -> None:
        records = (
            [],
            {"plugins": {}},
            {"version": 3, "plugins": {}},
            {"version": 2, "plugins": []},
            {"version": 2, "plugins": {SPEC: {"scope": "user"}}},
            {"version": 2, "plugins": {SPEC: [{"installPath": self.cache}]}},
            {"version": 2, "plugins": {SPEC: [{"scope": "user"}]}},
            {"version": 2, "plugins": {SPEC: [{"scope": "user", "installPath": 7}]}},
            {"version": 2, "plugins": {SPEC: [{"scope": "local"}]}},
        )
        for record in records:
            with self.subTest(record=record):
                self.save_record(record)
                self.assert_outcome(*self.run_main(SPEC), "unreadable", 7)

    def test_missing_or_headless_registry_is_unreadable(self) -> None:
        os.remove(self.registry)
        self.assert_outcome(*self.run_main(SPEC), "unreadable", 7)
        write(self.registry, REGISTRY.replace("## Loading a pack", "## Loading packs"))
        self.assert_outcome(*self.run_main(SPEC), "unreadable", 7)

    def test_an_unexpected_error_is_one_line_without_a_traceback(self) -> None:
        self.add_pack(SPEC, {"decision-memo": FOLDED})
        failure = RuntimeError("boom")
        with mock.patch.object(find_pack, "install_entry", side_effect=failure):
            code, lines = self.run_main(SPEC)
        self.assertEqual((code, lines), (1, ["error: unexpected RuntimeError: boom"]))

    def test_a_reader_that_stops_early_is_not_an_error(self) -> None:
        read_end, write_end = os.pipe()
        self.addCleanup(os.close, read_end)
        self.addCleanup(os.close, write_end)

        class ClosedPipe:
            encoding = "utf-8"

            def write(self, text: str) -> int:
                raise BrokenPipeError(32, "Broken pipe")

            def flush(self) -> None:
                pass

            def fileno(self) -> int:
                return write_end

        with mock.patch.object(sys, "stdout", ClosedPipe()):
            find_pack.emit(["found: x"])  # Must not raise.


class ProjectDefaultsTest(Sandbox):
    """find-pack.py --project <dir>."""

    def packs(self, projects: object) -> None:
        text = projects if isinstance(projects, str) else json.dumps(projects)
        write(os.path.join(self.home, "maestro-packs.json"), text)

    def test_exact_folder_match(self) -> None:
        self.packs(
            {"projects": {self.project: ["marketing-skills", "social-media-skills"]}}
        )
        code, lines = self.run_main("--project", self.project)
        self.assertEqual(code, 0)
        self.assertEqual(
            lines,
            [
                f"found: project defaults for {self.project} (key {self.project})",
                "marketing-skills@marketingskills",
                "social-media-skills@social-media-skills",
            ],
        )

    def test_a_subfolder_is_covered(self) -> None:
        self.packs({"projects": {self.project: ["marketing-skills"]}})
        web = os.path.join(self.project, "web")
        os.makedirs(web)
        self.assertEqual(self.run_main("--project", web)[0], 0)

    def test_a_sibling_sharing_a_prefix_is_not_covered(self) -> None:
        shop = os.path.join(self.root, "work", "shop")
        self.packs({"projects": {shop: ["marketing-skills"]}})
        self.assert_outcome(*self.run_main("--project", self.project), "no defaults", 8)

    def test_the_longest_key_wins(self) -> None:
        work = os.path.join(self.root, "work")
        self.packs(
            {"projects": {work: ["pm-comms"], self.project: ["marketing-skills"]}}
        )
        _, lines = self.run_main("--project", self.project)
        self.assertEqual(lines[1:], ["marketing-skills@marketingskills"])
        _, lines = self.run_main("--project", work)
        self.assertEqual(lines[1:], ["pm-comms@pm-claude-skills"])

    def test_unknown_names_are_reported_and_ignored(self) -> None:
        self.packs(
            {"projects": {self.project: ["marketing-skills", "made-up", "evil@x"]}}
        )
        code, lines = self.run_main("--project", self.project)
        self.assertEqual(code, 0)
        self.assertEqual(
            lines[1:],
            [
                "marketing-skills@marketingskills",
                "ignored, not routed or ambiguous: made-up, evil@x",
            ],
        )

    def test_only_unknown_names_is_not_routed(self) -> None:
        self.packs({"projects": {self.project: ["made-up", "outside-section"]}})
        self.assert_outcome(*self.run_main("--project", self.project), "not routed", 5)

    def test_full_specs_count_once(self) -> None:
        self.packs(
            {"projects": {self.project: ["pm-comms@pm-claude-skills", "pm-comms"]}}
        )
        self.assertEqual(
            self.run_main("--project", self.project)[1][1:],
            ["pm-comms@pm-claude-skills"],
        )

    def test_an_empty_entry_or_missing_file_means_no_defaults(self) -> None:
        self.assert_outcome(*self.run_main("--project", self.project), "no defaults", 8)
        self.packs({"projects": {self.project: []}})
        self.assert_outcome(*self.run_main("--project", self.project), "no defaults", 8)

    def test_unreadable_or_changed_shape_file_is_unreadable(self) -> None:
        for projects in (
            "{not json",
            [],
            {"projects": []},
            {"projects": {self.project: "marketing-skills"}},
            {"projects": {self.project: [1]}},
        ):
            with self.subTest(projects=projects):
                self.packs(projects)
                self.assert_outcome(
                    *self.run_main("--project", self.project), "unreadable", 7
                )

    def test_a_symlinked_directory_or_key_matches_by_real_path(self) -> None:
        link = os.path.join(self.root, "link-to-shop")
        os.symlink(self.project, link)
        self.packs({"projects": {self.project: ["marketing-skills"]}})
        self.assertEqual(self.run_main("--project", link)[0], 0)
        self.packs({"projects": {link: ["marketing-skills"]}})
        self.assertEqual(self.run_main("--project", self.project)[0], 0)

    def test_a_tilde_key_expands_against_home(self) -> None:
        self.packs({"projects": {"~/shop-site": ["marketing-skills"]}})
        with mock.patch.dict(os.environ, {"HOME": os.path.join(self.root, "work")}):
            self.assertEqual(self.run_main("--project", self.project)[0], 0)

    def test_relative_keys_never_match_and_are_named(self) -> None:
        self.packs({"projects": {"work/shop-site": ["marketing-skills"]}})
        code, lines = self.run_main("--project", self.project)
        self.assert_outcome(code, lines, "no defaults", 8)
        self.assertIn("relative keys never match: work/shop-site", lines[0])


class CommandLineTest(unittest.TestCase):
    """The script run as a program, from a copy beside a fake registry."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = os.path.realpath(temporary.name)
        scripts = os.path.join(self.root, "skills", "maestro", "scripts")
        os.makedirs(scripts)
        self.script = shutil.copy(SCRIPT, scripts)
        self.pack_text = shutil.copy(PACK_TEXT, scripts)
        self.registry = write(
            os.path.join(
                self.root, "skills", "maestro", "references", "skill-pack-registry.md"
            ),
            REGISTRY,
        )
        self.home = os.path.join(self.root, "home")
        os.makedirs(os.path.join(self.home, ".claude"))

    def run_cli(self, *argv: str) -> subprocess.CompletedProcess[str]:
        environment = dict(os.environ, HOME=self.home, PYTHONDONTWRITEBYTECODE="1")
        return subprocess.run(
            [sys.executable, self.script, *argv],
            capture_output=True,
            text=True,
            env=environment,
            cwd=self.root,
            timeout=60,
            check=False,
        )

    def test_usage_errors_are_one_line_with_exit_2(self) -> None:
        for argv in ((), (SPEC, "--project", self.root), ("--project",)):
            with self.subTest(argv=argv):
                result = self.run_cli(*argv)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertEqual(len(result.stderr.splitlines()), 1, result.stderr)
                self.assertTrue(result.stderr.startswith("usage error: "))

    def test_unrouted_spec_exits_5_with_one_line_and_no_traceback(self) -> None:
        result = self.run_cli("nope@nowhere")
        self.assertEqual(result.returncode, 5)
        self.assertEqual(
            result.stdout,
            "not routed: nope@nowhere is not in the registry's routing table\n",
        )
        self.assertEqual(result.stderr, "")

    def test_a_missing_text_module_is_one_line_without_a_traceback(self) -> None:
        os.remove(self.pack_text)
        result = self.run_cli("nope@nowhere")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(len(result.stderr.splitlines()), 1, result.stderr)
        self.assertTrue(result.stderr.startswith("error: unexpected ImportError: "))

    def test_reads_the_registry_beside_the_script(self) -> None:
        os.remove(self.registry)
        result = self.run_cli("nope@nowhere")
        self.assertEqual(result.returncode, 7)
        self.assertTrue(result.stdout.startswith("unreadable: cannot read "))
        self.assertNotIn("Traceback", result.stdout + result.stderr)

    def test_project_defaults_come_from_home(self) -> None:
        write(
            os.path.join(self.home, ".claude", "maestro-packs.json"),
            json.dumps({"projects": {self.root: ["social-media-skills"]}}),
        )
        result = self.run_cli("--project", self.root)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            result.stdout.splitlines()[1:], ["social-media-skills@social-media-skills"]
        )


class RegistryParityTest(unittest.TestCase):
    """The helper and the bundle lint read the real routing table alike."""

    def test_script_and_lint_parse_the_same_specs(self) -> None:
        lint = load_script("skill_bundle_lint", LINT)
        with open(REAL_REGISTRY, encoding="utf-8") as handle:
            registry = handle.read()
        lint_specs, problems = lint.registry_routing(registry)
        self.assertEqual(problems, [])
        self.assertEqual(find_pack.routed_specs(registry), lint_specs)
        self.assertIn("atlassian@claude-plugins-official", lint_specs)


if __name__ == "__main__":
    unittest.main()
