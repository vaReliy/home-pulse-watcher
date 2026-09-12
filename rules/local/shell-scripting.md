## Extends rules/cts/shell-scripting.md — new section: .env Loading & Variable Persistence

The pattern `export $(grep -v '^#' .env | xargs)` word-splits the entire file and mangles multi-line values like JSON with embedded `\n` and spaces. Results in `not a valid identifier` errors when shell tries to export fragments like `"type":"service_account"` as variable names.

**Safe alternative**: `set -a && source .env && set +a` (bash parses the file as real shell syntax, correctly handling quotes and newlines).

**Write-side gotcha**: `echo "$VAR"` can corrupt multi-line values on the way back out to a file — literal `\n` escapes inside fields (e.g., the `private_key` field in a GCP service account JSON) don't round-trip faithfully. Use `printf '%s' "$VAR" > file` instead, and verify with `jq . file` before handing the output to consumers (e.g., `gcloud auth activate-service-account --key-file=file`).

## Extends rules/cts/shell-scripting.md — new section: `if [ $? -ne 0 ]` Is Dead Code Under `set -e`

`if [ $? -ne 0 ]` checked immediately after a command, in a script running with `set -e`, can never execute — `set -e` aborts the script the moment the command fails, so the intended friendly-error messages had never once been printed. `firmware-docker-build.sh` had this pattern after both `docker build` and `docker run`. Use `if ! cmd; then …; fi` instead, which is exempt from `set -e` because the command runs in a condition context. Worth grepping for elsewhere: the pattern looks like careful error handling and reads as correct in review.
