#!/usr/bin/env bash
# CTS sync engine — installs/updates the claude-ts (CTS) payload in a project.
# Normally invoked by the /cts-setup and /cts-update skills, not run directly.
set -euo pipefail

DEFAULT_SOURCE="https://github.com/vaReliy/claude-ts.git"
DEFAULT_BRANCH="main"
CACHE_DIR="$HOME/.cache/claude-ts"
PAYLOAD_FILE="cts-payload.txt"
VERSION_FILE=".cts-version"
SOURCE_FILE=".cts-source"
IGNORE_FILE=".ctsignore"

usage() {
  cat <<'EOF'
Usage: cts-sync.sh <init|update> [--source <path-or-url>] [--branch <name>] [--dry-run] [--force] [--no-merge] [--no-normalize]

  init    Install the CTS payload into the current project (must be a git repo)
  update  Re-sync the CTS payload, skipping paths listed in .ctsignore

Options:
  --source <path-or-url>  Local checkout dir or git URL (default: claude-ts on GitHub)
  --branch <name>         Branch to track when --source is a URL (default: main)
  --dry-run               Print what would change without copying anything
  --force                 init: overwrite an existing CLAUDE.md/AGENTS.md/.claude/
  --no-merge              update: never 3-way merge — preserve diverged files as-is
  --no-normalize          update: compare/merge raw content, skip prettier renormalize
EOF
}

[ $# -ge 1 ] || { usage; exit 1; }
CMD="$1"; shift
SOURCE="$DEFAULT_SOURCE"; BRANCH="$DEFAULT_BRANCH"; DRY_RUN=0; FORCE=0; NO_MERGE=0; NO_NORMALIZE=0
EXPLICIT_SOURCE=0; EXPLICIT_BRANCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; EXPLICIT_SOURCE=1; shift 2 ;;
    --branch) BRANCH="$2"; EXPLICIT_BRANCH=1; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    --no-merge) NO_MERGE=1; shift ;;
    --no-normalize) NO_NORMALIZE=1; shift ;;
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

# A plain re-run resolves the same DEFAULT_SOURCE/DEFAULT_BRANCH every time, but
# a run that previously used an explicit --source/--branch (e.g. a local WIP
# checkout) leaves no record of *which* source produced .cts-version's SHA.
# A later plain-default run against a source with an older tip than that
# previous one is then indistinguishable from upstream having lost commits —
# only a diff against the wrong baseline. Record what was actually used, and
# warn (don't block — the caller may legitimately be switching sources) when
# an implicit (no flags passed) run's resolution disagrees with the last one.
CURRENT_SOURCE_DESC="$SOURCE $BRANCH"
if [ -f "$SOURCE_FILE" ] && [ "$EXPLICIT_SOURCE" != 1 ] && [ "$EXPLICIT_BRANCH" != 1 ]; then
  # .cts-source is a multi-line record (source:/branch:/synced:/outcome:) as of
  # this script's current version, but a project synced by an older cts-sync.sh
  # left a bare "SOURCE BRANCH" line — handle both so the mismatch check keeps
  # working through the format transition.
  if grep -q '^source:' "$SOURCE_FILE" 2>/dev/null; then
    PREV_SOURCE=$(grep '^source:' "$SOURCE_FILE" | head -1 | sed 's/^source:[[:space:]]*//' || true)
    PREV_BRANCH=$(grep '^branch:' "$SOURCE_FILE" | head -1 | sed 's/^branch:[[:space:]]*//' || true)
    PREV_SOURCE_DESC="$PREV_SOURCE $PREV_BRANCH"
  else
    PREV_SOURCE_DESC=$(cat "$SOURCE_FILE" 2>/dev/null || echo "")
  fi
  if [ -n "${PREV_SOURCE_DESC:-}" ] && [ "$PREV_SOURCE_DESC" != "$CURRENT_SOURCE_DESC" ]; then
    echo "Warning: last sync used source \"$PREV_SOURCE_DESC\"; this run resolved \"$CURRENT_SOURCE_DESC\" — these differ." >&2
    echo "         A large or unexpected diff below may reflect the source change, not upstream data loss." >&2
    echo "         Pass --source/--branch to match the prior run, or continue to switch sources." >&2
  fi
