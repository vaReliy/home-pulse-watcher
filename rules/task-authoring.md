# Task Authoring: Backlog Emission

## Overview

Every plan, grill, or grooming session must emit one or more task files into the backlog before the session ends. These files are working artifacts that structure the implementation phase; their durable record lives in commit history, `KNOWLEDGE_INBOX.md`, and `CHANGELOG.md`.

## Routing

- **Default location**: `./tasks/` at the repo root, one subdirectory per named phase/feature-area (e.g. `tasks/rebuild/`, `tasks/workspace/`) — each containing `todo/`, `parked/`, `done/` directly (no redundant nested `tasks/` level).
- **Phase-dependent tasks** (part of a named rebuild/migration phase, or a standalone feature area big enough to warrant its own folder) → `tasks/<phase>/todo/` (project-specific; adapt the phase directory name to your project)
- **General / cross-cutting tasks** with no clear phase → `tasks/todo/` directly (created lazily on first use)

Add a committed `/tasks` line to `.gitignore` so this is a clone-portable exclusion, not a local-only `.git/info/exclude` entry — the latter doesn't travel with a fresh checkout. `/tasks` is git-ignored — private working artifacts, not committed. The committed, durable record is: commit history + `KNOWLEDGE_INBOX.md` + `CHANGELOG.md`. The rule file itself is committed; the task files it governs are private.

Because this directory is git-ignored, always use plain filesystem `mv`/`cp`/`rm` for anything under `tasks/` — never a `git`-prefixed variant. `git status`/`git diff` correctly showing nothing for these moves is expected, not a sign something went wrong; `git mv`/`git add` fail with "not under version control" on these paths. If a git operation unexpectedly fails here, run `git check-ignore -v <path>` to confirm the exclusion.

## Naming Convention

`YYYY-MM-DD-NN-slug.md`

- `YYYY-MM-DD-NN` is an **ordering key**, not a creation timestamp.
- `NN` = 2-digit zero-padded per-date sequence; resets to `01` each new date for fresh independent batches.
- `slug` = short kebab-case label.

### Insertion Ordering (Slotting Before Existing Task)

To insert new tasks _before_ existing backlog task `N` without renumbering: reuse that task's full prefix with a sub-index: `…-N-01`, `…-N-02`, …

These sort before `…-N.md` because `-` (0x2D) < `.` (0x2E) in ASCII/C collation. Pins after the last completed task `N-1` and before `N`. Use `LC_COLLATE=C` when listing the directory to get correct sort order.

**Example:** `2026-06-14-15-01-task-name.md` slots before `2026-06-14-15.md`.

## Header (Canonical — 8 Rows + Optional Context)

```
| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| Clean session  | **Yes**                                                       |
| Executor model | **Sonnet (standard)**                                         |
| Repo           | `<repo-name>`, branch `<branch-name>`                         |
| Planning tier  | **T0–T3**                                                     |
| Planning       | ba: <state>, devil: <state> · ddd-architect: <state>          |
| Generation     | **G0**, **G1**, **G2**, …                                     |
| Depends on     | 2026-06-14-13-approve-user-service, 2026-06-14-14-reject-user |
| On completion  | Suggest a commit message. **Do NOT commit. Do NOT move this file.** |
```

**Planning tier:** Levels T0–T3 per the tiered planning ladder in `rules/workflow.md`. Example: **T2** (executable rules = seam by own triage rule).

**Planning row — role states:** Each role is `done` if the source session produced that artifact (ba = acceptance criteria + scope + API contract; devil = challenged assumptions on record; ddd-architect = placement/boundary decision), `required` if the dispatcher marked it mandatory for this tier, or `skipped` if intentionally omitted per the tiered ladder (e.g., T1 tasks skip ba entirely). Example: `ba: skipped (T1 — orchestrator wrote AC), devil: done (grill 2026-07-07) · ddd-architect: required`.

**Generation:** Tracks task derivation lineage. **G0** = feature work; **G1** = tasks emitted from that work's quality-gate "Emit as Task" output; **G2** = tasks emitted from a G1 task's gate; etc.

**Security caveat:** Security-critical tasks add `— 🔒 security-scanner required` after the executor tier, and `⚠️ Owner security review pass.` to the On-completion row.

**Optional `Context` row:** Points to a shared diagnosis doc when the task is part of a batch.

### Executor obey-the-stamp rule

The executor dispatches **only the roles marked `required`** in the Planning row. It does not re-judge or re-triage planning decisions that were already made at authoring time — the decision is recorded where full context existed. The clean-session executor is deliberately context-poor and worst-placed to re-judge planning decisions.

### Seam-vs-stamp contradiction guard

