#!/usr/bin/env bash
# CTS sync engine — installs/updates the claude-ts (CTS) payload in a project.
# Normally invoked by the /cts-setup and /cts-update skills, not run directly.
#
# Two-layer distribution model: every payload path is CTS-owned and is
# plain-overwritten on sync (rsync semantics) — there is no 3-way merge, no
# baseline reconciliation, and .cts-version is purely an informational
# engine/release marker, never a merge base. Consumer customizations live in
# a SEPARATE path that is never listed in cts-payload.txt and therefore never
# touched by this script: rules/local/**, .claude/agents-local/*.md,
# AGENTS.local.md, CLAUDE.local.md. .claude/settings.json is consumer-owned;
# .cts/settings.cts.json is the CTS-owned fragment deep-merged into it.
#
# In place of merging, the engine runs two detectors:
#   - ownership violation: a CTS-owned file whose on-disk content no longer
#     matches the hash recorded for it at the last sync — i.e. it was edited
#     outside an override file. Reported loudly; the file is overwritten
#     anyway (updates never skip wholesale).
#   - override rot: an override file (rules/local/**, .claude/agents-local/*)
#     that cites a CTS file/section via a "## Overrides <path>" line, where
#     the cited path changed content in this sync run.
set -euo pipefail

ORIG_ARGS=("$@")

DEFAULT_SOURCE="https://github.com/vaReliy/claude-ts.git"
DEFAULT_BRANCH="main"
CACHE_DIR="$HOME/.cache/claude-ts"
PAYLOAD_FILE="cts-payload.txt"
VERSION_FILE=".cts-version"
SOURCE_FILE=".cts-source"
IGNORE_FILE=".ctsignore"
MANIFEST_FILE=".cts/manifest.json"
SELF_REL=".claude/scripts/cts-sync.sh"

usage() {
  cat <<'EOF'
Usage: cts-sync.sh <init|update> [--source <path-or-url>] [--branch <name>] [--dry-run] [--force]

  init    Install the CTS payload into the current project (must be a git repo)
  update  Re-sync the CTS payload, skipping paths listed in .ctsignore.
          Every non-ignored payload file is overwritten with upstream's
          content — there is no merge. Locally edited CTS-owned files are
          still overwritten, but flagged loudly first.

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
EXPLICIT_SOURCE=0; EXPLICIT_BRANCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; EXPLICIT_SOURCE=1; shift 2 ;;
    --branch) BRANCH="$2"; EXPLICIT_BRANCH=1; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done
case "$CMD" in init|update) ;; *) usage; exit 1 ;; esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || { echo "Error: current directory is not a git repository." >&2; exit 1; }

command -v jq >/dev/null 2>&1 \
  || { echo "Error: jq is required by cts-sync.sh (settings deep-merge, manifest bookkeeping). Install jq and retry." >&2; exit 1; }

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
# Record what was actually used, and warn (don't block) when an implicit
# (no flags passed) run's resolution disagrees with the last one.
CURRENT_SOURCE_DESC="$SOURCE $BRANCH"
if [ -f "$SOURCE_FILE" ] && [ "$EXPLICIT_SOURCE" != 1 ] && [ "$EXPLICIT_BRANCH" != 1 ]; then
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

write_source_file() {
  local copied="$1" ownership_warnings="$2" rot_warnings="$3"
  {
    echo "source: $SOURCE"
    echo "branch: $BRANCH"
    echo "synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "outcome: $copied files synced, $ownership_warnings ownership warning(s), $rot_warnings override-rot warning(s)"
  } > "$SOURCE_FILE"
}

mapfile -t PAYLOAD < <(grep -vE '^[[:space:]]*(#|$)' "$SRC_DIR/$PAYLOAD_FILE")

# Defense-in-depth: some files are project-local and must never be shipped to
# consumers. That's currently enforced only by never listing it as a payload
# entry; this guard turns a future careless edit (e.g. listing "docs/" as a
# whole directory instead of individual files) into a loud failure instead of
# a silent leak.
NEVER_PAYLOAD=(docs/KNOWLEDGE_INBOX.md .cts/manifest.json)
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

# Owner-only skills: live in this repo's .claude/skills/ (a payload entry as
# a whole directory), but must never reach a consumer's tree.
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
# anywhere in the tree; a leading "/" anchors it to the project root only.
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
# reaches a write sink.
is_safe_rel() {
  case "$1" in
    /*|*/../*|../*|*/..) return 1 ;;
    ..) return 1 ;;
  esac
  return 0
}