fi

# Written by write_source_file (see below) at both init/update completion.
# .cts-source is intentionally NOT a format cts-contribute parses — only
# .cts-version (a bare SHA) is read by cts-contribute step 1c, and this
# function never touches it.
write_source_file() {
  local copied="$1" merged="$2" conflicts="$3" needs_attention="$4"
  {
    echo "source: $SOURCE"
    echo "branch: $BRANCH"
    echo "synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "outcome: $copied files updated, $merged merged, $conflicts conflicts, $needs_attention needs-attention"
  } > "$SOURCE_FILE"
}

mapfile -t PAYLOAD < <(grep -vE '^[[:space:]]*(#|$)' "$SRC_DIR/$PAYLOAD_FILE")

# Defense-in-depth: some files are project-local and must never be shipped to
# consumers (docs/KNOWLEDGE_INBOX.md — see the "Explicitly NOT payload" note
# in cts-payload.txt). That's currently enforced only by never listing it as
# a payload entry; this guard turns a future careless edit (e.g. listing
# "docs/" as a whole directory instead of individual files) into a loud
# failure instead of a silent leak.
NEVER_PAYLOAD=(docs/KNOWLEDGE_INBOX.md)
covers_forbidden() {
  local entry="$1" forbidden="$2"
  [ "$entry" = "$forbidden" ] && return 0
  [ -d "$SRC_DIR/$entry" ] || return 1
  case "$forbidden" in "$entry"/*) return 0 ;; *) return 1 ;; esac
}
for entry in "${PAYLOAD[@]}"; do
  entry="${entry%/}"
  for forbidden in "${NEVER_PAYLOAD[@]}"; do
    if covers_forbidden "$entry" "$forbidden"; then
      echo "Error: $forbidden must never be a payload entry (project-local, never synced to consumers)." >&2
      exit 1
    fi
  done
done

# Owner-only skills: live in this repo's .claude/skills/ (which IS a payload
# entry as a whole directory), but must never reach a consumer's tree. Unlike
# NEVER_PAYLOAD this can't be enforced by refusing a payload *entry* (the
# entry is the whole "/.claude/skills/" directory, and it must stay a
# payload entry so every other skill still syncs) — so the exclusion is
# enforced per-file in copy_one() below instead. The guard here only catches
# the failure mode of someone later adding one of these paths as its own
# explicit cts-payload.txt line, which would bypass the per-file skip. Unlike
# covers_forbidden() above, this match is exact-only (no directory-covers-file
# case) — a payload line naming a single file *inside* an owner-only skill dir
# would slip past this guard, though is_owner_only_skill() in copy_one() still
# catches it as a second layer, so no actual leak results.
OWNER_ONLY_SKILLS=(.claude/skills/cts-review-contribution/)
for entry in "${PAYLOAD[@]}"; do
  entry="${entry%/}"
  for owner_only in "${OWNER_ONLY_SKILLS[@]}"; do
    if [ "$entry" = "${owner_only%/}" ]; then
      echo "Error: $owner_only must never be listed as its own payload entry (owner-only, never synced to consumers)." >&2
      exit 1
    fi
  done
done

is_owner_only_skill() {
  local rel="$1" owner_only
  for owner_only in "${OWNER_ONLY_SKILLS[@]}"; do
    case "$rel" in "${owner_only%/}"/*) return 0 ;; esac
  done
  return 1
}

# Gitignore-style check: a bare pattern matches exact paths and "dir/" prefixes
# anywhere in the tree; a leading "/" anchors it to the project root only
# (so "/AGENTS.md" protects the root file without shadowing nested ones).
is_ignored() {
  local p="$1" pat
  [ -f "$IGNORE_FILE" ] || return 1
  while IFS= read -r pat || [ -n "$pat" ]; do
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

# Payload paths and file listings come from the chosen --source, which can be
# a URL or a local checkout the operator doesn't fully control (e.g. a fork).
# Refuse anything that could resolve outside the project root before it
# reaches a write sink (cp/mkdir -p) in copy_one or merge_one.
is_safe_rel() {
  case "$1" in
    /*|*/../*|../*|*/..) return 1 ;;
    ..) return 1 ;;
  esac
  return 0
}

