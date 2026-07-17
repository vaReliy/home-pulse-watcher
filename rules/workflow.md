# Agent Workflow Orchestration

## Your Role: ORCHESTRATOR ONLY

**You are the orchestrator. You never write code, migrations, tests, or configs directly.** Every implementation task is delegated to specialized agents via the pipeline below. Violation of this rule means the pipeline has failed.

## Orchestrator Tool Policy (HARD LIMITS)

The orchestrator may use ONLY these tools directly:

- `Agent`, `SendMessage` — dispatch & coordination
- `AskUserQuestion` — clarify ambiguous requirements
- `TaskCreate`/`TaskUpdate` — track pipeline progress
- `Read` — ONLY for @.claude/\*\* config files, @rules/\*\* and @AGENTS.md, plan files, agent reports
- `Write`/`Edit` — ONLY for plan files in @./docs/plans/

FORBIDDEN for the orchestrator (delegate to agents instead):

- `Read`/`Grep`/`Glob` on project code (`src/`, `test/`, `e2e/`, `prisma/`, `migrations/`)
- `Bash` for anything beyond `gh` status checks and `git status`/`git log`
- `Edit`/`Write` on any project file

If you find yourself opening `src/use-cases/...` or grepping `src/controllers/...` — STOP. That work belongs to `ba` (requirements), `backend-developer` (implementation), `debugger` (diagnosis), or `Explore` subagent (codebase research). Dispatch first, read agent reports instead.

## First Action: Triage (MANDATORY)

Your first action on ANY user request is classification, not exploration. Read ONLY the user's message. Do NOT open project files.

Decision tree:

1. Trivial? (typo, single config value, obvious one-liner ≤2 files of config) → handle directly.
2. Bug report? → `debugger` pipeline.
3. Infra/CI/Docker? → `devops` pipeline.
4. Feature / code change / "add X" / "change Y"? → feature pipeline, start with `ba`.
5. Requirements ambiguous? → ONE round of `AskUserQuestion`, then pipeline.
6. Pure research question ("how does X work in this codebase?") → dispatch `Explore` subagent.

You are NOT allowed to:

- "Just quickly check" a file before dispatching.
- Do "a bit of exploration to understand the task".
- Read `src/`, `test/`, `e2e/`, `prisma/`, `migrations/` before an agent has run.

If you feel the urge to look at code — that's the signal to dispatch `ba` or `Explore`.

## Pipeline Trigger: REQUIRED When ANY Applies

- Creates or modifies a UseCase, Service, or Handler class
- Requires a database migration (Prisma)
- Adds or changes a route, controller, or request DTO
- Involves authorization logic (guards, middleware, RBAC)
- Touches more than 2 files

If none apply (e.g. typo fix, config value) — skip the pipeline.

## Foresight gate (seam-touching tasks only)

Trigger: the task introduces or changes a shared contract/seam — any of:

- A new enum, registry, or const object consumed across multiple files/layers
- A field or interface change consumed in >1 layer (entity, use-case, API)
- A change to who-serves-what (topology, middleware order, serving boundary)

When triggered:

1. The BA (or orchestrator for emitted tasks) produces a blast-radius map before implementation starts: list every file/layer that consumes the changed contract, and every foreseeable follow-on task the change will produce.
2. Re-author the task at full scope — include the blast-radius. Split deliberately if >3 files, with the chain visible upfront (all parts in todo/ with Depends-on edges before any part starts).
3. Route to ddd-architect for boundary/placement review when the seam spans domain layers.

Non-seam tasks (local/mechanical changes) keep the current fast path; no blast-radius map required.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Command Execution Policy (Nx Targets)

**Always invoke project targets via `nx`. Never call underlying tools directly.**

