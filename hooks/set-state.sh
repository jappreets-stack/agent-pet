#!/usr/bin/env bash
# Records the coding agent's current state so the desktop pet can show it at a glance.
# Claude Code calls this from hooks, e.g.:  set-state.sh working
# It drains the hook's JSON (stdin) and writes one word to the state file.
cat >/dev/null 2>&1 || true
state="${1:-idle}"
echo "$state" > "${CLAUDE_PET_STATE:-/tmp/claude-pet-state}"
exit 0
