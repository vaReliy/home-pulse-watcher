---
name: distill-inbox
description: >-
  Distills docs/KNOWLEDGE_INBOX.md by categorizing entries into Done (delete), Clear-target (inline into the correct rules/doc file), and Uncertain (keep). Dispatches a docs-writer agent to perform the writes and clean up the inbox. Use when the inbox grows past ~10 entries, after a sprint, or when running /distill-inbox to keep the knowledge base tidy.
  
  Українською: очистити inbox, дистилювати знання, перенести записи до rules, прибрати KNOWLEDGE_INBOX, розкласти по місцях.


triggers:
  - distill-inbox
  - distill inbox
  - clean inbox
  - knowledge inbox
---

# Distill Inbox

Reads `docs/KNOWLEDGE_INBOX.md`, categorizes each entry, and delegates writes to a `docs-writer` agent. The inbox trends toward empty; rules files get richer.

## Step 1 — Read and categorize

Read `docs/KNOWLEDGE_INBOX.md` in full, then sort every entry into one of:

| Bucket               | Criteria                                                                                         | Action                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **A — Done**         | Heading contains `(RESOLVED …)` or `(already applied)`, or entry body says it was fixed/resolved | Delete from inbox — no content to migrate         |
| **B — Clear target** | Has `Belongs in: <exact-file>` (no "guess") pointing to a committed file                         | Inline into that file; delete entry from inbox    |
| **C — Uncertain**    | Has `Belongs in (guess):`, lists multiple candidates, or content spans >1 file                   | Keep in inbox untouched; compute gate (see below) |

### Step 1a — Compute gate for Category C entries

For each Category C entry, parse its `YYYY-MM-DD` heading date and compute:

