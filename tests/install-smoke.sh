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

# assert_pin_guard <description> <mode: match|mismatch|missing|dirty>
#
# Every other pin case runs under --dry-run, which deliberately short-circuits
# verify_pinned_sha — so without this the abort that makes the pin meaningful is
# never executed by the suite at all. Rather than perform a real install, lift
# the function out of install.sh and exercise it against a scratch repo whose
# HEAD we control.
assert_pin_guard() {
  local description="$1" mode="$2"
  local repo sha expected rc

  repo="$(mktemp -d)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }

  git -C "$repo" init -q
  : > "$repo/f"
  git -C "$repo" add f
  git -C "$repo" -c user.email=t@t -c user.name=t commit -qm t
  sha="$(git -C "$repo" rev-parse HEAD)"

  case "$mode" in
    match)    expected="$sha" ;;
    mismatch) expected="0000000000000000000000000000000000000000" ;;
    missing)  rm -rf "$repo/.git"; expected="$sha" ;;
    # Right commit, wrong bytes: `git checkout` over a modified worktree exits 0
    # and keeps the edit, so HEAD alone cannot detect this.
    dirty)    echo drift >> "$repo/f"; expected="$sha" ;;
  esac

  (
    eval "$(sed -n '/^verify_pinned_sha() {/,/^}/p' "$INSTALLER")"
    # Read by the eval'd function above, which shellcheck cannot follow.
    # DRY_RUN=0 is the point of the case: it forces the real verification path
    # that every --dry-run case deliberately skips.
    # shellcheck disable=SC2034
    { DRY_RUN=0; RED=''; RESET=''; }
    verify_pinned_sha "$repo" "$expected" 2>/dev/null
  )
  rc=$?
  rm -rf "$repo"

  # match must succeed; every other mode — wrong commit, missing repo, dirty
  # worktree — must fail closed.
  if { [ "$mode" = "match" ] && [ "$rc" -eq 0 ]; } ||
     { [ "$mode" != "match" ] && [ "$rc" -ne 0 ]; }; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description (mode=$mode returned $rc)"
    FAIL=$((FAIL + 1))
  fi
}

# assert_pin_dir_refused <description>
#
# Runs the installer with HOME pointed at a throwaway directory and requires it
# to refuse to register the pinned marketplace.
#
# `claude plugin marketplace add` records an ABSOLUTE path in the user's global
# registry, and claude resolves that registry independently of the HOME this
# script ran with. A run under a temporary HOME therefore writes a path into the
# REAL config that is guaranteed to vanish, after which every `claude plugin
# list` reports `cache-miss` and the four pinned bundles silently stop loading.
# Observed in the wild from an end-to-end run under a session scratchpad HOME.
#
# Asserting only "no marketplace add was emitted" would be satisfied by any early
# abort, so the guard's own stderr message is required as well, and an anchor on
# stdout proves the run got as far as the packs that precede the pinned block.
assert_pin_dir_refused() {
  local description="$1"
  local home out_file err_file out err

  home="$(mktemp -d)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }
  out_file="$(mktemp)" || { rm -rf "$home"; echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }
  err_file="$(mktemp)" || { rm -rf "$home"; rm -f "$out_file"; echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }

  HOME="$home" "$BASH" "$INSTALLER" --dry-run >"$out_file" 2>"$err_file"
  out="$(cat "$out_file")"
  err="$(cat "$err_file")"
  rm -rf "$home"
  rm -f "$out_file" "$err_file"

  case "$out" in
    *"claude plugin marketplace add PierrickMartos/Leadership-Skills"*) ;;
    *)
      echo "FAIL: $description"
      echo "      run never reached the leadership block, so absence proves nothing"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  case "$out" in
    *"claude plugin marketplace add \"\$PIN_DIR\""*|*"/.claude/pinned/pm-claude-skills"*)
      echo "FAIL: $description"
      echo "      the pinned marketplace was still registered from a temporary HOME"
      FAIL=$((FAIL + 1))
      return
      ;;
  esac

  case "$err" in
    *"refusing to register the pinned marketplace"*)
      echo "PASS: $description"
      PASS=$((PASS + 1))
      ;;
    *)
      echo "FAIL: $description"
      echo "      no guard message on stderr: $err"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# assert_every_component_is_skippable <description>