# Writes to SELF_REL (this running script) atomically: write into a sibling
# temp file, then `mv` it over the real path. `mv`/rename doesn't invalidate
# an already-open file descriptor — the currently-executing bash process
# keeps reading the OLD inode's bytes to completion via its own open fd, so
# there is no mid-read corruption hazard, unlike overwriting the file's
# content in place. Every other payload path just gets a plain `cp -p`.
write_dest() {
  local dest="$1" src="$2"
  mkdir -p "$(dirname "$dest")"
  if [ "$dest" = "./$SELF_REL" ]; then
    local tmp="$dest.new.$$"
    cp -p "$src" "$tmp"
    mv "$tmp" "$dest"
  else
    cp -p "$src" "$dest"
  fi
}

# .cts/manifest.json: path -> sha256 of the content as last synced. This is
# NOT a merge baseline — it is never diffed hunk-by-hunk or used to decide
# what to write. It exists solely so the ownership-violation detector can
# tell "consumer edited this CTS-owned file since we last wrote it" from
# "upstream simply changed it," and so the override-rot detector can tell
# which CTS files actually changed content this run. Loaded before the
# self-update-first block below so the self-script can participate in the
# same ownership-violation detection every other CTS-owned file gets,
# instead of being a silent exception to it.
OLD_MANIFEST="{}"
[ -f "$MANIFEST_FILE" ] && OLD_MANIFEST=$(cat "$MANIFEST_FILE")
manifest_old_hash() {
  jq -r --arg p "$1" '.[$p] // empty' <<< "$OLD_MANIFEST"
}
declare -A MANIFEST_NEW
sha_of() { sha256sum "$1" | awk '{print $1}'; }

OWNERSHIP_WARNINGS=()
NEW_COLLISIONS=()
COPIED=()
CHANGED_PATHS=()
IGNORED_CHANGED_UPSTREAM=()

# Self-update-first (init AND update): if the source's copy of this very
# engine script differs from the one running, replace it and re-exec
# immediately — before touching anything else — so the rest of this run (and
# every run after it) executes the current engine, not a stale one. No
# self-update paradox: overwrite semantics make this trivial, unlike the old
# 3-way-merge engine which needed a staging trick to avoid corrupting its own
# mid-read.
#
# Covers init too (not just update): a consumer on the pre-two-layer engine
# who already has .claude/scripts/cts-sync.sh on disk and follows the
# "existing project" cts-setup path runs `init --force` directly — never
# `update` — so gating this on CMD=update left that path running `init
# --force` under the stale merge-based engine. Guarding on "does a local
# self-script already exist" instead of on CMD covers both entry points; a
# brand-new project has no local self-script yet (cts-setup curls one fresh
# immediately before calling init, so it already matches upstream and this
# block is a no-op).
#
# The self-script gets the same ownership-violation detection as every other
# CTS-owned payload file (copy_one() skips it — see the `[ "$rel" = "$SELF_REL"
# ] && return` guard below — precisely so this block can own that check
# instead, since the self-update has to run before the manifest-driven
# payload loop even starts): if the local copy differs from the last hash
# THIS SCRIPT recorded for itself, that's a hand-edit, not just staleness
# from a normal upstream release — warn loudly, exactly like OWNERSHIP
# WARNING elsewhere, before overwriting anyway (updates never skip wholesale
# applies here too).
if [ -z "${CTS_SYNC_REEXEC:-}" ] && [ -f "$SRC_DIR/$SELF_REL" ] && [ -f "./$SELF_REL" ]; then
  if ! cmp -s "$SRC_DIR/$SELF_REL" "./$SELF_REL"; then
    self_old_hash=$(manifest_old_hash "$SELF_REL")
    if [ -n "$self_old_hash" ]; then
      self_cur_hash=$(sha_of "./$SELF_REL")
      if [ "$self_cur_hash" != "$self_old_hash" ]; then
        echo "OWNERSHIP WARNING: $SELF_REL was edited locally but is CTS-owned — overwritten with upstream's content. cts-sync.sh itself is not customizable via override files; contribute the change upstream instead via /cts-contribute."
      fi
    fi
    if [ "$DRY_RUN" = 1 ]; then
      echo "engine update available (dry-run, not applied): $SELF_REL"
    else
      write_dest "./$SELF_REL" "$SRC_DIR/$SELF_REL"
      chmod +x "./$SELF_REL"
      echo "cts-sync engine updated; re-running with the new version..."
      CTS_SYNC_REEXEC=1 exec bash "./$SELF_REL" "${ORIG_ARGS[@]}"
    fi
  fi