- `age_days` = days since that date (using today's date).
- `commits_since` = `git log --since=<that date> --oneline | wc -l` (count of all commits in the repo since the date).

An entry is **stale** (gate fires) when **both** conditions hold:

- `age_days >= 14` (at least 14 days old)
- **AND** `commits_since >= 5` (at least 5 commits in the repo since the note was written)

This combined gate avoids nagging on dormant projects (old note, few commits) while catching notes that would otherwise calcify silently on active repos.

Entries that pass the gate (stale) will be prompted for interactive resolution in Step 1.5. Entries that do not pass (younger than gate, or old but quiet) remain as-is — they will be listed in Step 5's report and left untouched in the inbox.

## Step 1.5 — Resolve stale guess notes

This step runs **only when stale entries exist** (gate fired from Step 1a) **and only on explicit `/distill-inbox` invocation by a human** — skip entirely during automatic Phase-6 distillation.

**How to detect which invocation mode you are in**:

- **Automatic Phase-6 dispatch**: You were spawned as a subagent by the orchestrator carrying a written task description for this specific distill-inbox run. In this case, skip Step 1.5 entirely; proceed to Step 4 and then Step 5 (noting the stale count in the report, but do not prompt).
- **Human invocation**: A human typed `/distill-inbox` (or a variant trigger) directly in the current conversation thread. In this case, stale entries exist; proceed with Step 1.5 below.
- **Ambiguous**: If you cannot determine which applies, default to skip (treat as automatic Phase-6 dispatch) — never call AskUserQuestion when the invocation context is ambiguous.

If this skill was invoked by a human and stale entries exist, interactively prompt the user for each stale entry using `AskUserQuestion`, showing the entry's heading and full body. Offer exactly these four options:

**Option 1: Promote to a concrete target**

- User supplies the real `Belongs in: <exact-file>` value (e.g., `Belongs in: rules/code-style.md`).
- Re-classify the entry internally as Category B.
- Let it flow through the existing Step 2/3/4 distillation pipeline in the same run (the entry will be inlined into the target file and deleted from inbox).

**Option 2: Promote to claude-ts-upstream**

- Behavior depends on which kind of repo this is:
  - **Consumer project** (has `.cts-version` file at repo root): Delete the entry from `docs/KNOWLEDGE_INBOX.md`. Append a properly-formatted entry to `docs/CLAUDE_TS_CHANGELOG.md` (create the file with its standard header if it doesn't exist; format matches how Step 3's existing ledger-obligation logic already writes entries). This closes the loop through `cts-contribute`'s Case C discovery — no new reading logic needed.
  - **Claude-ts template repo itself** (detect via: `cts-payload.txt` present at repo root AND `.cts-version` does NOT exist): There is no upstream past this repo. This option is functionally identical to "Promote to a concrete target" — the user still supplies the target file name, and the entry gets logged in this repo's own `CHANGELOG.md` (not `docs/CLAUDE_TS_CHANGELOG.md`). Skip the `docs/CLAUDE_TS_CHANGELOG.md` staging (that file is consumer-only); instead, follow Step 3's template-inherited ledger obligation by appending the entry to this repo's root `CHANGELOG.md`.

**Option 3: Discard**

- Delete the entry from `docs/KNOWLEDGE_INBOX.md`.
- No migration to any file.

**Option 4: Still uncertain**

- Leave the entry exactly as-is in the inbox — no modification, no snooze marker, no new field added.
- The entry will re-prompt on every future `/distill-inbox` run until one of the other three options is chosen.
- This is deliberate: guarantees a stale entry can never go silently stale again.

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

If a label says `rules/architecture.md` but the content is clearly NestJS-specific, route to `rules/architecture-backend.md` and note the reroute in the report.

## Step 3 — Check CTS-managed ledger obligation

For each Category B target file about to be edited, check whether it is a template-inherited file: under `rules/**`, `.claude/agents/**`, `.claude/skills/**`, or is `CLAUDE.md` or `AGENTS.md`. If the target is template-inherited, the docs-writer dispatch in Step 4 MUST also append a ledger entry in the same pass — distilling content into a template-inherited file without ledgering it makes the change invisible to `/cts-contribute`. Which ledger depends on which kind of repo this is (same detection as Step 1.5 Option 2):

- **Consumer project** (has `.cts-version` file at repo root): append to `docs/CLAUDE_TS_CHANGELOG.md` (format per that file's own header).
- **Claude-ts template repo itself** (detect via: `cts-payload.txt` present at repo root AND `.cts-version` does NOT exist): there is no upstream past this repo — append to this repo's own root `CHANGELOG.md` instead (not `docs/CLAUDE_TS_CHANGELOG.md`, as that file is consumer-only).

Files outside these paths (project-local docs, infrastructure) need no ledger entry.

## Step 4 — Dispatch docs-writer

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

When inlining, follow these constraints to avoid fabricating broken examples or embellishing causal claims:

- **Code examples**: Lift real code verbatim from the file or commit the inbox entry names (cite the path). Include no code at all if you cannot point to a real source — never invent illustrative snippets, as fabricated examples are where broken shell/pseudo-facts creep in.
- **Causal claims**: Preserve the entry's stated mechanisms exactly. Do not upgrade, generalize, or reword explanations.

## Step 4.5 — Verify against sources

After docs-writer completes, re-read each distilled section side-by-side with the original inbox entry text. Check:

1. Any code block traces to real code in the repo/commit history (cites a file path, doesn't invent).
2. No semantic drift in causal claims — verify the distilled wording states the same mechanism, not a generalization.
3. The target file's surrounding section still reads coherently and isn't corrupted by the splice (check for orphaned bullets, misplaced headings, or mangled lists).

Any failure → fix before reporting.

## Step 5 — Report

After docs-writer completes (or if skipping Step 1.5 during automatic Phase-6 dispatch), report:

- **A deleted**: N entries (list headings)
- **B distilled**: N entries → which target files were updated
- **Guess notes resolved this run** (Step 1.5): N entries, broken down by:
  - Promoted to concrete target: N
  - Promoted to claude-ts-upstream: N
  - Discarded: N
- **Guess notes still uncertain** (Step 1.5): N entries — gate fired but unresolved (either the user chose to keep waiting in an interactive run, or this was an automatic run where Step 1.5 was skipped per the invocation-detection logic above). Will surface for resolution on the next human-invoked run.
- **C kept**: N entries (list headings — Category C entries where the stale gate did not fire; excludes all gate-fired entries whether promoted, discarded, or still uncertain; escalate any that have been in the inbox >2 sprints)
- **Reroutes**: any entry placed in a different file than its "Belongs in:" label said

## Routing map updates

When new rules files are added to the project, update the routing map table in this SKILL.md to include them. The map is the only project-specific content here — everything else is generic claude-ts distillation logic.
