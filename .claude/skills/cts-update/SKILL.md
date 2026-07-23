---
name: cts-update
description: "Narrated re-sync of an already-installed CTS project: runs the sync engine, summarizes what changed upstream, what was skipped via .ctsignore, and surfaces ownership-violation and override-rot warnings the engine can't resolve on its own. NOT for first-time installs (use cts-setup) and NOT for projects without a .cts-version file.\n\nTrigger — EN: cts-update, update CTS, sync claude-ts, refresh template, check upstream changes.\nTrigger — UA: оновити CTS, синхронізувати шаблон, оновлення claude-ts, апдейт агентів, перевірити зміни."
---

# /cts-update

Wraps `.claude/scripts/cts-sync.sh update` ("engine call") and narrates the result. Make exactly ONE engine call; everything else is reading its output plus `git diff`, then summarizing and flagging risks.

Two-layer distribution model: every CTS-owned payload path is plain-overwritten by the engine — there is no merge and nothing here asks you to reconcile hunks. The engine self-updates before doing anything else (see step 2) **once it is actually running** — but that self-update-first mechanism did not exist before the two-layer refactor, so a genuinely pre-refactor on-disk script can't self-update at all (it has no such code). Step 1 below guards that gap.

## 1. Preflight

- If `.cts-version` is missing, this project was never installed via `cts-sync.sh` — tell the user to run `/cts-setup` instead and stop.
- **Stale pre-two-layer engine guard**: run `grep -q CTS_SYNC_REEXEC .claude/scripts/cts-sync.sh || echo STALE`. If it prints `STALE` (marker absent), the on-disk engine predates the two-layer refactor entirely and has no self-update-first mechanism — invoking it directly would run its old 3-way-merge logic against the current payload and can leave `<<<<<<<` conflict markers in payload files (observed: `AGENTS.md`, `CLAUDE.md`, `docs/METRICS.md`, several agent/skill files) instead of ever reaching self-update. Replace it BEFORE the engine call, the same way `/cts-setup` bootstraps a missing script: if `--source` resolves to a local directory, `cp <source>/.claude/scripts/cts-sync.sh .claude/scripts/cts-sync.sh`; otherwise curl the raw file from the resolved source/branch (default: `https://raw.githubusercontent.com/vaReliy/claude-ts/main/.claude/scripts/cts-sync.sh`), then `chmod +x .claude/scripts/cts-sync.sh`. **Verify the replacement before proceeding**: check the `cp`/`curl` command's own exit code, then re-run `grep -q CTS_SYNC_REEXEC .claude/scripts/cts-sync.sh || echo STALE`. If the `cp`/`curl` exited non-zero, or `grep` still prints `STALE`, the replacement failed (network down, 404, truncated download, bad `--source` path) and the on-disk script is now stale or corrupt — stop here, tell the user the stale-engine replacement failed and why, and do NOT proceed to step 2 or invoke `cts-sync.sh` in this state. Only once both checks pass: tell the user the replacement happened in one short line, then continue to step 2 as normal — the engine call now runs the current engine from the first invocation, so its own self-update-first step is a no-op (already current).
- Print one non-blocking FYI line before the engine call — this is discoverability, not a question, so don't wait for a reply. Default: `Using default source (claude-ts main). Options: --source/--branch to track a fork.` If `.cts-source` exists and its `source:`/`branch:` lines show a non-default value was used last time, name that source/branch instead of "default" (e.g. `Using last-used source (<source> @ <branch>). Options: ...`).

## 2. Engine call

Run `bash .claude/scripts/cts-sync.sh update`, capturing stderr, and passing through `--source <path-or-url>` and/or `--branch <name>` if the user specified them (e.g. to track a fork or a feature branch).

- **Self-update-first**: if the engine detects its own script differs from the source's copy, it overwrites itself and re-execs transparently — you'll see `cts-sync engine updated; re-running with the new version...` in the captured output, followed immediately by the rest of that same run's output. This is one continuous engine call from your perspective; don't treat it as two runs or re-invoke anything yourself.
- Check the call's exit code. A non-zero exit (git clone/fetch failure, missing repo, bad `--source`/`--branch`, `jq` missing, etc.) means the sync **did not run**. Stop, show the captured stderr verbatim, and tell the user to retry. Do not proceed to step 3, and do not touch `.cts-version` or any files yourself.
  - **`Error: settings merge would drop required CTS permissions.deny entries`** is a distinct, more consequential non-zero exit, and it fires late (after the rest of the payload has already synced — this is the last step before `.cts-version`/`.cts/manifest.json` are updated): it means the deep-merge into `.claude/settings.json` would have silently lost the ownership-enforcement deny rules (`Edit`/`Write` on `rules/cts/**`/`.cts/**`) because an existing `permissions` or `permissions.deny` key in the consumer's `settings.json` has an unexpected shape (a string instead of an object, an object instead of an array, etc. — usually leftover from manual editing or an older/malformed state, not necessarily malicious). The engine refuses to write `.claude/settings.json` in this case (it stays exactly as it was before this run) and does NOT update `.cts-version`/`.cts/manifest.json` either — but the rest of the payload (rules, agents, skills) WAS already overwritten before this check runs, so `git diff` will show those changes even though the run reported failure. Do not attempt to hand-merge or silently "fix" the shape yourself; open `.claude/settings.json`, show the user the offending key, and ask them to correct its shape (restore `permissions` to an object with a `deny` array) before re-running `/cts-update` to pick up the settings merge and finalize `.cts-version`.
