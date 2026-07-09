# claude-ts (CTS) Divergence Log

Permanent ledger of HPW's intentional or discovered divergences from the claude-ts template — bugs, gaps, or improvements found in a template-inherited file (`AGENTS.md`, `CLAUDE.md`, `rules/**`, `.claude/agents/**`, `.claude/skills/**`). Entries persist until actually ported upstream via `/cts-contribute` or `cts-import-skill`, unlike `docs/KNOWLEDGE_INBOX.md` which trends toward empty.

## Entry format

```markdown
## YYYY-MM-DD — [area] short fact

Divergence: what's different here vs. CTS, and why.
Upstream action: port as-is | port with changes | HPW-only, do not port | undecided.
```

## 2026-07-01 — rules/workflow.md whole-file .ctsignore froze process content

Divergence: `rules/workflow.md` was `.ctsignore`'d wholesale during the 2026-06-12 CTS adoption to strip frontend swimlanes. That silently froze the file at its 2026-06-12 content — two rounds of generic (non-frontend) upstream improvements (Foresight gate, Nx Command Execution Policy, sequential quality gate with severity floor, `docs/CLAUDE_TS_CHANGELOG.md` knowledge-capture routing) never merged in, because a whole-file ignore doesn't distinguish "frontend-specific" from "everyone benefits." Re-merged upstream content on 2026-07-01, re-pruned frontend-only sections.
Upstream action: HPW-only fix (the freeze was a local process gap, not a CTS bug). No port needed, but worth noting in `/cts-update`'s own docs that whole-file `.ctsignore` entries for large, frequently-updated files should be re-diffed periodically rather than treated as "customized forever."

## 2026-07-01 — vitest-testing skill is Vitest-only despite claiming Jest support

Divergence: CTS's `.claude/skills/vitest-testing/SKILL.md` description says "Testing with Vitest (or Jest)" but every code example uses Vitest-only APIs (`vi.fn`, `vi.mock`, `import ... from 'vitest'`) — zero Jest examples. HPW is pure Jest (no Vitest dependency anywhere). Rewrote HPW's local copy to Jest APIs (`jest.fn`, `jest.mock`, no import needed) and added it to `.ctsignore`.
Upstream action: undecided — either (a) make the skill genuinely framework-agnostic (dual examples or a note on the API mapping), or (b) split into `vitest-testing` + `jest-testing`. Not done yet; revisit when contributing back via `/cts-contribute`.

## 2026-07-02 — rules/code-style.md missing a strictNullChecks relational-operator gotcha

Divergence: added a new section, "Do Not Drop `!= null` Guards Before Relational Comparisons", documenting that `strictNullChecks` rejects `>`/`<`/`>=`/`<=` directly on `T | null`/`T | undefined` operands (`TS2531`/`TS2532`) regardless of downstream reuse — discovered while fixing a Telegram battery-voltage display bug, after two incorrect draft attempts assumed JS runtime null-comparison semantics (`null > 0` === `false`) meant the guard was redundant. Verified against real `tsc` output via a `backend-developer` agent before landing the final wording. This is general strict-TS advice, not HPW-specific (no NestJS/Nx/ESP32 content) — a genuine content gap in CTS's `rules/code-style.md`, not a customization.
Upstream action: port as-is via `/cts-contribute` — general TS gotcha applicable to any CTS consumer using `strictNullChecks`.

## 2026-07-09 — rules/workflow.md's Knowledge Capture "What NOT to save" list didn't guard against task-content leakage

Divergence: during Batch C's knowledge capture, a `docs/KNOWLEDGE_INBOX.md` entry was written that restated a parked task's full reasoning inline (a keep-warm-scheduler-vs-device-heartbeat tradeoff), not just a pointer to the task file — the project owner flagged this as unwanted leakage of task-tracking state into a committed doc. `rules/workflow.md`'s existing "What NOT to save" list (ephemeral task details, ephemeral state) didn't explicitly call out this specific failure mode (restating parked/open-decision reasoning specifically, as opposed to generic "task list" details), so it wasn't obviously covered until it happened. Added a bullet clarifying: parked/in-progress task reasoning must not be restated in committed docs — skip logging entirely, or at most a bare one-line path pointer. This is general knowledge-capture hygiene, not HPW-specific.
Upstream action: port as-is via `/cts-contribute` — applicable to any CTS consumer using the Knowledge Inbox pattern.

## 2026-07-09 — rules/workflow.md's Execution Model had no guidance on resuming an agent across an iterative fix-retry loop

Divergence: `rules/workflow.md`'s Execution Model section already documents Claude-Code-specific dispatch mechanics (`Agent` tool, `TeamCreate`, and later a full `SendMessage`/`TeamDelete` Tool API Reference section), but had no guidance on resuming a dispatched agent across a fix-retry loop (a script fails, gets fixed, fails differently, gets fixed again). The orchestrator repeatedly spawned a fresh `Agent` call per iteration instead of resuming the same one via `SendMessage({ to: <agentId> })`, causing real context-drift bugs across iterations (a `.env.example` contradiction and a Secret-Manager-mapping mistake, both from a new agent not seeing earlier fixes to the same files) before the user flagged it. Added a bullet to Execution Model: resume the same agent for iterative same-file fix loops; only quality-gate agents (tester/reviewer/security-scanner/qa) should always get a clean un-primed look, never resumed.
Upstream action: port as-is via `/cts-contribute` — general orchestrator dispatch-efficiency guidance, not HPW-specific.

## 2026-07-07 — rules/task-authoring.md has no batch-execution mechanism despite cost-tier work

Divergence: CTS cost optimizations (model tiers, conditional quality gate, severity floor, T0–T3 planning ladder) all reduce per-task cost, but `rules/task-authoring.md`'s "one task = one clean session" rule still forces a full session + quality-gate cycle per task even when several emitted tasks share files, persona, and gate composition (e.g. three firmware-security tasks all touching `ota.cpp`). HPW introduced a batch pattern locally: an `NN-00-INDEX-*-batches.md` file defining batches with an execution contract (one session per batch, one combined gate over the batch diff, shared 2-cycle restart budget, per-task acceptance criteria still checked), plus a `Context` header row on each member task pointing at the index. First instance: `tmp/tasks/todo/2026-07-07-00-INDEX-audit-batches.md`.
Upstream action: port with changes via `/cts-contribute` — generalize into a "Batch execution" section of `rules/task-authoring.md` after the pattern proves itself on at least one executed batch.