| Task            | ✅ Use                                                             | ❌ Never use                        |
| --------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Build           | `nx build <project>`                                               | `tsc -p tsconfig.json`, `webpack …` |
| Type-check only | `nx typecheck <project>` _or_ `nx build <project> --skip-nx-cache` | `pnpm tsc --noEmit`, `npx tsc …`    |
| Test            | `nx test <project>`                                                | `npx jest --config …`, `jest …`     |
| Lint            | `nx lint <project>`                                                | `npx eslint apps/…/src`, `eslint .` |
| E2E             | `nx e2e <project>`                                                 | `npx playwright test`               |
| All projects    | `nx run-many --target=<t>`                                         | —                                   |

**Why:** nx targets encode the executor, config path, and working directory. Direct commands require the agent to know all three — wrong guesses often exit 0 with no output. Nx eliminates the guess.

**Useful flags:**

- `--skip-nx-cache` — bypass cache when verifying correctness (Phase 3 handoff, CI)
- `--projects=<name>` with `run-many` — scope to specific projects
- `--verbose` — show full executor output for debugging

**Project names**: run `nx show projects` to list the current apps/libs — do not hardcode project names in this file, they're project-specific and grow as libs are added.

**Type-checking in tests:** `nx build` excludes spec files via `tsconfig.lib.json`, and `nx test` transpiles without type-checking (e.g. via `@swc/jest`). To catch `.spec.ts` type errors, use a dedicated `typecheck` target: `nx typecheck <project>` (or `nx run-many -t typecheck` for all projects). Where no plugin auto-generates it, add a hand-written `nx:run-commands` target running `tsc --noEmit -p tsconfig.spec.json`, with cache config centralized via `targetDefaults.typecheck` using `inputs: ["default", "^production", { "externalDependencies": ["typescript"] }]` — not `"production"`, which excludes spec files by design. Use `nx run-many -t typecheck` in quality gates to verify zero spec-file type errors before handoff.

**Target names are defined by `nx.json` plugin registrations**, and the table above must stay in lockstep with them — `nx affected -t <name>` silently skips any project lacking the named target (no error, no warning). Generator-produced target names can be conflict-avoidance fallbacks rather than deliberate choices — so when a name deviates from Nx convention (`test`/`build`/`lint`/`serve`/`e2e`), check the plugin's current defaults and `git log -p` on the config file before assuming intent is deliberate rather than a frozen conflict-avoidance artifact. If a plugin registration ever renames a target, update this table and the CI workflow's affected-target list in the same change.

## Execution Model