- If the exit code is 0, also sanity-check that something actually happened: the script always prints `Done. Review with: git diff` on success. If that line is missing even though the exit code was 0, treat it the same as a failure — surface the raw output and stop.
- **Unconditionally** check the captured stderr for a line starting `Warning: last sync used source ... this run resolved ...` — do this for every successful run, before any narration. If present, stop here (before step 3) and call `AskUserQuestion` with a single question: header naming the mismatch (`<prev source/branch>` vs `<current source/branch>`), options **"Continue with current source"** and **"Re-run matching prior sync (`--source`/`--branch`)"**. Wait for their choice; if they pick the re-run option, re-invoke step 2 with `--source`/`--branch` set to the prior values.

## 3. Narrate

Only reached after a confirmed successful engine call and, if the mismatch warning fired, after the user has chosen to continue (see step 2).

Capture the script's stdout and group it into five short buckets:

- **Upstream changes** — the "Changes:" section (commit log between old and new `.cts-version`).
- **Synced** — every payload file the engine overwrote this run; `git diff --stat` shows what actually changed content-wise (most synced files are byte-identical to what's already there and won't show up in the diff at all — that's expected and healthy under overwrite semantics, not something to narrate as "nothing happened").
- **Ownership warnings** — every `OWNERSHIP WARNING: <path>` line. Each means a CTS-owned file was edited locally outside an override file; the engine has already overwritten it with upstream's content (updates never skip wholesale — there's no "keep the local version" option at the engine level).
- **Override rot** — every `OVERRIDE ROT: <path> cites "<target>"` line. The override still exists and was never touched, but the CTS content it cites just changed.
- **Needs attention** — everything else: `NEW PAYLOAD PATH COLLISION`, `removed upstream`, and `ignored, but changed upstream` lines.

### Ownership warnings (step 4 below resolves these)

For each `OWNERSHIP WARNING: <path>` line, the local edit is **already gone** — the file now holds upstream's content. There is nothing to "resolve" at the file level; the only decision is what to do with the lost edit. Don't imply the edit is still recoverable from the working tree — if the user wants it back, it has to come from `git diff` on the commit before this sync ran (if they committed it) or `git stash`/reflog, not from anything the engine preserved.

### Override rot (step 4 below resolves these)

For each `OVERRIDE ROT: <path> cites "<target>"` line, open both the override file and the current `<target>` and judge whether the override's cited section still exists / still says what the override assumes it says. This judgment is free-text; the resolution goes to the user as an arrow-key choice in step 4.

### Needs attention

- `NEW PAYLOAD PATH COLLISION: <path>` — a path newly added to CTS's payload already existed locally for unrelated reasons; CTS's content won outright (single ownership — no merge). Point the user at `git diff` to see what changed, and note the `.ctsignore` / `/cts-contribute` options the engine already printed.
- `removed upstream — delete manually if unwanted: <path>` — CTS no longer ships this file; it's still present locally. Not blocking.
- `ignored, but changed upstream — review manually: <path>` — a `.ctsignore`'d file's CTS-side content changed while ignored. Run the printed `git diff` hint yourself and judge it (see step 4).

**Triage note — contribution round-trip**: if this project previously ran `/cts-contribute`, an `OWNERSHIP WARNING` on this run for a file you just contributed is expected, not a defect — see step 5.

## 4. Resolve ownership warnings, override rot, and ignored-but-changed files

Judgment here is spent on the buckets from step 3; reading diffs stays free-text, but the outcome goes to the user as arrow-key menus, not typed prose.

**(a) Ownership warnings.** For each file, the edit is already overwritten — there is no "keep local" option at this point. Call `AskUserQuestion` with `multiSelect: true`, header "Route these overwritten local edits to `/cts-contribute`? (unselected → treat as accidental, no further action)", one option per file (page into multiple grouped questions if more than 4). For files selected, point them at `/cts-contribute` next (or run it now if the user prefers — see step 6). For files left unselected, no action needed; mention in the closing summary that the edit was lost this run.

**(b) Override rot.** For each flagged override file, present your judgment (still applies / needs updating / no longer needed) and call `AskUserQuestion` with `multiSelect: true`, header "Which override files need a hand-edit after this sync?", one option per file (page if more than 4). For files selected, walk through the cited CTS content with the user and update the override's replacement text together. For files left unselected, no action — the override stands as-is.

**(c) Ignored-but-changed-upstream.** For each file, run the printed `git diff` hint and judge:

- **Improvement that applies here** → candidate for the "un-ignore or hand-update" bucket.
- **Doesn't apply** (upstream change conflicts with why the file was forked) → report as "reviewed, no action," no question needed.

If the bucket is non-empty, call `AskUserQuestion` with `multiSelect: true`, header "Update these `.ctsignore`'d files to match upstream's change?", one option per file. For files selected, either hand-apply the upstream change to the local fork or remove the `.ctsignore` entry so the next sync overwrites it outright (ask the user which, per file, if not obvious) — file left unselected: no action.

## 5. Close out

- If nothing was flagged this run at all — no `OWNERSHIP WARNING`/`OVERRIDE ROT`/`NEW PAYLOAD PATH COLLISION`/`ignored, but changed upstream`/`removed upstream` lines in step 3's summary — state plainly that the sync was clean and there's nothing to act on. Stop; don't call `AskUserQuestion` for a clean run.
- Otherwise, summarize what step 4 resolved and what remains as a **push-upstream candidate** — a file the user routed to `/cts-contribute` in step 4(a), still not contributed as of this run.
  - If a push-upstream candidate remains, call `AskUserQuestion` with a single non-`multiSelect` question offering **"Run `/cts-contribute` now"** and **"Stop here, I'll review `git diff` myself"**.
  - If no push-upstream candidate remains, skip the menu and just remind the user of the standing `git diff` reminder below.

Whatever happens, remind them: `git diff` is the review tool — review and commit themselves. This skill never commits or pushes.
