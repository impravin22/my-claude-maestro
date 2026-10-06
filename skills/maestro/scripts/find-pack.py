#!/usr/bin/env python3
"""Finds a domain pack maestro routes to, on disk, and lists its skills.

Usage:
    find-pack.py <plugin>@<marketplace>
    find-pack.py --project <dir>

The first form resolves a pack named in the routing table of
../references/skill-pack-registry.md and prints its folder, then one line per
skill: the skill's name and description, cut at 500 characters. The second
prints the packs that ~/.claude/maestro-packs.json names for <dir>.

Each run prints a one-line status first and exits with its code:
    0 found        3 not installed   4 blocked (managed settings switch it off)
    5 not routed   6 unsafe path     7 unreadable or changed-shape record
    8 no defaults (--project only)   2 usage error   1 unexpected error
It never prints a traceback.

Python 3.9 standard library only, plus pack_text.py beside it: the script runs
from the plugin cache, where the only interpreter may be the macOS system
python3.
"""

from __future__ import annotations

import argparse
import enum
import json
import os
import re
import sys
from collections.abc import Sequence
from typing import NamedTuple, NoReturn

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
try:
    import pack_text  # ships beside this script
except ImportError as missing:
    sys.exit(f"error: unexpected ImportError: {missing}")

REGISTRY_PATH = os.path.join(
    os.path.dirname(SCRIPT_DIR), "references", "skill-pack-registry.md"
)
# File-based managed settings, as https://code.claude.com/docs/en/managed-settings
# gave them on 2026-10-06: managed-settings.json first, then every *.json file in
# managed-settings.d/ in alphabetical order (hidden files ignored), a later file
# winning per plugin. MDM profiles, the Windows registry and server-managed
# settings are not files, so a block delivered only through one of those is not
# seen here.
MANAGED_SETTINGS_DIRS: tuple[str, ...] = (
    "/Library/Application Support/ClaudeCode",  # macOS
    "/etc/claude-code",  # Linux and WSL
) + (("C:\\Program Files\\ClaudeCode",) if os.name == "nt" else ())
# The installed_plugins.json shape this script reads: {"version": 2, "plugins":
# {spec: [{"scope": ..., "installPath": ..., "projectPath": ...}, ...]}}. The
# file is Claude Code's own record, so any other shape stops the lookup.
INSTALL_RECORD_VERSION = 2
# A frontmatter block longer than this is refused rather than read: descriptions
# are third-party text, and an unbounded one would flood the context.
FRONTMATTER_CHARS_MAX = 64 * 1024
# disable-model-invocation lets a skill through only when its value is plainly
# off; anything else, a YAML tag such as "!!bool true" included, skips it.
FALSE_WORDS = frozenset({"", "false", "no", "off", "0"})
# A skill folder with more entries than this is skipped rather than walked for
# symlinks, so an enormous tree cannot stall the lookup.
SKILL_ENTRIES_MAX = 20_000


class Status(enum.IntEnum):
    """Exit codes; label() gives the word each run prints first."""

    FOUND = 0
    ERROR = 1
    USAGE_ERROR = 2
    NOT_INSTALLED = 3
    BLOCKED = 4
    NOT_ROUTED = 5
    UNSAFE_PATH = 6
    UNREADABLE = 7
    NO_DEFAULTS = 8


def label(status: Status) -> str:
    """Returns a status as printed: NOT_INSTALLED is "not installed"."""
    return status.name.lower().replace("_", " ")


