"""Tests for skills/maestro/scripts/pack_text.py: frontmatter and safe text.

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""

from __future__ import annotations

import textwrap
import time
import unittest

from find_pack_support import find_pack, pack_text


def frontmatter(text: str) -> dict[str, str]:
    """Parses a dedented frontmatter block the way the script does."""
    lines = pack_text.frontmatter_lines(f"---\n{textwrap.dedent(text)}---\n")
    if lines is None:
        raise AssertionError("no frontmatter block")
    return pack_text.parse_frontmatter(lines)


class FrontmatterTest(unittest.TestCase):
    """The YAML subset a SKILL.md header uses."""

    def test_folded_block_scalar_keeps_every_line(self) -> None:
        fields = frontmatter(
            """\
            description: >
              one
              two

              three
            name: x
            """
        )
        self.assertEqual(fields["description"], "one two\nthree")
        self.assertEqual(fields["name"], "x")

    def test_folded_strip_block_scalar(self) -> None:
        fields = frontmatter("description: >-\n  one\n  two\n")
        self.assertEqual(fields["description"], "one two")

    def test_literal_block_scalars_keep_line_breaks(self) -> None:
        for header in ("|", "|-", "|+"):
            with self.subTest(header=header):
                fields = frontmatter(f"description: {header}\n  one\n  two\n\n")
                self.assertEqual(fields["description"], "one\ntwo")

    def test_block_scalar_with_indentation_indicator_and_comment(self) -> None:
        fields = frontmatter("description: >2 # folded\n    deeper\n  base\n")
        self.assertEqual(pack_text.clean(fields["description"]), "deeper base")

    def test_block_scalar_ends_at_the_next_key(self) -> None:
        fields = frontmatter("description: |\n  only this\nname: n\n")
        self.assertEqual(fields, {"description": "only this", "name": "n"})

    def test_empty_block_scalar(self) -> None:
        self.assertEqual(frontmatter("description: >\nname: n\n")["description"], "")

    def test_plain_scalar_with_indented_continuation(self) -> None:
        fields = frontmatter("description: first line\n  second line\nname: x\n")
        self.assertEqual(fields["description"], "first line second line")

    def test_plain_scalar_starting_on_the_next_line(self) -> None:
        fields = frontmatter("description:\n  on the next line\n")
        self.assertEqual(fields["description"], "on the next line")

    def test_plain_scalar_drops_a_comment_but_not_a_hash_inside_a_word(self) -> None:
        self.assertEqual(
            frontmatter("description: text # note\n")["description"], "text"
        )
        self.assertEqual(
            frontmatter("description: C# rules\n")["description"], "C# rules"
        )
        self.assertEqual(frontmatter("description: # only a note\n")["description"], "")

    def test_double_quoted_scalar_unescapes(self) -> None:
        fields = frontmatter('description: "say \\"hi\\" caf\\u00e9\\tok" # note\n')
        self.assertEqual(fields["description"], 'say "hi" café\tok')

    def test_double_quoted_scalar_over_several_lines(self) -> None:
        fields = frontmatter('description: "one\n  two\n\n  three"\n')
        self.assertEqual(fields["description"], "one two\nthree")

    def test_double_quoted_escaped_line_break_joins_without_a_space(self) -> None:
        fields = frontmatter('description: "one\\\n  two"\n')
        self.assertEqual(fields["description"], "onetwo")

    def test_double_quoted_yaml_only_escape_is_kept_as_written(self) -> None:
        self.assertEqual(
            frontmatter('description: "A\\x41"\n')["description"], "A\\x41"
        )

    def test_single_quoted_scalar(self) -> None:
        self.assertEqual(
            frontmatter("description: 'it''s fine'\n")["description"], "it's fine"
        )
        self.assertEqual(
            frontmatter("description: 'one\n  two'\n")["description"], "one two"
        )

    def test_nested_map_does_not_swallow_the_next_key(self) -> None:
        fields = frontmatter("metadata:\n  author: me\ndescription: d\n")
        self.assertEqual(fields["description"], "d")

    def test_comment_lines_and_repeated_keys(self) -> None:
        fields = frontmatter("# note\ndescription: first\ndescription: last\n")
        self.assertEqual(fields, {"description": "last"})

    def test_frontmatter_needs_both_delimiters(self) -> None:
        self.assertIsNone(pack_text.frontmatter_lines("name: x\n---\n"))
        self.assertIsNone(pack_text.frontmatter_lines("---\nname: x\n"))
        self.assertEqual(
            pack_text.frontmatter_lines("---\nname: x\n---\n"), ["name: x"]
        )

    def test_truncated_text_drops_its_partial_last_line(self) -> None:
        self.assertIsNone(
            pack_text.frontmatter_lines("---\nname: x\n---", truncated=True)
        )

    def test_comment_search_stays_linear_on_a_long_run_of_blanks(self) -> None:
        line = "x" + " " * find_pack.FRONTMATTER_CHARS_MAX + "y"
        start = time.perf_counter()
        fields = pack_text.parse_frontmatter([f"description: {line}", f"  {line}"])
        elapsed = time.perf_counter() - start
        self.assertEqual(len(fields["description"]), 2 * len(line) + 1)
        # "[ \t]+#" took seconds on this input; a linear search takes milliseconds.
        self.assertLess(elapsed, 1.0)


class SafeTextTest(unittest.TestCase):
    """Third-party text made safe to print."""

    def test_clean_strips_invisible_and_control_characters(self) -> None:
        hidden = (
            "\U000e0041",  # tag letter A
            "\U000e007f",  # cancel tag
            "\u00ad",  # soft hyphen
            "\u061c",  # Arabic letter mark
            "\ufe0f",  # variation selector 16
            "\U000e0100",  # variation selector 17
            "\ue000",  # private use
            "\ud800",  # lone surrogate
            "\u200b",  # zero-width space
            "\u202e",  # right-to-left override
            "\x1b",  # escape
            "\x7f",  # delete
        )
        for char in hidden:
            with self.subTest(code_point=f"U+{ord(char):04X}"):
                self.assertTrue(pack_text.is_hidden(char))
                self.assertEqual(pack_text.clean(f"a{char}b"), "ab")

    def test_clean_keeps_visible_text_and_collapses_whitespace(self) -> None:
        text = "Café — naïve ☕ 日本語\n\tnext\u2028line\u00a0end"
        self.assertEqual(pack_text.clean(text), "Café — naïve ☕ 日本語 next line end")

    def test_one_line_keeps_spacing_but_never_breaks_the_line(self) -> None:
        printed = pack_text.one_line("a  b\tc\nd\re\u2028f\x1fg\u200bh")
        self.assertEqual(printed, "a  b\tc d e f gh")
        self.assertTrue(pack_text.unprintable("a\nb"))
        self.assertFalse(pack_text.unprintable("/Users/me/My  Projects/x"))

    def test_shell_special_characters_are_found_and_defanged(self) -> None:
        for text in ("$(id)", "`id`", 'say "hi"', "back\\slash"):
            with self.subTest(text=text):
                self.assertTrue(pack_text.shell_special(text))
                self.assertFalse(pack_text.shell_special(pack_text.neutral(text)))
        self.assertFalse(pack_text.shell_special("/Users/me/.claude/plugins/x/1.0"))

    def test_cap_cuts_long_text_at_the_limit_with_an_ellipsis(self) -> None:
        limit = pack_text.DESCRIPTION_CHARS_MAX
        self.assertEqual(pack_text.cap("short"), "short")
        self.assertEqual(pack_text.cap("x" * limit), "x" * limit)
        self.assertEqual(pack_text.cap("x" * (limit + 1)), "x" * (limit - 1) + "…")
        cut = pack_text.cap("word " * 300)
        self.assertLessEqual(len(cut), limit)
        self.assertTrue(cut.endswith("…") and not cut[-2].isspace())


if __name__ == "__main__":
    unittest.main()
