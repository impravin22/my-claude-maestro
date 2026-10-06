"""Shared fixtures for the tests of skills/maestro/scripts/find-pack.py.

Not a test module: its name does not match test_*.py. Each test builds its own
fake ~/.claude (install record, plugin cache, maestro-packs.json), registry and
managed-settings directory in a temporary folder, so nothing on the machine
running the suite is read or written.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import textwrap
import unittest
from collections.abc import Mapping
from types import ModuleType

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(REPO_ROOT, "skills", "maestro", "scripts")
SCRIPT = os.path.join(SCRIPTS_DIR, "find-pack.py")
PACK_TEXT = os.path.join(SCRIPTS_DIR, "pack_text.py")
LINT = os.path.join(REPO_ROOT, "tests", "skill-bundle-lint.py")
REAL_REGISTRY = os.path.join(
    REPO_ROOT, "skills", "maestro", "references", "skill-pack-registry.md"
)
SPEC = "decision-making@leadership-skills"
REGISTRY = textwrap.dedent(
    """\
    # Skill Pack Registry

    ## Loading a pack

    1. Run the helper.

    | Domain | Plugin | Marketplace | Connectors |
    | --- | --- | --- | --- |
    | Leadership | `decision-making` | `leadership-skills` | no |
    | Social media | `social-media-skills` | `social-media-skills` | no |
    | Delivery | `pm-comms`, `pm-delivery` | `pm-claude-skills` | no |
    | Marketing | `marketing-skills` | `marketingskills` | no |

    ## Project defaults

    | Domain | Plugin | Marketplace | Connectors |
    | --- | --- | --- | --- |
    | Elsewhere | `outside-section` | `nowhere` | no |
    """
)
FOLDED = (
    "name: decision-memo\n"
    "description: >\n"
    "  Structures a decision into a memo.\n"
    "  Use it before a meeting."
)
PLAIN = "name: adversarial-review\ndescription: Stress-tests a decision."


def load_script(name: str, path: str) -> ModuleType:
    """Imports a script whose file name is not a valid module name."""
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True  # Keep __pycache__ out of the plugin payload.
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


find_pack = load_script("find_pack", SCRIPT)
# The module find-pack.py imports from its own folder, as that script sees it.
pack_text = find_pack.pack_text


def write(path: str, text: str) -> str:
    """Writes text to path, creating its folders, and returns the path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return path


class Sandbox(unittest.TestCase):
    """A fake home, plugin cache, registry and empty managed settings."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        # Real path: macOS hands out /var/..., which resolves to /private/var.
        self.root = os.path.realpath(temporary.name)
        self.home = os.path.join(self.root, "home", ".claude")
        self.cache = os.path.join(self.home, "plugins", "cache")
        self.project = os.path.join(self.root, "work", "shop-site")
        self.managed = os.path.join(self.root, "managed")
        for folder in (self.cache, self.project, self.managed):
            os.makedirs(folder)
        self.registry = write(os.path.join(self.root, "registry.md"), REGISTRY)
        self.plugins: dict[str, list[dict[str, str]]] = {}

    def add_pack(
        self,
        spec: str,
        skills: Mapping[str, str],
        scope: str = "user",
        project: str | None = None,
        version: str = "1.0.0",
    ) -> str:
        """Writes a pack into the fake cache, records it, returns its folder."""
        plugin, marketplace = spec.split("@")
        folder = os.path.join(self.cache, marketplace, plugin, version)
        os.makedirs(os.path.join(folder, "skills"), exist_ok=True)
        for name, header in skills.items():
            write(
                os.path.join(folder, "skills", name, "SKILL.md"),
                f"---\n{header}\n---\n\n# {name}\n\nBody text.\n",
            )
        self.record(spec, folder, scope, project)
        return folder

    def record(
        self,
        spec: str,
        install_path: str,
        scope: str = "user",
        project: str | None = None,
    ) -> None:
        """Adds one entry to the fake install record."""
        entry = {"scope": scope, "installPath": install_path, "version": "1.0.0"}
        if project is not None:
            entry["projectPath"] = project
        self.plugins.setdefault(spec, []).append(entry)
        self.save_record({"version": 2, "plugins": self.plugins})

    def save_record(self, record: object) -> None:
        """Writes the install record: JSON for an object, raw text for a str."""
        text = record if isinstance(record, str) else json.dumps(record)
        write(os.path.join(self.home, "plugins", "installed_plugins.json"), text)

    def manage(self, name: str, settings: object) -> None:
        """Writes a managed-settings file, or a drop-in when name has a slash."""
        text = settings if isinstance(settings, str) else json.dumps(settings)
        write(os.path.join(self.managed, name), text)

    def run_main(self, *argv: str, cwd: str | None = None) -> tuple[int, list[str]]:
        """Runs the script in-process against the sandbox."""
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = find_pack.main(
                list(argv),
                registry_path=self.registry,
                claude_home=self.home,
                managed_dirs=[self.managed],
                cwd=cwd or self.project,
            )
        return code, output.getvalue().splitlines()

    def assert_outcome(
        self, code: int, lines: list[str], status: str, exit_code: int
    ) -> None:
        """Asserts a single status line and its exit code."""
        self.assertEqual((code, len(lines)), (exit_code, 1), lines)
        self.assertTrue(lines[0].startswith(f"{status}: "), lines)