If the task body visibly touches a seam (new endpoint, migration, or shared/cross-layer contract) but the stamped `Planning tier` says T0 or T1, the executor must **STOP and flag this to the user/orchestrator** — it must NOT silently proceed with the stale tier, and must NOT silently re-triage on its own authority. This guards against authoring-time miscalculation.

### Continuation-task template

When a task exhausts the quality-gate restart budget (2 full cycles with open `## Fix Now` items), the orchestrator invokes the `handoff` skill to produce a **continuation task** instead of a bare stop. The continuation task uses this template:

```
| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| Clean session  | **Yes**                                      |
| Executor model | **Sonnet (standard)**                        |
| Repo           | `<repo-name>`, branch `<branch-name>`        |
| Planning tier  | *inherited from original*                    |
| Planning       | **done**                                     |
| Generation     | *inherited from original*                    |
| Depends on     | `<original-task-filename>` + upstream deps   |
| On completion  | Suggest a commit message. **Do NOT commit. Do NOT move this file.** |
```

**Planning row:** Planning already happened at original authoring; do not re-run ba/devil/ddd-architect roles. All roles are marked `done` (inherited state from the original task).

**Body sections:**

1. `# Task — <original-title> (continuation)`
2. `## Context / Why` — reference the original task and the `handoff` skill
3. `## Open Fix Now items` — copied from the last gate report
4. `## Attempt log` — per-cycle summary: what was tried each restart, why it didn't close the issue
5. `## Current hypotheses` — best-guess root causes and next investigative steps
6. `## Steps` — suggested approach for the fresh session

The `handoff` skill supplies the attempt-log and hypotheses content; this template wraps that content in the canonical task-file header so it lands in `todo/` as a normal backlog task.

## Body Sections (In Order)

1. `# Task — <title>` (H1)
2. `## Context / Why` — references decision IDs if applicable
3. `## Steps` — numbered H3 subsections (`### 1. …`)
4. `## Verification gate` — concrete commands + mandatory quality gate:
   - `tester(verify)` + `reviewer` always — implementation agents co-author tests with the code per the `tdd` skill; `tester` verifies the suite and audits coverage gaps
   - Add `security-scanner` when auth/validation/secrets/HMAC/external-input is touched
5. `## Acceptance criteria` — `- [ ]` checkbox list

## Splitting Rule

One task = one clean session. Split when the task would touch **>3 files**, cross layers/transports, or mix concerns. Chain the parts via `Depends on`. (Mirrors the `CLAUDE.md` ">3 files → split" triage rule.)

### Blast-radius map (seam-touching tasks)

When the foresight gate fires (see rules/workflow.md), the task body must include a `## Blast radius` section listing all files/layers that consume the changed contract and all foreseeable follow-on tasks. This section is the explicit evidence that the task was scoped correctly up front.

### Premise Verification for "Fix This" Tasks

Before implementing a task whose stated premise is "X is broken/unfixed/missing," verify the premise against recent git history. The fix may already be partially or fully landed in an earlier commit, making the real remaining scope narrower than the task text states.

Pattern: run `git log -S<suspected-fix-marker> -- <named-files>` to search for commits that added the suspected fix, or manually review recent changes to the named files to check whether the problem statement is still accurate. This avoids duplicate work and surfaces the actual gaps (e.g., "X is fixed in file A but not yet in file B") so the task scope can be narrowed before execution.

### Parked tasks

A parked task (blocked on an upstream seam decision) must:

1. Open with a `## ⚠️ PARKED — blocked by <dependency>` callout before the Context section.
2. Include the blocking task's full filename in `Depends on`.
3. Not be assigned to an implementation agent until the blocking dependency is in done/.

## Standing Completion Rule

The executing agent does NOT commit and does NOT move the task file — moving it to `done/` is the owner's confirmation step, performed after reviewing and committing. The agent finishes by reporting completion explicitly, in this shape:

> All acceptance criteria met. Suggested commit message: `<one-line message>`. After committing, move this task file to `done/`.

The owner then reviews `git diff`, commits, and moves the file with plain `mv` (`tasks/` is gitignored — never `git mv`).

## Deferred ADRs Go Stale Without an Explicit Closing Step

Docs don't self-maintain: an ADR recorded with a "Deferred"/interim Status doesn't get revisited automatically once the deferred work actually ships. Any task implementing work an ADR recorded as Deferred/interim must carry an acceptance-criterion line to update that ADR's Status as part of the task's own Acceptance criteria — not as a separate follow-up someone might forget. Periodic doc-hygiene audits (grep ADR "Deferred" statuses against `CHANGELOG.md`) are also worth running independently of task-level ACs, since the AC only catches ADRs tied to a tracked task.

## Dependencies

The `Depends on` row cites the **full task filename without extension** (e.g. `2026-06-14-13-approve-user-service`). Never use bare sequence numbers (`12`, `13`) or date-only identifiers without a slug — these become unresolvable once the originating roadmap doc is archived.
