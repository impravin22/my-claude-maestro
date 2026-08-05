#!/usr/bin/env bash
#
# Smoke tests for install.sh.
#
# Nothing here installs anything. Every case passes --dry-run — which routes each
# install command through run() and only prints it — except --help and the
# unknown-flag case, which exit during argument parsing, before preflight. The
# only filesystem effect of a dry run is two self-cleaning `mktemp -d` calls in
# install.sh itself.
#
# install.sh is launched via "$BASH", not a bare `bash`. Those differ whenever a
# newer bash sits ahead of /bin/bash on PATH, and the version gate below reads
# the SUITE's interpreter — so a bare `bash` could report 3.2 while running the
# installer under 5.x, which is a silent false pass on the one CI leg that
# exists to prevent exactly that.
#
# The suite stubs claude/node/npx/curl onto PATH because install.sh's preflight
# exits 1 when any is missing and --dry-run does not bypass it. Without the
# stubs the suite would red-fail on CI for a reason unrelated to what it tests.
#
# WHY THIS EXISTS: under `set -u`, bash < 4.4 (macOS ships 3.2.57) treats an
# empty array as unset, so expanding an empty INSTALLED aborted the summary
# block. Bash 4.4 removed that behaviour, so the reproducing case CANNOT fail
# on newer bash — the suite says so out loud rather than reporting a false pass.
#
# Usage: bash tests/install-smoke.sh
# Exit:  0 all passed, 1 one or more failed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLER="$REPO_ROOT/install.sh"

PASS=0
FAIL=0

# install.sh preflight hard-exits on a missing tool even under --dry-run, so
# stub the four it checks. Stubs also make the suite hermetic: it behaves the
# same on a machine with a real `claude` as on one without.
STUB_DIR="$(mktemp -d)" || { echo "FATAL: could not create stub dir" >&2; exit 1; }
trap 'rm -rf "$STUB_DIR"' EXIT INT TERM
for tool in claude node npx curl; do
  printf '#!/bin/sh\nexit 0\n' > "$STUB_DIR/$tool"
  chmod +x "$STUB_DIR/$tool"
done
PATH="$STUB_DIR:$PATH"
export PATH

# Bash >= 4.4 does not error on an empty-array expansion under `set -u`, so the
# regression case below passes there whether or not the guard is present. Track
# it and say so, rather than letting a green run imply cover it does not give.
GUARD_REPRODUCES=1
if [ "${BASH_VERSINFO[0]}" -gt 4 ] ||
   { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -ge 4 ]; }; then
  GUARD_REPRODUCES=0
fi

# assert_run <description> <expected_exit> <flags...>
#
# Checks the exit status, and independently fails the case if stderr mentions an
# unbound variable — a `set -u` abort can coincide with an expected non-zero
# exit, so the status alone would not catch it.
assert_run() {
  local description="$1" expected_exit="$2"
  shift 2
  local stderr_file actual_exit stderr

  stderr_file="$(mktemp)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }

  "$BASH" "$INSTALLER" "$@" >/dev/null 2>"$stderr_file"
  actual_exit=$?
  stderr="$(cat "$stderr_file")"
  rm -f "$stderr_file"

  if [ "$actual_exit" -ne "$expected_exit" ]; then
    echo "FAIL: $description"
    echo "      expected exit $expected_exit, got $actual_exit"
    [ -n "$stderr" ] && echo "      stderr: $stderr"
    FAIL=$((FAIL + 1))
    return
  fi

  case "$stderr" in
    *"unbound variable"*)
      echo "FAIL: $description"
      echo "      set -u abort leaked to stderr: $stderr"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  echo "PASS: $description"
  PASS=$((PASS + 1))
}

# assert_no_home_abort
#
# Its own function rather than an assert_run case, because it needs to strip a
# variable from the environment and assert on the *manner* of failure, not just
# the status. `--dry-run` alone would not catch the regression: the escaped
# \$HOME expands inside eval, which dry-run skips, so the abort only ever fired
# on a real install. The preflight assertion is what makes it observable here.
# assert_home_guard <description> <env-setter...> -- runs install.sh with HOME
# in a hostile state and requires it to fail *via the guard*.
#
# Asserting only "exit 1 and no unbound variable" would be satisfied by the
# missing-tools preflight at install.sh:120-124, so a broken PATH stub would
# silently downgrade this case to a no-op that still reports green. Matching
# the guard's own message is what makes it a real assertion.
assert_home_guard() {
  local description="$1" mode="$2"
  local stderr_file actual_exit stderr

  stderr_file="$(mktemp)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }

  if [ "$mode" = "unset" ]; then
    env -u HOME "$BASH" "$INSTALLER" --dry-run >/dev/null 2>"$stderr_file"
  else
    HOME='' "$BASH" "$INSTALLER" --dry-run >/dev/null 2>"$stderr_file"
  fi
  actual_exit=$?
  stderr="$(cat "$stderr_file")"
  rm -f "$stderr_file"

  case "$stderr" in
    *"unbound variable"*)
      echo "FAIL: $description — set -u abort instead of a clean failure"
      echo "      stderr: $stderr"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  if [ "$actual_exit" -ne 1 ]; then
    echo "FAIL: $description — expected exit 1, got $actual_exit"
    FAIL=$((FAIL + 1))
    return
  fi

  case "$stderr" in
    *"Set HOME and re-run"*) ;;
    *)
      echo "FAIL: $description — exited 1, but not via the HOME guard"
      echo "      stderr: $stderr"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  echo "PASS: $description"
  PASS=$((PASS + 1))
}