fi
# Record the self-script's current hash for next run's comparison above.
# Only reached when this pass did NOT re-exec (init, --dry-run, or the file
# already matched upstream) — a successful non-dry-run update always exits
# via `exec` inside the block above, so this line runs in the process that
# lands here with a self-script already at (or confirmed to already be at)
# the current content, never mid-update.
[ -f "./$SELF_REL" ] && MANIFEST_NEW["$SELF_REL"]=$(sha_of "./$SELF_REL")

copy_one() {
  local rel="$1"
  is_safe_rel "$rel" || { echo "refusing unsafe path from source: $rel" >&2; return; }
  # Bare `cond && action` (no if/fi) is only safe when it can never be the
  # terminal statement of a function called as a bare (unguarded) statement:
  # if cond is false, the whole list's exit status is 1, and — unlike a
  # standalone `&&` list at top level, which bash exempts from `set -e` —
  # that 1 becomes this function's own return status when nothing runs
  # after it, which then DOES trip `set -e` at copy_one's own (bare) call
  # site in sync_path(). Explicit `if`/`return 0` avoids depending on which
  # branch happens to run last.
  if is_owner_only_skill "$rel"; then
    [ "$DRY_RUN" = 1 ] && echo "skip (owner-only skill): $rel"
    return 0
  fi
  [ "$rel" = "$SELF_REL" ] && return # handled by the self-update-first step above

  if [ "$CMD" = update ] && is_ignored "$rel"; then
    if [ "$DRY_RUN" = 1 ]; then echo "skip (ignored): $rel"; fi
    return
  fi

  local old_hash new_hash
  old_hash=$(manifest_old_hash "$rel")

  # Ownership-violation detection: the file existed under CTS ownership
  # before (a hash was recorded for it) and its on-disk content no longer
  # matches that hash — i.e. it was edited outside an override file.
  # Reported loudly; the overwrite below still happens (updates never skip
  # wholesale — an override file is the supported way to customize behavior
  # without losing upstream updates).
  if [ "$CMD" = update ] && [ -n "$old_hash" ] && [ -e "./$rel" ]; then
    local cur_hash; cur_hash=$(sha_of "./$rel")
    if [ "$cur_hash" != "$old_hash" ]; then
      OWNERSHIP_WARNINGS+=("$rel")
    fi
  fi

  # A brand-new payload path (no recorded hash yet) can still collide with a
  # local file the consumer already has for unrelated reasons. Under single
  # ownership CTS now owns this path, so it is still overwritten — but this
  # is flagged loudly since it's likely not a coincidence.
  if [ -z "$old_hash" ] && [ -e "./$rel" ] && ! cmp -s "$SRC_DIR/$rel" "./$rel"; then
    NEW_COLLISIONS+=("$rel")
  fi

  if [ "$DRY_RUN" = 1 ]; then
    echo "sync: $rel"
    return
  fi

  write_dest "./$rel" "$SRC_DIR/$rel"
  new_hash=$(sha_of "./$rel")
  MANIFEST_NEW["$rel"]="$new_hash"
  COPIED+=("$rel")
  if [ -n "$old_hash" ] && [ "$old_hash" != "$new_hash" ]; then
    CHANGED_PATHS+=("$rel")
  fi
}

write_manifest() {
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  # `${#MANIFEST_NEW[@]}` on a never-populated associative array throws
  # "unbound variable" under `set -u` on some bash versions (a known bash
  # nounset quirk specific to empty associative arrays) — copying the keys
  # into a plain indexed array first sidesteps it; indexed arrays don't hit
  # the same bug.
  local manifest_keys=("${!MANIFEST_NEW[@]}")
  if [ "${#manifest_keys[@]}" -eq 0 ]; then
    echo '{}' > "$MANIFEST_FILE"
    return
  fi
  {
    for rel in "${manifest_keys[@]}"; do
      printf '%s\t%s\n' "$rel" "${MANIFEST_NEW[$rel]}"
    done
  } | jq -R -n 'reduce inputs as $line ({}; . + {($line | split("\t")[0]): ($line | split("\t")[1])})' > "$MANIFEST_FILE"
}

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

