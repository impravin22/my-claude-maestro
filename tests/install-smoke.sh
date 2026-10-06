#!/usr/bin/env bash
#
# Smoke tests for install.sh.
#
# Nothing here installs anything. Every case passes --dry-run — which routes each
# install command through run() and only prints it — except --help and the
# unknown-flag case, which exit during argument parsing, before preflight, and
# the two switch-off failure cases, which run for real against recording stubs
# on a PATH that holds nothing else (see make_stub_bin). The only filesystem
# effect of a dry run is two self-cleaning `mktemp -d` calls in install.sh
# itself.
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

# assert_stderr_contains <description> <expected_exit> <needle> <flags...>
# Exit status alone cannot tell a profile error from "Unknown flag" (both exit
# 2), so rejection cases also pin the message that names the actual problem.
assert_stderr_contains() {
  local description="$1" expected_exit="$2" needle="$3"
  shift 3
  local stderr_output actual_exit

  stderr_output="$("$BASH" "$INSTALLER" "$@" 2>&1 >/dev/null)"
  actual_exit=$?

  if [ "$actual_exit" -ne "$expected_exit" ]; then
    echo "FAIL: $description"
    echo "      expected exit $expected_exit, got $actual_exit"
    FAIL=$((FAIL + 1))
    return
  fi
  case "$stderr_output" in
    *"$needle"*)
      echo "PASS: $description"
      PASS=$((PASS + 1))
      ;;
    *)
      echo "FAIL: $description"
      echo "      stderr did not contain: $needle"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# assert_profile_skip_set <description> <profile> <expected component...>
