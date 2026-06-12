---
name: cts-update
description: "Narrated re-sync of an already-installed CTS project: runs the sync engine, summarizes what changed upstream, what was skipped via .ctsignore, and flags locally-modified files at risk of being overwritten. NOT for first-time installs (use cts-setup) and NOT for projects without a .cts-version file.\n\nTrigger — EN: cts-update, update CTS, sync claude-ts, refresh template, check upstream changes.\nTrigger — UA: оновити CTS, синхронізувати шаблон, оновлення claude-ts, апдейт агентів, перевірити зміни."
---

# /cts-update

Wraps `.claude/scripts/cts-sync.sh update` ("engine call") and narrates the result. Make exactly ONE engine call; everything else is reading its output plus `git diff`, then summarizing and flagging risks.

## 1. Preflight

- If `.cts-version` is missing, this project was never installed via `cts-sync.sh` — tell the user to run `/cts-setup` instead and stop.

## 2. Engine call

Run `bash .claude/scripts/cts-sync.sh update`, passing through `--source <path-or-url>` and/or `--branch <name>` if the user specified them (e.g. to track a fork or a feature branch).

## 3. Narrate

- Capture the script's stdout: the "Changes:" section (commit log between old and new `.cts-version`), any `ignored, but changed upstream — review manually: <path>` lines, and any `removed upstream — delete manually if unwanted: <path>` lines.
- Run `git diff --stat` to see which local files actually changed.
- Summarize for the user in three short groups: **Upstream changes** (from the changelog), **Updated locally** (from `git diff --stat`), **Needs attention** (changed-upstream + removed-upstream notices).

## 4. Merge upstream changes into ignored files

For each `ignored, but changed upstream` line, the script prints a ready-to-run `git diff` command — run it and judge the upstream change against the local customized file:

- **Improvement that applies here** (new section, fixed instruction, better rule) → offer to hand-merge those hunks into the local file, preserving the project's customizations. Apply only after the user agrees.
- **Doesn't apply** (upstream change conflicts with why the file was customized) → say so in one line and move on.
- **Local file now matches upstream intent** (e.g. a local fix that CTS has since adopted) → suggest removing the `.ctsignore` entry so the file returns to CTS ownership.

## 5. Flag risks

For each file in `git diff --stat`'s output, check `git log --oneline -1 -- <file>` for the commit *before* this sync. If that commit is a normal project commit (not a previous `cts-sync` run), the project had local edits to a file CTS just overwrote — warn the user explicitly, showing the diff for that file, and suggest either:

- reverting that hunk (review `git diff -- <file>` and re-apply the local edit manually), or
- adding `<file>` to `.ctsignore` so future updates skip it.

## 6. Suggest & hand off

- Propose concrete `.ctsignore` additions for any files flagged in step 5 (root-level entries should be `/`-anchored, e.g. `/AGENTS.md` — a bare filename also matches nested payload files).
- Propose `.ctsignore` removals identified in step 4 — the ignore list should shrink over time, not grow.
- Remind the user: `git diff` is the merge tool — review and commit themselves. This skill never commits or pushes.