# Deep-merges CTS's settings fragment into the consumer's own
# .claude/settings.json. This is the one deliberate exception to plain
# overwrite: settings.json is consumer-owned, but CTS still needs to push
# new defaults (hooks, deny rules) into it over time. Consumer values win on
# scalar conflicts ("local wins on conflict"); arrays (e.g.
# permissions.deny/allow) are unioned so CTS-required entries (the
# rules/cts/**, .cts/** ownership deny rules) are always present even if the
# consumer's own array already exists.
merge_settings() {
  local fragment="./.cts/settings.cts.json" dest="./.claude/settings.json"
  [ -f "$fragment" ] || return 0
  if [ "$DRY_RUN" = 1 ]; then
    echo "merge (dry-run): $dest <- $fragment"
    return
  fi
  mkdir -p ./.claude
  [ -f "$dest" ] || echo '{}' > "$dest"
  local merged; merged=$(mktemp)
  jq -s '
    def deepmerge($a; $b):
      if ($a|type) == "object" and ($b|type) == "object" then
        reduce ((($a|keys_unsorted) + ($b|keys_unsorted)) | unique[]) as $k
          ({}; .[$k] = (if ($a[$k] == null) then $b[$k]
                        elif ($b[$k] == null) then $a[$k]
                        else deepmerge($a[$k]; $b[$k]) end))
      elif ($a|type) == "array" and ($b|type) == "array" then
        ($a + $b) | unique
      else
        $b
      end;
    deepmerge(.[0]; .[1])
  ' "$fragment" "$dest" > "$merged"
  # Guard against a silent security-boundary bypass: `deepmerge`'s
  # type-mismatch branch falls to "consumer value wins" for ANY shape
  # conflict, not just genuine scalar overrides. If the consumer's existing
  # settings.json has `permissions` as a non-object (e.g. malformed prior
  # state), or `permissions.deny` as a non-array, the merge silently drops
  # the entire CTS `permissions` subtree — including the ownership-enforcement
  # deny entries — while this function still reports success. Verify the
  # merged result actually contains every entry the fragment requires before
  # writing it; hard-fail loudly rather than ship a config that looks merged
  # but silently lost its deny rules.
  local required_deny; required_deny=$(jq -c '.permissions.deny // []' "$fragment")
  if ! jq -e --argjson req "$required_deny" \
    '(.permissions.deny? // []) as $got | ($got | type) == "array" and (($req - $got) | length) == 0' \
    "$merged" > /dev/null; then
    echo "Error: settings merge would drop required CTS permissions.deny entries — refusing to write $dest." >&2
    echo "       This usually means an existing 'permissions' or 'permissions.deny' key in $dest has an unexpected shape (not an object / not an array)." >&2
    echo "       Fix that key's shape by hand, then re-run." >&2
    rm -f "$merged"
    exit 1
  fi
  mv "$merged" "$dest"
  echo "merged CTS defaults into: $dest"
}

# Override-rot detector: an override file cites the CTS file/section it
# displaces via a "## Overrides <path> ..." line (lex specialis — the
# override is a narrow, cited replacement, not a whole-file fork). If the
# cited path changed content this run (CHANGED_PATHS), the override may now
# be stale — flag it for review. Grep-level, not merging: the override file
# itself is never touched.
OVERRIDE_DIRS=(rules/local .claude/agents-local)
OVERRIDE_EXTRA_FILES=(AGENTS.local.md CLAUDE.local.md)
ROT_WARNINGS=()
detect_override_rot() {
  [ "$CMD" = update ] || return 0
  [ "${#CHANGED_PATHS[@]}" -gt 0 ] || return 0
  local files=() f d cite target changed
  for d in "${OVERRIDE_DIRS[@]}"; do
    [ -d "./$d" ] || continue
    while IFS= read -r -d '' f; do files+=("$f"); done < <(find "./$d" -type f -name '*.md' -print0)
  done
  for f in "${OVERRIDE_EXTRA_FILES[@]}"; do
    if [ -f "./$f" ]; then
      files+=("./$f")
    fi
  done
  for f in "${files[@]}"; do
    while IFS= read -r cite; do
      target=$(printf '%s' "$cite" | sed -n 's/^## Overrides[[:space:]]\+\([^[:space:]]*\).*/\1/p')
      [ -n "$target" ] || continue
      for changed in "${CHANGED_PATHS[@]}"; do
        if [ "$target" = "$changed" ]; then
          ROT_WARNINGS+=("${f#./}|$target")
        fi
      done
    done < <(grep '^## Overrides ' "$f" 2>/dev/null || true)
  done
  return 0
}

