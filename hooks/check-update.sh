#!/usr/bin/env bash
# Maestro update checker — runs on SessionStart
# Compares local plugin.json version against the latest on GitHub.
# Prints a notice if a newer version is available.

set -euo pipefail

REPO="impravin22/my-claude-maestro"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"

# Bail silently if plugin root is not set
if [ -z "$PLUGIN_ROOT" ]; then
  exit 0
fi

LOCAL_PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"

# Bail silently if plugin.json doesn't exist locally
if [ ! -f "$LOCAL_PLUGIN_JSON" ]; then
  exit 0
fi

# Read local version
LOCAL_VERSION=$(jq -r '.version // "0.0.0"' "$LOCAL_PLUGIN_JSON" 2>/dev/null || echo "0.0.0")

# Fetch remote version from GitHub (with 5s timeout to avoid blocking session start)
REMOTE_VERSION=$(curl -sf --max-time 5 \
  "https://raw.githubusercontent.com/$REPO/main/.claude-plugin/plugin.json" 2>/dev/null \
  | jq -r '.version // "0.0.0"' 2>/dev/null || echo "")

# Bail silently if we couldn't fetch remote version (offline, rate-limited, etc.)
if [ -z "$REMOTE_VERSION" ] || [ "$REMOTE_VERSION" = "0.0.0" ]; then
  exit 0
fi

# Compare versions — only notify if remote is strictly newer
if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
  # Simple semver comparison using sort -V
  NEWER=$(printf '%s\n%s' "$LOCAL_VERSION" "$REMOTE_VERSION" | sort -V | tail -1)
  if [ "$NEWER" = "$REMOTE_VERSION" ] && [ "$NEWER" != "$LOCAL_VERSION" ]; then
    echo "Maestro v${REMOTE_VERSION} available (you have v${LOCAL_VERSION}). To update, run:"
    echo "  /plugin uninstall maestro@impravin22 && /plugin install maestro@impravin22"
    echo "Then restart Claude Code."
  fi
fi
