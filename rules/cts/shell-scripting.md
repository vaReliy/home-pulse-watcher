# Shell Scripting Rules

## EXIT Trap with Local Variables and `set -u`

Under `set -u` (nounset), if a function defines local variables and sets an EXIT trap that references those locals, the trap will fail during function unwinding. When the function exits (especially on `set -e` errexit), bash tears down the function's local scope _before_ the trap runs, causing the trap's variable references to be unbound.

**Solution**: Declare trap variables at function scope, not as locals. Alternatively, use explicit cleanup and reset the trap before function return:

```bash
trap 'rm -f "$var1" "$var2"' EXIT
# ... function body ...
rm -f "$var1" "$var2"  # explicit cleanup
trap - EXIT            # reset the trap before return
```

See `merge_one()` in `.claude/scripts/cts-sync.sh` for a working example.

## RETURN Trap Is a Global Slot, Not Call-Frame-Scoped

A function cannot safely arm `trap CMD RETURN` for its own cleanup and leave it armed — bash's `RETURN` trap is a single global slot, not scoped to the function call. If a helper function sets one and doesn't clear it, the trap persists in that global slot after the function returns. Without `set -o functrace` (`set -T`)/`extdebug`, a leftover `RETURN` trap does _not_ fire on other functions' returns — functions don't inherit it. It re-arms only for the return of a `source`/`.`-ed script (or, once functrace is enabled anywhere in the process, on every function return) — at which point it misfires with `set -u` unbound-variable errors once the original locals are gone. Disarming on exit is still the only way to make this unconditionally safe regardless of how the script evolves. This also means a `RETURN` trap cannot be layered inside a caller that already owns the `EXIT` trap slot (see previous section) without care: setting an `EXIT` trap in an inner function called from one that already owns its own `EXIT` trap will clobber the caller's cleanup.

**Solution**: have the trap body disarm itself as its last action: `trap 'rm -f "$out"; trap - RETURN' RETURN`. This fires exactly once per call (locals are still in scope when it fires) and never survives past that return, so it's safe to use even when an outer caller (e.g. a 3-way merge helper) holds its own `EXIT` trap across multiple calls into the inner function.

See `norm_file()` in `.claude/scripts/cts-sync.sh` for a working example.

## Prettier CLI Binary Resolution

When symlinking prettier into a fixture or temporary directory for testing, symlinking only `node_modules/.bin/prettier` is insufficient. Prettier's CLI bin shim resolves its module via realpath of the **invoked binary location**, not the symlink path. This causes MODULE_NOT_FOUND for the prettier module itself.

**Solution**: Symlink the entire `node_modules` directory, not just the `.bin/prettier` executable.

## Prettier 3.5+ Object Wrap Default

Prettier 3.5 introduced a new `objectWrap` option, defaulting to `preserve` (there was no prior `always` default — object-wrap behavior was previously implicit, not configurable). In test fixtures that compare normalized content before/after formatting, object-wrap style will not converge to a common form under the `preserve` default. Tests relying on JSON or object-literal normalization must account for this.

**Solution**: Use a formatting axis that prettier _will_ unconditionally normalize (e.g., indent width changes), not object-wrap style. Alternatively, explicitly pin `objectWrap: always` in the prettier config used by tests.

## `while IFS= read -r` Silently Drops Final Line Without Newline

When reading a file line-by-line with `while IFS= read -r var; do ... done < file`, if the file has no trailing newline, the last line is silently skipped. This is because `read` returns non-zero when encountering EOF on an unterminated line, causing the loop condition to fail before the body runs.

**Solution**: Use the `|| [ -n "$var" ]` guard: `while IFS= read -r var || [ -n "$var" ]; do`. This ensures the loop body executes for the final line even when `read` returns non-zero. Apply this pattern to all read-loops over consumer-editable files (e.g., `.ctsignore`-style files). See `.claude/scripts/cts-sync.sh` (`append_missing_lines()` and `is_ignored()`) for working examples.

