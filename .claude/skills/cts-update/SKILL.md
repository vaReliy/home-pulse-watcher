---
name: cts-update
description: "Narrated re-sync of an already-installed CTS project: runs the sync engine, summarizes what changed upstream, what was skipped via .ctsignore, and surfaces locally-modified payload files that the engine preserved instead of overwriting. NOT for first-time installs (use cts-setup) and NOT for projects without a .cts-version file.\n\nTrigger — EN: cts-update, update CTS, sync claude-ts, refresh template, check upstream changes.\nTrigger — UA: оновити CTS, синхронізувати шаблон, оновлення claude-ts, апдейт агентів, перевірити зміни."
---

# /cts-update

Wraps `.claude/scripts/cts-sync.sh update` ("engine call") and narrates the result. Make exactly ONE engine call; everything else is reading its output plus `git diff`, then summarizing and flagging risks.

## 1. Preflight

- If `.cts-version` is missing, this project was never installed via `cts-sync.sh` — tell the user to run `/cts-setup` instead and stop.

## 2. Engine call

Run `bash .claude/scripts/cts-sync.sh update`, passing through `--source <path-or-url>` and/or `--branch <name>` if the user specified them (e.g. to track a fork or a feature branch).

- Check the call's exit code. A non-zero exit (git clone/fetch failure, missing repo, bad `--source`/`--branch`, etc.) means the sync **did not run** — this is not "already up to date." Stop, show the captured stderr verbatim, and tell the user to retry (most often a transient network issue reaching the source repo). Do not proceed to step 3 in this case, and do not touch `.cts-version` or any files yourself.
- If the exit code is 0, also sanity-check that something actually happened: the script always prints `Done. Review with: git diff` on success. If that line is missing even though the exit code was 0, treat it the same as a failure — surface the raw output and stop.

## 3. Narrate

Only reached after a confirmed successful engine call (see step 2).

- Capture the script's stdout: the "Changes:" section (commit log between old and new `.cts-version`), any `ignored, but changed upstream — review manually: <path>` lines, any `locally modified, not overwritten — diff manually: <path>` lines, and any `removed upstream — delete manually if unwanted: <path>` lines.
- Run `git diff --stat` to see which local files actually changed.
- Summarize for the user in three short groups: **Upstream changes** (from the changelog), **Updated locally** (from `git diff --stat`), **Needs attention** (changed-upstream + locally-modified + removed-upstream notices).

The engine only overwrites a payload file if the working copy still matches what was synced last time — if it diverged (local edit, whether or not `.ctsignore`'d), it's skipped and reported as `locally modified, not overwritten` rather than silently clobbered.

## 4. Merge upstream changes into ignored files

For each `ignored, but changed upstream` line, the script prints a ready-to-run `git diff` command — run it and judge the upstream change against the local customized file:

- **Improvement that applies here** (new section, fixed instruction, better rule) → offer to hand-merge those hunks into the local file, preserving the project's customizations. Apply only after the user agrees.
- **Doesn't apply** (upstream change conflicts with why the file was customized) → say so in one line and move on.
- **Local file now matches upstream intent** (e.g. a local fix that CTS has since adopted) → suggest removing the `.ctsignore` entry so the file returns to CTS ownership.

## 5. Resolve locally-modified files

For each `locally modified, not overwritten` line, run the printed `git -C <src> diff OLD..NEW -- <path>` and judge the upstream change against the local edit, same as step 4:

- **Upstream improvement you want** → offer to hand-merge those hunks into the local file, preserving the customization. Apply only after the user agrees.
- **Local edit is a candidate to push upstream** (this is what `/cts-contribute` is for) → say so and point the user at `/cts-contribute` instead of merging by hand here.
- **Ongoing divergence you want to keep quiet in future runs** → suggest adding the file to `.ctsignore` so subsequent updates skip it without re-reporting it every time.

Because the engine now refuses to overwrite a diverged file, there's nothing to "revert" here — the local content was never touched.

## 6. Suggest & hand off

- Propose `.ctsignore` additions for files from step 5 that the user wants silenced going forward (root-level entries should be `/`-anchored, e.g. `/AGENTS.md` — a bare filename also matches nested payload files).
- Propose `.ctsignore` removals identified in step 4 — the ignore list should shrink over time, not grow.
- Remind the user: `git diff` is the merge tool — review and commit themselves. This skill never commits or pushes.