# The components a profile labels as skipped must equal the expected set
# exactly: an extra skip (say, superpowers under core) is as wrong as a
# missing one, and a one-way check would let it ship green.
assert_profile_skip_set() {
  local description="$1" profile="$2"
  shift 2
  local expected actual

  expected="$(printf '%s\n' "$@" | sort -u)"
  actual="$("$BASH" "$INSTALLER" --dry-run "--profile=$profile" 2>/dev/null \
    | sed -n "s/^.* \([^ ][^ ]*\) (profile $profile)\$/\1/p" | sort -u)"

  if [ "$actual" = "$expected" ]; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description"
    echo "      expected: $(printf '%s ' $expected)"
    echo "      actual:   $(printf '%s ' $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# assert_profile_dormant_set <description> <profile> <expected component...>
# The packs a profile installs and then switches off must equal the expected
# set exactly, like assert_profile_skip_set does for skips.
assert_profile_dormant_set() {
  local description="$1" profile="$2"
  shift 2
  local expected actual

  expected="$(printf '%s\n' "$@" | sort -u)"
  actual="$("$BASH" "$INSTALLER" --dry-run "--profile=$profile" 2>/dev/null \
    | sed -n "s/^.* \([^ ][^ ]*\) (installed, switched off: profile $profile)\$/\1/p" \
    | sort -u)"

  if [ "$actual" = "$expected" ]; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description"
    echo "      expected: $(printf '%s ' $expected)"
    echo "      actual:   $(printf '%s ' $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# normalised_dry_run <flags...>: dry-run stdout with the random mktemp paths
# replaced, so two runs can be compared byte for byte.
normalised_dry_run() {
  "$BASH" "$INSTALLER" --dry-run "$@" 2>/dev/null \
    | sed -E 's#(/private)?/(var/folders|tmp)/[^ )"]*#TMP#g'
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
# The default path needs git (pinned pack, Transitions, everything-claude-code
# clones); --minimal does not. Preflight must catch the missing tool before a
# single component installs. PATH is restricted to the stub dir alone: the
# script reaches preflight on bash builtins, so the four stubs are enough to
# get there and the absence of git is the only failure in scope.
assert_git_preflight() {
  local description="$1" out_file rc combined
  out_file="$(mktemp)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }
  # log_fail writes to stdout; capture both streams for the message check.
  PATH="$STUB_DIR" "$BASH" "$INSTALLER" --dry-run >"$out_file" 2>&1
  rc=$?
  combined="$(cat "$out_file")"
  rm -f "$out_file"
  if [ "$rc" -eq 1 ] && printf '%s' "$combined" | grep -q "Missing required tools:.*git"; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description (rc=$rc, output does not name git: ${combined:0:120})"
    FAIL=$((FAIL + 1))
  fi
}

assert_minimal_skips_git_requirement() {
  local description="$1" rc
  PATH="$STUB_DIR" "$BASH" "$INSTALLER" --dry-run --minimal >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "PASS: $description"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $description (rc=$rc)"
    FAIL=$((FAIL + 1))
  fi
}

# Every install_plugin call site's marketplace and plugin spec must appear
# verbatim in default --dry-run output. This is the generalisation of the
# reactive per-pack assertions above it: the c-level-advisor incident (wrong
# marketplace AND wrong plugin name, green CI throughout) becomes structurally
# impossible to reintroduce for any pack, present or future. Skip-guarded
# packs are exercised because the default run skips nothing.
assert_all_plugin_specs_in_dry_run() {
  local description="$1" output pairs marketplace spec missing=""

  output="$("$BASH" "$INSTALLER" --dry-run 2>/dev/null)"
  # Call sites span lines; flatten the file so each call is one record.
  pairs="$(tr '\n' ' ' < "$INSTALLER" | sed 's/install_plugin /\
install_plugin /g' | sed -n 's/^install_plugin "[^"]*"[[:space:]\\]*"\([^"]*\)"[[:space:]\\]*"\([^"]*\)".*/\1 \2/p')"

  if [ -z "$pairs" ]; then
    echo "FAIL: $description (extracted no install_plugin call sites)"
    FAIL=$((FAIL + 1))
    return
  fi

  while IFS=' ' read -r marketplace spec; do
    [ -z "$marketplace" ] && continue
    case "$output" in
      *"claude plugin marketplace add $marketplace"*) : ;;
      *) missing="$missing [marketplace:$marketplace]" ;;
    esac
    case "$output" in
      *"claude plugin install $spec"*) : ;;
      *) missing="$missing [spec:$spec]" ;;
    esac
  done <<EOF_PAIRS
$pairs
EOF_PAIRS

  if [ -n "$missing" ]; then
    echo "FAIL: $description"
    echo "      not found in --dry-run output:$missing"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $description"
    PASS=$((PASS + 1))
  fi
}

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

# assert_install_precedes_disable <description> <flags...>
#
# A pack switched off before it is installed is still on once the install
# lands, so each dormant spec's disable line must follow its install line. A
# spec missing either line fails too. A match must end at a space or the end of
# the line, so one spec cannot pass inside a longer one.
assert_install_precedes_disable() {
  local description="$1"
  shift
  local output spec install_at disable_at problems=""

  output="$("$BASH" "$INSTALLER" --dry-run "$@" 2>/dev/null)"
  for spec in $DORMANT_SPECS; do
    install_at="$(printf '%s\n' "$output" \
      | grep -n -E -m1 "claude plugin install $spec( |\$)" | cut -d: -f1)"
    disable_at="$(printf '%s\n' "$output" \
      | grep -n -E -m1 "claude plugin disable $spec --scope user( |\$)" | cut -d: -f1)"
    if [ -z "$install_at" ] || [ -z "$disable_at" ]; then
      problems="$problems [missing:$spec]"
    elif [ "$install_at" -ge "$disable_at" ]; then
      problems="$problems [disabled-first:$spec]"
    fi
  done

  if [ -n "$problems" ]; then
    echo "FAIL: $description"
    echo "      $problems"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $description"
    PASS=$((PASS + 1))
  fi
}

