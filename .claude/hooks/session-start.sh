#!/bin/bash
# Injects kreya session memory delta (facts beyond claude-context.json) as system prefix
MEMORY="${CLAUDE_PROJECT_DIR}/.claude/kreya-session-memory.md"
if [[ -f "$MEMORY" ]]; then
  # Only emit if there are real facts (lines not starting with #, <, or whitespace-only)
  if grep -qP "^[^#(<\s]" "$MEMORY" 2>/dev/null; then
    cat "$MEMORY"
  fi
fi
