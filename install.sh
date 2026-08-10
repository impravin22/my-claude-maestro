#!/usr/bin/env bash
# Maestro companion installer
# Installs the recommended plugin + MCP ecosystem that Maestro orchestrates.
#
# Heavy/specialised dependencies (VoiceMode, n8n-MCP, LightRAG) are intentionally
# excluded — install those manually if you need them (see README.md).
#
# Usage:
#   ./install.sh                  # install everything
#   ./install.sh --minimal        # required only (superpowers + Context7)
#   ./install.sh --dry-run        # print commands without running
#   ./install.sh --skip-vercel    # opt out of a specific component
#   ./install.sh --help

set -uo pipefail

MINIMAL=0
DRY_RUN=0
SKIP_LIST=""

print_help() {
  cat <<'EOF'
Maestro companion installer.

Components installed by default:
  [required]     superpowers plugin, Context7 MCP
  [recommended]  Vercel plugin, Security Guidance, PR Review Toolkit,
                 Playwright MCP, claude-mem, UI UX Pro Max,
                 Andrej Karpathy Skills, Caveman, SkillSpector,
                 Anthropic example-skills, knowledge-work plugins
                 (finance, small-business, legal), marketing-skills,
                 social-media-skills, leadership-skills,
                 pm-product-discovery, c-level-advisor,
                 pm-claude-skills (pinned), Taste, Transitions,
                 Everything Claude Code

Flags:
  --minimal              install required components only
  --dry-run              print commands without executing
  --skip-<name>          skip a component (e.g. --skip-vercel, --skip-transitions;
                         --skip-leadership-skills skips all three leadership bundles)
  --help                 show this help

Heavy components NOT installed by this script:
  VoiceMode MCP, n8n-MCP, LightRAG
  (see README.md for manual install instructions)

Licence note: Transitions (Jakubantalik/transitions.dev) has no licence file —
it is installed as a user-scope skill for personal use; do not vendor it.

Leadership note: pm-claude-skills installs PINNED to a reviewed commit, not from
its default branch — its README claims an official-directory listing that does
not exist, and it lands ~12 commits a day. The pin is cloned to
~/.claude/pinned/pm-claude-skills; if the checkout is at another commit, has
local modifications, or would be registered from a temporary HOME, the pack is
skipped, the run continues, and install.sh exits non-zero. Skip it with
--skip-pm-claude-skills. See skills/maestro/references/skill-pack-registry.md.

Unknown --skip-<name> values are rejected with the list of valid names, rather
than accepted and silently matched against nothing.
EOF
}

# Every name `is_skipped` can match, and therefore every valid --skip-<name>.
# The two MCP entries are capitalised because that is the name install_mcp is
# called with; --skip-context7 is not the same string as --skip-Context7.
#
# Validating against this list rather than accepting any --skip-* is the point:
# an unrecognised value used to be appended to SKIP_LIST silently, where it
# matched no component, so the pack installed anyway while the user believed
# they had opted out. That is the wrong failure mode for --skip-pm-claude-skills
# in particular, which is the opt-out for the one pack installed from a pinned
# commit. Deny by default, and say which names are real.
#
# tests/install-smoke.sh drives --skip-<name> for every name it can find at an
# install_plugin / install_mcp / is_skipped call site, so a pack added without
# being listed here fails CI rather than turning its own --skip flag into a
# hard exit for whoever reaches for it first.
KNOWN_COMPONENTS="superpowers Context7 vercel security-guidance pr-review-toolkit
Playwright claude-mem ui-ux-pro-max andrej-karpathy-skills example-skills
finance small-business legal marketing-skills social-media-skills
leadership-performance-management leadership-communication
leadership-decision-making pm-product-discovery c-level-advisor
pm-claude-skills taste-skill transitions caveman skillspector
everything-claude-code"

