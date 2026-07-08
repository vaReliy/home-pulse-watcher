# Metrics Ledger

Append-only ledger of completed tasks, one table row per task, written during Phase 6 (Knowledge Capture). This is raw data collection, not a dashboard — no aggregation, no analysis, no pruning. A dedicated measurement-design session happens later, once 20–30 real rows exist.

**Hard constraint:** never `@`-reference this file from `CLAUDE.md` or `AGENTS.md` — that would force-load it into every conversation as noise (same constraint that applies to `docs/KNOWLEDGE_INBOX.md`). Reference it only as a plain path in on-demand indexes.

## Column format

Each completed task is one row in the table below.

| Field               | Meaning                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Date`              | ISO date the task completed (`YYYY-MM-DD`)                                                                    |
| `Repo`              | Repo name                                                                                                     |
| `Task`              | Task file slug or short identifier                                                                            |
| `Tier`              | Triage tier at dispatch (`T0`–`T3`)                                                                           |
| `Cycles`            | Number of quality-gate restart cycles consumed (0 if it passed first try)                                     |
| `Fix Now (t/r/s/q)` | `## Fix Now` item counts per gate stage, in order: tester / reviewer / security-scanner / qa (e.g. `1/0/0/2`) |
| `Emitted`           | Count of pre-existing findings routed to `## Emit as Task` (backlog, not blocking)                            |
| `Hardstop`          | `yes`/`no` — whether the 2-cycle hard-stop limit was hit                                                      |
| `Model`             | Model tier used for the implementation agent (`deep`/`standard`/`cheap`)                                      |

## Entries

<!-- Append one row per completed task to the table below. -->

| Date       | Repo               | Task                                              | Tier | Cycles | Fix Now (t/r/s/q) | Emitted | Hardstop | Model    |
| ---------- | ------------------ | ------------------------------------------------- | ---- | ------ | ----------------- | ------- | -------- | -------- |
| 2026-07-07 | home-pulse-watcher | distill-gcs-rename-into-project-context           | T1   | 0      | 0/0/0/0           | 0       | no       | standard |
| 2026-07-07 | home-pulse-watcher | distill-livr-field-stripping-into-validation-rule | T2   | 0      | 0/0/0/0           | 0       | no       | standard |
| 2026-07-08 | home-pulse-watcher | firmware-tls-build-flag                           | T2   | 0      | 0/0/0/0           | 1       | no       | standard |
| 2026-07-08 | home-pulse-watcher | captive-portal-password-hardening                 | T1   | 0      | 0/1/1/0           | 0       | no       | standard |
| 2026-07-08 | home-pulse-watcher | firmware-ota-parser-hardening                     | T1   | 0      | 0/1/0/0           | 1       | no       | standard |
| 2026-07-08 | home-pulse-watcher | repo-findbyids-query-services                     | T2   | 0      | 0/0/0/0           | 0       | no       | standard |
| 2026-07-08 | home-pulse-watcher | telegram-handlers-use-services                    | T2   | 1      | 1/0/0/0           | 2       | no       | standard |