class Outcome(Exception):
    """Ends a lookup with a status other than found, and a one-line reason."""

    def __init__(self, status: Status, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


class SkippedSkill(Exception):
    """A skill that exists but must not be offered for loading."""


class Skill(NamedTuple):
    """A loadable skill: its folder under skills/, its name and description."""

    folder: str
    name: str
    description: str


def describe(error: BaseException) -> str:
    """Returns an error's message without its type or traceback."""
    if isinstance(error, OSError) and error.strerror:
        return error.strerror
    return str(error) or type(error).__name__


def changed_shape(path: str, detail: str) -> Outcome:
    """Returns the outcome for a record whose shape is not the expected one."""
    return Outcome(Status.UNREADABLE, f"{path} has changed shape: {detail}")


def real_path(path: str) -> str:
    """Resolves every symlink in path; a NUL byte makes it an unsafe path."""
    try:
        return os.path.realpath(path)
    except ValueError:
        raise Outcome(Status.UNSAFE_PATH, f"{path!r} holds a NUL byte") from None


def is_within(path: str, root: str) -> bool:
    """Returns whether path is root or sits inside it; pass real paths."""
    return path == root or path.startswith(root.rstrip(os.sep) + os.sep)


def read_text(path: str) -> str:
    """Reads a whole UTF-8 file; any failure is an unreadable record."""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except (OSError, ValueError) as error:
        raise Outcome(
            Status.UNREADABLE, f"cannot read {path}: {describe(error)}"
        ) from None


def load_json(path: str) -> object:
    """Parses a JSON file; any failure is an unreadable record."""
    text = read_text(path)
    try:
        return json.loads(text)
    except (ValueError, RecursionError) as error:
        raise Outcome(
            Status.UNREADABLE, f"cannot parse {path}: {describe(error)}"
        ) from None


# --- The routing table -------------------------------------------------------

_HEADING_RE = re.compile(r"^## Loading a pack[ \t]*$", re.M)
_NEXT_HEADING_RE = re.compile(r"^## ", re.M)
_BACKTICKED_RE = re.compile(r"`([^`]*)`")
# A pack, marketplace or skill-folder name: nothing a shell would expand.
_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_NOT_NAME_CHAR_RE = re.compile(r"[^A-Za-z0-9._-]")
_SEPARATOR_CELL_RE = re.compile(r":?-{3,}:?")


def _cells(row: str) -> list[str]:
    return [cell.strip() for cell in row.strip().strip("|").split("|")]


def _is_separator(cells: Sequence[str]) -> bool:
    return all(_SEPARATOR_CELL_RE.fullmatch(cell) for cell in cells)


def _row_specs(cells: Sequence[str], columns: tuple[int, int] | None) -> list[str]:
    if columns is None or len(cells) <= max(columns):
        return []
    plugins = _BACKTICKED_RE.findall(cells[columns[0]])
    markets = _BACKTICKED_RE.findall(cells[columns[1]])
    if len(markets) != 1 or not all(_NAME_RE.fullmatch(n) for n in plugins + markets):
        return []
    return [f"{plugin}@{markets[0]}" for plugin in plugins]


def routed_specs(registry: str) -> list[str]:
    """Returns the plugin@marketplace specs in the registry's routing table.

    Args:
        registry: The text of skill-pack-registry.md.

    Returns:
        Each spec the table under "## Loading a pack" names, in table order. A
        row that does not parse adds nothing: tests/skill-bundle-lint.py fails
        CI on such a row, so at run time it can only narrow routing.

    Raises:
        Outcome: UNREADABLE when the heading or the table is missing.
    """
    heading = _HEADING_RE.search(registry)
    if heading is None:
        raise Outcome(Status.UNREADABLE, "the registry has no Loading a pack heading")
    section = registry[heading.end() :]
    following = _NEXT_HEADING_RE.search(section)
    if following is not None:
        section = section[: following.start()]
    rows = [_cells(line) for line in section.splitlines() if line.lstrip()[:1] == "|"]
    specs: list[str] = []
    columns: tuple[int, int] | None = None
    for index, cells in enumerate(rows):
        if _is_separator(cells):
            continue
        if index + 1 < len(rows) and _is_separator(rows[index + 1]):
            named = "Plugin" in cells and "Marketplace" in cells
            columns = (
                (cells.index("Plugin"), cells.index("Marketplace")) if named else None
            )
            continue
        specs.extend(_row_specs(cells, columns))
    if not specs:
        raise Outcome(Status.UNREADABLE, "the registry has no routing table to read")
    return specs


# --- One pack ----------------------------------------------------------------


def _managed_files(directory: str) -> list[str]:
    """Lists one managed-settings directory's files in Claude Code's order."""
    if not os.path.isdir(directory):
        return []
    drop_ins = os.path.join(directory, "managed-settings.d")
    try:
        entries = set(os.listdir(directory))
        names = sorted(os.listdir(drop_ins)) if "managed-settings.d" in entries else []
    except OSError as error:
        raise Outcome(
            Status.UNREADABLE, f"cannot list {directory}: {describe(error)}"
        ) from None
    files = []
    if "managed-settings.json" in entries:
        files.append(os.path.join(directory, "managed-settings.json"))
    files.extend(
        os.path.join(drop_ins, name)
        for name in names
        if name.endswith(".json") and not name.startswith(".")
    )
    return files


def check_managed(spec: str, managed_dirs: Sequence[str]) -> None:
    """Refuses a pack that managed settings switch off.

    Raises:
        Outcome: BLOCKED when the merged enabledPlugins sets spec to false.
            UNREADABLE when a managed file cannot be read or has another
            shape: a policy that cannot be read cannot show that it allows
            the pack.
    """
    for directory in managed_dirs:
        value = None
        for path in _managed_files(directory):
            settings = load_json(path)
            if not isinstance(settings, dict):
                raise changed_shape(path, "expected an object")
            plugins = settings.get("enabledPlugins")
            if not isinstance(plugins, (dict, type(None))):
                raise changed_shape(path, "enabledPlugins is not a map")
            if plugins and spec in plugins:
                value = plugins[spec]
                if not isinstance(value, bool):
                    raise changed_shape(path, f"{spec} is not true or false")
        if value is False:
            raise Outcome(
                Status.BLOCKED, f"managed settings in {directory} switch {spec} off"
            )


def install_entry(spec: str, claude_home: str, cwd: str) -> dict[str, object]:
    """Returns the install-record entry that applies in cwd.

    A user-scope entry wins; otherwise a local or project entry whose
    projectPath is cwd. A missing entry means not installed: a cache folder no
    record points at may be stale, so there is no fallback to the cache.

    Raises:
        Outcome: NOT_INSTALLED without an applicable entry, UNREADABLE when the
            record cannot be read or has changed shape.
    """
    path = os.path.join(claude_home, "plugins", "installed_plugins.json")
    if not os.path.lexists(path):
        raise Outcome(Status.NOT_INSTALLED, f"{spec}: there is no install record")
    record = load_json(path)
    plugins = record.get("plugins") if isinstance(record, dict) else None
    if not isinstance(plugins, dict) or record.get("version") != INSTALL_RECORD_VERSION:
        raise changed_shape(path, f"expected version {INSTALL_RECORD_VERSION}")
    entries = plugins.get(spec, [])
    if not isinstance(entries, list) or not all(
        isinstance(entry, dict) and isinstance(entry.get("scope"), str)
        for entry in entries
    ):
        raise changed_shape(path, f"{spec} is not a list of scoped entries")
    for entry in entries:
        if entry["scope"] == "user":
            return entry
    here = real_path(cwd)
    for entry in entries:
        if entry["scope"] in ("local", "project"):
            project = entry.get("projectPath")
            if not isinstance(project, str):
                raise changed_shape(path, f"a {spec} entry has no projectPath")
            if real_path(project) == here:
                return entry
    raise Outcome(
        Status.NOT_INSTALLED, f"{spec} has no user-scope install and none for {here}"
    )


def pack_folder(spec: str, entry: dict[str, object], claude_home: str) -> str:
    """Returns the real path of the folder an install-record entry names.

    Raises:
        Outcome: UNREADABLE without an installPath. UNSAFE_PATH when it is
            relative, resolves anywhere but inside ~/.claude/plugins/cache, or
            holds a character a shell or terminal would act on, since the
            model reads files by this path. NOT_INSTALLED when it is gone.
    """
    install_path = entry.get("installPath")
    if not isinstance(install_path, str) or not install_path:
        raise Outcome(Status.UNREADABLE, f"the {spec} install entry has no installPath")
    if not os.path.isabs(install_path):
        raise Outcome(Status.UNSAFE_PATH, f"{spec} installPath is not absolute")
    cache = real_path(os.path.join(claude_home, "plugins", "cache"))
    folder = real_path(install_path)
    if folder == cache or not is_within(folder, cache):
        raise Outcome(
            Status.UNSAFE_PATH,
            f"{spec} resolves to {pack_text.neutral(folder)}, outside {cache}",
        )
    if pack_text.unprintable(folder) or pack_text.shell_special(folder):
        raise Outcome(
            Status.UNSAFE_PATH,
            f"{spec} has a folder path with characters a shell or terminal acts on",
        )
    if not os.path.isdir(folder):
        raise Outcome(Status.NOT_INSTALLED, f"{spec}: {folder} is missing")
    return folder


def read_head(path: str) -> str:
    """Reads the start of a file, refusing a symlink as its last component."""
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with open(descriptor, encoding="utf-8-sig") as handle:
            return handle.read(FRONTMATTER_CHARS_MAX)
    except (OSError, ValueError) as error:
        raise SkippedSkill(f"unreadable ({describe(error)})") from None


def check_tree(skill_dir: str, pack: str) -> None:
    """Refuses a skill folder holding a symlink that leaves the pack.

    A skill's own files can be read once it loads, so a link to anything
    outside the pack, at any depth, would hand that file to the model.

    Raises:
        SkippedSkill: A symlink resolves outside the pack, a folder inside
            cannot be read, or there are more than SKILL_ENTRIES_MAX entries.
    """

    def unreadable(error: OSError) -> NoReturn:
        raise SkippedSkill(f"unreadable inside ({describe(error)})")

    seen = 0
    for top, folders, files in os.walk(skill_dir, onerror=unreadable):
        for name in folders + files:
            seen += 1
            if seen > SKILL_ENTRIES_MAX:
                raise SkippedSkill(f"more than {SKILL_ENTRIES_MAX} entries to check")
            path = os.path.join(top, name)
            if os.path.islink(path) and not is_within(os.path.realpath(path), pack):
                raise SkippedSkill("a symlink inside it leads out of the pack")


def read_skill(pack: str, entry: str) -> Skill | None:
    """Reads skills/<entry>/SKILL.md in a pack folder.

    Returns:
        The skill, or None when the entry holds no SKILL.md (a helper folder).

    Raises:
        SkippedSkill: The skill exists but must not be offered.
    """
    skill_dir = os.path.join(pack, "skills", entry)
    skill_file = os.path.join(skill_dir, "SKILL.md")
    if not os.path.islink(skill_dir) and not os.path.lexists(skill_file):
        return None
    if not _NAME_RE.fullmatch(entry):
        raise SkippedSkill("an unsafe folder name")
    if os.path.islink(skill_dir) or os.path.islink(skill_file):
        raise SkippedSkill("a symlink")
    if not os.path.isfile(skill_file):
        return None
    if not is_within(os.path.realpath(skill_file), pack):
        raise SkippedSkill("an unsafe path")
    check_tree(skill_dir, pack)
    head = read_head(skill_file)
    truncated = len(head) >= FRONTMATTER_CHARS_MAX
    lines = pack_text.frontmatter_lines(head, truncated=truncated)
    if lines is None:
        raise SkippedSkill(f"no frontmatter within {FRONTMATTER_CHARS_MAX} characters")
    fields = pack_text.parse_frontmatter(lines)
    if fields.get("disable-model-invocation", "").strip().lower() not in FALSE_WORDS:
        raise SkippedSkill("disable-model-invocation is not off")
    name = pack_text.clean(fields.get("name", "")) or entry
    return Skill(entry, name, pack_text.clean(fields.get("description", "")))


def list_skills(pack: str) -> tuple[list[Skill], list[str]]:
    """Returns a pack's loadable skills and a note for each one skipped."""
    skills_dir = os.path.join(pack, "skills")
    if os.path.islink(skills_dir) or not os.path.isdir(skills_dir):
        return [], ["skipped skills/: a symlink, or missing"]
    try:
        entries = sorted(os.listdir(skills_dir))
    except OSError as error:
        raise Outcome(
            Status.UNREADABLE, f"cannot list {skills_dir}: {describe(error)}"
        ) from None
    skills: list[Skill] = []
    notes: list[str] = []
    for entry in entries:
        if entry.startswith("."):
            continue
        try:
            skill = read_skill(pack, entry)
        except SkippedSkill as skipped:
            # An unsafe name is shown defanged, never as written.
            notes.append(f"skipped {_NOT_NAME_CHAR_RE.sub('?', entry)}: {skipped}")
            continue
        if skill is not None:
            skills.append(skill)
    return skills, notes


def find_pack(
    spec: str,
    routed: Sequence[str],
    claude_home: str,
    managed_dirs: Sequence[str],
    cwd: str,
) -> list[str]:
    """Returns the report for a pack that is found; other outcomes raise.

    Raises:
        Outcome: Any status but FOUND.
    """
    if spec not in routed:
        raise Outcome(
            Status.NOT_ROUTED, f"{spec} is not in the registry's routing table"
        )
    check_managed(spec, managed_dirs)
    folder = pack_folder(spec, install_entry(spec, claude_home, cwd), claude_home)
    skills, notes = list_skills(folder)
    lines = [f"found: {spec}", f"folder: {folder}"]
    for skill in skills:
        name = skill.folder
        if skill.name != skill.folder:
            name += f" (name: {pack_text.neutral(skill.name)})"
        description = pack_text.cap(skill.description) or "(no description)"
        lines.append(f"- {name}: {description}")
    if not skills:
        lines.append("no loadable skills in this pack")
    return lines + notes


# --- Project defaults --------------------------------------------------------


def load_projects(path: str) -> dict[str, list[str]]:
    """Reads maestro-packs.json, which maps project folders to pack names.

    Raises:
        Outcome: UNREADABLE when the file cannot be read or has another shape.
    """
    data = load_json(path)
    projects = data.get("projects") if isinstance(data, dict) else None
    if not isinstance(projects, dict) or not all(
        isinstance(packs, list) and all(isinstance(name, str) for name in packs)
        for packs in projects.values()
    ):
        raise changed_shape(path, 'expected {"projects": {folder: [pack, ...]}}')
    return projects


def resolve_names(
    names: Sequence[str], routed: Sequence[str]
) -> tuple[list[str], list[str]]:
    """Maps pack names, bare or plugin@marketplace, onto routed specs.

    Returns:
        The routed specs in first-seen order, and the names that match no
        routed pack or more than one.
    """
    candidates: dict[str, set[str]] = {}
    for spec in routed:
        for name in (spec, spec.split("@", 1)[0]):
            candidates.setdefault(name, set()).add(spec)
    honoured: list[str] = []
    ignored: list[str] = []
    for name in names:
        matches = candidates.get(name, set())
        if len(matches) == 1:
            (spec,) = matches
            if spec not in honoured:
                honoured.append(spec)
        elif name not in ignored:
            ignored.append(name)
    return honoured, ignored


def covering_key(
    projects: dict[str, list[str]], here: str
) -> tuple[str | None, list[str]]:
    """Returns the longest key covering here, and the keys that never can.

    A key covers here when here is that folder or sits inside it, comparing
    real paths, so /x/shop covers /x/shop/web but not /x/shop-site. A leading
    ~ is expanded; a key that is still relative matches nothing.
    """
    best: tuple[int, str] | None = None
    relative: list[str] = []
    for key in projects:
        expanded = os.path.expanduser(key)
        if not os.path.isabs(expanded):
            relative.append(key)
            continue
        root = real_path(expanded)
        if is_within(here, root) and (best is None or len(root) > best[0]):
            best = (len(root), key)
    return (best[1] if best else None), relative


def project_defaults(
    directory: str, routed: Sequence[str], claude_home: str
) -> list[str]:
    """Returns the routed packs maestro-packs.json names for directory.

    Raises:
        Outcome: NO_DEFAULTS when no key covers the directory or its entry is
            empty, NOT_ROUTED when it names only unknown packs, UNREADABLE
            when the file cannot be read or has changed shape.
    """
    path = os.path.join(claude_home, "maestro-packs.json")
    if not os.path.lexists(path):
        raise Outcome(Status.NO_DEFAULTS, f"{path} does not exist")
    projects = load_projects(path)
    here = real_path(os.path.abspath(directory))
    key, relative = covering_key(projects, here)
    if key is None:
        note = f"; relative keys never match: {', '.join(relative)}" if relative else ""
        raise Outcome(Status.NO_DEFAULTS, f"no key in {path} covers {here}{note}")
    honoured, ignored = resolve_names(projects[key], routed)
    if not honoured and ignored:
        raise Outcome(
            Status.NOT_ROUTED,
            f"the {key} entry names no routed pack: {', '.join(ignored)}",
        )
    if not honoured:
        raise Outcome(Status.NO_DEFAULTS, f"the {key} entry lists no packs")
    lines = [f"found: project defaults for {here} (key {key})", *honoured]
    if ignored:
        lines.append(f"ignored, not routed or ambiguous: {', '.join(ignored)}")
    return lines


# --- Command line ------------------------------------------------------------


class _Parser(argparse.ArgumentParser):
    """Reports a usage error on one line, like every other outcome."""

    def error(self, message: str) -> NoReturn:
        self.exit(
            Status.USAGE_ERROR,
            f"{label(Status.USAGE_ERROR)}: {message} (usage: {self.prog} "
            "<plugin>@<marketplace> | --project <dir>)\n",
        )


def _parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="find-pack.py", description=(__doc__ or "").split("\n")[0])
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument(
        "spec",
        nargs="?",
        metavar="<plugin>@<marketplace>",
        help="a pack from the registry's routing table",
    )
    target.add_argument(
        "--project",
        metavar="DIR",
        help="print the packs ~/.claude/maestro-packs.json names for DIR",
    )
    return parser


