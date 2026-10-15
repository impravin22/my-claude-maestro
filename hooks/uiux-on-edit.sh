#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit. Runs the bundled elattar-uiux-design
# after-edit check (skills/elattar-uiux-design/checks/eslint/on-edit.mjs), which
# flags ui components used with a prop or variant value they do not define.
#
# The check is bundled into maestro, so this hook fires for every maestro user,
# not only projects on the ViewSonic design system. This wrapper keeps that safe:
#
#   MAESTRO_UIUX_HOOK=off            exit 0 without starting node (opt-out)
#   no plugin root, script or node   exit 0 silently
#   check exits 2 (violations)       exit 2, its stderr lines passed through;
#                                    Claude Code feeds them back to the agent
#   check exits 0                    exit 0, its stdout (hook JSON) passed through
#   check exits anything else        exit 0, stderr dropped: upstream treats an
#                                    internal error as nothing to report, and an
#                                    old Node that cannot parse the module must
#                                    not print an error after every edit
#
# The hook input arrives on stdin and is inherited by node unchanged.

set -u

[ "${MAESTRO_UIUX_HOOK:-}" = "off" ] && exit 0
[ -n "${CLAUDE_PLUGIN_ROOT:-}" ] || exit 0

CHECK="$CLAUDE_PLUGIN_ROOT/skills/elattar-uiux-design/checks/eslint/on-edit.mjs"
[ -f "$CHECK" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

# Capture stderr only; stdout goes straight through on fd 3.
{ ERR="$(node "$CHECK" 2>&1 1>&3 3>&-)"; RC=$?; } 3>&1

if [ "$RC" -eq 2 ]; then
  printf '%s\n' "$ERR" >&2
  exit 2
fi
exit 0