# make_stub_bin <dir>
#
# Builds <dir>/bin for the two cases that run install.sh for real. Used as the
# WHOLE of PATH, so nothing outside it can run: a command those cases do not
# expect fails as not found instead of touching the machine. Every stub appends
# its call to <dir>/calls.log; cat is the one real binary, for the summary.
#
# `claude plugin disable <spec> --scope user [--json]` exits 1 for a spec listed
# in <dir>/fail, and for one listed in <dir>/off answers as Claude Code 2.1.291
# does for a plugin already disabled at user scope: exit 1, with the
# alreadyInGoalState verdict under --json. Every other call succeeds.
make_stub_bin() {
  local dir="$1" tool
  mkdir "$dir/bin" || return 1
  : > "$dir/fail"
  : > "$dir/off"
  for tool in node npx curl git; do
    printf '#!/bin/sh\nprintf "%%s %%s\\n" "${0##*/}" "$*" >> "${0%%/*}/../calls.log"\n' \
      > "$dir/bin/$tool"
  done
  cat > "$dir/bin/claude" <<'EOF_STUB'
#!/bin/sh
here="${0%/*}/.."
printf 'claude %s\n' "$*" >> "$here/calls.log"
[ "$1 $2" = "plugin disable" ] || exit 0
while read -r spec; do
  [ "$spec" = "$3" ] || continue
  echo "Failed to disable plugin \"$3\": settings could not be written" >&2
  exit 1
done < "$here/fail"
while read -r spec; do
  [ "$spec" = "$3" ] || continue
  if [ "${6:-}" = "--json" ]; then
    printf '{"command":"disable","outcome":"failed","plugin":"%s","failureCode":"already_in_goal_state","alreadyInGoalState":true}\n' "$3"
  else
    echo "Failed to disable plugin \"$3\": Plugin \"$3\" is already disabled at user scope" >&2
  fi
  exit 1
done < "$here/off"
exit 0
EOF_STUB
  chmod +x "$dir/bin/"* || return 1
  ln -s "$(command -v cat)" "$dir/bin/cat"
}

# assert_switch_off_failures <description>
#
# Every dry run gets a zero status from run(), so without a real run the
# branches for a failed switch-off never execute. This one runs
# --profile=engineering for real against make_stub_bin, with HOME in a scratch
# directory and the four components that clone or pip-install skipped (the
# pinned pack would also refuse the scratch HOME). The stub fails the disable of
# marketing-skills and reports finance as already off.
assert_switch_off_failures() {
  local description="$1"
  local dir rc out spec problems=""

  dir="$(mktemp -d)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }
  if ! make_stub_bin "$dir" || ! mkdir "$dir/home"; then
    rm -rf "$dir"
    echo "FAIL: $description (could not build the stubs)"
    FAIL=$((FAIL + 1))
    return
  fi
  printf '%s\n' marketing-skills@marketingskills > "$dir/fail"
  printf '%s\n' finance@knowledge-work-plugins > "$dir/off"

  PATH="$dir/bin" HOME="$dir/home" "$BASH" "$INSTALLER" --profile=engineering \
    --skip-pm-claude-skills --skip-transitions --skip-skillspector \
    --skip-everything-claude-code >"$dir/out" 2>/dev/null
  rc=$?
  out="$(cat "$dir/out")"

  # A failed switch-off is a failure: the profile's promise is not met.
  [ "$rc" -eq 1 ] || problems="$problems [exit $rc, expected 1]"
  case "$out" in
    *"marketing-skills: installed but could not be switched off; run by hand: claude plugin disable marketing-skills@marketingskills --scope user"*) ;;
    *) problems="$problems [no failure line naming the command]" ;;
  esac
  # Already off is the goal state, not a failure.
  case "$out" in
    *"finance (installed, switched off: profile engineering)"*) ;;
    *) problems="$problems [already-off pack not reported as switched off]" ;;
  esac
  case "$out" in
    *"finance: installed but could not be switched off"*) problems="$problems [already-off pack reported as failed]" ;;
  esac
  # The advice for an install failure is wrong for a pack that installed.
  case "$out" in
    *"install the failed components manually"*) problems="$problems [install advice given for a switch-off failure]" ;;
  esac
  case "$out" in
    *"Some packs installed but are still switched on"*) ;;
    *) problems="$problems [no switch-off advice block]" ;;
  esac
  printf '%s\n' "$out" \
    | grep -q -x -F "  claude plugin disable marketing-skills@marketingskills --scope user" \
    || problems="$problems [advice block does not list the command]"
  # Every pack after the failure was still attempted.
  for spec in $DORMANT_SPECS; do
    case "$spec" in *@pm-claude-skills) continue ;; esac
    grep -q -x -F "claude plugin disable $spec --scope user" "$dir/calls.log" \
      || problems="$problems [never attempted:$spec]"
  done
  # The stubs prove the run stayed inside the scratch PATH.
  if grep -q '^git ' "$dir/calls.log"; then
    problems="$problems [git was called]"
  fi
  rm -rf "$dir"

  if [ -n "$problems" ]; then
    echo "FAIL: $description"
    echo "      $problems"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $description"
    PASS=$((PASS + 1))
  fi
}

