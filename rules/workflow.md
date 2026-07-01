# Agent Workflow Orchestration

## Your Role: ORCHESTRATOR ONLY

**You are the orchestrator. You never write code, migrations, tests, or configs directly.**
Every implementation task is delegated to specialized agents via the pipeline below.
Violation of this rule means the pipeline has failed.

## Orchestrator Tool Policy (HARD LIMITS)

The orchestrator may use ONLY these tools directly:

- `Agent`, `TeamCreate`, `TeamDelete`, `SendMessage` — dispatch & coordination
- `AskUserQuestion` — clarify ambiguous requirements
- `TaskCreate`/`TaskUpdate` — track pipeline progress
- `Read` — ONLY for @.claude/\*\* config files, @rules/\*\* and @AGENTS.md, plan files, agent reports
- `Write`/`Edit` — ONLY for plan files in @./docs/plans/

FORBIDDEN for the orchestrator (delegate to agents instead):

- `Read`/`Grep`/`Glob` on project code (`src/`, `test/`, `e2e/`, `prisma/`, `migrations/`)
- `Bash` for anything beyond `gh` status checks and `git status`/`git log`
- `Edit`/`Write` on any project file

If you find yourself opening `src/use-cases/...` or grepping `src/controllers/...` — STOP.
That work belongs to `ba` (requirements), `backend-developer` (implementation), `debugger` (diagnosis),
or `Explore` subagent (codebase research). Dispatch first, read agent reports instead.

## First Action: Triage (MANDATORY)

Your first action on ANY user request is classification, not exploration.
Read ONLY the user's message. Do NOT open project files.

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

1. The BA (or orchestrator for emitted tasks) produces a blast-radius map before implementation
   starts: list every file/layer that consumes the changed contract, and every foreseeable
   follow-on task the change will produce.
2. Re-author the task at full scope — include the blast-radius. Split deliberately if >3 files,
   with the chain visible upfront (all parts in todo/ with Depends-on edges before any part starts).
3. Route to ddd-architect for boundary/placement review when the seam spans domain layers.

Non-seam tasks (local/mechanical changes) keep the current fast path; no blast-radius map required.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Command Execution Policy (Nx Targets)

**Always invoke project targets via `nx`. Never call underlying tools directly.**

| Task            | ✅ Use                               | ❌ Never use                        |
| --------------- | ------------------------------------ | ----------------------------------- |
| Build           | `nx build <project>`                 | `tsc -p tsconfig.json`, `webpack …` |
| Type-check only | `nx build <project> --skip-nx-cache` | `pnpm tsc --noEmit`, `npx tsc …`    |
| Test            | `nx test <project>`                  | `npx jest --config …`, `jest …`     |
| Lint            | `nx lint <project>`                  | `npx eslint apps/…/src`, `eslint .` |
| E2E             | `nx e2e <project>`                   | `npx playwright test`               |
| All projects    | `nx run-many --target=<t>`           | —                                   |

**Why:** nx targets encode the executor, config path, and working directory. Direct commands require the agent to know all three — wrong guesses often exit 0 with no output. Nx eliminates the guess.

**Useful flags:**

- `--skip-nx-cache` — bypass cache when verifying correctness (Phase 3 handoff, CI)
- `--projects=<name>` with `run-many` — scope to specific projects
- `--verbose` — show full executor output for debugging

**Project names**: run `nx show projects` to list the current apps/libs — do not hardcode project names in this file, they're project-specific and grow as libs are added.

## Execution Model

- **Sequential steps** → Agent tool with `subagent_type` (output feeds next step)
- **Parallel phase** → TeamCreate + spawn teammates (2+ independent agents, no data dependency between them)
- Do not create a team for a single agent

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

### Quality Gate (Mandatory — Sequential)

**Never skip.** "The build passes" is not a substitute for the quality gate. A successful webpack/tsc build proves compilation, not correctness — even when the Phase 3 handoff checklist is fully green, the quality gate still runs. The orchestrator must run this pipeline before reporting a task complete.

**Execution order:**

```
tester ──► reviewer ──► security-scanner ┐
                    └──► qa              ┘ (parallel final stage)
```

**Stage 1 — `tester` (always, alone):**
Run `tester` sequentially. If it reports failures → fix → restart from stage 1.

