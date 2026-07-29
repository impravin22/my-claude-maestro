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
                 social-media-skills, Taste, Transitions,
                 Everything Claude Code

Flags:
  --minimal              install required components only
  --dry-run              print commands without executing
  --skip-<name>          skip a component (e.g. --skip-vercel, --skip-transitions)
  --help                 show this help

Heavy components NOT installed by this script:
  VoiceMode MCP, n8n-MCP, LightRAG
  (see README.md for manual install instructions)

Licence note: Transitions (Jakubantalik/transitions.dev) has no licence file —
it is installed as a user-scope skill for personal use; do not vendor it.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --minimal) MINIMAL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) print_help; exit 0 ;;
    --skip-*) SKIP_LIST="$SKIP_LIST ${arg#--skip-}" ;;
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
printf "${GREEN}✔ claude, node, npx, curl available${RESET}\n"

# --- Install helpers --------------------------------------------------------

ADDED_MARKETPLACES=" "

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
