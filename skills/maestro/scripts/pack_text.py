"""Reads SKILL.md frontmatter and makes third-party text safe to print.

find-pack.py imports this module from its own folder. Python 3.9 standard
library only, for the same reason: both run from the plugin cache, where the
only interpreter may be the macOS system python3.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Sequence

# The longest description printed, ellipsis included: enough to choose a skill
# by, and a pack cannot flood the context with its own text.
DESCRIPTION_CHARS_MAX = 500
# Unicode categories that print nothing visible or can hide text: controls
# other than whitespace (Cc); format characters such as zero-width,
# bidirectional, soft-hyphen and tag marks (Cf); private use (Co); and
# surrogates (Cs).
_HIDDEN_CATEGORIES = frozenset({"Cc", "Cf", "Co", "Cs"})
# Code points outside those categories that still hide text: the whole tag
# block, part of it unassigned, and the variation selectors, which can carry
# data invisibly.
_HIDDEN_RANGES = ((0xE0000, 0xE007F), (0xFE00, 0xFE0F), (0xE0100, 0xE01EF))
# Characters a shell acts on inside double quotes.
_SHELL_SPECIAL_RE = re.compile(r'[$`"\\]')


def is_hidden(char: str) -> bool:
    """Returns whether a character is invisible or a control, bar whitespace."""
    if char.isspace():
        return False
    point = ord(char)
    if any(low <= point <= high for low, high in _HIDDEN_RANGES):
        return True
    return unicodedata.category(char) in _HIDDEN_CATEGORIES


def strip_hidden(text: str) -> str:
    """Returns text without invisible or control characters."""
    return "".join(char for char in text if not is_hidden(char))


def clean(text: str) -> str:
    """Returns text on one line, whitespace collapsed, hidden characters gone."""
    return " ".join(strip_hidden(text).split())


def one_line(text: str) -> str:
    """Returns text as it prints, on one line.

    Hidden characters go, and any whitespace character other than a space or
    a tab becomes a space, so a path keeps its own spacing.
    """
    return "".join(
        " " if char.isspace() and char not in " \t" else char
        for char in strip_hidden(text)
    )


def unprintable(text: str) -> bool:
    """Returns whether text would change on its way to one printed line."""
    return one_line(text) != text


def shell_special(text: str) -> bool:
    """Returns whether a shell would expand part of text in double quotes."""
    return bool(_SHELL_SPECIAL_RE.search(text))


def neutral(text: str) -> str:
    """Returns text with each shell-special character replaced by "?"."""
    return _SHELL_SPECIAL_RE.sub("?", text)


def cap(text: str, limit: int = DESCRIPTION_CHARS_MAX) -> str:
    """Returns text cut to at most limit characters, ending in "…" when cut."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


# --- YAML frontmatter --------------------------------------------------------
# Enough YAML for a SKILL.md header: top-level keys whose values are plain,
# quoted or block scalars. Nested values are read as text and never used.

_KEY_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:(?:[ \t]+(.*))?")
_BLOCK_HEADER_RE = re.compile(r"([|>])([1-9]?)([+-]?)([1-9]?)(?:[ \t]+#.*)?")
# One blank before "#" starts a comment. Matching a single blank keeps the
# search linear; "[ \t]+#" re-scanned every run of blanks from each start.
_COMMENT_RE = re.compile(r"[ \t]#")
_ESCAPED_BREAK_RE = re.compile(r"\\\n[ \t]*")


def frontmatter_lines(text: str, truncated: bool = False) -> list[str] | None:
    """Returns the lines between a leading --- line and the next one.

    Args:
        text: The start of the file.
        truncated: Whether text was cut short, so its last line may be partial.

    Returns:
        The frontmatter lines, or None when the block is missing or unclosed.
    """
    lines = text.split("\n")
    if truncated:
        lines = lines[:-1]
    if not lines or lines[0].rstrip() != "---":
        return None
    for index in range(1, len(lines)):
        if lines[index].rstrip() == "---":
            return lines[1:index]
    return None


