# Metrics Ledger

Append-only ledger of completed tasks, one line per task, written during Phase 6 (Knowledge Capture). This is raw data collection, not a dashboard — no aggregation, no analysis, no pruning. A dedicated measurement-design session happens later, once 20–30 real rows exist.

**Hard constraint:** never `@`-reference this file from `CLAUDE.md` or `AGENTS.md` — that would force-load it into every conversation as noise (same constraint that applies to `docs/KNOWLEDGE_INBOX.md`). Reference it only as a plain path in on-demand indexes.

## Line format

```
date | repo | task | tier | cycles | fixnow t/r/s/q | emitted | hardstop | model
```

| Field             | Meaning                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `date`            | ISO date the task completed (`YYYY-MM-DD`)                              |
| `repo`            | Repo name                                                                |
| `task`            | Task file slug or short identifier                                       |
| `tier`            | Triage tier at dispatch (`T0`–`T3`)                                      |
| `cycles`          | Number of quality-gate restart cycles consumed (0 if it passed first try)|
| `fixnow t/r/s/q`  | `## Fix Now` item counts per gate stage, in order: tester / reviewer / security-scanner / qa (e.g. `1/0/0/2`) |
| `emitted`         | Count of pre-existing findings routed to `## Emit as Task` (backlog, not blocking) |
| `hardstop`        | `yes`/`no` — whether the 2-cycle hard-stop limit was hit                 |
| `model`           | Model tier used for the implementation agent (`deep`/`standard`/`cheap`) |

## Entries

<!-- Append one line per completed task below this comment. -->
