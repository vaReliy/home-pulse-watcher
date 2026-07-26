# Using CTS Day-to-Day: Operator Recipes

This guide documents how to operate the Claude Code Template (CTS) in real developer sessions. Each recipe is self-contained; copy-paste the commands and workflow into your own setup. For depth on any topic, recipes link to the corresponding rule file.

## 1. Idea → Task Session (Grill Mode)

**When:** you have a feature idea, user story, or unclear requirement that needs to become a concrete task file.

**Setup:**

Open Claude Code in your project:

```bash
cd /path/to/project
claude
```

Then, in the session, invoke the skill:

```
/grill-me
```

**The interrogation:**

`grill-me` asks one question at a time, pressure-testing your idea and surfacing hidden assumptions. Answer truthfully; grill will push back. Grill continues until it has enough context to recommend a tier (T0–T3 per the triage ladder in `rules/cts/workflow.md`).

**Convert to task:**

Once grill is satisfied, ask:

> Emit a task file into `tasks/todo/` with today's date, a short slug, and the full acceptance criteria, dependencies, and blast-radius map (if T2+). Use the template from `rules/cts/task-authoring.md`.

Grill (or a fresh orchestrator in the same session) writes the file and reports the path. The task is then ready to execute in a clean session — see Recipe 3.

**Key insight:** Grill is one-shot. If your idea needs stakeholder discussion before task emission, grill ends there — use the session notes to brief others, then re-run grill once the requirements stabilize.

**See also:** `rules/cts/task-authoring.md` (task file structure, acceptance criteria format, generation/dependencies).

---

## 2. Direct Chat Pipeline Session

**When:** you ask for a feature in plain language without a pre-authored task file. Most common starting point.

**The flow:**

1. Paste your request into Claude Code (any session, no task file needed yet).
2. The orchestrator's first action: **triage** (read your message, do NOT open project files).
3. Classify into a tier:
   - **T0** (≤2 files, no config) → implement directly, skip BA, run quality gate only.
   - **T1** (≤3 files, no seam, no migration) → orchestrator writes 5-line acceptance criteria on the spot, implement, full quality gate.
   - **T2** (seam/contract) → `ba` writes acceptance criteria + API contract → optionally `ddd-architect` if the seam spans layers → implement team → quality gate.
   - **T3** (architecture decision, multiple tradeoffs) → full planning team (`ba` + `ddd-architect` + `devil` in parallel) → implement → quality gate.

See the **Foresight Gate** in `rules/cts/workflow.md` to recognize T2/T3 seams: new endpoint/migration/enum consumed across layers/topology change/authorization logic.

4. **Quality gate** (mandatory):
   - `tester(verify)` alone (runs suite, audits coverage gaps, adds missing tests).
   - If tester passes: `reviewer` (code review).
   - If both pass: `security-scanner` and `qa` in parallel (security-scanner if auth/validation touched; qa if user flow changed).
   - Any `## Fix Now` items → fix → restart from tester. Max 2 full restarts; after that, hard stop with a continuation task.

5. **Docs and knowledge capture** (after gate passes):
   - `docs-writer` writes PR description / updates docs.
   - Orchestrator captures learnings in `docs/KNOWLEDGE_INBOX.md` or distills them into permanent homes (`CLAUDE.md`, `CONTEXT.md`, etc.).

**Expected output after the orchestrator declares done:**

- Code in working tree (staged/unstaged, never auto-committed).
- `git diff` showing all changes.
- A suggested commit message.
- You review and commit.

**Key insight:** The orchestrator never makes side-by-side code judgments before first dispatching to an agent. If you feel the urge to ask "should we X or Y?", that's a T3 signal — escalate to the planning team.

**See also:** `rules/cts/workflow.md` (triage ladder, foresight gate, quality gate contract, team spawning).

---

## 3. Implement-a-Task Session

**When:** a task file already exists in `tasks/todo/` and you want to execute it.

**One-line invocation:**

