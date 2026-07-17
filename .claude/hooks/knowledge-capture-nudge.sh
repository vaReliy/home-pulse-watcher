#!/usr/bin/env bash
# .claude/hooks/knowledge-capture-nudge.sh
#
# Claude Code Stop hook — knowledge-capture nudge.
#
# Fires when the orchestrator stops (main session only). Subagents skip this hook
# to surface learnings via their final report's ## Learnings section instead.
# Assumes orchestrator runs as a plain session (no agent_id/agent_type); presence of
# either field indicates not a top-level session and triggers the subagent skip guard.
# If the session changed source/config/template files but the shared knowledge
# ledgers were not updated, the hook blocks once per session per unmet category
# and forces the model to make an explicit decision.
#
# Protocol (Claude Code Stop hook):
#   stdin  — JSON { stop_hook_active: bool, session_id: string, … }
#   stdout — {"decision":"block","reason":"…"}  →  block stop
#            (empty / exit 0)                   →  allow stop

set -uo pipefail

# ── 1. Parse stdin ────────────────────────────────────────────────────────────
INPUT=$(cat)

if command -v jq &>/dev/null; then
  STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')
else
  # Fallback: grep/sed — handles the common single-line JSON format
  STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" \
    | grep -oP '"stop_hook_active"\s*:\s*\K(true|false)' 2>/dev/null | head -1 \
    || echo "false")
  SESSION_ID=$(printf '%s' "$INPUT" \
    | grep -oP '"session_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 \
    || echo "unknown")
fi

# ── 1.5. Normalize and sanitize SESSION_ID ────────────────────────────────────
# Fallback for malformed/non-JSON stdin: jq -r '.field // "unknown"' yields empty
# on parse failure (unlike grep/sed branch's || echo "unknown"). Normalize here.
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

# Sanitize: strip SESSION_ID to safe filename characters [A-Za-z0-9_-]
# before marker-path interpolation to prevent path traversal / arbitrary file creation.
SESSION_ID=$(printf '%s' "$SESSION_ID" | tr -cd 'A-Za-z0-9_-')

# Backstop: sanitization may have emptied the value — revert to "unknown"
[ -z "$SESSION_ID" ] && SESSION_ID="unknown"

# ── 1.6. Subagent scoping guard ───────────────────────────────────────────────
# Knowledge-capture obligation belongs to the orchestrator session only.
# Subagents surface learnings via the ## Learnings section of their final report.
if command -v jq &>/dev/null; then
  AGENT_ID=$(printf '%s' "$INPUT" | jq -r '.agent_id // empty')
  AGENT_TYPE=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty')
else
  # Fallback: grep/sed — matches existing style
  AGENT_ID=$(printf '%s' "$INPUT" \
    | grep -oP '"agent_id"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)
  AGENT_TYPE=$(printf '%s' "$INPUT" \
    | grep -oP '"agent_type"\s*:\s*"\K[^"]+' 2>/dev/null | head -1 || true)
fi

if [ -n "$AGENT_ID" ] || [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

# ── 2. Loop guard ─────────────────────────────────────────────────────────────
# Already inside a stop-hook cycle — allow unconditionally to prevent infinite loops.
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# ── 3. Detect changed paths ───────────────────────────────────────────────────
# git status --porcelain columns: XY<space>path  (or XY<space>old -> new for renames)
# $NF gives the last field — the destination path for renames, the path otherwise.
CHANGED_PATHS=$(git status --porcelain 2>/dev/null | awk '{print $NF}' || true)

if [ -z "$CHANGED_PATHS" ]; then
  exit 0  # Clean working tree — nothing to check
fi

# ── 4. Classify the change set ────────────────────────────────────────────────
SOURCE_CHANGED=false
TEMPLATE_CHANGED=false
INBOX_UPDATED=false
CHANGELOG_UPDATED=false
METRICS_UPDATED=false

while IFS= read -r p; do
  [ -z "$p" ] && continue

  # Source / executable config — real work happened
  # Also includes template-inherited files (CLAUDE.md, rules/, .claude/) because
  # editing them IS real work that may produce durable learnings.
  if printf '%s' "$p" | grep -qE \
       '^(apps/|libs/|src/|test/|e2e/|prisma/|migrations/|\.github/)' \
  || printf '%s' "$p" | grep -qE \
       '^(package\.json|Dockerfile|docker-compose)' \
  || printf '%s' "$p" | grep -qE \
       '\.(config\.(ts|js|mjs|cjs)|config\.ts|config\.js)$' \
  || printf '%s' "$p" | grep -qE \
       '^(tsconfig|\.eslintrc|eslint\.config\.)' \
  || printf '%s' "$p" | grep -qE \
       '^(CLAUDE\.md|AGENTS\.md|rules/|\.claude/)'; then
    SOURCE_CHANGED=true
  fi

  # claude-ts template-inherited files
  if printf '%s' "$p" | grep -qE \
       '^(CLAUDE\.md|AGENTS\.md|rules/|\.claude/agents/|\.claude/skills/)'; then
    TEMPLATE_CHANGED=true
  fi

  # Shared knowledge ledger files
  if printf '%s' "$p" | grep -q 'docs/KNOWLEDGE_INBOX\.md'; then
    INBOX_UPDATED=true
  fi
  if printf '%s' "$p" | grep -q 'docs/CLAUDE_TS_CHANGELOG\.md'; then
    CHANGELOG_UPDATED=true
  fi
  if printf '%s' "$p" | grep -q 'docs/METRICS\.md'; then
    METRICS_UPDATED=true
  fi
done <<< "$CHANGED_PATHS"

# ── 5. Cadence guard — nudge once per session per unmet category ──────────────
TMPDIR_SAFE="${TMPDIR:-/tmp}"
MARKER_BASE="${TMPDIR_SAFE}/cts-kc-nudge-${SESSION_ID}"

already_nudged() { [ -f "${MARKER_BASE}-${1}" ]; }
mark_nudged()    { touch "${MARKER_BASE}-${1}" 2>/dev/null || true; }

# ── 6. Build reminder messages ────────────────────────────────────────────────
REMINDERS=()

if [ "$SOURCE_CHANGED" = "true" ] && [ "$INBOX_UPDATED" = "false" ]; then
  if ! already_nudged "inbox"; then
    mark_nudged "inbox"
    REMINDERS+=("KNOWLEDGE CAPTURE REQUIRED: This session changed source or config files. Evaluate now: did a durable, project-relevant learning emerge? Examples: a library setup recipe, a wrong-pattern catch (e.g. missing .js imports), a test anti-pattern, a non-obvious architectural decision. If yes — append a 3-line entry to docs/KNOWLEDGE_INBOX.md right now: '## YYYY-MM-DD — [area] short fact' + 'Why: ...' + 'Belongs in (guess): PROJECT_CONTEXT | CLAUDE.md | rule | skill | claude-ts-upstream | discard'. If nothing durable was learned, state it explicitly: 'Nothing durable — no inbox entry needed.'")
  fi
fi

if [ "$TEMPLATE_CHANGED" = "true" ] && [ "$CHANGELOG_UPDATED" = "false" ]; then
  if ! already_nudged "changelog"; then
    mark_nudged "changelog"
    REMINDERS+=("CLAUDE_TS_CHANGELOG REQUIRED: This session modified a claude-ts template-inherited file (CLAUDE.md, AGENTS.md, rules/**, .claude/agents/**, .claude/skills/**) but docs/CLAUDE_TS_CHANGELOG.md was not updated. Log the divergence or fix in docs/CLAUDE_TS_CHANGELOG.md now using the format in that file (Component / Type / What happened / Why it matters upstream / Suggested upstream change / Status: pending-port).")
  fi
fi

if [ "$SOURCE_CHANGED" = "true" ] && [ "$METRICS_UPDATED" = "false" ]; then
  if ! already_nudged "metrics"; then
    mark_nudged "metrics"
    REMINDERS+=("METRICS REQUIRED: This session changed source or config files. If this represents a completed task (full pipeline run with potential quality-gate cycles), append a row to docs/METRICS.md now with columns: Date / Repo / Task / Tier / Cycles / Fix Now / Emitted / Hardstop / Model. If this is mid-task work or not a full pipeline completion, state that explicitly instead of adding a METRICS row.")
  fi
fi

# ── 7. Block or allow ─────────────────────────────────────────────────────────
if [ ${#REMINDERS[@]} -eq 0 ]; then
  exit 0
fi

# Join reminders with a separator
REASON="${REMINDERS[0]}"
for ((i = 1; i < ${#REMINDERS[@]}; i++)); do
  REASON="${REASON} || ${REMINDERS[$i]}"
done

# Emit structured block response (JSON)
if command -v jq &>/dev/null; then
  jq -n --arg r "$REASON" '{"decision":"block","reason":$r}'
else
  # Minimal fallback: escape backslash and double-quote
  ESC=$(printf '%s' "$REASON" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"decision":"block","reason":"%s"}\n' "$ESC"
fi