is_known_component() {
  local name="$1" known
  for known in $KNOWN_COMPONENTS; do
    [ "$known" = "$name" ] && return 0
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    --minimal) MINIMAL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) print_help; exit 0 ;;
    # Whole-pack alias. Leadership-Skills installs as three separate bundles,
    # so the intuitive flag must expand to all three or it silently skips one.
    # Must precede the generic --skip-* case, which would otherwise swallow it.
    # It is also why the alias never reaches the validation below: it is a flag
    # name, not a component name, and is not in KNOWN_COMPONENTS.
    --skip-leadership-skills)
      SKIP_LIST="$SKIP_LIST leadership-performance-management leadership-communication leadership-decision-making" ;;
    --skip-*)
      skip_component="${arg#--skip-}"
      if ! is_known_component "$skip_component"; then
        echo "Unknown component: $skip_component" >&2
        echo "Valid --skip-<name> values (plus the --skip-leadership-skills alias):" >&2
        # Deliberately unquoted: KNOWN_COMPONENTS is a compile-time literal and
        # the word splitting is what turns it into one name per line.
        # shellcheck disable=SC2086
        printf '  %s\n' $KNOWN_COMPONENTS >&2
        exit 2
      fi
      SKIP_LIST="$SKIP_LIST $skip_component" ;;
    *) echo "Unknown flag: $arg" >&2; print_help; exit 2 ;;
  esac
done

# --- Reporting -------------------------------------------------------------

# Only emit ANSI colours when stdout is an interactive terminal. Avoids
# escape-code garbage when the installer's output is piped to a file or CI log.
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  BLUE='\033[0;34m'
  RESET='\033[0m'
else
  GREEN='' YELLOW='' RED='' BLUE='' RESET=''
fi

INSTALLED=()
SKIPPED=()
FAILED=()

log_step()    { printf "\n${BLUE}==> %s${RESET}\n" "$1"; }
log_ok()      { printf "${GREEN}✔ %s${RESET}\n" "$1"; INSTALLED+=("$1"); }
log_skip()    { printf "${YELLOW}⊘ %s${RESET}\n" "$1"; SKIPPED+=("$1"); }
log_fail()    { printf "${RED}✖ %s${RESET}\n" "$1"; FAILED+=("$1"); }

is_skipped() {
  local name="$1"
  for s in $SKIP_LIST; do
    [ "$s" = "$name" ] && return 0
  done
  return 1
}

run() {
  # INVARIANT: every string passed to `run` is a compile-time literal defined
  # inside this script, with ONE bounded exception: the two clone-and-copy
  # blocks (Transitions, Everything Claude Code) interpolate a `$(mktemp -d)`
  # path, and mktemp honours $TMPDIR. That is an env-derived value reaching
  # `eval` below. It is not a meaningful escalation — a hostile $TMPDIR implies
  # the attacker already runs code as this user — but it means the invariant is
  # "literals plus mktemp paths", not "literals only". Nothing from argv,
  # --skip-* values, or plugin names is ever interpolated. If you add a call
  # site that interpolates anything else, switch to an array form (`"$@"`
  # without eval) instead of widening this exception.
  #
  # The $HOME-derived paths (Transitions, Everything Claude Code, the pinned
  # pm-claude-skills block) are NOT exceptions: they are written \$HOME and
  # \$PIN_DIR so the expansion happens inside eval as an ordinary parameter
  # expansion. The value is never re-parsed as source, so a HOME containing
  # $(...) is inert. Keep that form for anything env-derived.
  if [ "$DRY_RUN" -eq 1 ]; then
    printf "    ${YELLOW}[dry-run]${RESET} %s\n" "$*"
    return 0
  fi
  eval "$@"
}

# --- Preflight -------------------------------------------------------------

log_step "Preflight checks"

missing_tools=()
for tool in claude node npx curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    missing_tools+=("$tool")
  fi
done

