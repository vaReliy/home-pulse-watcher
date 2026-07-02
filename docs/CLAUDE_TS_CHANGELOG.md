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
