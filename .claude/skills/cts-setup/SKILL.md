---
name: cts-setup
description: "Guided install or merge of the CTS template (agents, skills, rules, AGENTS.md/CLAUDE.md) into the current project, including profile pruning for your frontend stack. NOT for routine re-syncs of an already-installed project (use cts-update) and NOT for editing application source code.\n\nTrigger — EN: cts-setup, install CTS, set up claude-ts, configure template, install profile, prune agents.\nTrigger — UA: встановити CTS, налаштувати шаблон, встановлення claude-ts, профіль установки, обрати фреймворк."
---

# /cts-setup

Wraps `.claude/scripts/cts-sync.sh` ("engine call") to install or merge the CTS template into the current project, then walks the user through stack-specific pruning. Make exactly ONE engine call per run; everything else (merging, asking, pruning, narrating) is agent judgment the script can't do.

## 1. Preflight

- `git rev-parse --is-inside-work-tree` — if it fails, stop: "not a git repo".
- `git status --porcelain` — if non-empty, warn the user the tree isn't clean but continue if they confirm.
- If `.cts-version` exists, this project already has CTS installed — tell the user to run `/cts-update` instead and stop.

## 2. Engine call

- If `.claude/scripts/cts-sync.sh` is missing, fetch it first: `mkdir -p .claude/scripts && curl -fsSL https://raw.githubusercontent.com/vaReliy/claude-ts/main/.claude/scripts/cts-sync.sh -o .claude/scripts/cts-sync.sh && chmod +x .claude/scripts/cts-sync.sh`.
- If it's already present but stale (e.g. an existing project bootstrapped it long ago), the engine's self-update-first step usually handles it transparently on the first `init`/`update` call — **but only if the on-disk copy is new enough to contain that mechanism at all**. Check first: `grep -q CTS_SYNC_REEXEC .claude/scripts/cts-sync.sh || echo STALE`. If it prints `STALE`, the on-disk script predates the two-layer refactor and has no self-update-first code to fall back on — running `init --force` directly against it would execute its old 3-way-merge logic against the current payload and can leave `<<<<<<<` conflict markers in `AGENTS.md`/`CLAUDE.md`/other payload files. Replace it first, same as the missing-file case above: if `--source` resolves to a local directory, `cp <source>/.claude/scripts/cts-sync.sh .claude/scripts/cts-sync.sh`; otherwise re-run the curl command above against the resolved source/branch. **Verify the replacement before proceeding**: check the `cp`/`curl` command's own exit code, then re-run `grep -q CTS_SYNC_REEXEC .claude/scripts/cts-sync.sh || echo STALE`. If the `cp`/`curl` exited non-zero, or `grep` still prints `STALE`, the replacement failed (network down, 404, truncated download, bad `--source` path) and the on-disk script is now stale or corrupt — stop here, tell the user the stale-engine replacement failed and why, and do NOT proceed to the engine call below or invoke `cts-sync.sh` in this state. Only once both checks pass, continue with the engine call below as normal.
- **New project** (no `CLAUDE.md`/`AGENTS.md`/`.claude/`): run `bash .claude/scripts/cts-sync.sh init`.
- **Existing project** with its own `CLAUDE.md`/`AGENTS.md`/`.claude/`: run `bash .claude/scripts/cts-sync.sh init --force`. Every CTS-owned payload path is a plain overwrite — there is no merge, so nothing here needs hand-reconciliation. If the project's existing `CLAUDE.md`/`AGENTS.md`/`.claude/**` content is worth keeping, do it BEFORE the engine call: move the project's own prose into `CLAUDE.local.md` / `AGENTS.local.md` (the CTS core files already `@import` these — see step 6) and any customized rule/agent content into `rules/local/**` / `.claude/agents-local/<name>.md`, so the overwrite in this step never has anything worth losing. `.claude/settings.json` is the one exception — it's consumer-owned and the engine deep-merges `.cts/settings.cts.json` into it (consumer values win on conflict), so leave it as-is; nothing to move out of it first.
- The engine writes `.cts-version`, `.cts-source`, `.cts/manifest.json`, and (on a fresh install) `.ctsignore` itself — nothing to do by hand here.

## 3. Profile questions (AskUserQuestion, one at a time)

1. "Which frontend framework does this project use?" → Vue / React / Angular / none (backend-only).
2. "Any agents or skills you know are irrelevant to this project?" (e.g. `queue-specialist` if there's no BullMQ, `dba` if there's no relational DB) — free text, optional.

## 4. Prune

Per the README's **Install Profile** section:

- **Backend-only**: delete `.claude/agents/{vue,react,angular}-developer.md` and `.claude/skills/{vue,react,angular}-expert/`; remove the frontend routing rows and the `## Frontend` line from `CLAUDE.md`'s Orchestrator Core; drop the frontend frameworks from `AGENTS.md`'s `## Stack` line.
- **Single framework**: keep only the matching agent/skill pair, delete the other two, narrow the `## Frontend` routing row to the one kept.
- For each extra item the user flagged in step 3, delete the matching agent/skill file and its routing-table row, the same way.

## 5. Record in `.ctsignore`

Append every path **deleted** in step 4 to `.ctsignore` (gitignore syntax, one path per line) so `cts-sync.sh update` never re-adds it. Add a short comment above each group explaining why (pruned). Files customized via `rules/local/**` / `.claude/agents-local/*.md` do NOT need a `.ctsignore` entry — they live outside the payload entirely and are never touched by sync, by construction.

## 6. Bootstrap the local-override layer and knowledge inbox

- Create `rules/local/` and `.claude/agents-local/` (empty is fine — the consumer populates these as needed; `git`'s inability to track empty dirs means a `.gitkeep` placeholder in each is acceptable).
- Create `CLAUDE.local.md` and `AGENTS.local.md` if they don't exist yet (a one-line header comment like `<!-- Consumer-owned overrides for CLAUDE.md. Never synced. -->` is enough) — `CLAUDE.md`/`AGENTS.md` already `@import` these, so leaving them absent is not an error, but creating empty stubs makes the override point discoverable.
- If `docs/KNOWLEDGE_INBOX.md` doesn't exist yet, create it using the template + format in `rules/cts/workflow.md`'s "Knowledge Inbox" section (append-only, agent-agnostic learnings queue). Do not add it to `.ctsignore` — it's project data, not a payload file.

## 7. Verify

- `grep -L 'Report Format' .claude/agents/*.md` → must print nothing for the agents that remain.
- `grep -L 'Local Override' .claude/agents/*.md` → must print nothing for the agents that remain (every shipped agent ends with the `.claude/agents-local/<name>.md` override-hook tail).
- `.cts-version`, `.ctsignore`, and `.cts/manifest.json` all exist.
- `.claude/settings.json` exists and its `permissions.deny` array contains all four of `Edit(./rules/cts/**)`, `Write(./rules/cts/**)`, `Edit(./.cts/**)`, `Write(./.cts/**)` (confirms the settings merge ran and both tools are denied on both paths — `Edit`-only would leave `Write` as a bypass).
- `docs/KNOWLEDGE_INBOX.md` exists.
- Print a short summary table: columns `installed` / `pruned` / `ignored`, one row per path touched.

## 8. Hand off

Tell the user to review `git status` / `git diff` and commit themselves — this skill never commits or pushes.
