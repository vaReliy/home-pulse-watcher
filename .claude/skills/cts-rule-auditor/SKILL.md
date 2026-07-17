---
name: cts-rule-auditor
description: >-
  Audits the consistency of .claude/agents/, rules/, AGENTS.md, and docs/KNOWLEDGE_INBOX.md. Runs 11 structural checks: broken pre-flight paths, wrong-platform keyword leaks, stale KNOWLEDGE_INBOX labels, rules files missing from the AGENTS.md index, unanchored .ctsignore entries, foresight gate presence, severity floor coverage, project-scope pre-flight, roadmap rule, stale rules-auditor references, and settings.json hook-path validation. Emits a ranked HIGH/MED/LOW finding report. Use after any change to .claude/** or rules/**, or run periodically to catch silent drift.
  
  Українською: аудит правил, перевірка агентів, дрейф конфігурації, перевірити rules, перевірити агентів, KNOWLEDGE_INBOX застарілий.


triggers:
  - cts-rule-auditor
  - rules-audit
  - audit rules
  - audit agents
  - check rules drift
---

# CTS Rule Auditor

Runs 11 structural consistency checks across `.claude/agents/`, `rules/`, `AGENTS.md`, `docs/KNOWLEDGE_INBOX.md`, `.ctsignore`, and `.claude/settings.json`. Emits a ranked report and offers to create tasks for confirmed findings.

## Step 1 — Determine scope

Run:

```
git status --short
```

`git status --short` covers staged, unstaged, and untracked files — it is the single authoritative source for session changes. Do not use `git diff --name-only HEAD` as a substitute; it omits untracked files and would cause new agent files to be missed.

**Session-aware** (files changed this session): if any paths under `.claude/` or `rules/` appear in `git status --short` output, audit those specific files. Skip the time-window prompt and proceed directly to Step 2.

**History-aware** (no session changes): inspect recent activity:

```
git log --oneline --since="7 days ago" -- rules/ .claude/ AGENTS.md docs/KNOWLEDGE_INBOX.md
```

Then prompt:

```
Found N commits touching rules/ and .claude/ in the last 7 days.
Audit this window, or specify a different range? (e.g. "3 days", "since 2026-06-20", "all")
```

Wait for the user's response before proceeding.

## Step 2 — Run 10 checks

Run all checks. Collect findings across all 10 before reporting.

---

### Check 1 — Broken pre-flight paths

For each file in `.claude/agents/*.md`:

1. Find the `## Pre-flight` section.
2. Extract every `rules/X.md` path referenced in that section.
3. Verify each path exists: `ls rules/X.md`
4. For any missing path, find the commit that introduced the reference using pickaxe search (finds the commit where that exact string was added):
   ```
   git log -S "rules/X.md" --oneline -- .claude/agents/<agent>.md | head -1
   ```

**Finding format**:

```
[HIGH] <agent>.md pre-flight: rules/X.md does not exist
       Introduced in: <short-sha> <commit message>
```

---

### Check 2 — Wrong-platform keyword leak

Derive Angular keywords: terms that appear in `rules/code-style-angular.md` or `rules/architecture-angular.md` but are **absent** from `rules/code-style.md`. Focus on structural terms: `signal`, `toSignal`, `@let`, `NgRx`, `@Component`, `InjectionToken`, `providedIn`, `inject(`, `HttpClient`, `RouterLink`, `SCSS`, `ChangeDetection`, `async pipe`, `template`, `standalone`.

Derive backend keywords: terms that appear in `rules/code-style-backend.md` or `rules/architecture-backend.md` but are absent from `rules/code-style.md`. Focus on: `NestJS`, `@Injectable`, `@Module`, `mongoose`, `Typegoose`, `BullMQ`, `pino`, `LIVR`, `@UseGuards`, `Mongoose`, `Schema(`, `@Prop(`.

Flag:

- Any Angular keyword found in `rules/*-backend.md` files
- Any backend keyword found in `rules/*-angular.md` files

Skip occurrences inside code examples (fenced blocks) unless they appear in prose sentences or rule headings.

**Finding format**:

```
[MED]  rules/<file>.md: Angular keyword "<term>" found in backend rules
[MED]  rules/<file>.md: Backend keyword "<term>" found in Angular rules
```

---

### Check 3 — Stale KNOWLEDGE_INBOX labels

Read `docs/KNOWLEDGE_INBOX.md`. Find all lines matching either form:

- `Belongs in: rules/X.md`
- `Belongs in (guess): rules/X.md`

Both forms are valid; `(guess):` entries are common and must not be skipped.

For each matched line:

1. Extract the file path: capture the token starting with `rules/` up to the first whitespace, `(`, `—`, `|`, or `+` character after the `.md` extension. Examples:
   - `Belongs in: rules/workflow.md (routing guidance...)` → `rules/workflow.md`
   - `Belongs in (guess): rules/dependencies.md | AGENTS.md` → `rules/dependencies.md` (and also check `AGENTS.md` if it resolves to a `rules/` path)
2. Verify each extracted path exists: `ls <path>`
3. Note the section heading (`##` line) that contains this entry.

**Finding format**:

```
[LOW]  KNOWLEDGE_INBOX.md: "Belongs in[...]: rules/X.md" — file does not exist
       Entry heading: <heading text>
```

---

### Check 4 — Rules files missing from AGENTS.md index

1. List all files: `ls rules/`
2. Read the "On-Demand Rules Index" section of `AGENTS.md`.
3. For each file in `rules/`, check whether it appears anywhere in that index section (match on filename, not full path).

**Finding format**:

```
[MED]  rules/<file>.md: present in rules/ but absent from AGENTS.md on-demand index
```

---

### Check 5 — `.ctsignore` anchor validation

Read `.ctsignore`. Find all non-comment, non-blank lines that reference a path starting with `rules/` (e.g. `rules/architecture.md`).

Flag any such entry that is missing the leading `/` anchor — i.e., the entry reads `rules/X.md` rather than `/rules/X.md`.

**Finding format**:

```
[HIGH] .ctsignore: "rules/X.md" is missing leading "/" anchor — will not match root-level rules/
```

---

### Check 6 — Foresight gate present in rules/workflow.md

Read `rules/workflow.md`. Check whether it contains a foresight gate section with a seam trigger definition (new enum, cross-layer field, topology change triggering a blast-radius map requirement).

**Finding format**:

```
[HIGH] rules/workflow.md: foresight gate section missing or seam trigger definition absent
```

---

### Check 7 — Severity floor in rules/workflow.md, reviewer.md, and security-scanner.md

1. Read `rules/workflow.md` — must contain a 4-tier severity floor table (Correctness/Security, Comprehension, Consistency-with-op-impact, Polish/preference).
2. Read `.claude/agents/reviewer.md` — must contain a severity floor instruction referencing the floor and the sub-floor ledger (`docs/KNOWLEDGE_INBOX.md`).
3. Read `.claude/agents/security-scanner.md` — same requirement as reviewer.md.

**Finding format**:

```
[HIGH] rules/workflow.md: 4-tier severity floor table missing
[HIGH] .claude/agents/reviewer.md: severity floor instruction missing
[HIGH] .claude/agents/security-scanner.md: severity floor instruction missing
```

---

### Check 8 — Project-scope pre-flight in reviewer.md and security-scanner.md

1. Read `.claude/agents/reviewer.md` — must list `ARCHITECTURE.md`, `DECISIONS.md`, and `CONTEXT.md` as pre-flight reads.
2. Read `.claude/agents/security-scanner.md` — same requirement.
3. For each referenced doc, verify the file actually exists in the repo root (`ls ARCHITECTURE.md`, etc.). A missing doc means the pre-flight instruction would silently fail.

**Finding format**:

```
[HIGH] .claude/agents/reviewer.md: project-scope pre-flight reads missing (ARCHITECTURE.md / DECISIONS.md / CONTEXT.md)
[HIGH] .claude/agents/security-scanner.md: project-scope pre-flight reads missing
[MED]  pre-flight references ARCHITECTURE.md but file does not exist — silent agent gap
```

---

### Check 9 — Roadmap-prioritization rule present in rules/workflow.md

Read `rules/workflow.md`. Check whether it contains both:

- The parked-task convention (tasks blocked on upstream decisions use `## ⚠️ PARKED`).
- The "prioritized against backlog" rule (emitted tasks ranked against the existing backlog, premature tasks parked with blocking dep named).

**Finding format**:

```
[MED]  rules/workflow.md: roadmap-prioritization rule missing (parked-task convention and/or backlog-priority rule)
```

---

### Check 10 — No stale `rules-auditor` references

Run:

```
grep -r "rules-auditor" .claude/ rules/ AGENTS.md
```

**Finding format**:

```
[HIGH] <file>: stale "rules-auditor" reference found — rename was not fully applied
       Match: <matched line>
```

---

### Check 11 — `.claude/settings.json` hook paths must exist in `cts-payload.txt`

If `.claude/settings.json` exists, read it and extract all `command` fields from any hooks (e.g., `"command": ".claude/hooks/knowledge-capture-nudge.sh"`). For each extracted command path:

1. Verify the path is listed somewhere in `cts-payload.txt`
2. If not found, the hook script's directory is missing from the payload manifest, and a fresh `/cts-setup` or `/cts-update` in any consumer would sync the settings file pointing at a nonexistent script.

**Finding format**:

```
[HIGH] .claude/settings.json: hook command "<path>" does not resolve to any entry in cts-payload.txt
       Sync would fail in a consumer that lacks this path
```

---

## Step 3 — Emit ranked report

Output findings grouped by severity, HIGH first:

```
## Findings — <scope description>

### HIGH
[HIGH] <finding>
       <detail line>

### MED
[MED]  <finding>

### LOW
[LOW]  <finding>

## Summary
- HIGH: N  MED: N  LOW: N  (total: N findings)
```

If scope was time-limited (history-aware mode), add a second section:

```
## Pre-existing issues
<findings from outside the scoped window — same format, noted as pre-existing>
```

If no findings: output `## Findings — <scope>\nNo issues found.`

---

## Step 4 — Task creation prompt

After reporting, ask:

```
Create tasks for confirmed findings? (y / n / select numbers)
```

- **y**: invoke `/to-issues` with all findings.
- **n**: done — no further action.
- **select numbers**: user types finding numbers (1, 3, 5); invoke `/to-issues` with only those findings.

Do **not** invoke `/to-issues` before this confirmation.

---

## Notes

- This skill is read-only. It writes no files except when creating tasks via `/to-issues`.
- Check 2 keyword lists are heuristics — false positives are expected in code examples. Use judgment before flagging.
- Check 4 only flags files absent from the AGENTS.md on-demand index section; files legitimately omitted (auto-loaded, deprecated) may be ignored after human review.
