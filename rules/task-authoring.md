# Task Authoring: Backlog Emission

## Overview

Every plan, grill, or grooming session must emit one or more task files into the backlog before the session ends. These files are working artifacts that structure the implementation phase; their durable record lives in commit history, `KNOWLEDGE_INBOX.md`, and `CHANGELOG.md`.

## Routing

- **Phase-dependent tasks** (part of a named rebuild/migration phase) → `docs/<phase>/tasks/todo/` (project-specific; adapt the phase directory name to your project)
- **General / future-phase tasks** → `docs/tasks/todo/` (created lazily on first use)

Both locations are **git-excluded** (private working artifacts). The committed, durable record is: commit history + `KNOWLEDGE_INBOX.md` + `CHANGELOG.md`. The rule file itself is committed; the task files it governs are private.

## Naming Convention

`YYYY-MM-DD-NN-slug.md`

- `YYYY-MM-DD-NN` is an **ordering key**, not a creation timestamp.
- `NN` = 2-digit zero-padded per-date sequence; resets to `01` each new date for fresh independent batches.
- `slug` = short kebab-case label.

### Insertion Ordering (Slotting Before Existing Task)

To insert new tasks _before_ existing backlog task `N` without renumbering: reuse that task's full prefix with a sub-index: `…-N-01`, `…-N-02`, …

These sort before `…-N.md` because `-` (0x2D) < `.` (0x2E) in ASCII/C collation. Pins after the last completed task `N-1` and before `N`. Use `LC_COLLATE=C` when listing the directory to get correct sort order.

**Example:** `2026-06-14-15-01-task-name.md` slots before `2026-06-14-15.md`.

## Header (Canonical — 5 Rows + Optional Context)

```
| Field         | Value                                                          |
| ---           | ---                                                            |
| Clean session | **Yes**                                                        |
| Executor model | **Sonnet (standard)**                                         |
| Repo          | `<repo-name>`, branch `<branch-name>`                          |
| Depends on    | 2026-06-14-13-approve-user-service, 2026-06-14-14-reject-user |
| On completion | Suggest a commit message. **Do NOT commit.**                   |
```

**Security caveat:** Security-critical tasks add `— 🔒 security-scanner required` after the executor tier, and `⚠️ Owner security review pass.` to the On-completion row.

**Optional `Context` row:** Points to a shared diagnosis doc when the task is part of a batch.

## Body Sections (In Order)

1. `# Task — <title>` (H1)
2. `## Context / Why` — references decision IDs if applicable
3. `## Steps` — numbered H3 subsections (`### 1. …`)
4. `## Verification gate` — concrete commands + mandatory quality gate:
   - `tester` + `reviewer` always
   - Add `security-scanner` when auth/validation/secrets/HMAC/external-input is touched
5. `## Acceptance criteria` — `- [ ]` checkbox list

## Splitting Rule

One task = one clean session. Split when the task would touch **>3 files**, cross layers/transports, or mix concerns. Chain the parts via `Depends on`. (Mirrors the `CLAUDE.md` ">3 files → split" triage rule.)

### Blast-radius map (seam-touching tasks)

When the foresight gate fires (see rules/workflow.md), the task body must include a
`## Blast radius` section listing all files/layers that consume the changed contract and all
foreseeable follow-on tasks. This section is the explicit evidence that the task was scoped
correctly up front.

### Parked tasks

A parked task (blocked on an upstream seam decision) must:

1. Open with a `## ⚠️ PARKED — blocked by <dependency>` callout before the Context section.
2. Include the blocking task's full filename in `Depends on`.
3. Not be assigned to an implementation agent until the blocking dependency is in done/.

## Standing Completion Rule

The executing agent suggests a one-line commit message and does NOT commit. The owner reviews `git diff`, commits, and moves the file from `todo/` to `done/`.

## Dependencies

The `Depends on` row cites the **full task filename without extension** (e.g. `2026-06-14-13-approve-user-service`). Never use bare sequence numbers (`12`, `13`) or date-only identifiers without a slug — these become unresolvable once the originating roadmap doc is archived.
