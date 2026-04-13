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
  [required]      superpowers plugin, Context7 MCP
  [recommended]   Vercel plugin, Security Guidance, Playwright MCP,
                  claude-mem, UI UX Pro Max, Everything Claude Code,
                  Andrej Karpathy Skills
  [bundled w/ CC] PR Review Toolkit (ships with Claude Code — no install)

Flags:
  --minimal              install required components only
  --dry-run              print commands without executing
  --skip-<name>          skip a component (e.g. --skip-vercel, --skip-voicemode)
  --help                 show this help

Heavy components NOT installed by this script:
  VoiceMode MCP, n8n-MCP, LightRAG
  (see README.md for manual install instructions)
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

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
RESET='\033[0m'

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

install_plugin() {
  local name="$1" marketplace="$2" plugin_spec="$3"
  if is_skipped "$name"; then
    log_skip "$name (explicit --skip)"
    return
  fi
  log_step "Installing $name"
  run "claude plugin marketplace add $marketplace" \
    || log_fail "$name: marketplace add failed (continuing)"
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
  "obra/superpowers" \
  "superpowers@superpowers"

install_mcp "Context7" \
  "npx -y ctx7 setup --claude"

# --- Recommended (skip if --minimal) ---------------------------------------

if [ "$MINIMAL" -eq 0 ]; then

  install_plugin "vercel" \
    "vercel-labs/agent-skills" \
    "vercel@vercel-labs"

  if is_skipped "security-guidance"; then
    log_skip "security-guidance (explicit --skip)"
  else
    log_step "Installing Security Guidance (Anthropic marketplace)"
    if run "claude plugin install security-guidance@anthropic"; then
      log_ok "security-guidance"
    else
      log_fail "security-guidance (requires Anthropic marketplace access)"
    fi
  fi

  install_mcp "Playwright" \
    "npx -y @anthropic-ai/claude-code mcp add playwright -- npx -y @anthropic-ai/mcp-playwright"

  if is_skipped "claude-mem"; then
    log_skip "claude-mem (explicit --skip)"
  else
    log_step "Installing claude-mem"
    if run "npx -y claude-mem install"; then
      log_ok "claude-mem"
    else
      log_fail "claude-mem"
    fi
  fi

  if is_skipped "ui-ux-pro-max"; then
    log_skip "ui-ux-pro-max (explicit --skip)"
  else
    log_step "Installing UI UX Pro Max"
    if run "npm i -g uipro-cli" && run "uipro init --ai claude"; then
      log_ok "ui-ux-pro-max"
    else
      log_fail "ui-ux-pro-max"
    fi
  fi

  install_plugin "andrej-karpathy-skills" \
    "forrestchang/andrej-karpathy-skills" \
    "andrej-karpathy-skills@karpathy-skills"

  if is_skipped "everything-claude-code"; then
    log_skip "everything-claude-code (explicit --skip)"
  else
    log_step "Installing Everything Claude Code"
    TMPDIR_ECC="$(mktemp -d)"
    if run "git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git \"$TMPDIR_ECC/ecc\"" \
       && run "cd \"$TMPDIR_ECC/ecc\" && ./install.sh --target claude --profile full"; then
      log_ok "everything-claude-code"
    else
      log_fail "everything-claude-code"
    fi
  fi

fi

# --- Summary ---------------------------------------------------------------

echo ""
printf "${BLUE}========================================${RESET}\n"
printf "${BLUE}  Maestro ecosystem install summary${RESET}\n"
printf "${BLUE}========================================${RESET}\n"
printf "${GREEN}Installed (${#INSTALLED[@]}):${RESET}\n"
for i in "${INSTALLED[@]}"; do echo "  ✔ $i"; done
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
  2. Verify Context7 is reachable:   /plugin list
  3. PR Review Toolkit ships with Claude Code — no install needed.
  4. Heavy components (VoiceMode, n8n-MCP, LightRAG) were intentionally
     excluded — install manually if needed (see README.md).

EOF

[ ${#FAILED[@]} -eq 0 ]
