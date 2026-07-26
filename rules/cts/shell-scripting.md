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

A temp file/dir that's created for a human to consume _after_ the script exits (e.g. a path printed in a "run this to verify" hint) must not be `mktemp`'d unconditionally at scope entry — if a test asserts "no leaked temp files" over a pinned `TMPDIR` (checking that nothing survives a run with zero relevant events), an eagerly-created-but-empty temp dir looks identical to a real leak and trips the assertion on every run, even ones that never needed the artifact.

**Solution**: guard the `mktemp` call so it only fires on first actual use: `[ -n "$VAR" ] || VAR=$(mktemp -d)`. Do not `rm -rf` it in the script's own cleanup/trap — it's meant to survive process exit. See `CROSSCHECK_STASH_DIR` in `merge_one()` in `.claude/scripts/cts-sync.sh` for a working example (stashes a pre-merge file copy so a printed verification hint stays valid after the merge overwrites the working-tree file).

## Exit Status Promotion Hazard with Bare `cond && action` Under `set -e`

A bare `cond && action` statement (e.g., `[ "$x" = "$y" ] && do_thing`) is exempt from `set -e` when `cond` is false — bash's AND-OR-list special case prevents errexit from triggering. However, if this bare statement is the **terminal statement** (last-executed statement) along some code path inside a function, and that function is called as a bare/unguarded statement somewhere up the call chain, the exit status of the false `cond` (exit code 1) gets silently promoted to the function's own return status. The next time that function is called and its `cond` happens to be false, `set -e` kills the entire script with **zero error output**.

Real examples from `cts-sync.sh`:

- `[ "$target" = "$changed" ] && ROT_WARNINGS+=(...)` as the last statement in a loop inside a function.
- `is_owner_only_skill "$rel" && { ...; return; }` — same shape but called in production-critical code paths.

## Never Parse `ls` in a Script — the Interactive Shell May Have Aliased It

Agent `Bash` calls run through the user's shell, which is initialized from their profile. Many developers alias `ls` to a table-formatting lister (`eza`, `exa`, `lsd`) that prints a header row and permission/size/date columns. A loop like `ls rules/cts/ | while read f; do ... done` then iterates over column headers and metadata instead of filenames, and every downstream check silently tests garbage — the loop still "succeeds", so nothing looks wrong.

**Solution**: use `find` with an explicit format for any machine-consumed listing:

```bash
find rules/cts -name '*.md' -printf '%f\n' | sort
```

Same reasoning applies to `git status --porcelain`, whose stability is guaranteed only for the `--porcelain` form — and even there, paths containing spaces are quoted, so `awk '{print $NF}'` is not a safe path extractor. Use `-z` with NUL-delimited reads when paths may contain whitespace.

## Greedy `sed` Regex Silently Truncates Multi-Digit Numbers

GNU sed's leftmost-longest matching allows a leading `.*` to consume into a digit run, truncating the captured number. For example, `sed -E 's/.*([0-9]+) commands.*/\1/'` on the string "99 commands" matches the `.*` against "9", leaving only "9" to capture, yielding "9" instead of "99". This is especially hazardous in CI fixtures or test assertions where the error passes silently (the regex succeeds, the script continues) but the extracted value is wrong.

**Solution**: Use `grep -oE` with anchors or use non-greedy alternatives: `echo "99 commands" | grep -oE '[0-9]+ commands' | grep -oE '^[0-9]+'` extracts the full "99". When sed is unavoidable, anchor the leading match tightly to avoid consuming digits — e.g., `sed -E 's/.*(^|[^0-9])([0-9]+) commands.*/\2/'` (the `(^|[^0-9])` prefix ensures `.*` cannot consume digits). See `tests/payload-sanity.test.sh` (`check_counts()` function) for a working example using `grep -oE` anchors.

## An Unanchored `grep -L` Verification Gate Silently Passes on Prose Mentions

A coverage gate of the form `grep -L "Some Heading" <files>` ("list files missing this section") matches the phrase **anywhere** in the file, including inside prose, a code fence, or a documented example command. Any file that merely _talks about_ the heading is treated as having it, and drops out of the gate's output — a false negative that reads as a pass.

Hit for real: `grep -L "Local Override" .claude/skills/*/SKILL.md` was the stated gate for the skills-local rollout, but `cts-setup/SKILL.md` documents a verification command containing that exact string, so it never appeared in the missing list despite correctly having no such section. The gate could not distinguish "has the section" from "mentions the words".

**Solution**: anchor structural greps to the structure. `grep -L '^## Local Override'` matches only a real heading at line start. The same applies to `grep -l`, `grep -c`, and any test assertion checking for a section's presence — if you mean "has this heading", say `^##`, never the bare phrase.

## A `local` Statement Cannot Reference Its Own Earlier Names Under `set -u`

`local dir="$1" hook_path="${2:-$dir/default}"` fails with `dir: unbound variable`: bash evaluates the whole `local` statement's word list before the assignments become visible, so the second initializer's `$dir` is still unset. The failure is loud but easy to misread — it prints to stderr, and if the function's output is captured with `out=$(fn ...)` the caller just sees an empty string and every downstream `assert_not_contains` passes for the wrong reason.