# .claude/scripts/ contains this running script. Bash does not fully buffer a
# script's source before executing straight-through code, so if copy_one wrote
# the new .claude/scripts/cts-sync.sh directly, later reads of this script's
# remaining bytes would land on the new file at the old file's byte offsets —
# garbage that doesn't parse as any coherent statement, producing a spurious
# non-zero exit (or worse) after all real work already completed correctly.
# Fix: writes targeting .claude/scripts/ are staged here instead, and flushed
# into place by flush_self_scripts as the literal last statement of the
# script (see end of file) — nothing executes after that copy, so no
# mid-read corruption is possible.
SCRIPTS_STAGE=$(mktemp -d)
is_self_script() {
  case "$1" in .claude/scripts/*) return 0 ;; *) return 1 ;; esac
}
flush_self_scripts() {
  if [ -d "$SCRIPTS_STAGE/.claude/scripts" ]; then
    mkdir -p ./.claude/scripts
    cp -rp "$SCRIPTS_STAGE/.claude/scripts/." ./.claude/scripts/
  fi
  rm -rf "$SCRIPTS_STAGE"
}

# Renormalize (git-merge-file -Xrenormalize equivalent, hand-rolled): each
# consumer keeps its own formatter config, so a file reformatted locally with
# the consumer's own prettier diverges from the CTS baseline on formatting
# alone — false "locally modified" positives and spurious merge conflicts.
# Auto-detect the receiver's own prettier (never CTS's — this repo ships
# none) and, when present, compare/merge through it so only semantic diffs
# survive; absent or non-prettier-handled files fall back to raw comparison
# unchanged. update-only: init has no prior baseline to normalize against.
PRETTIER_BIN=""
if [ "$CMD" = update ] && [ "$NO_NORMALIZE" != 1 ] && [ -x ./node_modules/.bin/prettier ]; then
  PRETTIER_BIN="./node_modules/.bin/prettier"
  echo "Normalizing diffs through this project's prettier (--no-normalize to disable)."
fi
is_prettier_ext() {
  case "$1" in
    *.md|*.json|*.jsonc|*.yaml|*.yml|*.js|*.ts|*.css|*.html) return 0 ;;
    *) return 1 ;;
  esac
}
# Writes normalized content to stdout. The extension gate avoids spawning
# prettier for shell scripts and other non-prettier-handled files.
norm_file() {
  local rel="$1" src="$2"
  if [ -n "$PRETTIER_BIN" ] && is_prettier_ext "$rel"; then
    # Both branches used to write directly to stdout (`prettier ... || cat
    # "$src"`), sharing one fd. If prettier ever emitted partial output
    # before failing (it doesn't today — it buffers until a successful
    # parse — but that's an implementation detail, not a guarantee), the
    # `cat` fallback would concatenate raw content after it, and callers
    # that feed norm_file's output into a 3-way merge (merge_one) would
    # write that garbage into the consumer's tree. Route prettier's output
    # through a temp file so only one branch's bytes ever reach stdout.
    # RETURN (not EXIT) so this doesn't clobber the caller's EXIT trap.
    # merge_one() calls norm_file() up to 3x while it has its own EXIT trap
    # live for its whole body; an EXIT trap here would overwrite that trap on
    # entry and clear it on exit, silently disabling merge_one's cleanup for
    # the rest of its body. RETURN fires once when *this* function returns
    # and is set fresh on every call, but bash's RETURN trap is a single
    # global slot, not a call-stack-scoped one: left as-is it would remain
    # armed after norm_file returns. Without functrace it wouldn't misfire
    # on other functions' returns, but it would re-arm on the next
    # source-d script's return (with $out out of scope, crashing under
    # `set -u`). `trap - RETURN` inside the trap body disarms it
    # immediately after it fires, so it only ever acts on this exact call.
    local out; out=$(mktemp)
    trap 'rm -f "$out"; trap - RETURN' RETURN
    if "$PRETTIER_BIN" --stdin-filepath "$rel" < "$src" > "$out" 2>/dev/null; then
      cat "$out"
    else
      cat "$src"
    fi
  else
    cat "$src"
  fi
}

LOCALLY_MODIFIED=()

# During update, a file is only fast-forwarded if the working copy still
# matches what was synced last time (content at OLD_SHA). If it diverged
# (local customization not yet in .ctsignore), skip it and report it instead
# of clobbering — the file may be headed for cts-contribute, not overwrite.
is_locally_modified() {
  local rel="$1"
  [ "$CMD" = update ] || return 1
  [ -n "${OLD_SHA:-}" ] || return 1
  [ -e "./$rel" ] || return 1
  git -C "$SRC_DIR" cat-file -e "$OLD_SHA:$rel" 2>/dev/null || return 1
  local base_tmp; base_tmp=$(mktemp)
  git -C "$SRC_DIR" show "$OLD_SHA:$rel" > "$base_tmp" 2>/dev/null
  local differs=1
  cmp -s <(norm_file "$rel" "$base_tmp") <(norm_file "$rel" "./$rel") && differs=0
  rm -f "$base_tmp"
  [ "$differs" = 1 ]
}

# True once a diverged file (see is_locally_modified) has also moved
# upstream since OLD_SHA — the case that needs a 3-way merge rather than
# a plain skip-and-report.
upstream_changed() {
  local rel="$1"
  local base_tmp; base_tmp=$(mktemp)
  git -C "$SRC_DIR" show "$OLD_SHA:$rel" > "$base_tmp" 2>/dev/null
  local differs=1
  cmp -s <(norm_file "$rel" "$base_tmp") <(norm_file "$rel" "$SRC_DIR/$rel") && differs=0
  rm -f "$base_tmp"
  [ "$differs" = 1 ]
}

# Baseline-integrity audit (update only, runs before any file is mutated):
# detect content that the recorded baseline (.cts-version) says this project
# received, which upstream still ships, but which is absent from the working
# copy — the signature of a "phantom baseline": a stamp advanced past content
# that never actually landed (e.g. a mis-resolved conflict in an earlier
# sync). A 3-way merge can never repair this — the gap is indistinguishable
# from a deliberate local deletion, so merges silently preserve it forever —
# which makes loud detection here the only defense before the gap compounds.
# Line-set comparison on normalized content: small counts are usually
# deliberate rewording (a consumer replacing generic text with its own),
# large counts are entire missing features; the count is reported so the
# operator can judge, and deliberate divergence is silenced by .ctsignore,
# not by lowering the threshold.
BASELINE_AUDIT_MIN_LINES=3
baseline_audit_one() {
  local rel="$1"
  git -C "$SRC_DIR" cat-file -e "$OLD_SHA:$rel" 2>/dev/null || return 0
  [ -e "./$rel" ] || return 0
  [ -e "$SRC_DIR/$rel" ] || return 0
  local base_tmp base_n local_n up_n phantom=0
  base_tmp=$(mktemp); base_n=$(mktemp); local_n=$(mktemp); up_n=$(mktemp)
  git -C "$SRC_DIR" show "$OLD_SHA:$rel" > "$base_tmp" 2>/dev/null
  norm_file "$rel" "$base_tmp" | grep -v '^[[:space:]]*$' | sort -u > "$base_n"
  norm_file "$rel" "./$rel" | grep -v '^[[:space:]]*$' | sort -u > "$local_n"
  if ! cmp -s "$base_n" "$local_n"; then
    norm_file "$rel" "$SRC_DIR/$rel" | grep -v '^[[:space:]]*$' | sort -u > "$up_n"
    phantom=$(comm -23 "$base_n" "$local_n" | comm -12 - "$up_n" | wc -l)
  fi
  rm -f "$base_tmp" "$base_n" "$local_n" "$up_n"
  if [ "$phantom" -ge "$BASELINE_AUDIT_MIN_LINES" ]; then
    BASELINE_WARNINGS+=("$rel|$phantom")
  fi
}

baseline_audit() {
  [ "$CMD" = update ] || return 0
  [ -n "${OLD_SHA:-}" ] || return 0
  git -C "$SRC_DIR" cat-file -e "$OLD_SHA" 2>/dev/null || return 0
  local entry rel f
  for entry in "${PAYLOAD[@]}"; do
    entry="${entry%/}"
    if [ -d "$SRC_DIR/$entry" ]; then
      while IFS= read -r -d '' f; do
        rel="${f#"$SRC_DIR"/}"
        is_safe_rel "$rel" || continue
        is_owner_only_skill "$rel" && continue
        is_ignored "$rel" && continue
        baseline_audit_one "$rel"
      done < <(find "$SRC_DIR/$entry" -type f -print0)
    else
      is_ignored "$entry" && continue
      baseline_audit_one "$entry"
    fi
  done
}

MERGED=()
CONFLICTS=()
COPIED=()
NEW_COLLISIONS=()
APPENDED=()
CROSSCHECK_WARNINGS=()
BASELINE_WARNINGS=()

# Payload files that are additive lists (gitignore-style): a brand-new
# payload path here gets its missing lines appended to the consumer's
# existing file instead of being flagged as a collision, so a genuine
# CTS-required line (e.g. the postgres-best-practices exclusion) still
# reaches the consumer without destroying project-local entries (penny's
# own /dist, /coverage, .nx/** ignores). Matched on basename, not full path.
APPEND_MERGE_PATHS=(.prettierignore)
is_append_merge_path() {
  local rel="$1" base="${1##*/}" p
  for p in "${APPEND_MERGE_PATHS[@]}"; do
    [ "$base" = "$p" ] && return 0
  done
  return 1
}

