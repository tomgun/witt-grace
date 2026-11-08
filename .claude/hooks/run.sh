#!/usr/bin/env sh
# Runs a Node hook script from a non-login shell (Claude Code hooks do not source your profile).
# PreToolUse hooks fail CLOSED when no Node is found: a guard that cannot evaluate must refuse.
set -u
SCRIPT="$1"; shift
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "hook: node not found — blocking (install Node 24 or fix PATH)" >&2
  exit 2
fi
exec "$NODE_BIN" "$SCRIPT" "$@"
