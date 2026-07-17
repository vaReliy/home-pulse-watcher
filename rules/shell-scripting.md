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