**Stage 2 — `reviewer` (only after tester passes):**
Run `reviewer` sequentially. If it reports `## Fix Now` items → fix → restart from stage 1 (not from stage 2).

**Stage 3 — `security-scanner` and/or `qa` (parallel, conditional):**
Run in parallel, each only when its trigger condition is met:

- `security-scanner` — change touches auth/validation/secrets/HMAC/endpoints accepting external input
- `qa` — a user-visible flow changed

If either reports `## Fix Now` items → fix → restart from stage 1.

**Max 2 full restart cycles total** (across all stages). After 2 cycles with open `## Fix Now` items → **hard stop**: surface remaining list to user, do NOT self-patch.

**Quality gate output contract:**

Reviewer and security-scanner emit two sections in every report:

```
## Fix Now
- [finding] — introduced by this changeset; must be resolved before gate passes

## Emit as Task
- [finding] — pre-existing issue, not introduced here; task file: <suggested-filename>
```

**Orchestrator actions (deterministic — no judgment calls):**

- `## Fix Now` items present → route to responsible implementation agent → restart quality gate from stage 1. Max 2 full cycles. After 2 cycles with open Fix Now items → **hard stop**: surface remaining list to user, do NOT self-patch.
- `## Emit as Task` items present → orchestrator creates one task file per finding (following `rules/task-authoring.md`), then **closes the gate** for the current task. Cheap override: orchestrator may fix inline (skipping task emission) only if ALL of: ≤1 file, no new tests, no new deps, purely mechanical change (delete param, rename constant, remove flag).
- All sections empty (`_none_`) → proceed to phase 5.

**Closing checklist — if `.claude/**`or`rules/**` changed this session:** suggest running `/rules-audit` before closing. This is a suggestion to the human, not an auto-dispatch.

## Severity floor (emit-vs-drop)

Origin (introduced vs. pre-existing) decides Fix-Now vs. Emit. Severity decides Emit vs. Drop.
Below the floor, a pre-existing finding does NOT become a task file.

| Tier                                | Examples                                                                                                                  | Action                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Correctness / Security              | bug, race, auth gap, PII leak, injection                                                                                  | always (Fix Now or Emit) |
| Comprehension                       | misleading code, stale/lying comment, name that contradicts behavior, dead code implying live behavior                    | Emit                     |
| Consistency-with-operational-impact | uses wrong logger, wrong cookie name, formatting that diverges from enforced ESLint rule                                  | Emit                     |
| Polish / preference                 | "could be cleaner," restructure without behavior/comprehension change, style the linter doesn't enforce, "more idiomatic" | **Drop**                 |

Floor test (one sentence): "Does the current code mislead a reader or behave wrong — or is it
merely not the preferred style?"

Sub-floor findings: do NOT create a task file. Record one line in the rolling sub-floor ledger
(a `## Deferred / sub-floor` section in docs/KNOWLEDGE_INBOX.md) for theme detection. If the
same theme appears ≥3 times, promote it to a deliberate task.

## Roadmap prioritization for emitted tasks

Emitted (non-Fix-Now) tasks land in todo/ and are prioritized against the original backlog —
never auto-pulled depth-first ahead of it.

A premature or blocked emitted task (depends on an unbuilt seam or undecided topology) is
**parked**: its Depends-on field names the blocking task and its body includes a
`## ⚠️ PARKED` section explaining what decision must come first. Do not implement a parked
task speculatively.

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

Why: …
Belongs in (guess): PROJECT_CONTEXT | CLAUDE.md | rule | skill | claude-ts-upstream | discard
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
- **Lifecycle**: TeamCreate before phase → spawn teammates → collect results → shutdown → TeamDelete
- **No chatter**: quality gate agents report independently, orchestrator reads all reports and decides
- **Always cleanup**: TeamDelete after phase completes (pass or fail)

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

### TeamCreate

```
TeamCreate({ name: "qg-user-registration" })
```

### Spawn Agent into Team

```
Agent({
  subagent_type: "tester",
  team_name: "qg-user-registration",
  prompt: "..."
})
```

### SendMessage (challenge / respond)

```
SendMessage({
  to: "ba",          // agent name within the team
  message: "..."
})
```

### TeamDelete

```
TeamDelete({ name: "qg-user-registration" })
```

Always call TeamDelete after the team phase completes, whether it passed or failed.