# assert_pinned_bundles_switch_off_alone <description>
#
# The pinned pack cannot run for real here (it clones, and refuses a scratch
# HOME), so lift switch_off and the helpers it calls out of install.sh, as
# assert_pin_guard does for verify_pinned_sha, and switch the four bundles off
# against make_stub_bin with the first and third failing. All four must be
# attempted, and exactly the two that failed recorded.
assert_pinned_bundles_switch_off_alone() {
  local description="$1"
  local dir rc problems="" bundle

  dir="$(mktemp -d)" || { echo "FAIL: $description (mktemp failed)"; FAIL=$((FAIL + 1)); return; }
  if ! make_stub_bin "$dir"; then
    rm -rf "$dir"
    echo "FAIL: $description (could not build the stubs)"
    FAIL=$((FAIL + 1))
    return
  fi
  printf '%s\n' pm-delivery@pm-claude-skills pm-career@pm-claude-skills > "$dir/fail"

  (
    eval "$(sed -n -e '/^log_fail() /p' -e '/^run() {/,/^}/p' \
      -e '/^already_disabled_at_user_scope() {/,/^}/p' \
      -e '/^switch_off() {/,/^}/p' "$INSTALLER")"
    # Read by the eval'd functions above, which shellcheck cannot follow.
    # shellcheck disable=SC2034
    { DRY_RUN=0; RED=''; YELLOW=''; RESET=''; FAILED=(); SWITCH_OFF_FAILED=(); }
    PATH="$dir/bin"
    switch_off pm-claude-skills pm-delivery@pm-claude-skills pm-people@pm-claude-skills \
      pm-career@pm-claude-skills pm-comms@pm-claude-skills >/dev/null 2>&1
    rc=$?
    # The +-guard keeps an empty array from aborting under set -u on bash 3.2.
    printf '%s\n' ${SWITCH_OFF_FAILED[@]+"${SWITCH_OFF_FAILED[@]}"} > "$dir/recorded"
    exit "$rc"
  )
  rc=$?

  [ "$rc" -ne 0 ] || problems="$problems [returned 0 with two bundles still on]"
  for bundle in pm-delivery pm-people pm-career pm-comms; do
    grep -q -x -F "claude plugin disable $bundle@pm-claude-skills --scope user" "$dir/calls.log" \
      || problems="$problems [never attempted:$bundle]"
  done
  if [ "$(cat "$dir/recorded")" != "$(printf '%s\n' pm-delivery@pm-claude-skills pm-career@pm-claude-skills)" ]; then
    problems="$problems [recorded: $(tr '\n' ' ' < "$dir/recorded")]"
  fi
  rm -rf "$dir"

  if [ -n "$problems" ]; then
    echo "FAIL: $description"
    echo "      $problems"
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

# Preflight tool requirements: git on the default path, not on --minimal.
assert_git_preflight "missing git fails preflight legibly on the default path"
assert_minimal_skips_git_requirement "--minimal does not require git"

# Every declared marketplace and plugin spec is emitted by a default dry run.
assert_all_plugin_specs_in_dry_run "every install_plugin spec appears in --dry-run output"

# --- Profiles (v1.17.0; dormant packs v1.18.0) ------------------------------
# A profile is a named skip list plus a dormant list: dormant packs are
# installed, then switched off, so maestro can load them from disk on demand.
# These cases pin both sets exactly, that every line says why, and that bad
# profile input fails at parse time rather than falling back to full.
DORMANT_PACKS="finance small-business legal marketing-skills social-media-skills
leadership-performance-management leadership-communication
leadership-decision-making pm-product-discovery c-level-advisor
pm-claude-skills"
# The plugin specs those packs install and switch off: the pinned pack is four.
DORMANT_SPECS="finance@knowledge-work-plugins small-business@knowledge-work-plugins
legal@knowledge-work-plugins marketing-skills@marketingskills
social-media-skills@social-media-skills performance-management@leadership-skills
communication@leadership-skills decision-making@leadership-skills
pm-product-discovery@pm-skills c-level-skills@claude-code-skills
pm-delivery@pm-claude-skills pm-people@pm-claude-skills
pm-career@pm-claude-skills pm-comms@pm-claude-skills"
ENGINEERING_SKIPS="vercel"
CORE_ONLY_SKIPS="pr-review-toolkit Playwright ui-ux-pro-max andrej-karpathy-skills
taste-skill transitions skillspector"

assert_run "--profile=engineering dry-run exits 0" 0 --dry-run --profile=engineering
assert_run "--profile=full dry-run exits 0" 0 --dry-run --profile=full

# The lists are unquoted on purpose: word splitting turns each into arguments.
assert_profile_skip_set "engineering skips exactly Vercel" \
  engineering $ENGINEERING_SKIPS
assert_profile_skip_set "core skips exactly Vercel plus the optional voices" \
  core $ENGINEERING_SKIPS $CORE_ONLY_SKIPS
assert_profile_skip_set "full skips nothing" full
assert_profile_dormant_set "engineering installs exactly the domain packs switched off" \
  engineering $DORMANT_PACKS
assert_profile_dormant_set "core installs exactly the domain packs switched off" \
  core $DORMANT_PACKS
assert_profile_dormant_set "full labels no pack as switched off" full
for profile in engineering core; do
  assert_stdout_contains "$profile still installs superpowers" \
    "Installing superpowers" --dry-run "--profile=$profile"
  assert_stdout_contains "$profile still installs the Context7 MCP" \
    "Installing Context7 MCP" --dry-run "--profile=$profile"
done
# The space form must apply the profile, not just parse: a dropped value would
# fall back to full and still exit 0.
assert_run "--profile core (space form) dry-run exits 0" 0 --dry-run --profile core
assert_stdout_contains "the space form applies the profile" \
  "Playwright (profile core)" --dry-run --profile core
if [ "$(normalised_dry_run)" = "$(normalised_dry_run --profile=full)" ]; then
  echo "PASS: an explicit --profile=full installs exactly what the default does"
  PASS=$((PASS + 1))
else
  echo "FAIL: an explicit --profile=full installs exactly what the default does"
  FAIL=$((FAIL + 1))
fi

assert_stdout_contains "engineering installs a domain pack" \
  "claude plugin install marketing-skills@marketingskills" --dry-run --profile=engineering
assert_stdout_contains "engineering then switches that pack off at user scope" \
  "claude plugin disable marketing-skills@marketingskills --scope user" \
  --dry-run --profile=engineering
assert_stdout_contains "engineering switches the pinned bundles off too" \
  "claude plugin disable pm-comms@pm-claude-skills --scope user" --dry-run --profile=engineering
assert_stdout_lacks "full emits no disable command" \
  "claude plugin disable" "Maestro ecosystem install summary" --dry-run --profile=full
for profile in engineering core; do
  assert_install_precedes_disable "$profile installs each dormant spec before switching it off" \
    "--profile=$profile"
done
assert_stdout_contains "the note says the profile switches its domain packs off at user scope" \
  "Profile engineering switches its domain packs off at user scope, including" \
  --dry-run --profile=engineering
assert_stdout_contains "the note says that covers packs an earlier install enabled" \
  "any an earlier install had enabled; maestro loads them on demand." \
  --dry-run --profile=engineering
assert_stdout_contains "the note says skipped components stay as they were" \
  "Skipped components stay as they were." --dry-run --profile=engineering
assert_stdout_lacks "full prints no profile note" \
  "switches its domain packs off" "Maestro ecosystem install summary" --dry-run --profile=full
assert_switch_off_failures \
  "a failed switch-off names its command and gets its own advice; already off is success"
assert_pinned_bundles_switch_off_alone \
  "each pinned bundle is switched off on its own, past a failure"
assert_stdout_contains "engineering keeps the review toolkit" \
  "claude plugin install pr-review-toolkit@claude-plugins-official" \
  --dry-run --profile=engineering
assert_stdout_contains "engineering installs ECC with its developer profile" \
  "--profile developer)" --dry-run --profile=engineering
assert_stdout_contains "core installs ECC with its core profile" \
  "--profile core)" --dry-run --profile=core
assert_stdout_contains "an explicit --profile=full installs ECC's full profile" \
  "--profile full)" --dry-run --profile=full
assert_stdout_contains "the default still installs ECC's full profile" \
  "--profile full)" --dry-run
assert_stdout_contains "an explicit skip beats the dormant list" \
  "marketing-skills (explicit --skip)" --dry-run --profile=engineering --skip-marketing-skills
assert_stdout_lacks "an explicitly skipped dormant pack is never installed" \
  "claude plugin install marketing-skills@" "Maestro ecosystem install summary" \
  --dry-run --profile=engineering --skip-marketing-skills
# The pinned pack goes through its own block rather than install_plugin, so the
# explicit-skip precedence is pinned for it separately.
assert_stdout_contains "an explicit skip beats the dormant list for the pinned pack" \
  "pm-claude-skills (explicit --skip)" --dry-run --profile=engineering --skip-pm-claude-skills
assert_stdout_lacks "an explicitly skipped pinned pack is neither installed nor switched off" \
  "@pm-claude-skills" "Maestro ecosystem install summary" \
  --dry-run --profile=engineering --skip-pm-claude-skills

assert_stderr_contains "an unknown profile is rejected by name" 2 "Unknown profile: lean" \
  --dry-run --profile=lean
assert_stderr_contains "--profile with no value is rejected" 2 "--profile needs a value" \
  --dry-run --profile
assert_stderr_contains "--profile= with an empty value is rejected" 2 "--profile needs a value" \
  --dry-run --profile=
assert_stderr_contains "--profile never swallows the next flag as its value" 2 \
  "--profile needs a value" --profile --dry-run
assert_stderr_contains "--minimal and --profile together are rejected" 2 "cannot be combined" \
  --dry-run --minimal --profile=core
assert_stderr_contains "a second --profile is rejected, not silently last-wins" 2 \
  "given more than once" --dry-run --profile=lean --profile=core
assert_stderr_contains "a second --profile in the space form is rejected too" 2 \
  "given more than once" --dry-run --profile core --profile full
assert_stderr_contains "--profile followed by an empty word is rejected" 2 \
  "--profile needs a value" --dry-run --profile ""

# The profile value is data: a command substitution in it must be rejected
# without ever being evaluated.
canary="$STUB_DIR/profile-canary"
assert_stderr_contains "a command-substitution profile is rejected as a profile" 2 \
  "Unknown profile:" --dry-run "--profile=\$(touch $canary)"
if [ -e "$canary" ]; then
  echo "FAIL: the profile value was evaluated"
  FAIL=$((FAIL + 1))
else
  echo "PASS: the profile value was never evaluated"
  PASS=$((PASS + 1))
fi

echo ""
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
