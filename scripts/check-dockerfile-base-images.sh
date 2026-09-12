#!/usr/bin/env bash
# Verifies every base image referenced by a FROM line in the repo's Dockerfiles
# actually exists in its registry. Catches pins like `google/cloud-sdk:445-slim`
# (real tag format is `445.0.0-slim`) before they land — cheap manifest lookups,
# no image pulls, no build. Run locally or from CI.
#
# Usage: scripts/check-dockerfile-base-images.sh [Dockerfile ...]
#        (defaults to every Dockerfile tracked in the repo)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ $# -gt 0 ]]; then
  dockerfiles=("$@")
else
  mapfile -t dockerfiles < <(git ls-files 'Dockerfile' '*/Dockerfile' '*.Dockerfile' 'Dockerfile.*')
fi

failures=0
checked=0
last_error=""

# Registry lookups are network calls; a single transient failure (rate limit,
# DNS blip) must not be reported as a missing tag.
readonly INSPECT_ATTEMPTS=3
readonly INSPECT_RETRY_DELAY_SECONDS=2

inspect_with_retry() {
  local image="$1" attempt
  for ((attempt = 1; attempt <= INSPECT_ATTEMPTS; attempt++)); do
    if last_error=$(docker manifest inspect "$image" 2>&1 >/dev/null); then
      return 0
    fi
    # "manifest unknown"/"not found" is a definitive answer — no point retrying.
    if grep -qiE 'manifest unknown|not found|no such manifest' <<<"$last_error"; then
      last_error="manifest not found (tag/name does not exist in registry)"
      return 1
    fi
    (( attempt < INSPECT_ATTEMPTS )) && sleep "$INSPECT_RETRY_DELAY_SECONDS"
  done
  last_error="registry lookup failed after ${INSPECT_ATTEMPTS} attempts: ${last_error}"
  return 1
}

for df in "${dockerfiles[@]}"; do
  # Stage aliases (`FROM x AS build`) can be referenced by later FROM lines; they
  # are not registry images and must be skipped.
  mapfile -t stage_names < <(grep -iE '^\s*FROM\s' "$df" | sed -nE 's/.*\s[Aa][Ss]\s+([A-Za-z0-9_.-]+)\s*$/\1/p')

  while IFS= read -r line; do
    # Drop `FROM`, any `--platform=...` flag, and a trailing `AS name`.
    image=$(printf '%s' "$line" \
      | sed -E 's/^\s*[Ff][Rr][Oo][Mm]\s+//; s/--[a-z]+=\S+\s+//g; s/\s+[Aa][Ss]\s+\S+\s*$//; s/\s+$//')

    [[ "$image" == "scratch" ]] && continue
    skip=0
    for s in "${stage_names[@]:-}"; do [[ "$image" == "$s" ]] && skip=1; done
    [[ $skip -eq 1 ]] && continue
    # Build-arg based FROMs can't be resolved statically.
    [[ "$image" == *'$'* ]] && { echo "SKIP  $df: $image (build-arg reference)"; continue; }

    checked=$((checked + 1))
    if inspect_with_retry "$image"; then
      echo "OK    $df: $image"
    else
      echo "FAIL  $df: $image — $last_error" >&2
      failures=$((failures + 1))
    fi
  done < <(grep -iE '^\s*FROM\s' "$df")
done

echo "Checked $checked base image(s) across ${#dockerfiles[@]} Dockerfile(s), $failures failure(s)."
[[ $failures -eq 0 ]]