```
please implement task: tasks/todo/2026-07-23-01-user-auth.md
```

**What that means:**

The **executor-model stamp** in the task file's header (e.g., `Executor model: Sonnet (standard)`) tells the system which Claude model to use — a dedicated agent session spawned just for this task. You're not asking "do this in the background"; you're saying "I'm starting a clean, focused execution of this one task."

**Do NOT commit** during the execution session. The session will:

- Dispatch the agents named in the `Planning` row as `required`.
- Implementation agents write tests with the code (TDD via `tdd` skill).
- Quality gate runs (tester, reviewer, security-scanner/qa conditional on trigger).
- docs-writer updates docs.
- Orchestrator captures learnings.
- Output: code in working tree (never committed), plus a suggested commit message.

After the session reports completion, you review `git diff`, commit, and move the task file to `done/`:

```bash
git diff          # review
git commit -m "..."
mv tasks/todo/2026-07-23-01-user-auth.md tasks/done/
```

**Acceptance criteria marked complete in the report mean:**

- Code is ready for review (gate passed).
- Tests cover acceptance criteria + edge cases.
- No pre-existing issues were introduced (reviewer found nothing new).
- Security-sensitive changes (if any) are audit-free.
- Docs are updated.

**See also:** `rules/cts/task-authoring.md` (task file format, `Planning` row, executor stamp, acceptance criteria).

---

## 4. Standalone-Skill Sessions

**When:** you want to use a single skill (TDD, brainstorming, architecture sketching, etc.) without a full pipeline.

**Examples:**

- **TDD for a tricky module:** run `/tdd` to get red-green-refactor discipline for one use case.
- **Brainstorm product ideas:** run `/brainstorming` to explore design space outside the task pipeline.
- **Sketch a module boundary:** run `/architecture-designer` before committing to a layer split.
- **Grill an ambiguous requirement:** run `/grill-me` (covered in Recipe 1).

Refactoring is **not** a skill — it's the `refactoring-expert` agent. Ask for it in plain language ("refactor the X module") and the orchestrator routes to it; there is no `/refactoring-expert` slash command.

**Setup:**

Start a session in the project (`claude`), then invoke the skill by name:

```
/<skill-name>
```

Skills are self-contained and run outside the formal feature pipeline. No planning phase, no quality gate, no docs-writer. Output is whatever the skill reports. You own the decision to apply it or commit it.

**Built-in skills:**

- `tdd` — red-green-refactor for one slice
- `brainstorming` — open-ended idea generation
- `grill-me` — one-question-at-a-time requirements interrogation
- `debugging-wizard` — non-invasive diagnosis starting point
- `architecture-designer` — sketch a module boundary or layer
- `ddd-strategic-design` — domain-level design
- `security-reviewer` — lightweight security checklist
- `code-reviewer` — code quality review of staged/committed code
- `caveman` — ultra-compressed replies that cut token use while keeping full technical accuracy
- `distill-inbox` — move `docs/KNOWLEDGE_INBOX.md` entries into permanent homes

And more in `.claude/skills/` — each has a `SKILL.md` documenting its purpose and inputs.

**See also:** `README.md` § Skills.

---

## 5. Receive CTS Updates

**When:** a new version of CTS (the template) is released and you want to pull it into your project.

**One-line invocation:**

```
please run /cts-update
```

**What happens:**

1. Preflight checks:
   - Verifies `.cts-version` exists (project has CTS installed; if not, run `/cts-setup` instead).
   - Checks for a stale pre-refactor engine and replaces it if found (guard: looks for `CTS_SYNC_REEXEC` marker).
   - Warns if this is the first sync under the new engine (manifest baseline missing) — you'll need to manually diff collision paths against pre-refactor upstream if you have pre-existing customizations.