**Solution**: split the declarations — one `local` per name whenever a later default refers to an earlier one.

## State Mutated Inside `$( )` Is Discarded — Never Derive Per-Call Uniqueness From a Counter

A helper called as `out=$(run_thing ...)` runs in a subshell, so `COUNTER=$((COUNTER + 1))` inside it never reaches the parent. Test harnesses that hand a script a "unique" id this way actually hand it the same id every time. That is silent when the script under test keys per-id state off it — e.g. `.claude/hooks/knowledge-capture-nudge.sh` writes one `$TMPDIR/cts-kc-nudge-<session>-<category>` marker per session and suppresses repeats — so every case after the first sees a suppressed no-op and passes vacuously.

**Solution**: generate the id inside the subshell from a self-contained source (`printf 's%s%s' "$$" "$RANDOM"`), and pair every "nudge X absent" assertion with a liveness partner asserting some other output is present. A negative assertion alone cannot distinguish "withheld" from "never ran".

## `git status --porcelain` Collapses Untracked Directories to a Single Entry

A brand-new untracked directory is reported as one record for the directory (`?? src/`), not one per file inside it. A test that creates `src/my file.ts` to prove spaced paths are extracted correctly therefore proves nothing — the extractor only ever sees `src/`, which any naive field-splitting version handles fine, so the negative control passes and the case is non-discriminating.

**Solution**: commit the file in the fixture baseline first and modify it in the case, so the status record carries the full path. Use `-u`/`--untracked-files=all` only if the untracked form is specifically what's under test.

## Changing the Sync Engine or the Payload List Means Running Both Test Suites

`tests/` holds two independent gates, and passing one says nothing about the other. `tests/cts-sync.test.sh` tests sync _behavior_; `tests/payload-sanity.test.sh` tests payload _content_ — it resolves every `cts-payload.txt` entry and greps for phrasings that assume the reader sits in the upstream CTS source checkout rather than in an installed project (see that test's own phrase list). Any edit to `.claude/scripts/cts-sync.sh`, `cts-payload.txt`, or any payload-listed file can break the second while the first stays green: comments and error messages inside the engine ship to every consumer, so wording that reads naturally while working upstream becomes a leak once installed. This rule file is payload too — the same constraint applies to the words you write here.

**Solution**: run both after any such change:

```bash
bash tests/cts-sync.test.sh && bash tests/payload-sanity.test.sh
```

When a new match is a genuine two-way rule the consumer also needs (e.g. a guard whose error message must name the upstream source to be actionable), add a `"relative/path:phrase"` pair to that test's `ALLOWLIST` with a comment justifying it — one entry per matching phrase, since the check greps each phrase separately. Do not soften the message into vagueness just to dodge the grep.

## Payload Completeness Invariant: Two Lists, One Definition

`cts-payload.txt` maintains two independent lists: shipped-paths (lines 16–29) and an "Explicitly NOT payload" comment block (lines 31–42) listing excluded paths with reasons. An implicit invariant requires **every** top-level `.claude/**` subdirectory and other candidate payload paths to appear in exactly one of these two lists — not both, not neither. Currently, no test enforces this completeness; `tests/payload-sanity.test.sh` validates only the _content_ of listed paths (self-containment, no upstream-only phrasing), not whether all candidates are accounted for. When this invariant drifts (a candidate path is listed in neither section), that path is silently omitted from `cts-sync.sh` copies to consumer projects, even if advertised in README.md or docs — the breach can persist undetected for a long time. Concrete example: `.claude/commands/` fell through this gap for over a version, never reaching consumers despite being advertised in feature counts and README. **Solution**: Before shipping a new `.claude/**` entry, audit `cts-payload.txt` to ensure it appears in exactly one list. A follow-up enforcement task (a completeness check in `payload-sanity.test.sh`) is warranted but not yet implemented. // TODO: add payload completeness test.

## A Sync-Time Writer Into a Consumer-Owned File Must Not Write When Already Current

Anything the sync engine writes on **every** run (not just `init`) into a file it doesn't own outright — the `.claude/settings.json` deep-merge, the `.gitattributes` managed block — must compare first and return without touching the file when the content is already correct. Writing identical bytes is not harmless: it re-stamps the mtime and dirties the working tree, so a genuine no-op sync stops looking like one, `git diff` after `/cts-update` shows churn the user has to read past, and the engine's own ownership-violation detector (which compares content hashes) has one more moving file to reason about. The compare-then-skip is a correctness requirement, not an optimization.

The corollary for tests: assert the _absence_ of the write message on a second run, not just the presence of the right content. Content-only assertions pass whether or not the guard exists.

## `$( )` Already Strips Trailing Newlines — Don't Re-Strip Them With `sed`

Command substitution removes **all** trailing newlines from its output, so a value captured with `rest=$(…)` can never end in a blank line. The classic `sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba'` trailing-blank-line dance is dead code in that position. Re-separate with an explicit `printf '%s\n\n%s\n'` instead — that composes cleanly with the guarantee `$( )` already gives you, and repeated runs can't accumulate whitespace.

The same guarantee is why comparing two `$( )` captures for equality is safe even when one source file ends with a newline and the other doesn't.

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