if [ "$CMD" = init ]; then
  if [ "$FORCE" != 1 ]; then
    for p in CLAUDE.md AGENTS.md .claude; do
      [ -e "$p" ] && { echo "Error: $p already exists. Use --force, or run /cts-setup for existing projects." >&2; exit 1; }
    done
  fi
  for entry in "${PAYLOAD[@]}"; do sync_path "$entry"; done
  if [ "$DRY_RUN" != 1 ]; then
    merge_settings
    echo "$NEW_SHA" > "$VERSION_FILE"
    write_source_file "${#COPIED[@]}" 0 0
    write_manifest
    [ -f "$IGNORE_FILE" ] || cat > "$IGNORE_FILE" <<'EOF'
# .ctsignore — gitignore-syntax paths that `cts-sync.sh update` will never touch.
# Use for: pruned CTS files (prevents re-adding them) and project-only
# additions placed under payload directories. Customizing a CTS-owned file
# should almost always go through an override file instead (rules/local/**,
# .claude/agents-local/<name>.md, AGENTS.local.md, CLAUDE.local.md) — those
# are never synced by construction and don't need a .ctsignore entry.
# A leading "/" anchors to the project root: "/AGENTS.md" protects only the
# root file; a bare "AGENTS.md" would also match nested files with that name.
EOF
  fi
  echo "Done. CTS payload installed at $NEW_SHA."
else
  NEEDS_ATTENTION=0
  OLD_SHA=$(cat "$VERSION_FILE" 2>/dev/null || echo "")
  for entry in "${PAYLOAD[@]}"; do sync_path "$entry"; done
  detect_override_rot

  # Loud warning if this is the first sync (no manifest baseline yet): every payload
  # path is flagged as a fresh collision below, and that list MUST be manually
  # diffed against pre-refactor upstream before trusting it — any consumer
  # customizations that were never .ctsignore'd under the old 3-way-merge model
  # (which didn't require an ignore entry) will be silently overwritten otherwise.
  if [ -z "$(cat "$MANIFEST_FILE" 2>/dev/null || echo "")" ] || [ "$(cat "$MANIFEST_FILE" 2>/dev/null)" = "{}" ]; then
    echo "WARNING: No manifest baseline found — this appears to be the first sync under the new engine. Every payload path below is being treated as a fresh collision. If this consumer has pre-refactor customizations that were never .ctsignore'd (the old model didn't require it), diff each collision against the resolved pre-refactor upstream commit before trusting this list, or those customizations will be silently overwritten."
  fi

  for rel in "${OWNERSHIP_WARNINGS[@]}"; do
    echo "OWNERSHIP WARNING: $rel was edited locally but is CTS-owned — overwritten with upstream's content. Move your changes into an override file (rules/local/**, .claude/agents-local/<name>.md, AGENTS.local.md, CLAUDE.local.md) or run /cts-contribute to send them upstream."
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for rel in "${NEW_COLLISIONS[@]}"; do
    echo "NEW PAYLOAD PATH COLLISION: $rel — CTS now owns this path; a pre-existing local file there was overwritten. If this content should stay yours, add the path to .ctsignore; if it should be upstream, run /cts-contribute."
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done
  for w in "${ROT_WARNINGS[@]}"; do
    IFS='|' read -r ov_file target <<< "$w"
    echo "OVERRIDE ROT: $ov_file cites \"$target\", which changed content in this sync — review whether the override still applies."
    NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
  done

  # Payload files/dirs that upstream removed entirely, still present locally.
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

  # Ignored files are never touched, but silence must not hide upstream drift.
  if [ -n "$OLD_SHA" ] && [ "$OLD_SHA" != "$NEW_SHA" ] && git -C "$SRC_DIR" cat-file -e "$OLD_SHA" 2>/dev/null; then
    while IFS= read -r f; do
      if is_ignored "$f"; then
        echo "ignored, but changed upstream — review manually: $f"
        echo "  git -C \"$SRC_DIR\" diff $OLD_SHA..$NEW_SHA -- \"$f\""
        IGNORED_CHANGED_UPSTREAM+=("$f")
        NEEDS_ATTENTION=$((NEEDS_ATTENTION + 1))
      fi
    done < <(git -C "$SRC_DIR" diff --name-only "$OLD_SHA" "$NEW_SHA")
    if [ "$DRY_RUN" != 1 ]; then
      echo "Changes:"
      git -C "$SRC_DIR" log --oneline "$OLD_SHA..$NEW_SHA"
    fi
  fi

  if [ "$DRY_RUN" != 1 ]; then
    merge_settings
    echo "$NEW_SHA" > "$VERSION_FILE"
    write_source_file "${#COPIED[@]}" "${#OWNERSHIP_WARNINGS[@]}" "${#ROT_WARNINGS[@]}"
    write_manifest
  fi
  echo "Done. Review with: git diff"
fi