if [ ${#missing_tools[@]} -gt 0 ]; then
  log_fail "Missing required tools: ${missing_tools[*]}"
  echo "Install them first, then re-run this script." >&2
  exit 1
fi

# Several components write under $HOME — the Transitions block via an escaped
# \$HOME that only expands inside eval, and the everything-claude-code
# installer through its own script. With HOME unset, `set -u` would abort at
# the first of those: partway through the run, after other components had
# already installed, with nothing but "HOME: unbound variable" to explain it.
# With HOME set-but-empty there is no abort at all — the path collapses to
# /.claude and the installer writes at the filesystem root, which is quieter
# and worse. Assert both here so the failure is early, complete and legible.
#
# Read defensively: a bare $HOME would itself abort under set -u. ${HOME:-}
# yields empty for unset and for set-but-empty alike, which is what -z wants.
if [ -z "${HOME:-}" ]; then
  log_fail "HOME is not set, or is empty"
  echo "This installer writes to \$HOME/.claude. Set HOME and re-run." >&2
  exit 1
fi

printf "${GREEN}✔ claude, node, npx, curl available${RESET}\n"

# --- Install helpers --------------------------------------------------------

ADDED_MARKETPLACES=" "

# The pm-claude-skills commit that was actually reviewed: SkillSpector-scanned
# per bundle, and grep-confirmed to make zero network calls across pm-delivery,
# pm-people, pm-career and pm-comms. Bumping this constant means re-reviewing —
# it is a supply-chain assertion, not a version string.
# Reviewed 2026-08-05: "docs(readme): add a prominent Subscribe-to-newsletter
# button (#219)", 2026-08-04T14:59:33Z.
PM_CLAUDE_SKILLS_SHA="3d0c4c35b38c9611b9352a7c87c60b06d8261b91"
PM_CLAUDE_SKILLS_URL="https://github.com/mohitagw15856/pm-claude-skills.git"

# is_ephemeral_path <path>
#
# True when the path sits under a temporary root.
#
# `claude plugin marketplace add` records an ABSOLUTE path in the user's global
# registry, and claude resolves that registry independently of the HOME this
# script ran with. An installer run under a temporary HOME therefore writes a
# path into the REAL config that is guaranteed to vanish. Every later `claude
# plugin list` then reports `cache-miss` and the four pinned bundles silently
# stop loading, with nothing in the install output hinting at it. Observed in
# the wild from an end-to-end run under a session scratchpad HOME.
#
# Checked against the pin directory rather than HOME itself, because the
# directory is the value actually handed to `marketplace add`.
is_ephemeral_path() {
  local path="${1%/}/" tmp

  case "$path" in
    /tmp/*|/private/tmp/*|/var/tmp/*|/private/var/tmp/*) return 0 ;;
    # macOS per-user temp roots, where mktemp lands when TMPDIR is set.
    /var/folders/*|/private/var/folders/*) return 0 ;;
  esac

  # $TMPDIR is the portable answer but is neither always set nor always one of
  # the roots above, so it supplements those literals rather than replacing them.
  tmp="${TMPDIR:-}"
  if [ -n "$tmp" ]; then
    case "$path" in
      "${tmp%/}"/*) return 0 ;;
    esac
  fi

  return 1
}

# verify_pinned_sha <dir> <expected-sha>
#
# The whole point of pinning is that the tree matches the commit that was
# reviewed, so a mismatch must ABORT the install rather than warn. Without this
# the fetch could silently resolve elsewhere — a stale directory left at another
# commit, a ref that moved, a partial fetch — and the pin would be decorative.
# Under --dry-run nothing was cloned, so there is nothing to verify: report and
# succeed, or the dry run would report a failure that a real run would not hit.
verify_pinned_sha() {
  local dir="$1" expected="$2" actual

  if [ "$DRY_RUN" -eq 1 ]; then
    printf "    [dry-run] verify %s is at %s\n" "$dir" "$expected"
    return 0
  fi

  actual="$(git -C "$dir" rev-parse HEAD 2>/dev/null)"
  if [ "$actual" != "$expected" ]; then
    printf "${RED}✘ pinned checkout mismatch in %s${RESET}\n" "$dir" >&2
    printf "  expected %s\n  actual   %s\n" "$expected" "${actual:-<none>}" >&2
    return 1
  fi

  # HEAD alone is not the guarantee. `git checkout` over a modified worktree
  # succeeds and keeps the modification, so a pin directory can sit at the right
  # commit while shipping different bytes — which is the thing the pin exists to
  # prevent. Fail closed and let the user delete the directory; silently forcing
  # the checkout would destroy whatever they were looking at.
  # --untracked-files=all catches an injected file, not just a modified one.
  # The .DS_Store excludes are load-bearing: this upstream TRACKS 25 .DS_Store
  # files, 3 of them inside the sparse cone at the pinned commit, so one Finder
  # visit would otherwise wedge a re-runnable installer and misreport OS
  # metadata churn as tampering.
  # stderr is folded into the captured string rather than discarded — `git
  # status` on an unreadable path prints nothing to stdout and still exits 0, so
  # swallowing stderr would make "cannot inspect" look identical to "clean".
  if [ -n "$(git -C "$dir" status --porcelain --untracked-files=all \
              -- ':(exclude).DS_Store' ':(exclude,glob)**/.DS_Store' 2>&1)" ]; then
    printf "${RED}✘ pinned checkout has local modifications: %s${RESET}\n" "$dir" >&2
    printf "  the tree no longer matches the reviewed commit\n" >&2
    printf "  remove the directory and re-run to restore it\n" >&2
    return 1
  fi
  return 0
}

install_plugin() {
  local name="$1" marketplace="$2" plugin_spec="$3"
  if is_skipped "$name"; then
    log_skip "$name (explicit --skip)"
    return
  fi
  log_step "Installing $name"
  if [[ "$ADDED_MARKETPLACES" != *" $marketplace "* ]]; then
    run "claude plugin marketplace add $marketplace" \
      || log_fail "$name: marketplace add failed (continuing)"
    ADDED_MARKETPLACES="$ADDED_MARKETPLACES$marketplace "
  fi
  if run "claude plugin install $plugin_spec"; then
    log_ok "$name"
  else
    log_fail "$name: plugin install failed"
  fi
}

install_mcp() {
  local name="$1"; shift
  if is_skipped "$name"; then
    log_skip "$name (explicit --skip)"
    return
  fi
  log_step "Installing $name MCP"
  if run "$*"; then
    log_ok "$name MCP"
  else
    log_fail "$name MCP"
  fi
}

# --- Required --------------------------------------------------------------

install_plugin "superpowers" \
  "anthropics/claude-plugins-official" \
  "superpowers@claude-plugins-official"

install_mcp "Context7" \
  "npx -y ctx7 setup --claude"

# --- Recommended (skip if --minimal) ---------------------------------------

if [ "$MINIMAL" -eq 0 ]; then

  install_plugin "vercel" \
    "anthropics/claude-plugins-official" \
    "vercel@claude-plugins-official"

  install_plugin "security-guidance" \
    "anthropics/claude-plugins-official" \
    "security-guidance@claude-plugins-official"

  install_plugin "pr-review-toolkit" \
    "anthropics/claude-plugins-official" \
    "pr-review-toolkit@claude-plugins-official"

  install_mcp "Playwright" \
    "npx -y @anthropic-ai/claude-code mcp add playwright -- npx -y @anthropic-ai/mcp-playwright"

  install_plugin "claude-mem" \
    "thedotmack/claude-mem" \
    "claude-mem@thedotmack"

  # Native plugin route (canonical since v2.x). The npm package was renamed
  # uipro-cli -> ui-ux-pro-max-cli; the old name still installs a stale version,
  # so this script no longer uses the CLI route at all.
  install_plugin "ui-ux-pro-max" \
    "nextlevelbuilder/ui-ux-pro-max-skill" \
    "ui-ux-pro-max@ui-ux-pro-max-skill"

  install_plugin "andrej-karpathy-skills" \
    "forrestchang/andrej-karpathy-skills" \
    "andrej-karpathy-skills@karpathy-skills"

  # --- Skill Pack Registry: domain packs -----------------------------------
  # Anthropic's official skills repo. One plugin covers skill-creator,
  # mcp-builder, webapp-testing, brand-guidelines, web-artifacts-builder and
  # frontend-design. The sibling document-skills plugin (docx/pdf/pptx/xlsx) is
  # source-available rather than open source, so it is NOT installed here.
  install_plugin "example-skills" \
    "anthropics/skills" \
    "example-skills@anthropic-agent-skills"

  # Anthropic first-party knowledge-work packs. These live in
  # knowledge-work-plugins, NOT claude-plugins-official. Each ships a .mcp.json
  # pre-wiring hosted third-party connectors (Snowflake, QuickBooks, DocuSign,
  # Slack, ...). Connectors stay dormant until OAuth-approved, but review them
  # before an org-wide rollout — see skills/maestro/references/ecosystem.md.
  install_plugin "finance" \
    "anthropics/knowledge-work-plugins" \
    "finance@knowledge-work-plugins"

  install_plugin "small-business" \
    "anthropics/knowledge-work-plugins" \
    "small-business@knowledge-work-plugins"

  install_plugin "legal" \
    "anthropics/knowledge-work-plugins" \
    "legal@knowledge-work-plugins"

  install_plugin "marketing-skills" \
    "coreyhaines31/marketingskills" \
    "marketing-skills@marketingskills"

  # post-scorer and reels-scripting call paid third-party APIs; voice-builder
  # must run first or output carries the pack author's branding.
  install_plugin "social-media-skills" \
    "charlie947/social-media-skills" \
    "social-media-skills@social-media-skills"

  # Leadership domain. Route to already-installed atlassian/pm-* skills first —
  # these fill the gaps those leave: exec translation, performance artefacts,
  # opportunity scanning, engineering-org leverage. All MIT.
  install_plugin "leadership-performance-management" \
    "PierrickMartos/Leadership-Skills" \
    "performance-management@leadership-skills"

  install_plugin "leadership-communication" \
    "PierrickMartos/Leadership-Skills" \
    "communication@leadership-skills"

  install_plugin "leadership-decision-making" \
    "PierrickMartos/Leadership-Skills" \
    "decision-making@leadership-skills"

  install_plugin "pm-product-discovery" \
    "phuryn/pm-skills" \
    "pm-product-discovery@pm-skills"

  install_plugin "c-level-advisor" \
    "alirezarezvani/claude-skills" \
    "c-level-skills@claude-code-skills"

  # pm-claude-skills, pinned. Unlike every other pack here this one is NOT
  # tracked at its default branch, because its README claims a listing in
  # Anthropic's official plugin directory that does not exist (the badge links
  # to an anchor in its own README) and it lands roughly a dozen commits a day
  # across 858 skills at the pinned commit. The content is sound — the four
  # leadership bundles scan clean and make zero network calls — so it ships
  # pinned to the commit that was actually reviewed rather than excluded
  # outright. "Reviewed" means: the four bundles scan to CAUTION static-only
  # (pm-delivery risk 48, 2 HIGH), and
  # every HIGH is a prose false positive on adjudication. A re-review passes
  # only if no NEW finding appears.
  #
  # `claude plugin marketplace add` cannot pin: it takes a URL, path or repo and
  # always resolves the default branch. A path source can be pinned though, so
  # clone the reviewed commit ourselves and register the directory.
  #
  # --filter=blob:none + cone sparse-checkout fetches only the four bundles:
  # 5.8M rather than the ~101M a plain --depth 1 costs on this repo.
  PIN_DIR="$HOME/.claude/pinned/pm-claude-skills"
  if is_skipped "pm-claude-skills"; then
    log_skip "pm-claude-skills (explicit --skip)"
  elif is_ephemeral_path "$PIN_DIR"; then
    # Fail rather than skip: a silent skip exits 0 and reads as success, and the
    # damage this prevents lands in the user's real config, not in this run.
    log_step "Installing pm-claude-skills (pinned $PM_CLAUDE_SKILLS_SHA)"
    printf "${RED}✘ refusing to register the pinned marketplace from a temporary path${RESET}\n" >&2
    printf "  %s\n" "$PIN_DIR" >&2
    printf "  The path is recorded absolutely in the global plugin registry, so a\n" >&2
    printf "  temporary HOME leaves an entry pointing at a directory that will not\n" >&2
    printf "  exist later, and every subsequent 'claude plugin list' reports\n" >&2
    printf "  'cache-miss' for it.\n" >&2
    printf "  Re-run with a persistent HOME, or pass --skip-pm-claude-skills.\n" >&2
    log_fail "pm-claude-skills (pinned): temporary HOME"
  else
    log_step "Installing pm-claude-skills (pinned $PM_CLAUDE_SKILLS_SHA)"
    # \$PIN_DIR is escaped in every string below so it expands INSIDE eval as an
    # ordinary parameter expansion. Interpolating it directly would make the
    # value of $HOME shell source text that eval re-parses — a HOME containing
    # $(...) would execute — which is exactly what run()'s invariant says to
    # avoid by escaping rather than widening the exception. The Transitions
    # block below already uses this form.
    if run "mkdir -p \"\$PIN_DIR\"" \
       && run "git -C \"\$PIN_DIR\" init -q" \
       && run "git -C \"\$PIN_DIR\" remote set-url origin $PM_CLAUDE_SKILLS_URL 2>/dev/null || git -C \"\$PIN_DIR\" remote add origin $PM_CLAUDE_SKILLS_URL" \
       && run "git -C \"\$PIN_DIR\" sparse-checkout init --cone" \
       && run "git -C \"\$PIN_DIR\" sparse-checkout set .claude-plugin plugins/pm-delivery plugins/pm-people plugins/pm-career plugins/pm-comms" \
       && run "git -C \"\$PIN_DIR\" fetch --depth 1 --filter=blob:none origin $PM_CLAUDE_SKILLS_SHA" \
       && run "git -C \"\$PIN_DIR\" checkout -q FETCH_HEAD" \
       && run "git -C \"\$PIN_DIR\" remote remove origin" \
       && verify_pinned_sha "$PIN_DIR" "$PM_CLAUDE_SKILLS_SHA" \
       && run "claude plugin marketplace add \"\$PIN_DIR\"" \
       && run "claude plugin install pm-delivery@pm-claude-skills" \
       && run "claude plugin install pm-people@pm-claude-skills" \
       && run "claude plugin install pm-career@pm-claude-skills" \
       && run "claude plugin install pm-comms@pm-claude-skills"; then
      log_ok "pm-claude-skills (pinned)"
    else
      log_fail "pm-claude-skills (pinned)"
    fi
  fi

  install_plugin "taste-skill" \
    "Leonxlnx/taste-skill" \
    "taste-skill@taste-skill"

  if is_skipped "transitions"; then
    log_skip "transitions (explicit --skip)"
  else
    log_step "Installing Transitions"
    # Ships no .claude-plugin manifest, so it installs as a user-scope skill by
    # copy. The canonical repo carries NO licence file (all-rights-reserved by
    # default) — fine for local personal use, do not vendor its content.
    TMPDIR_TRANSITIONS="$(mktemp -d)"
    if run "git clone --depth 1 https://github.com/Jakubantalik/transitions.dev \"$TMPDIR_TRANSITIONS/t\"" \
       && run "mkdir -p \"\$HOME/.claude/skills\"" \
       && run "cp -R \"$TMPDIR_TRANSITIONS/t/skills/transitions-dev\" \"\$HOME/.claude/skills/\""; then
      log_ok "transitions"
    else
      log_fail "transitions"
    fi
    rm -rf "$TMPDIR_TRANSITIONS"
  fi

  install_plugin "caveman" \
    "JuliusBrussee/caveman" \
    "caveman@caveman"

  if is_skipped "skillspector"; then
    log_skip "skillspector (explicit --skip)"
  else
    log_step "Installing SkillSpector"
    # SkillSpector is a Python 3.12+ CLI distributed via git (NOT on PyPI), so
    # install from the NVIDIA repo with the [mcp] extra — the extra is required
    # for `skillspector mcp` to start. uv is preferred; pip runs if uv is absent
    # OR the uv install fails. Then register the MCP server so Step 8.5 can call
    # scan_skill. Both run() strings are compile-time literals — the no-user-input
    # invariant is preserved.
    if run "{ command -v uv >/dev/null 2>&1 && uv tool install 'skillspector[mcp] @ git+https://github.com/NVIDIA/skillspector.git'; } || pip install --user 'skillspector[mcp] @ git+https://github.com/NVIDIA/skillspector.git'" \
       && run "claude mcp add skillspector -- skillspector mcp"; then
      log_ok "skillspector"
    else
      log_fail "skillspector"
    fi
  fi

  if is_skipped "everything-claude-code"; then
    log_skip "everything-claude-code (explicit --skip)"
  else
    log_step "Installing Everything Claude Code"
    TMPDIR_ECC="$(mktemp -d)"
    # cd wrapped in a subshell so the parent script's CWD is unaffected,
    # and tmpdir is cleaned up on both success and failure paths.
    if run "git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git \"$TMPDIR_ECC/ecc\"" \
       && run "(cd \"$TMPDIR_ECC/ecc\" && ./install.sh --target claude --profile full)"; then
      log_ok "everything-claude-code"
    else
      log_fail "everything-claude-code"
    fi
    rm -rf "$TMPDIR_ECC"
  fi

fi

# --- Summary ---------------------------------------------------------------

echo ""
printf "${BLUE}========================================${RESET}\n"
printf "${BLUE}  Maestro ecosystem install summary${RESET}\n"
printf "${BLUE}========================================${RESET}\n"
printf "${GREEN}Installed (${#INSTALLED[@]}):${RESET}\n"
# Guard the expansion: under `set -u`, bash < 4.4 (macOS ships 3.2) treats an
# empty array as unset, so a bare "${INSTALLED[@]}" aborts the script before
# the Skipped and Failed lists ever print. The count form is safe; only the
# expansion is not. SKIPPED and FAILED below are already guarded this way.
if [ ${#INSTALLED[@]} -gt 0 ]; then
  for i in "${INSTALLED[@]}"; do echo "  ✔ $i"; done
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
  printf "\n${YELLOW}Skipped (${#SKIPPED[@]}):${RESET}\n"
  for s in "${SKIPPED[@]}"; do echo "  ⊘ $s"; done
fi
if [ ${#FAILED[@]} -gt 0 ]; then
  printf "\n${RED}Failed (${#FAILED[@]}):${RESET}\n"
  for f in "${FAILED[@]}"; do echo "  ✖ $f"; done
  echo ""
  echo "Some components failed. Re-run with --dry-run to inspect commands,"
  echo "or install the failed components manually (see README.md)."
fi

cat <<'EOF'

Next steps:
  1. Restart Claude Code so newly-installed plugins and MCPs load.
  2. Verify installs:                claude plugin list
  3. Heavy components (VoiceMode, n8n-MCP, LightRAG) were intentionally
     excluded — install manually if needed (see README.md).

EOF

[ ${#FAILED[@]} -eq 0 ]