# True when rel is new to cts-payload.txt this run (no OLD_SHA baseline —
# is_locally_modified's git-cat-file-e check already returned false for the
# same reason, which is why this only runs after that block) but the
# consumer already has an unrelated local file at that path. Identical
# content is a no-op, not a collision.
is_new_payload_collision() {
  local rel="$1"
  [ "$CMD" = update ] || return 1
  [ -n "${OLD_SHA:-}" ] || return 1
  [ -e "./$rel" ] || return 1
  git -C "$SRC_DIR" cat-file -e "$OLD_SHA:$rel" 2>/dev/null && return 1
  cmp -s <(norm_file "$rel" "$SRC_DIR/$rel") <(norm_file "$rel" "./$rel") && return 1
  return 0
}

# Appends only source lines not already present locally, verbatim (including
# comments) — never reorders or deletes the consumer's own lines. Blank
# lines are never appended on their own so re-runs don't pile up trailing
# blanks; a source-side blank line separating sections is harmless to drop.
append_missing_lines() {
  local rel="$1" changed=0 line
  # `>>` is a raw byte append — if the consumer's file doesn't already end in
  # a newline, the first appended line would concatenate onto the file's
  # last existing line instead of starting its own (real-world .prettierignore
  # files commonly have no trailing newline). Force one before appending.
  # `tail -c 1` on a newline-terminated file yields a newline, which command
  # substitution strips to empty — non-empty here means the last byte was
  # something else, i.e. no trailing newline.
  if [ -s "./$rel" ] && [ -n "$(tail -c 1 "./$rel")" ]; then
    printf '\n' >> "./$rel"
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    grep -qxF -e "$line" "./$rel" 2>/dev/null && continue
    printf '%s\n' "$line" >> "./$rel"
    changed=1
  done < "$SRC_DIR/$rel"
  [ "$changed" = 1 ] && APPENDED+=("$rel")
}