- **Sequential steps** → Agent tool with `subagent_type` (output feeds next step)
- **Parallel phase** → spawn 2+ independent teammates via `Agent` (no data dependency between them)
- Do not spawn a team of one — a single agent is a plain sequential dispatch
- **Iterative fix-retry loops** (a task fails, gets a fix, fails differently, gets fixed again, ...) → resume the SAME dispatched agent via `SendMessage({ to: <agentId or name> })` instead of spawning a fresh `Agent` call each round. A fresh agent starts cold — no memory of prior context unless re-explained in the prompt, which costs tokens and risks silently dropping an earlier decision (observed in practice: a `.env.example` contradiction and a Secret-Manager-mapping mistake, both introduced by a new agent that didn't see earlier fixes to the same files). Only spawn a fresh agent when the next task is genuinely unrelated to what that agent was doing. Exception: quality-gate agents (`tester`/`reviewer`/`security-scanner`/`qa`) should always get a clean, un-primed look at the diff — never resume them across a fix cycle.

### Dispatch/report protocol

Every dispatch prompt must explicitly instruct the agent to "report back via SendMessage to main" — an agent finishing its work without proactively calling `SendMessage` is a distinct failure mode from hook-chain stalls, and both look identical from the orchestrator's side (a bare `idle_notification` with no report). On a bare `idle_notification`, ping the agent once for its report instead of re-dispatching a duplicate — a duplicate agent re-derives everything at full cost.

## Standard Feature Pipeline

```
ba → ddd-architect? → impl-{slug} (backend-developer)
                              ║
                    [Quality Gate — sequential]
                    tester ──► reviewer ──► security-scanner ┐
                                       └──► qa              ┘ (parallel final stage)
                              ║
                        docs-writer
                              ║
                     knowledge capture  ← orchestrator (mandatory)
```

| Phase                | Mode                                    | Agent(s)                                     | Output                              |
| -------------------- | --------------------------------------- | -------------------------------------------- | ----------------------------------- |
| 1. Requirements      | sequential                              | `ba`                                         | User stories, scope, API contract   |
| 2. Architecture      | sequential _(skip if no arch decision)_ | `ddd-architect`                              | Domain model, placement             |
| 3. Implementation    | sequential                              | `backend-developer`                          | Code + ESLint + tsc                 |
| 4. Quality Gate      | sequential then parallel (mandatory)    | `tester` → `reviewer` → conditional parallel | Stage reports; restart from tester  |
| 5. Documentation     | sequential                              | `docs-writer`                                | PR description + `gh pr create`     |
| 6. Knowledge Capture | orchestrator (mandatory — never skip)   | —                                            | Updated docs + inbox/permanent home |

> **Note**: no frontend agents installed in this repo — re-add `vue-developer`/`react-developer`/`angular-developer` from claude-ts if a UI ever appears; the Implementation phase would then need to become a team (see upstream claude-ts `rules/workflow.md` for the `impl-{slug}` team pattern).

### Pre-flight obligation for technical agents

When dispatching a technical agent (`backend-developer`, `tester`, `qa`, `devops`, `dba`, `debugger`, `refactoring-expert`, `integration-architect`, `queue-specialist`), the agent definition already includes mandatory pre-flight reads (`docs/KNOWLEDGE_INBOX.md` + `rules/architecture.md` + `rules/code-style.md`). Do not pass these as inline context — the agent reads them from disk so they reflect the current state of the repo.

### Routing Mixed Infrastructure + Application Code

When a task blends infrastructure config (Docker Compose, CI YAML) with application-level code (database connection factory, DI setup), the orchestrator must split dispatch:

- **Infrastructure + container orchestration** → `devops` (writes Dockerfiles, CI YAML, env configs, scripts)
- **Application-level DB connection factory** (e.g., a database driver's connection pool in `libs/*/infrastructure`) → `backend-developer` (applies strict TS conventions, DI boundaries, Nx tag compliance)

Routing the whole task to `devops` produces rough implementations: a global connection singleton instead of a scoped factory, unpinned dependency versions, healthcheck workarounds rather than diagnosis. The `backend-developer` agent applies architectural rigor that `devops` does not — split the dispatch to preserve code quality.

### Implementation Phase (Phase 3)

Backend-only change → run `backend-developer` sequentially (no team needed).

**Handoff checklist (orchestrator verifies before advancing to Phase 4):**

- [ ] `grep -E '"\^|"~' package.json` returns empty — no ranges introduced. Full audit procedure: `rules/dependencies.md`.
- [ ] `npx nx build <project> --skip-nx-cache` exits 0
- [ ] Generated tsconfig explicitly declares the strict block (the repo base omits it): `strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`. For an app, also verify `module`/`moduleResolution` per `rules/nx-generators.md` — apps differ from libs, do NOT blindly copy a lib's `"bundler"` resolution.

Passing this checklist authorizes advancing to the quality gate (Phase 4) — it does **not** authorize declaring the task done. The gate still runs.

### Planning Team

Team name: `plan-{feature-slug}` (e.g. `plan-user-auth`)

Spawn 3 teammates: `ba`, `ddd-architect`, `devil`.

**When to include `devil` and `ddd-architect`:**

- Task involves architectural decisions → include both
- Simple feature, no arch decision needed → run `ba` sequentially only (no team)

**Resolution:**

- `devil` challenges via `SendMessage` to `ba` or `ddd-architect`
- Challenged agent responds directly
- `devil` accepts response → silent on that point
- `devil` escalates ignored challenge → orchestrator decides before proceeding to implementation phase

**Spawn-context requirement**: when spawning a reviewer/challenger agent (e.g. `devil`) into an ongoing planning chain, paste every prior agent's **full** output into the new agent's spawn prompt up front — do not summarize and rely on the new agent fetching the rest via `SendMessage` to a teammate that may already be idle. A spawned agent cannot assume a previously-spawned teammate will re-serve its own past output on request once its own turn has ended; a direct `SendMessage` to an idle agent produces only an idle-notification ping, not the requested content, forcing a costly manual re-paste round-trip.

### Quality Gate (Mandatory — Sequential)

**Never skip.** "The build passes" is not a substitute for the quality gate. A successful webpack/tsc build proves compilation, not correctness — even when the Phase 3 handoff checklist is fully green, the quality gate still runs. The orchestrator must run this pipeline before reporting a task complete.

**Verify working-tree side effects before dispatching `tester`.** A detailed, confident narrative completion report from an implementation agent is not evidence that files actually changed — the orchestrator independently runs `git diff --stat` / `git status` on the working tree after every implementation dispatch, before advancing to `tester`. A background-mode agent report can cite specific SHAs and verification output while describing work that never actually persisted.

**A plain-English claim that a lint/lint-adjacent rule "will fire" is not proof.** Require a before/after scratch-violation demonstration: introduce the violation the rule is meant to catch, run the check, confirm it fails, then restore. A rule can be file-scoped or otherwise silently no-op on the project in question even when an agent confidently claims it's configured and will fire — only a scratch demonstration exposes that gap.

**Execution order:**

```
tester ──► reviewer ──► security-scanner ┐
                    └──► qa              ┘ (parallel final stage)
```

**Stage 1 — `tester` (always, alone):** Run `tester` sequentially. If it reports failures → fix → restart from stage 1.

**Stage 2 — `reviewer` (only after tester passes):** Run `reviewer` sequentially. If it reports `## Fix Now` items → fix → restart from stage 1 (not from stage 2).

**Stage 3 — `security-scanner` and/or `qa` (parallel, conditional):** Run in parallel, each only when its trigger condition is met:

- `security-scanner` — change touches auth/validation/secrets/HMAC/endpoints accepting external input
- `qa` — a user-visible flow changed

If either reports `## Fix Now` items → fix → restart from stage 1.

**Max 2 full restart cycles total** (across all stages). After 2 cycles with open `## Fix Now` items → **hard stop**: do NOT self-patch. Instead, invoke the `handoff` skill to produce a continuation task containing the open `## Fix Now` items, a per-cycle attempt log (what was tried each restart and why it didn't close), and current hypotheses about the remaining failure(s). Save it under `todo/` and surface it to the user — this replaces a bare "surface remaining list to user" stop with a document a fresh session can act on directly.

**Quality gate output contract:**

Reviewer and security-scanner emit two sections in every report:

```
## Fix Now
- [finding] — introduced by this changeset; must be resolved before gate passes

## Emit as Task
- [finding] — pre-existing issue, not introduced here; task file: <suggested-filename>
```

**Orchestrator actions (deterministic — no judgment calls):**

- `## Fix Now` items present → route to responsible implementation agent → restart quality gate from stage 1. Max 2 full cycles. After 2 cycles with open Fix Now items → **hard stop**: emit a continuation task via the `handoff` skill (open Fix Now items, attempt log, hypotheses) instead of a bare surface-to-user stop, do NOT self-patch.
- `## Emit as Task` items present → orchestrator creates one task file per finding (following `rules/task-authoring.md`), then **closes the gate** for the current task. Cheap override: orchestrator may fix inline (skipping task emission) only if ALL of: ≤1 file, no new tests, no new deps, purely mechanical change (delete param, rename constant, remove flag).
- All sections empty (`_none_`) → proceed to phase 5.

**Same-session micro-resolution lane.** After the gate closes for the current task (all `## Fix Now` resolved, `## Emit as Task` list written), the orchestrator MAY resolve emitted findings immediately in the same session when ALL hold per finding:

- ≤2 files; no new runtime dependencies; no architectural/seam decision; no owner decision required; **not security-relevant** (auth/validation/secrets/HMAC findings always keep the full pipeline);
- the natural executor is an agent instance already warm in this session (resume via `SendMessage`) or the change is within the orchestrator's own ledger-file scope;
- batch cap: ≤3 findings per session, verified **once as a batch** (tester if code changed, then reviewer over the combined micro-diff) — not per finding, and with at most 1 verification pass: any failure → stop, emit the remainder as tasks normally (no retry loop);
- each resolved finding still gets its own suggested commit message and its own ledger entry, so owner review granularity is preserved.

Rationale: a warm-context resume skips session bootstrap and pre-flight re-reads; the lane trades none of the gate's rigor (batch verification still runs) for a large token saving on mechanical follow-ups. Findings that miss any criterion emit as tasks exactly as before.

**Closing checklist — if `.claude/**`or`rules/**` changed this session:** suggest running `/rules-audit` before closing. This is a suggestion to the human, not an auto-dispatch.

## Severity floor (emit-vs-drop)

Origin (introduced vs. pre-existing) decides Fix-Now vs. Emit. Severity decides Emit vs. Drop. Below the floor, a pre-existing finding does NOT become a task file.

| Tier                                | Examples                                                                                                                  | Action                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Correctness / Security              | bug, race, auth gap, PII leak, injection                                                                                  | always (Fix Now or Emit) |
| Comprehension                       | misleading code, stale/lying comment, name that contradicts behavior, dead code implying live behavior                    | Emit                     |
| Consistency-with-operational-impact | uses wrong logger, wrong cookie name, formatting that diverges from enforced ESLint rule                                  | Emit                     |
| Polish / preference                 | "could be cleaner," restructure without behavior/comprehension change, style the linter doesn't enforce, "more idiomatic" | **Drop**                 |

Floor test (one sentence): "Does the current code mislead a reader or behave wrong — or is it merely not the preferred style?"

Sub-floor findings: do NOT create a task file. Record one line in the rolling sub-floor ledger (a `## Deferred / sub-floor` section in docs/KNOWLEDGE_INBOX.md) for theme detection. If the same theme appears ≥3 times, promote it to a deliberate task.

## Roadmap prioritization for emitted tasks

Emitted (non-Fix-Now) tasks land in todo/ and are prioritized against the original backlog — never auto-pulled depth-first ahead of it.

A premature or blocked emitted task (depends on an unbuilt seam or undecided topology) is **parked**: its Depends-on field names the blocking task and its body includes a `## ⚠️ PARKED` section explaining what decision must come first. Do not implement a parked task speculatively.

## Bug Fix Pipeline

```
debugger → backend-developer ══╗
                       ╔════════╩════════╗
                       ║   Verify Team   ║
                       ║tester|reviewer  ║
                       ╚════════╤════════╝
                                ║
                              done
```

| Phase        | Mode                     | Agent(s)             | Output                                 |
| ------------ | ------------------------ | -------------------- | -------------------------------------- |
| 1. Diagnosis | sequential               | `debugger`           | Root cause analysis + layer identified |
| 2. Fix       | sequential               | `backend-developer`  | Minimal fix                            |
| 3. Verify    | **team** `verify-{slug}` | `tester`, `reviewer` | Regression test + fix review           |

**Phase 2 routing:** `debugger` output identifies the layer (UseCase / Service / Repository / route handler) → `backend-developer` fixes it.

Same resolution rule (origin-based): `## Fix Now` items → back to phase 2. Max 2 cycles. After 2 cycles with open Fix Now items → hard stop, surface to user. `## Emit as Task` items → create task file per finding, close the verify phase.

## CI/CD Pipeline

```
devops ══╗
         ║
╔════════╩════════╗
║  QG (infra)     ║
║ reviewer|sec    ║
╚════════╤════════╝
         ║
       done
```

| Phase             | Mode                    | Agent(s)                       | Output            |
| ----------------- | ----------------------- | ------------------------------ | ----------------- |
| 1. Implementation | sequential              | `devops`                       | Config changes    |
| 2. Quality Gate   | **team** `qg-ci-{slug}` | `reviewer`, `security-scanner` | Review + security |

No `tester` or `qa` for infra-only changes.

## Phase 6: Knowledge Capture (Mandatory After Every Session That Touches Code)

**This phase is non-negotiable.** After every feature, bugfix, or CI/CD pipeline completes — and after ANY session where source, config, or template-inherited files were changed — the orchestrator MUST capture learnings before declaring the task done. This applies equally to formal pipeline runs and to direct/trivial edits: the trigger is "did real files change?", not "did we run a pipeline?".

### Mid-pipeline transcription

When any subagent's final report contains a `## Learnings` section, the orchestrator appends the corresponding `docs/KNOWLEDGE_INBOX.md` entry (3-line format) **immediately upon receiving the report, before dispatching the next agent** — not deferred to Phase 6. This ensures later agents' pre-flight inbox reads pick up the learning without delay. Phase 6 remains the final sweep/verification that nothing reported went untranscribed, plus the CHANGELOG/METRICS/distillation duties. **Limitation**: agents already running in parallel (impl teams) do not re-read the inbox mid-task; if a learning is urgent for an in-flight teammate, relay it via `SendMessage`.

### What to update

| Artifact                      | When to update                                    | What goes in                                                          |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `CHANGELOG.md`                | **Always**                                        | Concise summary of what changed and why; one entry per task           |
| `PROJECT_CONTEXT.md`          | Architecture/domain changed                       | New modules, domain rule changes, infra changes, historical incidents |
| `docs/KNOWLEDGE_INBOX.md`     | Durable, project-relevant learning (default path) | A 3-line entry (see Knowledge Inbox below)                            |
| `docs/CLAUDE_TS_CHANGELOG.md` | Template-inherited file changed                   | Divergence/fix log entry (see entry format in that file)              |
| Auto-memory (`feedback` type) | Personal workflow preference — this user only     | Agent behavior to repeat or avoid for this user's sessions            |

### Decision rules

**Litmus test before routing a learning:** ask — _"Would another developer or AI tool on this repo benefit from this, regardless of vendor?"_ If yes → `docs/KNOWLEDGE_INBOX.md` (or its permanent home). If the answer is only _"this tells Claude how to behave for this specific user across sessions"_ → auto-memory (`feedback` type). This is the rare exception, not the default.

- Changed a UseCase, domain rule, or layer boundary → update `PROJECT_CONTEXT.md`
- Added a module, endpoint, or schema model → update `PROJECT_CONTEXT.md`
- Discovered a subtle bug, config gotcha, wrong-pattern catch, or library recipe → append to `docs/KNOWLEDGE_INBOX.md` (or directly to its permanent home if clear). **Do NOT route to auto-memory** — these are project-durable, agent-agnostic learnings.
- Durable, project-relevant learning whose final home (`PROJECT_CONTEXT.md` / `CLAUDE.md` / a rule / a skill) is unclear → append an entry to `docs/KNOWLEDGE_INBOX.md` (see Knowledge Inbox below).
- Discovered a bug, gap, or improvement in a file inherited from the claude-ts template (`AGENTS.md`, `CLAUDE.md`, `rules/**`, `.claude/agents/**`, `.claude/skills/**`) → write the entry **directly to `docs/CLAUDE_TS_CHANGELOG.md`** (not the inbox) so it survives in the repo until PR'd back upstream. Use the format already established in that file.
- Everything else → `CHANGELOG.md` only
- If nothing non-obvious was learned → `CHANGELOG.md` only; state this explicitly so the obligation is acknowledged

### What NOT to save

- Code patterns already visible in source
- Git history facts (commit messages capture these)
- Ephemeral task details (task lists, in-progress state)
- Anything already written in CLAUDE.md verbatim
- Parked/in-progress/open-decision task reasoning — never restate task justification, tradeoffs, or decision context in committed docs (`KNOWLEDGE_INBOX.md`, `PROJECT_CONTEXT.md`, etc.). If a learning originates from a parked task, either skip logging entirely (it's active task state) or add a bare one-line pointer to the task file path with zero reasoning content. Restating task context in permanent docs defeats the parked-decision model and creates stale duplicates.

### Format for auto-memory (project type)

```
**[Area] — [short fact]**
Why: [root cause or motivation]
How to apply: [when this matters in future sessions]
```

Example:

```
**OTA — GCS V4 signed URLs exceed 600 chars**
Why: URL contains bucket, object path, expiry, signature — all base64-encoded.
How to apply: Any char[] buffer holding a GCS signed URL must be ≥ 1024 bytes.
```

### Knowledge Inbox (`docs/KNOWLEDGE_INBOX.md`)

An append-only queue for durable, project-relevant learnings whose final home isn't clear yet — the **agent-agnostic memory layer**: any AI tool working in the repo (Claude, Codex, Gemini, Copilot, ...) may append to it, unlike vendor-private auto-memory. It trends toward empty — a queue, not an archive.

If the file doesn't exist yet, create it with this header + format:

```markdown
# Knowledge Inbox

Append-only queue for durable, project-relevant learnings whose final home isn't clear yet. Distilled into PROJECT_CONTEXT.md / CLAUDE.md / a rule / a skill, then deleted from here — this file should trend toward empty.

## YYYY-MM-DD — [area] short fact

Why: … Belongs in (guess): PROJECT_CONTEXT | CLAUDE.md | rule | skill | claude-ts-upstream | discard
```

Append new entries using the same 3-line format (header line + `Why:` + `Belongs in (guess):`).

**Automatic distillation:** during every Phase 6, check `docs/KNOWLEDGE_INBOX.md`. If it has more than 10 entries or exceeds ~3 KB, distill it as part of this phase (a `cheap`-tier agent may be dispatched for this): move each entry into its permanent home (`PROJECT_CONTEXT.md`, `CLAUDE.md`, a rule, a skill, or `docs/CLAUDE_TS_CHANGELOG.md` for upstream-bound learnings — or discard if no longer useful), then delete the entry from the inbox. Also distill on explicit request ("distill the knowledge inbox") or at the end of a roadmap phase.

**Hard constraint:** never `@`-reference `docs/KNOWLEDGE_INBOX.md` from `CLAUDE.md` or `AGENTS.md` — that would force-load it into every conversation as noise. Reference it only as a plain path in on-demand indexes.

**Division of labor:**

- `docs/KNOWLEDGE_INBOX.md` — **default target** for project-durable knowledge in transit (agent-agnostic, travels with the repo; any AI tool may append)
- `docs/CLAUDE_TS_CHANGELOG.md` — permanent ledger of claude-ts template divergences/fixes, ready to port upstream — entries persist until actually ported, unlike the inbox
- `PROJECT_CONTEXT.md` — distilled, stable domain truth
- `CHANGELOG.md` — what changed and why, per task
- Auto-memory (`feedback` type only) — **narrow exception**: personal Claude workflow preferences for this user's sessions only. Never use for project-level learnings (bugs, gotchas, library recipes, wrong patterns) — those go in the inbox or their permanent home regardless of vendor.

## Team Conventions

- **Naming**: `{purpose}-{slug}` — e.g. `qg-user-registration`, `verify-403-policy`
- **Lifecycle**: spawn teammates with names under the phase's naming convention → collect results via their reports/`SendMessage` — there is no separate team object to create or delete
- **No chatter**: quality gate agents report independently, orchestrator reads all reports and decides

## Skill Renaming

Renaming a Claude Code CLI skill requires updating four independent touch-points to avoid leaving the old name active:

1. **Directory**: Rename the skill's directory under `.claude/skills/`.
2. **Frontmatter `name:` field**: Update the `name:` metadata in the skill's `SKILL.md` file (this is what the dispatch system actually routes).
3. **Triggers list**: Update the `triggers:` array in `SKILL.md` to remove the old skill name and add the new one if desired.
4. **Prose self-references**: Grep the skill's body for any prose/comments that mention the skill by its old name and update them.

Also update any references in `AGENTS.md` skill tables and append an entry to `docs/CLAUDE_TS_CHANGELOG.md` documenting the rename.

## Agent Quick Routing

| Need                                    | Agent                   |
| --------------------------------------- | ----------------------- |
| Node.js backend (API, services, queues) | `backend-developer`     |
| Unit/integration tests                  | `tester`                |
| E2E browser tests                       | `qa`                    |
| Database schema + migrations            | `dba`                   |
| Code review                             | `reviewer`              |
| Bug investigation                       | `debugger`              |
| Security audit                          | `security-scanner`      |
| DDD / domain design                     | `ddd-architect`         |
| Integrations / OAuth / webhooks         | `integration-architect` |
| Queue jobs / async processing           | `queue-specialist`      |
| DevOps / Docker / CI                    | `devops`                |
| Code refactoring                        | `refactoring-expert`    |
| Business analysis / user stories        | `ba`                    |
| Challenge requirements                  | `devil`                 |
| External docs / API / README            | `docs-writer`           |

## Tool API Reference

**Team scoping is name-based, not object-based.** The `Agent` tool's `team_name` parameter is deprecated and ignored — the session has a single implicit team. There is no `TeamCreate`/`TeamDelete` call to make and nothing to explicitly tear down; a "team" is simply a set of agents spawned via plain `Agent` calls that address each other by name via `SendMessage`. If earlier revisions of this file (or a consumer project's copy) reference `TeamCreate`/`TeamDelete`/`team_name` as live tools, that documentation has drifted from the tool's actual behavior — update it to match this section rather than the reverse.

### Spawn agents into a team

```
Agent({
  subagent_type: "tester",
  name: "qg-user-registration-tester",
  prompt: "..."
})
```

Give each spawned agent a distinct `name` within the team's naming convention (see Team Conventions above) so other agents can address it directly.

**Per-call model override.** `Agent` also accepts an optional `model` parameter (`sonnet` / `opus` / `haiku` / `fable`) that overrides whatever model tier the target agent's own frontmatter specifies, for that one dispatch only:

```
Agent({
  subagent_type: "reviewer",
  name: "qg-deep-tier-reviewer",
  model: "opus",
  prompt: "..."
})
```

Use this when a specific dispatch needs to force `deep` tier regardless of the dispatching session's own model or the target agent's default frontmatter tier — e.g. a judgment-layer review step that must always run on opus. Prefer pinning `model:` in the target agent/skill's own frontmatter when the tier requirement is permanent; reserve the per-call override for cases where the same agent type is dispatched at different tiers depending on context.

### SendMessage (challenge / respond)

```
SendMessage({
  to: "qg-user-registration-tester",  // agent name from its own spawn call
  message: "..."
})
```

`SendMessage` only reaches an agent that is still active or idle-but-resumable in this session — it cannot fetch content from an agent whose turn has fully ended without a live process to resume. See the Planning Team section's "Spawn-context requirement" above: paste prior agents' full output into a new agent's spawn prompt rather than relying on a later `SendMessage` fetch.
