#!/usr/bin/env bash
# Maestro update checker — runs on SessionStart (startup/resume; hooks.json
# scopes the matcher so compact/clear events never trigger a network call).
# Compares local plugin.json version against the latest on GitHub and prints
# one notice when a newer version is available.
#
# Contract: every failure path is a silent `exit 0`. This script runs at the
# top of every session for every installed user; a broken update check must
# degrade to silence, never to noise or a blocked session start.

set -euo pipefail

REPO="impravin22/my-claude-maestro"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"

# Bail silently if plugin root is not set
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

# jq and curl are hard dependencies of the comparison, not of the session:
# absent either, bail. Never substitute a sentinel version — a fabricated
# 0.0.0 local version compares as older than any real remote and would nag
# on every session start forever.
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

LOCAL_PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"

# Bail silently if plugin.json doesn't exist locally
if [ ! -f "$LOCAL_PLUGIN_JSON" ]; then
  exit 0
fi

# Accept plain semver triples only. This validates our own manifest (a parse
# failure is not an update signal) and, more importantly, the remote value:
# hook stdout is injected into the session context, so a non-semver remote
# string must never be echoed. MAJOR.MINOR.PATCH, digits only. Bash `=~`
# anchors ^$ on the whole string; `grep` would anchor per line, so a value
# like "1.2.3\nINJECTED" would pass a grep check and reach echo. This is the
# gate that keeps attacker-controlled manifest text out of session context.
is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Throttle: at most one network check per day, shared across sessions. The
# stamp lives in the user cache, not the plugin dir (which is replaced on
# update). An unwritable cache skips the throttle, not the session.
CACHE_DIR="${XDG_CACHE_HOME:-${HOME:-}/.cache}"
STAMP="$CACHE_DIR/maestro-update-check"
NOW="$(date +%s 2>/dev/null || printf '')"
[ -n "$NOW" ] || exit 0
if [ -f "$STAMP" ]; then
  # head -c bounds a maliciously huge stamp; 10# forces base-10 so a
  # leading-zero value is never parsed as octal by the arithmetic below.
  LAST="$(head -c 32 "$STAMP" 2>/dev/null || printf '0')"
  case "$LAST" in
    ''|*[!0-9]*) LAST=0 ;;
  esac
  if [ "$((NOW - 10#$LAST))" -lt 86400 ]; then
    exit 0
  fi
fi
mkdir -p "$CACHE_DIR" 2>/dev/null || true
# Refuse to follow a symlinked stamp: the write is a fixed epoch, so this is
# a truncation guard, not an injection one, but the filename is constant and
# never needs to be a link.
[ -L "$STAMP" ] && exit 0
{ printf '%s' "$NOW" > "$STAMP"; } 2>/dev/null || true

# Read local version; a malformed manifest bails silently
LOCAL_VERSION="$(jq -r '.version // empty' "$LOCAL_PLUGIN_JSON" 2>/dev/null || printf '')"
if [ -z "$LOCAL_VERSION" ] || ! is_semver "$LOCAL_VERSION"; then
  exit 0
fi

# Fetch remote version from GitHub (with 5s timeout to avoid blocking session start)
REMOTE_VERSION="$(curl -qsf --proto '=https' --max-redirs 0 --max-filesize 65536 --max-time 5 \
  "https://raw.githubusercontent.com/$REPO/main/.claude-plugin/plugin.json" 2>/dev/null \
  | jq -r '.version // empty' 2>/dev/null || printf '')"

# Bail silently if we couldn't fetch a plausible remote version (offline,
# rate-limited, malformed, or anything that is not a bare semver triple)
if [ -z "$REMOTE_VERSION" ] || ! is_semver "$REMOTE_VERSION"; then
  exit 0
fi

# Compare versions — only notify if remote is strictly newer
if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
  # Simple semver comparison using sort -V
  NEWER="$(printf '%s\n%s' "$LOCAL_VERSION" "$REMOTE_VERSION" | sort -V 2>/dev/null | tail -1 || printf '')"
  [ -n "$NEWER" ] || exit 0
  if [ "$NEWER" = "$REMOTE_VERSION" ] && [ "$NEWER" != "$LOCAL_VERSION" ]; then
    echo "Maestro v${REMOTE_VERSION} available (you have v${LOCAL_VERSION}). To update, run:"
    echo "  /plugin uninstall maestro@impravin22 && /plugin install maestro@impravin22"
    echo "Then restart Claude Code."
  fi
fi