2. Sync engine runs:
   - Every CTS-owned file listed in `cts-payload.txt` is plain-overwritten with upstream's content (no merge).
   - Generates two warnings for manual review:
     - **OWNERSHIP WARNING** — a CTS file was edited locally (outside an override file) since the last sync. The engine overwrites it anyway. Route to `/cts-contribute` if the edit should go upstream, or accept the loss if it was accidental.
     - **OVERRIDE ROT** — an override file (in `rules/local/`, `.claude/agents-local/`, `AGENTS.local.md`, `CLAUDE.local.md`) cites a CTS section that just changed. Review whether the override still applies.

3. Narration step:
   - Lists upstream changes (commit log).
   - Groups synced files, ownership warnings, override-rot flags, and collision-path candidates.
   - Asks for decisions on each bucket.

4. Resolution step (if anything flagged):
   - For each ownership warning, option to route it to `/cts-contribute` or discard the edit.
   - For each override-rot flag, option to review and edit the override.
   - For ignored-but-changed-upstream files (`.ctsignore`'d content that changed), option to un-ignore or hand-update.

5. Closes with `git diff` reminder — review and commit yourself.

**After `/cts-update` completes:**

```bash
git diff          # review what changed
git status        # see new files (if any)
git add .cts/ rules/cts/ .claude/agents/ .claude/skills/ ...
git commit -m "chore(cts): sync to upstream @ <new-sha>"
```

**Key insight:** The engine always overwrites CTS-owned files (updates never skip wholesale). If you edited one directly, your changes are gone — the warning is your only signal. Use override files instead (`rules/local/**`, `.claude/agents-local/<name>.md`) to customize behavior without losing upstream updates.

**See also:** `rules/cts/workflow.md` § Phase 6 (knowledge capture for any changes); skill `cts-update` (full pre-flight and resolution steps).

---

## 6. Override a CTS Rule/Agent (Lex Specialis Recipe)

**When:** a CTS-owned rule or agent doesn't fit your project — you want to customize it without losing upstream updates.

**Worked example: narrower validation rules**

Your project uses stricter email validation than the shared `rules/cts/validation-authorization.md` recommends.

### Step 1: Create the override file

```bash
mkdir -p rules/local/
cat > rules/local/validation-authorization.md << 'EOF'
<!-- Project-specific validation overrides for claude-ts. Never synced. -->

## Overrides rules/cts/validation-authorization.md § "Email Validation"

In this project, emails must:
- Pass RFC 5322 strict parsing (not just `@` and `.` heuristics).
- Reject subdomains under `.test` / `.local` (reserved for dev only).
- Require enterprise/domain ownership verification for B2B accounts.

Use [email-validator](https://npm.im/email-validator) with `options: { allowTld: false }` in addition to LIVR's email type.
EOF
```

**Citation format:** `## Overrides <CTS-path> § "<section-heading>"` — this tells the sync engine's override-rot detector which CTS section this override cites. When that CTS section changes in an upstream update, the detector flags the override for review.

### Step 2: Reference it in your implementation

In an implementation agent's prompt or a task file, reference the override:

> For email validation, see `rules/local/validation-authorization.md` (project-specific strictness).

Or directly in code:

```typescript
// rules/local/validation-authorization.md: stricter email rules than shared rules/cts/validation-authorization.md
const isValidEmail = (email: string) => {
  // ... RFC 5322 + `.test`/`.local` rejection + domain verification ...
};
```

### Step 3: Override an agent

If you need to customize an agent's behavior, create `.claude/agents-local/<name>.md`:

```bash
mkdir -p .claude/agents-local/
cat > .claude/agents-local/backend-developer.md << 'EOF'
# Project-Specific Overrides for backend-developer

## Authentication

Always use JWT + refresh-token pattern. Never use session cookies in APIs.

## Logging

All services must use Pino with structured JSON (keys: `level`, `msg`, `timestamp`, `service`, `requestId`). Never use console.log.
EOF
```

This file is read AFTER the main agent file (CTS owns `.claude/agents/backend-developer.md`; this override is never synced). Every shipped agent ends with a fixed tail sentence in its body (not its frontmatter — frontmatter is not layerable) to this effect:

> If `.claude/agents-local/backend-developer.md` exists, Read it first; its instructions override conflicting ones above.

### Step 3b: Override a skill

If you need to customize a shipped skill's behavior, create `.claude/skills-local/<skill-name>/SKILL.md`:

```bash
mkdir -p .claude/skills-local/vitest-testing/
cat > .claude/skills-local/vitest-testing/SKILL.md << 'EOF'
# Project-Specific Overrides for vitest-testing

This project is Jest-only; replace Vitest references with Jest equivalents:

- `vi.fn()` → `jest.fn()`
- `vi.mock()` → `jest.mock()`
- `npx vitest run` → `npx jest`
- `vi.spyOn()` → `jest.spyOn()`
EOF
```

The skill's shipped `SKILL.md` ends with a fixed tail sentence that reads this file first, if it exists, and treats it as overriding conflicting guidance. **The override file carries no frontmatter** — only the body content overrides. Bundled skill resources beyond `SKILL.md` (e.g. reference files like `references/mocking.md`) are not auto-shadowed; if you need to override a bundled reference file, place it under `.claude/skills-local/<name>/` and re-point to it explicitly from your local `SKILL.md`.

### Step 4: For whole-file consumer overrides (rare)

If you're overriding an entire file (not just a section), create `CLAUDE.local.md` or `AGENTS.local.md`:

```bash
cat > CLAUDE.local.md << 'EOF'
<!-- Project-specific CLAUDE.md overrides. Never synced. -->

## Project Customizations

### Orchestrator tuning

- Always run `dba` sequentially (no parallel backend work) when migrations are involved.
- Fast-track T0 to commit-without-review if only comment/string changes.
EOF
```

`CLAUDE.md` already `@import`s `CLAUDE.local.md` at the end, with local stated to win on conflict.

### Key constraints

- **DO NOT edit CTS-owned files directly** (`rules/cts/**`, `.claude/agents/`, `.claude/skills/`). The next `/cts-update` overwrites them and prints `OWNERSHIP WARNING`.
- **DO create override files** in `rules/local/`, `.claude/agents-local/`, `.claude/skills-local/`, `AGENTS.local.md`, `CLAUDE.local.md`.
- **Cite what you're overriding** with `## Overrides <path>` so the override-rot detector can flag staleness.
- **Keep overrides narrow.** An override displacing an entire 500-line rule is a signal that your project needs a fundamentally different rule or tool — consider a permanent fork or upstream contribution instead.

**See also:** `rules/cts/workflow.md` (override-rot detector, ownership-violation warnings); Task 6 in the next recipe (contribute back) if you want to propose your override upstream.

---

## 7. Contribute Back

**When:** you've improved a CTS-owned file (rule, agent, skill) and want to offer it back to the template.

**Worked example: exported a new skill from your project**

Your project created a `refresh-cache` skill useful for other consumers. You're ready to push it upstream.

### Step 1: Preflight checks

```
/cts-contribute
```

Preconditions verified automatically:

1. `.cts-version` exists (project is CTS-enabled; if not, use a local CTS repo as the target).
2. CTS repo/clone is resolvable (default: `../claude-ts`, or pass `--cts-path <path>`).
3. Your project is in sync with CTS HEAD (no drift from last `/cts-update`; if you're behind, run `/cts-update` first).
4. Knowledge inbox is clean (no unresolved ≥2-week-old guesses; if so, run `/distill-inbox` first or confirm you're OK with them).

### Step 2: Discovery

`/cts-contribute` scans three cases in parallel:

- **Case A — Net-new skills:** directories in `.claude/skills/` not in CTS yet. Queued for export.
- **Case B — CTS file edits:** payload files you edited directly (an `OWNERSHIP WARNING` would have flagged them on last sync). Queued for whole-file replacement.
- **Case C — `.ctsignore`'d forks:** files you forked for project-specific reasons, but also improved in ways other consumers might benefit from. Manually pre-filtered; you decide which are general improvements vs. project-specific.

### Step 3: Review and decide

One item at a time:

```
── [Case A] ── refresh-cache skill ──
<shows skill description and structure>

Suggested: EXPORT
Reason: Broadly useful, not project-specific. Three consumers have asked for cache-refresh patterns.

Your decision? [export / skip]
```

For skills, the tool checks if project-specific content is in the skill's metadata or SKILL.md — if so, it asks you to clean it in the consumer's own copy FIRST, then export. This ensures the CTS copy is generic and the consumer's copy doesn't diverge from it after sync.

### Step 4: Write to CTS

After all decisions: the tool copies accepted items into the resolved CTS path:

```
✓ wrote <cts-path>/.claude/skills/refresh-cache/
✓ wrote <cts-path>/rules/cts/caching.md
```

### Step 5: Update both changelogs

**CTS `CHANGELOG.md`** (in the upstream CTS repo):

```markdown
## [Unreleased] — Contributed from <your-project-name>

### Added / Changed / Fixed

- **`refresh-cache` skill**: Async cache invalidation and warm-up patterns (contributed from <project-name>)
- **`rules/cts/caching.md`**: Cache-layer policy and timing (contributed from <project-name>)
```

**Your project `docs/CLAUDE_TS_CHANGELOG.md`** (if it exists):

The tool removes entries you just exported, keeps entries still pending/project-specific. If the file ends up empty, that's healthy — it means no divergence from CTS.

### Step 6: Commit in CTS

```bash
cd ../claude-ts
git diff        # review
git add .claude/skills/refresh-cache/ CHANGELOG.md
git commit -m "feat: refresh-cache skill + caching rules (contributed from <project-name>)"
git push origin main
```

### Step 7: Sync back (round-trip verification)

In your project:

```
/cts-update
```

The sync will overwrite your local copy with byte-identical content from CTS (single ownership guarantee). You may still see one `OWNERSHIP WARNING` on this run (fires on divergence from the LAST recorded hash, not divergence from upstream HEAD) — that's expected and not an error.

**Key insight:** Under the two-layer model, contribution is always a whole-file copy (no hunk negotiation). The consumer's file IS the proposed replacement. This also makes the round-trip a byte-for-byte no-op by construction.

**See also:** skill `cts-contribute` (full discovery, review, and decision logic); `rules/cts/git-operations.md` (commit conventions for CTS).

---

## 8. Model/Cost Tips

**When:** you want to optimize session cost or need to understand how agent model selection works.

### Frontmatter Model Pins

Every agent has a `model:` line in its frontmatter (the YAML header). Example:

```yaml
name: ba
model: sonnet # ← this agent always uses Sonnet
```

CTS pins specific agents to specific tiers:

| Agent                   | Model  | Why                                                         |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `ba`, implementation    | sonnet | Standard tier: writing code/requirements is judgment work   |
| `ddd-architect`         | opus   | Deep tier: weighing architecture tradeoffs needs strongest  |
| `devops`, `docs-writer` | haiku  | Cheap tier: mechanical config/docs changes                  |
| `debugger`              | opus   | Deep tier: root-cause analysis can require subtle reasoning |
| `reviewer`              | sonnet | Standard tier: thoroughness matters for code quality        |

The pin is fixed in the agent's `.claude/agents/<name>.md` file — you can't change it there (CTS-owned). To override for a single dispatch, use the `model` parameter:

```javascript
Agent({
  subagent_type: 'reviewer',
  name: 'qg-user-auth-reviewer',
  model: 'opus', // ← override: use Opus for this ONE dispatch
  prompt: '...',
});
```

Use per-dispatch overrides sparingly — only when a specific decision truly needs deep-tier reasoning despite the agent's default pin.

### Opusplan Semantics

If a session's executor model itself is **Opus** (a deep-tier work session), built-in agents (`Explore`, `Plan`, `general-purpose`) inherit that tier and also run at Opus. This is usually wasteful — exploration and general planning don't need deep-tier reasoning; they benefit from a fast read and broad sweep.

**Fix:** always pass an explicit `model` when dispatching built-in agents from an Opus session:

```javascript
Agent({
  subagent_type: 'Explore',
  name: 'explore-codebase',
  model: 'sonnet', // ← override: use Sonnet for broad exploration
  prompt: 'Find all use cases that touch the User entity',
});
```

Built-in agents have no frontmatter pin and thus inherit the session model — explicit override is the only way to break that inheritance.

### Explicit-Model Rule (Agents and Skills)

**Agent frontmatter** (`model: <tier>` line) pins that agent's default tier. When the orchestrator dispatches that agent, it uses the pinned tier unless a per-dispatch override says otherwise.

**Skill frontmatter** does not have a `model:` line — skills are knowledge modules, not agents. When an agent runs a skill, the agent uses its own model tier to reason about the skill's content. If a skill is so deep that you only trust Opus to apply it correctly, create an agent wrapper:

```yaml
# .claude/agents/deep-architecture-reviewer.md
model: opus
# (uses the deep-design-review skill at Opus tier)
```

Then dispatch `deep-architecture-reviewer` instead of a skill.

### Cost Profile

Rough **token cost per session** (order of magnitude; actual cost depends on complexity and output length):

| Tier   | Typical session token budget | Common role                                     |
| ------ | ---------------------------- | ----------------------------------------------- |
| cheap  | 10–50 KB                     | Config edits, docs, mechanical CLI/file changes |
| sonnet | 50–200 KB                    | Implementation, requirements, code review       |
| opus   | 200+ KB                      | Architecture decisions, root-cause debugging    |

**Cost optimization:**

- **Keep T0 and T1 small** — avoid dragging in the full planning team for a simple fix. Triage correctly.
- **Dispatch cheap agents for mechanical work** — don't use Sonnet to write a CHANGELOG entry.
- **Use skills for knowledge reuse** — a skill applied by Sonnet costs less than re-deriving the same pattern in each agent.
- **Avoid deep-tier overkill** — an Opus debugger is overkill for a typo; use `debugger` (already pinned to Opus) for hard crashes, not every bug.

**See also:** `AGENTS.md` § Model Tiers (vendor-neutral vocabulary), `rules/cts/workflow.md` § Tool API Reference (per-dispatch model override syntax).

---

## Roadmap

Recipes 5–7 (sync, override, contribute) implement the **two-layer distribution model** where CTS-owned and consumer-owned files are never merged. Overwrite semantics replace the retired 3-way merge model, and detection (ownership-violation and override-rot warnings) replaces reconciliation.

For each recipe's full machinery, see:

- **Recipe 5:** skill `cts-update` (preflight, sync engine, narration, resolution).
- **Recipe 6:** `rules/cts/workflow.md` § "Override-rot detector" + agent/skill override mechanisms (`.claude/agents-local/<name>.md`, `.claude/skills-local/<name>/SKILL.md`).
- **Recipe 7:** skill `cts-contribute` (discovery, review, write, changelog updates).

For the quality gate and tier triage underlying recipes 2–3, see `rules/cts/workflow.md` (foresight gate, quality gate contract, restart budget, severity floor).

---

## Additional Resources

- **README.md** — installation, Quick Start, Install Profile.
- **AGENTS.md** — stack, code style essentials, model tiers, on-demand rules index.
- **CLAUDE.md** — orchestrator core, pipeline phases, team conventions.
- **rules/cts/task-authoring.md** — task file header, acceptance criteria, dependencies, splitting.
- **rules/cts/workflow.md** — triage ladder (T0–T3), foresight gate, quality gate, phase 6 (knowledge capture).
- **rules/cts/git-operations.md** — commit safety, PR description rules.
- **.claude/agents/** — 18 agent definitions; each has pre-flight obligations and local-override documentation.