# Three-way merge a payload file both the project and upstream CTS have
# changed since the last sync (base = OLD_SHA content). git merge-file does
# the line-level work: non-overlapping hunks combine silently, overlapping
# ones get standard conflict markers left in the file for the operator to
# resolve by hand — `-p` keeps it from touching "./$rel" until we've seen
# whether the merge was clean.
# Cleanup uses an EXIT trap, not `trap ... RETURN` — RETURN is a single
# global slot in bash, not scoped per call frame: unless the trap body
# disarms itself (as norm_file's now does with `trap - RETURN`), it stays
# armed after this function returns. It wouldn't misfire on an unrelated
# function's return (functions don't inherit a leftover RETURN trap without
# functrace), but it would re-arm on the next source-d script's return,
# crashing under `set -u` once its own locals are out of scope.
# This function's EXIT trap is always cleared with `trap - EXIT` before it
# returns normally; it only ever fires for real if `git show`/`cp` fail and
# `set -e` is unwinding the whole script anyway, which is exactly when the
# leaked temp files need to be caught.
# MERGE_BASE/MERGE_RESULT are deliberately globals, not `local` — when
# errexit unwinds out of this function to run the EXIT trap, bash has
# already torn down the function's local scope, so a trap referencing
# locals dies with "unbound variable" under `set -u` at the worst possible
# moment (mid-failure, right when cleanup is needed).
merge_one() {
  local rel="$1" clean=0 dest="./$1"
  is_self_script "$rel" && dest="$SCRIPTS_STAGE/$rel"
  MERGE_BASE=$(mktemp); MERGE_RESULT=$(mktemp)
  MERGE_BASE_RAW=$(mktemp); MERGE_LOCAL_NORM=$(mktemp); MERGE_UPSTREAM_NORM=$(mktemp)
  trap 'rm -f "$MERGE_BASE" "$MERGE_RESULT" "$MERGE_BASE_RAW" "$MERGE_LOCAL_NORM" "$MERGE_UPSTREAM_NORM"' EXIT
  git -C "$SRC_DIR" show "$OLD_SHA:$rel" > "$MERGE_BASE_RAW"
  norm_file "$rel" "$MERGE_BASE_RAW" > "$MERGE_BASE"
  norm_file "$rel" "./$rel" > "$MERGE_LOCAL_NORM"
  norm_file "$rel" "$SRC_DIR/$rel" > "$MERGE_UPSTREAM_NORM"
  git merge-file -p "$MERGE_LOCAL_NORM" "$MERGE_BASE" "$MERGE_UPSTREAM_NORM" > "$MERGE_RESULT" 2>/dev/null && clean=1
  # Cross-check: rerun the same 3-way merge on RAW blobs. Normalizing all
  # three inputs is usually benign (formatting-only drift stops producing
  # false conflicts), but when upstream's change to a region is itself
  # formatting-only, normalization makes base == upstream there and a local
  # deletion of that region silently wins instead of conflicting — exactly
  # how a consumer with a phantom baseline (stamped SHA ahead of actually
  # received content) loses whole features with no warning. The raw merge
  # over-reports (it also conflicts on pure formatting), so a raw count
  # exceeding the normalized count doesn't prove data loss — it proves the
  # normalized merge decided something silently, which the operator must see.
  local norm_conflicts raw_conflicts raw_result
  norm_conflicts=$(grep -c '^<<<<<<<' "$MERGE_RESULT" 2>/dev/null || true)
  raw_result=$(mktemp)
  git merge-file -p "./$rel" "$MERGE_BASE_RAW" "$SRC_DIR/$rel" > "$raw_result" 2>/dev/null || true
  raw_conflicts=$(grep -c '^<<<<<<<' "$raw_result" 2>/dev/null || true)
  rm -f "$raw_result"
  if [ "${raw_conflicts:-0}" -gt "${norm_conflicts:-0}" ]; then
    CROSSCHECK_WARNINGS+=("$rel|$norm_conflicts|$raw_conflicts")
  fi
  if [ "$DRY_RUN" = 1 ]; then
    if [ "$clean" = 1 ]; then echo "merge (dry-run): $rel"; else echo "conflict (dry-run): $rel"; fi
  else
    mkdir -p "$(dirname "$dest")"
    cp "$MERGE_RESULT" "$dest"
    if [ "$clean" = 1 ]; then
      MERGED+=("$rel")
      echo "merged: $rel"
    else
      CONFLICTS+=("$rel")
      echo "CONFLICT: $rel"
    fi
  fi
  rm -f "$MERGE_BASE" "$MERGE_RESULT" "$MERGE_BASE_RAW" "$MERGE_LOCAL_NORM" "$MERGE_UPSTREAM_NORM"
  trap - EXIT
}