# assert_stdout_contains <description> <needle> <flags...>
assert_stdout_contains() {
  local description="$1" needle="$2"
  shift 2
  local output

  output="$("$BASH" "$INSTALLER" "$@" 2>/dev/null)"

  case "$output" in
    *"$needle"*)
      echo "PASS: $description"
      PASS=$((PASS + 1))
      ;;
    *)
      echo "FAIL: $description"
      echo "      stdout did not contain: $needle"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# Absence assertion. Takes an ANCHOR as well as the forbidden needle: proving a
# string is absent is worthless if the run never got far enough to print it, and
# a bare absence check is the one assertion shape that passes on empty stdout.
# The anchor must appear or the case fails, so absence only counts when the run
# demonstrably reached the block under test.
assert_stdout_lacks() {
  local description="$1" needle="$2" anchor="$3"
  shift 3
  local output

  output="$("$BASH" "$INSTALLER" "$@" 2>/dev/null)"

  case "$output" in
    *"$anchor"*) ;;
    *)
      echo "FAIL: $description"
      echo "      run never reached the anchor: $anchor"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  case "$output" in
    *"$needle"*)
      echo "FAIL: $description"
      echo "      stdout unexpectedly contained: $needle"
      FAIL=$((FAIL + 1))
      ;;
    *)
      echo "PASS: $description"
      PASS=$((PASS + 1))
      ;;
  esac
}

echo "install.sh smoke tests — bash $BASH_VERSION"
if [ "$GUARD_REPRODUCES" -eq 0 ]; then
  echo "NOTE: bash >= 4.4 does not reproduce the empty-array 'set -u' abort."
  echo "      The two empty-install-set cases are ADVISORY on this interpreter"
  echo "      and pass with or without the fix. Run on bash 3.2 for cover."
  echo "      The HOME guard cases are unaffected and carry full cover here."
fi
echo ""

# Regression guard. Skipping every component leaves INSTALLED empty, the exact
# condition that used to abort the summary on bash 3.2.
assert_run "empty install set still prints a summary and exits 0" 0 \
  --dry-run --minimal --skip-superpowers --skip-Context7

# The summary must survive the empty case, not merely the exit status.
assert_stdout_contains "empty install set still reaches the Next steps block" \
  "Next steps:" --dry-run --minimal --skip-superpowers --skip-Context7

assert_run "full dry-run exits 0" 0 --dry-run
assert_run "minimal dry-run exits 0" 0 --dry-run --minimal
assert_run "help exits 0" 0 --help
assert_run "unknown flag exits 2" 2 --not-a-real-flag

# Dry-run has no banner; it prefixes each command it would have run. Asserting
# the prefix proves commands were previewed rather than executed.
assert_stdout_contains "dry-run previews commands instead of running them" \
  "[dry-run]" --dry-run --minimal

# Unset and set-but-empty are different states: only the first trips `set -u`.
# The second expanded silently and pointed mkdir at the filesystem root, which
# was the quieter and worse of the two pre-fix behaviours.
assert_home_guard "HOME unset fails fast instead of aborting mid-install" unset
assert_home_guard "HOME set-but-empty fails fast instead of writing to /" empty

# The leadership domain routes to three marketplaces, and the two that are not
# Pierrick's are easy to lose in a refactor because install_plugin de-duplicates
# marketplace adds — a wrong `marketplace` argument still emits a plausible
# install line while silently never registering the source.
assert_stdout_contains "leadership packs install from their own marketplaces" \
  "claude plugin marketplace add PierrickMartos/Leadership-Skills" --dry-run
assert_stdout_contains "pm-product-discovery installs from phuryn/pm-skills" \
  "claude plugin marketplace add phuryn/pm-skills" --dry-run
assert_stdout_contains "c-level pack installs from alirezarezvani/claude-skills" \
  "claude plugin marketplace add alirezarezvani/claude-skills" --dry-run

# Asserting the marketplace line alone is not enough: install_plugin de-duplicates
# marketplace adds, so a spec naming a marketplace that was never registered still
# prints a plausible install line and only fails at runtime. Pre-review this suite
# was green while shipping `c-level-advisor@claude-skills` — wrong on both sides
# (the marketplace registers as `claude-code-skills`, and the plugin is
# `c-level-skills`). These pin the exact upstream specs, verified live against each
# marketplace.json.
assert_stdout_contains "performance-management installs by its real spec" \
  "claude plugin install performance-management@leadership-skills" --dry-run
assert_stdout_contains "communication installs by its real spec" \
  "claude plugin install communication@leadership-skills" --dry-run
assert_stdout_contains "decision-making installs by its real spec" \
  "claude plugin install decision-making@leadership-skills" --dry-run
assert_stdout_contains "pm-product-discovery installs by its real spec" \
  "claude plugin install pm-product-discovery@pm-skills" --dry-run
assert_stdout_contains "c-level pack installs by its real spec" \
  "claude plugin install c-level-skills@claude-code-skills" --dry-run

# The intuitive whole-pack flag must expand to all three bundles, not just the
# one whose component name resembles it.
assert_stdout_lacks "--skip-leadership-skills skips every leadership bundle" \
  "claude plugin install communication@leadership-skills" \
  "claude plugin marketplace add phuryn/pm-skills" --dry-run --skip-leadership-skills

# Deliberate exclusion, not an oversight. pm-claude-skills scans clean but its
# README claims an official-directory listing that does not exist, so it wants a
# pinned SHA the installer cannot choose. Without this guard a future contributor
# "completes the set" and silently ships an unpinned dependency on 849 skills.
assert_stdout_lacks "pm-claude-skills is never auto-installed" \
  "mohitagw15856/pm-claude-skills" \
  "claude plugin marketplace add PierrickMartos/Leadership-Skills" --dry-run

echo ""
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
