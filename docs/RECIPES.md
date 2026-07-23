# Recipes — Operator-Facing Workflows

This guide is for human operators running Claude Code sessions. It documents six core workflows that connect planning, task authoring, execution, and feedback cycles. Agents do not read this file — it explains the mechanics humans need to understand to run the template effectively.

## 1. Grill → Tier → Stamps → Tasks

**When:** After a grilling, planning, or brainstorming session produces decisions about what to build.

**What:** Convert session outcomes into stamped backlog tasks that guide clean implementation sessions.

**Flow:**

1. Run a grilling session (activate `grill-me` skill or `brainstorming` for open-ended ideation). Record decisions, scope, assumptions.
2. Orchestrator classifies the work into a tier: **T0** (≤2 files, no executable config), **T1** (≤3 files, no seam crossing), **T2** (seam/contract change, new endpoint/migration/auth logic, requires `ba`), or **T3** (architecture decision, requires `ba` + `ddd-architect` + `devil`). See `rules/cts/workflow.md` section "Tiered Planning Ladder" and "Foresight gate" for exact definitions.
3. Author one or more task files in `tasks/todo/` using the canonical 8-row header (see `rules/cts/task-authoring.md` "Header" section): Clean session, Executor model, Repo/branch, Planning tier, Planning (roles: done/required/skipped), Generation, Depends on, On completion. Each file name follows the pattern `YYYY-MM-DD-NN-slug.md` — NN resets daily, enabling fresh independent batches.
4. In the Planning row, mark each role's status: `ba: done` (if authored by this session's `ba`), `devil: done` (if challenged), `ddd-architect: required` (if T2+ and seam spans domain layers), or `skipped` (if not applicable to this tier).
5. Emit tasks into `tasks/todo/` — they are git-excluded working artifacts. The durable record lives in commits, `CHANGELOG.md`, and `docs/KNOWLEDGE_INBOX.md` (for learnings, not tasks themselves).

**Reference:** `rules/cts/task-authoring.md` (header format, naming, body sections, splitting rule, emission control).

---

## 2. Clean-Session Execution

**When:** An operator hands a stamped task file to a fresh Claude Code Sonnet session to implement.

**What:** The executor obeys the task's stamp; it does not re-plan or re-triage planning decisions that were already made at authoring time.

**Flow:**

1. Operator opens the task file and confirms the Planning row: roles marked `required` (e.g., `ba: required`) must be run by this session; roles marked `done` or `skipped` are already resolved and need not be re-run.
2. Executor reads the task's Planning row and dispatches **only the marked-required roles**. Example: if the header says `ba: done, devil: skipped, ddd-architect: required`, the executor runs `ddd-architect` alone and skips `ba` and `devil`.
3. Executor implements the task body and runs the full quality gate (tester → reviewer → conditional security-scanner/qa).
4. **Guard: seam-vs-stamp contradiction.** If the task body visibly touches a seam (new endpoint, migration, or shared cross-layer contract) but the stamped Planning tier says T0 or T1, the executor **must STOP and flag this** — it must not proceed silently with the stale tier, and must not re-triage on its own authority. Surface to orchestrator or user for re-authoring. See `rules/cts/task-authoring.md` section "Seam-vs-stamp contradiction guard".

**Reference:** `rules/cts/task-authoring.md` sections "Executor obey-the-stamp rule" and "Seam-vs-stamp contradiction guard".

---

## 3. Hard-Stop Continuation

**When:** A task's quality gate reaches the restart limit (2 full cycles with open `## Fix Now` items still unresolved).

**What:** Orchestrator does not self-patch or emit a bare list of failures. Instead, it invokes the `handoff` skill to produce a continuation task — a structured document a fresh session can act on.

**Flow:**

1. After restart cycle 2 fails: orchestrator does not try a 3rd cycle. Instead, it runs the `handoff` skill, which compacts the current conversation into an attempt log (what was tried, why it didn't close the issue) and best-guess hypotheses for root causes.
2. Orchestrator emits a **continuation task** to `tasks/todo/` using the continuation-task template (see `rules/cts/task-authoring.md` "Continuation-task template"): header inherits the original task's tier and Generation, Planning row is all `done` (planning already happened; don't re-run it), Depends-on cites the original task + its upstream deps. Body includes: original title + "(continuation)", reference to `handoff` output, the open Fix Now items, attempt log, and current hypotheses.
3. Operator reviews the continuation task in `tasks/todo/`, hands it to a fresh clean session to take it from where the first session stalled.

**Reference:** `rules/cts/workflow.md` section "Quality Gate" (max 2 cycles rule); `rules/cts/task-authoring.md` "Continuation-task template"; `handoff` skill.

---

## 4. `/cts-update` — Re-sync an Installed CTS Consumer Project

