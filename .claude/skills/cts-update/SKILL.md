---
name: cts-update
description: "Narrated re-sync of an already-installed CTS project: runs the sync engine, summarizes what changed upstream, what was skipped via .ctsignore, and surfaces locally-modified payload files that the engine preserved instead of overwriting. NOT for first-time installs (use cts-setup) and NOT for projects without a .cts-version file.\n\nTrigger — EN: cts-update, update CTS, sync claude-ts, refresh template, check upstream changes.\nTrigger — UA: оновити CTS, синхронізувати шаблон, оновлення claude-ts, апдейт агентів, перевірити зміни."
---

# /cts-update

Wraps `.claude/scripts/cts-sync.sh update` ("engine call") and narrates the result. Make exactly ONE engine call; everything else is reading its output plus `git diff`, then summarizing and flagging risks.

## 1. Preflight

- If `.cts-version` is missing, this project was never installed via `cts-sync.sh` — tell the user to run `/cts-setup` instead and stop.

## 2. Engine call

Run `bash .claude/scripts/cts-sync.sh update`, passing through `--source <path-or-url>` and/or `--branch <name>` if the user specified them (e.g. to track a fork or a feature branch). Also pass `--no-merge` if the user says they'd rather skip merge attempts entirely this run (e.g. testing, or they want to keep reviewing every diverged file by hand as before) — otherwise the engine attempts a 3-way merge on any file that changed on both sides.

- Check the call's exit code. A non-zero exit (git clone/fetch failure, missing repo, bad `--source`/`--branch`, etc.) means the sync **did not run** — this is not "already up to date." Stop, show the captured stderr verbatim, and tell the user to retry (most often a transient network issue reaching the source repo). Do not proceed to step 3 in this case, and do not touch `.cts-version` or any files yourself.
- If the exit code is 0, also sanity-check that something actually happened: the script always prints `Done. Review with: git diff` on success. If that line is missing even though the exit code was 0, treat it the same as a failure — surface the raw output and stop.

## 3. Narrate

Only reached after a confirmed successful engine call (see step 2).

- Capture the script's stdout: the "Changes:" section (commit log between old and new `.cts-version`), any `ignored, but changed upstream — review manually: <path>` lines, any `merged: <path>` lines, any `CONFLICT: <path>` lines, any `locally modified, not overwritten — diff manually: <path>` lines, and any `removed upstream — delete manually if unwanted: <path>` lines.
- Run `git diff --stat` to see which local files actually changed.
- Summarize for the user in five short groups: **Upstream changes** (from the changelog), **Updated locally** (from `git diff --stat`), **Merged cleanly** (`merged:` lines — both sides touched the file, non-overlapping hunks combined automatically), **Conflicts** (`CONFLICT:` lines — both sides touched the same hunk, standard `<<<<<<<`/`=======`/`>>>>>>>` markers left in the file), **Needs attention** (changed-upstream-while-ignored + locally-modified-with-no-upstream-change + removed-upstream notices).

The engine only overwrites a payload file outright if the working copy still matches what was synced last time. If it diverged and upstream also changed the same file, it runs a 3-way merge (base = content at the old `.cts-version`) instead of skipping — clean hunks apply silently (`merged:`), overlapping hunks get conflict markers (`CONFLICT:`). If it diverged but upstream did **not** touch that file, or `--no-merge` was passed, it's skipped and reported as `locally modified, not overwritten` rather than silently clobbered.

## 4. Merge upstream changes into ignored files

For each `ignored, but changed upstream` line, the script prints a ready-to-run `git diff` command — run it and judge the upstream change against the local customized file:

- **Improvement that applies here** (new section, fixed instruction, better rule) → offer to hand-merge those hunks into the local file, preserving the project's customizations. Apply only after the user agrees.
- **Doesn't apply** (upstream change conflicts with why the file was customized) → say so in one line and move on.
- **Local file now matches upstream intent** (e.g. a local fix that CTS has since adopted) → suggest removing the `.ctsignore` entry so the file returns to CTS ownership.

## 5. Resolve conflicts and locally-modified files

Judgment here is spent only on `CONFLICT:` files — `merged:` files already applied cleanly and need no review beyond what `git diff --stat` already showed in step 3.

For each `CONFLICT: <path>` line, open the file and resolve the `<<<<<<<`/`=======`/`>>>>>>>` markers hunk-by-hunk with the user: for each hunk, decide whether to keep the local side, take the upstream side, or hand-write a combination, then remove the markers. Once every hunk in the file is resolved, tell the user it's ready to stage.

For each `locally modified, not overwritten` line (diverged locally, unchanged upstream — no merge was attempted), run `git -C <src> diff OLD..NEW -- <path>` and judge the same way as step 4:

- **Local edit is a candidate to push upstream** (this is what `/cts-contribute` is for) → say so and point the user at `/cts-contribute`.
- **Ongoing divergence you want to keep quiet in future runs** → suggest adding the file to `.ctsignore` so subsequent updates skip it without re-reporting it every time.

Because the engine only merges or skips — it never overwrites a diverged file outright — there's nothing to "revert" for either group; the pre-run content is either still there untouched (`locally modified`) or already merged in place (`merged:`/`CONFLICT:`).

## 6. Suggest & hand off

- Propose `.ctsignore` additions for files from step 5 that the user wants silenced going forward (root-level entries should be `/`-anchored, e.g. `/AGENTS.md` — a bare filename also matches nested payload files).
- Propose `.ctsignore` removals identified in step 4 — the ignore list should shrink over time, not grow.
- Remind the user: `git diff` is the merge tool — review and commit themselves. This skill never commits or pushes.
