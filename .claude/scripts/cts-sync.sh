#!/usr/bin/env bash
# CTS sync engine — installs/updates the claude-ts (CTS) payload in a project.
# Normally invoked by the /cts-setup and /cts-update skills, not run directly.
set -euo pipefail

DEFAULT_SOURCE="https://github.com/vaReliy/claude-ts.git"
DEFAULT_BRANCH="main"
CACHE_DIR="$HOME/.cache/claude-ts"
PAYLOAD_FILE="cts-payload.txt"
VERSION_FILE=".cts-version"
IGNORE_FILE=".ctsignore"

usage() {
  cat <<'EOF'
Usage: cts-sync.sh <init|update> [--source <path-or-url>] [--branch <name>] [--dry-run] [--force]

  init    Install the CTS payload into the current project (must be a git repo)
  update  Re-sync the CTS payload, skipping paths listed in .ctsignore

Options:
  --source <path-or-url>  Local checkout dir or git URL (default: claude-ts on GitHub)
  --branch <name>         Branch to track when --source is a URL (default: main)
  --dry-run               Print what would change without copying anything
  --force                 init: overwrite an existing CLAUDE.md/AGENTS.md/.claude/
EOF
}

[ $# -ge 1 ] || { usage; exit 1; }
CMD="$1"; shift
SOURCE="$DEFAULT_SOURCE"; BRANCH="$DEFAULT_BRANCH"; DRY_RUN=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done
case "$CMD" in init|update) ;; *) usage; exit 1 ;; esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || { echo "Error: current directory is not a git repository." >&2; exit 1; }

# Resolve the source checkout. Local paths are used as-is; URLs are mirrored
# into a local cache so repeat runs avoid a full clone.
if [ -d "$SOURCE" ]; then
  SRC_DIR="$SOURCE"
else
  mkdir -p "$(dirname "$CACHE_DIR")"
  if [ -d "$CACHE_DIR/.git" ]; then
    git -C "$CACHE_DIR" fetch --quiet origin "$BRANCH"
    git -C "$CACHE_DIR" reset --quiet --hard "origin/$BRANCH"
  else
    git clone --quiet --branch "$BRANCH" "$SOURCE" "$CACHE_DIR"
  fi
  SRC_DIR="$CACHE_DIR"
fi
NEW_SHA=$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || echo "local")

mapfile -t PAYLOAD < <(grep -vE '^[[:space:]]*(#|$)' "$SRC_DIR/$PAYLOAD_FILE")

# Gitignore-style check: a bare pattern matches exact paths and "dir/" prefixes
# anywhere in the tree; a leading "/" anchors it to the project root only
# (so "/AGENTS.md" protects the root file without shadowing nested ones).
is_ignored() {
  local p="$1" pat
  [ -f "$IGNORE_FILE" ] || return 1
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue ;; esac
    pat="${pat%/}"
    case "$pat" in
      /*)
        pat="${pat#/}"
        case "$p" in "$pat"|"$pat"/*) return 0 ;; esac ;;
      *)
        case "$p" in "$pat"|"$pat"/*|*/"$pat"|*/"$pat"/*) return 0 ;; esac ;;
    esac
  done < "$IGNORE_FILE"
  return 1
}

copy_one() {
  local rel="$1"
  if [ "$CMD" = update ] && is_ignored "$rel"; then
    if [ "$DRY_RUN" = 1 ]; then echo "skip (ignored): $rel"; fi
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    echo "copy: $rel"
    return
  fi
  mkdir -p "$(dirname "./$rel")"
  cp -p "$SRC_DIR/$rel" "./$rel"
}

# Walk a payload entry (file or directory) and copy every file under it.
# .claude/scripts/ is last in the payload, so the running script overwrites
# itself only after everything else has been copied.
sync_path() {
  local entry="${1%/}"
  if [ -d "$SRC_DIR/$entry" ]; then
    while IFS= read -r -d '' f; do
      copy_one "${f#"$SRC_DIR"/}"
    done < <(find "$SRC_DIR/$entry" -type f -print0)
  else
    copy_one "$entry"
  fi
}

if [ "$CMD" = init ]; then
  if [ "$FORCE" != 1 ]; then
    for p in CLAUDE.md AGENTS.md .claude; do
      [ -e "$p" ] && { echo "Error: $p already exists. Use --force, or run /cts-setup for existing projects." >&2; exit 1; }
    done
  fi
  for entry in "${PAYLOAD[@]}"; do sync_path "$entry"; done
  if [ "$DRY_RUN" != 1 ]; then
    echo "$NEW_SHA" > "$VERSION_FILE"
    [ -f "$IGNORE_FILE" ] || cat > "$IGNORE_FILE" <<'EOF'
# .ctsignore — gitignore-syntax paths that `cts-sync.sh update` will never touch.
# Use for: customized CTS files, pruned CTS files (prevents re-adding them),
# and project-only additions placed under payload directories.
# A leading "/" anchors to the project root: "/AGENTS.md" protects only the
# root file; a bare "AGENTS.md" would also match nested files with that name.
EOF
  fi
  echo "Done. CTS payload installed at $NEW_SHA."
else
  OLD_SHA=$(cat "$VERSION_FILE" 2>/dev/null || echo "")
  for entry in "${PAYLOAD[@]}"; do sync_path "$entry"; done
  for entry in "${PAYLOAD[@]}"; do
    entry="${entry%/}"
    [ -d "$SRC_DIR/$entry" ] && [ -d "./$entry" ] || continue
    while IFS= read -r -d '' f; do
      rel="${f#./}"
      [ -e "$SRC_DIR/$rel" ] || is_ignored "$rel" || echo "removed upstream — delete manually if unwanted: $rel"
    done < <(find "./$entry" -type f -print0)
  done
  # Ignored files are never touched, but silence must not hide upstream drift:
  # report any .ctsignore'd payload file that changed in CTS since the last sync.
  if [ -n "$OLD_SHA" ] && [ "$OLD_SHA" != "$NEW_SHA" ] && git -C "$SRC_DIR" cat-file -e "$OLD_SHA" 2>/dev/null; then
    while IFS= read -r f; do
      if is_ignored "$f"; then
        echo "ignored, but changed upstream — review manually: $f"
        echo "  git -C $SRC_DIR diff $OLD_SHA..$NEW_SHA -- $f"
      fi
    done < <(git -C "$SRC_DIR" diff --name-only "$OLD_SHA" "$NEW_SHA")
    if [ "$DRY_RUN" != 1 ]; then
      echo "Changes:"
      git -C "$SRC_DIR" log --oneline "$OLD_SHA..$NEW_SHA"
    fi
  fi
  [ "$DRY_RUN" = 1 ] || echo "$NEW_SHA" > "$VERSION_FILE"
  echo "Done. Review with: git diff"
fi