**When:** A consumer project (created by `/cts-setup` and has a `.cts-version` file) needs to pull upstream improvements.

**What:** Safely refresh CTS payload files while preserving local customizations and respecting `.ctsignore` entries.

**Flow:**

1. Operator runs `/cts-update` inside the consumer project session.
2. `/cts-update` (via `.claude/scripts/cts-sync.sh update`) pulls the latest `claude-ts` commit, then re-copies every path listed in `cts-payload.txt`.
3. **Respects `.ctsignore`:** skips any file pattern listed there (project-specific agents, pruned frontend agents, customized rules).
4. **Skips diverged files:** if a payload file has been edited locally and no longer matches what was synced last time, `/cts-update` does not overwrite it — prints the path and a ready-to-run `git diff` command. Operator merges manually.
5. **Reports changed-upstream on ignored files:** if an ignored (customized) file changed upstream, `/cts-update` prints a heads-up with `git diff` so operator reviews the upstream improvements and decides whether to merge, keep local, or un-ignore the file.
6. Prints the `claude-ts` changelog between old and new `.cts-version`, updates `.cts-version`, then exits with `Done. Review with: git diff`. Operator reviews and commits the changes.

**Reference:** README.md "Updating" section; `.ctsignore` gitignore syntax and semantics.

---

## 5. `/cts-contribute` — Push Consumer Improvements Back Upstream

**When:** A consumer project has improvements (new skill, fixed rule, better orchestrator logic) to contribute back to the `claude-ts` template.

**What:** Diff the consumer project against its CTS baseline, interactively review hunks, apply accepted changes to your local CTS checkout, and update changelogs.

**Flow:**

1. Operator runs `/cts-contribute` inside the consumer project.
2. `/cts-contribute` (via `cts-contribute` skill) scans for three cases: **net-new skills** (auto-queued for export), **CTS-managed file changes** (flagged for review), and **`.ctsignore`'d file improvements** (filtered to exclude project-specific content).
3. Operator reviews each item interactively: accept (export as-is), skip, or edit-before-export (strip project-specific parts). `/cts-contribute` applies all accepted hunks directly to the corresponding files in your local CTS checkout.
4. `/cts-contribute` writes new entries to CTS's `CHANGELOG.md` under `## [Unreleased] — Contributed from <consumer-project-name>`, then distills your consumer project's `docs/CLAUDE_TS_CHANGELOG.md` by removing entries that were just exported.
5. Operator runs `cd <cts-path> && git diff` to review changes, then commits and pushes CTS when satisfied.

**Reference:** `cts-contribute` skill; README.md "Customization" section.

---

## 6. `/distill-inbox` Cadence

**When:** `docs/KNOWLEDGE_INBOX.md` accumulates learnings (bugs, config gotchas, library recipes, wrong patterns) whose final home isn't yet clear.

**What:** Periodically move inbox entries into their permanent home or discard them, keeping the inbox trending toward empty.

**Flow:**

1. **Automatic trigger:** during Phase 6 (Knowledge Capture) of any pipeline, check `docs/KNOWLEDGE_INBOX.md`. If it exceeds ~10 entries or ~3 KB, distillation kicks in automatically.
2. **Manual trigger:** operator runs `/distill-inbox` explicitly, or marks a roadmap phase end.
3. **Distillation process:** for each entry in the inbox:
   - Decide its permanent home: `PROJECT_CONTEXT.md` (domain/architecture facts), `CLAUDE.md` (orchestrator/agent behavior), a `rule` file (procedural knowledge), a `skill` file (reusable technique), `docs/CLAUDE_TS_CHANGELOG.md` (upstream-bound template fixes), or **discard** (no longer useful).
   - Move the entry (or a summary of it) into that home, preserving the "Why" and any context needed for the next reader.
   - Delete the entry from the inbox.
4. **Record:** update `CHANGELOG.md` with a summary of what was distilled and where it went.

**Reference:** `rules/cts/workflow.md` section "Knowledge Capture" and "Knowledge Inbox"; `docs/KNOWLEDGE_INBOX.md` format and litmus test (would another developer or AI tool on this repo benefit?).

---

## Further Reading

- **Orchestrator and pipeline:** `rules/cts/workflow.md` — First Action (Triage), Tiered Planning Ladder, Foresight gate, Standard Feature Pipeline, Quality Gate, Knowledge Capture.
- **Task file mechanics:** `rules/cts/task-authoring.md` — canonical header, executor stamp rule, seam-vs-stamp guard, continuation-task template, splitting rule, blast-radius map.
- **CTS consumer operations:** README.md "Quick Start", "Updating", "Customization" sections.
- **Skills reference:** `README.md` Skills section lists all bundled skills, including `grill-me`, `handoff`, `cts-update`, `cts-contribute`, `distill-inbox`.
