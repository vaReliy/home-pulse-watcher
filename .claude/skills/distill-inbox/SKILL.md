---
name: distill-inbox
description: >-
  Distills docs/KNOWLEDGE_INBOX.md by categorizing entries into Done (delete),
  Clear-target (inline into the correct rules/doc file), and Uncertain (keep).
  Dispatches a docs-writer agent to perform the writes and clean up the inbox.
  Use when the inbox grows past ~10 entries, after a sprint, or when running
  /distill-inbox to keep the knowledge base tidy.

  Українською: очистити inbox, дистилювати знання, перенести записи до rules,
  прибрати KNOWLEDGE_INBOX, розкласти по місцях.
triggers:
  - distill-inbox
  - distill inbox
  - clean inbox
  - knowledge inbox
---

# Distill Inbox

Reads `docs/KNOWLEDGE_INBOX.md`, categorizes each entry, and delegates writes
to a `docs-writer` agent. The inbox trends toward empty; rules files get richer.

## Step 1 — Read and categorize

Read `docs/KNOWLEDGE_INBOX.md` in full, then sort every entry into one of:

| Bucket               | Criteria                                                                                         | Action                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **A — Done**         | Heading contains `(RESOLVED …)` or `(already applied)`, or entry body says it was fixed/resolved | Delete from inbox — no content to migrate      |
| **B — Clear target** | Has `Belongs in: <exact-file>` (no "guess") pointing to a committed file                         | Inline into that file; delete entry from inbox |
| **C — Uncertain**    | Has `Belongs in (guess):`, lists multiple candidates, or content spans >1 file                   | Keep in inbox untouched                        |

## Step 2 — Route Category B entries

Use this routing map to match "Belongs in:" labels to the split rules structure:

| Label matches                       | Target file                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `rules/architecture.md`             | `rules/architecture.md` — onion/DDD/boundary core                        |
| `rules/architecture-angular.md`     | `rules/architecture-angular.md` — InjectionToken, FE boundaries          |
| `rules/architecture-backend.md`     | `rules/architecture-backend.md` — NestJS DI, MongoDB, auth patterns      |
| `rules/code-style.md`               | `rules/code-style.md` — shared TS conventions                            |
| `rules/code-style-angular.md`       | `rules/code-style-angular.md` — signals, templates, SCSS                 |
| `rules/code-style-backend.md`       | `rules/code-style-backend.md` — pino, LIVR, cookies, InfrastructureError |
| `rules/testing.md`                  | `rules/testing.md` — Vitest patterns, integration test limits            |
| `rules/validation-authorization.md` | `rules/validation-authorization.md` — LIVR rules, JWT claims             |
| `rules/workflow.md`                 | `rules/workflow.md` — pipeline, quality gate, pre-flight                 |
| `PROJECT_CONTEXT`                   | `docs/PROJECT_CONTEXT.md` — domain patterns, infra plumbing              |

If a label says `rules/architecture.md` but the content is clearly NestJS-specific,
route to `rules/architecture-backend.md` and note the reroute in the report.

## Step 3 — Dispatch docs-writer

Dispatch a `docs-writer` agent with:

```
Read docs/KNOWLEDGE_INBOX.md.

For each of the following entries, inline the content into the most relevant
EXISTING section of the target file (do not append a dump at the bottom).
Then delete those entries — and all Category A entries — from the inbox.
Leave Category C entries untouched.

Category A (delete only):
<list each entry heading>

Category B (distill then delete):
TARGET: rules/code-style-angular.md
  - [entry heading + full body]
  ...

TARGET: rules/architecture-backend.md
  - [entry heading + full body]
  ...

[… grouped by target file …]
```

## Step 4 — Report

After docs-writer completes, report:

- **A deleted**: N entries (list headings)
- **B distilled**: N entries → which target files were updated
- **C kept**: N entries (list headings — escalate any that have been in the inbox >2 sprints)
- **Reroutes**: any entry placed in a different file than its "Belongs in:" label said

## Routing map updates

When new rules files are added to the project, update the routing map table in
this SKILL.md to include them. The map is the only Penny-specific content here —
everything else is generic claude-ts distillation logic.