copy_one() {
  local rel="$1"
  if ! is_safe_rel "$rel"; then
    echo "refusing unsafe path from source: $rel" >&2
    return
  fi
  if is_owner_only_skill "$rel"; then
    if [ "$DRY_RUN" = 1 ]; then echo "skip (owner-only skill): $rel"; fi
    return
  fi
  if [ "$CMD" = update ] && is_ignored "$rel"; then
    if [ "$DRY_RUN" = 1 ]; then echo "skip (ignored): $rel"; fi
    return
  fi
  if is_locally_modified "$rel"; then
    if [ "$NO_MERGE" != 1 ] && upstream_changed "$rel"; then
      merge_one "$rel"
      return
    fi
    LOCALLY_MODIFIED+=("$rel")
    if [ "$DRY_RUN" = 1 ]; then echo "skip (locally modified): $rel"; fi
    return
  fi
  # Bug A guard: a path newly added to cts-payload.txt (no OLD_SHA baseline,
  # so is_locally_modified above returned 1) can still collide with a local
  # file the consumer already has for unrelated reasons — e.g. penny's own
  # build-output .prettierignore entries when .prettierignore first became
  # payload. init is intentionally out of scope: its greenfield guard already
  # bails on a pre-existing .claude/CLAUDE.md/AGENTS.md and points existing
  # projects at cts-setup, so this path never has to run there.
  if is_new_payload_collision "$rel"; then
    if is_append_merge_path "$rel"; then
      if [ "$DRY_RUN" = 1 ]; then
        echo "append (dry-run, new payload path already exists locally): $rel"
        return
      fi
      append_missing_lines "$rel"
      return
    fi
    NEW_COLLISIONS+=("$rel")
    if [ "$DRY_RUN" = 1 ]; then echo "skip (new-file collision): $rel"; fi
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then
    echo "copy: $rel"
    return
  fi
  local dest="./$rel"
  is_self_script "$rel" && dest="$SCRIPTS_STAGE/$rel"
  mkdir -p "$(dirname "$dest")"
  if [ -n "$PRETTIER_BIN" ] && is_prettier_ext "$rel"; then
    norm_file "$rel" "$SRC_DIR/$rel" > "$dest"
  else
    cp -p "$SRC_DIR/$rel" "$dest"
  fi
  COPIED+=("$rel")
}