def emit(lines: Sequence[str]) -> None:
    """Prints each line as one line; a reader that stops early is no error."""
    text = "".join(pack_text.one_line(line) + "\n" for line in lines)
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        sys.stdout.write(text.encode(encoding, "replace").decode(encoding))
        sys.stdout.flush()
    except BrokenPipeError:
        # `| head -4` closed the pipe. Point stdout at devnull so the
        # interpreter's own flush at exit cannot print an error either.
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except (OSError, ValueError):
            pass  # stdout is already unusable; there is nothing left to tell


def main(
    argv: Sequence[str] | None = None,
    *,
    registry_path: str = REGISTRY_PATH,
    claude_home: str | None = None,
    managed_dirs: Sequence[str] = MANAGED_SETTINGS_DIRS,
    cwd: str | None = None,
) -> int:
    """Runs the command line and returns its exit code.

    The keyword arguments exist for tests. They have no command-line flags, so
    no command a pack's text suggests can point a lookup somewhere else.
    """
    args = _parser().parse_args(argv)
    home = claude_home or os.path.join(os.path.expanduser("~"), ".claude")
    try:
        routed = routed_specs(read_text(registry_path))
        if args.project is not None:
            lines = project_defaults(args.project, routed, home)
        else:
            here = cwd or os.getcwd()
            lines = find_pack(args.spec, routed, home, managed_dirs, here)
        status = Status.FOUND
    except Outcome as outcome:
        status, lines = outcome.status, [f"{label(outcome.status)}: {outcome.reason}"]
    except Exception as error:  # The contract is one line, never a traceback.
        status = Status.ERROR
        lines = [f"{label(status)}: unexpected {type(error).__name__}: {error}"]
    emit(lines)
    return int(status)


if __name__ == "__main__":
    sys.exit(main())