#
# Asserts the user-facing invariant directly rather than diffing against the
# KNOWN_COMPONENTS constant: every name the installer can skip must survive
# `--skip-<name>` validation. Written this way so adding a pack without adding
# it to the allowlist fails here, at CI time, instead of silently turning that
# pack's --skip flag into a hard exit for whoever tries it first.
assert_every_component_is_skippable() {
  local description="$1"
  local declared name rejected="" rc

  declared="$(sed -n \
    -e 's/.*install_plugin "\([^"]*\)".*/\1/p' \
    -e 's/.*install_mcp "\([^"]*\)".*/\1/p' \
    -e 's/.*is_skipped "\([^"]*\)".*/\1/p' \
    "$INSTALLER" | grep -v '^\$' | sort -u)"

  if [ -z "$declared" ]; then
    echo "FAIL: $description (extracted no component names from install.sh)"
    FAIL=$((FAIL + 1))
    return
  fi

  for name in $declared; do
    "$BASH" "$INSTALLER" --dry-run "--skip-$name" >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq 2 ]; then
      rejected="$rejected $name"
    fi
  done

  if [ -n "$rejected" ]; then
    echo "FAIL: $description"
    echo "      real components rejected by --skip validation:$rejected"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $description"
    PASS=$((PASS + 1))
  fi
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

# pm-claude-skills is the one pack installed from a pinned commit rather than a
# default branch. These cases exist because the pin is a supply-chain assertion:
# if the installer ever resolves this pack by branch, the reviewed-commit
# guarantee is gone while everything still looks green.
#
# The negative case is the load-bearing one. `claude plugin marketplace add
# mohitagw15856/pm-claude-skills` would work perfectly and track main — which is
# precisely the failure being prevented.
assert_stdout_lacks "pm-claude-skills is never added as a branch-tracking marketplace" \
  "claude plugin marketplace add mohitagw15856/pm-claude-skills" \
  "claude plugin marketplace add PierrickMartos/Leadership-Skills" --dry-run

assert_stdout_contains "pm-claude-skills is fetched at the reviewed commit" \
  "fetch --depth 1 --filter=blob:none origin 3d0c4c35b38c9611b9352a7c87c60b06d8261b91" \
  --dry-run

assert_stdout_contains "the pinned checkout is verified before anything installs" \
  "verify /" --dry-run

# Only the four reviewed bundles. At the pinned commit the repo ships 858 skills
# across 104 plugins;
# the sparse paths are what keep the other 100 bundles off disk and out of the
# skill namespace.
assert_stdout_contains "only the four reviewed bundles are sparse-checked-out" \
  "sparse-checkout set .claude-plugin plugins/pm-delivery plugins/pm-people plugins/pm-career plugins/pm-comms" \
  --dry-run

for bundle in pm-delivery pm-people pm-career pm-comms; do
  assert_stdout_contains "$bundle installs from the pinned marketplace" \
    "claude plugin install $bundle@pm-claude-skills" --dry-run
done

assert_stdout_lacks "--skip-pm-claude-skills skips the pinned pack entirely" \
  "claude plugin install pm-delivery@pm-claude-skills" \
  "claude plugin marketplace add phuryn/pm-skills" --dry-run --skip-pm-claude-skills

# The guard itself, executed for real. A pin that warns instead of aborting is
# decorative, so the mismatch case must fail closed — as must a directory that
# is not a git repo at all, where rev-parse yields nothing.
assert_pin_guard "pinned checkout at the reviewed commit is accepted" match
assert_pin_guard "pinned checkout at the wrong commit aborts the install" mismatch
assert_pin_guard "a non-repo pin directory aborts rather than passing empty" missing
assert_pin_guard "a modified pinned worktree aborts even at the right commit" dirty

# Registering the pin from a throwaway HOME poisons the real global registry
# with a path that will not exist later. Refuse rather than register.
assert_pin_dir_refused "a temporary HOME refuses to register the pinned marketplace"

# An unvalidated --skip- typo used to be accepted silently: SKIP_LIST grew a name
# matching no component, the pack installed anyway, and the user believed they
# had opted out. That failure mode is worst on --skip-pm-claude-skills, the
# opt-out for the one pack installed from a pinned commit.
assert_run "unknown --skip-<name> is rejected rather than silently ignored" 2 \
  --dry-run --skip-nonexistent-pack

# The allowlist that makes the case above possible must not go stale.
assert_every_component_is_skippable "every real component survives --skip validation"

echo ""
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
