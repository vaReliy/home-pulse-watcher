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

- If `.claude/scripts/cts-sync.sh` is missing, fetch it first: `mkdir -p .claude/scripts && curl -fsSL https://raw.githubusercontent.com/vaReliy/claude-ts/main/.claude/scripts/cts-sync.sh -o .claude/scripts/cts-sync.sh`
- **New project** (no `CLAUDE.md`/`AGENTS.md`/`.claude/`): run `bash .claude/scripts/cts-sync.sh init`.
- **Existing project** with its own `CLAUDE.md`/`AGENTS.md`/`.claude/`:
  1. Run `bash .claude/scripts/cts-sync.sh init --dry-run` to see the full payload list (this also populates `~/.cache/claude-ts` with the source checkout).
  2. For listed paths that don't exist locally yet, copy them as-is from `~/.cache/claude-ts/<path>`.
  3. For conflicting files (`CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.claude/settings.json`, any overlapping `rules/*` or `.claude/agents|skills/*`): MERGE by hand — integrate/prepend CTS content into the project's existing file, preserving project-specific sections. Never silently overwrite.
  4. Write `.cts-version` (run `git -C ~/.cache/claude-ts rev-parse HEAD`) and, if `.ctsignore` doesn't exist yet, create it with the header comment the script writes on a fresh `init`.

## 3. Profile questions (AskUserQuestion, one at a time)

1. "Which frontend framework does this project use?" → Vue / React / Angular / none (backend-only).
2. "Any agents or skills you know are irrelevant to this project?" (e.g. `queue-specialist` if there's no BullMQ, `dba` if there's no relational DB) — free text, optional.

## 4. Prune

Per the README's **Install Profile** section:

- **Backend-only**: delete `.claude/agents/{vue,react,angular}-developer.md` and `.claude/skills/{vue,react,angular}-expert/`; remove the frontend routing rows and the `## Frontend` line from `CLAUDE.md`'s Orchestrator Core; drop the frontend frameworks from `AGENTS.md`'s `## Stack` line.
- **Single framework**: keep only the matching agent/skill pair, delete the other two, narrow the `## Frontend` routing row to the one kept.
- For each extra item the user flagged in step 3, delete the matching agent/skill file and its routing-table row, the same way.

## 5. Record in `.ctsignore`

Append every path deleted or hand-merged in steps 2 and 4 to `.ctsignore` (gitignore syntax, one path per line) so `cts-sync.sh update` never re-adds or overwrites them. Add a short comment above each group explaining why (pruned / customized).

## 6. Bootstrap knowledge inbox

If `docs/KNOWLEDGE_INBOX.md` doesn't exist yet, create it using the template + format in `rules/workflow.md`'s "Knowledge Inbox" section (append-only, agent-agnostic learnings queue). Do not add it to `.ctsignore` — it's project data, not a payload file.

## 7. Verify

- `grep -L 'Report Format' .claude/agents/*.md` → must print nothing for the agents that remain.
- `.cts-version` and `.ctsignore` both exist.
- `docs/KNOWLEDGE_INBOX.md` exists.
- Print a short summary table: columns `installed` / `pruned` / `ignored`, one row per path touched.

## 8. Hand off

Tell the user to review `git status` / `git diff` and commit themselves — this skill never commits or pushes.