# Walk a payload entry (file or directory) and copy every file under it.
# .claude/scripts/ is last in the payload; its writes land in SCRIPTS_STAGE
# (see is_self_script/flush_self_scripts above) rather than the real path, so
# the running script's own on-disk bytes never change mid-execution.
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
    write_source_file "${#COPIED[@]}" 0 0 0
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
  NEEDS_ATTENTION=0
  baseline_audit
  for entry in "${PAYLOAD[@]}"; do sync_path "$entry"; done
  for rel in "${LOCALLY_MODIFIED[@]}"; do
    echo "locally modified, not overwritten — diff manually: $rel"
    echo "  git -C $SRC_DIR diff $OLD_SHA..$NEW_SHA -- $rel"
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for rel in "${CONFLICTS[@]}"; do
    echo "unresolved conflict markers left in: $rel — resolve by hand, then stage it"
  done
  for w in "${CROSSCHECK_WARNINGS[@]}"; do
    IFS='|' read -r rel nc rc <<< "$w"
    echo "MERGE CROSS-CHECK: $rel — raw 3-way merge finds $rc conflict region(s) but the normalized merge surfaced only $nc; the difference was auto-resolved silently (usually toward your local side). Verify before trusting the merged file:"
    echo "  git -C $SRC_DIR show $OLD_SHA:$rel > /tmp/cts-base && git merge-file -p ./$rel /tmp/cts-base $SRC_DIR/$rel | grep -n '^<<<<<<<'"
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for w in "${BASELINE_WARNINGS[@]}"; do
    IFS='|' read -r rel n <<< "$w"
    echo "BASELINE INTEGRITY: $rel — $n line(s) recorded at your baseline and still shipped upstream are missing locally. If this is not a deliberate customization, your .cts-version is ahead of the content you actually received (phantom baseline) — restore the missing content from upstream, or add the file to .ctsignore if the divergence is intentional. Review:"
    echo "  git -C $SRC_DIR show $OLD_SHA:$rel | diff - ./$rel"
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for rel in "${APPENDED[@]}"; do
    echo "appended CTS-required lines (kept your own): $rel"
  done
  # Not a LOCALLY_MODIFIED reuse: that bucket's diff-$OLD_SHA..$NEW_SHA hint
  # is empty for a path absent at $OLD_SHA, which is always true here.
  for rel in "${NEW_COLLISIONS[@]}"; do
    echo "new payload file already exists locally, not overwritten — reconcile manually: $rel"
    echo "  diff <(git -C $SRC_DIR show $NEW_SHA:$rel) ./$rel"
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for entry in "${PAYLOAD[@]}"; do
    entry="${entry%/}"
    [ -d "$SRC_DIR/$entry" ] && [ -d "./$entry" ] || continue
    while IFS= read -r -d '' f; do
      rel="${f#./}"
      if [ -e "$SRC_DIR/$rel" ] || is_ignored "$rel"; then continue; fi
      echo "removed upstream — delete manually if unwanted: $rel"
      NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
    done < <(find "./$entry" -type f -print0)
  done
  # Ignored files are never touched, but silence must not hide upstream drift:
  # report any .ctsignore'd payload file that changed in CTS since the last sync.
  if [ -n "$OLD_SHA" ] && [ "$OLD_SHA" != "$NEW_SHA" ] && git -C "$SRC_DIR" cat-file -e "$OLD_SHA" 2>/dev/null; then
    while IFS= read -r f; do
      if is_ignored "$f"; then
        echo "ignored, but changed upstream — review manually: $f"
        echo "  git -C $SRC_DIR diff $OLD_SHA..$NEW_SHA -- $f"
        NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
      fi
    done < <(git -C "$SRC_DIR" diff --name-only "$OLD_SHA" "$NEW_SHA")
    if [ "$DRY_RUN" != 1 ]; then
      echo "Changes:"
      git -C "$SRC_DIR" log --oneline "$OLD_SHA..$NEW_SHA"
    fi
  fi
  if [ "$DRY_RUN" != 1 ]; then
    echo "$NEW_SHA" > "$VERSION_FILE"
    write_source_file "${#COPIED[@]}" "${#MERGED[@]}" "${#CONFLICTS[@]}" "$NEEDS_ATTENTION"
  fi
  echo "Done. Review with: git diff"
fi

# Must be the literal last statement — see the comment on SCRIPTS_STAGE above.
# Everything above this line has already executed and produced its output;
# nothing reads further into this script's own source after this call.
flush_self_scripts