def parse_frontmatter(lines: Sequence[str]) -> dict[str, str]:
    """Returns the top-level keys of a frontmatter block as text values.

    A value runs on over the indented and blank lines after its key, which is
    how block scalars and multi-line plain or quoted scalars continue. A
    repeated key keeps its last value, as common YAML loaders do.
    """
    fields: dict[str, str] = {}
    index = 0
    while index < len(lines):
        match = _KEY_RE.fullmatch(lines[index].rstrip())
        index += 1
        if match is None:
            continue
        start = index
        while index < len(lines) and (
            lines[index][:1] in (" ", "\t") or not lines[index].strip()
        ):
            index += 1
        fields[match.group(1)] = scalar(match.group(2) or "", lines[start:index])
    return fields


def scalar(first: str, rest: Sequence[str]) -> str:
    """Returns a value from the text after its key and its continuation lines."""
    head = first.strip()
    header = _BLOCK_HEADER_RE.fullmatch(head)
    if header is not None:
        style, indent_before, _, indent_after = header.groups()
        return block_scalar(style, int(indent_before or indent_after or 0), rest)
    if head[:1] == '"':
        return double_quoted("\n".join([head, *rest]))
    if head[:1] == "'":
        return single_quoted("\n".join([head, *rest]))
    return plain_scalar(head, rest)


def block_scalar(style: str, indent: int, lines: Sequence[str]) -> str:
    """Returns the text of a literal (|) or folded (>) block scalar.

    A chomping indicator (- or +) decides only trailing line breaks, which a
    description printed on one line never shows, so it is read but not applied.

    Args:
        style: "|" keeps line breaks; ">" folds single ones into spaces.
        indent: The indentation indicator, or 0 to take the first non-blank
            line's indentation.
        lines: The lines after the header.
    """
    if not indent:
        indent = next(
            (len(line) - len(line.lstrip(" ")) for line in lines if line.strip()), 0
        )
    content: list[str] = []
    for line in lines:
        if line.strip() and len(line) - len(line.lstrip(" ")) < indent:
            break
        content.append(line[indent:] if line.strip() else "")
    if style == "|":
        return "\n".join(content).strip("\n")
    return _join_lines(content)


def _join_lines(lines: Sequence[str]) -> str:
    """Folds lines: a single line break becomes a space, a blank line a break."""
    text = ""
    blanks = 0
    for line in lines:
        if not line:
            blanks += 1
            continue
        if text:
            text += "\n" * blanks if blanks else " "
        text += line
        blanks = 0
    return text


def _fold_quoted(body: str) -> str:
    return _join_lines([line.strip(" \t") for line in body.split("\n")])


def double_quoted(text: str) -> str:
    """Returns a double-quoted scalar; text starts at its opening quote.

    JSON's escapes are a subset of YAML's. A YAML-only escape such as \\x41
    leaves the text as written rather than guessed at.
    """
    end = 1
    while end < len(text) and text[end] != '"':
        end += 2 if text[end] == "\\" else 1
    body = _fold_quoted(_ESCAPED_BREAK_RE.sub("", text[1:end]))
    try:
        return json.loads(f'"{body}"', strict=False)
    except ValueError:
        return body


def single_quoted(text: str) -> str:
    """Returns a single-quoted scalar; text starts at its opening quote."""
    end = 1
    while end < len(text):
        if text[end] == "'":
            if text[end + 1 : end + 2] != "'":
                break
            end += 1
        end += 1
    return _fold_quoted(text[1:end]).replace("''", "'")


def _without_comment(text: str) -> str:
    text = text.strip()
    if text.startswith("#"):
        return ""
    return _COMMENT_RE.split(text, maxsplit=1)[0].rstrip()


def plain_scalar(first: str, rest: Sequence[str]) -> str:
    """Returns a plain scalar, folding its indented continuation lines."""
    parts = [_without_comment(first)]
    for line in rest:
        if line.strip().startswith("#"):
            break
        parts.append(_without_comment(line))
    return _join_lines(parts)