## Lazy `mktemp` for Artifacts That Must Outlive the Script

A temp file/dir that's created for a human to consume *after* the script exits (e.g. a path printed in a "run this to verify" hint) must not be `mktemp`'d unconditionally at scope entry — if a test asserts "no leaked temp files" over a pinned `TMPDIR` (checking that nothing survives a run with zero relevant events), an eagerly-created-but-empty temp dir looks identical to a real leak and trips the assertion on every run, even ones that never needed the artifact.

**Solution**: guard the `mktemp` call so it only fires on first actual use: `[ -n "$VAR" ] || VAR=$(mktemp -d)`. Do not `rm -rf` it in the script's own cleanup/trap — it's meant to survive process exit. See `CROSSCHECK_STASH_DIR` in `merge_one()` in `.claude/scripts/cts-sync.sh` for a working example (stashes a pre-merge file copy so a printed verification hint stays valid after the merge overwrites the working-tree file).

## Exit Status Promotion Hazard with Bare `cond && action` Under `set -e`

A bare `cond && action` statement (e.g., `[ "$x" = "$y" ] && do_thing`) is exempt from `set -e` when `cond` is false — bash's AND-OR-list special case prevents errexit from triggering. However, if this bare statement is the **terminal statement** (last-executed statement) along some code path inside a function, and that function is called as a bare/unguarded statement somewhere up the call chain, the exit status of the false `cond` (exit code 1) gets silently promoted to the function's own return status. The next time that function is called and its `cond` happens to be false, `set -e` kills the entire script with **zero error output**.

Real examples from `cts-sync.sh`:
- `[ "$target" = "$changed" ] && ROT_WARNINGS+=(...)` as the last statement in a loop inside a function.
- `is_owner_only_skill "$rel" && { ...; return; }` — same shape but called in production-critical code paths.

## Fixtures Simulating a Stale/Old-Model Engine Need a Real Baseline, Not Just an Old Script Binary

When a `tests/cts-sync.test.sh` case exists to prove behavior around an old-model (pre-refactor) `cts-sync.sh`, dropping the old script into the fixture directory is not sufficient by itself. The old engine's merge/conflict code paths (e.g. `is_locally_modified()`, `merge_one()` in the pre-two-layer 3-way-merge model) gate on `OLD_SHA`, sourced from `.cts-version`. A fixture with no pre-existing `.cts-version` never reaches those code paths at all — `update` silently degrades to a plain file copy regardless of which engine is on disk, and the test will pass identically whether or not the fix under test is even present.

**Solution**: any regression test for old-engine merge/conflict behavior must hand-seed `.cts-version` to a real ancestor commit SHA plus a payload file that has diverged locally from that ancestor (so a genuine 3-way conflict is possible), not just stage the old script and run `update`. Always pair such a fixture with a negative control — the same precondition, with the fix under test omitted — asserting the failure mode actually reproduces; only then does the positive assertion (fix applied → no conflict markers) prove anything. See `tests/cts-sync.test.sh` cases 17a (negative control, no preflight, asserts conflict markers DO appear) / 17b (preflight applied, asserts clean) for a working example.

**Solution**: Convert bare `cond && action` to explicit `if/then/fi`, and/or ensure functions end with an explicit `return 0` rather than relying on the last statement's exit status:

```bash
# Bad (hazardous if this is the terminal statement in a function):
is_valid "$x" && do_action

# Good (explicit if):
if is_valid "$x"; then
  do_action
fi
return 0
```

**Non-hazard cases** (do not over-apply): A bare `cond && action` that is NOT the function's terminal statement (more code follows) is safe regardless of nesting depth, since its exit status never gets promoted. Also, a `while read ... ; done < <(find ...)` loop over zero results is not a hazard — POSIX loop exit status is 0 when the body never executes.
